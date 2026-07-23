import simpleGit, { SimpleGit, LogResult, BranchSummary } from 'simple-git'

export interface CommitNode {
  hash: string
  shortHash: string
  message: string
  author: string
  authorEmail: string
  date: string
  parents: string[]
  refs: string[]   // branch/tag labels
  signature?: string  // GPG signature status from `%G?` (G/B/U/X/Y/R/E/N)
  // Total lines added/removed across the commit's diff (from `--numstat`).
  // Undefined/0 for merge commits, where git log emits no diff by default.
  additions?: number
  deletions?: number
}

export interface BranchInfo {
  name: string
  current: boolean
  remote: boolean
  commit: string
  label: string
  ahead?: number    // commits ahead of upstream
  behind?: number   // commits behind upstream
  gone?: boolean    // upstream configured but deleted on the remote
}

export interface FileChange {
  path: string
  status: string  // A, M, D, R, C
  additions: number
  deletions: number
}

export class GitService {
  private git: SimpleGit
  public repoPath: string

  // Redo stack: HEAD shas captured right before each undo. Because undo is a
  // soft reset (non-destructive — the working tree is untouched and the prior
  // commit stays reachable via the reflog), redo just soft-resets forward to
  // the saved sha. Cleared when a new commit is made.
  private redoStack: string[] = []

  constructor(repoPath: string) {
    this.repoPath = repoPath
    this.git = simpleGit(repoPath)
  }

  async checkRepo(): Promise<void> {
    const isRepo = await this.git.checkIsRepo()
    if (!isRepo) throw new Error('Not a Git repository')
  }

  // ── Safety helpers ─────────────────────────────────────────

  // Validate a ref/hash argument. Returns an error string if invalid, else null.
  // Rejects empty values and leading-dash values (option injection — git would
  // interpret "-X" as a flag even though simple-git passes args without a shell).
  private assertRef(ref: string, label = 'reference'): string | null {
    if (typeof ref !== 'string' || !ref.trim()) return `Empty git ${label}`
    if (ref.trim().startsWith('-')) return `Invalid git ${label}: "${ref}"`
    return null
  }

  // True if the working tree has any tracked changes (staged or unstaged).
  private async isDirty(): Promise<boolean> {
    try {
      const s = await this.git.status()
      return s.files.some(f => f.index !== '?' || f.working_dir !== '?')
    } catch {
      return false
    }
  }

  // Abort an in-progress rebase if there is one. Returns true if it aborted.
  // `git rebase --abort` succeeds only when a rebase is actually in progress.
  private async abortRebaseIfInProgress(): Promise<boolean> {
    try {
      await this.git.raw(['rebase', '--abort'])
      return true
    } catch {
      return false
    }
  }

  async getLog(options: { maxCount?: number; all?: boolean; refs?: string[] } = {}): Promise<{ commits: CommitNode[] }> {
    // Freshly-initialized repo (no commit yet): plain `git log` exits 128.
    // An empty history is a valid state — the UI shows the WIP node so the
    // user can stage and create the very first commit.
    if (!(await this.hasHead())) return { commits: [] }
    const maxCount = options.maxCount ?? 200
    const args: string[] = [
      // --numstat prints "added\tdeleted\tpath" lines after each commit's
      // format line (empty for merges, since git log skips their diff by
      // default) — still a single process call for the whole page of history.
      '--numstat',
      '--pretty=format:%H|%P|%s|%an|%ae|%ai|%D|%G?',
      `--max-count=${maxCount}`,
      '--date-order', // children always before parents (like --topo-order), but sibling
                    // commits are sorted by commit date
    ]
    // Explicit refs (for solo/mute branch filtering) take precedence over --all.
    if (options.refs && options.refs.length) {
      args.push(...options.refs)
    } else if (options.all) {
      args.push('--all')
    }

    const result = await this.git.raw(['log', ...args])
    const commits: CommitNode[] = []
    const lines = result.split('\n')
    // %H is a full 40-char hex hash immediately followed by our '|' delimiter —
    // numstat lines are tab-separated and never match this.
    const commitLineRe = /^[0-9a-f]{40}\|/

    let i = 0
    while (i < lines.length) {
      const line = lines[i]
      if (!commitLineRe.test(line)) { i++; continue }
      const [hash, parentStr, message, author, authorEmail, date, refsStr, sigStr] = line.split('|')
      const parents = parentStr ? parentStr.trim().split(' ').filter(Boolean) : []
      const refs = refsStr
        ? refsStr.split(',')
            .map(r => r.trim())
            .filter(r => r.length > 0 && r !== '')
        : []
      i++
      let additions = 0
      let deletions = 0
      while (i < lines.length && lines[i].trim() !== '' && !commitLineRe.test(lines[i])) {
        const parts = lines[i].split('\t')
        if (parts.length >= 2) {
          const a = parseInt(parts[0], 10)
          const d = parseInt(parts[1], 10)
          if (!isNaN(a)) additions += a
          if (!isNaN(d)) deletions += d
        }
        i++
      }
      commits.push({
        hash: hash.trim(),
        shortHash: hash.trim().slice(0, 7),
        message: message || '(no message)',
        author: author || '',
        authorEmail: authorEmail || '',
        date: date || '',
        parents,
        refs,
        signature: (sigStr || 'N').trim(),
        additions,
        deletions,
      })
    }
    return { commits }
  }

  async getBranches(): Promise<{ branches: BranchInfo[] }> {
    const summary: BranchSummary = await this.git.branch(['-a', '--verbose'])
    const branches: BranchInfo[] = Object.values(summary.branches).map(b => ({
      name: b.name,
      current: b.current,
      remote: b.name.startsWith('remotes/'),
      commit: b.commit,
      label: b.label || b.name
    }))
    // Empty repo: `git branch` lists nothing before the first commit, but the
    // unborn branch (symbolic-ref) still has a name worth showing in the UI.
    if (!branches.some(b => b.current)) {
      try {
        const name = (await this.git.raw(['symbolic-ref', '--short', 'HEAD'])).trim()
        if (name) branches.push({ name, current: true, remote: false, commit: '', label: name })
      } catch { /* detached HEAD — nothing to add */ }
    }
    // Ahead/behind vs upstream for local branches, in a single git call.
    try {
      const track = await this.git.raw(['for-each-ref', 'refs/heads', '--format=%(refname:short)|%(upstream:track)'])
      const info = new Map<string, { ahead: number; behind: number; gone: boolean }>()
      for (const line of track.split('\n')) {
        const [name, t] = line.split('|')
        if (!name || !t) continue
        info.set(name, {
          ahead: parseInt(/ahead (\d+)/.exec(t)?.[1] ?? '0', 10),
          behind: parseInt(/behind (\d+)/.exec(t)?.[1] ?? '0', 10),
          gone: t.includes('gone'),
        })
      }
      for (const b of branches) {
        const tr = !b.remote ? info.get(b.name) : undefined
        if (tr) Object.assign(b, tr)
      }
    } catch { /* tracking info is best-effort */ }
    return { branches }
  }

  async getDiff(commitHash: string): Promise<{ diff: string }> {
    let diff = ''
    try {
      const parents = await this.git.raw(['log', '--pretty=format:%P', '-n', '1', commitHash])
      const parentList = parents.trim().split(' ').filter(Boolean)
      if (parentList.length > 0) {
        diff = await this.git.raw(['diff', `${parentList[0]}..${commitHash}`])
      } else {
        // Root commit
        diff = await this.git.raw(['show', commitHash, '--pretty=format:', '--no-color'])
      }
    } catch (e) {
      diff = ''
    }
    return { diff }
  }

  async getCommitFiles(commitHash: string): Promise<{ files: FileChange[] }> {
    try {
      // --root makes diff-tree emit files for the initial (parentless) commit too
      const [nameStatus, numStat] = await Promise.all([
        this.git.raw(['diff-tree', '--no-commit-id', '-r', '--root', '--name-status', commitHash]),
        this.git.raw(['diff-tree', '--no-commit-id', '-r', '--root', '--numstat',     commitHash]),
      ])
      // Build stats map from numstat
      const stats: Record<string, { additions: number; deletions: number }> = {}
      for (const line of numStat.trim().split('\n')) {
        const parts = line.split('\t')
        if (parts.length >= 3) stats[parts[2]] = { additions: parseInt(parts[0]) || 0, deletions: parseInt(parts[1]) || 0 }
      }
      const files: FileChange[] = []
      for (const line of nameStatus.trim().split('\n')) {
        if (!line.trim()) continue
        const parts = line.split('\t')
        const rawStatus = parts[0]?.[0] ?? 'M'
        const status = rawStatus === 'A' ? 'A' : rawStatus === 'D' ? 'D' : rawStatus === 'R' ? 'R' : 'M'
        const path = parts[status === 'R' ? 2 : 1] ?? ''
        if (!path) continue
        files.push({ path, status, ...(stats[path] ?? { additions: 0, deletions: 0 }) })
      }
      return { files }
    } catch (e) {
      return { files: [] }
    }
  }

