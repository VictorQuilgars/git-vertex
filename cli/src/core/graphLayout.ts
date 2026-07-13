// Graph layout algorithm — adapted from src/renderer/src/components/CommitGraph/graph-layout.ts
// Computes lane assignments and edges for a commit graph.

import { CommitNode, GraphEdge } from './types.js'

export const LANE_COLORS = [
  '#2dd4bf', // teal
  '#4d9de0', // blue
  '#9b59b6', // purple
  '#e879f9', // fuchsia
  '#22d3ee', // cyan
  '#818cf8', // indigo
  '#a78bfa', // lavender
  '#34d399', // emerald
  '#60a5fa', // cornflower
  '#f472b6', // pink
]

export interface LayoutCommit extends CommitNode {
  lane: number
  color: string
  edges: GraphEdge[]
  row: number
  ownerTip: string
}

export function computeGraphLayout(commits: CommitNode[]): LayoutCommit[] {
  if (!commits.length) return []

  const idx = new Map<string, number>()
  commits.forEach((c, i) => idx.set(c.hash, i))
  const has = (h?: string): h is string => h !== undefined && idx.has(h)
  const firstParent = (h: string): string | null => {
    const c = commits[idx.get(h)!]
    return c && has(c.parents[0]) ? c.parents[0] : null
  }

  // ── 1) Ownership: walk first-parent chains from highest-priority tip down ──
  const isFpChild = new Set<string>()
  for (const c of commits) if (has(c.parents[0])) isFpChild.add(c.parents[0])

  const refBranchNames = (h: string): string[] =>
    commits[idx.get(h)!].refs
      .filter(r => !r.startsWith('tag:'))
      .map(r => r.replace(/^HEAD ->\s*/, '').replace(/^(origin\/|remotes\/[^/]+\/)/, '').trim())

  const isBackbone = (tip: string): boolean => {
    let h: string | null = tip
    const seen = new Set<string>()
    while (h && !seen.has(h)) {
      seen.add(h)
      const names = refBranchNames(h)
      if (names.some(n => n === 'main' || n === 'master')) return true
      if (names.length > 0) return false
      h = firstParent(h)
    }
    return false
  }

  const tips = commits
    .filter(c => !isFpChild.has(c.hash))
    .map(c => c.hash)
    .sort((a, b) => {
      const pa = isBackbone(a) ? 0 : 1
      const pb = isBackbone(b) ? 0 : 1
      return pa - pb || idx.get(a)! - idx.get(b)!
    })

  const owner = new Map<string, string>()
  for (const tip of tips) {
    let h: string | null = tip
    while (h && !owner.has(h)) {
      owner.set(h, tip)
      h = firstParent(h)
    }
  }

  // ── 2) Lane allocation, row by row ────────────────────────────────────────
  const laneOf = new Map<string, number>()
  const occupant: (string | null)[] = []
  const colorOf = new Map<string, string>()
  let colorN = 0

  const allocLane = (tip: string): number => {
    let ln = occupant.indexOf(null)
    if (ln === -1) { ln = occupant.length; occupant.push(null) }
    occupant[ln] = tip
    laneOf.set(tip, ln)
    if (!colorOf.has(tip)) colorOf.set(tip, LANE_COLORS[colorN++ % LANE_COLORS.length])
    return ln
  }

  const bottom = new Map<string, string>()
  for (const c of commits) {
    const t = owner.get(c.hash)!
    const cur = bottom.get(t)
    if (cur === undefined || idx.get(c.hash)! > idx.get(cur)!) bottom.set(t, c.hash)
  }

  const dieAt = new Map<number, string[]>()
  for (const [tip, b] of bottom) {
    const f = firstParent(b)
    if (!f) continue
    const r = idx.get(f)!
    const arr = dieAt.get(r)
    if (arr) arr.push(tip)
    else dieAt.set(r, [tip])
  }

  const laneByHash = new Map<string, number>()
  for (let r = 0; r < commits.length; r++) {
    const c = commits[r]
    const line = owner.get(c.hash)!
    if (!laneOf.has(line)) allocLane(line)
    laneByHash.set(c.hash, laneOf.get(line)!)

    for (const tip of dieAt.get(r) ?? []) {
      if (tip === line) continue
      const ln = laneOf.get(tip)
      if (ln !== undefined) occupant[ln] = null
      laneOf.delete(tip)
    }
    for (let p = 1; p < c.parents.length; p++) {
      const ph = c.parents[p]
      if (!has(ph)) continue
      const pLine = owner.get(ph)!
      if (!laneOf.has(pLine)) allocLane(pLine)
    }
    while (occupant.length && occupant[occupant.length - 1] === null) occupant.pop()
  }

  // ── 3) Edges ───────────────────────────────────────────────────────────────
  const result: LayoutCommit[] = []
  for (let r = 0; r < commits.length; r++) {
    const c = commits[r]
    const lane = laneByHash.get(c.hash)!
    const color = colorOf.get(owner.get(c.hash)!)!
    const edges: GraphEdge[] = []

    c.parents.forEach((ph, pi) => {
      if (!has(ph)) return
      const toRow = idx.get(ph)!
      const toLane = laneByHash.get(ph)!
      if (pi === 0) {
        if (toLane === lane) {
          edges.push({ fromLane: lane, toLane: lane, toRow, color, type: 'straight' })
        } else {
          edges.push({ fromLane: lane, toLane, toRow, color, type: toLane < lane ? 'fork-left' : 'fork-right' })
        }
      } else {
        const pColor = colorOf.get(owner.get(ph)!)!
        edges.push({ fromLane: lane, toLane, toRow, color: pColor, type: toLane < lane ? 'merge-left' : 'merge-right' })
      }
    })

    result.push({ ...c, row: r, lane, color, edges, ownerTip: owner.get(c.hash)! })
  }

  return result
}
