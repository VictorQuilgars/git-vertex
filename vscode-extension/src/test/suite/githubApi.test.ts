import * as assert from 'assert'
import {
  githubListPRs, githubListIssues, githubGetIssue,
  githubSearchIssues, githubCloseIssue, githubListRepos, githubCreateGist, clearSearchCache,
  bypassVerdict,
} from '../../githubApi'

// The first GitHub logic here with real coverage. githubApi.ts imports nothing
// from `vscode`, so unlike githubAuth.ts and GitVertexHost it runs in plain node
// — which is the whole reason the mapping below lives in this file rather than
// in the host.
//
// What it guards: a session VS Code handed us can be revoked from github.com, or
// its grant withdrawn, and the token then fails while every part of our own
// state still believes it is signed in. That surfaced as a bare `HTTP 401` in
// the panel, next to the avatar and login of the account it had just stopped
// working for.

/** github.com, authenticated — what every call took before Enterprise support. */
const API = { base: 'https://api.github.com', token: 'tok' }
/** The same, with nothing to authenticate with. */
const ANON = { base: 'https://api.github.com', token: undefined }

/** Answer the next fetch with this status, and restore the real one after. */
function withStatus(status: number, body: unknown = {}): () => void {
  const real = globalThis.fetch
  globalThis.fetch = (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof globalThis.fetch
  return () => { globalThis.fetch = real }
}

suite('githubApi — what an unhappy response means', () => {
  test('401 reads as not authenticated, not as a status code', async () => {
    const restore = withStatus(401)
    try {
      // Every call that can carry a live session, including the one whose token
      // is optional — a revoked token is worse than none, since it looks valid.
      assert.deepStrictEqual(await githubListPRs(API, 'o', 'r'), { error: 'not_authenticated' })
      assert.deepStrictEqual(await githubListIssues(API, 'o', 'r'), { error: 'not_authenticated' })
      assert.deepStrictEqual(await githubGetIssue(API, 'o', 'r', 1), { error: 'not_authenticated' })
    } finally { restore() }
  })

  // Rate limiting and "your token is fine, you may not do this" both come back
  // as 403. Folding it into not_authenticated would send the user round a
  // sign-in loop that cannot fix either.
  test('403 keeps its status — signing in again would not help', async () => {
    const restore = withStatus(403)
    try {
      assert.deepStrictEqual(await githubListPRs(API, 'o', 'r'), { error: 'HTTP 403' })
    } finally { restore() }
  })

  test('other failures keep their status', async () => {
    const restore = withStatus(500)
    try {
      assert.deepStrictEqual(await githubListIssues(API, 'o', 'r'), { error: 'HTTP 500' })
    } finally { restore() }
  })

  test('no token at all still short-circuits before any request', async () => {
    // No fetch stub on purpose: reaching the network here would be the bug.
    assert.deepStrictEqual(await githubListPRs(ANON, 'o', 'r'), { error: 'not_authenticated' })
  })
})

/**
 * A fetch that answers a scripted sequence and records what it was asked for.
 * The single-answer `withStatus` above cannot express what the calls below are
 * about: how many requests actually left, and in what order.
 */
function stubFetch(
  steps: Array<{ status?: number; body?: unknown; headers?: Record<string, string> }>,
): { calls: string[]; restore: () => void } {
  const real = globalThis.fetch
  const calls: string[] = []
  let i = 0
  globalThis.fetch = (async (url: any) => {
    calls.push(String(url))
    const step = steps[Math.min(i, steps.length - 1)]
    i++
    const status = step.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (k: string) => step.headers?.[k.toLowerCase()] ?? null },
      json: async () => step.body ?? {},
    }
  }) as unknown as typeof globalThis.fetch
  return { calls, restore: () => { globalThis.fetch = real } }
}

const repoPage = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i, name: `r${i}`, full_name: `o/r${i}` }))

