import { act, fireEvent } from '@testing-library/react'
import CommitGraph from '../CommitGraph'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The graph names the stretch of time it is scrolled to and marks where one
// stretch ends. jsdom does not scroll: the band is the first row's stretch.

beforeAll(() => { (Element.prototype as any).scrollTo = jest.fn() })

const iso = (daysAgo: number) => {
  const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(12, 0, 0, 0)
  return d.toISOString()
}
const HASHES = ['aaaa111aaaa111aaaa111aaaa111aaaa111aaaa1', 'bbbb222bbbb222bbbb222bbbb222bbbb222bbbb2', 'cccc333cccc333cccc333cccc333cccc333cccc3', 'dddd444dddd444dddd444dddd444dddd444dddd4']
const commits = (days: number[]) => HASHES.slice(0, days.length).map((hash, i) => ({
  hash, shortHash: hash.slice(0, 7), message: `commit ${i}`,
  author: 'Alice', authorEmail: 'alice@test.local', date: iso(days[i]),
  parents: i < days.length - 1 ? [HASHES[i + 1]] : [], refs: i === 0 ? ['HEAD -> main'] : [],
}))

function draw(days: number[]) {
  installMockGitAPI()
  renderWithProviders(<CommitGraph {...({
    commits: commits(days), selectedHash: null, onSelectCommit: jest.fn(), searchQuery: '', currentBranch: 'main', onCheckoutBranch: jest.fn(),
  } as any)} />)
}

describe('the stretches of time', () => {
  test('a page spanning several stretches wears the band and the hairlines', () => {
    draw([0, 0, 1, 60])          // today ×2, yesterday, two months ago
    expect(document.querySelector('.cg-period-pill')).toHaveTextContent('Today')
    expect(document.querySelectorAll('.cg-period-sep')).toHaveLength(2)
  })

  test('a page of one afternoon has nothing to name', () => {
    draw([0, 0, 0])
    expect(document.querySelector('.cg-period-pill')).toBeNull()
    expect(document.querySelectorAll('.cg-period-sep')).toHaveLength(0)
  })

  // The band answers "where am I in time" while the rows move. Standing still
  // it stated the top row's own date again, in a chip that covered that row's
  // sha and read as though it belonged to the row.
  describe('the band comes with the movement', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    const band = () => document.querySelector('.cg-period-band')

    test('is out of sight until the graph is scrolled', () => {
      draw([0, 0, 1, 60])
      expect(band()).not.toHaveClass('cg-period-band--on')
    })

    test('shows on a scroll, and goes once the scrolling stops', () => {
      draw([0, 0, 1, 60])
      const body = document.querySelector('.cg-body')!
      act(() => { fireEvent.scroll(body) })
      expect(band()).toHaveClass('cg-period-band--on')
      // Still there between two flicks of a trackpad…
      act(() => { jest.advanceTimersByTime(400); fireEvent.scroll(body) })
      expect(band()).toHaveClass('cg-period-band--on')
      // …and gone once nothing has moved for a moment.
      act(() => { jest.advanceTimersByTime(1000) })
      expect(band()).not.toHaveClass('cg-period-band--on')
    })
  })
})