  // Parse `git diff --name-status` + `--numstat` output into FileChange[].
  private parseNameAndNumStat(nameStatus: string, numStat: string): FileChange[] {
    const stats: Record<string, { additions: number; deletions: number }> = {}
    for (const line of numStat.trim().split('\n')) {
      const parts = line.split('\t')
      if (parts.length >= 3) {
        stats[parts[2]] = { additions: parseInt(parts[0]) || 0, deletions: parseInt(parts[1]) || 0 }
      }
    }
    const files: FileChange[] = []
    for (const line of nameStatus.trim().split('\n')) {
      if (!line.trim()) continue
      const parts = line.split('\t')
      const rawStatus = parts[0]?.[0] ?? 'M'
      const status = rawStatus === 'A' ? 'A' : rawStatus === 'D' ? 'D' : rawStatus === 'R' ? 'R' : 'M'
      const path = parts[status === 'R' ? 2 : 1] ?? ''
      if (!path) continue
      files.push({ path, status, ...(stats[path] ?? { additions: 0, deletions: 0 }) })
    }
    return files
  }

  // Diff between two arbitrary commits (or any two revisions).
  // Order matters: changes are expressed as going from `fromHash` to `toHash`.
  async diffBetweenCommits(fromHash: string, toHash: string): Promise<{ diff: string; error?: string }> {
    const bad = this.assertRef(fromHash, 'commit') || this.assertRef(toHash, 'commit')
    if (bad) return { diff: '', error: bad }
    try {
      // Two-dot: show the difference between the two endpoints' trees.
      const diff = await this.git.raw(['diff', `${fromHash}..${toHash}`])
      return { diff }
    } catch (e: any) {
      return { diff: '', error: e.message }
    }
  }

  // File list (with per-file add/del counts) between two commits.
  async filesBetweenCommits(fromHash: string, toHash: string): Promise<{ files: FileChange[]; error?: string }> {
    const bad = this.assertRef(fromHash, 'commit') || this.assertRef(toHash, 'commit')
    if (bad) return { files: [], error: bad }
    try {
      const range = `${fromHash}..${toHash}`
      const [nameStatus, numStat] = await Promise.all([
        this.git.raw(['diff', '--name-status', range]),
        this.git.raw(['diff', '--numstat', range]),
      ])
      return { files: this.parseNameAndNumStat(nameStatus, numStat) }
    } catch (e: any) {
      return { files: [], error: e.message }
    }
  }

  async getCommitBody(hash: string): Promise<{ body: string }> {
    try {
      const body = await this.git.raw(['show', '--format=%b', '--no-patch', hash])
      return { body: body.trim() }
    } catch { return { body: '' } }
  }

