import { buildBranchMenu, type BranchMenuActions, type BranchMenuTarget } from '../branchMenu'
import type { MenuItemDef } from '../ContextMenu'

// The real `t` maps keys to prose; the tests only care about which rows exist
// and in what order, so echo the key back (with args) instead.
const t = (key: string, ...args: any[]) => args.length ? `${key}(${args.join(',')})` : key

const labels = (items: MenuItemDef[]) =>
  items.filter((i): i is Exclude<MenuItemDef, { separator: true }> => !('separator' in i)).map(i => i.label)

const local = (over: Partial<BranchMenuTarget> = {}): BranchMenuTarget =>
  ({ name: 'feature/x', display: 'feature/x', current: false, remote: false, ...over })

// Every handler wired, so a row is omitted only because of the branch's state.
const allActions = (): BranchMenuActions => ({
  onCheckout: jest.fn(), onFetch: jest.fn(), onPull: jest.fn(), onPush: jest.fn(),
  onMerge: jest.fn(), onRebaseOnto: jest.fn(), onCompare: jest.fn(), onSetUpstream: jest.fn(),
  onOpenOnRemote: jest.fn(), onAssociateIssue: jest.fn(), onToggleFavorite: jest.fn(),
  onTogglePin: jest.fn(), onToggleSolo: jest.fn(), onToggleMute: jest.fn(),
  onCopyName: jest.fn(), onRename: jest.fn(), onDelete: jest.fn(), onDeleteRemote: jest.fn(),
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
    expect(l).toContain('sb.branch.compareWith(main)')
    expect(l).toContain('sb.delete')
    // Fetch/Pull only make sense on the branch you are standing on.
    expect(l).not.toContain('sb.branch.fetch')
    expect(l).not.toContain('sb.branch.pull')
  })

  test('the current branch gets sync actions but no checkout, merge or delete', () => {
    const items = buildBranchMenu(
      local({ name: 'main', display: 'main', current: true }),
      { currentBranch: 'main' }, allActions(), t
    )
    const l = labels(items)
    expect(l).toContain('sb.branch.fetch')
    expect(l).toContain('sb.branch.pull')
    expect(l).toContain('sb.branch.push')
    expect(l).not.toContain('sb.branch.checkout')
    expect(l).not.toContain('sb.branch.mergeInto(main)')
    // You cannot delete the branch you are on.
    expect(l).not.toContain('sb.delete')
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
    expect(l).not.toContain('sb.delete')
    expect(l).toContain('sb.branch.deleteRemote')
  })

  test('toggle rows reflect their current state', () => {
    const on = buildBranchMenu(local(), {
      currentBranch: 'main', favorite: true, pinned: true, soloed: true, muted: true,
    }, allActions(), t)
    expect(labels(on)).toEqual(expect.arrayContaining([
      'sb.branch.unfavorite', 'sb.branch.unpin', 'sb.branch.unsolo', 'sb.branch.unmute',
    ]))

    const off = buildBranchMenu(local(), { currentBranch: 'main' }, allActions(), t)
    expect(labels(off)).toEqual(expect.arrayContaining([
      'sb.branch.favorite', 'sb.branch.pin', 'sb.branch.solo', 'sb.branch.mute',
    ]))
  })

  test('a linked issue is shown on the associate row instead of the generic label', () => {
    const items = buildBranchMenu(
      local(), { currentBranch: 'main', issue: { number: 42, title: 'Login bug' } }, allActions(), t
    )
    expect(labels(items)).toContain('sb.branch.issueLinked(42)')
    expect(labels(items)).not.toContain('sb.branch.associateIssue')
  })

  test('delete is always the last row and flagged danger', () => {
    const items = buildBranchMenu(local(), { currentBranch: 'main' }, allActions(), t)
    const last = items[items.length - 1]
    expect(last).toMatchObject({ label: 'sb.delete', danger: true })
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

  test('clicking a row runs exactly the handler the caller passed', () => {
    const actions = allActions()
    const items = buildBranchMenu(local(), { currentBranch: 'main' }, actions, t)
    const row = items.find(i => !('separator' in i) && i.label === 'sb.branch.checkout')
    ;(row as any).action()
    expect(actions.onCheckout).toHaveBeenCalledTimes(1)
    expect(actions.onDelete).not.toHaveBeenCalled()
  })
})
