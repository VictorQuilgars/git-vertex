// githubApi.ts — GitHub REST calls for the extension host (PAT-based).
// Mirrors the desktop handlers in src/main/index.ts (github:list-prs /
// github:list-issues / github:create-pr / github:list-branches) so the shared
// GitHubPanel and PRModal work unchanged.

const HEADERS = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
})

export async function githubListPRs(token: string | undefined, owner: string, repo: string): Promise<any> {
  if (!token) return { error: 'not_authenticated' }
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls?per_page=50&state=open`,
      { headers: HEADERS(token) },
    )
    if (!res.ok) return { error: `HTTP ${res.status}` }
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
    if (!res.ok) return { error: `HTTP ${res.status}` }
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
