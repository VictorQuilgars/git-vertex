import { render, screen } from '@testing-library/react'
import MessageChip from '../MessageChip'
import { messageChipSegments } from '../CommitGraph'

// The pill under a message is not the branch chip moved down. It carries
// several kinds at once — the branch, the remote it is published on, the issue
// its branch is working on — and all but the first are an icon until it is
// hovered, because four names side by side are wider than the message.

describe('messageChipSegments — what goes in the pill', () => {
  const local = { display: 'feat/x', cls: 'rc-local', branchName: 'feat/x', hasLocal: true }

  test('a local branch alone is one segment', () => {
    expect(messageChipSegments(local as any)).toEqual([
      expect.objectContaining({ kind: 'branch', label: 'feat/x' }),
    ])
  })

  // "Published somewhere" is the fact; which remote is the detail, so it
  // collapses to its icon.
  test('a published branch adds the remote, collapsed', () => {
    const segs = messageChipSegments(
      { ...local, hasRemote: true, tooltip: 'feat/x  +  origin/feat/x' } as any)
    expect(segs).toHaveLength(2)
    expect(segs[1]).toMatchObject({ kind: 'remote', label: 'origin', collapsible: true })
  })

  test('a remote that is not origin keeps its own name', () => {
    const segs = messageChipSegments(
      { ...local, hasRemote: true, tooltip: 'feat/x  +  remotes/upstream/feat/x' } as any)
    expect(segs[1]).toMatchObject({ kind: 'remote', label: 'upstream' })
  })

  // The correction that prompted this: an issue belongs to a branch, and
  // follows it as it moves. A commit does not have one.
  test('the issue comes from the branch, not from the commit', () => {
    const issueFor = (b: string) => b === 'feat/x' ? { key: '42', provider: 'github' } : null
    const segs = messageChipSegments(local as any, issueFor)
    expect(segs[1]).toMatchObject({ kind: 'issue', label: '#42', collapsible: true })

    const other = { display: 'main', cls: 'rc-head', branchName: 'main', hasLocal: true }
    expect(messageChipSegments(other as any, issueFor)).toHaveLength(1)
  })

  test('a tracker key is shown as its tracker spells it, without a hash', () => {
    const segs = messageChipSegments(local as any, () => ({ key: 'PROJ-421', provider: 'other' }))
    expect(segs[1]).toMatchObject({ kind: 'issue', label: 'PROJ-421' })
  })

  // ↓N ↑M beside the remote. They are the reason a branch chip is looked at,
  // so they stay visible when the remote's name collapses — and nothing is drawn
  // for a branch level with its upstream, which has nothing to say.
  test('a published branch carries how far it is from its upstream', () => {
    const published = { ...local, hasRemote: true, tooltip: 'feat/x  +  origin/feat/x' }
    const tracking = (b: string) => b === 'feat/x' ? { ahead: 1, behind: 2 } : null
    const segs = messageChipSegments(published as any, undefined, undefined, tracking)
    expect(segs[1]).toMatchObject({ kind: 'remote', label: 'origin', detail: '↓2 ↑1' })
  })

  test('level with its upstream draws no counts at all', () => {
    const published = { ...local, hasRemote: true, tooltip: 'feat/x  +  origin/feat/x' }
    const segs = messageChipSegments(published as any, undefined, undefined, () => ({ ahead: 0, behind: 0 }))
    expect(segs[1].detail).toBeUndefined()
  })

  test('only the side that differs is shown', () => {
    const published = { ...local, hasRemote: true, tooltip: 'feat/x  +  origin/feat/x' }
    expect(messageChipSegments(published as any, undefined, undefined, () => ({ ahead: 3 }))[1].detail).toBe('↑3')
    expect(messageChipSegments(published as any, undefined, undefined, () => ({ behind: 1 }))[1].detail).toBe('↓1')
  })

  // #110 §3: the request hangs off the branch by MAPPING into the loaded
  // open-PR list — never a search per row, which is the rate-limit incident
  // the spec warned about.
  test('a branch that is an open PR head carries the #N chip, clickable to the detail', () => {
    const onOpenPR = jest.fn()
    const segs = messageChipSegments(local as any, undefined, { onOpenPR }, undefined,
      b => b === 'feat/x' ? { number: 121, title: 'The sibling' } : null)
    const pr = segs.find(sg => sg.kind === 'pr')!
    expect(pr.label).toBe('#121')
    expect(pr.title).toContain('The sibling')
    pr.onClick!()
    expect(onOpenPR).toHaveBeenCalledWith(121)
  })

  test('no mapping, no PR chip — and without the handler the chip is a fact, not a button', () => {
    expect(messageChipSegments(local as any).some(sg => sg.kind === 'pr')).toBe(false)
    const segs = messageChipSegments(local as any, undefined, {}, undefined,
      () => ({ number: 7 }))
    const pr = segs.find(sg => sg.kind === 'pr')!
    expect(pr.onClick).toBeUndefined()
  })

  test('the PR sits between the remote and the issue', () => {
    const published = { ...local, hasRemote: true, tooltip: 'feat/x + origin/feat/x' }
    const segs = messageChipSegments(published as any,
      () => ({ key: '9', provider: 'github' }), {}, undefined,
      () => ({ number: 121 }))
    expect(segs.map(sg => sg.kind)).toEqual(['branch', 'remote', 'pr', 'issue'])
  })

  test('a tag is a tag, not a branch', () => {
    const segs = messageChipSegments({ display: 'v1.2.0', cls: 'rc-tag' } as any)
    expect(segs[0]).toMatchObject({ kind: 'tag', label: 'v1.2.0' })
  })
})

