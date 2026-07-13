import { execFileSync } from 'child_process'

// Resolve the git repository root for a starting directory (walks up).
export function resolveRepoRoot(startDir: string): string | null {
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: startDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return root || null
  } catch {
    return null
  }
}

export function repoName(root: string): string {
  const parts = root.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] ?? root
}
