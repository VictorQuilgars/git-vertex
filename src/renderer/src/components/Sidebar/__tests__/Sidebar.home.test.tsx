import { screen, waitFor, fireEvent } from '@testing-library/react'
import { emptyVisibility } from '../../../utils/graphVisibility'
import Sidebar from '../Sidebar'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'
import { recentBranches, agoLabel } from '../sections/OverviewSection'

// The overview as a home: the current branch and what to do with it, the
// branches worked on recently, what waits on the user, what to start.

const NOW = Date.now()
const daysAgo = (d: number) => Math.round(NOW / 1000 - d * 86400)
const BRANCHES = [
  { name: 'main', current: true, remote: false, commit: 'aaa1111', label: '', ahead: 2, date: daysAgo(0) },
  { name: 'feature/login', current: false, remote: false, commit: 'bbb2222', label: '', date: daysAgo(2), behind: 1 },
  { name: 'old/experiment', current: false, remote: false, commit: 'ccc3333', label: '', date: daysAgo(40) },
  { name: 'remotes/origin/main', current: false, remote: true, commit: 'aaa1111', label: '', date: daysAgo(0) },
]

function draw(over: Record<string, any> = {}) {
  installMockGitAPI({
    getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
    getReflog: jest.fn().mockResolvedValue({ entries: [] }),
    getSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
    listWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
    getWorkingChanges: jest.fn().mockResolvedValue({ staged: [], unstaged: [], untracked: [] }),
  })
  const props: Record<string, any> = {
    repoPath: '/repo', repoName: 'repo', currentBranch: 'main',
    branches: BRANCHES, recentRepos: [], stashes: [], tags: [],
    soloBranch: null, visibility: emptyVisibility(),
    view: 'overview',
    showToast: jest.fn(), showPrompt: jest.fn(), showConfirm: jest.fn(),
    ...over,
  }
  for (const k of [
    'onOpenRepo', 'onClone', 'onSetRepo', 'onCheckout', 'onCreateBranch',
    'onDeleteBranch', 'onMergeBranch', 'onRenameBranch', 'onRebaseOnto', 'onPushBranch',
    'onDeleteRemoteBranch', 'onSetUpstream', 'onCreateStash', 'onApplyStash', 'onPopStash',
    'onDropStash', 'onRefreshStashes', 'onCreateTag', 'onDeleteTag', 'onCheckoutTag', 'onGoTo',
    'onPushTag', 'onDeleteRemoteTag', 'onSelectCommit', 'onCompareBranch',
    'onToggleSolo', 'onToggleHide',
  ]) if (!(k in props)) props[k] = jest.fn()
  renderWithProviders(<Sidebar {...(props as any)} />)
  return props
}

describe('the recent branches', () => {
  test('are the local ones whose tip moved within the threshold, newest first, the current one aside', () => {
    expect(recentBranches(BRANCHES as any, 7, NOW).map(b => b.name)).toEqual(['feature/login'])
    expect(recentBranches(BRANCHES as any, 60, NOW).map(b => b.name)).toEqual(['feature/login', 'old/experiment'])
  })

  test('say when the tip moved', () => {
    expect(agoLabel(daysAgo(2), 'en-US', NOW)).toBe('2 days ago')
    expect(agoLabel(daysAgo(0) - 120, 'en-US', NOW)).toBe('2 minutes ago')
  })

  test('a row reveals the branch in the graph, a double-click switches to it, and the timeframe widens', async () => {
    const p = draw()
    const row = await screen.findByTitle(/show feature\/login in the graph/i)
    fireEvent.click(row)
    expect(p.onSelectCommit).toHaveBeenCalledWith('bbb2222')
    fireEvent.doubleClick(row)
    expect(p.onCheckout).toHaveBeenCalledWith('feature/login')
    expect(screen.queryByText('old/experiment')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTitle(/change the timeframe/i))
    fireEvent.click(screen.getByRole('menuitemradio', { name: '1 month' }))
    expect(screen.queryByText('old/experiment')).not.toBeInTheDocument()  // 40 days is older than a month
  })
})

describe('the home card', () => {
  test('offers the one state action that is true, and the merge target', async () => {
    const onPublish = jest.fn()
    draw({
      home: { state: { branch: 'main', hasUpstream: false, remoteName: 'origin' }, actions: { onPublish, onPush: jest.fn(), onPull: jest.fn(), onCreateBranch: jest.fn() } },
      mergeTarget: { name: 'develop', ahead: 1, behind: 3 },
    })
    await waitFor(() => expect(screen.getByText('3 commits behind develop · 1 ahead')).toBeInTheDocument())
    const publish = screen.getByTitle(/publish/i)
    fireEvent.click(publish)
    expect(onPublish).toHaveBeenCalled()
    expect(screen.queryByTitle(/^push/i)).not.toBeInTheDocument()
    expect(document.querySelectorAll('.sb-ov-start')).toHaveLength(1)   // the one start the host offered
  })

  test('says what waits on the user, and when nothing does', async () => {
    draw({ launchpad: { needsReview: 2, changesRequested: 1, approved: 0 } })
    expect(await screen.findByText('2 pull requests need your review')).toBeInTheDocument()
    expect(screen.getByText('1 of yours has changes requested')).toBeInTheDocument()
    draw({ launchpad: { needsReview: 0, changesRequested: 0, approved: 0 } })
    expect(await screen.findByText('Nothing is waiting on you')).toBeInTheDocument()
  })
})
