// The GitHub API as this app uses it: the token, the remote, and the caches that keep it polite.
import { bypassVerdict, RULESET_PROBE_CAP } from './ruleset-bypass'
import { apiForUser, type GithubApi } from './github-host'
import { githubRepo } from '../renderer/src/utils/remoteUrl'
import { state } from './app-state'
import { readSettings } from './settings-store'

/**
 * The GitHub this repository belongs to, and the token that may be sent there.
 *
 * Every call below used to write `${api.base}` out by hand and read
 * one global token, which is why an Enterprise Server instance was unreachable:
 * it is the same API on the customer's own host, under `/api/v3`.
 *
 * The host follows the **open repository**, and is github.com when there is
 * none. That rule also settles the calls that are about the user rather than a
 * repository — asking github.com for `/user` while the repository lives on an
 * instance would answer with the wrong person.
 */
export async function currentRemoteUrl(): Promise<string | null> {
  if (!state.gitService) return null
  try {
    const remotes = await (state.gitService as any).git.getRemotes(true)
    const origin = remotes.find((r: any) => r.name === 'origin') ?? remotes[0]
    return origin?.refs?.fetch ?? origin?.refs?.push ?? null
  } catch { return null }
}

export async function ghApi(): Promise<GithubApi> {
  return apiForUser(readSettings(), await currentRemoteUrl())
}

// Resolve the GitHub owner/repo of the currently open repository.
export async function detectGithubRepo(): Promise<{ owner: string; repo: string } | null> {
  if (!state.gitService) return null
  try {
    const remotes = await (state.gitService as any).git.getRemotes(true)
    const origin = remotes.find((r: any) => r.name === 'origin') ?? remotes[0]
    if (!origin) return null
    const url: string = origin.refs?.fetch ?? origin.refs?.push ?? ''
    const { owner, repo } = githubRepo(url)
    if (!owner || !repo) return null
    return { owner, repo }
  } catch { return null }
}

// Cache email → avatar URL in the main process (persists for the app lifetime).
export const avatarCache = new Map<string, string>()

export const githubIdenticonUrl = (key: string) => {
  // GitHub's identicon generator: deterministic, colorful, matches github.com style.
  // Any string produces a unique colored pixel-art avatar — far better than Gravatar's default.
  const localPart = key.split('@')[0] || key
  return `https://github.com/identicons/${encodeURIComponent(localPart)}.png`
}

// Load the authenticated user's avatar + all their verified emails into the
// cache, once. This is the reliable path for the logged-in user's own commits
// (including unpushed ones, where the commits API 422s) and for private emails
// that the public search can't find. Memoized so we only hit the API once.
//
// ⚠️ `base` is a PARAMETER and must stay one. This function used to read a
// name `api` that exists in the caller and not here — a ReferenceError on
// every call, swallowed whole by the catch below, which then cleared the memo
// so the next call could fail the same way. The path never once worked, and
// nothing said so: avatars quietly fell through to the commits API. Found by
// the main-process typecheck this file now passes (#105).
export let authedEmailsLoaded: Promise<void> | null = null

export function loadAuthedUserEmails(base: string, token: string): Promise<void> {
  if (authedEmailsLoaded) return authedEmailsLoaded
  authedEmailsLoaded = (async () => {
    try {
      const userRes = await fetch(`${base}/user`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      })
      if (!userRes.ok) return
      const user: any = await userRes.json()
      const avatar: string | undefined = user?.avatar_url
      if (!avatar) return

      const emails = new Set<string>()
      if (user?.email) emails.add(String(user.email).trim().toLowerCase())

      const emailsRes = await fetch(`${base}/user/emails`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      })
      if (emailsRes.ok) {
        const list: any[] = await emailsRes.json()
        for (const e of list) if (e?.email) emails.add(String(e.email).trim().toLowerCase())
      }

      for (const e of emails) avatarCache.set(e, avatar)
    } catch {
      authedEmailsLoaded = null // allow a retry next time
    }
  })()
  return authedEmailsLoaded
}

/**
 * Conditional GETs for everything the app re-asks (#141).
 *
 * Every list endpoint answers with an ETag; sending it back as `If-None-Match`
 * returns 304 with no body — and MEASURED against api.github.com, five 304s in
 * a row cost nothing at all: x-ratelimit-remaining was 4997 before and 4997
 * after. That is what lets these be asked often rather than every five
 * minutes.
 *
 * The last body is kept beside the tag, so a 304 still answers with the data.
 * A caller that ignores `notModified` therefore behaves exactly as before; one
 * that reads it can leave its state — and the list the user is scrolling —
 * untouched.
 */
export const listCache = new Map<string, { etag: string; body: any }>()

