import { periodOf, periodLabel, periodBoundaries, periodAt } from '../timeline'

// The stretches of time the graph groups its rows by, and where one ends.

const now = new Date(2026, 8, 18, 15, 30)   // Friday 18 September 2026, mid-afternoon
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h)

describe('which stretch a commit falls in', () => {
  test('today is the calendar day, whatever the hour', () => {
    expect(periodOf(at(2026, 9, 18, 0), now)).toBe('today')
    expect(periodOf(at(2026, 9, 18, 23), now)).toBe('today')
  })
  test('a clock a little ahead of ours is still today', () => {
    expect(periodOf(at(2026, 9, 19, 1), now)).toBe('today')
  })
  test('yesterday, then the last seven days, then the month', () => {
    expect(periodOf(at(2026, 9, 17), now)).toBe('yesterday')
    expect(periodOf(at(2026, 9, 12), now)).toBe('week')
    expect(periodOf(at(2026, 9, 11), now)).toBe('month')
    expect(periodOf(at(2026, 9, 1), now)).toBe('month')
  })
  test('older is the month it happened in', () => {
    expect(periodOf(at(2026, 8, 31), now)).toBe('2026-08')
    expect(periodOf(at(2025, 12, 25), now)).toBe('2025-12')
  })
  test('a date git could not give is no stretch at all', () => {
    expect(periodOf('not a date', now)).toBeNull()
  })
})

describe('the words for a stretch', () => {
  const t = (k: string) => ({ 'graph.period.today': 'Today', 'graph.period.yesterday': 'Yesterday', 'graph.period.week': 'This week', 'graph.period.month': 'This month' } as Record<string, string>)[k]
  test('the relative ones are translated, a month is spelled by the locale', () => {
    expect(periodLabel('today', t as any, 'en-US')).toBe('Today')
    expect(periodLabel('2026-08', t as any, 'en-US')).toBe('August 2026')
    expect(periodLabel('2025-12', t as any, 'fr-FR')).toBe('Décembre 2025')
  })
})

describe('where a stretch begins', () => {
  test('every change of stretch is a boundary, the first row is not, rows with none are skipped', () => {
    const periods = [null, 'today', 'today', 'yesterday', null, 'yesterday', 'week', '2026-08'] as any
    expect([...periodBoundaries(periods)]).toEqual([3, 6, 7])
  })
  test('the band names the first row with a stretch at or after the top', () => {
    const periods = [null, 'today', 'yesterday'] as any
    expect(periodAt(periods, 0)).toBe('today')
    expect(periodAt(periods, 2)).toBe('yesterday')
    expect(periodAt(periods, 5)).toBeNull()
  })
})
