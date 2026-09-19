import { buildBranchMenu, remoteOf, type BranchMenuActions, type BranchMenuTarget } from '../branchMenu'
import { branchTipExtras } from '../branchTipMenu'
import type { MenuItemDef } from '../ContextMenu'

// What the side bar audit added to the branch menu: the acts a branch needs
// (#280), its tip's own acts (#281), and what a remote branch row can do
// (#282). Keys are echoed back rather than translated — see branchMenu.test.ts.
const t = (key: string, ...args: any[]) => args.length ? `${key}(${args.join(',')})` : key

const rows = (items: MenuItemDef[]) =>
  items.filter((i): i is Exclude<MenuItemDef, { separator: true }> => !('separator' in i))
const labels = (items: MenuItemDef[]) => rows(items).map(i => i.label)
const subLabels = (items: MenuItemDef[], label: string) =>
  labels(rows(items).find(i => i.label === label)?.submenu ?? [])

const upkeep = (): BranchMenuActions => ({
  onPullBranch: jest.fn(), onChangeUpstream: jest.fn(),
  onRebaseOntoUpstream: jest.fn(), onSquashFixups: jest.fn(),
  onCompareUpstream: jest.fn(), onHideRemote: jest.fn(),
  onCompare: jest.fn(), onMerge: jest.fn(), onRebaseOnto: jest.fn(),
  onCheckout: jest.fn(), onPull: jest.fn(),
})

const target = (over: Partial<BranchMenuTarget> = {}): BranchMenuTarget =>
  ({ name: 'feature/x', display: 'feature/x', current: false, remote: false, ...over })

const menu = (over: Partial<BranchMenuTarget> = {}, actions = upkeep()) =>
  buildBranchMenu(target(over), { currentBranch: 'main' }, actions, t)

describe('keeping a branch up to date (#280)', () => {
  test('a branch you are not on is pulled by name — but only where there is an upstream to pull from', () => {
    expect(labels(menu({ publishedAs: 'origin/feature/x' }))).toContain('sb.branch.pullNamed(feature/x)')
    // Never published: nothing to fast-forward from, and the row would fail.
    expect(labels(menu())).not.toContain('sb.branch.pullNamed(feature/x)')
  })

  test('the branch you ARE on keeps the plain Pull, and is not offered the other one', () => {
    const l = labels(menu({ current: true, publishedAs: 'origin/main' }))
    expect(l).toContain('sb.branch.pull')
    expect(l).not.toContain('sb.branch.pullNamed(feature/x)')
  })

  test('the upstream can be picked on any local branch, published or not', () => {
    expect(labels(menu())).toContain('sb.branch.changeUpstream')
    expect(labels(menu({ current: true }))).toContain('sb.branch.changeUpstream')
    // A remote-tracking row has no upstream of its own to set.
    expect(labels(menu({ remote: true }))).not.toContain('sb.branch.changeUpstream')
  })

  test('rebasing onto the upstream and squashing fixups are offered on the current branch only', () => {
    const own = labels(menu({ current: true }))
    expect(own).toContain('sb.branch.rebaseOntoUpstream')
    expect(own).toContain('sb.branch.squashFixups')
    const other = labels(menu())
    expect(other).not.toContain('sb.branch.rebaseOntoUpstream')
    expect(other).not.toContain('sb.branch.squashFixups')
  })

  test('comparing with the upstream sits in the Compare submenu, and names it', () => {
    const items = menu({ current: true, publishedAs: 'origin/main' })
    expect(subLabels(items, 'sb.branch.compareMenu')).toContain('sb.branch.compareUpstream(origin/main)')
  })
})

describe('a remote branch row (#282)', () => {
  const remote = (actions = upkeep()) =>
    buildBranchMenu(
      target({ name: 'remotes/origin/release', display: 'release', remote: true, publishedAs: 'origin/release' }),
      { currentBranch: 'main' }, actions, t)

  test('can be merged into the current branch, rebased onto, and compared', () => {
    const l = labels(remote())
    expect(l).toContain('sb.branch.mergeInto(main)')
    expect(l).toContain('sb.branch.rebaseOnto(main)')
    expect(subLabels(remote(), 'sb.branch.compareMenu')).toContain('sb.branch.compareWith(main)')
  })

  test('hides its own remote, named', () => {
    expect(subLabels(remote(), 'sb.branch.viewMenu')).toContain('sb.branch.hideRemote(origin)')
  })

  test('the remote a ref belongs to is read off its name', () => {
    expect(remoteOf('remotes/origin/feat/x')).toBe('origin')
    expect(remoteOf('upstream/main')).toBe('upstream')
    expect(remoteOf('main')).toBe('main')
  })
})