describe('MessageChip — what it renders', () => {
  test('every segment is drawn, and the first is never collapsible', () => {
    const { container } = render(<MessageChip segments={[
      { kind: 'branch', label: 'feat/x' },
      { kind: 'remote', label: 'origin', collapsible: true },
      { kind: 'issue', label: '#42', collapsible: true },
    ]} />)
    expect(screen.getByText('feat/x')).toBeInTheDocument()
    expect(screen.getByText('origin')).toBeInTheDocument()
    expect(screen.getByText('#42')).toBeInTheDocument()
    // the collapsing is CSS, so what a test can hold is which segments claim it
    expect(container.querySelectorAll('.mchip-collapsible')).toHaveLength(2)
    expect(container.querySelector('.mchip-seg')!.className).not.toContain('collapsible')
  })

  test('the refs it did not draw are a count, not more segments', () => {
    const { container } = render(
      <MessageChip segments={[{ kind: 'branch', label: 'main' }]} refsHidden={3} />)
    expect(screen.getByText('+3')).toBeInTheDocument()
    expect(container.querySelectorAll('.mchip-seg')).toHaveLength(1)
  })

  test('nothing to say is nothing drawn', () => {
    const { container } = render(<MessageChip segments={[]} />)
    expect(container.querySelector('.mchip')).toBeNull()
  })
})

