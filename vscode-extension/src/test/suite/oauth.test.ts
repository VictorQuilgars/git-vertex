import * as assert from 'assert'
import { createHash } from 'crypto'
import {
  createPkcePair, createState, statesMatch, buildAuthorizeUrl, parseCallback,
  tokenFromResponse, isExpired, canRefresh, providerFromCallbackPath, EXPIRY_SKEW_MS,
  type OAuthProvider,
} from '../../oauth'

// The half of the flow that can be got wrong quietly. Everything that touches
// `vscode` — the browser, the redirect, the secret store — is in oauthHost.ts
// and has a manual recipe instead, because nothing here can reach it.

const PROVIDER: OAuthProvider = {
  id: 'example',
  authorizeUrl: 'https://example.com/oauth/authorize',
  tokenUrl: 'https://example.com/oauth/token',
  clientId: 'client-123',
  scopes: ['read_api', 'read_user'],
  exchange: 'pkce',
}

suite('PKCE', () => {
  // The trap: S256 is base64url(sha256(the ASCII verifier)), not a hash of the
  // random bytes behind it. Getting that wrong produces a challenge the
  // provider rejects with a message that explains nothing.
  test('the challenge is the hash of the verifier as sent, not of its bytes', () => {
    const { verifier, challenge, method } = createPkcePair()
    const expected = createHash('sha256').update(verifier, 'ascii').digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    assert.strictEqual(challenge, expected)
    assert.strictEqual(method, 'S256')
  })

  test('the verifier is inside the length the spec allows, and url-safe', () => {
    for (let i = 0; i < 20; i++) {
      const { verifier, challenge } = createPkcePair()
      assert.ok(verifier.length >= 43 && verifier.length <= 128, `length ${verifier.length}`)
      assert.ok(/^[A-Za-z0-9\-_]+$/.test(verifier), verifier)
      assert.ok(/^[A-Za-z0-9\-_]+$/.test(challenge), challenge)
    }
  })

  test('two flows never share a verifier', () => {
    const seen = new Set(Array.from({ length: 50 }, () => createPkcePair().verifier))
    assert.strictEqual(seen.size, 50)
  })
})

suite('state — the only thing between the callback and someone else`s code', () => {
  test('it is unpredictable and never repeats', () => {
    const seen = new Set(Array.from({ length: 50 }, () => createState()))
    assert.strictEqual(seen.size, 50)
    assert.ok(seen.values().next().value!.length >= 32)
  })

  test('matching is exact, and nothing matches nothing', () => {
    assert.ok(statesMatch('abc', 'abc'))
    assert.ok(!statesMatch('abc', 'abd'))
    assert.ok(!statesMatch('abc', 'abcd'))
    assert.ok(!statesMatch('', ''))
    assert.ok(!statesMatch(null, 'abc'))
    assert.ok(!statesMatch('abc', undefined))
  })
})

suite('the authorize URL', () => {
  test('carries what the provider needs, and the challenge when there is one', () => {
    const url = new URL(buildAuthorizeUrl(PROVIDER, {
      redirectUri: 'vscode://VictorQuilgars.git-vertex/auth/example',
      state: 'st-1',
      challenge: 'ch-1',
    }))
    assert.strictEqual(url.origin + url.pathname, 'https://example.com/oauth/authorize')
    assert.strictEqual(url.searchParams.get('client_id'), 'client-123')
    assert.strictEqual(url.searchParams.get('response_type'), 'code')
    assert.strictEqual(url.searchParams.get('state'), 'st-1')
    assert.strictEqual(url.searchParams.get('code_challenge'), 'ch-1')
    assert.strictEqual(url.searchParams.get('code_challenge_method'), 'S256')
    // Space-separated, and encoded once — a scope list is the classic place to
    // send `%20` twice over.
    assert.strictEqual(url.searchParams.get('scope'), 'read_api read_user')
    assert.strictEqual(url.searchParams.get('redirect_uri'),
      'vscode://VictorQuilgars.git-vertex/auth/example')
  })

  test('no challenge, no PKCE parameters', () => {
    const url = new URL(buildAuthorizeUrl(PROVIDER, { redirectUri: 'x://y', state: 's' }))
    assert.strictEqual(url.searchParams.get('code_challenge'), null)
    assert.strictEqual(url.searchParams.get('code_challenge_method'), null)
  })
})

