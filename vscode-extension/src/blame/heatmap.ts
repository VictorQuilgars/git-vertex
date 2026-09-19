// Age heatmap for the file-wide blame annotation: a colored bar in the gutter,
// hot for lines that just changed, cold for lines nobody has touched in months.
// No `vscode` import — see blame.ts.

export const HEATMAP_BUCKETS = 10

/** Freshly changed. */
export const DEFAULT_HOT_COLOR = '#F66A0A'
/** Older than the configured threshold. */
export const DEFAULT_COLD_COLOR = '#0A60F6'

type Rgb = [number, number, number]

/** The two ends the buckets are interpolated between, as `#RRGGBB`. */
export interface HeatmapEnds {
  hot: string
  cold: string
}

export const DEFAULT_HEATMAP_ENDS: HeatmapEnds = { hot: DEFAULT_HOT_COLOR, cold: DEFAULT_COLD_COLOR }

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/

function parseHex(color: string): Rgb | null {
  if (!HEX_COLOR.test(color)) return null
  return [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)) as Rgb
}

/**
 * The ends to draw with, from what the settings hold. The gutter takes an SVG
 * icon, so a value that is not `#RRGGBB` cannot be handed on as CSS would take
 * it: it falls back to the default, and `rejected` names the setting so the
 * caller can say so.
 */
export function resolveHeatmapEnds(
  settings: { hotColor?: unknown; coldColor?: unknown },
): { ends: HeatmapEnds; rejected: Array<{ setting: 'hotColor' | 'coldColor'; value: string }> } {
  const rejected: Array<{ setting: 'hotColor' | 'coldColor'; value: string }> = []
  const pick = (setting: 'hotColor' | 'coldColor', fallback: string): string => {
    const raw = settings[setting]
    // Unset (or emptied) is not a mistake, it is the default.
    if (raw === undefined || raw === null || raw === '') return fallback
    const value = typeof raw === 'string' ? raw.trim() : String(raw)
    if (HEX_COLOR.test(value)) return value
    rejected.push({ setting, value })
    return fallback
  }
  return {
    ends: { hot: pick('hotColor', DEFAULT_HOT_COLOR), cold: pick('coldColor', DEFAULT_COLD_COLOR) },
    rejected,
  }
}

/**
 * Bucket index for a line, 0 = hottest. Linear over `thresholdDays`, so the
 * setting means what it says: a line that old (or older) is fully cold.
 */
export function heatmapBucket(
  authorTime: number,
  now: number,
  thresholdDays: number,
  buckets: number = HEATMAP_BUCKETS,
): number {
  const ageDays = (now / 1000 - authorTime) / 86400
  const threshold = thresholdDays > 0 ? thresholdDays : 1
  const ratio = Math.min(1, Math.max(0, ageDays / threshold))
  return Math.min(buckets - 1, Math.round(ratio * (buckets - 1)))
}

export function bucketColor(
  bucket: number,
  buckets: number = HEATMAP_BUCKETS,
  ends: HeatmapEnds = DEFAULT_HEATMAP_ENDS,
): string {
  const t = buckets <= 1 ? 0 : Math.min(1, Math.max(0, bucket / (buckets - 1)))
  // `ends` comes out of resolveHeatmapEnds; a caller that skipped it still
  // gets a colour rather than NaN in an SVG.
  const hot = parseHex(ends.hot) ?? parseHex(DEFAULT_HOT_COLOR)!
  const cold = parseHex(ends.cold) ?? parseHex(DEFAULT_COLD_COLOR)!
  const channel = (i: number): string => {
    const value = Math.round(hot[i] + (cold[i] - hot[i]) * t)
    return value.toString(16).padStart(2, '0')
  }
  return `#${channel(0)}${channel(1)}${channel(2)}`
}

/**
 * A 2px-wide bar as a data URI — VS Code's gutter takes an icon, not a color,
 * so the bar has to be drawn.
 */
export function heatmapIcon(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="20">`
    + `<rect x="0" y="0" width="2" height="20" fill="${color}"/></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
}
