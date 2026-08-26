// githubApi.ts — GitHub REST calls for the extension host.
// Mirrors the desktop handlers in src/main/index.ts (github:list-prs /
// github:list-issues / github:create-pr / github:list-branches) so the shared
// GitHubPanel and PRModal work unchanged.
//
// Every call takes an `api`, not a bare token: a GitHub Enterprise Server
// instance is the same API on the customer's own host, under `/api/v3`, and it
// takes a credential of its own. Passing the two together is what stops one
// host's token from being sent to another — see src/main/github-host.ts, which
// resolves them on the desktop side for the same reason.

/** Where a GitHub answers, and what may be sent there. */
export interface GithubApi {
  base: string
  token?: string
}

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

/**
 * Conditional GETs for everything the panel re-asks — the desktop's twin (#141). Every
 * list endpoint answers with an ETag; replaying it as `If-None-Match` returns
 * 304, which costs no rate limit at all. The last body is kept beside the tag
 * so a 304 still answers with data: a caller ignoring `notModified` behaves as
 * before, one reading it leaves the list the user is scrolling alone.
 */
const listCache = new Map<string, { etag: string; body: any }>()

async function conditionalGet<T extends object>(
  key: string, url: string, token: string, shape: (data: any) => T | Promise<T>,
): Promise<(T & { notModified?: true }) | { error: string }> {
  const hit = listCache.get(key)
  const res = await fetch(url, {
    headers: { ...HEADERS(token), ...(hit ? { 'If-None-Match': hit.etag } : {}) },
  })
  if (res.status === 304 && hit) return { ...hit.body, notModified: true as const }
  // `failure` and not a bare status: 401 has to keep reading as
  // not_authenticated, or a revoked token sends the panel round a sign-in loop.
  if (!res.ok) return failure(res)
  const body = await shape(await res.json())
  const etag = res.headers?.get?.('etag')
  if (etag) listCache.set(key, { etag, body })
  return body
}

export async function githubListPRs(api: GithubApi, owner: string, repo: string): Promise<any> {
  if (!api.token) return { error: 'not_authenticated' }
  try {
    return await conditionalGet(
      `prs:${api.base}:${owner}/${repo}`,
      `${api.base}/repos/${owner}/${repo}/pulls?per_page=50&state=open`,
      api.token,
      (data: any[]) => ({
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
        body: pr.body ?? '',
        assignees: (pr.assignees ?? []).map((a: any) => a.login),
        reviewers: (pr.requested_reviewers ?? []).map((r: any) => r.login),
        url: pr.html_url,
        headRef: pr.head?.ref ?? '',
        baseRef: pr.base?.ref ?? '',
      })),
      }),
    )
  } catch (e: any) { return { error: e.message } }
}

