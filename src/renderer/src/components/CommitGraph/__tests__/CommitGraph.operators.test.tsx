import CommitGraph from '../CommitGraph'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The search field's operators narrow the graph, alone and combined (#255):
// `author:`, `after:` and `before:` against the rows it holds, `file:` against
// what git answered — every one of them has to hold, with the words too.

beforeAll(() => { (Element.prototype as any).scrollTo = jest.fn() })

const H = (c: string) => c.repeat(40)
const daysAgo = (n: number) => new Date(Date.now() - n * 86400e3).toISOString()
const commits = [
  { hash: H('a'), author: 'Ana', message: 'cache the key', date: daysAgo(1) },
  { hash: H('b'), author: 'Bob', message: 'cache the value', date: daysAgo(3) },
  { hash: H('c'), author: 'Ana', message: 'docs', date: daysAgo(20) },
  { hash: H('d'), author: 'Ana', message: 'cache, first cut', date: daysAgo(90) },
].map((c, i, all) => ({
  ...c, shortHash: c.hash.slice(0, 7), authorEmail: `${c.author.toLowerCase()}@test.local`,
  parents: i < all.length - 1 ? [all[i + 1].hash] : [], refs: i === 0 ? ['HEAD -> main'] : [],
}))

function count(searchQuery: string, over: Record<string, unknown> = {}) {
  installMockGitAPI()
  const onSearchMatches = jest.fn()
  const view = renderWithProviders(<CommitGraph {...({ commits, selectedHash: null, onSelectCommit: jest.fn(), searchQuery, onSearchMatches, currentBranch: 'main', ...over } as any)} />)
  const n = onSearchMatches.mock.calls[onSearchMatches.mock.calls.length - 1][0]
  view.unmount()
  return n
}

test('each operator narrows on its own', () => {
  expect(count('author:ana')).toBe(3)
  expect(count('after:1w')).toBe(2)
  expect(count('before:1w')).toBe(2)
  expect(count('cache')).toBe(3)
})

test('they combine with each other and with the words', () => {
  expect(count('author:ana cache')).toBe(2)
  expect(count('author:ana after:1w cache')).toBe(1)
  expect(count('author:ana before:2w after:6m')).toBe(2)
  expect(count('author:bob before:2w')).toBe(0)
})

test('file: is git\'s answer — a row has to be among its hashes, whatever else it matches', () => {
  expect(count('file:src cache', { requiredHashes: new Set([H('b'), H('d')]) })).toBe(2)
  expect(count('file:src author:ana', { requiredHashes: new Set([H('b'), H('d')]) })).toBe(1)
  // Not answered yet: the rest of the query narrows, and the graph waits.
  expect(count('file:src cache', { requiredHashes: null })).toBe(3)
})

test('the host\'s own matches are still OR-ed with the words — and the operators hold over both', () => {
  // The extended search found `docs` by its diff; `author:bob` rules it out all the same.
  expect(count('cache', { searchHashes: new Set([H('c')]) })).toBe(4)
  expect(count('author:bob cache', { searchHashes: new Set([H('c')]) })).toBe(1)
})

test('an unknown word: is searched as text', () => {
  expect(count('cache,')).toBe(1)
  expect(count('first:')).toBe(0)
})
