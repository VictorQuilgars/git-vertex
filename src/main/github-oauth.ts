// The half of the desktop's GitHub sign-in that can go wrong, kept free of
// electron and of import.meta so it can be tested: reading the callback the
// browser hands back, and trading its code for a token at the proxy.
//
// Every way out is an `{ error }` sentence a person can act on. The first
// version of this let a network failure escape as a rejected promise from an
// event handler: on a Windows machine behind a company proxy the browser said
// "signed in", the app sat on "Connecting…" forever, and nothing was written
// anywhere a user could see.

export type OAuthResult = { token: string } | { error: string }

/** What the browser handed back, checked against the flow this process started. */
export function readCallback(
  callbackUrl: string,
  pendingState: string | null,
): { code: string } | { error: string } {
  let url: URL
  try { url = new URL(callbackUrl) } catch { return { error: 'Invalid callback URL' } }

  // GitHub says so in the redirect when the user declined, or the app is misconfigured.
  const ghError = url.searchParams.get('error')
  if (ghError) return { error: url.searchParams.get('error_description') ?? ghError }

  const code  = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code) return { error: 'No code in the GitHub callback' }
  // Nothing pending: this process did not start the sign-in it is being handed —
  // the app was restarted (or updated) while the browser page was open.
  if (pendingState === null) {
    return { error: 'This sign-in was started before Git Vertex restarted. Click "Sign in with GitHub" again.' }
  }
  if (state !== pendingState) return { error: 'Invalid state — possible CSRF attack' }
  return { code }
}

const CERT_CODES = new Set([
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_GET_ISSUER_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_UNTRUSTED',
  'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED',
])
const BLOCKED_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET',
])

/**
 * Node's fetch says only "fetch failed"; the reason is on `cause`. Named here,
 * with a guess at the usual culprit, because the person reading it is on a
 * machine we cannot see.
 */
export function describeNetworkError(e: unknown): string {
  const err = e as { message?: string; cause?: { code?: string; message?: string } } | null
  // Node puts a code on `cause`; Chromium's stack (net.fetch) says net::ERR_… in the message.
  const code = err?.cause?.code ?? err?.message?.match(/net::(ERR_[A-Z_]+)/)?.[1]
  const detail = err?.cause?.message ?? err?.message ?? String(e)
  if (code && /^ERR_(CERT_|SSL_|BAD_SSL)/.test(code)) {
    return `the server's certificate was not trusted (${code}) — a company proxy or an antivirus inspecting HTTPS traffic does this`
  }
  if (code && /^ERR_(PROXY_|TUNNEL_|MANDATORY_PROXY)/.test(code)) {
    return `the system proxy refused or could not open the connection (${code})`
  }
  if (code === 'ERR_NAME_NOT_RESOLVED' || code === 'ERR_NAME_RESOLUTION_FAILED') {
    return `the server's name could not be resolved (${code}) — check the network, VPN or DNS`
  }
  if (code && /^ERR_(CONNECTION_|TIMED_OUT|ADDRESS_UNREACHABLE|NETWORK_ACCESS_DENIED|BLOCKED_)/.test(code)) {
    return `the connection was blocked or timed out (${code}) — a firewall or a company proxy may be in the way`
  }
  if (code && CERT_CODES.has(code)) {
    return `the server's certificate was not trusted (${code}) — a company proxy or an antivirus inspecting HTTPS traffic does this`
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return `the server's name could not be resolved (${code}) — check the network, VPN or DNS`
  }
  if (code && BLOCKED_CODES.has(code)) {
    return `the connection was blocked or timed out (${code}) — a firewall or a company proxy may be in the way`
  }
  return code ? `${detail} (${code})` : detail
}

function hostOf(url: string): string {
  try { return new URL(url).host } catch { return url || '(no proxy URL configured)' }
}

/** Trades the authorization code for a token at the proxy that holds the client secret. */
export async function exchangeCode(
  proxyUrl: string,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OAuthResult> {
  const host = hostOf(proxyUrl)
  let res: Response
  try {
    res = await fetchImpl(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
  } catch (e) {
    return { error: `Could not reach the sign-in server (${host}): ${describeNetworkError(e)}` }
  }

  const text = await res.text().catch(() => '')
  let data: Record<string, string> | null = null
  try { data = JSON.parse(text) } catch { /* not JSON — said below */ }

  if (data?.access_token) return { token: data.access_token }
  if (data && (data.error_description || data.error)) return { error: data.error_description ?? data.error }
  // A page that is not the proxy's answer: what a company proxy or a captive
  // portal serves in its place.
  const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 120)
  return {
    error: `The sign-in server (${host}) answered HTTP ${res.status} with ${data ? 'no token' : 'something that is not its answer'}`
      + (snippet && !data ? `: "${snippet}"` : '') + ' — a company proxy may be replacing the response',
  }
}
