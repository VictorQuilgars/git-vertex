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