export async function githubListIssues(api: GithubApi, owner: string, repo: string): Promise<any> {
  if (!api.token) return { error: 'not_authenticated' }
  try {
    return await conditionalGet(
      `issues:${api.base}:${owner}/${repo}`,
      `${api.base}/repos/${owner}/${repo}/issues?per_page=50&state=open`,
      api.token,
      // The issues endpoint also returns PRs — filter them out.
      (data: any[]) => ({
      issues: data.filter((i: any) => !i.pull_request).map((issue: any) => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        author: issue.user?.login ?? '',
        createdAt: issue.created_at,
        comments: issue.comments,
        labels: (issue.labels ?? []).map((l: any) => ({ name: l.name, color: l.color })),
        body: issue.body ?? '',
        assignees: (issue.assignees ?? []).map((a: any) => a.login),
        url: issue.html_url,
      })),
      }),
    )
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
  api: GithubApi, owner: string, repo: string, num: number,
): Promise<any> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (api.token) headers.Authorization = `Bearer ${api.token}`
  try {
    // The issues endpoint resolves both issues and PRs by number.
    const res = await fetch(`${api.base}/repos/${owner}/${repo}/issues/${num}`, { headers })
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
// `head` crosses repositories as `owner:branch` — the fork case (#130). GitHub
// reads the bare form as "this repository's branch", so same-repo callers
// change nothing.
export async function githubCreatePR(
  api: GithubApi,
  owner: string, repo: string, title: string, body: string, head: string, base: string,
  draft?: boolean,
): Promise<any> {
  if (!api.token) return { error: 'not_authenticated' }
  try {
    const res = await fetch(`${api.base}/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: { ...HEADERS(api.token), 'Content-Type': 'application/json' },
      // A refused `draft` (plan without draft PRs) comes back through the
      // errors array below, named — not swallowed.
      body: JSON.stringify({ title, body, head, base, draft: !!draft }),
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

/**
 * A fork's parent, or null — the composer offers it as a target (#130).
 * Every failure reads as "not a fork": a composer that cannot ask this
 * question still composes.
 */
export async function githubRepoParent(
  api: GithubApi, owner: string, repo: string,
): Promise<{ parent: { owner: string; repo: string; defaultBranch: string | null } | null }> {
  if (!api.token) return { parent: null }
  try {
    const res = await fetch(`${api.base}/repos/${owner}/${repo}`, { headers: HEADERS(api.token) })
    if (!res.ok) return { parent: null }
    const data = await res.json() as any
    return data.fork && data.parent
      ? {
          parent: {
            owner: data.parent.owner.login,
            repo: data.parent.name,
            defaultBranch: data.parent.default_branch ?? null,
          }
        }
      : { parent: null }
  } catch { return { parent: null } }
}

/** Branches the remote holds — the base selector of the PR composer. */
export async function githubListBranches(
  api: GithubApi, owner: string, repo: string,
): Promise<{ branches: string[] }> {
  if (!api.token) return { branches: [] }
  try {
    const res = await fetch(
      `${api.base}/repos/${owner}/${repo}/branches?per_page=100`,
      { headers: HEADERS(api.token) },
    )
    if (!res.ok) return { branches: [] }
    const data = await res.json() as any[]
    return { branches: data.map(b => b.name) }
  } catch { return { branches: [] } }
}

// ─────────────────────────────────────────────────────────────────────────────
// The six the panel used to answer `not-implemented` for.
//
// Everything above was written for a surface the panel already had. What
// follows was owed: it lived only in the desktop's IPC handlers, so the shared
// renderer could call it and the host had nothing to answer with. The REST half
// is here; the two that need a patch out of git are assembled by the host,
// which is the only side that has a repository.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A GitHub issue search — `is:open is:pr author:@me` and the like. This is the
 * only call here that can answer questions about the *user* rather than about
 * one repository, which is why the panel's saved filters and its "assigned to
 * me" groups all come through here.
 *
 * Cached for 20 s. The search API allows 30 requests a minute where the plain
 * list endpoints allow 5,000 an hour, and a panel that remounts on every tab
 * switch will spend that budget in a minute and then show an empty list with no
 * explanation. `force` is the refresh button.
 */
const searchCache = new Map<string, { ts: number; data: any }>()

/** Drop the cache. Exported for the close path, which invalidates every query. */
export function clearSearchCache(): void { searchCache.clear() }

export async function githubSearchIssues(
  api: GithubApi, q: string, force?: boolean,
): Promise<any> {
  if (!api.token) return { error: 'not_authenticated' }
  const hit = searchCache.get(q)
  if (!force && hit && Date.now() - hit.ts < 20_000) return hit.data
  try {
    const res = await fetch(
      `${api.base}/search/issues?q=${encodeURIComponent(q)}&per_page=50&sort=updated`,
      { headers: HEADERS(api.token) },
    )
    // 403 does NOT go through failure() here, and that is deliberate: on the
    // search endpoint it is the rate limit far more often than a permission,
    // and the reset header says how long to wait. Telling the caller "HTTP 403"
    // would lose the one piece of information that makes it actionable.
    if (res.status === 403 || res.status === 429) {
      const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000
      const secs = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 1000)) : 60
      return { error: 'rate_limited', retryIn: secs }
    }
    if (!res.ok) return failure(res)
    const data = await res.json() as any
    const result = {
      total: data.total_count ?? 0,
      items: (data.items ?? []).map((x: any) => {
        // A search result names its repository by API URL, not by owner/repo.
        const repo = (x.repository_url ?? '').split('/').slice(-2).join('/')
        return {
          type: x.pull_request ? 'pr' : 'issue',
          number: x.number,
          title: x.title,
          draft: x.draft ?? false,
          author: x.user?.login ?? '',
          authorAvatar: x.user?.avatar_url ?? '',
          createdAt: x.created_at,
          updatedAt: x.updated_at,
          comments: x.comments ?? 0,
          labels: (x.labels ?? []).map((l: any) => ({ name: l.name, color: l.color })),
          body: x.body ?? '',
          url: x.html_url,
          repo,
          repoUrl: `https://github.com/${repo}`,
        }
      }),
    }
    searchCache.set(q, { ts: Date.now(), data: result })
    return result
  } catch (e: any) { return { error: e.message } }
}

