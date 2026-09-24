import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { emptyVisibility } from '../../../utils/graphVisibility'
import Sidebar from '../Sidebar'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'
import { recomposeOffer, readingLabel, tagChangelogSubject, unpushedSubject } from '../refReadings'
import { localBranchProps } from '../localBranchProps'
import { branchItemMenu } from '../BranchItem'
import { buildBranchMenu, type BranchMenuTarget } from '../../ContextMenu/branchMenu'
import type { MenuAction, MenuItemDef } from '../../ContextMenu/ContextMenu'
import type { BranchInfo } from '../../../types'

// The AI entries on the side bar's refs (#293) — where each is offered, and
// the subject (the RANGE) each hands the reading it reuses.
//
//   Explain unpushed changes   local branch ahead of its upstream   <upstream>..<branch>
//   Recompose commits          any local branch; runs when checked out   <branch>
//   Changelog since this tag   any tag, while a branch is checked out    <tag>..<branch>

const branch = (over: Partial<BranchInfo> = {}): BranchInfo => ({
  name: 'feat', current: false, remote: false, commit: 'abc1234', label: 'subject', ...over,
})

describe('which ref offers which reading', () => {
  test('unpushed: only a local branch ahead of an upstream it still has', () => {
    expect(unpushedSubject(branch({ upstream: 'origin/feat', ahead: 2 }))).toBe('origin/feat..feat')
    expect(unpushedSubject(branch({ upstream: 'origin/feat', ahead: 0 }))).toBeNull()
    expect(unpushedSubject(branch({ ahead: 2 }))).toBeNull()                                   // never published
    expect(unpushedSubject(branch({ upstream: 'origin/feat', ahead: 2, gone: true }))).toBeNull()
    expect(unpushedSubject(branch({ name: 'remotes/origin/feat', remote: true, upstream: 'x', ahead: 1 }))).toBeNull()
    expect(unpushedSubject(branch({ detached: true, upstream: 'origin/feat', ahead: 1 }))).toBeNull()
  })

  test('recompose: every local branch has the entry, only the checked-out one can run it', () => {
    expect(recomposeOffer(branch({ current: true }))).toBe('here')
    expect(recomposeOffer(branch({ current: false }))).toBe('checkout-first')
    expect(recomposeOffer(branch({ name: 'remotes/origin/feat', remote: true }))).toBeNull()
    expect(recomposeOffer(branch({ current: true, detached: true }))).toBeNull()
    expect(recomposeOffer(branch({ current: true, commit: '' }))).toBeNull()                 // unborn
  })

  test('a tag: its changelog runs to the branch that is checked out', () => {
    const branches = [branch({ name: 'main', current: true }), branch({ name: 'feat' })]
    expect(tagChangelogSubject('v1.2.0', branches)).toBe('v1.2.0..main')
    // Detached: there is no branch for the kept changelog to be about.
    expect(tagChangelogSubject('v1.2.0', [branch({ name: 'HEAD detached at abc', current: true, detached: true, commit: '' })])).toBeNull()
    expect(tagChangelogSubject('v1.2.0', [])).toBeNull()
  })

  test('a range keeps its base in the title; a branch keeps its short name', () => {
    const remotes = new Set(['origin'])
    expect(readingLabel('origin/feat..feat', remotes)).toBe('origin/feat..feat')
    expect(readingLabel('v1.2.0..main', remotes)).toBe('v1.2.0..main')
    expect(readingLabel('remotes/origin/feat', remotes)).toBe('feat')
  })
})

const t = (key: string, ...args: any[]) => args.length ? `${key}(${args.join(',')})` : key
const rows = (items: MenuItemDef[]) =>
  items.filter((i): i is MenuAction => !('separator' in i))
const aiRows = (items: MenuItemDef[]) =>
  rows(rows(items).find(i => i.label === 'sb.branch.aiMenu')?.submenu ?? [])

describe('the branch menu\'s AI rows', () => {
  const target = (over: Partial<BranchMenuTarget> = {}): BranchMenuTarget =>
    ({ name: 'feat', display: 'feat', current: false, remote: false, ...over })

  test('recompose runs on the checked-out branch', () => {
    const onRecompose = jest.fn()
    const ai = aiRows(buildBranchMenu(target({ current: true }), { currentBranch: 'feat' }, { onRecompose }, t))
    expect(ai).toEqual([expect.objectContaining({ label: 'sb.branch.recompose', tone: 'ai' })])
    expect(ai[0].disabled).toBeFalsy()
    ai[0].action!()
    expect(onRecompose).toHaveBeenCalledTimes(1)
  })

  test('elsewhere it stays, disabled, and its label is the reason', () => {
    const ai = aiRows(buildBranchMenu(target(), { currentBranch: 'main' }, { onRecompose: jest.fn() }, t))
    expect(ai).toEqual([expect.objectContaining({ label: 'sb.branch.recomposeCheckout(feat)', disabled: true })])
    expect(ai[0].action).toBeUndefined()
  })

  test('never on a remote branch', () => {
    const items = buildBranchMenu(target({ name: 'remotes/origin/feat', remote: true }),
      { currentBranch: 'main' }, { onRecompose: jest.fn() }, t)
    expect(aiRows(items)).toEqual([])
  })

  test('explain unpushed sits beside explain, as a reading', () => {
    const ai = aiRows(buildBranchMenu(target(), { currentBranch: 'main' },
      { onExplain: jest.fn(), onExplainUnpushed: jest.fn(), onChangelog: jest.fn() }, t))
    expect(ai.map(r => r.label)).toEqual(['sb.branch.explain', 'sb.branch.explainUnpushed', 'sb.branch.changelog'])
  })
})

