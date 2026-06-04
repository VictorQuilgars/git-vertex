import { CommitNode, GraphEdge } from '../../types'

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
  ownerTip: string  // hash of the tip commit that owns this commit's line
}

/**
 * Graph layout — matches GitKraken's lane disposition.
 *
 * Two ideas drive it:
 *
 * 1. OWNERSHIP. Every commit belongs to exactly one "line" (a branch's
 *    first-parent chain). When several lines reach the same commit, the commit
 *    stays in the line whose tip is *topmost* (highest in the list) — that line
 *    keeps its lane and the others converge into it. This is why, e.g.,
 *    `v1.0.0` stays on main's lane (main's tip is above hotfix's) while the
 *    common base commits stay on the develop/HEAD trunk (its tip is at the very
 *    top), rather than on whichever line happened to claim them first.
 *
 * 2. POSITIONAL LANES. A line is born either at its ref tip or, for a merged-in
 *    branch, at the merge commit that introduces it (one row above its tip),
 *    and is allocated the leftmost free lane at that moment. It frees its lane
 *    where it merges out. This birth-at-merge timing is what places, e.g.,
 *    hotfix (introduced by its merge) to the *left* of main (a plain tip below
 *    it).
 *
 * Edges are emitted one per (commit → parent) relationship; the renderer draws
 * multi-row elbows (fork = elbow at the bottom/base, merge = elbow at the top).
 */
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
  // A "tip" is any commit that is no commit's first parent (a chain head).
  const isFpChild = new Set<string>()
  for (const c of commits) if (has(c.parents[0])) isFpChild.add(c.parents[0])

  // main/master is the backbone: it claims its whole first-parent chain first
  // (including the shared base commits down to the root), so it stays a single
  // straight line and every other branch — even HEAD — forks off it. After
  // that, tips are taken topmost-first.
  //
  // A tip is on the backbone if the first branch ref met while walking down its
  // first-parent chain is main/master. Walking the chain (rather than checking
  // only the tip's own refs) lets the virtual WIP node — which sits on top of
  // HEAD with no ref of its own — inherit main's backbone status.
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
      if (names.length > 0) return false // the chain belongs to another branch
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
      return pa - pb || idx.get(a)! - idx.get(b)! // backbone first, then topmost
    })

  const owner = new Map<string, string>() // commit hash -> owning tip
  for (const tip of tips) {
    let h: string | null = tip
    while (h && !owner.has(h)) {
      owner.set(h, tip)
      h = firstParent(h)
    }
  }

  // ── 2) Lane allocation, row by row ────────────────────────────────────────
  const laneOf = new Map<string, number>() // active tip -> lane
  const occupant: (string | null)[] = []   // lane -> tip currently holding it
  const colorOf = new Map<string, string>() // tip -> color (per line, by birth)
  let colorN = 0

  const allocLane = (tip: string): number => {
    let ln = occupant.indexOf(null)
    if (ln === -1) { ln = occupant.length; occupant.push(null) }
    occupant[ln] = tip
    laneOf.set(tip, ln)
    if (!colorOf.has(tip)) colorOf.set(tip, LANE_COLORS[colorN++ % LANE_COLORS.length])
    return ln
  }

  // Where each line dies: at the row of its bottommost commit's first parent
  // (that parent belongs to a higher-priority line the dying line merges into).
  const bottom = new Map<string, string>() // tip -> bottommost owned commit
  for (const c of commits) {
    const t = owner.get(c.hash)!
    const cur = bottom.get(t)
    if (cur === undefined || idx.get(c.hash)! > idx.get(cur)!) bottom.set(t, c.hash)
  }
  const dieAt = new Map<number, string[]>() // row -> tips whose lane frees here
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

    // Lines merging into this commit release their lanes (after it renders).
    for (const tip of dieAt.get(r) ?? []) {
      if (tip === line) continue
      const ln = laneOf.get(tip)
      if (ln !== undefined) occupant[ln] = null
      laneOf.delete(tip)
    }
    // Merge parents introduce (give birth to) their own lines here.
    for (let p = 1; p < c.parents.length; p++) {
      const ph = c.parents[p]
      if (!has(ph)) continue
      const pLine = owner.get(ph)!
      if (!laneOf.has(pLine)) allocLane(pLine)
    }
    while (occupant.length && occupant[occupant.length - 1] === null) occupant.pop()
  }

  // ── 3) Edges: one per parent relationship (renderer draws multi-row elbows) ─
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
        // First parent continues the line, or this commit forks into it (elbow
        // at the bottom, vertical stays in this commit's own lane).
        if (toLane === lane) {
          edges.push({ fromLane: lane, toLane: lane, toRow, color, type: 'straight' })
        } else {
          edges.push({ fromLane: lane, toLane, toRow, color, type: toLane < lane ? 'fork-left' : 'fork-right' })
        }
      } else {
        // Merge parent: elbow at the top, then the vertical runs down the
        // parent line's lane — coloured with that line's colour.
        const pColor = colorOf.get(owner.get(ph)!)!
        edges.push({ fromLane: lane, toLane, toRow, color: pColor, type: toLane < lane ? 'merge-left' : 'merge-right' })
      }
    })

    result.push({ ...c, row: r, lane, color, edges, ownerTip: owner.get(c.hash)! })
  }

  return result
}
