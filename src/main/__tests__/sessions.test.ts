import { MAX_SESSIONS, activeSession, newSession, registerSession, requestedRepo, resetSessions, runForRepo, sessionAt, sessionFor, setActiveSession, unregisterSession } from '../sessions'

// A fake service is enough: the registry never calls it.
const svc = (tag: string) => ({ tag }) as any
const open = (path: string) => registerSession(newSession(path, path.split('/').pop()!, svc(path)))

beforeEach(() => resetSessions())

describe('which repository a request is about', () => {
  test('a request that names a repository gets that one, across awaits', async () => {
    open('/a'); open('/b')
    const seen = await runForRepo('/a', async () => {
      const before = sessionFor()?.path
      await new Promise(r => setTimeout(r, 5))
      const after = sessionFor()?.path
      return { before, after, named: requestedRepo() }
    })
    expect(seen).toEqual({ before: '/a', after: '/a', named: '/a' })
    expect(activeSession()?.path).toBe('/b')
  })

  test('a request that names nothing gets the active one; a request outside any context too', () => {
    open('/a'); open('/b')
    expect(runForRepo(null, () => sessionFor()?.path)).toBe('/b')
    expect(sessionFor()?.path).toBe('/b')
    expect(requestedRepo()).toBeNull()
  })

  test('a request naming a repository that is not open gets no service — never another repository\'s', () => {
    open('/a')
    expect(runForRepo('/gone', () => sessionFor())).toBeNull()
  })

  test('two requests in flight do not see each other', async () => {
    open('/a'); open('/b')
    const [x, y] = await Promise.all([
      runForRepo('/a', async () => { await new Promise(r => setTimeout(r, 8)); return sessionFor()?.path }),
      runForRepo('/b', async () => { await new Promise(r => setTimeout(r, 2)); return sessionFor()?.path }),
    ])
    expect([x, y]).toEqual(['/a', '/b'])
  })
})

describe('the registry', () => {
  test('opening makes active; closing the active one leaves none active', () => {
    open('/a'); open('/b')
    expect(activeSession()?.path).toBe('/b')
    setActiveSession('/a')
    expect(activeSession()?.path).toBe('/a')
    unregisterSession('/a')
    expect(activeSession()).toBeNull()
    expect(sessionAt('/b')).not.toBeNull()
  })

  test('beyond the cap the least recently active goes, never the active one', () => {
    const evictedAll: string[] = []
    for (let i = 1; i <= MAX_SESSIONS + 2; i++) evictedAll.push(...open(`/r${i}`).map(s => s.path))
    expect(evictedAll).toEqual(['/r1', '/r2'])
    expect(sessionAt('/r3')).not.toBeNull()
    expect(activeSession()?.path).toBe(`/r${MAX_SESSIONS + 2}`)
    // Touching an old one keeps it: the eviction order is last-active, not first-opened.
    setActiveSession('/r3')
    const evicted = open('/r-new').map(s => s.path)
    expect(evicted).toEqual(['/r4'])
    expect(sessionAt('/r3')).not.toBeNull()
  })
})