// The layout is the panel's, not a preference — and the desktop keeps its
// column. These pin the two facts that made the first cut unusable: the header
// has to disappear with the column, and the graph overlay has to stop being
// offset by a column that is no longer there, or every node lands on top of the
// commit message.
describe('the two layouts are decided by the host', () => {
  const src = require('fs').readFileSync(
    'src/renderer/src/components/CommitGraph/CommitGraph.tsx', 'utf8')

  test('the refs column and its header appear and disappear together', () => {
    expect(src).toMatch(/\{!refsBelow && <>[\s\S]*?cg-h-refs/)
    expect(src).toMatch(/\{!refsBelow && \(\s*<div className="cg-refs-col"/)
  })

  test('the graph overlay is not offset by a column that is not drawn', () => {
    expect(src).toContain('left: refsBelow ? STRIPE_INSET + COLOR_BAR_W : refsColW')
  })

  // It is a prop the panel passes, never a setting: two shapes decided by how
  // much width the host has, not something a user has to find in a menu.
  test('it is a prop, not a stored setting', () => {
    expect(src).toContain('refsBelow?: boolean')
    expect(src).not.toContain("getBool('graphRefsBelow'")
  })
})

// The stacked layout is a redesign of the row, not a column moved. What the
// columns used to say is said by position now, so these hold the decisions that
// make it readable rather than the markup that renders it.
describe('the stacked row', () => {
  const src = require('fs').readFileSync(
    'src/renderer/src/components/CommitGraph/CommitGraph.tsx', 'utf8')
  const css = require('fs').readFileSync(
    'src/renderer/src/components/CommitGraph/CommitGraph.css', 'utf8')

  // A panel cannot afford a grid, and a column that appears only when the graph
  // happens to be shallow is worse than no column.
  test('no optional column survives in the stacked layout', () => {
    for (const flag of ['effShowSha', 'effShowStats', 'effShowDate', 'effShowAuthor']) {
      expect(src).toContain(`const ${flag} = !refsBelow &&`)
    }
  })

  test('and no column header either, since there is no grid to name', () => {
    expect(src).toContain('{!refsBelow && <div')
  })

  // Every row has a second line, ref or not — the sha, the author and the date
  // live there now, so a row without a branch is not a shorter row.
  test('every row is two lines, not only the ones carrying a ref', () => {
    expect(src).toContain('displayLayout.map(() => refsBelow)')
  })

  // Two stacked rows read as one four-line block without it: the gap between one
  // commit's second line and the next commit's first is the same as the gap
  // inside a single commit.
  test('rows are separated by a line', () => {
    expect(css).toMatch(/\.cg-row--stacked \{[^}]*border-bottom/)
  })

  // The stripe is the lane's colour applied to the commit. Stopping at the
  // bullet's height left the row looking half-coloured.
  test('the colour stripe spans the whole row, second line included', () => {
    expect(css).toMatch(/\.cg-row--stacked \.cg-color-bar \{[^}]*align-self: stretch/)
  })

  test('the date is pushed to the right edge, where a date is looked for', () => {
    expect(css).toMatch(/\.cg-meta-date \{[^}]*margin-left: auto/)
  })
})

// Four defects from the second screenshot, each pinned to what fixed it.
describe('the stacked row, after the screenshots', () => {
  const src = require('fs').readFileSync(
    'src/renderer/src/components/CommitGraph/CommitGraph.tsx', 'utf8')
  const css = require('fs').readFileSync(
    'src/renderer/src/components/CommitGraph/CommitGraph.css', 'utf8')
  const chipCss = require('fs').readFileSync(
    'src/renderer/src/components/CommitGraph/MessageChip.css', 'utf8')

  // The rows carry the separators; drawn above the SVG they cut every branch
  // line they crossed. The rail must run continuously over the dividers.
  test('stacked rows sit below the graph overlay', () => {
    expect(css).toMatch(/\.cg-row--stacked \{ z-index: 1; \}/)
  })

  // Flush against the panel edge the stripe merged with the sidebar junction —
  // the one place a 3px line cannot be seen.
  test('the stripe steps in from the edge, and the SVG steps with it', () => {
    expect(css).toMatch(/\.cg-row--stacked \.cg-color-bar \{[^}]*margin-left: 4px/)
    expect(src).toContain('const STRIPE_INSET = 4')
  })

  // The band's right-edge bar and the chip connector both pointed at things the
  // stacked layout does not have.
  test('lane bands and chip connectors are column-layout only', () => {
    const gated = src.split('{!refsBelow && displayLayout.map').length - 1
    expect(gated).toBeGreaterThanOrEqual(2)
  })

  test('the cell wears the wash; the seam is the ground itself', () => {
    // The row's ground is a fade of its branch's colour, born beside the
    // bullet and gone before the message ends; the separator is the page's
    // own ground showing through the one pixel the wash does not paint. The
    // full-width hairlines stand down so nothing else draws a grid.
    expect(css).toMatch(/\.cg-row--stacked \{\n  border-bottom: none/)
    expect(css).toMatch(/\.cg-row--stacked:not\(\.cg-selected\) \{ box-shadow: none/)
    expect(css).toMatch(/\.cg-row--stacked \{[\s\S]{0,200}linear-gradient\(to right,[\s\S]{0,80}var\(--cg-row-color\)/)
    expect(css).toMatch(/background-size: 100% calc\(100% - 1px\)/)
  })

  test('the checked-out branch is the one filled chip', () => {
    expect(chipCss).toContain('.mchip--emphasis')
    expect(src).toContain('emphasis={!!prefs[0].isHead}')
  })
})

// The "line pointing at no commit" of the third screenshot. renderEdge read
// rowMid inside a useCallback with an empty dependency list, so it captured the
// offsets of the first render and never let go: rows became variable in height,
// the offsets moved, and every edge kept pointing at where its target row used
// to be. Anything that reads the row geometry has to declare it.
describe('no closure captures the row geometry and keeps it', () => {
  const src = require('fs').readFileSync(
    'src/renderer/src/components/CommitGraph/CommitGraph.tsx', 'utf8')

  // Every useCallback / useMemo / useEffect whose body calls rowTop, rowMid or
  // rowHeight must list one of them (or rowTops) in its dependencies.
  test('every hook that reads rowTop/rowMid/rowHeight depends on them', () => {
    const hookRe = /(useCallback|useMemo|useEffect)\(\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/g
    const offenders: string[] = []
    let m: RegExpExecArray | null
    while ((m = hookRe.exec(src))) {
      // find the matching close of this hook: scan for `}, [` then `])`
      const bodyStart = m.index
      const depsIdx = src.indexOf('}, [', bodyStart)
      if (depsIdx < 0) continue
      const depsEnd = src.indexOf(']', depsIdx + 4)
      const body = src.slice(bodyStart, depsIdx)
      const deps = src.slice(depsIdx + 4, depsEnd)
      const readsGeometry = /\b(rowTop|rowMid|rowHeight)\(/.test(body)
      // the geometry's own definitions read rowTops, which is fine
      const isDefinition = /const (rowTop|rowMid|rowHeight) = useCallback/.test(
        src.slice(Math.max(0, bodyStart - 40), bodyStart + 10))
      if (readsGeometry && !isDefinition && !/\b(rowTop|rowMid|rowHeight|rowTops)\b/.test(deps)) {
        const line = src.slice(0, bodyStart).split('\n').length
        offenders.push(`line ${line}: ${src.slice(bodyStart, bodyStart + 50).split('\n')[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('renderEdge in particular', () => {
    expect(src).toMatch(/const renderEdge = useCallback\([\s\S]*?\}, \[rowMid\]\)/)
  })
})
