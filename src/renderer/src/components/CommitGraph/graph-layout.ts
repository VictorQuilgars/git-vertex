import { CommitNode, GraphEdge } from '../../types'

export const LANE_COLORS = [
  '#00bfff', // cyan-blue
  '#ff6b6b', // red
  '#51cf66', // green
  '#ffd43b', // yellow
  '#cc5de8', // purple
  '#ff922b', // orange
  '#20c997', // teal
  '#f06595', // pink
  '#74c0fc', // light blue
  '#a9e34b', // lime
]

export interface LayoutCommit extends CommitNode {
  lane: number
  color: string
  edges: GraphEdge[]
  row: number
}

/**
 * Graph layout algorithm:
 * - Assigns each commit to a "lane" (column)
 * - Recycles lanes when branches merge
 * - Draws edges between parent/child commits
 */
export function computeGraphLayout(commits: CommitNode[]): LayoutCommit[] {
  if (!commits.length) return []

  // Map hash -> index for fast lookup
  const hashToIndex = new Map<string, number>()
  commits.forEach((c, i) => hashToIndex.set(c.hash, i))

  // lanes[i] = hash of the commit currently "occupying" lane i, or null
  const lanes: (string | null)[] = []
  const result: LayoutCommit[] = []

  const getFreeColor = (usedLanes: (string | null)[]): string => {
    const usedCount = usedLanes.filter(Boolean).length
    return LANE_COLORS[usedCount % LANE_COLORS.length]
  }

  const findOrCreateLane = (hash: string): number => {
    const existing = lanes.indexOf(hash)
    if (existing !== -1) return existing
    // Find a free slot
    const free = lanes.indexOf(null)
    if (free !== -1) { lanes[free] = hash; return free }
    // Add new lane
    lanes.push(hash)
    return lanes.length - 1
  }

  // Track color per lane
  const laneColors: string[] = []

  for (let row = 0; row < commits.length; row++) {
    const commit = commits[row]
    const edges: GraphEdge[] = []

    // Find the lane for this commit
    let lane = lanes.indexOf(commit.hash)
    if (lane === -1) {
      // This is a branch head — assign new lane
      lane = findOrCreateLane(commit.hash)
      laneColors[lane] = LANE_COLORS[lane % LANE_COLORS.length]
    }

    const commitColor = laneColors[lane] || LANE_COLORS[lane % LANE_COLORS.length]

    // Process parents
    const parents = commit.parents
    // Lanes for which we already drew a diverge edge this row — skip passthrough for these
    const skipPassthrough = new Set<number>([lane])

    if (parents.length === 0) {
      // Root commit — free the lane
      lanes[lane] = null
    } else {
      // First parent continues in the same lane (or converges into another lane)
      const firstParentIdx = hashToIndex.get(parents[0])
      if (firstParentIdx !== undefined) {
        // Check if the parent is already claimed by another active lane (convergence)
        const existingLane = lanes.indexOf(parents[0])
        if (existingLane !== -1 && existingLane !== lane) {
          if (lane < existingLane) {
            // Current lane is to the LEFT — keep it, reroute parent here, free right lane.
            // This ensures shared ancestors inherit the leftmost (earliest) branch color.
            lanes[lane] = parents[0]
            lanes[existingLane] = null
            edges.push({ fromLane: lane, toLane: lane, toRow: row + 1, color: commitColor, type: 'straight' })
            // Draw the right lane converging into the left lane
            edges.push({
              fromLane: existingLane,
              toLane: lane,
              toRow: row + 1,
              color: laneColors[existingLane] || LANE_COLORS[existingLane % LANE_COLORS.length],
              type: 'merge-left'
            })
            skipPassthrough.add(existingLane)
          } else {
            // Current lane is to the RIGHT — free it, left lane keeps the parent
            const direction = existingLane < lane ? 'merge-left' : 'merge-right'
            edges.push({ fromLane: lane, toLane: existingLane, toRow: row + 1, color: commitColor, type: direction })
            lanes[lane] = null
            skipPassthrough.add(lane)
          }
        } else {
          lanes[lane] = parents[0]
          edges.push({ fromLane: lane, toLane: lane, toRow: row + 1, color: commitColor, type: 'straight' })
        }
      } else {
        lanes[lane] = null
      }

      // Additional parents (merge commits)
      // Draw only a one-row diverge edge; passthrough handles the rest from row+1 on.
      for (let p = 1; p < parents.length; p++) {
        const parentHash = parents[p]
        const parentIdx = hashToIndex.get(parentHash)
        if (parentIdx === undefined) continue

        // Find or create lane for this parent
        let parentLane = lanes.indexOf(parentHash)
        const isNewLane = parentLane === -1
        if (isNewLane) {
          const free = lanes.indexOf(null)
          if (free !== -1) {
            parentLane = free
            lanes[free] = parentHash
          } else {
            parentLane = lanes.length
            lanes.push(parentHash)
          }
          laneColors[parentLane] = LANE_COLORS[parentLane % LANE_COLORS.length]
        }

        const direction = parentLane < lane ? 'merge-left' : 'merge-right'
        // Only draw to row+1 — avoids overlap with passthrough segments
        edges.push({
          fromLane: lane,
          toLane: parentLane,
          toRow: row + 1,
          color: laneColors[parentLane] || commitColor,
          type: direction
        })

        // If the lane was just created, skip passthrough this row so we don't
        // double-draw a straight segment on top of the diverge curve.
        if (isNewLane) skipPassthrough.add(parentLane)
      }
    }

    // Add passthrough edges for all other active lanes
    for (let l = 0; l < lanes.length; l++) {
      if (skipPassthrough.has(l)) continue
      const laneHash = lanes[l]
      if (!laneHash) continue
      const targetIdx = hashToIndex.get(laneHash)
      if (targetIdx !== undefined && targetIdx > row) {
        edges.push({
          fromLane: l,
          toLane: l,
          toRow: row + 1,
          color: laneColors[l] || LANE_COLORS[l % LANE_COLORS.length],
          type: 'straight'
        })
      }
    }

    result.push({
      ...commit,
      row,
      lane,
      color: commitColor,
      edges
    })

    // Clean up fully resolved lanes
    for (let l = 0; l < lanes.length; l++) {
      if (lanes[l] === null) continue
      const idx = hashToIndex.get(lanes[l]!)
      if (idx !== undefined && idx <= row) {
        lanes[l] = null
      }
    }
  }

  return result
}
