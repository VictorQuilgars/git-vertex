// What a refused GitHub request says to the person who made it.
//
// The handlers used to answer `HTTP 403` and drop the body, and a 403 from
// GitHub is half a dozen different things, each with its own way out — most
// often, on a work account, an organisation that has not approved this OAuth
// app, or one behind SAML single sign-on that this token was never authorised
// for. GitHub says which, in the body and in a header; this reads them.
//
// Only 401, 403 and 429 are reworded. Every other status keeps its bare
// `HTTP <status>`, which callers compare against (`HTTP 404` is "no such pull
// request" to the by-number lookup).

export interface HeaderBag { get(name: string): string | null }

const AUTHORIZED_APPS = 'https://github.com/settings/applications'

function messageOf(body: unknown): string {
  const m = (body as { message?: unknown } | null)?.message
  return typeof m === 'string' ? m.trim() : ''
}

function ssoUrl(headers: HeaderBag | undefined): string | null {
  const sso = headers?.get?.('x-github-sso') ?? ''
  if (!/^\s*required\b/i.test(sso)) return null
  return sso.match(/url=(\S+)/)?.[1] ?? ''
}

/**
 * `withMessage`: for callers that always showed GitHub's own message (a 422's
 * "Validation Failed" when creating an issue), whatever the status.
 */
export function describeGithubFailure(
  status: number, headers: HeaderBag | undefined, body: unknown, opts: { withMessage?: boolean } = {},
): string {
  const message = messageOf(body)
  const sso = ssoUrl(headers)
  if (sso !== null) {
    return 'The organisation that owns this repository uses SAML single sign-on, and this GitHub connection is not authorised for it yet.'
      + (sso ? ` Authorise it here, then try again: ${sso}` : ` Authorise Git Vertex for the organisation at ${AUTHORIZED_APPS}.`)
  }
  if (/OAuth App access restrictions/i.test(message)) {
    return 'The organisation that owns this repository only lets apps it has approved read its data, and it has not approved Git Vertex.'
      + ` Ask for it at ${AUTHORIZED_APPS} (Git Vertex › Organization access › Request), and an owner of the organisation can grant it.`
      + ' Until then, disconnect in Settings › GitHub and use a Personal Access Token instead.'
  }
  if (status === 403 || status === 429) {
    const remaining = headers?.get?.('x-ratelimit-remaining')
    const reset = Number(headers?.get?.('x-ratelimit-reset'))
    if (remaining === '0' || /rate limit/i.test(message)) {
      const when = reset ? ` until ${new Date(reset * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''
      return `GitHub's rate limit is spent${when}. Try again then.`
    }
  }
  if (status === 401) {
    return 'GitHub no longer accepts this connection (HTTP 401). Disconnect and sign in again in Settings › GitHub.'
  }
  if ((status === 403 || status === 429) && message) return `HTTP ${status}: ${message}`
  return opts.withMessage && message ? message : `HTTP ${status}`
}

/** For a response whose body has not been read yet. */
export async function githubError(res: { status: number; headers?: HeaderBag; text(): Promise<string> }): Promise<string> {
  let body: unknown = null
  try { body = JSON.parse(await res.text()) } catch { /* no JSON — the status speaks alone */ }
  return describeGithubFailure(res.status, res.headers, body)
}
