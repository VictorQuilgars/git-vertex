// oauth.ts — the arithmetic of an OAuth 2.0 authorization-code flow.
//
// Deliberately free of `vscode`, and that is the whole point of the split: what
// imports `vscode` cannot run in `npm run test:nodisplay`, and the GitHub
// sign-in lot proved where the defects live — three of them, all in the host
// half, none caught by a test. So everything here that can be got wrong quietly
// lives on this side: the PKCE challenge, the state comparison, reading a
// callback, and deciding whether a token has expired.
//
// `oauthHost.ts` is the other half: opening a browser, receiving the redirect,
// and the secret store. It cannot be unit-tested here and has a manual recipe
// instead.

import { createHash, randomBytes, timingSafeEqual } from 'crypto'

/** What a provider needs to describe before any of this can run. */
export interface OAuthProvider {
  /** Stable id — the callback path and the secret-store key are built from it. */
  id: string
  authorizeUrl: string
  tokenUrl: string
  clientId: string
  scopes: string[]
  /**
   * How the code is traded for a token.
   *
   * `pkce` needs no client secret, so the exchange happens here. `proxy` is for
   * providers that demand a secret, which cannot ship in a client — it goes to
   * the Cloudflare Worker that already holds GitHub's.
   */
  exchange: 'pkce' | 'proxy'
}

export interface PkcePair {
  verifier: string
  challenge: string
  method: 'S256'
}

/** base64url — the alphabet OAuth uses, without padding. */
function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * A PKCE verifier and its challenge.
 *
 * ⚠️ `S256` means base64url(sha256(**the ASCII verifier**)) — the hash is taken
 * over the encoded string, not over the random bytes that produced it. Hashing
 * the bytes gives a challenge the provider will reject, and the error it returns
 * says nothing useful about why.
 *
 * 32 bytes → 43 characters, which is the shortest the spec allows (43–128).
 */
export function createPkcePair(): PkcePair {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier, 'ascii').digest())
  return { verifier, challenge, method: 'S256' }
}

/**
 * The anti-forgery value carried through the round trip.
 *
 * From the CSPRNG rather than `Math.random()`: this is the only thing standing
 * between the callback and someone else's authorization code, and `Math.random`
 * is predictable by design. (The desktop still uses it — worth revisiting.)
 */
export function createState(): string {
  return base64url(randomBytes(24))
}

/** Constant-time comparison, so a state cannot be guessed a character at a time. */
export function statesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const ab = Buffer.from(a), bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/** Where the browser is sent. */
export function buildAuthorizeUrl(p: OAuthProvider, opts: {
  redirectUri: string
  state: string
  challenge?: string
}): string {
  const params = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: p.scopes.join(' '),
    state: opts.state,
  })
  if (opts.challenge) {
    params.set('code_challenge', opts.challenge)
    params.set('code_challenge_method', 'S256')
  }
  return `${p.authorizeUrl}?${params.toString()}`
}

export type CallbackResult =
  | { ok: true; code: string }
  | { ok: false; error: string }

/**
 * Read what came back on the redirect.
 *
 * The state is checked **before** the code is looked at, and a mismatch is not
 * reported as "no code": a callback carrying someone else's code is the attack
 * this parameter exists for, and it should read as one.
 *
 * A provider that refuses answers with `error` and usually `error_description`;
 * both are surfaced, because "access_denied" alone tells a user nothing.
 */
export function parseCallback(query: string, expectedState: string): CallbackResult {
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query)

  if (!statesMatch(params.get('state'), expectedState)) {
    return { ok: false, error: 'state_mismatch' }
  }
  const denial = params.get('error')
  if (denial) {
    const detail = params.get('error_description')
    return { ok: false, error: detail ? `${denial}: ${detail}` : denial }
  }
  const code = params.get('code')
  if (!code) return { ok: false, error: 'no_code' }
  return { ok: true, code }
}

/**
 * Which provider a redirect belongs to, read from its path.
 *
 * Here rather than in the host for the usual reason: it is the piece that would
 * break silently if the callback path ever changed shape, and the host half
 * cannot be tested. Anything that is not `/auth/<id>` is not ours — a stray
 * `vscode://` link should be dropped, not routed to whichever flow happens to
 * be waiting.
 */
export function providerFromCallbackPath(path: string): string | null {
  const m = /^\/auth\/([A-Za-z0-9_-]+)\/?$/.exec(path)
  return m ? m[1] : null
}

export interface StoredToken {
  accessToken: string
  refreshToken?: string
  /** Epoch milliseconds, absent when the provider issues tokens that do not expire. */
  expiresAt?: number
}

/**
 * Turn the `expires_in` of a token response into a moment.
 *
 * Relative seconds are useless the second they are stored — everything that
 * reads a token later needs to know *when*, not *for how long from a point it
 * cannot recover*.
 */
export function tokenFromResponse(body: Record<string, unknown>, now: number): StoredToken | null {
  const accessToken = typeof body.access_token === 'string' ? body.access_token : null
  if (!accessToken) return null
  const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token : undefined
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in
    : typeof body.expires_in === 'string' && /^\d+$/.test(body.expires_in) ? Number(body.expires_in)
    : null
  // Only the keys it actually has: this object is serialised into the secret
  // store, and a key holding `undefined` is a key that reads as "we looked and
  // there was one" to whatever opens it next.
  return {
    accessToken,
    ...(refreshToken ? { refreshToken } : {}),
    ...(expiresIn !== null ? { expiresAt: now + expiresIn * 1000 } : {}),
  }
}

/** A minute of slack: a token that dies mid-request is a failure the user sees. */
export const EXPIRY_SKEW_MS = 60_000

export function isExpired(token: StoredToken, now: number): boolean {
  return token.expiresAt !== undefined && token.expiresAt - EXPIRY_SKEW_MS <= now
}

/**
 * ⚠️ A token that has expired and has no refresh token is **not** refreshable —
 * the only way back is another sign-in. Saying so here keeps the host from
 * looping on a refresh that can never succeed, which is how "signed in" ends up
 * meaning nothing at all.
 */
export function canRefresh(token: StoredToken | null | undefined): boolean {
  return !!token?.refreshToken
}
