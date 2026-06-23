import { execSync, ExecSyncOptions } from 'child_process'

export interface GitInfo {
  branch: string
  ahead: number
  behind: number
  repoRoot: string
}

// Capture stdout, silence stderr — several of these commands legitimately fail
// (no upstream configured, detached HEAD during a rebase) and would otherwise
// spam the host console with "fatal: …" lines even though we handle the error.
const GIT_OPTS = (cwd: string): ExecSyncOptions => ({
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
})

export function getGitInfo(cwd: string): GitInfo | null {
  try {
    const root = String(execSync('git rev-parse --show-toplevel', GIT_OPTS(cwd))).trim()
    const branch = String(execSync('git rev-parse --abbrev-ref HEAD', GIT_OPTS(root))).trim()

    let ahead = 0
    let behind = 0
    try {
      const raw = String(execSync('git rev-list --left-right --count @{u}...HEAD', GIT_OPTS(root))).trim()
      const [b, a] = raw.split('\t').map(Number)
      behind = b ?? 0
      ahead = a ?? 0
    } catch { /* no upstream */ }

    return { branch, ahead, behind, repoRoot: root }
  } catch {
    return null
  }
}

export function getRepoRootForFile(filePath: string): string | null {
  try {
    const path = require('path')
    const dir = require('fs').statSync(filePath).isDirectory() ? filePath : path.dirname(filePath)
    return String(execSync('git rev-parse --show-toplevel', GIT_OPTS(dir))).trim()
  } catch {
    return null
  }
}
