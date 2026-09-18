// minimap-model.ts — the graph's commits as activity over days, for the strip that
// sits above the graph.
//
// Built from the rows the graph has loaded and nothing else, so a day on the
// strip is always a day the graph can scroll to: what is hidden from the graph
// is not counted, and loading more history widens the strip. One slot per
// local calendar day, newest first, from today back to the oldest loaded
// commit. Pure, so the days, the scale and the curve are testable without a
// canvas.

export const DAY_MS = 24 * 60 * 60 * 1000

export type MinimapDataType = 'commits' | 'lines'
export type MinimapMarkerKind = 'head' | 'local' | 'remote' | 'tag' | 'stash'
/** The marker kinds a user can switch on and off — HEAD is always drawn. */
export type MinimapMarkerOption = Exclude<MinimapMarkerKind, 'head'>
export const MARKER_OPTIONS: MinimapMarkerOption[] = ['local', 'remote', 'tag', 'stash']
export const DEFAULT_MARKERS: MinimapMarkerOption[] = ['local', 'stash']

export interface MinimapMarker { kind: MinimapMarkerKind; name: string }

export interface MinimapDay {
  /** Local midnight of the day, in ms. */
  day: number
  commits: number
  /** Lines added plus lines removed, merges counting none. */
  lines: number
  additions: number
  deletions: number
  /** The day's commits, in the graph's order — newest first. */
  hashes: string[]
  /** How many of them the current search matches. */
  matches: number
  markers: MinimapMarker[]
}

export interface MinimapModel {
  /** Every day from the newest (today) back to the oldest commit, newest first. */
  days: number[]
  byDay: Map<number, MinimapDay>
}

/** The commit fields the strip reads — a `CommitNode` has them all. */
export interface MinimapCommit {
  hash: string
  date: string
  refs: string[]
  additions?: number
  deletions?: number
}

/** Local midnight of the day `ms` falls in. */
export function dayOf(ms: number): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** The day before `day`, as a calendar reads it — 23 or 25 hours across a clock change. */
function previousDay(day: number): number {
  const d = new Date(day)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1).getTime()
}

/**
 * What a decoration from `%D` puts on the strip, or null for nothing. A
 * remote branch reads `origin/x` with no marker saying so; `remoteOf` knows
 * the remotes, the way the graph's own chips do.
 */
export function markerFor(ref: string, remoteOf: (ref: string) => string | null): MinimapMarker | null {
  const r = ref.trim()
  if (!r || r === 'HEAD' || /(^|\/)HEAD$/.test(r)) return null
  if (r.startsWith('HEAD -> ')) return { kind: 'head', name: r.slice('HEAD -> '.length) }
  if (r === 'refs/stash') return { kind: 'stash', name: 'stash' }
  if (r.startsWith('tag:')) return { kind: 'tag', name: r.slice('tag:'.length).trim() }
  if (remoteOf(r)) return { kind: 'remote', name: r.replace(/^remotes\//, '') }
  return { kind: 'local', name: r }
}

export function buildModel(
  commits: MinimapCommit[],
  opts: {
    remoteOf: (ref: string) => string | null
    /** Matching hashes of the current search, or null when nothing is searched. */
    matches?: Set<string> | null
    now?: number
  },
): MinimapModel {
  const byDay = new Map<number, MinimapDay>()
  let oldest = dayOf(opts.now ?? Date.now())
  const newest = oldest
  for (const c of commits) {
    const at = new Date(c.date).getTime()
    if (isNaN(at)) continue
    const day = dayOf(at)
    let d = byDay.get(day)
    if (!d) {
      d = { day, commits: 0, lines: 0, additions: 0, deletions: 0, hashes: [], matches: 0, markers: [] }
      byDay.set(day, d)
    }
    d.commits++
    d.additions += c.additions ?? 0
    d.deletions += c.deletions ?? 0
    d.lines = d.additions + d.deletions
    d.hashes.push(c.hash)
    if (opts.matches?.has(c.hash)) d.matches++
    for (const ref of c.refs) {
      const m = markerFor(ref, opts.remoteOf)
      if (m) d.markers.push(m)
    }
    if (day < oldest) oldest = day
  }
  // A commit dated in the future (a clock ahead of ours) still gets its slot.
  let first = newest
  for (const day of byDay.keys()) if (day > first) first = day
  const days: number[] = []
  for (let day = first; day >= oldest; day = previousDay(day)) days.push(day)
  return { days, byDay }
}

/**
 * The top of the scale: the busiest day, unless it is an outlier. One day
 * that rewrote a thousand lines would otherwise flatten every other day to
 * the baseline. Capped at the larger of the 95th percentile and the Tukey
 * upper fence, whichever holds the body of the data, plus a tenth of air.
 */
export function yScale(values: number[]): number {
  const sorted = values.filter(v => v > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return 1
  const q = (p: number) => {
    const pos = (sorted.length - 1) * p
    const lo = Math.floor(pos), hi = Math.ceil(pos)
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
  }
  const q1 = q(0.25), q3 = q(0.75)
  const p95 = sorted[Math.floor((sorted.length - 1) * 0.95)]
  const max = sorted[sorted.length - 1]
  const cap = Math.min(max, Math.max(p95, q3 + 1.5 * (q3 - q1)))
  return Math.max(1, Math.ceil(cap * 1.1))
}

/**
 * A smooth line through the points that never overshoots them — a busy day
 * next to an empty one must not dip the curve below zero. Monotone cubic
 * interpolation (Fritsch–Carlson), the curve d3 calls `monotoneX`.
 */
export function monotonePath(xs: number[], ys: number[]): string {
  const n = xs.length
  if (n === 0) return ''
  const r = (v: number) => Math.round(v * 100) / 100
  if (n === 1) return `M${r(xs[0])},${r(ys[0])}`
  if (n === 2) return `M${r(xs[0])},${r(ys[0])}L${r(xs[1])},${r(ys[1])}`
  const slopes: number[] = []
  for (let i = 0; i < n - 1; i++) slopes.push((ys[i + 1] - ys[i]) / ((xs[i + 1] - xs[i]) || 1))
  const tangents: number[] = [slopes[0]]
  for (let i = 1; i < n - 1; i++) {
    const a = slopes[i - 1], b = slopes[i]
    tangents.push(a * b <= 0 ? 0 : (3 * a * b) / (Math.max(a, b) + 2 * Math.min(a, b)) || 0)
  }
  tangents.push(slopes[n - 2])
  let d = `M${r(xs[0])},${r(ys[0])}`
  for (let i = 0; i < n - 1; i++) {
    const h = (xs[i + 1] - xs[i]) / 3
    d += `C${r(xs[i] + h)},${r(ys[i] + tangents[i] * h)},${r(xs[i + 1] - h)},${r(ys[i + 1] - tangents[i + 1] * h)},${r(xs[i + 1])},${r(ys[i + 1])}`
  }
  return d
}

/**
 * The day a click at `index` means: that day when it has commits, otherwise
 * the nearest one that does within `reach` slots — a day on a wide history is
 * narrower than a pointer. Null when there is none that close.
 */
export function nearestBusyDay(model: MinimapModel, days: number[], index: number, reach: number): number | null {
  for (let step = 0; step <= reach; step++) {
    for (const i of step === 0 ? [index] : [index - step, index + step]) {
      const day = days[i]
      if (day !== undefined && (model.byDay.get(day)?.commits ?? 0) > 0) return day
    }
  }
  return null
}
