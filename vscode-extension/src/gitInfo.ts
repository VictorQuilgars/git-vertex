import { execSync } from 'child_process'

export interface GitInfo {
  branch: string
  ahead: number
  behind: number
  repoRoot: string
}

export function getGitInfo(cwd: string): GitInfo | null {
  try {
    const root = execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf8' }).trim()
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: root, encoding: 'utf8' }).trim()

    let ahead = 0
    let behind = 0
    try {
      const raw = execSync('git rev-list --left-right --count @{u}...HEAD', { cwd: root, encoding: 'utf8' }).trim()
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
    return execSync('git rev-parse --show-toplevel', { cwd: dir, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}
