import { act, fireEvent } from '@testing-library/react'
import CommitGraph from '../CommitGraph'
import { OVERSCAN_ROWS, UNMEASURED_ROWS } from '../graph-window'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The graph holds every commit it has loaded and draws the rows near the
// viewport. What must stay true: the number of elements is bounded by the
// viewport whatever was loaded, the scroll height is the whole history's, and
// nothing that works on a row — the keys, the selection — needs it on screen.

beforeAll(() => { (Element.prototype as any).scrollTo = jest.fn() })

const hash = (i: number) => `c${String(i).padStart(5, '0')}`.padEnd(40, '0')
const history = (n: number) => Array.from({ length: n }, (_, i) => ({
  hash: hash(i), shortHash: hash(i).slice(0, 7), message: `commit ${i}`,
  author: 'Alice', authorEmail: 'alice@test.local', date: '2026-08-01T10:00:00',
  parents: i < n - 1 ? [hash(i + 1)] : [],
  refs: i === 0 ? ['HEAD -> main'] : [],
}))

function draw(n: number, over: Record<string, any> = {}) {
  installMockGitAPI()
  const props = {
    commits: history(n), selectedHash: null,
    onSelectCommit: jest.fn(), searchQuery: '', currentBranch: 'main',
    ...over,
  }
  const view = renderWithProviders(<CommitGraph {...(props as any)} />)
  return { props, ...view }
}
const rows = () => document.querySelectorAll('.cg-row')
const body = () => document.querySelector('.cg-body') as HTMLElement

/** Give the body a height and a scroll position, then tell the graph. */
async function scrollTo(top: number, height = 560) {
  const el = body()
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: height })
  Object.defineProperty(el, 'scrollTop', { configurable: true, writable: true, value: top })
  await act(async () => {
    fireEvent.scroll(el)
    await new Promise(r => requestAnimationFrame(() => r(null)))
  })
}

describe('the graph draws the rows near the viewport', () => {
  test('a short history is drawn whole', () => {
    draw(12)
    expect(rows()).toHaveLength(12)
  })

  test('the number of row elements does not follow the number of commits loaded', () => {
    draw(500)
    const few = rows().length
    expect(few).toBeLessThanOrEqual(UNMEASURED_ROWS + OVERSCAN_ROWS + 1)
    document.body.innerHTML = ''
    draw(3000)
    expect(rows().length).toBe(few)
  })

  test('the scroll height is the whole history\'s, and says how many rows it stands for', () => {
    draw(3000)
    const content = document.querySelector('.cg-scroll-content') as HTMLElement
    expect(content.dataset.rows).toBe('3000')
    // jsdom has no stylesheet: the fallback row height is what is multiplied.
    expect(parseInt(content.style.height, 10)).toBeGreaterThanOrEqual(3000 * 20)
  })

  test('scrolling moves the window: the rows on screen exist, the first ones are gone', async () => {
    draw(3000)
    const rowH = parseInt((rows()[1] as HTMLElement).style.top, 10)
    await scrollTo(1500 * rowH)
    const drawn = Array.from(rows()).map(r => r.textContent ?? '')
    expect(drawn.some(t => t.includes('commit 1500'))).toBe(true)
    expect(drawn.some(t => t.includes('commit 1510'))).toBe(true)
    expect(drawn.some(t => /commit 0\b/.test(t))).toBe(false)
    expect(rows().length).toBeLessThanOrEqual(Math.ceil(560 / rowH) + 2 * OVERSCAN_ROWS + 2)
  })

  test('the selected row is drawn wherever the viewport is', async () => {
    draw(3000, { selectedHash: hash(2) })
    const rowH = parseInt((rows()[1] as HTMLElement).style.top, 10)
    await scrollTo(2000 * rowH)
    const selected = document.querySelector('.cg-row.cg-selected')
    expect(selected?.textContent).toContain('commit 2')
  })

  test('End reaches a row that was never drawn, and the arrows walk past the window', () => {
    const { props } = draw(3000, { selectedHash: hash(54) })
    fireEvent.keyDown(window, { key: 'End' })
    expect(props.onSelectCommit.mock.calls[0][0].hash).toBe(hash(2999))
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(props.onSelectCommit.mock.calls[1][0].hash).toBe(hash(55))
  })

  test('an edge is drawn for the rows on screen, not for every commit', async () => {
    draw(3000)
    const lines = () => document.querySelectorAll('.cg-graph-svg line, .cg-graph-svg path').length
    expect(lines()).toBeLessThan(200)
    const rowH = parseInt((rows()[1] as HTMLElement).style.top, 10)
    await scrollTo(1500 * rowH)
    expect(lines()).toBeGreaterThan(10)
    expect(lines()).toBeLessThan(200)
  })

  test('the search still counts every commit loaded, drawn or not', () => {
    const onSearchMatches = jest.fn()
    draw(3000, { searchQuery: 'commit 29', onSearchMatches })
    // "commit 29", "commit 290"…"commit 299", "commit 2900"…"commit 2999".
    expect(onSearchMatches).toHaveBeenLastCalledWith(1 + 10 + 100)
  })
})
