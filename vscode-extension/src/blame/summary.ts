import { BlameLine } from './blame'
import { formatRelative, truncate } from './format'

// What a Git CodeLens says about a range of lines. Kept apart from
// codeLens.ts so it stays free of `vscode` — see blame.ts.

export interface RangeSummary {
  latest: BlameLine
  authors: number
}

/**
 * Most recent committed line in [startLine, endLine] (0-based, inclusive),
 * plus how many distinct authors wrote that range. Returns null when the range
 * holds nothing but uncommitted lines.
 */
export function summarize(lines: BlameLine[], startLine: number, endLine: number): RangeSummary | null {
  let latest: BlameLine | null = null
  const authors = new Set<string>()

  for (const line of lines) {
    if (line.line < startLine + 1 || line.line > endLine + 1) continue
    if (line.uncommitted) continue
    authors.add(line.authorMail || line.author)
    if (!latest || line.authorTime > latest.authorTime) latest = line
  }

  return latest ? { latest, authors: authors.size } : null
}

export function lensTitle(summary: RangeSummary, now?: number): string {
  const others = summary.authors - 1
  const who = others === 0
    ? summary.latest.author
    : `${summary.latest.author} and ${others} other${others > 1 ? 's' : ''}`
  return `${who}, ${formatRelative(summary.latest.authorTime, now)} • ${truncate(summary.latest.summary, 40)}`
}
