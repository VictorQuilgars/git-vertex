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
}

export interface BranchInfo {
  name: string
  current: boolean
  remote: boolean
  commit: string
  label: string
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

  constructor(repoPath: string) {
    this.repoPath = repoPath
    this.git = simpleGit(repoPath)
  }

  async checkRepo(): Promise<void> {
    const isRepo = await this.git.checkIsRepo()
    if (!isRepo) throw new Error('Not a Git repository')
  }

  async getLog(options: { maxCount?: number; all?: boolean } = {}): Promise<{ commits: CommitNode[] }> {
    const maxCount = options.maxCount ?? 200
    const args: string[] = [
      '--pretty=format:%H|%P|%s|%an|%ae|%ai|%D',
      `--max-count=${maxCount}`
    ]
    if (options.all) args.push('--all')

    const result = await this.git.raw(['log', ...args])
    const commits: CommitNode[] = []

    for (const line of result.trim().split('\n')) {
      if (!line.trim()) continue
      const [hash, parentStr, message, author, authorEmail, date, refsStr] = line.split('|')
      const parents = parentStr ? parentStr.trim().split(' ').filter(Boolean) : []
      const refs = refsStr
        ? refsStr.split(',')
            .map(r => r.trim())
            .filter(r => r.length > 0 && r !== '')
        : []
      commits.push({
        hash: hash.trim(),
        shortHash: hash.trim().slice(0, 7),
        message: message || '(no message)',
        author: author || '',
        authorEmail: authorEmail || '',
        date: date || '',
        parents,
        refs
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
      const [nameStatus, numStat] = await Promise.all([
        this.git.raw(['diff-tree', '--no-commit-id', '-r', '--name-status', commitHash]),
        this.git.raw(['diff-tree', '--no-commit-id', '-r', '--numstat',     commitHash]),
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

  async getCommitBody(hash: string): Promise<{ body: string }> {
    try {
      const body = await this.git.raw(['show', '--format=%b', '--no-patch', hash])
      return { body: body.trim() }
    } catch { return { body: '' } }
  }

  async checkout(ref: string): Promise<{ success: boolean; error?: string }> {
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

  async fetch(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.fetch(['--all', '--prune'])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async pushTo(remote: string, branch: string, setUpstream: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      const args: string[] = ['push']
      if (setUpstream) args.push('--set-upstream')
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

  async commit(message: string, amend = false): Promise<{ success: boolean; error?: string }> {
    try {
      if (amend) {
        await this.git.raw(['commit', '--amend', '-m', message])
      } else {
        await this.git.raw(['commit', '-m', message])
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async discardFile(file: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Try restore first (git 2.23+), then checkout
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
    try {
      await this.git.raw(['cherry-pick', hash])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async revert(hash: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['revert', '--no-edit', hash])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async reset(hash: string, mode: 'soft' | 'mixed' | 'hard'): Promise<{ success: boolean; error?: string }> {
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
      return { success: false, error: e.stderr ?? e.message }
    } finally {
      try { fs.unlinkSync(seqFile) } catch {}
      try { fs.unlinkSync(scriptFile) } catch {}
    }
  }

  async dropCommit(hash: string): Promise<{ success: boolean; error?: string }> {
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
    try {
      // For 'down' we must include the older neighbour (hash^) in the sequence,
      // so we rebase from the grandparent. For 'up' the older bound is hash^.
      const base = direction === 'down' ? `${hash}^^` : `${hash}^`
      const picks = await this.buildPickSequence(base)
      const idx = picks.findIndex(p => p.hash.startsWith(hash) || hash.startsWith(p.hash))
      if (idx === -1) return { success: false, error: 'Commit introuvable' }
      const swapWith = direction === 'up' ? idx + 1 : idx - 1
      if (swapWith < 0 || swapWith >= picks.length) {
        return { success: false, error: 'Déplacement impossible' }
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

  async merge(branch: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['merge', branch])
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
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async popStash(index: number): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['stash', 'pop', `stash@{${index}}`])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async dropStash(index: number): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['stash', 'drop', `stash@{${index}}`])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
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

  async interactiveRebase(sequence: { action: string; hash: string }[]): Promise<{ success: boolean; error?: string }> {
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
      const seqContent = sequence.map(s => `${s.action} ${s.hash} commit`).join('\n') + '\n'
      fs.writeFileSync(seqFile, seqContent, 'utf8')
      // Editor script: just copies our pre-written sequence file
      const scriptContent = `#!/bin/sh\ncp "${seqFile}" "$1"\n`
      fs.writeFileSync(scriptFile, scriptContent, 'utf8')
      fs.chmodSync(scriptFile, 0o755)

      await execFileAsync('git', ['-C', this.repoPath, 'rebase', '-i', '--autostash', sequence[0].hash + '^'], {
        env: { ...process.env, GIT_SEQUENCE_EDITOR: scriptFile },
        timeout: 30000
      })
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.stderr ?? e.message }
    } finally {
      try { require('fs').unlinkSync(seqFile) } catch {}
      try { require('fs').unlinkSync(scriptFile) } catch {}
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

  async markResolved(filepath: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['add', '--', filepath])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async continueRebase(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['rebase', '--continue'])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async continueMerge(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['merge', '--continue', '--no-edit'])
      return { success: true }
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
}
