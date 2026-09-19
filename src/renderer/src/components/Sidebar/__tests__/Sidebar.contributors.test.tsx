import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { emptyVisibility } from '../../../utils/graphVisibility'
import Sidebar from '../Sidebar'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// Who has committed here, in the overview, and a row that narrows the graph
// to one author. The section exists only where the host can filter.

function draw(over: Record<string, any> = {}) {
  installMockGitAPI({
    getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
    getReflog: jest.fn().mockResolvedValue({ entries: [] }),
    getSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
    listWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
    getWorkingChanges: jest.fn().mockResolvedValue({ staged: [], unstaged: [], untracked: [] }),
    getContributors: jest.fn().mockResolvedValue({ contributors: [
      { name: 'Alice Martin', email: 'alice@example.test', commits: 128 },
      { name: 'Bob', email: 'bob@example.test', commits: 7 },
    ] }),
  })
  const props: Record<string, any> = {
    repoPath: '/repo', repoName: 'repo', currentBranch: 'main',
    branches: [{ name: 'main', current: true, remote: false, commit: 'abc', label: '' }], recentRepos: [], stashes: [], tags: [],
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

describe('the contributors', () => {
  test('are listed with their counts, and a row narrows the graph to one author', async () => {
    const onFilterAuthor = jest.fn()
    draw({ onFilterAuthor })
    await userEvent.click(screen.getByText('CONTRIBUTORS'))
    await waitFor(() => expect(screen.getByText('Alice Martin')).toBeInTheDocument())
    expect(screen.getByTitle(/show only commits by bob/i)).toHaveTextContent('7')
    await userEvent.click(screen.getByText('Alice Martin'))
    expect(onFilterAuthor).toHaveBeenCalledWith('Alice Martin')
  })

  test('the row of the author already filtered to reads as pressed, and widens back', async () => {
    const onFilterAuthor = jest.fn()
    draw({ onFilterAuthor, authorFilter: 'Bob' })
    await userEvent.click(screen.getByText('CONTRIBUTORS'))
    const bob = await screen.findByTitle(/show every author/i)
    expect(bob).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(bob)
    expect(onFilterAuthor).toHaveBeenCalledWith(null)
  })

  test('without a host that filters, there is no section at all', () => {
    draw()
    expect(screen.queryByText('CONTRIBUTORS')).not.toBeInTheDocument()
  })
})