/**
 * Close an issue or a pull request — GitHub's issues endpoint closes both.
 * Every cached search is dropped afterwards: the thing just closed is in an
 * unknown number of them, and a list that still shows it reads as a failure.
 */
export async function githubCloseIssue(
  api: GithubApi, owner: string, repo: string, num: number,
): Promise<any> {
  if (!api.token) return { error: 'not_authenticated' }
  try {
    const res = await fetch(`${api.base}/repos/${owner}/${repo}/issues/${num}`, {
      method: 'PATCH',
      headers: { ...HEADERS(api.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'closed' }),
    })
    if (!res.ok) return failure(res)
    clearSearchCache()
    return { success: true }
  } catch (e: any) { return { error: e.message } }
}

// ── The PR detail (#110 §2): the request itself, and its checks ──────────────
// Mirrors of the desktop's two read handlers, same shapes.

export async function githubGetPR(
  api: GithubApi, owner: string, repo: string, num: number,
): Promise<any> {
  if (!api.token) return { error: 'not_authenticated' }
  try {
    return await conditionalGet(
      `pr:${api.base}:${owner}/${repo}#${num}`,
      `${api.base}/repos/${owner}/${repo}/pulls/${num}`,
      api.token,
      async (pr: any) => ({
      pr: {
        number: pr.number,
        title: pr.title,
        state: pr.state,
        merged: !!pr.merged,
        draft: !!pr.draft,
        author: pr.user?.login ?? '',
        createdAt: pr.created_at,
        body: pr.body ?? '',
        headRef: pr.head?.ref ?? '',
        headSha: pr.head?.sha ?? '',
        baseRef: pr.base?.ref ?? '',
        commits: pr.commits ?? 0,
        changedFiles: pr.changed_files ?? 0,
        additions: pr.additions ?? 0,
        deletions: pr.deletions ?? 0,
        mergeable: pr.mergeable,
        mergeableState: pr.mergeable_state ?? '',
        labels: (pr.labels ?? []).map((l: any) => ({ name: l.name, color: l.color })),
        assignees: (pr.assignees ?? []).map((a: any) => a.login),
        reviewers: (pr.requested_reviewers ?? []).map((r: any) => r.login),
        url: pr.html_url,
        ...(await prBlockedSupplement(api, owner, repo, num,
          { blocked: pr.mergeable_state === 'blocked', baseRef: pr.base?.ref ?? '' })),
      },
      }),
    )
  } catch (e: any) { return { error: e.message } }
}

/**
 * Why a request is blocked, and where this viewer stands against it — may
 * they merge, may they bypass. The desktop's twin. The bypass is ASKED of the
 * rulesets protecting the base branch (`rulesetBypass`), and only falls back
 * to viewerPermission ADMIN when they cannot be read — viewerCanMergeAsAdmin
 * stays false for ruleset bypassers (measured). `canMerge` is WRITE and
 * above, `null` when the query fails: an unknown permission must not take the
 * button from someone who has it.
 */
