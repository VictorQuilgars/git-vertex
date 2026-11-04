// Every change of a branch, a stash or a pull request, at once (#284).
//
// The row is the panel's: its host opens VS Code's multi-file diff, the
// desktop has no such editor and its preload no such method. So the rule
// these tests hold is the one every row of the side bar keeps — offered only
// where something real is behind it — and then that each kind asks for the
// right pair of ends. Which FILES those ends produce is git-core's, and is
// tested there (git-core-change-set.test.ts).
import { act, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { emptyVisibility } from '../../../utils/graphVisibility'
import { branchChangesBase } from '../../../utils/changeSet'
import Sidebar from '../Sidebar'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

const STASHES = [
  { index: 0, message: 'stash@{0}: WIP on main: cache keys' },
  { index: 2, message: 'stash@{2}: On main: an older one' },
]

function draw(overrides: Record<string, any> = {}, api: Record<string, any> = {}) {
  installMockGitAPI({
    getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
    getReflog: jest.fn().mockResolvedValue({ entries: [] }),
    getSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
    listWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
    listAgents: jest.fn().mockResolvedValue({ agents: [] }),
    getWorkingChanges: jest.fn().mockResolvedValue({ staged: [], unstaged: [], untracked: [] }),
    ...api,
  })
  const props: Record<string, any> = {
    repoPath: '/repo', repoName: 'repo', currentBranch: 'main',
    branches: [{ name: 'main', current: true, remote: false }, { name: 'topic', current: false, remote: false }],
    recentRepos: [], stashes: STASHES, tags: [],
    soloBranch: null, visibility: emptyVisibility(),
    showToast: jest.fn(), showPrompt: jest.fn().mockResolvedValue(null), showConfirm: jest.fn().mockResolvedValue(true),
  }
  for (const k of [
    'onOpenRepo', 'onClone', 'onSetRepo', 'onCheckout', 'onCreateBranch',
    'onDeleteBranch', 'onMergeBranch', 'onRenameBranch', 'onRebaseOnto', 'onPushBranch',
    'onDeleteRemoteBranch', 'onSetUpstream', 'onCreateStash', 'onApplyStash', 'onPopStash',
    'onDropStash', 'onRefreshStashes', 'onCreateTag', 'onDeleteTag', 'onCheckoutTag', 'onGoTo',
    'onPushTag', 'onDeleteRemoteTag', 'onSelectCommit', 'onCompareBranch',
    'onToggleSolo', 'onToggleHide', 'onReveal', 'onPreviewStash',
  ]) props[k] = jest.fn()
  Object.assign(props, overrides)
  renderWithProviders(<Sidebar {...(props as any)} />)
  return props
}

const menuOn = async (el: Element) => {
  fireEvent.contextMenu(el)
  await waitFor(() => expect(document.querySelector('.context-menu, [role="menu"]')).toBeTruthy())
}
const menuLabels = () => [...document.querySelectorAll('.context-menu button, [role="menuitem"]')]
  .map(b => (b.textContent ?? '').replace(/^✓/, '').trim())

describe('where there is no multi-file diff — the desktop', () => {
  test('no branch, stash or request offers one', async () => {
    draw({ view: 'stash' })
    await menuOn(await screen.findByText('On main: an older one'))
    expect(menuLabels()).not.toContain('Open All Changes')
  })

  test('nor does a branch row', async () => {
    draw({ view: 'branches' })
    await menuOn(await screen.findByText('topic'))
    expect(menuLabels()).not.toContain('Open All Changes')
  })
})

describe('where the host opens one — the panel', () => {
  const opened = () => jest.fn().mockResolvedValue({ success: true })

  test('a stash opens its own changes, older ones included', async () => {
    const openAllChanges = opened()
    draw({ view: 'stash' }, { openAllChanges })
    await menuOn(await screen.findByText('On main: an older one'))
    await userEvent.click(screen.getByText('Open All Changes'))
    expect(openAllChanges).toHaveBeenCalledWith({ kind: 'stash', index: 2 }, 'Changes in stash@{2}')
  })

  test('a branch opens what it did since it forked from the checked-out one', async () => {
    const openAllChanges = opened()
    draw({ view: 'branches' }, { openAllChanges })
    await menuOn(await screen.findByText('topic'))
    await userEvent.click(screen.getByText('Open All Changes'))
    expect(openAllChanges).toHaveBeenCalledWith(
      { kind: 'range', base: 'main', head: 'topic', axis: 'diverged' }, 'Changes on topic since main')
  })

  test('the checked-out branch, with nothing to be read against, offers nothing', async () => {
    draw({ view: 'branches' }, { openAllChanges: opened() })
    await menuOn(await screen.findByText('main'))
    expect(menuLabels()).not.toContain('Open All Changes')
  })

  test('a request is fetched, then opened base to head, against the remote\'s base', async () => {
    const openAllChanges = opened()
    const fetchPullRequest = jest.fn().mockResolvedValue({ success: true, branch: 'pr/7' })
    draw({ githubPRs: [{ number: 7, title: 'A PR', url: 'u7', baseRef: 'main' }] }, { openAllChanges, fetchPullRequest })
    fireEvent.click(screen.getByText('PULL REQUESTS'))
    document.querySelectorAll('.sb-gh-group-head').forEach(h => fireEvent.click(h))
    await userEvent.click(document.querySelector('.sb-gh-kebab')!)
    await userEvent.click(await screen.findByText('Open All Changes'))
    await waitFor(() => expect(openAllChanges).toHaveBeenCalledWith(
      { kind: 'range', base: 'origin/main', head: 'pr/7', axis: 'diverged' }, 'Changes of #7'))
    expect(fetchPullRequest).toHaveBeenCalledWith(7, { checkout: false })
  })

  test('a refusal is said, not swallowed', async () => {
    const openAllChanges = jest.fn().mockResolvedValue({ success: false, error: 'This editor has no multi-file diff to open the changes in' })
    const p = draw({ view: 'stash' }, { openAllChanges })
    await menuOn(await screen.findByText('On main: an older one'))
    await userEvent.click(screen.getByText('Open All Changes'))
    await act(async () => { await Promise.resolve() })
    await waitFor(() => expect(p.showToast).toHaveBeenCalledWith(expect.stringContaining('no multi-file diff'), 'err'))
  })
})

describe('what a branch is read against', () => {
  test('another branch: the checked-out one', () => {
    expect(branchChangesBase('feat', false, 'main', 'develop')).toBe('main')
  })
  test('the checked-out one: the merge target, never itself', () => {
    expect(branchChangesBase('feat', true, 'feat', 'main')).toBe('main')
    expect(branchChangesBase('main', true, 'main', 'main')).toBeNull()
    expect(branchChangesBase('main', true, 'main', null)).toBeNull()
  })
})
