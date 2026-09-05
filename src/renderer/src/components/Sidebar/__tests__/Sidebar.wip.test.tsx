import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { emptyVisibility } from '../../../utils/graphVisibility'
import Sidebar from '../Sidebar'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The way to the working changes was a //WIP row in the graph: there only
// while the tree is dirty, and named for nobody new. This row is always there.

function draw(extra: Record<string, any> = {}) {
  installMockGitAPI({
    getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
    getReflog: jest.fn().mockResolvedValue({ entries: [] }),
    getSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
    listWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
    getWorkingChanges: jest.fn().mockResolvedValue({ staged: [], unstaged: [], untracked: [] }),
  })
  const props: Record<string, any> = {
    repoPath: '/repo', repoName: 'repo', currentBranch: 'main',
    branches: [], recentRepos: [], stashes: [], tags: [],
    soloBranch: null, visibility: emptyVisibility(),
    showToast: jest.fn(), showPrompt: jest.fn(), showConfirm: jest.fn(),
    ...extra,
  }
  for (const k of [
    'onOpenRepo', 'onClone', 'onSetRepo', 'onRemoveRecent', 'onCheckout', 'onCreateBranch',
    'onDeleteBranch', 'onMergeBranch', 'onRenameBranch', 'onRebaseOnto', 'onPushBranch',
    'onDeleteRemoteBranch', 'onSetUpstream', 'onCreateStash', 'onApplyStash', 'onPopStash',
    'onDropStash', 'onRefreshStashes', 'onCreateTag', 'onDeleteTag', 'onCheckoutTag', 'onGoTo',
    'onPushTag', 'onDeleteRemoteTag', 'onSelectCommit', 'onCompareBranch',
    'onToggleSolo', 'onToggleHide',
  ]) props[k] ??= jest.fn()
  renderWithProviders(<Sidebar {...(props as any)} />)
}

test('a persistent row names the working changes, counts them, and opens them', async () => {
  const onViewWip = jest.fn()
  draw({ wipCount: 3, onViewWip })
  const row = screen.getByRole('button', { name: /Working changes/ })
  expect(row).toHaveTextContent('3')
  expect(row).toHaveAttribute('aria-pressed', 'false')
  await userEvent.click(row)
  expect(onViewWip).toHaveBeenCalledTimes(1)
})

test('the row shows where it is, and a host without the destination gets no row', () => {
  draw({ wipCount: 0, wipSelected: true, onViewWip: jest.fn() })
  expect(screen.getByRole('button', { name: /Working changes/ })).toHaveAttribute('aria-pressed', 'true')
})

test('no onViewWip, no row', () => {
  draw({ wipCount: 3 })
  expect(screen.queryByRole('button', { name: /Working changes/ })).not.toBeInTheDocument()
})
