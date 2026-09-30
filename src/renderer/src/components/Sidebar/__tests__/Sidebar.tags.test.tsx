import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { emptyVisibility } from '../../../utils/graphVisibility'
import Sidebar from '../Sidebar'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// Double-clicking a tag used to do nothing at all, unlike a branch or a commit
// row — and no context-menu entry offered checkout either, so the action was
// simply unreachable from the UI (v1.23.0).

const TAGS = [
  { name: 'v1.22.0', hash: 'b4e1f37' },
  { name: 'v1.21.1', hash: 'a77e361' },
]

function renderTags(overrides: Record<string, any> = {}, api: Record<string, any> = {}) {
  installMockGitAPI({
    getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
    getReflog: jest.fn().mockResolvedValue({ entries: [] }),
    getSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
    listWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
    getWorkingChanges: jest.fn().mockResolvedValue({ staged: [], unstaged: [], untracked: [] }),
    ...api,
  })
  const props: Record<string, any> = {
    repoPath: '/repo', repoName: 'repo', currentBranch: 'main',
    branches: [], recentRepos: [], stashes: [], tags: TAGS,
    soloBranch: null, visibility: emptyVisibility(),
    view: 'tags',
    showToast: jest.fn(), showPrompt: jest.fn(), showConfirm: jest.fn(),
  }
  // Every remaining handler is a no-op unless a test overrides it.
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

async function openTagsSection() {
  // The section renders collapsed in stacked mode; click the header if the
  // rows aren't visible yet.
  if (!screen.queryByText('v1.22.0')) {
    await userEvent.click(screen.getByText('TAGS'))
  }
  await waitFor(() => expect(screen.getByText('v1.22.0')).toBeInTheDocument())
}

describe('Sidebar — tags', () => {
  // A tag is not a branch and can no longer be checked out as one. Double-click
  // means the same thing on a tag as on any other row — take me there, landing
  // on a branch — so it goes through the host's plan, which will offer to
  // create one at the tagged commit. v1.23.0 detached HEAD here instead.
  test('double-clicking a tag asks to go there, and never detaches HEAD', async () => {
    const props = renderTags()
    await openTagsSection()

    await userEvent.dblClick(screen.getByText('v1.22.0'))

    expect(props.onGoTo).toHaveBeenCalledWith('v1.22.0')
    expect(props.onCheckoutTag).not.toHaveBeenCalled()
  })

  test('a single click does nothing', async () => {
    const props = renderTags()
    await openTagsSection()

    await userEvent.click(screen.getByText('v1.22.0'))

    expect(props.onGoTo).not.toHaveBeenCalled()
    expect(props.onCheckoutTag).not.toHaveBeenCalled()
  })

  // The one remaining way to detach HEAD from the sidebar, and it is explicit:
  // it says commit, because that is what it checks out.
  test('the context menu checks out the commit, and targets the right tag', async () => {
    const props = renderTags()
    await openTagsSection()

    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('v1.21.1') })

    const entry = await screen.findByText(/check out the commit/i)
    await userEvent.click(entry)

    expect(props.onCheckoutTag).toHaveBeenCalledWith('v1.21.1')
    expect(props.onCheckoutTag).toHaveBeenCalledTimes(1)
    expect(props.onGoTo).not.toHaveBeenCalled()
  })
})

// A tag as the commit it stands for (#288). The row's list carries what
// `git tag` lists — an annotated tag's OWN object — so the menu asks for the
// commit when it opens, and every entry acts on that.
describe('Sidebar — a tag row reaches its commit (#288)', () => {
  const COMMIT = 'c'.repeat(40)
  const openSub = async (label: string) => {
    await userEvent.hover(screen.getByText(label))
    await act(async () => { await new Promise(r => setTimeout(r, 260)) })
  }
  const drawResolving = (overrides: Record<string, any> = {}) => {
    const resolveCommit = jest.fn().mockResolvedValue({ hash: COMMIT })
    const getLastCommitMessage = jest.fn().mockResolvedValue({ message: 'release: 1.21.1\n\nNotes.', hash: COMMIT })
    const props = renderTags({ onCompareRef: jest.fn(), tipActions: { onReset: jest.fn(), onSelectForCompare: jest.fn() }, ...overrides }, { resolveCommit, getLastCommitMessage })
    return { props, resolveCommit, getLastCommitMessage }
  }

  test('the menu resolves the tag by its refname, and compares the commit with HEAD', async () => {
    const { props, resolveCommit, getLastCommitMessage } = drawResolving()
    await openTagsSection()
    fireEvent.contextMenu(screen.getByText('v1.21.1'))
    await screen.findByText('Compare')
    expect(resolveCommit).toHaveBeenCalledWith('refs/tags/v1.21.1')
    expect(getLastCommitMessage).toHaveBeenCalledWith(COMMIT)
    await openSub('Compare')
    await userEvent.click(screen.getByText('Compare with HEAD'))
    expect(props.onCompareRef).toHaveBeenCalledWith(COMMIT, 'HEAD')
  })

  test('resets the current branch to the commit, with the mode picked', async () => {
    const { props } = drawResolving()
    await openTagsSection()
    fireEvent.contextMenu(screen.getByText('v1.22.0'))
    await screen.findByText('Reset Current Branch to This Tag')
    await openSub('Reset Current Branch to This Tag')
    await userEvent.click(screen.getByText(/^Mixed/))
    expect(props.tipActions.onReset).toHaveBeenCalledWith(COMMIT, 'mixed')
  })

  test("solo shows only the tag's history, by its full refname, and the row says so", async () => {
    const { props } = drawResolving()
    await openTagsSection()
    fireEvent.contextMenu(screen.getByText('v1.21.1'))
    await userEvent.click(await screen.findByText("Solo — Show Only This Tag's History"))
    expect(props.onToggleSolo).toHaveBeenCalledWith('refs/tags/v1.21.1')
  })

  test('a soloed tag reads as soloed — and a branch named like it does not', async () => {
    renderTags({ soloBranch: 'refs/tags/v1.22.0' })
    await openTagsSection()
    expect(screen.getByText('v1.22.0').closest('.sb-tag-item')).toHaveClass('soloed')
    expect(screen.getByText('v1.21.1').closest('.sb-tag-item')).not.toHaveClass('soloed')
  })

  test('a tag that no longer resolves still opens its menu, without the commit entries', async () => {
    const resolveCommit = jest.fn().mockResolvedValue({ hash: null })
    renderTags({ onCompareRef: jest.fn(), tipActions: { onReset: jest.fn() } }, { resolveCommit })
    await openTagsSection()
    fireEvent.contextMenu(screen.getByText('v1.21.1'))
    await screen.findByText('Push tag')
    expect(screen.queryByText('Compare')).toBeNull()
    expect(screen.queryByText('Reset Current Branch to This Tag')).toBeNull()
  })
})
