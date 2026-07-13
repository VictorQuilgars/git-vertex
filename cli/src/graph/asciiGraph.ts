import type { LayoutCommit } from '../core/graphLayout.js'

export interface GraphCell { char: string; color: string }

// Build a per-row ASCII lane rendering: '●' for the commit node, '│' for lanes
// that pass through the row (a line from a commit above to a parent below).
// Diagonal merge/fork connectors are approximated as vertical lines — enough to
// read parallel branches at a glance.
export function buildGraphRows(commits: LayoutCommit[]): GraphCell[][] {
  const n = commits.length
  const rowByHash = new Map<string, number>()
  commits.forEach((c, i) => rowByHash.set(c.hash, i))
  const maxLane = commits.reduce((m, c) => Math.max(m, c.lane), 0)

  // through[row] = Map<lane, color> of vertical lines crossing that row.
  const through: Array<Map<number, string>> = Array.from({ length: n }, () => new Map())
  for (const c of commits) {
    const r = rowByHash.get(c.hash)!
    for (const p of c.parents) {
      const pr = rowByHash.get(p)
      if (pr === undefined || pr <= r) continue
      const parent = commits[pr]
      const lane = parent ? parent.lane : c.lane
      const color = c.color || '#8b949e'
      for (let rr = r + 1; rr < pr; rr++) {
        if (!through[rr].has(lane)) through[rr].set(lane, color)
      }
      // Also keep the node's own lane visually connected on the first gap row.
      if (pr > r + 1 && !through[r + 1].has(c.lane)) through[r + 1].set(c.lane, c.color || '#8b949e')
    }
  }

  const rows: GraphCell[][] = []
  for (let r = 0; r < n; r++) {
    const c = commits[r]
    const cells: GraphCell[] = []
    // Only render up to the last occupied lane on this row (keeps it compact).
    let last = c.lane
    for (const lane of through[r].keys()) last = Math.max(last, lane)
    for (let lane = 0; lane <= last; lane++) {
      if (lane === c.lane) cells.push({ char: '●', color: c.color || '#58a6ff' })
      else if (through[r].has(lane)) cells.push({ char: '│', color: through[r].get(lane)! })
      else cells.push({ char: ' ', color: '' })
    }
    rows.push(cells)
  }
  return rows
}
