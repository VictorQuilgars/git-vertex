import { fireEvent, render, screen } from '@testing-library/react'
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
    expect(container.querySelectorAll('.mchip > .mchip-seg')).toHaveLength(1)
  })

  // A hover reads the whole pill: a copy of it laid over the row, every name
  // whole. Its words are generated content, so each name is in the document
  // once — a find, a screen reader and a test meet it one time.
  test('the hover copy says every name, without writing any of them twice', () => {
    const { container } = render(<MessageChip refsHidden={2} segments={[
      { kind: 'branch', label: 'feat/a-very-long-branch-name' },
      { kind: 'remote', label: 'origin', collapsible: true, detail: '↑1' },
    ]} />)
    const copy = container.querySelector('.mchip-expand')!
    expect(copy.getAttribute('aria-hidden')).toBe('true')
    expect([...copy.querySelectorAll('[data-label]')].map(e => e.getAttribute('data-label')))
      .toEqual(['feat/a-very-long-branch-name', 'origin', '↑1', '+2'])
    expect(copy.textContent!.trim()).toBe('')
    expect(screen.getAllByText('feat/a-very-long-branch-name')).toHaveLength(1)
    expect(screen.getAllByText('+2')).toHaveLength(1)
    // nothing in the copy is collapsed: it is where the collapsed names are read
    expect(copy.querySelectorAll('.mchip-collapsible')).toHaveLength(0)
  })

  // The copy covers the pill while it is shown: a segment only the pill had
  // could never be clicked.
  test('the copy answers a click the way the pill does', () => {
    const onClick = jest.fn()
    const { container } = render(<MessageChip segments={[{ kind: 'branch', label: 'main', onClick }]} />)
    fireEvent.click(container.querySelector('.mchip-expand .mchip-seg')!)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  // In the list of the refs a +N stands for there is room: everything said.
  test('expanded, nothing is collapsed and there is no copy', () => {
    const { container } = render(<MessageChip expanded segments={[
      { kind: 'branch', label: 'feat/x' },
      { kind: 'remote', label: 'origin', collapsible: true },
    ]} />)
    expect(container.querySelector('.mchip--expanded')).not.toBeNull()
    expect(container.querySelector('.mchip-expand')).toBeNull()
    expect(container.querySelectorAll('.mchip-collapsible')).toHaveLength(0)
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
    expect(src).toMatch(/\{!grouped && <>[\s\S]*?cg-h-refs/)
    expect(src).toMatch(/\{!grouped && \(\s*<div className="cg-refs-col"/)
  })

  test('the graph overlay is not offset by a column that is not drawn', () => {
    expect(src).toContain('left: grouped ? 0 : refsColW')
  })

  // The panel's list and table: its refs with the message either way, two
  // lines below the width, one from it.
  test('the list and the table are one decision, on the graph\'s own width', () => {
    expect(src).toContain('const listRows = refsBelow || (listBelow != null && (containerW === 0 || containerW < listBelow))')
    expect(src).toContain('const grouped = listRows || listBelow != null')
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
      expect(src).toContain(`const ${flag} = !listRows &&`)
    }
  })

  test('and no column header either, since there is no grid to name', () => {
    expect(src).toContain('{!listRows && <div')
  })

  // Every row has a second line, ref or not — the sha, the author and the date
  // live there now, so a row without a branch is not a shorter row.
  test('every row is two lines, not only the ones carrying a ref', () => {
    expect(src).toContain('displayLayout.map(() => listRows)')
  })

  // Two stacked rows read as one four-line block without a seam: the band
  // leaves a pixel of ground above and below, and no hairline draws a grid.
  test('rows are separated by the ground the band leaves', () => {
    expect(css).toMatch(/\.cg-row--grouped \{\n  border-bottom: none/)
    expect(css).toMatch(/\.cg-row--grouped::before \{[^}]*inset: 1px 0/)
  })

  // The reference's list row has no stripe: the lane's colour is the band,
  // born at the node — a stripe beside it was a second bar at the edge, next
  // to the role marks' own.
  test('no stripe: the colour is a band from the node to the end of the lanes', () => {
    expect(src).toContain('{!grouped && <div className="cg-color-bar"')
    expect(css).toMatch(/\.cg-row--grouped::before \{[\s\S]*?transparent var\(--cg-node-x\)[\s\S]*?var\(--cg-band-edge\)/)
    expect(src).toContain("'--cg-node-x': `${svgPadL + commit.lane * laneW}px`")
  })

  // The two lines are one block, centred on the row like the avatar beside it.
  test('the message and its second line are one block, centred on the row', () => {
    expect(css).toMatch(/\.cg-col-msg--stacked \{[^}]*justify-content: center/)
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
    expect(css).toMatch(/\.cg-row--grouped \{ z-index: 1; \}/)
  })

  // The lanes start at the row's own edge, 15px apart — lane 0's centre on a
  // whole pixel, so a 2px line is drawn sharp.
  test('the lanes start at the row\'s edge, on the reference\'s spacing', () => {
    // The geometry constants live with the row parts, not the graph itself.
    const parts = require('fs').readFileSync(
      'src/renderer/src/components/CommitGraph/graph-parts.tsx', 'utf8')
    expect(parts).toContain('export const STACKED_LANE_W = 15')
    expect(parts).toContain('export const STACKED_PAD_L  = 16')
    expect(src).toContain('const svgPadL = grouped ? STACKED_PAD_L : SVG_PAD_L')
  })

  // The band's right-edge bar and the chip connector both pointed at things the
  // stacked layout does not have.
  test('lane bands and chip connectors are column-layout only', () => {
    // `windowRows`: the rows near the viewport (graph-window.ts), not every row loaded.
    const gated = src.split('{!grouped && windowRows.map').length - 1
    expect(gated).toBeGreaterThanOrEqual(2)
  })

  test('the band is painted under the row\'s content, over its grounds', () => {
    // Behind the text, never over it; the hover and selection grounds stay
    // flat underneath. The full-width hairlines stand down.
    expect(css).toMatch(/\.cg-row--grouped::before \{[^}]*z-index: -1/)
    expect(css).toMatch(/\.cg-row--grouped:not\(\.cg-selected\) \{ box-shadow: none/)
  })

  test('the checked-out branch is the one filled chip', () => {
    expect(chipCss).toContain('.mchip--emphasis')
    // …and a ghost (#173) never fills: it is the line's name, not a checkout.
    expect(src).toContain('emphasis={!ghost && !!prefs[0].isHead}')
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
    // rowMid for the geometry, svgPadL and laneW because the stacked layout
    // starts further left on tighter rails — everything read is declared.
    expect(src).toMatch(/const renderEdge = useCallback\([\s\S]*?\}, \[rowMid, svgPadL, laneW\]\)/)
  })
})

// A right-click on a segment is the segment's. Left to bubble, the row under
// the pill answered it too — and in VS Code the row's menu is the native one,
// so a branch name opened two menus, one over the other (#233).
describe('MessageChip — a right-click on a segment stops there', () => {
  test('the row underneath does not see it, and the browser draws no menu of its own', () => {
    const own = jest.fn()
    const row = jest.fn()
    render(
      <div onContextMenu={row}>
        <MessageChip segments={[{ kind: 'branch', label: 'feat/x', onContextMenu: own }]} />
      </div>
    )
    const notPrevented = fireEvent.contextMenu(screen.getByText('feat/x'))
    expect(own).toHaveBeenCalledTimes(1)
    expect(row).not.toHaveBeenCalled()
    expect(notPrevented).toBe(false)
  })

  test('a segment with no menu of its own leaves the right-click to the row', () => {
    const row = jest.fn()
    render(
      <div onContextMenu={row}>
        <MessageChip segments={[{ kind: 'tag', label: 'v1.0' }]} />
      </div>
    )
    fireEvent.contextMenu(screen.getByText('v1.0'))
    expect(row).toHaveBeenCalledTimes(1)
  })
})
