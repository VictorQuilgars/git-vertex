// gitService.ts — All git operations for the VS Code extension host.
// Uses simple-git (no Electron dependency).

import simpleGit, { SimpleGit, BranchSummary } from 'simple-git'
import { CommitNode, BranchInfo, FileChange, WorkingChanges } from './types'

export class GitService {
  private git: SimpleGit
  public repoPath: string

  // Redo stack: HEAD shas captured before each undo. Undo is a soft reset
  // (non-destructive), so redo just soft-resets forward to the saved sha.
  // Cleared when a new commit is made.
  private redoStack: string[] = []

  constructor(repoPath: string) {
    this.repoPath = repoPath
    this.git = simpleGit(repoPath)
  }

  async checkRepo(): Promise<void> {
    const isRepo = await this.git.checkIsRepo()
    if (!isRepo) throw new Error('Not a Git repository')
  }

  private assertRef(ref: string, label = 'reference'): string | null {
    if (typeof ref !== 'string' || !ref.trim()) return `Empty git ${label}`
    if (ref.trim().startsWith('-')) return `Invalid git ${label}: "${ref}"`
    return null
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

  private async hasUnmergedPaths(): Promise<boolean> {
    try {
      const out = await this.git.raw(['ls-files', '--unmerged'])
      return out.trim().length > 0
    } catch {
      return false
    }
  }

  // ── Read operations ────────────────────────────────────────────

  async getLog(options: { maxCount?: number; all?: boolean } = {}): Promise<{ commits: CommitNode[] }> {
    // Freshly-initialized repo (no commit yet): plain `git log` exits 128.
    // An empty history is a valid state — the UI shows the WIP node so the
    // user can stage and create the very first commit.
    if (!(await this.hasHead())) return { commits: [] }
    const maxCount = options.maxCount ?? 300
    const args: string[] = [
      '--pretty=format:%H|%P|%s|%an|%ae|%ai|%D|%G?',
      `--max-count=${maxCount}`,
      '--date-order',
    ]
    if (options.all) args.push('--all')

    const result = await this.git.raw(['log', ...args])
    const commits: CommitNode[] = []

    for (const line of result.trim().split('\n')) {
      if (!line.trim()) continue
      const [hash, parentStr, message, author, authorEmail, date, refsStr, sigStr] = line.split('|')
      const parents = parentStr ? parentStr.trim().split(' ').filter(Boolean) : []
      const refs = refsStr
        ? refsStr.split(',').map(r => r.trim()).filter(r => r.length > 0)
        : []
      commits.push({
        hash: hash.trim(),
        shortHash: hash.trim().slice(0, 7),
        message: message || '(no message)',
        author: author || '',
        authorEmail: authorEmail || '',
        date: date || '',
        parents,
        refs,
        signature: (sigStr || 'N').trim()
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

  async getCommitFiles(commitHash: string): Promise<{ files: FileChange[] }> {
    try {
      const [nameStatus, numStat] = await Promise.all([
        this.git.raw(['diff-tree', '--no-commit-id', '-r', '--root', '--name-status', commitHash]),
        this.git.raw(['diff-tree', '--no-commit-id', '-r', '--root', '--numstat', commitHash]),
      ])
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
    } catch {
      return { files: [] }
    }
  }

  async getDiff(commitHash: string): Promise<{ diff: string }> {
    try {
      const parents = await this.git.raw(['log', '--pretty=format:%P', '-n', '1', commitHash])
      const parentList = parents.trim().split(' ').filter(Boolean)
      let diff: string
      if (parentList.length > 0) {
        diff = await this.git.raw(['diff', `${parentList[0]}..${commitHash}`])
      } else {
        diff = await this.git.raw(['show', commitHash, '--pretty=format:', '--no-color'])
      }
      return { diff }
    } catch {
      return { diff: '' }
    }
  }

  async getWorkingChanges(): Promise<WorkingChanges> {
    try {
      const status = await this.git.status()
      const staged: { path: string; status: string }[] = []
      const seen = new Set<string>()

      for (const f of status.files) {
        const index = f.index.trim()
        const path = f.path
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
          const s = working === 'D' ? 'D' : working === 'A' ? 'A' : 'M'
          unstaged.push({ path, status: s })
        }
        if ((working === 'U' || index === 'U') && !seenU.has(path)) {
          seenU.add(path)
          unstaged.push({ path, status: '!' })
        }
      }

      return { staged, unstaged, untracked: status.not_added }
    } catch {
      return { staged: [], unstaged: [], untracked: [] }
    }
  }

  async getWorkingFileDiff(filepath: string, staged: boolean): Promise<{ diff: string }> {
    try {
      const args = staged ? ['diff', '--cached', '--', filepath] : ['diff', '--', filepath]
      const diff = await this.git.raw(args)
      return { diff }
    } catch {
      return { diff: '' }
    }
  }

  // ── Write operations ───────────────────────────────────────────

  async stage(paths: string[]): Promise<{ success: boolean; error?: string }> {
    try {
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
      await this.git.raw(['reset', 'HEAD', '--', ...paths])
      return { success: true }
    } catch (e: any) {
      try {
        await this.git.raw(['restore', '--staged', '--', ...paths])
        return { success: true }
      } catch (e2: any) {
        return { success: false, error: e2.message }
      }
    }
  }

  async commit(message: string, amend = false): Promise<{ success: boolean; error?: string }> {
    try {
      // A new commit starts a fresh history line — previously undone actions
      // can no longer be coherently redone.
      this.redoStack = []
      if (amend) {
        await this.git.raw(['commit', '--amend', '-m', message])
      } else {
        const staged = await this.git.raw(['diff', '--cached', '--name-only'])
        if (!staged.trim()) return { success: false, error: 'Nothing to commit' }
        await this.git.raw(['commit', '-m', message])
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async discardFile(file: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Untracked files have no prior version to restore — delete them instead.
      const status = await this.git.status()
      const isUntracked = status.not_added.includes(file)
        || status.files.some(f => f.path === file && f.index === '?' && f.working_dir === '?')
      if (isUntracked) {
        await this.git.raw(['clean', '-fd', '--', file])
        return { success: true }
      }
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

  async checkout(ref: string): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(ref)
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

  async fetch(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.fetch(['--all', '--prune'])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async pull(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.pull()
      if (await this.hasUnmergedPaths()) {
        return { success: false, error: 'Pull produced merge conflicts' }
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async push(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.push()
      return { success: true }
    } catch (e: any) {
      const msg: string = e.message ?? ''
      if (msg.includes('no upstream') || msg.includes('set-upstream') || msg.includes('has no upstream')) {
        try {
          const status = await this.git.status()
          const branch = status.current ?? 'main'
          await this.git.raw(['push', '--set-upstream', 'origin', branch])
          return { success: true }
        } catch (e2: any) {
          return { success: false, error: e2.message }
        }
      }
      return { success: false, error: msg }
    }
  }

  async searchCommits(query: string): Promise<{ commits: CommitNode[] }> {
    try {
      const result = await this.git.raw([
        'log', '--all',
        `--pretty=format:%H|%P|%s|%an|%ae|%ai|%D|%G?`,
        '--max-count=100',
        `--grep=${query}`,
        '--regexp-ignore-case',
      ])
      const commits: CommitNode[] = []
      for (const line of result.trim().split('\n')) {
        if (!line.trim()) continue
        const [hash, parentStr, message, author, authorEmail, date, refsStr, sigStr] = line.split('|')
        const parents = parentStr ? parentStr.trim().split(' ').filter(Boolean) : []
        const refs = refsStr ? refsStr.split(',').map(r => r.trim()).filter(Boolean) : []
        commits.push({
          hash: hash.trim(),
          shortHash: hash.trim().slice(0, 7),
          message: message || '(no message)',
          author: author || '',
          authorEmail: authorEmail || '',
          date: date || '',
          parents,
          refs,
          signature: (sigStr || 'N').trim()
        })
      }
      return { commits }
    } catch {
      return { commits: [] }
    }
  }

  // ── Commit details ─────────────────────────────────────────────

  async getCommitBody(hash: string): Promise<{ body: string }> {
    try {
      const body = await this.git.raw(['log', '-n', '1', '--pretty=format:%b', hash])
      return { body: body.replace(/\n+$/, '') }
    } catch {
      return { body: '' }
    }
  }

  async getLastCommitMessage(): Promise<{ message: string }> {
    try {
      const message = await this.git.raw(['log', '-n', '1', '--pretty=format:%B', 'HEAD'])
      return { message: message.replace(/\n+$/, '') }
    } catch {
      return { message: '' }
    }
  }

  async getMergeMessage(): Promise<{ message: string }> {
    try {
      const fs = require('fs') as typeof import('fs')
      const path = require('path') as typeof import('path')
      const p = path.join(this.repoPath, '.git', 'MERGE_MSG')
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8')
        // Strip comment lines git adds
        const message = raw.split('\n').filter(l => !l.startsWith('#')).join('\n').trim()
        return { message }
      }
    } catch { /* ignore */ }
    return { message: '' }
  }

  async amendMessage(message: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['commit', '--amend', '-m', message])
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async getFileHistory(filepath: string): Promise<{ commits: { hash: string; shortHash: string; message: string; author: string; date: string }[] }> {
    try {
      const out = await this.git.raw([
        'log', '--follow', '--max-count=80',
        '--pretty=format:%H|%s|%an|%ai', '--', filepath,
      ])
      const commits = out.trim().split('\n').filter(Boolean).map(line => {
        const [hash, message, author, date] = line.split('|')
        return { hash, shortHash: hash.slice(0, 7), message: message || '', author: author || '', date: date || '' }
      })
      return { commits }
    } catch {
      return { commits: [] }
    }
  }

  async getBlame(commitHash: string, filepath: string): Promise<{ lines: { hash: string; shortHash: string; author: string; date: string; lineNum: number; content: string }[] }> {
    try {
      const out = await this.git.raw(['blame', '--line-porcelain', commitHash, '--', filepath])
      const lines: { hash: string; shortHash: string; author: string; date: string; lineNum: number; content: string }[] = []
      const raw = out.split('\n')
      let cur: any = {}
      let lineNum = 0
      for (let i = 0; i < raw.length; i++) {
        const line = raw[i]
        const headerMatch = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/)
        if (headerMatch) {
          cur = { hash: headerMatch[1], lineNum: parseInt(headerMatch[2], 10) }
        } else if (line.startsWith('author ')) {
          cur.author = line.slice(7)
        } else if (line.startsWith('author-time ')) {
          cur.date = new Date(parseInt(line.slice(12), 10) * 1000).toLocaleDateString()
        } else if (line.startsWith('\t')) {
          lineNum++
          lines.push({
            hash: cur.hash ?? '',
            shortHash: (cur.hash ?? '').slice(0, 7),
            author: cur.author ?? '',
            date: cur.date ?? '',
            lineNum: cur.lineNum ?? lineNum,
            content: line.slice(1),
          })
        }
      }
      return { lines }
    } catch {
      return { lines: [] }
    }
  }

  // ── Stashes / tags ─────────────────────────────────────────────

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

  async popStash(index: number): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['stash', 'pop', `stash@{${index}}`])
    } catch (e: any) {
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

  async applyStash(index: number): Promise<{ success: boolean; error?: string }> {
    try {
      await this.git.raw(['stash', 'apply', `stash@{${index}}`])
    } catch (e: any) {
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

  async dropStash(index: number): Promise<{ success: boolean; error?: string }> {
    try { await this.git.raw(['stash', 'drop', `stash@{${index}}`]); return { success: true } }
    catch (e: any) { return { success: false, error: e.message } }
  }

  async getStashDiff(index: number): Promise<{ diff: string }> {
    const ref = `stash@{${index}}`
    try {
      return { diff: await this.git.raw(['stash', 'show', '-p', '--include-untracked', ref]) }
    } catch {
      try { return { diff: await this.git.raw(['stash', 'show', '-p', ref]) } }
      catch { return { diff: '' } }
    }
  }

  async undoLastAction(): Promise<{ success: boolean; error?: string; action?: string }> {
    // Best-effort: soft-reset to the previous HEAD position (like `git reset --soft HEAD@{1}`).
    try {
      const before = (await this.git.revparse(['HEAD'])).trim()
      await this.git.raw(['reset', '--soft', 'HEAD@{1}'])
      this.redoStack.push(before)
      return { success: true, action: 'Action annulée' }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // Redo the last undone action: soft-reset forward to the saved HEAD.
  async redoLastAction(): Promise<{ success: boolean; error?: string; action?: string }> {
    const target = this.redoStack.pop()
    if (!target) return { success: false, error: 'Rien à rétablir' }
    try {
      await this.git.raw(['cat-file', '-e', `${target}^{commit}`])
      await this.git.raw(['reset', '--soft', target])
      return { success: true, action: 'Action rétablie' }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async getStashes(): Promise<{ stashes: { index: number; message: string }[] }> {
    try {
      const out = await this.git.raw(['stash', 'list', '--pretty=format:%gd|%s'])
      const stashes = out.trim().split('\n').filter(Boolean).map((line, i) => {
        const [, message] = line.split('|')
        return { index: i, message: message || `stash@{${i}}` }
      })
      return { stashes }
    } catch {
      return { stashes: [] }
    }
  }

  async getTags(): Promise<{ tags: { name: string; hash: string }[] }> {
    try {
      const out = await this.git.raw(['tag', '--format=%(refname:short)|%(objectname)'])
      const tags = out.trim().split('\n').filter(Boolean).map(line => {
        const [name, hash] = line.split('|')
        return { name, hash: hash || '' }
      })
      return { tags }
    } catch {
      return { tags: [] }
    }
  }

  // ── Conflict / tracking state ──────────────────────────────────

  async getConflictedFiles(): Promise<{ files: string[] }> {
    try {
      const out = await this.git.raw(['diff', '--name-only', '--diff-filter=U'])
      return { files: out.trim().split('\n').filter(Boolean) }
    } catch {
      return { files: [] }
    }
  }

  async getConflictMode(): Promise<{ mode: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null }> {
    try {
      const fs = require('fs') as typeof import('fs')
      const path = require('path') as typeof import('path')
      const g = path.join(this.repoPath, '.git')
      if (fs.existsSync(path.join(g, 'MERGE_HEAD'))) return { mode: 'merge' }
      if (fs.existsSync(path.join(g, 'rebase-merge')) || fs.existsSync(path.join(g, 'rebase-apply'))) return { mode: 'rebase' }
      if (fs.existsSync(path.join(g, 'CHERRY_PICK_HEAD'))) return { mode: 'cherry-pick' }
      if (fs.existsSync(path.join(g, 'REVERT_HEAD'))) return { mode: 'revert' }
    } catch { /* ignore */ }
    return { mode: null }
  }

  async getTracking(): Promise<{ branch: string; upstream: string; ahead: number; behind: number }> {
    try {
      const branch = (await this.git.raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
      let upstream = ''
      try { upstream = (await this.git.raw(['rev-parse', '--abbrev-ref', '@{u}'])).trim() } catch { /* none */ }
      let ahead = 0, behind = 0
      if (upstream) {
        const raw = (await this.git.raw(['rev-list', '--left-right', '--count', '@{u}...HEAD'])).trim()
        const [b, a] = raw.split('\t').map(Number)
        behind = b || 0; ahead = a || 0
      }
      return { branch, upstream, ahead, behind }
    } catch {
      return { branch: '', upstream: '', ahead: 0, behind: 0 }
    }
  }

  // ── Commit operations ──────────────────────────────────────────

  async cherryPick(hash: string): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(hash); if (bad) return { success: false, error: bad }
    try {
      await this.git.raw(['cherry-pick', hash])
      if (await this.hasUnmergedPaths()) {
        return { success: false, error: 'Cherry-pick conflict — resolve conflicts before continuing' }
      }
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  }

  async revert(hash: string): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(hash); if (bad) return { success: false, error: bad }
    try {
      // Reverting a merge commit requires -m to pick the mainline parent.
      const parentStr = (await this.git.raw(['log', '--pretty=format:%P', '-n', '1', hash])).trim()
      const parents = parentStr ? parentStr.split(/\s+/).filter(Boolean) : []
      const mainline = parents.length > 1 ? ['-m', '1'] : []
      await this.git.raw(['revert', '--no-edit', ...mainline, hash])
      if (await this.hasUnmergedPaths()) {
        return { success: false, error: 'Revert conflict — resolve conflicts before continuing' }
      }
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  }

  async reset(hash: string, mode: 'soft' | 'mixed' | 'hard'): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(hash); if (bad) return { success: false, error: bad }
    try { await this.git.raw(['reset', `--${mode}`, hash]); return { success: true } }
    catch (e: any) { return { success: false, error: e.message } }
  }

  async createTag(name: string, hash?: string, message?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const args = ['tag']
      if (message) args.push('-a', name, '-m', message)
      else args.push(name)
      if (hash) args.push(hash)
      await this.git.raw(args)
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  }

  async deleteTag(name: string): Promise<{ success: boolean; error?: string }> {
    try { await this.git.raw(['tag', '-d', name]); return { success: true } }
    catch (e: any) { return { success: false, error: e.message } }
  }

  async pushTag(name: string, remote = 'origin'): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(name, 'tag'); if (bad) return { success: false, error: bad }
    try { await this.git.raw(['push', remote, `refs/tags/${name}`]); return { success: true } }
    catch (e: any) { return { success: false, error: e.message } }
  }

  async deleteRemoteTag(name: string, remote = 'origin'): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(name, 'tag'); if (bad) return { success: false, error: bad }
    try { await this.git.raw(['push', remote, `:refs/tags/${name}`]); return { success: true } }
    catch (e: any) { return { success: false, error: e.message } }
  }

  async createBranchAt(name: string, hash: string, checkout: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      if (checkout) await this.git.raw(['checkout', '-b', name, hash])
      else await this.git.raw(['branch', name, hash])
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  }

  // ── History-rewriting helpers (ported from the desktop GitService) ──

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
  private async abortRebaseIfInProgress(): Promise<boolean> {
    try {
      await this.git.raw(['rebase', '--abort'])
      return true
    } catch {
      return false
    }
  }

  // Move a branch ref to a commit. On the current branch this is a hard reset,
  // so it refuses when the working tree is dirty (avoids destroying work).
  async moveBranchTo(branch: string, hash: string): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(branch, 'branch') || this.assertRef(hash, 'commit')
    if (bad) return { success: false, error: bad }
    try {
      const status = await this.git.status()
      if (status.current === branch) {
        if (await this.isDirty()) {
          return { success: false, error: 'Modifications non commitées — commit ou stash avant de déplacer la branche courante' }
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

  async rebaseBranchOnto(branch: string, hash: string): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(branch, 'branch') || this.assertRef(hash, 'commit')
    if (bad) return { success: false, error: bad }
    try {
      await this.git.raw(['checkout', branch])
      await this.git.raw(['rebase', '--autostash', hash])
      return { success: true }
    } catch (e: any) {
      const aborted = await this.abortRebaseIfInProgress()
      return {
        success: false,
        error: aborted ? 'Conflit de rebase — opération annulée, branche inchangée' : e.message
      }
    }
  }

  async mergeCommitInto(branch: string, hash: string): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(branch, 'branch') || this.assertRef(hash, 'commit')
    if (bad) return { success: false, error: bad }
    try {
      await this.git.raw(['checkout', branch])
      await this.git.raw(['merge', hash])
      if (await this.hasUnmergedPaths()) {
        return { success: false, error: 'Conflit de merge — résolvez les conflits pour continuer' }
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // Commits in baseHash..HEAD, oldest → newest.
  private async buildPickSequence(baseHash: string): Promise<{ hash: string }[]> {
    const result = await this.git.raw(['log', '--pretty=format:%H', `${baseHash}..HEAD`])
    return result.trim().split('\n').filter(Boolean).map(h => ({ hash: h.trim() })).reverse()
  }

  // Run a pre-built rebase sequence via GIT_SEQUENCE_EDITOR (oldest → newest).
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
    const seqFile = path.join(tmpDir, `gitvertex-rebase-seq-${Date.now()}.txt`)
    const scriptFile = path.join(tmpDir, `gitvertex-rebase-editor-${Date.now()}.sh`)

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
      const aborted = await this.abortRebaseIfInProgress()
      const base = e.stderr ?? e.message
      return {
        success: false,
        error: aborted ? 'Conflit de rebase — opération annulée, historique inchangé' : base
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

  // direction 'up' = toward HEAD (newer), 'down' = toward root (older)
  async moveCommit(hash: string, direction: 'up' | 'down'): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(hash, 'commit')
    if (bad) return { success: false, error: bad }
    try {
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

  // Commits in baseHash..HEAD for the interactive-rebase editor (oldest → newest).
  async getRebaseSequence(baseHash: string): Promise<{ commits: { hash: string; shortHash: string; message: string }[] }> {
    try {
      const result = await this.git.raw(['log', '--pretty=format:%H|%s', `${baseHash}..HEAD`])
      const commits = result.trim().split('\n').filter(Boolean).map(line => {
        const [hash, ...rest] = line.split('|')
        return { hash: hash.trim(), shortHash: hash.trim().slice(0, 7), message: rest.join('|').trim() }
      }).reverse()
      return { commits }
    } catch {
      return { commits: [] }
    }
  }

  // Apply a full interactive-rebase sequence built in the UI.
  async interactiveRebase(sequence: { action: string; hash: string }[]): Promise<{ success: boolean; error?: string }> {
    if (!sequence.length) return { success: false, error: 'Séquence vide' }
    const fs = await import('fs')
    const path = await import('path')
    const os = await import('os')
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const execFileAsync = promisify(execFile)

    const tmpDir = os.tmpdir()
    const seqFile = path.join(tmpDir, `gitvertex-irebase-seq-${Date.now()}.txt`)
    const scriptFile = path.join(tmpDir, `gitvertex-irebase-editor-${Date.now()}.sh`)

    try {
      const seqContent = sequence.map(s => `${s.action} ${s.hash} commit`).join('\n') + '\n'
      fs.writeFileSync(seqFile, seqContent, 'utf8')
      const scriptContent = `#!/bin/sh\ncp "${seqFile}" "$1"\n`
      fs.writeFileSync(scriptFile, scriptContent, 'utf8')
      fs.chmodSync(scriptFile, 0o755)

      await execFileAsync('git', ['-C', this.repoPath, 'rebase', '-i', '--autostash', sequence[0].hash + '^'], {
        env: { ...process.env, GIT_SEQUENCE_EDITOR: scriptFile },
        timeout: 30000
      })
      return { success: true }
    } catch (e: any) {
      const aborted = await this.abortRebaseIfInProgress()
      return {
        success: false,
        error: aborted ? 'Conflit de rebase — opération annulée, historique inchangé' : (e.stderr ?? e.message)
      }
    } finally {
      try { fs.unlinkSync(seqFile) } catch {}
      try { fs.unlinkSync(scriptFile) } catch {}
    }
  }

  // ── Conflict resolution (ported from desktop GitService) ──────────

  async getConflictVersions(filepath: string): Promise<{ base: string; ours: string; theirs: string }> {
    const read = async (stage: string) => {
      try { return await this.git.raw(['show', `${stage}:${filepath}`]) } catch { return '' }
    }
    const [base, ours, theirs] = await Promise.all([read(':1'), read(':2'), read(':3')])
    return { base, ours, theirs }
  }

  async getFileContent(filepath: string): Promise<{ content: string; error?: string }> {
    try {
      const fs = require('fs') as typeof import('fs')
      const path = require('path') as typeof import('path')
      return { content: fs.readFileSync(path.join(this.repoPath, filepath), 'utf-8') }
    } catch (e: any) { return { content: '', error: e.message } }
  }

  async getFileAtCommit(commitHash: string, filepath: string): Promise<{ content: string; error?: string }> {
    const bad = this.assertRef(commitHash, 'commit hash'); if (bad) return { content: '', error: bad }
    try { return { content: await this.git.raw(['show', `${commitHash}:${filepath}`]) } }
    catch (e: any) { return { content: '', error: e.message } }
  }

  async markResolved(filepath: string): Promise<{ success: boolean; error?: string }> {
    try { await this.git.raw(['add', '--', filepath]); return { success: true } }
    catch (e: any) { return { success: false, error: e.message } }
  }

  async resolveConflict(filepath: string, content: string): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(filepath, 'file path'); if (bad) return { success: false, error: bad }
    try {
      const fs = require('fs') as typeof import('fs')
      const path = require('path') as typeof import('path')
      const abs = path.resolve(this.repoPath, filepath)
      const repoAbs = path.resolve(this.repoPath)
      if (abs !== repoAbs && !abs.startsWith(repoAbs + path.sep)) {
        return { success: false, error: 'Path escapes repository' }
      }
      fs.writeFileSync(abs, content, 'utf8')
      await this.git.raw(['add', '--', filepath])
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  }

  async resolveConflictWithSide(filepath: string, side: 'ours' | 'theirs'): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(filepath, 'file path'); if (bad) return { success: false, error: bad }
    try {
      await this.git.raw(['checkout', `--${side}`, '--', filepath])
      await this.git.raw(['add', '--', filepath])
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  }

  async continueRebase(): Promise<{ success: boolean; error?: string }> {
    try { await this.git.raw(['rebase', '--continue']); return { success: true } }
    catch (e: any) { return { success: false, error: e.message } }
  }

  async continueMerge(message?: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (message) { await this.git.commit(message); return { success: true } }
      await this.git.env({ ...process.env, GIT_EDITOR: 'true' }).raw(['merge', '--continue', '--no-edit'])
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  }

  async abortRebase(): Promise<{ success: boolean; error?: string }> {
    try { await this.git.raw(['rebase', '--abort']); return { success: true } }
    catch (e: any) { return { success: false, error: e.message } }
  }

  async abortMerge(): Promise<{ success: boolean; error?: string }> {
    try { await this.git.raw(['merge', '--abort']); return { success: true } }
    catch (e: any) { return { success: false, error: e.message } }
  }

  async continueCherryPick(): Promise<{ success: boolean; error?: string }> {
    try { await this.git.env({ ...process.env, GIT_EDITOR: 'true' }).raw(['cherry-pick', '--continue']); return { success: true } }
    catch (e: any) { return { success: false, error: e.stderr ?? e.message } }
  }

  async abortCherryPick(): Promise<{ success: boolean; error?: string }> {
    try { await this.git.raw(['cherry-pick', '--abort']); return { success: true } }
    catch (e: any) { return { success: false, error: e.message } }
  }

  async continueRevert(): Promise<{ success: boolean; error?: string }> {
    try { await this.git.env({ ...process.env, GIT_EDITOR: 'true' }).raw(['revert', '--continue']); return { success: true } }
    catch (e: any) { return { success: false, error: e.stderr ?? e.message } }
  }

  async abortRevert(): Promise<{ success: boolean; error?: string }> {
    try { await this.git.raw(['revert', '--abort']); return { success: true } }
    catch (e: any) { return { success: false, error: e.message } }
  }

  // ── Branch / remote operations (ported from desktop GitService) ───

  async renameBranch(oldName: string, newName: string): Promise<{ success: boolean; error?: string }> {
    try { await this.git.raw(['branch', '-m', oldName, newName]); return { success: true } }
    catch (e: any) { return { success: false, error: e.message } }
  }

  async merge(branch: string): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(branch, 'branch'); if (bad) return { success: false, error: bad }
    try {
      await this.git.raw(['merge', branch])
      if (await this.hasUnmergedPaths()) {
        return { success: false, error: 'Merge conflict — resolve conflicts before continuing' }
      }
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  }

  async rebaseOnto(branch: string): Promise<{ success: boolean; error?: string }> {
    const bad = this.assertRef(branch, 'branch'); if (bad) return { success: false, error: bad }
    try { await this.git.raw(['rebase', '--autostash', branch]); return { success: true } }
    catch (e: any) {
      const aborted = await this.abortRebaseIfInProgress()
      return { success: false, error: aborted ? 'Rebase conflict — operation aborted, your branch is unchanged' : e.message }
    }
  }

  async pushBranch(branch: string): Promise<{ success: boolean; error?: string }> {
    try { await this.git.raw(['push', '--set-upstream', 'origin', branch]); return { success: true } }
    catch (e: any) { return { success: false, error: e.message ?? String(e) } }
  }

  async pushTo(remote: string, branch: string, setUpstream: boolean, force = false): Promise<{ success: boolean; error?: string }> {
    try {
      const args: string[] = ['push']
      if (setUpstream) args.push('--set-upstream')
      if (force) args.push('--force-with-lease')
      args.push(remote, `HEAD:${branch}`)
      await this.git.raw(args)
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message ?? String(e) } }
  }

  async deleteRemoteBranch(branch: string): Promise<{ success: boolean; error?: string }> {
    try {
      const m = branch.match(/^remotes\/([^/]+)\/(.+)$/)
      const remote = m ? m[1] : 'origin'
      const name = m ? m[2] : branch
      await this.git.raw(['push', remote, '--delete', name])
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  }

  async setUpstream(branch: string, upstream?: string): Promise<{ success: boolean; error?: string }> {
    try {
      let target = upstream
      if (!target) {
        const remotes = (await this.git.raw(['remote'])).trim().split('\n').map(r => r.trim()).filter(Boolean)
        if (remotes.length === 0) return { success: false, error: 'Aucun remote configuré' }
        const preferred = remotes.includes('origin') ? 'origin' : remotes[0]
        target = `${preferred}/${branch}`
      }
      await this.git.raw(['branch', `--set-upstream-to=${target}`, branch])
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  }

  async getUpstream(): Promise<{ upstream: string | null }> {
    try {
      const result = await this.git.raw(['rev-parse', '--abbrev-ref', '@{u}'])
      return { upstream: result.trim() || null }
    } catch { return { upstream: null } }
  }

  async getStatus(): Promise<{ staged: string[]; unstaged: string[]; untracked: string[] }> {
    try {
      const status = await this.git.status()
      return { staged: status.staged, unstaged: status.modified, untracked: status.not_added }
    } catch { return { staged: [], unstaged: [], untracked: [] } }
  }

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
    } catch { return { remotes: [] } }
  }

  async addRemote(name: string, url: string): Promise<{ success: boolean; error?: string }> {
    try { await this.git.raw(['remote', 'add', name, url]); return { success: true } }
    catch (e: any) { return { success: false, error: e.message } }
  }

  async removeRemote(name: string): Promise<{ success: boolean; error?: string }> {
    try { await this.git.raw(['remote', 'remove', name]); return { success: true } }
    catch (e: any) { return { success: false, error: e.message } }
  }

  async renameRemote(oldName: string, newName: string): Promise<{ success: boolean; error?: string }> {
    try { await this.git.raw(['remote', 'rename', oldName, newName]); return { success: true } }
    catch (e: any) { return { success: false, error: e.message } }
  }

  async fetchRemote(name: string): Promise<{ success: boolean; error?: string }> {
    try { await this.git.raw(['fetch', name]); return { success: true } }
    catch (e: any) { return { success: false, error: e.message } }
  }

  // ── History / diff helpers (ported from desktop GitService) ───────

  async getReflog(): Promise<{ entries: { hash: string; ref: string; message: string; date: string }[] }> {
    try {
      const result = await this.git.raw(['reflog', '--pretty=format:%H|%gd|%gs|%ar', '--max-count=50'])
      const entries = result.trim().split('\n').filter(Boolean).map(line => {
        const [hash, ref, message, date] = line.split('|')
        return { hash: hash?.trim() ?? '', ref: ref?.trim() ?? '', message: message?.trim() ?? '', date: date?.trim() ?? '' }
      })
      return { entries }
    } catch { return { entries: [] } }
  }

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
        this.git.raw(['log', '--pretty=format:%H|%s', `${other}..${current}`]),
      ])
      return { ahead: parse(aheadRaw), behind: parse(behindRaw) }
    } catch { return { ahead: [], behind: [] } }
  }

  async diffBetweenCommits(fromHash: string, toHash: string): Promise<{ diff: string; error?: string }> {
    const bad = this.assertRef(fromHash, 'commit') || this.assertRef(toHash, 'commit')
    if (bad) return { diff: '', error: bad }
    try { return { diff: await this.git.raw(['diff', `${fromHash}..${toHash}`]) } }
    catch (e: any) { return { diff: '', error: e.message } }
  }

  async diffCommitToWorking(hash: string): Promise<{ diff: string }> {
    try { return { diff: await this.git.raw(['diff', hash]) } }
    catch { return { diff: '' } }
  }

  async searchInDiffs(query: string): Promise<{ hashes: string[] }> {
    try {
      const result = await this.git.raw(['log', '--all', '--pretty=format:%H', '-S', query, '--max-count=100'])
      return { hashes: result.trim().split('\n').filter(Boolean) }
    } catch { return { hashes: [] } }
  }

  // ── Avatar resolution (no network: deterministic GitHub avatars) ──

  avatarResolve(email: string, _sha?: string): string {
    const key = (email || '').trim().toLowerCase()
    // GitHub noreply emails encode the user id → real avatar
    const noreply = key.match(/^(?:(\d+)\+)?([^@]+)@users\.noreply\.github\.com$/)
    if (noreply && noreply[1]) {
      return `https://avatars.githubusercontent.com/u/${noreply[1]}?v=4`
    }
    // Fallback: GitHub-style colorful identicon (no Gravatar B/W default)
    const localPart = key.split('@')[0] || key
    return `https://github.com/identicons/${encodeURIComponent(localPart)}.png`
  }
}
