import { readCallback, exchangeCode, describeNetworkError } from '../github-oauth'

// The desktop sign-in failed silently on a Windows machine: the browser said
// "signed in" and the app said nothing, ever. Every case below has to come
// back as a sentence, never as a throw.

const PROXY = 'https://gh-proxy.example.workers.dev'

function fakeFetch(impl: () => Promise<Partial<Response>> | Partial<Response>): typeof fetch {
  return (async () => impl()) as unknown as typeof fetch
}
function reply(status: number, body: string): Partial<Response> {
  return { status, ok: status < 400, text: async () => body }
}

describe('reading the callback', () => {
  test('a matching state yields the code', () => {
    expect(readCallback('gitgui://callback?code=abc&state=s1', 's1')).toEqual({ code: 'abc' })
  })

  test('the trailing slash Windows adds does not matter', () => {
    expect(readCallback('gitgui://callback/?code=abc&state=s1', 's1')).toEqual({ code: 'abc' })
  })

  test('a mismatched state is refused', () => {
    expect(readCallback('gitgui://callback?code=abc&state=other', 's1')).toEqual({ error: expect.stringMatching(/state/) })
  })

  test('nothing pending says the app restarted, not "CSRF"', () => {
    const r = readCallback('gitgui://callback?code=abc&state=s1', null)
    expect('error' in r && r.error).toMatch(/restarted/)
  })

  test('GitHub declining is reported in its own words', () => {
    const r = readCallback('gitgui://callback?error=access_denied&error_description=The+user+has+denied&state=s1', 's1')
    expect(r).toEqual({ error: 'The user has denied' })
  })
})

describe('trading the code for a token', () => {
  test('the token comes back', async () => {
    const r = await exchangeCode(PROXY, 'c', fakeFetch(() => reply(200, '{"access_token":"gho_x"}')))
    expect(r).toEqual({ token: 'gho_x' })
  })

  test('GitHub refusing the code says why', async () => {
    const r = await exchangeCode(PROXY, 'c', fakeFetch(() => reply(200, '{"error":"bad_verification_code","error_description":"The code passed is incorrect or expired."}')))
    expect(r).toEqual({ error: 'The code passed is incorrect or expired.' })
  })

  test('a network failure is a sentence naming the host and the cause, not a throw', async () => {
    const failure = Object.assign(new TypeError('fetch failed'), { cause: { code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', message: 'unable to get local issuer certificate' } })
    const r = await exchangeCode(PROXY, 'c', fakeFetch(() => { throw failure }))
    expect('error' in r && r.error).toMatch(/gh-proxy\.example\.workers\.dev/)
    expect('error' in r && r.error).toMatch(/UNABLE_TO_GET_ISSUER_CERT_LOCALLY/)
    expect('error' in r && r.error).toMatch(/proxy|antivirus/)
  })

  test('a page in place of the answer — a company proxy — is quoted', async () => {
    const r = await exchangeCode(PROXY, 'c', fakeFetch(() => reply(403, '<html><body>Access denied by policy</body></html>')))
    expect('error' in r && r.error).toMatch(/HTTP 403/)
    expect('error' in r && r.error).toMatch(/Access denied by policy/)
  })

  test('no proxy configured is still an answer', async () => {
    const r = await exchangeCode('', 'c', fakeFetch(() => { throw new TypeError('Failed to parse URL') }))
    expect('error' in r && r.error).toMatch(/no proxy URL configured/)
  })
})

describe('naming a network failure', () => {
  test('DNS', () => {
    expect(describeNetworkError({ message: 'fetch failed', cause: { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND x' } })).toMatch(/resolved/)
  })
  test('blocked', () => {
    expect(describeNetworkError({ message: 'fetch failed', cause: { code: 'ECONNRESET' } })).toMatch(/firewall/)
  })
  test('anything else keeps its own message', () => {
    expect(describeNetworkError(new Error('boom'))).toBe('boom')
  })
})
