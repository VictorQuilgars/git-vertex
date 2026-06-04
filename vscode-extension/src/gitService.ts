// gitService.ts — All git operations for the VS Code extension host.
// Uses simple-git (no Electron dependency).

import simpleGit, { SimpleGit, BranchSummary } from 'simple-git'
import { CommitNode, BranchInfo, FileChange, WorkingChanges } from './types'

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

  private assertRef(ref: string, label = 'reference'): string | null {
    if (typeof ref !== 'string' || !ref.trim()) return `Empty git ${label}`
    if (ref.trim().startsWith('-')) return `Invalid git ${label}: "${ref}"`
    return null
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
}
