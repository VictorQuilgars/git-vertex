import { gravatarUrl } from '../gravatar'

describe('gravatarUrl', () => {
  // MD5 hash is verified against well-known vectors so we know the internal
  // implementation is correct.
  test('produces the documented Gravatar hash for the example email', () => {
    // Gravatar's own documented example email + hash
    const url = gravatarUrl('MyEmailAddress@example.com')
    expect(url).toContain('0bc83cb571cd1c50ba6f3e8a78ef1346')
  })

  test('hashes the empty string to the known MD5 value', () => {
    const url = gravatarUrl('')
    expect(url).toContain('d41d8cd98f00b204e9800998ecf8427e')
  })

  test('trims and lowercases the email before hashing', () => {
    const a = gravatarUrl('  Test@Example.COM  ')
    const b = gravatarUrl('test@example.com')
    const hashA = a.match(/avatar\/([0-9a-f]{32})/)?.[1]
    const hashB = b.match(/avatar\/([0-9a-f]{32})/)?.[1]
    expect(hashA).toBe(hashB)
  })

  test('includes the requested size and a 404 default for graceful fallback', () => {
    const url = gravatarUrl('test@example.com', 64)
    expect(url).toContain('s=64')
    expect(url).toContain('d=404')
    expect(url.startsWith('https://www.gravatar.com/avatar/')).toBe(true)
  })

  test('produces a 32-char hex hash for unicode emails (UTF-8 handling)', () => {
    const url = gravatarUrl('tëst@exàmple.com')
    const hash = url.match(/avatar\/([0-9a-f]{32})/)?.[1]
    expect(hash).toHaveLength(32)
  })
})