describe('a branch row sends its range to the host', () => {
  const state = (over: Record<string, any> = {}) => ({
    currentBranch: 'feat', branches: [], worktreeOf: () => undefined, branchHidden: () => false,
    onExplainBranch: jest.fn(), onBranchChangelog: jest.fn(), onRecomposeBranch: jest.fn(),
    ...over,
  }) as any

  test('explain unpushed asks the explain reading for upstream..branch', () => {
    const s = state()
    const props = localBranchProps(s, branch({ upstream: 'origin/feat', ahead: 3 }))
    props.onExplainUnpushed!()
    expect(s.onExplainBranch).toHaveBeenCalledWith('origin/feat..feat')
    // The whole-branch reading is unchanged: the branch alone, base resolved.
    props.onExplain!()
    expect(s.onExplainBranch).toHaveBeenLastCalledWith('feat')
  })

  test('nothing unpushed, no row', () => {
    const props = localBranchProps(state(), branch({ upstream: 'origin/feat', ahead: 0 }))
    expect(props.onExplainUnpushed).toBeUndefined()
    expect(aiRows(branchItemMenu(props, t as any)).map(r => r.label)).not.toContain('sb.branch.explainUnpushed')
  })

  test('recompose hands the host the checked-out branch, and nothing else', () => {
    const s = state()
    localBranchProps(s, branch({ current: true })).onRecompose!()
    expect(s.onRecomposeBranch).toHaveBeenCalledWith('feat')

    // Another branch: the row is there (disabled), and even called it asks nothing.
    const other = localBranchProps(s, branch({ name: 'other' }))
    expect(aiRows(branchItemMenu(other, t as any)))
      .toContainEqual(expect.objectContaining({ label: 'sb.branch.recomposeCheckout(other)', disabled: true }))
    other.onRecompose!()
    expect(s.onRecomposeBranch).toHaveBeenCalledTimes(1)
  })

  test('a host that cannot recompose draws no row', () => {
    const props = localBranchProps(state({ onRecomposeBranch: undefined }), branch({ current: true }))
    expect(props.onRecompose).toBeUndefined()
  })
})

describe('a tag row: changelog since this tag', () => {
  const TAGS = [{ name: 'v1.22.0', hash: 'b4e1f37' }, { name: 'v1.21.1', hash: 'a77e361' }]

  function renderTags(branches: BranchInfo[], overrides: Record<string, any> = {}) {
    installMockGitAPI({
      getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
      getReflog: jest.fn().mockResolvedValue({ entries: [] }),
      getSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
      listWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
      getWorkingChanges: jest.fn().mockResolvedValue({ staged: [], unstaged: [], untracked: [] }),
    })
    const props: Record<string, any> = {
      repoPath: '/repo', repoName: 'repo', currentBranch: branches.find(b => b.current)?.name ?? '',
      branches, recentRepos: [], stashes: [], tags: TAGS,
      soloBranch: null, visibility: emptyVisibility(), view: 'tags',
      showToast: jest.fn(), showPrompt: jest.fn(), showConfirm: jest.fn(),
      onBranchChangelog: jest.fn(),
    }
    for (const k of [
      'onOpenRepo', 'onClone', 'onSetRepo', 'onCheckout', 'onCreateBranch',
      'onDeleteBranch', 'onMergeBranch', 'onRenameBranch', 'onRebaseOnto', 'onPushBranch',
      'onDeleteRemoteBranch', 'onSetUpstream', 'onCreateStash', 'onApplyStash', 'onPopStash',
      'onDropStash', 'onRefreshStashes', 'onCreateTag', 'onDeleteTag', 'onCheckoutTag', 'onGoTo',
      'onPushTag', 'onDeleteRemoteTag', 'onSelectCommit', 'onCompareBranch',
      'onToggleSolo', 'onToggleHide',
    ]) props[k] = jest.fn()
    Object.assign(props, overrides)
    renderWithProviders(<Sidebar {...(props as any)} />)
    return props
  }

  async function menuOf(tag: string) {
    if (!screen.queryByText(tag)) await userEvent.click(screen.getByText('TAGS'))
    await waitFor(() => expect(screen.getByText(tag)).toBeInTheDocument())
    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText(tag) })
  }

  test('asks the changelog reading for tag..current branch', async () => {
    const props = renderTags([branch({ name: 'main', current: true })])
    await menuOf('v1.21.1')
    await userEvent.click(await screen.findByText('Generate Changelog of main Since This Tag'))
    expect(props.onBranchChangelog).toHaveBeenCalledWith('v1.21.1..main')
    expect(props.onBranchChangelog).toHaveBeenCalledTimes(1)
  })

  test('not offered on a detached HEAD', async () => {
    renderTags([branch({ name: 'HEAD detached at b4e1f37', current: true, detached: true, commit: '' })])
    await menuOf('v1.22.0')
    await screen.findByText(/check out the commit/i)
    expect(screen.queryByText(/Since This Tag/)).toBeNull()
  })

  test('not offered by a host that writes no changelog', async () => {
    renderTags([branch({ name: 'main', current: true })], { onBranchChangelog: undefined })
    await menuOf('v1.22.0')
    await screen.findByText(/check out the commit/i)
    expect(screen.queryByText(/Since This Tag/)).toBeNull()
  })
})
