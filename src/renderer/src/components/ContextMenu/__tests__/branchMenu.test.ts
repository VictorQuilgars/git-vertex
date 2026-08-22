import { buildBranchMenu, type BranchMenuActions, type BranchMenuTarget } from '../branchMenu'
import type { MenuItemDef } from '../ContextMenu'

// The real `t` maps keys to prose; the tests only care about which rows exist
// and in what order, so echo the key back (with args) instead.
const t = (key: string, ...args: any[]) => args.length ? `${key}(${args.join(',')})` : key

const rows = (items: MenuItemDef[]) =>
  items.filter((i): i is Exclude<MenuItemDef, { separator: true }> => !('separator' in i))
const labels = (items: MenuItemDef[]) => rows(items).map(i => i.label)
/** Labels inside the submenu hanging off `label`. */
const subLabels = (items: MenuItemDef[], label: string) =>
  labels(rows(items).find(i => i.label === label)?.submenu ?? [])

const local = (over: Partial<BranchMenuTarget> = {}): BranchMenuTarget =>
  ({ name: 'feature/x', display: 'feature/x', current: false, remote: false, ...over })

// Every handler wired, so a row is omitted only because of the branch's state.
const allActions = (): BranchMenuActions => ({
  onCheckout: jest.fn(), onPull: jest.fn(), onPush: jest.fn(),
  onMerge: jest.fn(), onRebaseOnto: jest.fn(), onCompare: jest.fn(), onSetUpstream: jest.fn(),
  onOpenOnRemote: jest.fn(), onAssociateIssue: jest.fn(), onToggleFavorite: jest.fn(),
  onToggleSolo: jest.fn(), onToggleHide: jest.fn(),
  onCopyName: jest.fn(), onRename: jest.fn(), onDelete: jest.fn(), onDeleteRemote: jest.fn(),
  onCreatePR: jest.fn(), onCopyLink: jest.fn(), onDeleteBoth: jest.fn(),
})

