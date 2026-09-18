// activity.ts — the commits of a repository as bars in time.
//
// Points (when, who) become buckets — a day, a week, a month each — with a
// total, a share per author, and the commits in it, so a bar can say what it
// counts and hand its commits to the graph. Pure; the boundaries are local
// calendar days, Monday-started weeks and calendar months, tested as such.

export interface ActivityPoint { at: number; author: string; hash: string }
export type ActivityPeriod = 'day' | 'week' | 'month'
export interface ActivityBucket {
  /** Seconds since the epoch, the bucket's first instant and the next bucket's. */
  start: number
  end: number
  total: number
  byAuthor: Record<string, number>
  hashes: string[]
}

/** How many buckets a chart of each period shows, oldest first, ending now. */
export const BUCKET_COUNT: Record<ActivityPeriod, number> = { day: 60, week: 26, month: 24 }

const DAY = 86400

function startOf(period: ActivityPeriod, date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  if (period === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7))   // back to Monday
  if (period === 'month') d.setDate(1)
  return d
}

function next(period: ActivityPeriod, date: Date): Date {
  const d = new Date(date)
  if (period === 'day') d.setDate(d.getDate() + 1)
  else if (period === 'week') d.setDate(d.getDate() + 7)
  else d.setMonth(d.getMonth() + 1)
  return d
}

/**
 * The last `count` buckets of `period`, oldest first, the newest holding now.
 * Points older than the first bucket are left out; nothing is drawn for
 * time the chart does not show.
 */
export function bucketize(points: ActivityPoint[], period: ActivityPeriod, count = BUCKET_COUNT[period], now = Date.now()): ActivityBucket[] {
  const starts: Date[] = []
  let cursor = startOf(period, new Date(now))
  for (let i = 0; i < count; i++) { starts.unshift(cursor); cursor = startOf(period, new Date(cursor.getTime() - DAY * 1000)) }
  const buckets: ActivityBucket[] = starts.map(s => ({
    start: Math.floor(s.getTime() / 1000), end: Math.floor(next(period, s).getTime() / 1000), total: 0, byAuthor: {}, hashes: [],
  }))
  const first = buckets[0].start
  const last = buckets[buckets.length - 1].end
  for (const p of points) {
    if (p.at < first || p.at >= last) continue
    // Buckets are sorted: the last one whose start is not after the point.
    let lo = 0, hi = buckets.length - 1
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (buckets[mid].start <= p.at) lo = mid; else hi = mid - 1 }
    const b = buckets[lo]
    b.total++
    b.byAuthor[p.author] = (b.byAuthor[p.author] ?? 0) + 1
    b.hashes.push(p.hash)
  }
  return buckets
}

/** The authors with the most commits across the buckets, most first — the chart's legend. */
export function topAuthors(buckets: ActivityBucket[], limit = 5): string[] {
  const totals = new Map<string, number>()
  for (const b of buckets) for (const [a, n] of Object.entries(b.byAuthor)) totals.set(a, (totals.get(a) ?? 0) + n)
  return [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([a]) => a)
}

/** "Sep 12", "Sep 12 – 18", "September 2026": a bucket's span, for its title and the axis. */
export function bucketLabel(b: ActivityBucket, period: ActivityPeriod, locale: string): string {
  const s = new Date(b.start * 1000)
  const e = new Date((b.end - 1) * 1000)
  if (period === 'month') return s.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  if (period === 'day') return s.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
  const sameMonth = s.getMonth() === e.getMonth()
  return `${s.toLocaleDateString(locale, { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString(locale, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`
}
