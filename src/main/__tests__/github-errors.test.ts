import { describeGithubFailure, githubError } from '../github-errors'

// A bare "HTTP 403" was all the desktop said when an organisation refused the
// app's token. GitHub says which refusal it is; each has its own way out.

function headers(h: Record<string, string>) {
  return { get: (name: string) => h[name.toLowerCase()] ?? null }
}

describe('why GitHub refused', () => {
  test('an organisation that has not approved the OAuth app', () => {
    const msg = describeGithubFailure(403, headers({}), {
      message: 'Although you appear to have the correct authorization credentials, the `acme` organization has enabled OAuth App access restrictions, meaning that data access to third-parties is limited.',
    })
    expect(msg).toMatch(/not approved Git Vertex/)
    expect(msg).toMatch(/github\.com\/settings\/applications/)
    expect(msg).toMatch(/Personal Access Token/)
  })

  test('SAML single sign-on, with the authorisation link GitHub gives', () => {
    const msg = describeGithubFailure(403, headers({
      'x-github-sso': 'required; url=https://github.com/orgs/acme/sso?authorization_request=abc',
    }), { message: 'Resource protected by organization SAML enforcement.' })
    expect(msg).toMatch(/single sign-on/)
    expect(msg).toMatch(/https:\/\/github\.com\/orgs\/acme\/sso\?authorization_request=abc/)
  })

  test('a partial-results SSO header is not a refusal', () => {
    expect(describeGithubFailure(403, headers({ 'x-github-sso': 'partial-results; organizations=1,2' }), {})).toBe('HTTP 403')
  })

  test('a spent rate limit', () => {
    const msg = describeGithubFailure(403, headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1800000000' }), { message: 'API rate limit exceeded' })
    expect(msg).toMatch(/rate limit is spent until \d\d:\d\d/)
  })

  test('any other 403 keeps GitHub\'s words', () => {
    expect(describeGithubFailure(403, headers({}), { message: 'Resource not accessible by integration' }))
      .toBe('HTTP 403: Resource not accessible by integration')
  })

  test('a revoked token says how to get back in', () => {
    expect(describeGithubFailure(401, headers({}), { message: 'Bad credentials' })).toMatch(/sign in again/)
  })

  test('other statuses stay bare — "HTTP 404" is compared against', () => {
    expect(describeGithubFailure(404, headers({}), { message: 'Not Found' })).toBe('HTTP 404')
    expect(describeGithubFailure(500, undefined, null)).toBe('HTTP 500')
  })

  test('withMessage keeps what those callers always showed', () => {
    expect(describeGithubFailure(422, headers({}), { message: 'Validation Failed' }, { withMessage: true })).toBe('Validation Failed')
    expect(describeGithubFailure(422, headers({}), {}, { withMessage: true })).toBe('HTTP 422')
  })

  test('githubError reads an unread body, JSON or not', async () => {
    const res = (status: number, text: string, h: Record<string, string> = {}) => ({ status, headers: headers(h), text: async () => text })
    expect(await githubError(res(403, '{"message":"the `acme` organization has enabled OAuth App access restrictions"}'))).toMatch(/not approved Git Vertex/)
    expect(await githubError(res(403, '<html>blocked</html>'))).toBe('HTTP 403')
  })
})