describe("the tip commit's own acts, from the branch row (#281)", () => {
  const tip = { ref: 'feature/x', hash: 'abc1234', subject: 'feat: the thing' }
  const tipActions = () => ({
    onCreateBranchAt: jest.fn(), onCreateTag: jest.fn(), onCreateWorktreeAt: jest.fn(),
    onReset: jest.fn(), onCompareWorking: jest.fn(), onSelectForCompare: jest.fn(),
    onCompareWithSelected: jest.fn(), onCopyFullHash: jest.fn(),
    compareBaseHash: 'dddd999',
  })

  const withTip = (current: boolean, actions = tipActions()) =>
    buildBranchMenu(target({ current }), { currentBranch: 'main' }, upkeep(), t,
      branchTipExtras(tip, current, actions, t))

  test('offers making a branch, a tag and a worktree at the tip', () => {
    const l = labels(withTip(false))
    expect(l).toContain('graph.menu.createBranch')
    expect(l).toContain('graph.menu.createTag')
    expect(l).toContain('graph.menu.createWorktree')
  })

  test('resets the current branch to it — but never on the branch you are already on', () => {
    expect(labels(withTip(false))).toContain('graph.menu.reset')
    expect(subLabels(withTip(false), 'graph.menu.reset')).toEqual([
      'graph.menu.resetSoft', 'graph.menu.resetMixed', 'graph.menu.resetHard',
    ])
    expect(labels(withTip(true))).not.toContain('graph.menu.reset')
  })

  test('copies the sha and the message, in the menu\'s one Copy place', () => {
    const copies = subLabels(withTip(false), 'sb.branch.copyMenu')
    expect(copies).toContain('graph.menu.copyShortHash')
    expect(copies).toContain('graph.menu.copyFullHash')
    expect(copies).toContain('graph.menu.copyMessage')
  })

  test('compares with the working tree, and joins a comparison already begun', () => {
    const compares = subLabels(withTip(false), 'sb.branch.compareMenu')
    expect(compares).toContain('graph.menu.compareWorking')
    expect(compares).toContain('graph.menu.selectForCompare')
    expect(compares).toContain('graph.menu.compareWithSelected')
  })

  test('comparing a commit with itself is offered, and disabled — as on the graph row', () => {
    const actions = { ...tipActions(), compareBaseHash: 'abc1234' }
    const items = buildBranchMenu(target(), { currentBranch: 'main' }, upkeep(), t,
      branchTipExtras(tip, false, actions, t))
    const compare = rows(items).find(i => i.label === 'sb.branch.compareMenu')
    const withSelected = rows(compare?.submenu ?? []).find(i => i.label === 'graph.menu.compareWithSelected')
    expect(withSelected?.disabled).toBe(true)
  })

  test('nothing selected for a comparison: no row to join one', () => {
    const actions = { ...tipActions(), compareBaseHash: null }
    const items = buildBranchMenu(target(), { currentBranch: 'main' }, upkeep(), t,
      branchTipExtras(tip, false, actions, t))
    expect(subLabels(items, 'sb.branch.compareMenu')).not.toContain('graph.menu.compareWithSelected')
  })

  test('a host that wired none of it gets none of it, rather than dead rows', () => {
    const items = buildBranchMenu(target(), { currentBranch: 'main' }, upkeep(), t,
      branchTipExtras(tip, false, {}, t))
    expect(labels(items)).not.toContain('graph.menu.createBranch')
    // The short sha is the one copy that needs no handler: the row carries it.
    expect(subLabels(items, 'sb.branch.copyMenu')).toEqual(['graph.menu.copyShortHash', 'graph.menu.copyMessage'])
  })
})
