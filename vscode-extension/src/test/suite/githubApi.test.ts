import * as assert from 'assert'
import { githubListPRs, githubListIssues, githubGetIssue } from '../../githubApi'

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
      assert.deepStrictEqual(await githubListPRs('tok', 'o', 'r'), { error: 'not_authenticated' })
      assert.deepStrictEqual(await githubListIssues('tok', 'o', 'r'), { error: 'not_authenticated' })
      assert.deepStrictEqual(await githubGetIssue('tok', 'o', 'r', 1), { error: 'not_authenticated' })
    } finally { restore() }
  })

  // Rate limiting and "your token is fine, you may not do this" both come back
  // as 403. Folding it into not_authenticated would send the user round a
  // sign-in loop that cannot fix either.
  test('403 keeps its status — signing in again would not help', async () => {
    const restore = withStatus(403)
    try {
      assert.deepStrictEqual(await githubListPRs('tok', 'o', 'r'), { error: 'HTTP 403' })
    } finally { restore() }
  })

  test('other failures keep their status', async () => {
    const restore = withStatus(500)
    try {
      assert.deepStrictEqual(await githubListIssues('tok', 'o', 'r'), { error: 'HTTP 500' })
    } finally { restore() }
  })

  test('no token at all still short-circuits before any request', async () => {
    // No fetch stub on purpose: reaching the network here would be the bug.
    assert.deepStrictEqual(await githubListPRs(undefined, 'o', 'r'), { error: 'not_authenticated' })
  })
})
