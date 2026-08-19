// oauthHost.ts — the half of the OAuth flow that touches VS Code.
//
// The GitHub sign-in went through `vscode.authentication` because VS Code
// bundles a provider for it, and rebuilding a flow of our own would have been
// strictly worse. That reasoning does not carry to GitLab, Jira or Trello:
// VS Code has no provider for any of them, so an authorization redirect has
// nowhere to land unless we give it one.
//
// ⚠️ Nothing in this file runs under `npm run test:nodisplay` — it imports
// `vscode`. That is where the three defects of the GitHub sign-in lot lived, so
// everything that can be checked without an editor is in `oauth.ts` instead, and
// what remains here has a manual recipe in the pull request.

import * as vscode from 'vscode'
import {
  buildAuthorizeUrl, canRefresh, createPkcePair, createState, isExpired, parseCallback,
  providerFromCallbackPath, tokenFromResponse, type OAuthProvider, type StoredToken,
} from './oauth'

/** How long a sign-in may sit unanswered before its promise is released. */
const FLOW_TIMEOUT_MS = 5 * 60_000

type Pending = {
  state: string
  verifier: string
  resolve: (r: { ok: true; code: string } | { ok: false; error: string }) => void
}

const pending = new Map<string, Pending>()

/** `gv.oauth.<provider>` — one secret per provider, never one bag for all. */
const secretKey = (providerId: string): string => `gv.oauth.${providerId}`

/**
 * Where the provider sends the browser back.
 *
 * ⚠️ Two things here are not decoration. `vscode.env.uriScheme` rather than a
 * literal `vscode://`: Insiders answers on `vscode-insiders://` and VSCodium on
 * its own, so a hardcoded scheme means the redirect silently never arrives for
 * anyone not on stable. And `asExternalUri`, because in a remote or browser
 * window the callback has to be routed back to this machine — without it the
 * flow completes in a window that is not the user's.
 */
export async function callbackUri(providerId: string): Promise<vscode.Uri> {
  return vscode.env.asExternalUri(
    vscode.Uri.parse(`${vscode.env.uriScheme}://VictorQuilgars.git-vertex/auth/${providerId}`),
  )
}

/**
 * Receive the redirect. Registered once, at activation.
 *
 * A callback that matches no pending flow is dropped rather than acted on: it is
 * either a stale window or someone else's link, and neither is a sign-in.
 */
export function registerAuthCallback(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.window.registerUriHandler({
    handleUri(uri: vscode.Uri) {
      const providerId = providerFromCallbackPath(uri.path)
      const flow = providerId ? pending.get(providerId) : undefined
      if (!flow) {
        // Said out loud rather than swallowed. A redirect that lands with
        // nothing waiting for it is the shape every failure of this flow takes
        // — a window reloaded mid-sign-in, a link opened twice, a stale one
        // from yesterday — and it is indistinguishable from "nothing happened"
        // unless somebody says so. Same lesson as the sign-in lot's
        // `catch { return undefined }`.
        console.warn(`[GitVertex] auth callback with no flow waiting: ${uri.path}`)
        return
      }
      pending.delete(providerId!)
      flow.resolve(parseCallback(uri.query, flow.state))
    },
  }))
}

async function exchange(
  provider: OAuthProvider, code: string, verifier: string, redirectUri: string,
): Promise<StoredToken | { error: string }> {
  if (provider.exchange === 'proxy') {
    // Providers that demand a client secret go through the Cloudflare Worker
    // that already holds GitHub's — it is the only place one can live. Teaching
    // it a second provider is its own piece of work and is not done here.
    return { error: 'proxy_exchange_not_configured' }
  }
  try {
    const res = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: provider.clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }).toString(),
    })
    const body = await res.json() as Record<string, unknown>
    const token = tokenFromResponse(body, Date.now())
    if (!token) {
      const detail = typeof body.error_description === 'string' ? body.error_description
        : typeof body.error === 'string' ? body.error : `HTTP ${res.status}`
      return { error: detail }
    }
    return token
  } catch (e: any) {
    return { error: e?.message ?? 'exchange_failed' }
  }
}

/**
 * Sign in to a provider, from a user gesture.
 *
 * Only ever called from a click: it opens a browser, which is not something to
 * do while someone is reading a diff.
 */
export async function signIn(
  context: vscode.ExtensionContext, provider: OAuthProvider,
): Promise<StoredToken | { error: string }> {
  const redirect = (await callbackUri(provider.id)).toString(true)
  const state = createState()
  const { verifier, challenge } = createPkcePair()

  const answered = new Promise<{ ok: true; code: string } | { ok: false; error: string }>(resolve => {
    // A flow already waiting for this provider is abandoned rather than left to
    // resolve later: two browser windows for one provider means the second is
    // the one the user is looking at.
    pending.get(provider.id)?.resolve({ ok: false, error: 'superseded' })
    pending.set(provider.id, { state, verifier, resolve })
    setTimeout(() => {
      if (pending.get(provider.id)?.state === state) {
        pending.delete(provider.id)
        resolve({ ok: false, error: 'timed_out' })
      }
    }, FLOW_TIMEOUT_MS)
  })

  await vscode.env.openExternal(vscode.Uri.parse(
    buildAuthorizeUrl(provider, { redirectUri: redirect, state, challenge }),
  ))

  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Signing in to ${provider.id}…`, cancellable: true },
    (_p, token) => {
      token.onCancellationRequested(() => {
        if (pending.get(provider.id)?.state === state) {
          pending.delete(provider.id)
        }
      })
      return answered
    },
  )

  if (!result.ok) return { error: result.error }
  const token = await exchange(provider, result.code, verifier, redirect)
  if ('error' in token) return token
  await context.secrets.store(secretKey(provider.id), JSON.stringify(token))
  return token
}

/** What is stored for a provider, or null. Unreadable is treated as absent. */
export async function readToken(
  context: vscode.ExtensionContext, providerId: string,
): Promise<StoredToken | null> {
  const raw = await context.secrets.get(secretKey(providerId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed?.accessToken === 'string' ? parsed as StoredToken : null
  } catch { return null }
}

export async function forgetToken(
  context: vscode.ExtensionContext, providerId: string,
): Promise<void> {
  await context.secrets.delete(secretKey(providerId))
}

/**
 * A usable access token, refreshing first if it is about to expire.
 *
 * ⚠️ Returns null rather than looping when the token has expired and there is no
 * refresh token: the only way back is another sign-in, and pretending otherwise
 * is how "signed in" comes to mean nothing. The caller offers the button.
 */
export async function accessToken(
  context: vscode.ExtensionContext, provider: OAuthProvider,
): Promise<string | null> {
  const stored = await readToken(context, provider.id)
  if (!stored) return null
  if (!isExpired(stored, Date.now())) return stored.accessToken
  if (!canRefresh(stored)) return null

  try {
    const res = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: provider.clientId,
        grant_type: 'refresh_token',
        refresh_token: stored.refreshToken!,
      }).toString(),
    })
    const refreshed = tokenFromResponse(await res.json() as Record<string, unknown>, Date.now())
    if (!refreshed) {
      // A refusal here means the refresh token is spent or revoked. Keeping it
      // would retry the same failure on every call.
      await forgetToken(context, provider.id)
      return null
    }
    // A provider that rotates refresh tokens sends a new one; one that does not
    // sends none, and the old one must survive.
    const next: StoredToken = { ...refreshed, refreshToken: refreshed.refreshToken ?? stored.refreshToken }
    await context.secrets.store(secretKey(provider.id), JSON.stringify(next))
    return next.accessToken
  } catch {
    return null
  }
}
