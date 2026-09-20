import type { BlameLine } from './blame'

/** Gaps break runs too: a partial blame must never suggest shared authorship. */
export function fileAnnotations(lines: readonly BlameLine[], groupRuns = true): { line: BlameLine; continuation: boolean }[] {
  const ordered = [...lines].sort((a, b) => a.line - b.line)
  return ordered.map((line, i) => ({
    line,
    continuation: groupRuns && i > 0 && ordered[i - 1].line === line.line - 1 && ordered[i - 1].hash === line.hash,
  }))
}

/** 1-based lines, including separate runs, belonging to the cursor's commit. */
export function commitLines(lines: readonly BlameLine[], cursorLine: number | undefined): number[] {
  const current = lines.find(line => line.line === cursorLine)
  if (!current || current.uncommitted || !current.hash) return []
  return lines.filter(line => !line.uncommitted && line.hash === current.hash).map(line => line.line)
}

export function authorInitials(author: string): string {
  const words = author.trim().split(/\s+/).filter(Boolean)
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase()
}