suite('githubApi — searching, and not spending the rate limit on it', () => {
  setup(() => clearSearchCache())

  // The search endpoint allows 30 requests a minute where the plain list
  // endpoints allow 5,000 an hour, and the panel remounts on every tab switch.
  // Without the cache a few switches exhaust the budget, and what the user then
  // sees is an empty list rather than an error.
  test('the same query twice makes one request', async () => {
    const f = stubFetch([{ body: { total_count: 1, items: [] } }])
    try {
      await githubSearchIssues(API, 'is:open is:pr author:@me')
      await githubSearchIssues(API, 'is:open is:pr author:@me')
      assert.strictEqual(f.calls.length, 1)
    } finally { f.restore() }
  })

  test('force asks again — it is what a refresh button is for', async () => {
    const f = stubFetch([{ body: { total_count: 0, items: [] } }])
    try {
      await githubSearchIssues(API, 'is:open')
      await githubSearchIssues(API, 'is:open', true)
      assert.strictEqual(f.calls.length, 2)
    } finally { f.restore() }
  })

  test('a different query is a different entry', async () => {
    const f = stubFetch([{ body: { total_count: 0, items: [] } }])
    try {
      await githubSearchIssues(API, 'is:open is:pr')
      await githubSearchIssues(API, 'is:open is:issue')
      assert.strictEqual(f.calls.length, 2)
    } finally { f.restore() }
  })

  // 403 on this endpoint is the rate limit far more often than a permission,
  // and the reset header is the only thing that makes it actionable. Reported
  // as `HTTP 403` — which is what the shared failure() would say — the caller
  // has nothing to tell the user except a number.
  test('a rate limit says how long to wait, not which status it got', async () => {
    const reset = Math.floor(Date.now() / 1000) + 30
    const f = stubFetch([{ status: 403, headers: { 'x-ratelimit-reset': String(reset) } }])
    try {
      const res = await githubSearchIssues(API, 'is:open')
      assert.strictEqual(res.error, 'rate_limited')
      assert.ok(res.retryIn >= 29 && res.retryIn <= 31, `retryIn was ${res.retryIn}`)
    } finally { f.restore() }
  })

  test('a rate limit with no reset header still says something usable', async () => {
    const f = stubFetch([{ status: 429 }])
    try {
      assert.deepStrictEqual(
        await githubSearchIssues(API, 'is:open'),
        { error: 'rate_limited', retryIn: 60 },
      )
    } finally { f.restore() }
  })

  test('a rate limit is not cached — it is not an answer', async () => {
    const f = stubFetch([{ status: 429 }, { body: { total_count: 0, items: [] } }])
    try {
      await githubSearchIssues(API, 'is:open')
      const res = await githubSearchIssues(API, 'is:open')
      assert.strictEqual(f.calls.length, 2)
      assert.strictEqual(res.error, undefined)
    } finally { f.restore() }
  })

  // A search result names its repository by API URL and nothing else, so the
  // owner/repo every caller needs has to be read back out of it.
  test('a result carries owner/repo, taken from the API url', async () => {
    const f = stubFetch([{
      body: {
        total_count: 1,
        items: [{
          number: 7, title: 'x', repository_url: 'https://api.github.com/repos/o/r',
          user: { login: 'u' }, pull_request: {},
        }],
      },
    }])
    try {
      const res = await githubSearchIssues(API, 'is:pr')
      assert.strictEqual(res.items[0].repo, 'o/r')
      assert.strictEqual(res.items[0].repoUrl, 'https://github.com/o/r')
      assert.strictEqual(res.items[0].type, 'pr')
    } finally { f.restore() }
  })
})