async function prBlockedSupplement(
  api: GithubApi, owner: string, repo: string, num: number,
  ctx: { blocked: boolean; baseRef: string },
): Promise<{ reviewDecision: string | null; canBypass: boolean; canMerge: boolean | null }> {
  try {
    const gqlUrl = api.base.endsWith('/api/v3')
      ? api.base.replace(/\/api\/v3$/, '/api/graphql')
      : `${api.base}/graphql`
    const res = await fetch(gqlUrl, {
      method: 'POST',
      headers: { ...HEADERS(api.token!), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'query($o: String!, $r: String!, $n: Int!) { repository(owner: $o, name: $r) { viewerPermission pullRequest(number: $n) { reviewDecision } } }',
        variables: { o: owner, r: repo, n: num },
      }),
    })
    const d = await res.json().catch(() => ({})) as any
    const repoNode = d?.data?.repository
    const perm: string | null = repoNode?.viewerPermission ?? null
    const asked = ctx.blocked
      ? await rulesetBypass(api, owner, repo, ctx.baseRef)
      : null
    return {
      reviewDecision: repoNode?.pullRequest?.reviewDecision ?? null,
      canBypass: asked ?? perm === 'ADMIN',
      canMerge: perm === null ? null : MERGE_PERMISSIONS.includes(perm),
    }
  } catch { return { reviewDecision: null, canBypass: false, canMerge: null } }
}

/** The `viewerPermission` values GitHub lets merge a request. */
const MERGE_PERMISSIONS = ['ADMIN', 'MAINTAIN', 'WRITE']

/** A repository with more protecting rulesets than this is not probed. */
const RULESET_PROBE_CAP = 10

/**
 * What a list of `current_user_can_bypass` values means — the twin of
 * `bypassVerdict` in src/main/ruleset-bypass.ts, which carries the reasoning
 * in full: `never` is the only no, ANY ruleset is enough, and an incomplete
 * answer is `null` rather than a refusal nobody measured.
 *
 * ⚠️ A COPY, and it has to be. Everything reachable from `src/test/**` is
 * compiled by tsconfig.test.json, which keeps `rootDir: ./src` so the emitted
 * tests land where the runners look for them — so a file the tests reach,
 * as this one is, may not import from outside `src/`. GitVertexHost.ts gets
 * to import ../../../src/main because no test reaches IT. Exported so the
 * suite can hold it to the same table as the desktop's original.
 */
export function bypassVerdict(verdicts: readonly (string | null)[]): boolean | null {
  if (!verdicts.length) return null
  if (verdicts.some(v => v === null)) return null
  return verdicts.some(v => v !== 'never')
}

/**
 * May this account bypass the rules protecting `baseRef`? The desktop's twin.
 * GitHub answers it itself, per ruleset, as `current_user_can_bypass`.
 */
async function rulesetBypass(
  api: GithubApi, owner: string, repo: string, baseRef: string,
): Promise<boolean | null> {
  if (!baseRef) return null
  const headers = HEADERS(api.token!)
  try {
    const res = await fetch(
      `${api.base}/repos/${owner}/${repo}/rules/branches/${encodeURIComponent(baseRef)}`,
      { headers },
    )
    if (!res.ok) return null
    const rules = await res.json().catch(() => null) as any
    if (!Array.isArray(rules)) return null
    const ids = [...new Set(rules.map(r => r?.ruleset_id).filter((n: any) => typeof n === 'number'))]
    if (!ids.length || ids.length > RULESET_PROBE_CAP) return null
    const verdicts = await Promise.all(ids.map(async id => {
      const r = await fetch(`${api.base}/repos/${owner}/${repo}/rulesets/${id}`, { headers })
      if (!r.ok) return null
      const d = await r.json().catch(() => null) as any
      const v = d?.current_user_can_bypass
      return typeof v === 'string' ? v : null
    }))
    return bypassVerdict(verdicts)
  } catch { return null }
}

/**
 * Merge the request — #73's P2. GitHub is the judge; its message is the error.
 *
 * ⚠️ GraphQL, not REST — the REST merge refuses a review-blocked request even
 * for a ruleset bypasser; the mergePullRequest mutation applies the bypass
 * (it is what `gh pr merge --admin` calls). Mirrors the desktop handler.
 */