  async checkout(ref: string): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(ref, 'reference')
    if (bad) return { success: false, error: bad }
    try {
      await this.git.checkout(ref)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async createBranch(name: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.checkoutLocalBranch(name)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async deleteBranch(name: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.branch(['-D', name])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async getUpstream(): Promise<{ upstream: string | null }> {
    try {
      const result = await this.git.raw(['rev-parse', '--abbrev-ref', '@{u}'])
      return { upstream: result.trim() || null }
    } catch {
      return { upstream: null }
    }
  }

  // Current branch + its upstream tracking status (commits ahead/behind).
  // Returns ahead/behind = 0 when there is no upstream configured.
  async getTracking(): Promise<{ branch: string | null; upstream: string | null; ahead: number; behind: number }> {
    let branch: string | null = null
    try {
      branch = (await this.git.raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim() || null
      if (branch === 'HEAD') branch = null // detached
    } catch { /* no commits yet */ }

    let upstream: string | null = null
    try {
      upstream = (await this.git.raw(['rev-parse', '--abbrev-ref', '@{u}'])).trim() || null
    } catch { /* no upstream */ }

    if (!upstream) return { branch, upstream: null, ahead: 0, behind: 0 }

    try {
      // "<behind>\t<ahead>" — left side is @{u}, right side is HEAD.
      const out = (await this.git.raw(['rev-list', '--left-right', '--count', '@{u}...HEAD'])).trim()
      const [behindStr, aheadStr] = out.split(/\s+/)
      return { branch, upstream, ahead: parseInt(aheadStr) || 0, behind: parseInt(behindStr) || 0 }
    } catch {
      return { branch, upstream, ahead: 0, behind: 0 }
    }
  }

  async fetch(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.fetch(['--all', '--prune'])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // Snapshot of remote-tracking refs (refname → sha), used to detect
  // new commits arriving via fetch.
  async getRemoteRefs(): Promise<Record<string, string>> {
    try {
      const result = await this.git.raw([
        'for-each-ref', '--format=%(refname) %(objectname)', 'refs/remotes'
      ])
      const map: Record<string, string> = {}
      for (const line of result.trim().split('\n').filter(Boolean)) {
        const sp = line.lastIndexOf(' ')
        if (sp > 0) map[line.slice(0, sp)] = line.slice(sp + 1)
      }
      return map
    } catch {
      return {}
    }
  }

  async pushTo(remote: string, branch: string, setUpstream: boolean, force = false): Promise<{ success: boolean; error?: string }> {
    try {
      const args: string[] = ['push']
      if (setUpstream) args.push('--set-upstream')
      // --force-with-lease is the safe force: it refuses to overwrite remote work
      // that arrived since our last fetch, unlike the blunt --force.
      if (force) args.push('--force-with-lease')
      args.push(remote, `HEAD:${branch}`)
      await this.git.raw(args)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message ?? String(e) }
    }
  }

  async push(): Promise<{ success: boolean; error?: string; setUpstream?: boolean }> {
    try {
      await this.git.push()
      return { success: true }
    } catch (e: any) {
      const msg: string = e.message ?? ''
      // Detect "no upstream" error and auto-set upstream
      if (
        msg.includes('no upstream') ||
        msg.includes('set-upstream') ||
        msg.includes('has no upstream') ||
        msg.includes("n'a pas de branche amont")
      ) {
        try {
          const status = await this.git.status()
          const branch = status.current ?? 'main'
          await this.git.raw(['push', '--set-upstream', 'origin', branch])
          return { success: true, setUpstream: true }
        } catch (e2: any) {
          return { success: false, error: e2.message }
        }
      }
      return { success: false, error: msg }
    }
  }

  async pull(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.pull()
      // pull runs a merge internally — conflicts may be left without throwing.
      if (await this.hasUnmergedPaths()) {
        return { success: false, error: 'Pull produced merge conflicts — resolve them before continuing' }
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async getStatus(): Promise<{ staged: string[]; unstaged: string[]; untracked: string[] }> {
    try {
      const status = await this.git.status()
      return {
        staged: status.staged,
        unstaged: status.modified,
        untracked: status.not_added
      }
    } catch (e) {
      return { staged: [], unstaged: [], untracked: [] }
    }
  }

  async getStashes(): Promise<{ stashes: { index: number; message: string }[] }> {
    try {
      const result = await this.git.raw(['stash', 'list', '--pretty=format:%gd: %s'])
      const stashes = result.trim().split('\n').filter(Boolean).map((line, i) => ({
        index: i,
        message: line
      }))
      return { stashes }
    } catch (e) {
      return { stashes: [] }
    }
  }

  // ── Working tree / staging ─────────────────────────────────

  async getWorkingChanges(): Promise<{
    staged: { path: string; status: string }[]
    unstaged: { path: string; status: string }[]
    untracked: string[]
  }> {
    try {
      const status = await this.git.status()

      // Build a set of staged paths for dedup
      const stagedPaths = new Set<string>([
        ...status.staged,
        ...status.created,
        ...status.renamed.map(r => r.to),
      ])

      const staged: { path: string; status: string }[] = []
      const seen = new Set<string>()

      // parse files[] array from status for precise stage info
      for (const f of status.files) {
        const index = f.index.trim()   // staged status char
        const working = f.working_dir.trim() // unstaged status char
        const path = f.path

        // Staged changes (index != ' ' and != '?')
        if (index && index !== ' ' && index !== '?' && !seen.has(path)) {
          seen.add(path)
          const s = index === 'A' ? 'A' : index === 'D' ? 'D' : index === 'R' ? 'R' : index === 'C' ? 'C' : 'M'
          staged.push({ path, status: s })
        }
      }

      const unstaged: { path: string; status: string }[] = []
      const seenU = new Set<string>()

      for (const f of status.files) {
        const working = f.working_dir.trim()
        const index = f.index.trim()
        const path = f.path
        if (working && working !== ' ' && working !== '?' && !seenU.has(path)) {
          seenU.add(path)
          const s = working === 'D' ? 'D' : working === 'A' ? 'A' : '!'
          unstaged.push({ path, status: s === '!' ? 'M' : s })
        }
        // Conflicted
        if (working === 'U' || index === 'U') {
          if (!seenU.has(path)) { seenU.add(path); unstaged.push({ path, status: '!' }) }
        }
      }

      // not_added = untracked; may contain trailing / for dirs
      const untracked = status.not_added

      return { staged, unstaged, untracked }
    } catch (e: any) {
      return { staged: [], unstaged: [], untracked: [] }
    }
  }

  async getWorkingFileDiff(filepath: string, staged: boolean): Promise<{ diff: string }> {
    try {
      const args = staged
        ? ['diff', '--cached', '--', filepath]
        : ['diff', '--', filepath]
      const diff = await this.git.raw(args)
      return { diff }
    } catch (e) {
      return { diff: '' }
    }
  }

  async stage(paths: string[]): Promise<{ success: boolean; error?: string }> {
    try {
      // git add handles both files and directories natively
      await this.git.raw(['add', '--', ...paths])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async stageAll(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['add', '-A'])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async unstage(paths: string[]): Promise<{ success: boolean; error?: string }> {
    try {
      // Use 'git reset HEAD -- <paths>' which works on all git versions
      // and handles both files and directories
      await this.git.raw(['reset', 'HEAD', '--', ...paths])
      return { success: true }
    } catch (e: any) {
      // Fallback: try restore --staged (git 2.23+)
      try {
        await this.git.raw(['restore', '--staged', '--', ...paths])
        return { success: true }
      } catch (e2: any) {
        return { success: false, error: e2.message }
      }
    }
  }

  async getLastCommitMessage(): Promise<{ message: string }> {
    try {
      const msg = await this.git.raw(['log', '-1', '--pretty=format:%B', 'HEAD'])
      return { message: msg.trim() }
    } catch {
      return { message: '' }
    }
  }

  async commit(message: string, amend = false, sign = false): Promise<{ success: boolean; error?: string }> {
    try {
      // A new commit starts a fresh history line — previously undone actions can
      // no longer be coherently redone.
      this.redoStack = []
      const signArg = sign ? ['-S'] : []
      if (amend) {
        await this.git.raw(['commit', '--amend', ...signArg, '-m', message])
      } else {
        // simple-git does NOT throw when there is nothing to commit — it resolves
        // with a "nothing to commit" message. Guard explicitly so we never report
        // a phantom success when no staged changes exist.
        const staged = await this.git.raw(['diff', '--cached', '--name-only'])
        if (!staged.trim()) {
          return { success: false, error: 'Nothing to commit' }
        }
        await this.git.raw(['commit', ...signArg, '-m', message])
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async discardFile(file: string): Promise<{ success: boolean; error?: string }> {
    try {
      // An untracked file is not affected by restore/checkout (git has no prior
      // version to restore). The only way to "discard" it is to delete it from
      // the working tree — `git clean -fd` handles both files and directories.
      const status = await this.git.status()
      const isUntracked = status.not_added.includes(file)
        || status.files.some(f => f.path === file && f.index === '?' && f.working_dir === '?')
      if (isUntracked) {
        await this.git.raw(['clean', '-fd', '--', file])
        return { success: true }
      }
      // Tracked file: revert working-tree changes (git 2.23+ restore, else checkout)
      try {
        await this.git.raw(['restore', '--', file])
      } catch {
        await this.git.raw(['checkout', '--', file])
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // ── Commit operations ──────────────────────────────────────

  async cherryPick(hash: string): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(hash, 'commit')
    if (bad) return { success: false, error: bad }
    try {
      await this.git.raw(['cherry-pick', hash])
      // Defensive: if a cherry-pick conflict ever resolves without throwing,
      // never report success while the tree is conflicted.
      if (await this.hasUnmergedPaths()) {
        return { success: false, error: 'Cherry-pick conflict — resolve conflicts before continuing' }
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async revert(hash: string): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(hash, 'commit')
    if (bad) return { success: false, error: bad }
    try {
      // Reverting a merge commit requires picking which parent line to keep
      // (-m 1 = first parent). Without it git refuses with "is a merge but no -m".
      const parentStr = (await this.git.raw(['log', '--pretty=format:%P', '-n', '1', hash])).trim()
      const parents = parentStr ? parentStr.split(/\s+/).filter(Boolean) : []
      const mainline = parents.length > 1 ? ['-m', '1'] : []
      await this.git.raw(['revert', '--no-edit', ...mainline, hash])
      if (await this.hasUnmergedPaths()) {
        return { success: false, error: 'Revert conflict — resolve conflicts before continuing' }
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // Continue / abort a cherry-pick or revert that stopped on a conflict.
  // (Rebase and merge have their own continue/abort already.) GIT_EDITOR=true
  // accepts the pre-filled commit message without opening an editor.
  async continueCherryPick(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.gitExec(['cherry-pick', '--continue'])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.stderr ?? e.message }
    }
  }

  async abortCherryPick(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['cherry-pick', '--abort'])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async continueRevert(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.gitExec(['revert', '--continue'])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.stderr ?? e.message }
    }
  }

  async abortRevert(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['revert', '--abort'])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async reset(hash: string, mode: 'soft' | 'mixed' | 'hard'): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(hash, 'commit')
    if (bad) return { success: false, error: bad }
    try {
      await this.git.raw(['reset', `--${mode}`, hash])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async amendMessage(message: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['commit', '--amend', '--only', '-m', message])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // Diff between a commit and the current working directory
  async diffCommitToWorking(hash: string): Promise<{ diff: string }> {
    try {
      const diff = await this.git.raw(['diff', hash])
      return { diff }
    } catch (e) {
      return { diff: '' }
    }
  }

  // ── Targeted rebase operations (drop / move) without the rebase UI ──

  // Build the pick sequence (oldest → newest) for hash^..HEAD
  private async buildPickSequence(baseHash: string): Promise<{ hash: string }[]> {
    const result = await this.git.raw(['log', '--pretty=format:%H', `${baseHash}..HEAD`])
    return result.trim().split('\n').filter(Boolean).map(h => ({ hash: h.trim() })).reverse()
  }

  // Run a pre-built rebase sequence via GIT_SEQUENCE_EDITOR.
  // `sequence` is oldest → newest; entries with action 'drop' are removed.
  private async runRebaseSequence(
    baseRef: string,
    sequence: { action: string; hash: string }[]
  ): Promise<{ success: boolean; error?: string }> {
    const fs = await import('fs')
    const path = await import('path')
    const os = await import('os')
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const execFileAsync = promisify(execFile)

    const tmpDir = os.tmpdir()
    const seqFile = path.join(tmpDir, `gitgui-rebase-seq-${Date.now()}.txt`)
    const scriptFile = path.join(tmpDir, `gitgui-rebase-editor-${Date.now()}.sh`)

    try {
      const seqContent = sequence.map(s => `${s.action} ${s.hash}`).join('\n') + '\n'
      fs.writeFileSync(seqFile, seqContent, 'utf8')
      const scriptContent = `#!/bin/sh\ncp "${seqFile}" "$1"\n`
      fs.writeFileSync(scriptFile, scriptContent, 'utf8')
      fs.chmodSync(scriptFile, 0o755)

      await execFileAsync('git', ['-C', this.repoPath, 'rebase', '-i', '--autostash', baseRef], {
        env: { ...process.env, GIT_SEQUENCE_EDITOR: scriptFile },
        timeout: 30000
      })
      return { success: true }
    } catch (e: any) {
      // A conflict (or any failure) leaves the repo mid-rebase. Abort to restore
      // the original state — these targeted operations have no resolution UI.
      const aborted = await this.abortRebaseIfInProgress()
      const base = e.stderr ?? e.message
      return {
        success: false,
        error: aborted ? `Rebase conflict — operation aborted, history unchanged` : base
      }
    } finally {
      try { fs.unlinkSync(seqFile) } catch {}
      try { fs.unlinkSync(scriptFile) } catch {}
    }
  }

  async dropCommit(hash: string): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(hash, 'commit')
    if (bad) return { success: false, error: bad }
    try {
      const picks = await this.buildPickSequence(`${hash}^`)
      if (picks.length === 0) return { success: false, error: 'Commit introuvable' }
      const sequence = picks.map(p => ({
        action: p.hash.startsWith(hash) || hash.startsWith(p.hash) ? 'drop' : 'pick',
        hash: p.hash
      }))
      return await this.runRebaseSequence(`${hash}^`, sequence)
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // direction 'up' = move toward HEAD (newer), 'down' = toward root (older)
  async moveCommit(hash: string, direction: 'up' | 'down'): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(hash, 'commit')
    if (bad) return { success: false, error: bad }
    try {
      // For 'down' we must include the older neighbour (hash^) in the sequence,
      // so we rebase from the grandparent. For 'up' the older bound is hash^.
      const base = direction === 'down' ? `${hash}^^` : `${hash}^`
      const picks = await this.buildPickSequence(base)
      const idx = picks.findIndex(p => p.hash.startsWith(hash) || hash.startsWith(p.hash))
      if (idx === -1) return { success: false, error: 'Commit introuvable' }
      const swapWith = direction === 'up' ? idx + 1 : idx - 1
      if (swapWith < 0 || swapWith >= picks.length) {
        return { success: false, error: 'Move not possible' }
      }
      const reordered = [...picks]
      ;[reordered[idx], reordered[swapWith]] = [reordered[swapWith], reordered[idx]]
      const sequence = reordered.map(p => ({ action: 'pick', hash: p.hash }))
      return await this.runRebaseSequence(base, sequence)
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // ── Branch operations ──────────────────────────────────────

  async createBranchAt(name: string, hash: string, checkout: boolean): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(name, 'branch name') || this.assertRef(hash, 'commit')
    if (bad) return { success: false, error: bad }
    try {
      if (checkout) {
        await this.git.raw(['checkout', '-b', name, hash])
      } else {
        await this.git.raw(['branch', name, hash])
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async renameBranch(oldName: string, newName: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['branch', '-m', oldName, newName])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // Returns true if HEAD points to a commit (false in a freshly-initialized
  // repo where no commit exists yet).
  private async hasHead(): Promise<boolean> {
    try {
      await this.git.raw(['rev-parse', '--verify', 'HEAD'])
      return true
    } catch {
      return false
    }
  }

  // Returns true if the index currently has unmerged (conflicted) paths.
  private async hasUnmergedPaths(): Promise<boolean> {
    try {
      const out = await this.git.raw(['ls-files', '--unmerged'])
      return out.trim().length > 0
    } catch {
      return false
    }
  }

  async merge(branch: string): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(branch, 'branch')
    if (bad) return { success: false, error: bad }
    try {
      await this.git.raw(['merge', branch])
      // simple-git does NOT throw on merge conflicts — it resolves with the
      // conflict message. Detect leftover conflicts so we never report a false
      // success while the working tree is in a conflicted state.
      if (await this.hasUnmergedPaths()) {
        return { success: false, error: 'Merge conflict — resolve conflicts before continuing' }
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // Run git and return its exit code + stdout WITHOUT throwing on a non-zero
  // exit — needed for `merge-tree`, which exits 1 to mean "would conflict"
  // (simple-git's .raw() would reject on that and lose the stdout we need).
  private async execRaw(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    const { execFile } = await import('node:child_process')
    return new Promise(resolve => {
      execFile('git', ['-C', this.repoPath, ...args], { maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
        const code = err && typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === 'number'
          ? (err as unknown as { code: number }).code
          : (err ? 1 : 0)
        resolve({ code, stdout: stdout || '', stderr: stderr || '' })
      })
    })
  }

  // Predict whether reconciling `theirs` into `ours` (default HEAD) would
  // conflict, and on which files — a DRY RUN via `git merge-tree` that never
  // touches the working tree, the index or any ref. Pass `mergeBase` to pin the
  // 3-way base: a cherry-pick uses the commit's parent, a revert the commit
  // itself; omit it for a plain merge (git finds the base). For a rebase this is
  // only a heuristic (it models a single merge of the two tips, not the
  // per-commit replay), so treat a rebase result as advisory. Requires git ≥ 2.38.
  // Returns `error` when the prediction itself couldn't run (bad ref, old git),
  // which callers should treat as "unknown" and NOT as "will conflict".
  async predictConflicts(theirs: string, ours = 'HEAD', mergeBase?: string): Promise<{ files: string[]; error?: string }> {
    for (const [ref, label] of ([[theirs, 'theirs'], [ours, 'ours'], ...(mergeBase ? [[mergeBase, 'merge-base']] : [])] as [string, string][])) {
      const bad = this.assertRef(ref, label)
      if (bad) return { files: [], error: bad }
    }
    try {
      const args = ['merge-tree', '--write-tree', '--name-only']
      if (mergeBase) args.push(`--merge-base=${mergeBase}`)
      args.push(ours, theirs)
      const { code, stdout, stderr } = await this.execRaw(args)
      if (code === 0) return { files: [] }                    // clean
      if (code === 1) {                                        // conflicts
        // stdout: merged tree OID, then the conflicted file names, a blank
        // line, then informational messages. Take the names off the first block.
        const [head] = stdout.split('\n\n')
        const files = head.split('\n').slice(1).map(s => s.trim()).filter(Boolean)
        return { files }
      }
      return { files: [], error: (stderr || stdout || 'merge-tree failed').trim() }  // real failure
    } catch (e: any) {
      return { files: [], error: e.message }
    }
  }

  // Accurately predict whether rebasing `branch` (default HEAD) onto `upstream`
  // will conflict — by SIMULATING the replay commit by commit, never touching
  // the working tree. `merge-tree --write-tree` writes each merged tree to the
  // object DB and prints its OID, which we feed as the base ("ours") of the next
  // step — exactly what a real rebase does. This catches a conflict that only
  // surfaces mid-replay, and avoids the false positives/negatives of merging the
  // two tips in one shot (e.g. a change made in one commit and undone in a later
  // one nets to zero for a tip-merge but still conflicts on replay). Returns the
  // conflicted files of the FIRST failing commit (with its short hash), or no
  // files when the whole replay is clean. Prediction failures never block.
  async predictRebaseConflicts(upstream: string, branch = 'HEAD'): Promise<{ files: string[]; error?: string; atCommit?: string }> {
    const badU = this.assertRef(upstream, 'upstream'); if (badU) return { files: [], error: badU }
    const badB = this.assertRef(branch, 'branch'); if (badB) return { files: [], error: badB }
    try {
      // The commits a default `git rebase` would replay, oldest first: the
      // non-merge commits in upstream..branch, parents before children.
      const listed = await this.execRaw(['rev-list', '--reverse', '--topo-order', '--no-merges', `${upstream}..${branch}`])
      if (listed.code !== 0) return { files: [], error: (listed.stderr || 'rev-list failed').trim() }
      const commits = listed.stdout.split('\n').map(s => s.trim()).filter(Boolean)
      if (commits.length === 0) return { files: [] }                    // nothing to replay
      // A very long range would mean hundreds of merge-tree calls on a
      // pre-flight check — fall back to the cheap single tip-merge past this cap.
      if (commits.length > 100) return this.predictConflicts(branch, upstream)
      let current = (await this.execRaw(['rev-parse', `${upstream}^{commit}`])).stdout.trim()
      if (!current) return { files: [], error: `Unknown upstream: ${upstream}` }
      for (const c of commits) {
        // Replay c onto the accumulated tree: 3-way merge with c's parent as base.
        const r = await this.execRaw(['merge-tree', '--write-tree', '--name-only', `--merge-base=${c}^`, current, c])
        if (r.code === 0) { current = r.stdout.trim().split('\n')[0]; continue }   // clean → next base
        if (r.code === 1) {
          const [head] = r.stdout.split('\n\n')
          const files = head.split('\n').slice(1).map(s => s.trim()).filter(Boolean)
          return { files, atCommit: c.slice(0, 7) }
        }
        return { files: [], error: (r.stderr || r.stdout || 'merge-tree failed').trim() }  // bail out (don't block)
      }
      return { files: [] }                                              // whole replay is clean
    } catch (e: any) {
      return { files: [], error: e.message }
    }
  }

  // Rebase the current branch onto another branch
  // On a conflict, this leaves the rebase PAUSED (same as the interactive
  // rebase planner) instead of silently aborting it, so the user can resolve
  // conflicts via the conflict UI and continue rather than losing the
  // operation to an abort with no way back in.
  async rebaseOnto(branch: string): Promise<{ success: boolean; error?: string; conflict?: boolean }> {
    const bad = this.assertRef(branch, 'branch')
    if (bad) return { success: false, error: bad }
    try {
      await this.git.raw(['rebase', '--autostash', branch])
      return { success: true }
    } catch (e: any) {
      if (this.rebaseInProgress()) {
        return { success: false, conflict: true, error: 'Rebase conflict — resolve the conflicts then continue' }
      }
      return { success: false, error: e.message }
    }
  }

  // Push a specific local branch to origin
  async pushBranch(branch: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['push', '--set-upstream', 'origin', branch])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message ?? String(e) }
    }
  }

  // Push local history up to (and including) `hash` to the upstream remote
  // branch, without pushing any later local commits — GitLens' "Push to
  // Commit". Requires an upstream to know which remote/branch to target.
  async pushToCommit(hash: string): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(hash, 'commit'); if (bad) return { success: false, error: bad }
    const { upstream } = await this.getUpstream()
    if (!upstream) return { success: false, error: 'No upstream configured for the current branch' }
    const slash = upstream.indexOf('/')
    if (slash === -1) return { success: false, error: `Unexpected upstream format: ${upstream}` }
    const remote = upstream.slice(0, slash)
    const remoteBranch = upstream.slice(slash + 1)
    try {
      await this.git.raw(['push', remote, `${hash}:refs/heads/${remoteBranch}`])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // Unified patch for a single commit (`git format-patch`), suitable for
  // `git am`/`git apply` elsewhere — used for both "Create Patch..." (saved
  // to a file by the caller) and "Copy Changes (Patch)" (clipboard).
  async createPatch(hash: string): Promise<{ patch: string; error?: string }> {
    const bad = this.assertRef(hash, 'commit'); if (bad) return { patch: '', error: bad }
    try {
      const patch = await this.git.raw(['format-patch', '-1', hash, '--stdout'])
      return { patch }
    } catch (e: any) {
      return { patch: '', error: e.message }
    }
  }

  // Delete a branch on the remote. `branch` may be a local name or a
  // remotes/<remote>/<name> ref.
  async deleteRemoteBranch(branch: string): Promise<{ success: boolean; error?: string }> {
    try {
      const m = branch.match(/^remotes\/([^/]+)\/(.+)$/)
      const remote = m ? m[1] : 'origin'
      const name = m ? m[2] : branch
      await this.git.raw(['push', remote, '--delete', name])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // ── Branch drag & drop targets ─────────────────────────────

  // Move a branch ref to a commit. If it is the current branch we hard-reset,
  // otherwise we force-update the ref.
  async moveBranchTo(branch: string, hash: string): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(branch, 'branch') || this.assertRef(hash, 'commit')
    if (bad) return { success: false, error: bad }
    try {
      const status = await this.git.status()
      if (status.current === branch) {
        // Moving the current branch is a hard reset — it discards uncommitted
        // work silently. Refuse loudly instead of destroying changes.
        if (await this.isDirty()) {
          return {
            success: false,
            error: 'Uncommitted changes present — commit or stash before moving the current branch'
          }
        }
        await this.git.raw(['reset', '--hard', hash])
      } else {
        await this.git.raw(['branch', '-f', branch, hash])
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // Rebase a branch onto a commit
  // Same pause-on-conflict semantics as rebaseOnto() above.
  async rebaseBranchOnto(branch: string, hash: string): Promise<{ success: boolean; error?: string; conflict?: boolean }> {
    const bad = this.assertRef(branch, 'branch') || this.assertRef(hash, 'commit')
    if (bad) return { success: false, error: bad }
    try {
      await this.git.raw(['checkout', branch])
      await this.git.raw(['rebase', '--autostash', hash])
      return { success: true }
    } catch (e: any) {
      if (this.rebaseInProgress()) {
        return { success: false, conflict: true, error: 'Rebase conflict — resolve the conflicts then continue' }
      }
      return { success: false, error: e.message }
    }
  }

  // Merge a commit into a branch
  async mergeCommitInto(branch: string, hash: string): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(branch, 'branch') || this.assertRef(hash, 'commit')
    if (bad) return { success: false, error: bad }
    try {
      await this.git.raw(['checkout', branch])
      await this.git.raw(['merge', hash])
      // Same conflict-without-throw caveat as merge().
      if (await this.hasUnmergedPaths()) {
        return { success: false, error: 'Merge conflict — resolve conflicts before continuing' }
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // Set the upstream of a local branch. Defaults to <remote>/<branch>, preferring
  // origin but falling back to the only/first configured remote so repos whose
  // remote isn't named "origin" still work. An explicit `upstream` overrides all.
  async setUpstream(branch: string, upstream?: string): Promise<{ success: boolean; error?: string }> {
    try {
      let target = upstream
      if (!target) {
        const remotes = (await this.git.raw(['remote'])).trim().split('\n').map(r => r.trim()).filter(Boolean)
        if (remotes.length === 0) return { success: false, error: 'No remote configured' }
        const preferred = remotes.includes('origin') ? 'origin' : remotes[0]
        target = `${preferred}/${branch}`
      }
      await this.git.raw(['branch', `--set-upstream-to=${target}`, branch])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // ── Tag operations ─────────────────────────────────────────

  async getTags(): Promise<{ tags: { name: string; hash: string }[] }> {
    try {
      const result = await this.git.raw([
        'tag', '-l', '--sort=-version:refname',
        '--format=%(refname:short)|%(objectname:short)'
      ])
      const tags = result.trim().split('\n').filter(Boolean).map(line => {
        const [name, hash] = line.split('|')
        return { name: name.trim(), hash: hash?.trim() ?? '' }
      })
      return { tags }
    } catch (e) {
      return { tags: [] }
    }
  }

  async createTag(name: string, hash?: string, message?: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (message) {
        await this.git.raw(['tag', '-a', name, ...(hash ? [hash] : []), '-m', message])
      } else {
        await this.git.raw(['tag', name, ...(hash ? [hash] : [])])
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async deleteTag(name: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['tag', '-d', name])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // Push a single tag to a remote (default origin). Uses the fully-qualified
  // refspec so a tag and branch sharing a name can't be confused.
  async pushTag(name: string, remote = 'origin'): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(name, 'tag')
    if (bad) return { success: false, error: bad }
    try {
      await this.git.raw(['push', remote, `refs/tags/${name}`])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // Delete a tag on a remote (default origin) via the empty-source refspec.
  async deleteRemoteTag(name: string, remote = 'origin'): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(name, 'tag')
    if (bad) return { success: false, error: bad }
    try {
      await this.git.raw(['push', remote, `:refs/tags/${name}`])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // ── Stash operations ───────────────────────────────────────

  async createStash(message?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const args = ['stash', 'push', '--include-untracked']
      if (message) args.push('-m', message)
      await this.git.raw(args)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async applyStash(index: number): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['stash', 'apply', `stash@{${index}}`])
    } catch (e: any) {
      // `git stash apply` exits non-zero on conflicts; surface a clear message
      // rather than the raw git error.
      if (await this.hasUnmergedPaths()) {
        return { success: false, error: 'Stash applied with conflicts — resolve them, then stage the files' }
      }
      return { success: false, error: e.message }
    }
    if (await this.hasUnmergedPaths()) {
      return { success: false, error: 'Stash applied with conflicts — resolve them, then stage the files' }
    }
    return { success: true }
  }

  async popStash(index: number): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['stash', 'pop', `stash@{${index}}`])
    } catch (e: any) {
      // On conflict git keeps the stash entry (does not drop it). Tell the user.
      if (await this.hasUnmergedPaths()) {
        return { success: false, error: 'Stash popped with conflicts — the stash was kept; resolve conflicts, then stage the files' }
      }
      return { success: false, error: e.message }
    }
    if (await this.hasUnmergedPaths()) {
      return { success: false, error: 'Stash popped with conflicts — the stash was kept; resolve conflicts, then stage the files' }
    }
    return { success: true }
  }

  async dropStash(index: number): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['stash', 'drop', `stash@{${index}}`])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // Full patch of a stash, untracked files included when supported.
  async getStashDiff(index: number): Promise<{ diff: string }> {
    const ref = `stash@{${index}}`
    try {
      return { diff: await this.git.raw(['stash', 'show', '-p', '--include-untracked', ref]) }
    } catch {
      // --include-untracked on `stash show` needs git ≥ 2.32 — retry without
      try {
        return { diff: await this.git.raw(['stash', 'show', '-p', ref]) }
      } catch {
        return { diff: '' }
      }
    }
  }

  // ── Reflog ─────────────────────────────────────────────────

  // ── Interactive Rebase ──────────────────────────────────────

  async getRebaseSequence(baseHash: string): Promise<{ commits: { hash: string; shortHash: string; message: string }[] }> {
    try {
      const result = await this.git.raw([
        'log',
        '--pretty=format:%H|%s',
        `${baseHash}..HEAD`
      ])
      const commits = result.trim().split('\n').filter(Boolean).map(line => {
        const [hash, ...rest] = line.split('|')
        return {
          hash: hash.trim(),
          shortHash: hash.trim().slice(0, 7),
          message: rest.join('|').trim()
        }
      }).reverse()
      return { commits }
    } catch (e) {
      return { commits: [] }
    }
  }

  // Run a git command via execFile, bypassing simple-git's editor/env guards
  // (it blocks both `-c core.editor` and a GIT_EDITOR env override). GIT_EDITOR=true
  // accepts the default message for squash/fixup steps without opening an editor.
  private async gitExec(args: string[], gitEditor = 'true'): Promise<void> {
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const execFileAsync = promisify(execFile)
    await execFileAsync('git', ['-C', this.repoPath, ...args], {
      env: { ...process.env, GIT_EDITOR: gitEditor },
      timeout: 30000,
    })
  }

  // Builds a GIT_EDITOR override that feeds `messages` to git's commit-message
  // editor calls IN ORDER (one call per squash group finalized / reword
  // commit). Any call beyond the given messages leaves git's own default
  // content untouched. Returns the plain accept-default editor ('true') when
  // no messages are given.
  private buildMessageEditor(messages?: string[]): { gitEditor: string; cleanup: () => void } {
    if (!messages || messages.length === 0) return { gitEditor: 'true', cleanup: () => { /* nothing to clean up */ } }
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const os = require('os') as typeof import('os')
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const tmpDir = os.tmpdir()
    const msgDir = path.join(tmpDir, `gitgui-msgs-${runId}`)
    const counterFile = path.join(tmpDir, `gitgui-msg-counter-${runId}.txt`)
    const scriptFile = path.join(tmpDir, `gitgui-msgeditor-${runId}.sh`)
    fs.mkdirSync(msgDir, { recursive: true })
    messages.forEach((m, i) => fs.writeFileSync(path.join(msgDir, `${i}.txt`), m, 'utf8'))
    fs.writeFileSync(counterFile, '0', 'utf8')
    fs.writeFileSync(scriptFile, `#!/bin/sh
N=$(cat "${counterFile}" 2>/dev/null || echo 0)
M="${msgDir}/$N.txt"
if [ -f "$M" ]; then cp "$M" "$1"; fi
echo $((N+1)) > "${counterFile}"
exit 0
`, 'utf8')
    fs.chmodSync(scriptFile, 0o755)
    return {
      gitEditor: scriptFile,
      cleanup: () => {
        try { fs.rmSync(msgDir, { recursive: true, force: true }) } catch { /* best effort */ }
        try { fs.unlinkSync(counterFile) } catch { /* best effort */ }
        try { fs.unlinkSync(scriptFile) } catch { /* best effort */ }
      },
    }
  }

  // True if a rebase is currently in progress (stopped on a conflict, etc.).
  private rebaseInProgress(): boolean {
    const fs = require('fs')
    const path = require('path')
    const g = path.join(this.repoPath, '.git')
    return fs.existsSync(path.join(g, 'rebase-merge')) || fs.existsSync(path.join(g, 'rebase-apply'))
  }

  // `messages`, when given, are the exact commit messages to use for each
  // squash/reword group that will prompt git's message editor, IN THE ORDER
  // git invokes it (i.e. the order the UI's computeMessageGroups() produced
  // them). Without this, squash groups fall back to git's raw concatenation
  // of all folded messages.
  async interactiveRebase(sequence: { action: string; hash: string }[], messages?: string[]): Promise<{ success: boolean; error?: string; conflict?: boolean }> {
    // The first kept commit can't be squash/fixup (nothing earlier to fold into).
    const firstKept = sequence.find(s => s.action !== 'drop')
    if (firstKept && (firstKept.action === 'squash' || firstKept.action === 'fixup')) {
      return { success: false, error: "The first kept commit cannot be 'squash'/'fixup'." }
    }
    const fs = await import('fs')
    const path = await import('path')
    const os = await import('os')
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const execFileAsync = promisify(execFile)

    const tmpDir = os.tmpdir()
    const seqFile = path.join(tmpDir, `gitgui-rebase-seq-${Date.now()}.txt`)
    const scriptFile = path.join(tmpDir, `gitgui-rebase-editor-${Date.now()}.sh`)
    const editor = this.buildMessageEditor(messages)

    try {
      const seqContent = sequence.map(s => `${s.action} ${s.hash} commit`).join('\n') + '\n'
      fs.writeFileSync(seqFile, seqContent, 'utf8')
      // Editor script: just copies our pre-written sequence file
      const scriptContent = `#!/bin/sh\ncp "${seqFile}" "$1"\n`
      fs.writeFileSync(scriptFile, scriptContent, 'utf8')
      fs.chmodSync(scriptFile, 0o755)

      await execFileAsync('git', ['-C', this.repoPath, 'rebase', '-i', '--autostash', sequence[0].hash + '^'], {
        env: { ...process.env, GIT_SEQUENCE_EDITOR: scriptFile, GIT_EDITOR: editor.gitEditor },
        timeout: 30000
      })
      return { success: true }
    } catch (e: any) {
      // Stopped on a conflict → leave the rebase in progress so the user can
      // resolve via the conflict UI and continue (don't treat it as a failure).
      if (this.rebaseInProgress()) {
        return { success: false, conflict: true, error: 'Rebase conflict — resolve the conflicts then click Continue' }
      }
      return { success: false, error: e.stderr ?? e.message }
    } finally {
      try { fs.unlinkSync(seqFile) } catch {}
      try { fs.unlinkSync(scriptFile) } catch {}
      editor.cleanup()
    }
  }

  // ── Conflict detection ──────────────────────────────────────

  async getConflictedFiles(): Promise<{ files: string[] }> {
    try {
      const status = await this.git.status()
      const files = status.files
        .filter(f => f.index === 'U' || f.working_dir === 'U' || (f.index === 'A' && f.working_dir === 'A') || (f.index === 'D' && f.working_dir === 'D'))
        .map(f => f.path)
      return { files }
    } catch (e) {
      return { files: [] }
    }
  }

  async getConflictVersions(filepath: string): Promise<{ base: string; ours: string; theirs: string }> {
    const read = async (stage: string) => {
      try {
        return await this.git.raw(['show', `${stage}:${filepath}`])
      } catch { return '' }
    }
    const [base, ours, theirs] = await Promise.all([read(':1'), read(':2'), read(':3')])
    return { base, ours, theirs }
  }

  async getFileContent(filepath: string): Promise<{ content: string; error?: string }> {
    try {
      const fs = await import('fs')
      const path = await import('path')
      const fullPath = path.join(this.repoPath, filepath)
      const content = fs.readFileSync(fullPath, 'utf-8')
      return { content }
    } catch (e: any) {
      return { content: '', error: e.message }
    }
  }

  async getFileAtCommit(commitHash: string, filepath: string): Promise<{ content: string; error?: string }> {
    const err = this.assertRef(commitHash, 'commit hash')
    if (err) return { content: '', error: err }
    try {
      const content = await this.git.show([`${commitHash}:${filepath}`])
      return { content }
    } catch (e: any) {
      return { content: '', error: e.message }
    }
  }

  async applyPatch(patch: string, reverse: boolean = false): Promise<{ success: boolean; error?: string }> {
    const fs = await import('fs')
    const path = await import('path')
    const os = await import('os')
    const tmpFile = path.join(os.tmpdir(), `git-gui-patch-${Date.now()}.patch`)
    try {
      fs.writeFileSync(tmpFile, patch)
      const args = ['apply', '--cached']
      if (reverse) args.push('--reverse')
      args.push(tmpFile)
      await this.git.raw(args)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    } finally {
      try { fs.unlinkSync(tmpFile) } catch {}
    }
  }

  async markResolved(filepath: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['add', '--', filepath])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // Resolve a conflicted file by WRITING the chosen content to disk, then staging
  // it. This is the correct fix for the previous behavior, which only ran
  // `git add` and left the conflict markers (<<<<<<<, =======, >>>>>>>) in place.
  async resolveConflict(filepath: string, content: string): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(filepath, 'file path')
    if (bad) return { success: false, error: bad }
    try {
      const fs = await import('fs')
      const path = await import('path')
      // Guard against path traversal — keep the write inside the repo.
      const abs = path.resolve(this.repoPath, filepath)
      const repoAbs = path.resolve(this.repoPath)
      if (abs !== repoAbs && !abs.startsWith(repoAbs + path.sep)) {
        return { success: false, error: 'Path escapes repository' }
      }
      fs.writeFileSync(abs, content, 'utf8')
      await this.git.raw(['add', '--', filepath])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // Resolve a conflict by taking one whole side: 'ours' (HEAD) or 'theirs'.
  async resolveConflictWithSide(filepath: string, side: 'ours' | 'theirs'): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(filepath, 'file path')
    if (bad) return { success: false, error: bad }
    try {
      try {
        await this.git.raw(['checkout', `--${side}`, '--', filepath])
        await this.git.raw(['add', '--', filepath])
      } catch {
        // Modify/delete conflict: the chosen side has no version of this path
        // (it deleted the file), so `checkout --ours/--theirs` fails. Taking
        // that side means accepting the deletion → remove the path.
        await this.git.raw(['rm', '-f', '--', filepath])
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // `messages`, when given, feed the user-chosen final text to any squash
  // group(s) that finalize during this --continue (a single continue can run
  // through several queued steps before the next conflict or the end), in
  // the order the UI's computeMessageGroups() produced them over the
  // remaining todo. Without this, those groups fall back to git's default
  // (concatenation of all folded messages).
  async continueRebase(messages?: string[]): Promise<{ success: boolean; error?: string; conflict?: boolean }> {
    const editor = this.buildMessageEditor(messages)
    try {
      await this.gitExec(['rebase', '--continue'], editor.gitEditor)
      return { success: true }
    } catch (e: any) {
      if (!this.rebaseInProgress()) return { success: false, error: e.stderr ?? e.message }
      // Real conflicts remain → the user must resolve them first.
      if (await this.hasUnmergedPaths()) {
        return { success: false, conflict: true, error: 'Remaining conflicts — resolve them then continue' }
      }
      // Clean tree but `--continue` couldn't advance → the current commit is
      // empty / already applied. Skip it so the rebase moves on (no changes lost).
      try {
        await this.gitExec(['rebase', '--skip'])
        if (this.rebaseInProgress() && await this.hasUnmergedPaths()) {
          return { success: false, conflict: true, error: 'Remaining conflicts — resolve them then continue' }
        }
        return { success: true }
      } catch (e2: any) {
        return { success: false, error: e2.stderr ?? e2.message }
      }
    } finally {
      editor.cleanup()
    }
  }

  async continueMerge(message?: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (message) {
        // If a message is provided, we can just commit directly which resolves the merge state.
        await this.git.commit(message)
        return { success: true }
      } else {
        // Use env variables to bypass the editor if it still tries to open one,
        // and explicitly pass --no-edit
        await this.gitExec(['merge', '--continue', '--no-edit'])
        return { success: true }
      }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async abortRebase(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['rebase', '--abort'])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async abortMerge(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['merge', '--abort'])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // Undo the last significant git action:
  // 1. If ORIG_HEAD exists (set by merge/rebase/reset) → reset --soft to ORIG_HEAD
  // 2. Otherwise → reset --soft HEAD~1 (undo last commit, keep changes staged)
  async undoLastAction(): Promise<{ success: boolean; action?: string; error?: string }> {
    const fs = await import('fs')
    const path = await import('path')
    try {
      if (await this.isDirty()) {
        // Allow undo even with unstaged changes — soft reset keeps them
      }
      // Snapshot HEAD before we move it, so redo can restore exactly this point.
      const before = (await this.git.revparse(['HEAD'])).trim()

      const gitDir = (await this.git.revparse(['--git-dir'])).trim()
      const absGitDir = path.isAbsolute(gitDir) ? gitDir : path.join(this.repoPath, gitDir)
      const origHead = path.join(absGitDir, 'ORIG_HEAD')

      if (fs.existsSync(origHead)) {
        await this.git.raw(['reset', '--soft', 'ORIG_HEAD'])
        this.redoStack.push(before)
        return { success: true, action: 'merge/rebase/reset aborted' }
      }

      // Check we have at least one parent to reset to
      const count = (await this.git.raw(['rev-list', '--count', '--max-count=2', 'HEAD'])).trim()
      if (parseInt(count) < 2) {
        return { success: false, error: 'No previous commit — cannot undo' }
      }

      const msg = (await this.git.raw(['log', '-1', '--pretty=format:%s', 'HEAD'])).trim()
      await this.git.raw(['reset', '--soft', 'HEAD~1'])
      this.redoStack.push(before)
      return { success: true, action: `commit undone: "${msg}"` }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // Redo the last undone action: soft-reset forward to the HEAD captured before
  // the matching undo. Non-destructive (soft reset preserves the working tree).
  async redoLastAction(): Promise<{ success: boolean; action?: string; error?: string }> {
    const target = this.redoStack.pop()
    if (!target) return { success: false, error: 'Nothing to redo' }
    try {
      // Make sure the saved commit still exists before resetting to it.
      await this.git.raw(['cat-file', '-e', `${target}^{commit}`])
      const msg = (await this.git.raw(['log', '-1', '--pretty=format:%s', target])).trim()
      await this.git.raw(['reset', '--soft', target])
      return { success: true, action: `action redone: "${msg}"` }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // True when there is at least one undone action available to redo.
  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  async getConflictMode(): Promise<{ mode: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null }> {
    const fs = await import('fs')
    const path = await import('path')
    const dotGit = path.join(this.repoPath, '.git')
    
    // In some setups (like submodules or worktrees), .git is a file.
    // simple-git's git.revparse(['--git-dir']) is more reliable.
    try {
      const gitDir = (await this.git.revparse(['--git-dir'])).trim()
      const absGitDir = path.isAbsolute(gitDir) ? gitDir : path.join(this.repoPath, gitDir)
      
      if (fs.existsSync(path.join(absGitDir, 'MERGE_HEAD'))) return { mode: 'merge' }
      if (fs.existsSync(path.join(absGitDir, 'rebase-apply')) || fs.existsSync(path.join(absGitDir, 'rebase-merge'))) return { mode: 'rebase' }
      if (fs.existsSync(path.join(absGitDir, 'CHERRY_PICK_HEAD'))) return { mode: 'cherry-pick' }
      if (fs.existsSync(path.join(absGitDir, 'REVERT_HEAD'))) return { mode: 'revert' }
    } catch {}
    
    return { mode: null }
  }

  // Human-readable labels for the two sides of the current conflict, so the
  // resolver can show "main — chore: release v2.2.0" instead of the cryptic
  // "Nôtre (HEAD)". During a rebase HEAD is the NEW BASE (detached) and the
  // replayed commit is the branch being rebased — the labels make that
  // visible instead of hiding it behind ours/theirs.
  async getConflictSides(): Promise<{ ours: string; theirs: string }> {
    const subj = async (ref: string): Promise<string> => {
      try { return (await this.git.raw(['log', '-1', '--pretty=format:%h — %s', ref])).trim() } catch { return '' }
    }
    // Which special ref is the incoming side?
    let theirsRef: string | null = null
    let mode = ''
    for (const [ref, m] of [['REBASE_HEAD', 'rebase'], ['MERGE_HEAD', 'merge'], ['CHERRY_PICK_HEAD', 'cherry-pick'], ['REVERT_HEAD', 'revert']] as const) {
      // NOTE: --quiet makes git exit 1 with EMPTY stderr on a missing ref,
      // which simple-git treats as success — test the output instead.
      const out = await this.git.raw(['rev-parse', '--verify', '--quiet', ref]).catch(() => '')
      if (out.trim()) { theirsRef = ref; mode = m; break }
    }

    let oursName = ''
    try { oursName = (await this.git.raw(['symbolic-ref', '--short', 'HEAD'])).trim() } catch { oursName = 'HEAD' }
    const ours = `${oursName ? oursName + ' · ' : ''}${await subj('HEAD')}`

    let theirs = ''
    if (theirsRef) {
      let theirsName = ''
      if (mode === 'rebase') {
        // The branch being rebased lives in rebase-merge/head-name.
        try {
          const fs = await import('fs')
          const path = await import('path')
          const gitDir = (await this.git.revparse(['--git-dir'])).trim()
          const absGitDir = path.isAbsolute(gitDir) ? gitDir : path.join(this.repoPath, gitDir)
          for (const d of ['rebase-merge', 'rebase-apply']) {
            const p = path.join(absGitDir, d, 'head-name')
            if (fs.existsSync(p)) { theirsName = fs.readFileSync(p, 'utf-8').trim().replace('refs/heads/', ''); break }
          }
        } catch { /* label stays hash-only */ }
      } else {
        try {
          const n = (await this.git.raw(['name-rev', '--name-only', '--exclude', 'tags/*', theirsRef])).trim()
          if (n && n !== 'undefined') theirsName = n.replace(/^remotes\//, '')
        } catch { /* label stays hash-only */ }
      }
      theirs = `${theirsName ? theirsName + ' · ' : ''}${await subj(theirsRef)}`
    }
    return { ours, theirs }
  }

  async getMergeMessage(): Promise<{ message: string }> {
    const fs = await import('fs')
    const path = await import('path')
    try {
      const gitDir = (await this.git.revparse(['--git-dir'])).trim()
      const absGitDir = path.isAbsolute(gitDir) ? gitDir : path.join(this.repoPath, gitDir)

      for (const file of ['MERGE_MSG', 'SQUASH_MSG', 'CHERRY_PICK_HEAD', 'REVERT_HEAD']) {
        const p = path.join(absGitDir, file)
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, 'utf-8')
          const clean = content.split('\n').filter(line => !line.trim().startsWith('#')).join('\n').trim()
          if (!clean) continue

          // Replace "Merge commit 'SHA'" with the branch name when available.
          // git generates this form when merging a commit not at a named branch tip.
          const shaMatch = clean.match(/Merge commit '([0-9a-f]{7,40})'/)
          if (shaMatch) {
            try {
              const raw = await this.git.raw(['branch', '--all', '--points-at', shaMatch[1]])
              const names = raw.split('\n')
                .map(l => l.trim().replace(/^\* /, ''))
                .filter(Boolean)
              const preferred = names.find(b => !b.startsWith('remotes/') && b !== 'HEAD (detached')
                ?? names.find(b => b.startsWith('remotes/origin/'))
              if (preferred) {
                const branchName = preferred.replace(/^remotes\/origin\//, '')
                return { message: clean.replace(`commit '${shaMatch[1]}'`, `branch '${branchName}'`) }
              }
            } catch {}
          }

          return { message: clean }
        }
      }
    } catch {}
    return { message: '' }
  }

  // ── Blame ───────────────────────────────────────────────────

  async getBlame(hash: string, filepath: string): Promise<{
    lines: { shortHash: string; hash: string; author: string; date: string; lineNum: number; content: string }[]
  }> {
    try {
      const result = await this.git.raw(['blame', '--porcelain', hash, '--', filepath])
      const lines: { shortHash: string; hash: string; author: string; date: string; lineNum: number; content: string }[] = []
      const rawLines = result.split('\n')
      const meta: Record<string, { author: string; date: string }> = {}
      let i = 0
      while (i < rawLines.length) {
        const header = rawLines[i]
        if (!header) { i++; continue }
        const headerMatch = header.match(/^([0-9a-f]{40}) \d+ (\d+)/)
        if (!headerMatch) { i++; continue }
        const commitHash = headerMatch[1]
        const lineNum = parseInt(headerMatch[2])
        i++
        // Read metadata lines until we hit the content line (starts with \t)
        let author = meta[commitHash]?.author ?? ''
        let date = meta[commitHash]?.date ?? ''
        while (i < rawLines.length && !rawLines[i].startsWith('\t')) {
          const metaLine = rawLines[i]
          if (metaLine.startsWith('author ') && !meta[commitHash]) {
            author = metaLine.slice(7)
          }
          if (metaLine.startsWith('author-time ') && !meta[commitHash]) {
            date = new Date(parseInt(metaLine.slice(12)) * 1000).toLocaleDateString('fr-FR')
          }
          i++
        }
        if (!meta[commitHash]) {
          meta[commitHash] = { author, date }
        } else {
          author = meta[commitHash].author
          date = meta[commitHash].date
        }
        const content = rawLines[i] ? rawLines[i].slice(1) : ''
        i++
        lines.push({ hash: commitHash, shortHash: commitHash.slice(0, 7), author, date, lineNum, content })
      }
      return { lines }
    } catch (e) {
      return { lines: [] }
    }
  }

  // ── Submodules ──────────────────────────────────────────────

  async getSubmodules(): Promise<{ submodules: { path: string; url: string; status: 'ok' | 'dirty' | 'uninitialized' }[] }> {
    try {
      const gitmodulesPath = require('path').join(this.repoPath, '.gitmodules')
      const fs = require('fs')
      if (!fs.existsSync(gitmodulesPath)) return { submodules: [] }

      const statusResult = await this.git.raw(['submodule', 'status'])
      const submodules = statusResult.trim().split('\n').filter(Boolean).map(line => {
        const match = line.match(/^([ +\-U])([0-9a-f]+) (.+?)( \(.*\))?$/)
        if (!match) return null
        const [, statusChar, , path] = match
        const status: 'ok' | 'dirty' | 'uninitialized' =
          statusChar === '-' ? 'uninitialized' :
          statusChar === '+' ? 'dirty' : 'ok'
        return { path: path.trim(), url: '', status }
      }).filter(Boolean) as { path: string; url: string; status: 'ok' | 'dirty' | 'uninitialized' }[]

      // Get URLs from .gitmodules
      const content = fs.readFileSync(gitmodulesPath, 'utf8')
      const urlMatches = content.matchAll(/\[submodule "(.+?)"\][\s\S]*?url\s*=\s*(.+)/g)
      const urlMap: Record<string, string> = {}
      for (const m of urlMatches) {
        urlMap[m[1]] = m[2].trim()
      }
      for (const sub of submodules) {
        sub.url = urlMap[sub.path] ?? ''
      }

      return { submodules }
    } catch (e) {
      return { submodules: [] }
    }
  }

  async initSubmodule(path: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['submodule', 'init', path])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async updateSubmodule(path: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['submodule', 'update', path])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // ── Extended search ─────────────────────────────────────────

  async searchInDiffs(query: string): Promise<{ hashes: string[] }> {
    try {
      const result = await this.git.raw([
        'log', '--all', '--pretty=format:%H', '-S', query, '--max-count=100'
      ])
      const hashes = result.trim().split('\n').filter(Boolean)
      return { hashes }
    } catch (e) {
      return { hashes: [] }
    }
  }

  // ── Branch comparison ───────────────────────────────────────

  async compareBranches(current: string, other: string): Promise<{
    ahead: { hash: string; shortHash: string; message: string }[]
    behind: { hash: string; shortHash: string; message: string }[]
  }> {
    const parse = (output: string) =>
      output.trim().split('\n').filter(Boolean).map(line => {
        const [hash, ...rest] = line.split('|')
        return { hash: hash.trim(), shortHash: hash.trim().slice(0, 7), message: rest.join('|').trim() }
      })
    try {
      const [aheadRaw, behindRaw] = await Promise.all([
        this.git.raw(['log', '--pretty=format:%H|%s', `${current}..${other}`]),
        this.git.raw(['log', '--pretty=format:%H|%s', `${other}..${current}`])
      ])
      return { ahead: parse(aheadRaw), behind: parse(behindRaw) }
    } catch (e) {
      return { ahead: [], behind: [] }
    }
  }

  // ── Reflog ─────────────────────────────────────────────────

  async getReflog(): Promise<{ entries: { hash: string; ref: string; message: string; date: string }[] }> {
    try {
      const result = await this.git.raw([
        'reflog',
        '--pretty=format:%H|%gd|%gs|%ar',
        '--max-count=50'
      ])
      const entries = result.trim().split('\n').filter(Boolean).map(line => {
        const [hash, ref, message, date] = line.split('|')
        return {
          hash: hash?.trim() ?? '',
          ref: ref?.trim() ?? '',
          message: message?.trim() ?? '',
          date: date?.trim() ?? ''
        }
      })
      return { entries }
    } catch (e) {
      return { entries: [] }
    }
  }

  // ── File History ────────────────────────────────────────────

  async getFileHistory(filepath: string): Promise<{ commits: { hash: string; shortHash: string; message: string; author: string; date: string }[] }> {
    try {
      const result = await this.git.raw([
        'log',
        '--follow',
        '--pretty=format:%H|%s|%an|%ai',
        '--',
        filepath
      ])
      const commits = result.trim().split('\n').filter(Boolean).map(line => {
        const [hash, message, author, date] = line.split('|')
        return {
          hash: hash?.trim() ?? '',
          shortHash: hash?.trim().slice(0, 7) ?? '',
          message: message?.trim() ?? '',
          author: author?.trim() ?? '',
          date: date?.trim() ?? ''
        }
      })
      return { commits }
    } catch (e) {
      return { commits: [] }
    }
  }

  // ── Remotes ─────────────────────────────────────────────────

  async getRemotes(): Promise<{ remotes: { name: string; fetchUrl: string; pushUrl: string }[] }> {
    try {
      const result = await this.git.raw(['remote', '-v'])
      const map = new Map<string, { fetchUrl: string; pushUrl: string }>()
      for (const line of result.trim().split('\n').filter(Boolean)) {
        const match = line.match(/^(\S+)\s+(\S+)\s+\((\w+)\)$/)
        if (!match) continue
        const [, name, url, type] = match
        if (!map.has(name)) map.set(name, { fetchUrl: '', pushUrl: '' })
        const entry = map.get(name)!
        if (type === 'fetch') entry.fetchUrl = url
        if (type === 'push') entry.pushUrl = url
      }
      return { remotes: Array.from(map.entries()).map(([name, urls]) => ({ name, ...urls })) }
    } catch (e) {
      return { remotes: [] }
    }
  }

  async addRemote(name: string, url: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['remote', 'add', name, url])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async removeRemote(name: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['remote', 'remove', name])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async renameRemote(oldName: string, newName: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['remote', 'rename', oldName, newName])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async fetchRemote(name: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['fetch', name])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // ── Gitflow (implemented manually, no git-flow dependency) ──

  private async localBranchNames(): Promise<string[]> {
    const summary = await this.git.branch()
    return Object.values(summary.branches).filter(b => !b.name.startsWith('remotes/')).map(b => b.name)
  }

  private async detectMainBranch(names: string[]): Promise<string> {
    if (names.includes('main')) return 'main'
    if (names.includes('master')) return 'master'
    // fall back to current branch
    const status = await this.git.status()
    return status.current ?? 'main'
  }

  async gitflowStatus(): Promise<{
    initialized: boolean
    mainBranch: string
    features: string[]
    releases: string[]
    hotfixes: string[]
  }> {
    try {
      const names = await this.localBranchNames()
      const mainBranch = await this.detectMainBranch(names)
      const strip = (prefix: string) =>
        names.filter(n => n.startsWith(prefix)).map(n => n.slice(prefix.length))
      return {
        initialized: names.includes('develop'),
        mainBranch,
        features: strip('feature/'),
        releases: strip('release/'),
        hotfixes: strip('hotfix/'),
      }
    } catch {
      return { initialized: false, mainBranch: 'main', features: [], releases: [], hotfixes: [] }
    }
  }

  async gitflowInit(): Promise<{ success: boolean; error?: string }> {
    try {
      const names = await this.localBranchNames()
      if (names.includes('develop')) return { success: true }
      const mainBranch = await this.detectMainBranch(names)
      await this.git.raw(['branch', 'develop', mainBranch])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async gitflowStart(type: 'feature' | 'release' | 'hotfix', name: string): Promise<{ success: boolean; error?: string }> {
    try {
      const names = await this.localBranchNames()
      const mainBranch = await this.detectMainBranch(names)
      const base = type === 'hotfix' ? mainBranch : 'develop'
      if (type !== 'hotfix' && !names.includes('develop')) {
        return { success: false, error: 'Gitflow not initialized (missing "develop" branch)' }
      }
      await this.git.raw(['checkout', '-b', `${type}/${name}`, base])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // `git merge --no-ff` does not throw on conflict (simple-git caveat). Run it and,
  // if it leaves the tree conflicted, abort so the repo isn't stranded mid-merge.
  // Returns an error message on conflict, or null on a clean merge.
  private async gitflowMerge(branch: string): Promise<string | null> {
    await this.git.raw(['merge', '--no-ff', branch, '-m', `Merge ${branch}`])
    if (await this.hasUnmergedPaths()) {
      await this.abortMerge()
      return `Conflict while merging ${branch} — operation aborted, repository unchanged`
    }
    return null
  }

  async gitflowFinish(type: 'feature' | 'release' | 'hotfix', name: string, tagName?: string): Promise<{ success: boolean; error?: string }> {
    const branch = `${type}/${name}`
    try {
      const names = await this.localBranchNames()
      const mainBranch = await this.detectMainBranch(names)

      if (type === 'feature') {
        await this.git.raw(['checkout', 'develop'])
        const conflict = await this.gitflowMerge(branch)
        if (conflict) return { success: false, error: conflict }
      } else {
        // release / hotfix → merge into main (+ tag) and into develop
        await this.git.raw(['checkout', mainBranch])
        const conflict = await this.gitflowMerge(branch)
        if (conflict) return { success: false, error: conflict }
        if (tagName) {
          await this.git.raw(['tag', '-a', tagName, '-m', tagName])
        }
        if (names.includes('develop')) {
          await this.git.raw(['checkout', 'develop'])
          const devConflict = await this.gitflowMerge(branch)
          if (devConflict) return { success: false, error: devConflict }
        }
      }
      await this.git.raw(['branch', '-d', branch])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // ── Worktrees ───────────────────────────────────────────────

  async listWorktrees(): Promise<{ worktrees: { path: string; branch: string; head: string; isMain: boolean; locked: boolean }[] }> {
    try {
      const result = await this.git.raw(['worktree', 'list', '--porcelain'])
      const worktrees: { path: string; branch: string; head: string; isMain: boolean; locked: boolean }[] = []
      let cur: { path: string; branch: string; head: string; locked: boolean } | null = null
      for (const line of result.split('\n')) {
        if (line.startsWith('worktree ')) {
          if (cur) worktrees.push({ ...cur, isMain: false })
          cur = { path: line.slice(9).trim(), branch: '', head: '', locked: false }
        } else if (cur && line.startsWith('HEAD ')) {
          cur.head = line.slice(5).trim().slice(0, 7)
        } else if (cur && line.startsWith('branch ')) {
          cur.branch = line.slice(7).trim().replace('refs/heads/', '')
        } else if (cur && line.trim() === 'detached') {
          cur.branch = '(detached)'
        } else if (cur && line.startsWith('locked')) {
          cur.locked = true
        }
      }
      if (cur) worktrees.push({ ...cur, isMain: false })
      // The first entry is the main working tree
      if (worktrees.length > 0) worktrees[0].isMain = true
      return { worktrees }
    } catch (e) {
      return { worktrees: [] }
    }
  }

  async addWorktree(path: string, ref: string, newBranch?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const args = ['worktree', 'add']
      if (newBranch) args.push('-b', newBranch)
      args.push(path)
      if (ref) args.push(ref)
      await this.git.raw(args)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async removeWorktree(path: string, force = false): Promise<{ success: boolean; error?: string }> {
    try {
      const args = ['worktree', 'remove']
      if (force) args.push('--force')
      args.push(path)
      await this.git.raw(args)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }
}