suite('githubApi — closing, listing, sharing', () => {
  setup(() => clearSearchCache())

  // The thing just closed sits in an unknown number of cached queries, and a
  // list still showing it reads as the close having failed.
  test('closing an issue drops every cached search', async () => {
    const f = stubFetch([{ body: { total_count: 0, items: [] } }])
    try {
      await githubSearchIssues(API, 'is:open')
      await githubCloseIssue(API, 'o', 'r', 7)
      await githubSearchIssues(API, 'is:open')
      // search, close, search — the third call is the proof the first was dropped.
      assert.strictEqual(f.calls.length, 3)
    } finally { f.restore() }
  })

  test('a failed close leaves the cache alone', async () => {
    const f = stubFetch([{ body: { total_count: 0, items: [] } }, { status: 500 }])
    try {
      await githubSearchIssues(API, 'is:open')
      assert.deepStrictEqual(await githubCloseIssue(API, 'o', 'r', 7), { error: 'HTTP 500' })
      await githubSearchIssues(API, 'is:open')
      assert.strictEqual(f.calls.length, 2, 'the second search should have been served from cache')
    } finally { f.restore() }
  })

  // This endpoint sends no total, so a short page is the only end-of-list
  // signal there is. Stopping at the first page would quietly cap the list at
  // 100 repositories for anyone who has more.
  test('listing repositories follows the pages until one is short', async () => {
    const f = stubFetch([{ body: repoPage(100) }, { body: repoPage(100) }, { body: repoPage(3) }])
    try {
      const res = await githubListRepos(API)
      assert.strictEqual(f.calls.length, 3)
      assert.strictEqual(res.repos.length, 203)
      assert.ok(f.calls[2].includes('page=3'))
    } finally { f.restore() }
  })

  test('an exactly-full last page costs one more request, and ends there', async () => {
    const f = stubFetch([{ body: repoPage(100) }, { body: [] }])
    try {
      const res = await githubListRepos(API)
      assert.strictEqual(f.calls.length, 2)
      assert.strictEqual(res.repos.length, 100)
    } finally { f.restore() }
  })

  // GitHub hides the gists endpoint from a token without the `gist` scope
  // rather than refusing the call, so a 404 here is almost never a missing
  // gist — it is a token that cannot make one. "HTTP 404" would send the user
  // looking for something that was never there.
  test('a 404 on gists reads as the missing scope', async () => {
    const f = stubFetch([{ status: 404 }])
    try {
      assert.deepStrictEqual(
        await githubCreateGist(API, 'd', 'f.patch', 'diff'),
        { error: 'gist_scope' },
      )
    } finally { f.restore() }
  })

  test('a shared patch comes back as its link', async () => {
    const f = stubFetch([{ body: { html_url: 'https://gist.github.com/abc' } }])
    try {
      assert.deepStrictEqual(
        await githubCreateGist(API, 'd', 'f.patch', 'diff'),
        { url: 'https://gist.github.com/abc' },
      )
      assert.strictEqual(f.calls[0], 'https://api.github.com/gists')
    } finally { f.restore() }
  })

  test('the ported calls short-circuit without a token, like the others', async () => {
    // No fetch stub on purpose: reaching the network here would be the bug.
    const denied = { error: 'not_authenticated' }
    assert.deepStrictEqual(await githubSearchIssues(ANON, 'is:open'), denied)
    assert.deepStrictEqual(await githubCloseIssue(ANON, 'o', 'r', 1), denied)
    assert.deepStrictEqual(await githubListRepos(ANON), denied)
    assert.deepStrictEqual(await githubCreateGist(ANON, 'd', 'f', 'c'), denied)
  })

  test('401 reads as not authenticated here too', async () => {
    const restore = withStatus(401)
    try {
      assert.deepStrictEqual(await githubListRepos(API), { error: 'not_authenticated' })
      assert.deepStrictEqual(await githubCloseIssue(API, 'o', 'r', 1), { error: 'not_authenticated' })
    } finally { restore() }
  })

  // The whole of Enterprise support is that the same API answers somewhere
  // else. If the base did not reach the URL, every call would still go to
  // github.com and the feature would be a setting that does nothing.
  test('an Enterprise base is where the call actually goes', async () => {
    const ENT = { base: 'https://github.acme.com/api/v3', token: 'acme' }
    const f = stubFetch([
      { body: [] }, { body: [] }, { body: { total_count: 0, items: [] } },
    ])
    try {
      await githubListPRs(ENT, 'team', 'app')
      await githubListIssues(ENT, 'team', 'app')
      await githubSearchIssues(ENT, 'is:open is:pr', true)
      assert.ok(f.calls.every((u: string) => u.startsWith('https://github.acme.com/api/v3/')),
        `every call goes to the instance, got ${JSON.stringify(f.calls)}`)
      assert.ok(f.calls.some((u: string) => u.includes('/repos/team/app/pulls')))
    } finally { f.restore() }
  })
})

// The twin of src/main/ruleset-bypass.ts, held to the same table of cases as
// the desktop's own suite. It is a copy because this file's module may not
// import from outside `src/` — tsconfig.test.json compiles it under
// rootDir ./src — so the tables are what keeps the two from drifting.
//
// What it decides is said out loud in the pane: 'You can bypass this rule' or
// 'You cannot'. A refusal nobody measured is the failure that matters.
suite('githubApi — what the rulesets answer, together', () => {
  test('never everywhere is the only refusal', () => {
    assert.strictEqual(bypassVerdict(['never']), false)
    assert.strictEqual(bypassVerdict(['never', 'never', 'never']), false)
  })

  // Measured: a broad 'protect main' nobody bypasses beside a narrow
  // 'review required (others only)' the owner does.
  test('one bypassable ruleset among unbypassable ones is enough', () => {
    assert.strictEqual(bypassVerdict(['never', 'always']), true)
    assert.strictEqual(bypassVerdict(['always', 'never']), true)
  })

  test('any value that is not never means yes', () => {
    assert.strictEqual(bypassVerdict(['pull_requests_only']), true)
    assert.strictEqual(bypassVerdict(['some_mode_github_adds_later']), true)
  })

  test('no ruleset covering the branch is unknown, not a refusal', () => {
    assert.strictEqual(bypassVerdict([]), null)
  })

  test('one unreadable ruleset makes the whole answer unknown', () => {
    assert.strictEqual(bypassVerdict([null]), null)
    assert.strictEqual(bypassVerdict(['always', null]), null)
    assert.strictEqual(bypassVerdict(['never', null]), null)
  })
})

