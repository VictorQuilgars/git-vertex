// Age heatmap for the file-wide blame annotation: a colored bar in the gutter,
// hot for lines that just changed, cold for lines nobody has touched in months.
// No `vscode` import — see blame.ts.

export const HEATMAP_BUCKETS = 10

/** Freshly changed. */
const HOT: [number, number, number] = [0xf6, 0x6a, 0x0a]
/** Older than the configured threshold. */
const COLD: [number, number, number] = [0x0a, 0x60, 0xf6]

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

export function bucketColor(bucket: number, buckets: number = HEATMAP_BUCKETS): string {
  const t = buckets <= 1 ? 0 : Math.min(1, Math.max(0, bucket / (buckets - 1)))
  const channel = (i: number): string => {
    const value = Math.round(HOT[i] + (COLD[i] - HOT[i]) * t)
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