describe('buildBranchMenu (v1.21.0)', () => {
  test('omits a row whose handler the caller did not supply', () => {
    const items = buildBranchMenu(local(), { currentBranch: 'main' }, { onCheckout: jest.fn() }, t)
    expect(labels(items)).toEqual(['sb.branch.checkout'])
  })

  test('a non-current local branch offers checkout, integration and delete', () => {
    const items = buildBranchMenu(local(), { currentBranch: 'main' }, allActions(), t)
    const l = labels(items)
    expect(l).toContain('sb.branch.checkout')
    expect(l).toContain('sb.branch.mergeInto(main)')
    expect(l).toContain('sb.branch.rebaseOnto(main)')
    expect(l).toContain('sb.branch.deleteNamed(feature/x)')
    // Comparing against the branch you are on is one of several compares.
    expect(subLabels(items, 'sb.branch.compareMenu')).toContain('sb.branch.compareWith(main)')
    // Pull only makes sense on the branch you are standing on.
    expect(l).not.toContain('sb.branch.pull')
  })

  test('the current branch gets sync actions but no checkout, merge or delete', () => {
    const items = buildBranchMenu(
      local({ name: 'main', display: 'main', current: true }),
      { currentBranch: 'main' }, allActions(), t
    )
    const l = labels(items)
    expect(l).toContain('sb.branch.pull')
    // Fetch acts on the repo, not the branch — it belongs to the toolbar.
    expect(l).not.toContain('sb.branch.fetch')
    expect(l).toContain('sb.branch.push')
    expect(l).not.toContain('sb.branch.checkout')
    expect(l).not.toContain('sb.branch.mergeInto(main)')
    // You cannot delete the branch you are on.
    expect(l.some(x => x.startsWith('sb.branch.delete'))).toBe(false)
  })

  test('a remote branch cannot be pushed, renamed or locally deleted', () => {
    const items = buildBranchMenu(
      { name: 'remotes/origin/x', display: 'x', current: false, remote: true },
      { currentBranch: 'main' }, allActions(), t
    )
    const l = labels(items)
    expect(l).not.toContain('sb.branch.push')
    expect(l).not.toContain('sb.branch.setUpstream')
    expect(l).not.toContain('sb.rename')
    expect(l).not.toContain('sb.branch.deleteNamed(x)')
    expect(l).toContain('sb.branch.deleteRemote')
  })

  test('toggle rows reflect their current state, inside the view submenu', () => {
    const on = buildBranchMenu(local(), {
      currentBranch: 'main', favorite: true, soloed: true, hidden: true,
    }, allActions(), t)
    expect(subLabels(on, 'sb.branch.viewMenu')).toEqual([
      'sb.branch.unfavorite', 'sb.branch.unsolo', 'sb.branch.show',
    ])

    const off = buildBranchMenu(local(), { currentBranch: 'main' }, allActions(), t)
    expect(subLabels(off, 'sb.branch.viewMenu')).toEqual([
      'sb.branch.favorite', 'sb.branch.solo', 'sb.branch.hide',
    ])
  })

  test('the view row is ticked when any toggle underneath it is on', () => {
    const on = buildBranchMenu(local(), { currentBranch: 'main', soloed: true }, allActions(), t)
    expect(rows(on).find(i => i.label === 'sb.branch.viewMenu')).toMatchObject({ checked: true })

    // Not `checked: false` — that would reserve the tick slot and leave the
    // row indented against every other one.
    const off = buildBranchMenu(local(), { currentBranch: 'main' }, allActions(), t)
    expect(rows(off).find(i => i.label === 'sb.branch.viewMenu')).not.toHaveProperty('checked')
  })

  test('a linked issue is shown on the associate row instead of the generic label', () => {
    const items = buildBranchMenu(
      local(), { currentBranch: 'main', issue: { provider: 'github', key: '42', title: 'Login bug' } }, allActions(), t
    )
    expect(labels(items)).toContain('sb.branch.issueLinked(#42)')
    expect(labels(items)).not.toContain('sb.branch.associateIssue')
  })

  test('delete sits with rename — the branch\'s own lifecycle — and is flagged danger', () => {
    const l = labels(buildBranchMenu(local(), { currentBranch: 'main' }, allActions(), t))
    expect(l.indexOf('sb.branch.deleteNamed(feature/x)')).toBe(l.indexOf('sb.rename') + 1)  // unpublished: one flat row
    const items = buildBranchMenu(local(), { currentBranch: 'main' }, allActions(), t)
    expect(rows(items).find(i => i.label === 'sb.branch.deleteNamed(feature/x)'))
      .toMatchObject({ danger: true })
  })

  describe('the delete group', () => {
    test('an unpublished branch only offers the local half', () => {
      const l = labels(buildBranchMenu(local(), { currentBranch: 'main' }, allActions(), t))
      expect(l).toContain('sb.branch.deleteNamed(feature/x)')
      expect(l.some(x => x.startsWith('sb.branch.deleteRemoteNamed'))).toBe(false)
      expect(l.some(x => x.startsWith('sb.branch.deleteBoth'))).toBe(false)
    })

    test('a published branch puts the choice of end behind one row', () => {
      const items = buildBranchMenu(
        local({ publishedAs: 'origin/feature/x' }), { currentBranch: 'main' }, allActions(), t)
      expect(labels(items)).toContain('sb.delete')
      expect(subLabels(items, 'sb.delete')).toEqual([
        'sb.branch.deleteNamed(feature/x)',
        'sb.branch.deleteRemoteNamed(origin/feature/x)',
        'sb.branch.deleteBoth(feature/x,origin/feature/x)',
      ])
    })

    test('every delete row is flagged danger, dropdown and parent alike', () => {
      const items = buildBranchMenu(
        local({ publishedAs: 'origin/feature/x' }), { currentBranch: 'main' }, allActions(), t)
      const parent = rows(items).find(i => i.label === 'sb.delete')!
      expect(parent).toMatchObject({ danger: true })
      for (const d of rows(parent.submenu ?? [])) expect(d).toMatchObject({ danger: true })
    })
  })

  test('the branch link is only offered once the remote has the branch', () => {
    const unpublished = buildBranchMenu(local(), { currentBranch: 'main' }, allActions(), t)
    expect(subLabels(unpublished, 'sb.branch.copyMenu')).not.toContain('sb.branch.copyLink(origin/feature/x)')

    const published = buildBranchMenu(
      local({ publishedAs: 'origin/feature/x' }), { currentBranch: 'main' }, allActions(), t)
    expect(subLabels(published, 'sb.branch.copyMenu')).toContain('sb.branch.copyLink(origin/feature/x)')
  })

  test('copying the branch name stays one click, the variants fold', () => {
    const items = buildBranchMenu(
      local({ publishedAs: 'origin/feature/x' }), { currentBranch: 'main' }, allActions(), t)
    expect(labels(items)).toContain('sb.copyName')
    expect(labels(items)).toContain('sb.branch.copyMenu')
  })

  test('a caller with a commit gets its rows merged into the matching blocks', () => {
    const items = buildBranchMenu(
      local({ publishedAs: 'origin/feature/x' }), { currentBranch: 'main' }, allActions(), t,
      {
        commit: [{ label: 'commit.reword', action: jest.fn() }],
        openRemote: [{ label: 'commit.openRemote', action: jest.fn() }],
        copy: [{ label: 'commit.copySha', action: jest.fn() }],
        compare: [{ label: 'commit.compareWorking', action: jest.fn() }],
        exports: [{ label: 'commit.patch', action: jest.fn() }],
      })
    const l = labels(items)
    // The commit's own actions land in their own block…
    expect(l).toContain('commit.reword')
    // …but "look at this" merges: one Copy row, one Compare row, both remotes
    // side by side, rather than a branch set and a commit set far apart.
    expect(subLabels(items, 'sb.branch.copyMenu')).toContain('commit.copySha')
    expect(subLabels(items, 'sb.branch.compareMenu')).toContain('commit.compareWorking')
    expect(l.filter(x => x === 'sb.branch.copyMenu')).toHaveLength(1)
    expect(l.indexOf('commit.openRemote')).toBe(l.indexOf('sb.branch.openOnRemote') + 1)
    expect(l).toContain('graph.menu.patchMenu')
  })

  test('separators never lead, trail or double up whatever the caller supplies', () => {
    const cases: BranchMenuActions[] = [
      allActions(),
      { onCheckout: jest.fn(), onDelete: jest.fn() },       // two far-apart sections
      { onCopyName: jest.fn() },                             // a single middle section
      { onDelete: jest.fn() },                               // only the last section
    ]
    for (const actions of cases) {
      const items = buildBranchMenu(local(), { currentBranch: 'main' }, actions, t)
      expect(items[0]).not.toHaveProperty('separator')
      expect(items[items.length - 1]).not.toHaveProperty('separator')
      for (let i = 1; i < items.length; i++) {
        const doubled = 'separator' in items[i] && 'separator' in items[i - 1]
        expect(doubled).toBe(false)
      }
    }
  })

  test('the row names both ends, on your own branch as anywhere else', () => {
    const items = buildBranchMenu(
      local({
        name: 'feature/x', display: 'feature/x', current: true,
        pr: { head: 'feature/x', headLabel: 'origin/feature/x', baseLabel: 'origin/main', needsPush: true },
      }),
      { currentBranch: 'feature/x' }, allActions(), t
    )
    // The base used to stay implicit here — so the row you use most said the
    // least about what it was going to do.
    expect(labels(items)).toContain('sb.branch.startPRTo(feature/x,origin/main)')
  })

  test('another row spells out both ends of the request', () => {
    const items = buildBranchMenu(
      local({ name: 'main', display: 'main', pr: { head: 'feature/x', headLabel: 'origin/feature/x', baseLabel: 'origin/main', needsPush: true } }),
      { currentBranch: 'feature/x' }, allActions(), t
    )
    expect(labels(items)).toContain('sb.branch.startPRTo(feature/x,origin/main)')
  })

  test('the head is whatever the intent says, not the branch you are on', () => {
    // Standing on the default branch, the row you clicked becomes the head.
    const items = buildBranchMenu(
      local({ name: 'feature/x', display: 'feature/x', pr: { head: 'feature/x', headLabel: 'origin/feature/x', baseLabel: 'origin/main', needsPush: true } }),
      { currentBranch: 'main' }, allActions(), t
    )
    expect(labels(items)).toContain('sb.branch.startPRTo(feature/x,origin/main)')
  })

  // Victor: a branch he had just pushed still read "Push X and start a Pull
  // Request". The push had registered; only the label had not asked.
  test('an already-pushed branch does not promise a push', () => {
    const items = buildBranchMenu(
      local({
        name: 'feature/x', display: 'feature/x', current: true,
        pr: { head: 'feature/x', headLabel: 'origin/feature/x', baseLabel: 'origin/main', needsPush: false },
      }),
      { currentBranch: 'feature/x' }, allActions(), t
    )
    const l = labels(items)
    // The head reads as its REMOTE ref here: there is nothing left to push, so
    // the thing the request comes from is the one the remote already holds.
    expect(l).toContain('sb.branch.openPRTo(origin/feature/x,origin/main)')
    expect(l.some(x => x.startsWith('sb.branch.startPR'))).toBe(false)
  })

  test('and still names both ends when the row is not the one you are on', () => {
    const items = buildBranchMenu(
      local({ name: 'main', display: 'main',
              pr: { head: 'feature/x', headLabel: 'origin/feature/x', baseLabel: 'origin/main', needsPush: false } }),
      { currentBranch: 'feature/x' }, allActions(), t
    )
    expect(labels(items)).toContain('sb.branch.openPRTo(origin/feature/x,origin/main)')
  })

  test('no pull request row without an intent, however many handlers are wired', () => {
    const l = labels(buildBranchMenu(local(), { currentBranch: 'main' }, allActions(), t))
    expect(l.some(x => x.startsWith('sb.branch.startPR') || x.startsWith('sb.branch.openPR'))).toBe(false)
  })

  test('no pull request row when the caller cannot open one', () => {
    const { onCreatePR: _drop, ...noPR } = allActions()
    const items = buildBranchMenu(
      local({ pr: { head: 'feature/x', headLabel: 'origin/feature/x', baseLabel: 'origin/main', needsPush: true } }),
      { currentBranch: 'main' }, noPR, t
    )
    expect(labels(items).some(x => x.startsWith('sb.branch.startPR') || x.startsWith('sb.branch.openPR'))).toBe(false)
  })

  // The menu carries every branch action and, in the graph, every commit action
  // after it. Past ~15 branch rows it starts needing a scrollbar on a laptop.
  test('stays short enough not to need scrolling', () => {
    const worst = buildBranchMenu(
      local({ publishedAs: 'origin/feature/x' }),
      { currentBranch: 'main', favorite: true, issue: { provider: 'github', key: '1' } },
      allActions(), t
    )
    expect(rows(worst).length).toBeLessThanOrEqual(15)
  })

  test('clicking a row runs exactly the handler the caller passed', () => {
    const actions = allActions()
    const items = buildBranchMenu(local(), { currentBranch: 'main' }, actions, t)
    const row = items.find(i => !('separator' in i) && i.label === 'sb.branch.checkout')
    ;(row as any).action()
    expect(actions.onCheckout).toHaveBeenCalledTimes(1)
    expect(actions.onDelete).not.toHaveBeenCalled()
  })
})
