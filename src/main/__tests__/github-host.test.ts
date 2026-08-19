import {
  knownGithubHosts, tokenForHost, apiForHost, apiForRemote, apiForUser, githubHeaders,
} from '../github-host'

// The two questions this module exists to answer are "where do I send this" and
// "what may I send with it". The second one is the one that can leak a
// credential, so it has the most cases.

const NONE = {}
const COM = { githubToken: 'com-token' }
const BOTH = {
  githubToken: 'com-token',
  githubEnterpriseHost: 'github.acme.com',
  githubEnterpriseToken: 'acme-token',
}

describe('which hosts count as GitHub', () => {
  test('none declared means github.com and nothing else', () => {
    expect(knownGithubHosts(NONE)).toEqual([])
    expect(knownGithubHosts(COM)).toEqual([])
  })

  test('a declared instance is normalised', () => {
    expect(knownGithubHosts({ githubEnterpriseHost: '  GitHub.ACME.com ' })).toEqual(['github.acme.com'])
  })
})

// A token belongs to one host. This is the test that stops the github.com
// credential from being handed to whoever runs github.acme.com.
describe('a token never crosses hosts', () => {
  test('each host gets its own, or none', () => {
    expect(tokenForHost(BOTH, 'github.com')).toBe('com-token')
    expect(tokenForHost(BOTH, 'github.acme.com')).toBe('acme-token')
    expect(tokenForHost(BOTH, 'GitHub.Acme.com')).toBe('acme-token')
  })

  test('an undeclared host gets nothing, even with tokens configured', () => {
    expect(tokenForHost(BOTH, 'github.other.com')).toBeUndefined()
    expect(tokenForHost(BOTH, 'gitlab.com')).toBeUndefined()
  })

  test('a declared instance with no token of its own does not fall back', () => {
    const s = { githubToken: 'com-token', githubEnterpriseHost: 'github.acme.com' }
    expect(tokenForHost(s, 'github.acme.com')).toBeUndefined()
  })
})

describe('where a call goes', () => {
  test('the base follows the host', () => {
    expect(apiForHost(COM, 'github.com').base).toBe('https://api.github.com')
    expect(apiForHost(BOTH, 'github.acme.com').base).toBe('https://github.acme.com/api/v3')
  })

  test('a remote on a declared instance resolves to it, with its own token', () => {
    expect(apiForRemote(BOTH, 'git@github.acme.com:team/app.git')).toEqual({
      base: 'https://github.acme.com/api/v3',
      host: 'github.acme.com',
      token: 'acme-token',
      owner: 'team',
      repo: 'app',
    })
  })

  // Not a 404 from the wrong server, and not a token sent to it either.
  test('a remote on an undeclared host is not GitHub', () => {
    expect(apiForRemote(BOTH, 'git@github.other.com:team/app.git')).toBeNull()
    expect(apiForRemote(BOTH, 'git@gitlab.com:g/p.git')).toBeNull()
    expect(apiForRemote(BOTH, '/home/me/local/repo')).toBeNull()
  })

  test('github.com still works with nothing declared', () => {
    expect(apiForRemote(COM, 'https://github.com/o/r.git')).toMatchObject({
      base: 'https://api.github.com', host: 'github.com', token: 'com-token',
    })
  })
})

// "/user" against github.com while the repository lives on an instance would
// answer with the wrong person.
describe('user-scoped calls follow the repository being worked on', () => {
  test('an instance repository makes them the instance user', () => {
    expect(apiForUser(BOTH, 'git@github.acme.com:team/app.git')).toEqual({
      base: 'https://github.acme.com/api/v3', host: 'github.acme.com', token: 'acme-token',
    })
  })

  test('no repository, or one that is not GitHub, falls back to github.com', () => {
    expect(apiForUser(BOTH)).toMatchObject({ host: 'github.com', token: 'com-token' })
    expect(apiForUser(BOTH, 'git@gitlab.com:g/p.git')).toMatchObject({ host: 'github.com' })
  })
})

describe('headers', () => {
  test('a token is sent when there is one, and the call is still made when there is not', () => {
    expect(githubHeaders({ base: 'x', host: 'github.com', token: 't' }))
      .toEqual({ Accept: 'application/vnd.github+json', Authorization: 'Bearer t' })
    expect(githubHeaders({ base: 'x', host: 'github.com' }))
      .toEqual({ Accept: 'application/vnd.github+json' })
  })
})
