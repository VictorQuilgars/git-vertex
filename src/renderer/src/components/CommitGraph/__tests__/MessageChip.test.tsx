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
    expect(src).toContain('left: refsBelow ? COLOR_BAR_W : refsColW')
  })

  // It is a prop the panel passes, never a setting: two shapes decided by how
  // much width the host has, not something a user has to find in a menu.
  test('it is a prop, not a stored setting', () => {
    expect(src).toContain('refsBelow?: boolean')
    expect(src).not.toContain("getBool('graphRefsBelow'")
  })
})