export async function githubMergePR(
  api: GithubApi, owner: string, repo: string, num: number,
  method: 'merge' | 'squash' | 'rebase' = 'merge',
): Promise<any> {
  if (!api.token) return { error: 'not_authenticated' }
  try {
    const prRes = await fetch(`${api.base}/repos/${owner}/${repo}/pulls/${num}`, {
      headers: HEADERS(api.token),
    })
    if (!prRes.ok) return failure(prRes)
    const nodeId = ((await prRes.json()) as any).node_id
    const gqlUrl = api.base.endsWith('/api/v3')
      ? api.base.replace(/\/api\/v3$/, '/api/graphql')
      : `${api.base}/graphql`
    const res = await fetch(gqlUrl, {
      method: 'POST',
      headers: { ...HEADERS(api.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'mutation($id: ID!, $method: PullRequestMergeMethod!) { mergePullRequest(input: {pullRequestId: $id, mergeMethod: $method}) { pullRequest { merged } } }',
        variables: { id: nodeId, method: method.toUpperCase() },
      }),
    })
    const data = await res.json().catch(() => ({})) as any
    const gqlError = data?.errors?.[0]?.message
    if (!res.ok || gqlError) return { error: gqlError ?? `HTTP ${res.status}` }
    clearSearchCache()
    return { success: true }
  } catch (e: any) { return { error: e.message } }
}

export async function githubGetChecks(
  api: GithubApi, owner: string, repo: string, ref: string,
): Promise<any> {
  if (!api.token) return { error: 'not_authenticated' }
  try {
    return await conditionalGet(
      `checks:${api.base}:${owner}/${repo}@${ref}`,
      `${api.base}/repos/${owner}/${repo}/commits/${ref}/check-runs?per_page=100`,
      api.token,
      (data: any) => {
        const runs = (data.check_runs ?? []) as any[]
        const failed = runs.filter(r => r.conclusion && !['success', 'neutral', 'skipped'].includes(r.conclusion)).length
        const pending = runs.filter(r => r.status !== 'completed').length
        return { checks: { total: runs.length, passed: runs.length - failed - pending, failed, pending } }
      },
    )
  } catch (e: any) { return { error: e.message } }
}

// ── The issue detail (§3 bis): its reads and its writes ─────────────────────
// Mirrors of the desktop's five handlers, same shapes.

export async function githubIssueComments(
  api: GithubApi, owner: string, repo: string, num: number,
): Promise<any> {
  if (!api.token) return { error: 'not_authenticated' }
  try {
    return await conditionalGet(
      `comments:${api.base}:${owner}/${repo}#${num}`,
      `${api.base}/repos/${owner}/${repo}/issues/${num}/comments?per_page=100`,
      api.token,
      (data: any[]) => ({
        comments: data.map(c => ({
          author: c.user?.login ?? '',
          createdAt: c.created_at,
          body: c.body ?? '',
        })),
      }),
    )
  } catch (e: any) { return { error: e.message } }
}

