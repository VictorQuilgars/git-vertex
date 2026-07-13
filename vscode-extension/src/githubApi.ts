// githubApi.ts — GitHub REST calls for the extension host (PAT-based).
// Mirrors the desktop handlers in src/main/index.ts (github:list-prs /
// github:list-issues) so the shared GitHubPanel works unchanged.

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