suite('reading the callback', () => {
  test('a good one gives its code', () => {
    assert.deepStrictEqual(parseCallback('?code=abc&state=st', 'st'), { ok: true, code: 'abc' })
    assert.deepStrictEqual(parseCallback('code=abc&state=st', 'st'), { ok: true, code: 'abc' })
  })

  // The attack this parameter exists for. It must not read as "no code".
  test('a state that does not match is refused as such, code or no code', () => {
    assert.deepStrictEqual(parseCallback('?code=abc&state=other', 'st'),
      { ok: false, error: 'state_mismatch' })
    assert.deepStrictEqual(parseCallback('?code=abc', 'st'),
      { ok: false, error: 'state_mismatch' })
  })

  test('a refusal carries what the provider said about it', () => {
    assert.deepStrictEqual(
      parseCallback('?error=access_denied&error_description=User%20said%20no&state=st', 'st'),
      { ok: false, error: 'access_denied: User said no' },
    )
    assert.deepStrictEqual(parseCallback('?error=access_denied&state=st', 'st'),
      { ok: false, error: 'access_denied' })
  })

  test('an answer with neither is not a success', () => {
    assert.deepStrictEqual(parseCallback('?state=st', 'st'), { ok: false, error: 'no_code' })
  })
})

suite('what a token response means later', () => {
  const NOW = 1_700_000_000_000

  // Relative seconds are useless the moment they are stored.
  test('expires_in becomes a moment', () => {
    assert.deepStrictEqual(
      tokenFromResponse({ access_token: 'a', refresh_token: 'r', expires_in: 7200 }, NOW),
      { accessToken: 'a', refreshToken: 'r', expiresAt: NOW + 7_200_000 },
    )
  })

  test('a provider that sends it as a string is not a provider that sends nothing', () => {
    const t = tokenFromResponse({ access_token: 'a', expires_in: '3600' }, NOW)
    assert.strictEqual(t?.expiresAt, NOW + 3_600_000)
  })

  test('no expiry means no expiry, not an expiry of now', () => {
    const t = tokenFromResponse({ access_token: 'a' }, NOW)
    assert.deepStrictEqual(t, { accessToken: 'a' })
    assert.ok(!isExpired(t!, NOW + 10 ** 12))
  })

  test('a response with no access token is not a token', () => {
    assert.strictEqual(tokenFromResponse({ error: 'invalid_grant' }, NOW), null)
    assert.strictEqual(tokenFromResponse({ access_token: 123 }, NOW), null)
  })

  // A token that dies mid-request is a failure the user sees, so it counts as
  // expired a minute early.
  test('expiry is early by the skew, not late', () => {
    const t = { accessToken: 'a', expiresAt: NOW + EXPIRY_SKEW_MS }
    assert.ok(isExpired(t, NOW), 'exactly at the skew boundary counts as expired')
    assert.ok(!isExpired({ accessToken: 'a', expiresAt: NOW + EXPIRY_SKEW_MS + 1 }, NOW))
    assert.ok(isExpired({ accessToken: 'a', expiresAt: NOW - 1 }, NOW))
  })

  // Without this the host loops on a refresh that can never succeed, and
  // "signed in" stops meaning anything.
  test('expired with no refresh token is a sign-in, not a refresh', () => {
    assert.ok(canRefresh({ accessToken: 'a', refreshToken: 'r' }))
    assert.ok(!canRefresh({ accessToken: 'a' }))
    assert.ok(!canRefresh(null))
  })
})

suite('routing a redirect', () => {
  test('the provider is read from the path', () => {
    assert.strictEqual(providerFromCallbackPath('/auth/gitlab'), 'gitlab')
    assert.strictEqual(providerFromCallbackPath('/auth/gitlab/'), 'gitlab')
    assert.strictEqual(providerFromCallbackPath('/auth/jira-cloud'), 'jira-cloud')
  })

  // A stray vscode:// link should be dropped, not handed to whichever flow
  // happens to be waiting.
  test('anything else is not ours', () => {
    assert.strictEqual(providerFromCallbackPath('/auth/'), null)
    assert.strictEqual(providerFromCallbackPath('/auth'), null)
    assert.strictEqual(providerFromCallbackPath('/open?file=x'), null)
    assert.strictEqual(providerFromCallbackPath('/auth/a/b'), null)
    assert.strictEqual(providerFromCallbackPath(''), null)
  })
})
