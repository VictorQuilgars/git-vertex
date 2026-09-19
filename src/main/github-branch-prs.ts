// The pull requests a branch has carried — every state, newest first — for
// its card: the open one it is waiting on, or the merged one that took it in.
//
// The app only ever listed OPEN requests (fifty of them), so a branch whose
// request was merged a month ago said nothing about it, and a branch deleted
// on the remote by that merge offered to be published again.
//
// Free of electron and vscode, like git-core.ts: the desktop's main process
// and the extension host both ask GitHub the same question and read the answer
// the same way.

export type BranchPRState = 'open' | 'draft' | 'merged' | 'closed'

export interface BranchPR {
  number: number
  title: string
  state: BranchPRState
  url: string
  headRef: string
  /** The head's last commit when GitHub last saw it — for a merged request, what was merged. */
  headSha: string
  baseRef: string
  author: string
  updatedAt: string
  mergedAt: string | null
}

/**
 * `head` wants `owner:branch`, and a branch name can hold what a query string
 * does not survive: `release/app+ext-1.37.0` sent raw is `release/app ext-1.37.0`.
 */
export function branchPRsPath(owner: string, repo: string, branch: string): string {
  const head = encodeURIComponent(`${owner}:${branch}`)
  return `/repos/${owner}/${repo}/pulls?state=all&head=${head}&sort=updated&direction=desc&per_page=10`
}

export function toBranchPRs(data: unknown, branch: string): BranchPR[] {
  if (!Array.isArray(data)) return []
  return data
    .filter((pr: any) => pr && typeof pr.number === 'number' && pr.head?.ref === branch)
    .map((pr: any): BranchPR => ({
      number: pr.number,
      title: pr.title ?? '',
      state: pr.merged_at ? 'merged' : pr.state === 'open' ? (pr.draft ? 'draft' : 'open') : 'closed',
      url: pr.html_url ?? '',
      headRef: pr.head?.ref ?? '',
      headSha: pr.head?.sha ?? '',
      baseRef: pr.base?.ref ?? '',
      author: pr.user?.login ?? '',
      updatedAt: pr.updated_at ?? '',
      mergedAt: pr.merged_at ?? null,
    }))
}

/**
 * The one a branch's card speaks of: an open request first — it is what the
 * branch is waiting on — otherwise the most recent one.
 */
export function currentBranchPR(prs: readonly BranchPR[]): BranchPR | null {
  return prs.find(p => p.state === 'open' || p.state === 'draft') ?? prs[0] ?? null
}
