import { computeGraphLayout } from '../graph-layout'
import { OVERSCAN_ROWS, edgesInWindow, inWindow, rowWindow, rowsToDraw } from '../graph-window'

// The graph draws the rows near the viewport, not every row it holds. These
// are the rules of that window; CommitGraph.window.test.tsx is what they look
// like in the DOM.

const hash = (i: number) => `h${String(i).padStart(4, '0')}`
/** A straight line of `n` commits, newest first. */
const line = (n: number) => Array.from({ length: n }, (_, i) => ({
  hash: hash(i), shortHash: hash(i), message: `commit ${i}`,
  author: 'Ada', authorEmail: 'ada@test.local', date: '2026-08-01T10:00:00',
  parents: i < n - 1 ? [hash(i + 1)] : [], refs: [] as string[],
}))

describe('rowWindow', () => {
  test('the visible rows, with an overscan on both sides', () => {
    expect(rowWindow(100, 130, 1000)).toEqual({ start: 100 - OVERSCAN_ROWS, end: 130 + OVERSCAN_ROWS })
    expect(rowWindow(100, 130, 1000, 5)).toEqual({ start: 95, end: 135 })
  })

  test('clamped to the rows there are', () => {
    expect(rowWindow(0, 20, 1000, 10)).toEqual({ start: 0, end: 30 })
    expect(rowWindow(990, 999, 1000, 10)).toEqual({ start: 980, end: 999 })
    expect(rowWindow(0, 4000, 12, 10)).toEqual({ start: 0, end: 11 })
  })

  test('a viewport scrolled past a list that shrank still lands on rows', () => {
    // A filter or a refresh took rows away while the body was scrolled down.
    expect(rowWindow(800, 830, 50, 10)).toEqual({ start: 39, end: 49 })
  })

  test('an inverted or empty measure draws the first row, no rows is no window', () => {
    expect(rowWindow(40, 0, 100, 0)).toEqual({ start: 40, end: 40 })
    const none = rowWindow(0, 0, 0)
    expect(none.end).toBeLessThan(none.start)
    expect(inWindow(none, 0)).toBe(false)
  })

  test('its size does not depend on how many rows are loaded', () => {
    const size = (total: number) => { const w = rowWindow(200, 240, total); return w.end - w.start + 1 }
    expect(size(500)).toBe(size(50000))
  })
})

describe('rowsToDraw', () => {
  const layout = computeGraphLayout(line(300))

  test('is the window, in order', () => {
    const rows = rowsToDraw(layout, { start: 100, end: 120 })
    expect(rows).toHaveLength(21)
    expect(rows[0].row).toBe(100)
    expect(rows[20].row).toBe(120)
  })

  test('a pinned row outside the window is drawn too, where it belongs', () => {
    const above = rowsToDraw(layout, { start: 100, end: 120 }, [hash(3)])
    expect(above.map(c => c.row)).toEqual([3, ...Array.from({ length: 21 }, (_, i) => 100 + i)])
    const below = rowsToDraw(layout, { start: 100, end: 120 }, [hash(250), null, undefined])
    expect(below[below.length - 1].row).toBe(250)
    expect(below).toHaveLength(22)
  })

  test('a pinned row inside the window is not drawn twice, an unknown one is nothing', () => {
    expect(rowsToDraw(layout, { start: 100, end: 120 }, [hash(110), hash(110), 'nope'])).toHaveLength(21)
  })

  test('no window, no rows — but a pinned row still', () => {
    expect(rowsToDraw(layout, { start: 0, end: -1 })).toEqual([])
    expect(rowsToDraw(layout, { start: 0, end: -1 }, [hash(7)]).map(c => c.row)).toEqual([7])
  })
})

describe('edgesInWindow', () => {
  test('a straight line: one edge per row of the window, and the one coming in from above', () => {
    const layout = computeGraphLayout(line(300))
    const edges = edgesInWindow(layout, { start: 100, end: 120 })
    // Row 99 → 100 enters the window; rows 100…120 each leave for the next.
    expect(edges.map(e => e.commit.row)).toEqual(Array.from({ length: 22 }, (_, i) => 99 + i))
  })

  test('an edge with both ends off screen still crosses the window', () => {
    // main is one long line; a branch forks from its LAST commit and is merged
    // by its FIRST: the merge edge and the branch's rail span every row.
    const main = line(200)
    const tip = { ...main[0], hash: 'merge', parents: [hash(0), 'side'] }
    const side = { ...main[0], hash: 'side', message: 'side', parents: [hash(199)] }
    const layout = computeGraphLayout([tip, side, ...main])
    const w = { start: 80, end: 100 }
    const crossing = edgesInWindow(layout, w).filter(({ commit, edge }) =>
      Math.min(commit.row, edge.toRow) < w.start && Math.max(commit.row, edge.toRow) > w.end)
    expect(crossing.map(e => e.commit.hash)).toEqual(['side'])
  })

  test('nothing outside it', () => {
    const layout = computeGraphLayout(line(300))
    for (const { commit, edge } of edgesInWindow(layout, { start: 100, end: 120 })) {
      expect(Math.max(commit.row, edge.toRow)).toBeGreaterThanOrEqual(100)
      expect(Math.min(commit.row, edge.toRow)).toBeLessThanOrEqual(120)
    }
    expect(edgesInWindow(layout, { start: 0, end: -1 })).toEqual([])
  })
})
