import { isSafeExternalUrl } from '../external-url'

describe('what the app agrees to open externally', () => {
  test('web pages and mail', () => {
    expect(isSafeExternalUrl('https://github.com/VictorQuilgars/git-vertex/pull/1')).toBe(true)
    expect(isSafeExternalUrl('http://localhost:3000/')).toBe(true)
    expect(isSafeExternalUrl('mailto:someone@example.com')).toBe(true)
  })

  test('nothing that would run a program or read a file', () => {
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('vscode://some.extension/do')).toBe(false)
    expect(isSafeExternalUrl('smb://server/share')).toBe(false)
    expect(isSafeExternalUrl('ssh://git@github.com/x/y.git')).toBe(false)
  })

  test('scheme tricks', () => {
    expect(isSafeExternalUrl(' https://a.b')).toBe(true)      // URL() trims
    expect(isSafeExternalUrl('HTTPS://a.b')).toBe(true)       // scheme is case-insensitive
    expect(isSafeExternalUrl('https:/a.b')).toBe(true)        // parses as https
    expect(isSafeExternalUrl('//a.b')).toBe(false)            // no scheme at all
    expect(isSafeExternalUrl('not a url')).toBe(false)
    expect(isSafeExternalUrl('')).toBe(false)
    expect(isSafeExternalUrl(undefined)).toBe(false)
    expect(isSafeExternalUrl(42)).toBe(false)
  })
})