// #141 — the lists are polled, so they are asked conditionally: an ETag
// replayed as If-None-Match answers 304, which costs no rate limit at all
// (measured against api.github.com: 4997 remaining before five of them, 4997
// after). What the caller gets back is the last body plus `notModified`, so a
// poll can write nothing and leave the list the user is scrolling alone.
suite('githubApi — asking again without paying for it', () => {
  /** A fetch that answers a scripted sequence, recording the headers it saw. */
  function stubEtag(steps: { status: number; etag?: string; body?: any }[]) {
    const real = globalThis.fetch
    const seen: any[] = []
    let i = 0
    globalThis.fetch = (async (_url: string, init: any) => {
      seen.push(init?.headers ?? {})
      const step = steps[Math.min(i++, steps.length - 1)]
      return {
        ok: step.status >= 200 && step.status < 300,
        status: step.status,
        headers: { get: (h: string) => (h.toLowerCase() === 'etag' ? step.etag ?? null : null) },
        json: async () => step.body ?? [],
      }
    }) as unknown as typeof globalThis.fetch
    return { seen, restore: () => { globalThis.fetch = real } }
  }

  const API = { base: 'https://api.github.com', token: 'tok' }

  test('the first answer is kept, and its tag sent back on the next ask', async () => {
    const f = stubEtag([
      { status: 200, etag: '"abc"', body: [{ number: 1, title: 'one', user: { login: 'a' } }] },
      { status: 304, etag: '"abc"' },
    ])
    try {
      const first: any = await githubListPRs(API, 'o', 'r')
      assert.strictEqual(first.prs.length, 1)
      assert.strictEqual(first.notModified, undefined)
      // nothing to replay on a first ask
      assert.strictEqual((f.seen[0] as any)['If-None-Match'], undefined)

      const second: any = await githubListPRs(API, 'o', 'r')
      assert.strictEqual((f.seen[1] as any)['If-None-Match'], '"abc"')
      // a 304 still answers with the data — a caller ignoring the flag is safe
      assert.strictEqual(second.prs.length, 1)
      assert.strictEqual(second.notModified, true)
    } finally { f.restore() }
  })

  test('a changed list replaces the cache rather than adding to it', async () => {
    const f = stubEtag([
      { status: 200, etag: '"v1"', body: [{ number: 1, title: 'one', user: { login: 'a' } }] },
      { status: 200, etag: '"v2"', body: [{ number: 2, title: 'two', user: { login: 'b' } }] },
      { status: 304, etag: '"v2"' },
    ])
    try {
      await githubListPRs(API, 'o', 'r')
      const changed: any = await githubListPRs(API, 'o', 'r')
      assert.strictEqual(changed.prs[0].number, 2)
      assert.strictEqual((f.seen[1] as any)['If-None-Match'], '"v1"')

      const same: any = await githubListPRs(API, 'o', 'r')
      assert.strictEqual((f.seen[2] as any)['If-None-Match'], '"v2"')
      assert.strictEqual(same.prs[0].number, 2)
    } finally { f.restore() }
  })

  // The two lists are two entries: a quiet issues list must not make the pull
  // requests look unchanged.
  test('pull requests and issues are cached apart', async () => {
    const f = stubEtag([{ status: 200, etag: '"prs"', body: [] }, { status: 200, etag: '"iss"', body: [] }])
    try {
      await githubListPRs(API, 'o', 'r')
      await githubListIssues(API, 'o', 'r')
      assert.strictEqual((f.seen[1] as any)['If-None-Match'], undefined)
    } finally { f.restore() }
  })

  test('a refusal is still a refusal, not a stale answer', async () => {
    const f = stubEtag([{ status: 200, etag: '"abc"', body: [] }, { status: 401 }])
    try {
      await githubListPRs(API, 'o', 'r')
      assert.deepStrictEqual(await githubListPRs(API, 'o', 'r'), { error: 'not_authenticated' })
    } finally { f.restore() }
  })
})
