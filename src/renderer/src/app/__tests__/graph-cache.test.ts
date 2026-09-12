import { CACHE_VERSION, MAX_AGE_MS, MAX_COMMITS, MAX_REPOS, forgetGraph, hasGraph, readGraph, writeGraph, type CachedGraph, type StorageLike } from '../graph-cache'

// The cache draws the previous visit while git is still answering. It is never
// an answer itself: every restore is followed by the real refresh. So what
// matters here is that it is honest about having nothing — a wrong shape, a
// version it does not speak, an age that makes it a different repository —
// and that it never throws into a caller who only wanted to paint a window.

function store(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v) },
    removeItem: (k) => { map.delete(k) },
  }
}

const commit = (h: string) => ({ hash: h.repeat(40).slice(0, 40), shortHash: h.repeat(7), message: h, author: 'A', authorEmail: 'a@b.c', date: '', parents: [], refs: [] })
const graph = (over: Partial<CachedGraph> = {}): CachedGraph => ({
  commits: [commit('a')] as any,
  branches: [{ name: 'main', current: true, remote: false, commit: 'aaa', label: 'x' }],
  currentBranch: 'main',
  stashes: [],
  tags: [],
  tracking: { ahead: 1, behind: 2 },
  logLimit: 500,
  ...over,
})

test('what was written comes back', () => {
  const s = store()
  writeGraph('/repo', graph(), s)
  expect(hasGraph('/repo', s)).toBe(true)
  const back = readGraph('/repo', s)
  expect(back?.currentBranch).toBe('main')
  expect(back?.commits.map(c => c.message)).toEqual(['a'])
  expect(back?.tracking).toEqual({ ahead: 1, behind: 2 })
})

test('a repository never seen has nothing, and says so without throwing', () => {
  const s = store()
  expect(hasGraph('/nope', s)).toBe(false)
  expect(readGraph('/nope', s)).toBeNull()
})

test('a page is kept, not a history — and the limit follows what was kept', () => {
  const s = store()
  const many = Array.from({ length: MAX_COMMITS + 250 }, (_, i) => commit(String(i % 10)))
  writeGraph('/repo', graph({ commits: many as any, logLimit: 3000 }), s)
  const back = readGraph('/repo', s)
  expect(back?.commits).toHaveLength(MAX_COMMITS)
  expect(back?.logLimit).toBe(MAX_COMMITS)
})

test('the oldest repository goes when there are too many', () => {
  const s = store()
  for (let i = 0; i < MAX_REPOS + 2; i++) writeGraph(`/r${i}`, graph(), s)
  expect(hasGraph('/r0', s)).toBe(false)
  expect(hasGraph('/r1', s)).toBe(false)
  expect(hasGraph(`/r${MAX_REPOS + 1}`, s)).toBe(true)
})

test('an entry older than a month is not drawn, and is dropped on the way out', () => {
  const s = store()
  writeGraph('/repo', graph(), s)
  const raw = JSON.parse(s.map.get('gv:graph:/repo')!)
  raw.savedAt = Date.now() - MAX_AGE_MS - 1
  s.map.set('gv:graph:/repo', JSON.stringify(raw))
  expect(readGraph('/repo', s)).toBeNull()
  expect(s.map.has('gv:graph:/repo')).toBe(false)
})

test('an entry from another version of the app is dropped rather than read', () => {
  const s = store()
  writeGraph('/repo', graph(), s)
  const raw = JSON.parse(s.map.get('gv:graph:/repo')!)
  raw.version = CACHE_VERSION + 1
  s.map.set('gv:graph:/repo', JSON.stringify(raw))
  expect(readGraph('/repo', s)).toBeNull()
})

test.each([
  ['not JSON at all', '{{{'],
  ['a shape with no commits', JSON.stringify({ version: CACHE_VERSION, savedAt: Date.now(), branches: [] })],
  ['commits that are not commits', JSON.stringify({ version: CACHE_VERSION, savedAt: Date.now(), commits: [{ nope: 1 }], branches: [] })],
])('%s reads as nothing', (_label, payload) => {
  const s = store()
  s.map.set('gv:graph:/repo', payload)
  expect(readGraph('/repo', s)).toBeNull()
})

test('forgetting a repository takes it out of the index too', () => {
  const s = store()
  writeGraph('/repo', graph(), s)
  forgetGraph('/repo', s)
  expect(hasGraph('/repo', s)).toBe(false)
  expect(readGraph('/repo', s)).toBeNull()
})

// A cache is never worth an error: a storage that refuses everything must look
// exactly like a first visit.
test('a storage that throws on every call is survivable', () => {
  const hostile: StorageLike = {
    getItem() { throw new Error('denied') },
    setItem() { throw new Error('denied') },
    removeItem() { throw new Error('denied') },
  }
  expect(() => writeGraph('/repo', graph(), hostile)).not.toThrow()
  expect(hasGraph('/repo', hostile)).toBe(false)
  expect(readGraph('/repo', hostile)).toBeNull()
  expect(() => forgetGraph('/repo', hostile)).not.toThrow()
})

test('a storage that is full keeps the newest rather than nothing', () => {
  const s = store()
  writeGraph('/old', graph(), s)
  let full = true
  const limited: StorageLike = {
    getItem: s.getItem,
    setItem: (k, v) => { if (full && k.endsWith('/new')) { full = false; throw new Error('quota') } s.setItem(k, v) },
    removeItem: s.removeItem,
  }
  writeGraph('/new', graph(), limited)
  expect(readGraph('/new', s)?.currentBranch).toBe('main')
  expect(hasGraph('/old', s)).toBe(false)
})
