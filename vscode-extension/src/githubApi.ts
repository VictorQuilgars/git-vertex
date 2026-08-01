// githubApi.ts — GitHub REST calls for the extension host (PAT-based).
// Mirrors the desktop handlers in src/main/index.ts (github:list-prs /
// github:list-issues / github:create-pr / github:list-branches) so the shared
// GitHubPanel and PRModal work unchanged.

const HEADERS = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
})

/**
 * What an unhappy response means to the caller.
 *
 * 401 is the one that matters: a session VS Code handed us can be revoked from
 * github.com, or the grant withdrawn, and the token then fails while everything
 * on our side still believes it is signed in. Reported as `HTTP 401` it reached
 * the panel as a bare status code next to an avatar and a login. It is the same
 * situation as having no token at all, so it says so, and the shared UI already
 * knows how to show that: offer a way back in.
 *
 * 403 is deliberately NOT folded in. GitHub uses it for rate limiting and for
 * "your token is fine, you may not do this" — telling someone to sign in again
 * would send them round a loop that cannot help.
 */
function failure(res: { status: number }): { error: string } {
  return { error: res.status === 401 ? 'not_authenticated' : `HTTP ${res.status}` }
}

export async function githubListPRs(token: string | undefined, owner: string, repo: string): Promise<any> {
  if (!token) return { error: 'not_authenticated' }
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls?per_page=50&state=open`,
      { headers: HEADERS(token) },
    )
    if (!res.ok) return failure(res)
    const data = await res.json() as any[]
    return {
      prs: data.map(pr => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        draft: pr.draft,
        author: pr.user?.login ?? '',
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        comments: (pr.comments ?? 0) + (pr.review_comments ?? 0),
        labels: (pr.labels ?? []).map((l: any) => ({ name: l.name, color: l.color })),
        url: pr.html_url,
        headRef: pr.head?.ref ?? '',
        baseRef: pr.base?.ref ?? '',
      })),
    }
  } catch (e: any) { return { error: e.message } }
}

export async function githubListIssues(token: string | undefined, owner: string, repo: string): Promise<any> {
  if (!token) return { error: 'not_authenticated' }
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues?per_page=50&state=open`,
      { headers: HEADERS(token) },
    )
    if (!res.ok) return failure(res)
    const data = await res.json() as any[]
    // The issues endpoint also returns PRs — filter them out.
    const issues = data.filter((i: any) => !i.pull_request)
    return {
      issues: issues.map((issue: any) => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        author: issue.user?.login ?? '',
        createdAt: issue.created_at,
        comments: issue.comments,
        labels: (issue.labels ?? []).map((l: any) => ({ name: l.name, color: l.color })),
        url: issue.html_url,
      })),
    }
  } catch (e: any) { return { error: e.message } }
}

/**
 * One issue or pull request by number, for the `#123` hover card the shared
 * renderer puts on every commit message (IssueLink.tsx). Mirrors the desktop's
 * `github:get-issue`, including its shape — the tooltip reads `issue.isPR` and
 * `issue.merged` to pick its colour.
 *
 * The token is optional here, unlike every other call in this file: public
 * repositories answer unauthenticated, and a hover card that only works once
 * you have pasted a PAT is worse than one that works most of the time.
 */
export async function githubGetIssue(
  token: string | undefined, owner: string, repo: string, num: number,
): Promise<any> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    // The issues endpoint resolves both issues and PRs by number.
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${num}`, { headers })
    if (!res.ok) return failure(res)
    const d = await res.json() as any
    return {
      issue: {
        number: d.number,
        title: d.title,
        state: d.state,
        isPR: !!d.pull_request,
        merged: d.pull_request?.merged_at != null,
        url: d.html_url,
      },
    }
  } catch (e: any) { return { error: e.message } }
}

/**
 * Open a pull request. The head branch must already be on the remote — the
 * shared PRModal pushes it first, which is why its button says so.
 */
export async function githubCreatePR(
  token: string | undefined,
  owner: string, repo: string, title: string, body: string, head: string, base: string,
): Promise<any> {
  if (!token) return { error: 'not_authenticated' }
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: { ...HEADERS(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, head, base }),
    })
    const data = await res.json() as any
    if (!res.ok) {
      // A rejected PR comes back as a bare "Validation Failed"; everything that
      // tells you what to fix ("No commits between main and x", an unpublished
      // head branch) is in the errors array. Surface that instead — the desktop
      // shipped for a while without it and the message was unactionable.
      const detail = Array.isArray(data.errors)
        ? data.errors
            .map((e: any) => e.message ?? (e.field ? `${e.field}: ${e.code}` : null))
            .filter(Boolean)
            .join(' — ')
        : ''
      const msg = data.message ?? `HTTP ${res.status}`
      return { error: detail ? `${msg} (${detail})` : msg }
    }
    return { url: data.html_url, number: data.number }
  } catch (e: any) { return { error: e.message } }
}

/** Branches the remote holds — the base selector of the PR composer. */
export async function githubListBranches(
  token: string | undefined, owner: string, repo: string,
): Promise<{ branches: string[] }> {
  if (!token) return { branches: [] }
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`,
      { headers: HEADERS(token) },
    )
    if (!res.ok) return { branches: [] }
    const data = await res.json() as any[]
    return { branches: data.map(b => b.name) }
  } catch { return { branches: [] } }
}
