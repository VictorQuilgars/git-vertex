import { buildModel, dayOf, markerFor, monotonePath, nearestBusyDay, yScale } from '../minimap-model'

// The minimap's arithmetic: the days, what a decoration marks, the scale, the
// curve. The strip itself is drawn from these and nothing else.

const NOW = new Date(2026, 8, 18, 15, 0).getTime()          // Fri 18 Sep 2026, 15:00 local
const at = (daysAgo: number, hour = 12) => {
  const d = new Date(NOW); d.setDate(d.getDate() - daysAgo); d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}
const remoteOf = (ref: string) => (ref.startsWith('origin/') ? 'origin' : null)

describe('the days', () => {
  test('one slot per calendar day, newest first, from today back to the oldest commit', () => {
    const m = buildModel([
      { hash: 'a', date: at(0), refs: [] },
      { hash: 'b', date: at(0, 9), refs: [] },
      { hash: 'c', date: at(3), refs: [] },
    ], { remoteOf, now: NOW })
    expect(m.days).toHaveLength(4)
    expect(m.days[0]).toBe(dayOf(NOW))
    expect(m.byDay.get(m.days[0])?.commits).toBe(2)
    expect(m.byDay.get(m.days[0])?.hashes).toEqual(['a', 'b'])   // the graph's order
    expect(m.byDay.has(m.days[1])).toBe(false)                   // a quiet day is a slot with nothing
    expect(m.byDay.get(m.days[3])?.commits).toBe(1)
  })

  test('a history that crosses a clock change still gives one slot per day', () => {
    // 25 Oct 2026 is 25 hours long in Europe; a day stepped as 24 h would skip or repeat one.
    const now = new Date(2026, 9, 28, 12).getTime()
    const m = buildModel([{ hash: 'a', date: new Date(2026, 9, 20, 12).toISOString(), refs: [] }], { remoteOf, now })
    expect(m.days).toHaveLength(9)
    expect(new Set(m.days.map(d => new Date(d).getDate()))).toEqual(new Set([28, 27, 26, 25, 24, 23, 22, 21, 20]))
  })

  test('lines are what was added and removed, and the search counts its matches', () => {
    const m = buildModel([
      { hash: 'a', date: at(1), refs: [], additions: 10, deletions: 2 },
      { hash: 'b', date: at(1), refs: [], additions: 1, deletions: 0 },
    ], { remoteOf, now: NOW, matches: new Set(['b']) })
    const d = m.byDay.get(m.days[1])!
    expect([d.lines, d.additions, d.deletions, d.matches]).toEqual([13, 11, 2, 1])
  })

  test('an unreadable date is left out rather than put on day zero', () => {
    const m = buildModel([{ hash: 'a', date: 'not a date', refs: [] }], { remoteOf, now: NOW })
    expect(m.days).toEqual([dayOf(NOW)])
    expect(m.byDay.size).toBe(0)
  })
})

describe('what a decoration marks', () => {
  test.each([
    ['HEAD -> main', { kind: 'head', name: 'main' }],
    ['feature/login', { kind: 'local', name: 'feature/login' }],   // a slash is not a remote
    ['origin/main', { kind: 'remote', name: 'origin/main' }],
    ['tag: v1.2.0', { kind: 'tag', name: 'v1.2.0' }],
    ['refs/stash', { kind: 'stash', name: 'stash' }],
  ])('%s', (ref, expected) => {
    expect(markerFor(ref, remoteOf)).toEqual(expected)
  })

  test('the remote HEAD pointer is not a branch', () => {
    expect(markerFor('origin/HEAD', remoteOf)).toBeNull()
  })
})

describe('the scale', () => {
  test('one enormous day does not flatten every other one', () => {
    const top = yScale([2, 3, 1, 2, 4, 3, 2, 400])
    expect(top).toBeLessThan(50)
    expect(top).toBeGreaterThanOrEqual(4)
  })

  test('an empty history still has a scale', () => {
    expect(yScale([0, 0])).toBe(1)
  })
})

describe('the curve', () => {
  test('never overshoots the points it passes through', () => {
    const d = monotonePath([0, 10, 20, 30, 40], [30, 0, 30, 30, 0])
    const ys = [...d.matchAll(/[MC,]\s*(-?[\d.]+),(-?[\d.]+)/g)].map(m => Number(m[2]))
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...ys)).toBeLessThanOrEqual(30)
  })

  test('two points are a line, one is a point', () => {
    expect(monotonePath([0, 5], [1, 2])).toBe('M0,1L5,2')
    expect(monotonePath([3], [4])).toBe('M3,4')
  })
})

test('a click on an empty day lands on the nearest one with commits', () => {
  const m = buildModel([{ hash: 'a', date: at(0), refs: [] }, { hash: 'b', date: at(5), refs: [] }], { remoteOf, now: NOW })
  expect(nearestBusyDay(m, m.days, 1, 2)).toBe(m.days[0])
  expect(nearestBusyDay(m, m.days, 3, 1)).toBeNull()
  expect(nearestBusyDay(m, m.days, 4, 1)).toBe(m.days[5])
})
