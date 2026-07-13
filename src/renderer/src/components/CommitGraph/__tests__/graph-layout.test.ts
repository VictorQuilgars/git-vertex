import { computeGraphLayout } from '../graph-layout'
import { CommitNode } from '../../../types'

// Topology of the "TaskFlow" demo repo (scripts/make-demo-repo.sh), in the same
// date-order rows the app displays. Each entry is "hash parent[ parent...]".
// The expected lanes were transcribed from a reference rendering of this repo.
const TOPO = `c0bc6e4 1821f8b
1821f8b 365db82
048a003 735fa46
735fa46 88c0632
88c0632 365db82
365db82 c0a4ea7
c0a4ea7 c8c5e45
c8c5e45 47eb037 3e88863
4694ea8 860d516 3e88863
3e88863 6def977
6def977 860d516
47eb037 a515f73 acbe81f
860d516 d464882 acbe81f
acbe81f 5570c29
5570c29 02c36a5
02c36a5 a515f73
a515f73 d342e9b
d342e9b 51f381c 5e4807a
5e4807a 093a6b4
51f381c b17bf0f 377d343
377d343 77e4963
77e4963 956c4d0
093a6b4 edbb6f1
edbb6f1 b17bf0f
956c4d0 d13d41f
d13d41f b17bf0f
b17bf0f 369cfc4 d393948
d393948 a5bc185
a5bc185 52e4d57
52e4d57 6514e3c
6514e3c 369cfc4
369cfc4 67c7860
67c7860 fefb4ea
fefb4ea d464882
d464882 d68ad9b
d68ad9b e8767bb
e8767bb`

// Expected lanes for each row. Matches the reference lane disposition, except the
// base commits (d464882, d68ad9b, e8767bb) stay on main's lane (the backbone)
// rather than the develop/HEAD trunk — main/master is the straight line to the
// root and develop forks into it at the merge-base. The `main` ref here sits on
// 4694ea8 (row 8), so its lane is 2.
const EXPECTED_LANES = [
  0, 0, 1, 1, 1, 0, 0, 0, 2, 1, 1, 0, 2, 3, 3, 3, 0, 0, 1, 0,
  3, 3, 1, 1, 3, 3, 0, 1, 1, 1, 1, 0, 0, 0, 2, 2, 2,
]

// Refs that matter for layout: the backbone branch (main) plus HEAD on develop.
const REFS: Record<string, string[]> = {
  '4694ea8': ['main', 'tag: v1.0.1'],
  '365db82': ['HEAD -> develop'],
}

function buildCommits(topo: string): CommitNode[] {
  return topo.trim().split('\n').map(line => {
    const [hash, ...parents] = line.trim().split(/\s+/)
    return {
      hash,
      shortHash: hash,
      message: hash,
      author: 'Tester',
      authorEmail: 'tester@example.com',
      date: '2024-01-01T00:00:00Z',
      parents,
      refs: REFS[hash] ?? [],
    }
  })
}

describe('computeGraphLayout', () => {
  it('returns an empty array for no commits', () => {
    expect(computeGraphLayout([])).toEqual([])
  })

  it('matches the reference lane assignment on the demo repo', () => {
    const layout = computeGraphLayout(buildCommits(TOPO))
    expect(layout.map(c => c.lane)).toEqual(EXPECTED_LANES)
  })

  it('keeps a merge commit in the lane of its highest-priority line', () => {
    const layout = computeGraphLayout(buildCommits(TOPO))
    const lane = (h: string) => layout.find(c => c.hash === h)!.lane
    // v1.0.0 stays on main's lane (2), hotfix (lane 1) converges into it.
    expect(lane('860d516')).toBe(2)
    expect(lane('3e88863')).toBe(1)
    // main is the backbone, so the common base commits stay on main's lane (2)
    // — develop (lane 0) forks into it at the merge-base.
    expect(lane('d464882')).toBe(2)
    expect(lane('e8767bb')).toBe(2)
    // develop's bottommost commit forks (to the right) into main's base.
    const fefb4ea = layout.find(c => c.hash === 'fefb4ea')!
    expect(fefb4ea.lane).toBe(0)
    expect(fefb4ea.edges[0].type).toBe('fork-right')
    expect(fefb4ea.edges[0].toLane).toBe(2)
  })

  it('emits one edge per in-range parent with valid lanes and rows', () => {
    const commits = buildCommits(TOPO)
    const layout = computeGraphLayout(commits)
    const known = new Set(commits.map(c => c.hash))
    for (const c of layout) {
      const inRangeParents = c.parents.filter(p => known.has(p))
      expect(c.edges).toHaveLength(inRangeParents.length)
      for (const e of c.edges) {
        expect(e.fromLane).toBe(c.lane)
        expect(e.toRow).toBeGreaterThan(c.row)
        expect(e.toLane).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('uses fork edges for first-parent convergence and merge edges for extra parents', () => {
    const layout = computeGraphLayout(buildCommits(TOPO))
    const byHash = (h: string) => layout.find(c => c.hash === h)!
    // hotfix tail 6def977 forks (right) into main's lane at 860d516.
    const fork = byHash('6def977').edges[0]
    expect(fork.type).toBe('fork-right')
    // A merge commit's 2nd parent produces a merge edge.
    const mergeCommit = byHash('c8c5e45') // Merge hotfix into develop
    expect(mergeCommit.edges[1].type === 'merge-left' || mergeCommit.edges[1].type === 'merge-right').toBe(true)
  })

  it('promotes the WIP/HEAD branch (a virtual tip on main) to lane 0', () => {
    // Simulates the working-tree node: a tip with no ref of its own sitting on
    // top of main. It must inherit main's backbone status and pull main to the
    // far-left lane, with a vertical edge up to the top.
    const base = buildCommits(TOPO)
    const mainTip = base.find(c => c.refs.includes('main'))!.hash
    const wip: CommitNode = {
      hash: '__WIP__', shortHash: 'WIP', message: 'wip',
      author: '', authorEmail: '', date: '', parents: [mainTip], refs: [],
    }
    const layout = computeGraphLayout([wip, ...base])
    const wipNode = layout.find(c => c.hash === '__WIP__')!
    expect(wipNode.lane).toBe(0)
    // Single straight edge running down lane 0 to main's tip.
    expect(wipNode.edges).toHaveLength(1)
    expect(wipNode.edges[0].type).toBe('straight')
    expect(wipNode.edges[0].toLane).toBe(0)
    // main's tip is now on lane 0 too.
    expect(layout.find(c => c.hash === mainTip)!.lane).toBe(0)
  })

  it('gives each line a stable colour', () => {
    const layout = computeGraphLayout(buildCommits(TOPO))
    const color = (h: string) => layout.find(c => c.hash === h)!.color
    // The develop trunk shares one colour from its tip down to where it forks.
    expect(color('c0bc6e4')).toBe(color('fefb4ea'))
    // main (the backbone, including the base) is a different colour.
    expect(color('4694ea8')).toBe(color('e8767bb'))
    expect(color('4694ea8')).not.toBe(color('c0bc6e4'))
  })
})
