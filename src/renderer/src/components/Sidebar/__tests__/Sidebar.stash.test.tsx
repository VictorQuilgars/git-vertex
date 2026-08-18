import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { emptyVisibility } from '../../../utils/graphVisibility'
import Sidebar from '../Sidebar'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// Stashing was all-or-nothing and a stash could never be relabelled, even
// though git supports both natively (v1.23.0).

const STASHES = [
  { index: 0, message: 'stash@{0}: On main: wip auth' },
  { index: 1, message: 'stash@{1}: On main: older work' },
]

function renderStash(overrides: Record<string, any> = {}) {
  const api = installMockGitAPI({
    getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
    getReflog: jest.fn().mockResolvedValue({ entries: [] }),
    getSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
    listWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
    getWorkingChanges: jest.fn().mockResolvedValue({ staged: [], unstaged: [], untracked: [] }),
    renameStash: jest.fn().mockResolvedValue({ success: true }),
  })
  const props: Record<string, any> = {
    repoPath: '/repo', repoName: 'repo', currentBranch: 'main',
    branches: [], recentRepos: [], stashes: STASHES, tags: [],
    soloBranch: null, visibility: emptyVisibility(),
    view: 'stash',
    showToast: jest.fn(),
    showPrompt: jest.fn().mockResolvedValue(null),
    showConfirm: jest.fn().mockResolvedValue(false),
  }
  for (const k of [
    'onOpenRepo', 'onClone', 'onSetRepo', 'onRemoveRecent', 'onCheckout', 'onCreateBranch',
    'onDeleteBranch', 'onMergeBranch', 'onRenameBranch', 'onRebaseOnto', 'onPushBranch',
    'onDeleteRemoteBranch', 'onSetUpstream', 'onCreateStash', 'onApplyStash', 'onPopStash',
    'onDropStash', 'onRefreshStashes', 'onCreateTag', 'onDeleteTag', 'onCheckoutTag',
    'onPushTag', 'onDeleteRemoteTag', 'onSelectCommit', 'onCompareBranch',
    'onToggleSolo', 'onToggleHide', 'onRefresh',
  ]) props[k] = jest.fn()

  Object.assign(props, overrides)
  renderWithProviders(<Sidebar {...(props as any)} />)
  return { props, api }
}

async function seeStashes() {
  await waitFor(() => expect(screen.getByText(/wip auth/)).toBeInTheDocument())
}

describe('Sidebar — stash', () => {
  test('the + button offers a scope instead of stashing straight away', async () => {
    const { props } = renderStash()
    await seeStashes()

    await userEvent.click(screen.getByTitle(/create a stash/i))

    expect(props.onCreateStash).not.toHaveBeenCalled()
    // exact strings: "Staged files only" is a substring of "Unstaged files only"
    expect(await screen.findByText('Staged files only')).toBeInTheDocument()
  })

  test.each([
    ['Everything (untracked included)', 'all'],
    ['Staged files only', 'staged'],
    ['Unstaged files only', 'unstaged'],
  ])('picking "%s" stashes with that scope', async (label, expected) => {
    const { props } = renderStash()
    await seeStashes()

    await userEvent.click(screen.getByTitle(/create a stash/i))
    await userEvent.click(await screen.findByText(label))

    expect(props.onCreateStash).toHaveBeenCalledWith(expected)
  })

  test('renaming a stash sends the new label for the right index', async () => {
    const showPrompt = jest.fn().mockResolvedValue('clearer name')
    const { props, api } = renderStash({ showPrompt })
    await seeStashes()

    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText(/older work/) })
    await userEvent.click(await screen.findByText(/rename/i))

    // index 1, and the prompt is seeded with the label minus the stash@{n} prefix
    await waitFor(() => expect(api.renameStash).toHaveBeenCalledWith(1, 'clearer name'))
    expect(showPrompt).toHaveBeenCalledWith(expect.any(String), 'On main: older work')
    expect(props.onRefreshStashes).toHaveBeenCalled()
  })

  test('cancelling the rename prompt changes nothing', async () => {
    const showPrompt = jest.fn().mockResolvedValue(null)
    const { props, api } = renderStash({ showPrompt })
    await seeStashes()

    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText(/wip auth/) })
    await userEvent.click(await screen.findByText(/rename/i))

    await waitFor(() => expect(showPrompt).toHaveBeenCalled())
    expect(api.renameStash).not.toHaveBeenCalled()
    expect(props.onRefreshStashes).not.toHaveBeenCalled()
  })
})