export async function conditionalGet<T extends object>(
  key: string, url: string, token: string, shape: (data: any) => T | Promise<T>,
): Promise<(T & { notModified?: true }) | { error: string }> {
  const hit = listCache.get(key)
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      ...(hit ? { 'If-None-Match': hit.etag } : {}),
    },
  })
  if (res.status === 304 && hit) return { ...hit.body, notModified: true as const }
  if (!res.ok) return { error: `HTTP ${res.status}` }
  const body = await shape(await res.json())
  const etag = res.headers?.get?.('etag')
  if (etag) listCache.set(key, { etag, body })
  return body
}

/**
 * What REST does not say about a blocked request: WHY (reviewDecision), and
 * where THIS VIEWER stands against it — may they merge at all, and may they
 * bypass the rule. One `viewerPermission` answers both.
 *
 * The bypass is ASKED, not guessed: when the request is blocked, the rulesets
 * protecting the base branch are read, and each one carries GitHub's own
 * `current_user_can_bypass` — the answer computed against this account's
 * roles, teams and apps, which no permission level can stand in for. See
 * `rulesetBypass`. Only when that cannot be read does the old approximation
 * remain: viewerPermission ADMIN, since viewerCanMergeAsAdmin is about
 * classic branch protection and stays false for ruleset bypassers (measured).
 *
 * `canMerge` is WRITE and above, and is `null` — not `false` — when the
 * query fails: an unknown permission must not take the button away from
 * someone who has it. Unknown reads as today's behaviour, GitHub judging at
 * the click; only a MEASURED lack of permission is stated in the pane.
 */
/**
 * The supplement is five requests on a blocked request — GraphQL, the branch's
 * rules, and one per ruleset — and the detail pane now re-asks every few
 * seconds while it waits (#141). Rulesets and repository permissions do not
 * change on that timescale, so the answer is held briefly: it turns a poll on
 * a blocked request from five requests into one, which is also what stops a
 * burst of them from failing on the socket.
 */
export const supplementCache = new Map<string, { at: number; value: any }>()

export const SUPPLEMENT_TTL_MS = 60_000

export async function prBlockedSupplement(
  api: { base: string }, token: string, owner: string, repo: string, number: number,
  ctx: { blocked: boolean; baseRef: string },
): Promise<{ reviewDecision: string | null; canBypass: boolean; canMerge: boolean | null }> {
  const key = `${api.base}:${owner}/${repo}#${number}:${ctx.blocked}`
  const hit = supplementCache.get(key)
  if (hit && Date.now() - hit.at < SUPPLEMENT_TTL_MS) return hit.value
  try {
    const gqlUrl = api.base.endsWith('/api/v3')
      ? api.base.replace(/\/api\/v3$/, '/api/graphql')
      : `${api.base}/graphql`
    const res = await fetch(gqlUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      body: JSON.stringify({
        query: 'query($o: String!, $r: String!, $n: Int!) { repository(owner: $o, name: $r) { viewerPermission pullRequest(number: $n) { reviewDecision } } }',
        variables: { o: owner, r: repo, n: number },
      }),
    })
    const d = await res.json().catch(() => ({})) as any
    const repoNode = d?.data?.repository
    const perm: string | null = repoNode?.viewerPermission ?? null
    // The rulesets are only worth three requests when something is blocking;
    // an unblocked request never shows the line they would feed.
    const asked = ctx.blocked
      ? await rulesetBypass(api, token, owner, repo, ctx.baseRef)
      : null
    const value = {
      reviewDecision: repoNode?.pullRequest?.reviewDecision ?? null,
      canBypass: asked ?? perm === 'ADMIN',
      canMerge: perm === null ? null : MERGE_PERMISSIONS.includes(perm),
    }
    supplementCache.set(key, { at: Date.now(), value })
    return value
    // A failure is NOT cached: the next poll should ask again rather than
    // repeat a shrug for a minute.
  } catch { return { reviewDecision: null, canBypass: false, canMerge: null } }
}

/** The `viewerPermission` values GitHub lets merge a request. */
export const MERGE_PERMISSIONS = ['ADMIN', 'MAINTAIN', 'WRITE']

/**
 * May this account bypass the rules protecting `baseRef`? GitHub answers it
 * itself: every ruleset carries `current_user_can_bypass`, resolved against
 * the account's repository role, its teams and the apps it acts through —
 * none of which a permission level can stand in for. What the answers mean
 * together is `bypassVerdict`, shared with the extension host.
 */
export async function rulesetBypass(
  api: { base: string }, token: string, owner: string, repo: string, baseRef: string,
): Promise<boolean | null> {
  if (!baseRef) return null
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
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

// User-centric Launchpad feed: one GitHub search across ALL of the user's
// repos (not just the recent/local ones). `q` is a GitHub
// issue-search query, e.g. "is:open is:pr author:@me".
// The search API is capped at 30 req/min, and the Launchpad remounts on every
// tab switch, so results are cached (20s TTL, force to bypass) to avoid
// burning through the limit and silently showing an empty list.
export const searchCache = new Map<string, { ts: number; data: any }>()