export async function githubAddIssueComment(
  api: GithubApi, owner: string, repo: string, num: number, body: string,
): Promise<any> {
  if (!api.token) return { error: 'not_authenticated' }
  try {
    const res = await fetch(`${api.base}/repos/${owner}/${repo}/issues/${num}/comments`, {
      method: 'POST',
      headers: { ...HEADERS(api.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    if (!res.ok) return failure(res)
    return { success: true }
  } catch (e: any) { return { error: e.message } }
}

/**
 * One PATCH for every field the detail edits — title, body, state (which is
 * how reopen exists without a second verb), assignees, labels. Only the keys
 * present are sent, so a title edit does not rewrite the labels.
 */
export async function githubUpdateIssue(
  api: GithubApi, owner: string, repo: string, num: number,
  patch: { title?: string; body?: string; state?: 'open' | 'closed'; assignees?: string[]; labels?: string[] },
): Promise<any> {
  if (!api.token) return { error: 'not_authenticated' }
  try {
    const res = await fetch(`${api.base}/repos/${owner}/${repo}/issues/${num}`, {
      method: 'PATCH',
      headers: { ...HEADERS(api.token), 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) return failure(res)
    clearSearchCache()
    return { success: true }
  } catch (e: any) { return { error: e.message } }
}

/**
 * Review is asked for AFTER creation — the create endpoint does not take
 * reviewers, so the composer makes two calls and reports when the second
 * fails (#130).
 */
export async function githubRequestReviewers(
  api: GithubApi, owner: string, repo: string, number: number, reviewers: string[],
): Promise<any> {
  if (!api.token) return { error: 'not_authenticated' }
  try {
    const res = await fetch(`${api.base}/repos/${owner}/${repo}/pulls/${number}/requested_reviewers`, {
      method: 'POST',
      headers: { ...HEADERS(api.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewers }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as any
      return { error: data.message ?? `HTTP ${res.status}` }
    }
    return { success: true }
  } catch (e: any) { return { error: e.message } }
}

export async function githubListAssignees(
  api: GithubApi, owner: string, repo: string,
): Promise<any> {
  if (!api.token) return { error: 'not_authenticated' }
  try {
    const res = await fetch(
      `${api.base}/repos/${owner}/${repo}/assignees?per_page=100`,
      { headers: HEADERS(api.token) },
    )
    if (!res.ok) return failure(res)
    const data = await res.json() as any[]
    return { assignees: data.map((a: any) => a.login) }
  } catch (e: any) { return { error: e.message } }
}

export async function githubListRepoLabels(
  api: GithubApi, owner: string, repo: string,
): Promise<any> {
  if (!api.token) return { error: 'not_authenticated' }
  try {
    const res = await fetch(
      `${api.base}/repos/${owner}/${repo}/labels?per_page=100`,
      { headers: HEADERS(api.token) },
    )
    if (!res.ok) return failure(res)
    const data = await res.json() as any[]
    return { labels: data.map((l: any) => ({ name: l.name, color: l.color })) }
  } catch (e: any) { return { error: e.message } }
}

/** Every repository the account can reach, newest first. Paginated to the end. */
export async function githubListRepos(api: GithubApi): Promise<any> {
  if (!api.token) return { error: 'not_authenticated' }
  try {
    let repos: any[] = []
    let page = 1
    // A short page is the last page — GitHub sends no total for this endpoint.
    for (;;) {
      const res = await fetch(
        `${api.base}/user/repos?per_page=100&sort=updated&page=${page}`,
        { headers: HEADERS(api.token) },
      )
      if (!res.ok) return failure(res)
      const batch = await res.json() as any[]
      repos = repos.concat(batch)
      if (batch.length < 100) break
      page++
    }
    return {
      repos: repos.map(r => ({
        id: r.id,
        name: r.name,
        fullName: r.full_name,
        description: r.description ?? '',
        private: r.private,
        language: r.language ?? null,
        stars: r.stargazers_count,
        updatedAt: r.updated_at,
        cloneUrl: r.clone_url,
        sshUrl: r.ssh_url,
        // The composer picks a target repository's base from this (#130).
        defaultBranch: r.default_branch ?? null,
      })),
    }
  } catch (e: any) { return { error: e.message } }
}

/**
 * Share a patch as a SECRET gist under the user's own account, and hand back
 * the link. Secret means unlisted, not private: anyone with the link reads it,
 * which is what "have a look at this before I open the PR" needs, and deleting
 * the gist revokes it. No server of ours is involved.
 *
 * The caller supplies the patch text — producing it is git's job, and this file
 * has no repository.
 */
export async function githubCreateGist(
  api: GithubApi, description: string, filename: string, content: string,
): Promise<any> {
  if (!api.token) return { error: 'not_authenticated' }
  try {
    const res = await fetch(`${api.base}/gists`, {
      method: 'POST',
      headers: { ...HEADERS(api.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, public: false, files: { [filename]: { content } } }),
    })
    // 404 on this endpoint almost always means the token has no `gist` scope —
    // GitHub hides the endpoint rather than refusing it — so it is reported as
    // the missing scope rather than as a mysteriously absent URL.
    if (res.status === 404) return { error: 'gist_scope' }
    if (!res.ok) return failure(res)
    const data = await res.json() as any
    return { url: data.html_url }
  } catch (e: any) { return { error: e.message } }
}
