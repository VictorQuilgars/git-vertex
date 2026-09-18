// timeline.ts — which stretch of time a commit belongs to.
//
// The graph groups its rows by when they happened: today, yesterday, this
// week, this month, then month by month. A band at the top of the graph names
// the stretch the first visible row is in, and a hairline marks where one
// stretch ends and the next begins. Pure, so the boundaries are testable
// without a graph.

export type PeriodKey = 'today' | 'yesterday' | 'week' | 'month' | `${number}-${string}`

const DAY = 24 * 60 * 60 * 1000

/** Midnight, local time, of the day `d` is in. */
function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/**
 * The stretch `date` falls in, seen from `now`. A date that cannot be read is
 * `null` — the row simply belongs to no stretch, like the working changes.
 */
export function periodOf(date: string | Date, now: Date = new Date()): PeriodKey | null {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return null
  const days = Math.floor((dayStart(now) - dayStart(d)) / DAY)
  if (days <= 0) return 'today'          // today, and a clock a little ahead of ours
  if (days === 1) return 'yesterday'
  if (days < 7) return 'week'
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return 'month'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * The words for a stretch. The four relative ones are translated; a month is
 * spelled by the locale, which knows its own month names.
 */
export function periodLabel(
  key: PeriodKey,
  t: (k: 'graph.period.today' | 'graph.period.yesterday' | 'graph.period.week' | 'graph.period.month') => string,
  locale: string,
): string {
  switch (key) {
    case 'today': return t('graph.period.today')
    case 'yesterday': return t('graph.period.yesterday')
    case 'week': return t('graph.period.week')
    case 'month': return t('graph.period.month')
    default: {
      const [y, m] = key.split('-').map(Number)
      const label = new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
      return label.charAt(0).toUpperCase() + label.slice(1)
    }
  }
}

/**
 * The rows where a new stretch begins: every row whose stretch differs from
 * the previous row that had one. The first row is never a boundary — the
 * band already names its stretch.
 */
export function periodBoundaries(periods: (PeriodKey | null)[]): Set<number> {
  const out = new Set<number>()
  let last: PeriodKey | null = null
  periods.forEach((p, i) => {
    if (p === null) return
    if (last !== null && p !== last) out.add(i)
    last = p
  })
  return out
}

/** The stretch of the first row at or after `row` that has one. */
export function periodAt(periods: (PeriodKey | null)[], row: number): PeriodKey | null {
  for (let i = Math.max(0, row); i < periods.length; i++) if (periods[i]) return periods[i]
  return null
}
