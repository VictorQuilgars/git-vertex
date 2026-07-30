// Reading and comparing git's version.
//
// Its own module so that git-binary.ts can use it without importing
// git-service.ts, which imports git-binary.ts in turn. git-service re-exports
// all three names, so every existing importer keeps working.

// The conflict prediction shipped in v1.22 runs
// `git merge-tree --write-tree --merge-base=<commit>`, and --merge-base only
// landed in git 2.40. On anything older the call fails, predictConflicts returns
// an empty list and the caller proceeds — so the "a conflict is expected"
// warning silently never appears. macOS still ships 2.39, which makes that the
// default experience for anyone without a newer git, hence the startup notice.
export const MIN_GIT_FOR_CONFLICT_PREDICTION = '2.40'

// Accepts the vendor suffixes too, e.g. "git version 2.39.3 (Apple Git-146)".
export function parseGitVersion(output: string): string | null {
  const m = /git version (\d+)\.(\d+)(?:\.(\d+))?/.exec(output)
  return m ? `${m[1]}.${m[2]}.${m[3] ?? '0'}` : null
}

export function isGitVersionAtLeast(version: string, minimum: string): boolean {
  const have = version.split('.').map(n => parseInt(n, 10) || 0)
  const want = minimum.split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(have.length, want.length); i++) {
    const a = have[i] ?? 0
    const b = want[i] ?? 0
    if (a !== b) return a > b
  }
  return true
}
