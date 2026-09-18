import CommitGraph from '../CommitGraph'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// `author:name` in the search narrows to who wrote the commit and nothing
// else; a bare word still matches the message, the author and the hash.

beforeAll(() => { (Element.prototype as any).scrollTo = jest.fn() })

const HASHES = ['aaaa111aaaa111aaaa111aaaa111aaaa111aaaa1', 'bbbb222bbbb222bbbb222bbbb222bbbb222bbbb2', 'cccc333cccc333cccc333cccc333cccc333cccc3']
const commits = [
  { author: 'Alice', message: 'bob: fix the thing' },
  { author: 'Bob', message: 'add a test' },
  { author: 'Alice', message: 'release' },
].map((c, i) => ({
  hash: HASHES[i], shortHash: HASHES[i].slice(0, 7), message: c.message, author: c.author, authorEmail: 'x@test.local',
  date: '2026-08-01T10:00:00', parents: i < 2 ? [HASHES[i + 1]] : [], refs: i === 0 ? ['HEAD -> main'] : [],
}))

function draw(searchQuery: string) {
  installMockGitAPI()
  const onSearchMatches = jest.fn()
  renderWithProviders(<CommitGraph {...({ commits, selectedHash: null, onSelectCommit: jest.fn(), searchQuery, onSearchMatches, currentBranch: 'main', onCheckoutBranch: jest.fn() } as any)} />)
  return onSearchMatches
}
const lastCount = (fn: jest.Mock) => fn.mock.calls[fn.mock.calls.length - 1][0]

describe('the author filter', () => {
  test('author: keeps only that author, whatever the message says', () => {
    expect(lastCount(draw('author:bob'))).toBe(1)
    expect(document.querySelectorAll('.cg-dimmed')).toHaveLength(2)
  })
  test('a bare word matches the message too', () => {
    expect(lastCount(draw('bob'))).toBe(2)
  })
})
