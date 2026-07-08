import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const MAX_RECENT = 12

function getFilePath(): string {
  return join(app.getPath('userData'), 'recent-repos.json')
}

export function getRecentRepos(): string[] {
  try {
    const fp = getFilePath()
    if (!existsSync(fp)) return []
    return JSON.parse(readFileSync(fp, 'utf-8'))
  } catch {
    return []
  }
}

export function addRecentRepo(repoPath: string): string[] {
  const repos = getRecentRepos().filter(r => r !== repoPath)
  repos.unshift(repoPath)
  const trimmed = repos.slice(0, MAX_RECENT)
  try {
    writeFileSync(getFilePath(), JSON.stringify(trimmed, null, 2))
  } catch {}
  return trimmed
}

export function removeRecentRepo(repoPath: string): string[] {
  const repos = getRecentRepos().filter(r => r !== repoPath)
  try {
    writeFileSync(getFilePath(), JSON.stringify(repos, null, 2))
  } catch {}
  return repos
}

// ── Workspaces ─────────────────────────────────────────────────
// Named groups over the recent repos: a simple { repoPath: workspaceName }
// map in its own file, so the recent-repos format stays untouched.
function getWorkspacesPath(): string {
  return join(app.getPath('userData'), 'workspaces.json')
}

export function getWorkspaces(): Record<string, string> {
  try {
    const fp = getWorkspacesPath()
    if (!existsSync(fp)) return {}
    return JSON.parse(readFileSync(fp, 'utf-8'))
  } catch {
    return {}
  }
}

// Empty name removes the repo from its workspace.
export function setRepoWorkspace(repoPath: string, workspace: string): Record<string, string> {
  const map = getWorkspaces()
  if (workspace.trim()) map[repoPath] = workspace.trim()
  else delete map[repoPath]
  try {
    writeFileSync(getWorkspacesPath(), JSON.stringify(map, null, 2))
  } catch {}
  return map
}
