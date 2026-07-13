// Unified-diff parsing + patch building for hunk-level staging.
// Ported from the desktop/extension CenterFileDiff (same fixes: no phantom
// trailing context line, preserve the "\ No newline at end of file" marker).

export interface DiffLine {
  type: 'add' | 'remove' | 'context'
  content: string
  oldLine?: number
  newLine?: number
  noNewline?: boolean
}
export interface DiffHunk { header: string; lines: DiffLine[] }

export function parseDiff(raw: string): { to: string; hunks: DiffHunk[] }[] {
  const files: { to: string; hunks: DiffHunk[] }[] = []
  const blocks = raw.split(/^diff --git /m).filter(Boolean)
  for (const block of blocks) {
    const lines = block.split('\n')
    const match = lines[0].match(/a\/(.+?) b\/(.+)/)
    const to = match?.[2] ?? lines[0]
    const hunks: DiffHunk[] = []
    let h: DiffHunk | null = null
    let ol = 0, nl = 0
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (line.startsWith('@@')) {
        const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
        ol = parseInt(m?.[1] ?? '1'); nl = parseInt(m?.[2] ?? '1')
        h = { header: line, lines: [] }; hunks.push(h)
      } else if (h) {
        if (line.startsWith('+')) h.lines.push({ type: 'add', content: line.slice(1), newLine: nl++ })
        else if (line.startsWith('-')) h.lines.push({ type: 'remove', content: line.slice(1), oldLine: ol++ })
        else if (line.startsWith('\\')) { if (h.lines.length) h.lines[h.lines.length - 1].noNewline = true }
        else if (line.length > 0 && !line.startsWith('index ') && !line.startsWith('---') && !line.startsWith('+++'))
          h.lines.push({ type: 'context', content: line.slice(1), oldLine: ol++, newLine: nl++ })
      }
    }
    if (hunks.length) files.push({ to, hunks })
  }
  return files
}

export function lineKey(l: DiffLine): string {
  return `${l.type}:${l.oldLine ?? ''}:${l.newLine ?? ''}`
}

// Build a patch for one hunk. If selectedLineKeys is given, only those changed
// lines are included (unselected adds dropped, unselected removes → context).
export function buildPatch(filePath: string, hunk: DiffHunk, selectedLineKeys?: Set<string>): string {
  const lines = selectedLineKeys
    ? hunk.lines.flatMap(l => {
        if (l.type === 'context') return [l]
        if (selectedLineKeys.has(lineKey(l))) return [l]
        if (l.type === 'add') return []
        return [{ ...l, type: 'context' as const }]
      })
    : hunk.lines

  const oldCount = lines.filter(l => l.type !== 'add').length
  const newCount = lines.filter(l => l.type !== 'remove').length
  const m = hunk.header.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/)
  const oldStart = parseInt(m?.[1] ?? '1')
  const newStart = parseInt(m?.[2] ?? '1')
  const rest = m?.[3] ?? ''

  const hunkHeader = `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@${rest}`
  const out: string[] = []
  for (const l of lines) {
    const prefix = l.type === 'add' ? '+' : l.type === 'remove' ? '-' : ' '
    out.push(prefix + l.content)
    if (l.noNewline) out.push('\\ No newline at end of file')
  }
  return `--- a/${filePath}\n+++ b/${filePath}\n${hunkHeader}\n${out.join('\n')}\n`
}
