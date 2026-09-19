// One click reaches the graph (#275); the filter and the shape toggle (#276).
import { screen, waitFor, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { emptyVisibility } from '../../../utils/graphVisibility'
import Sidebar from '../Sidebar'
import { ROW_DOUBLE_MS } from '../rowClick'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

const BRANCHES = [
  { name: 'main', current: true, remote: false, ahead: 0, behind: 0 },
  { name: 'feat/ui-cards', current: false, remote: false, ahead: 0, behind: 2, upstream: 'origin/feat/ui-cards' },
  { name: 'feat/ui-rows', current: false, remote: false, ahead: 0, behind: 0 },
]
const TAGS = [{ name: 'v1.2.0', hash: 'aaa1111' }, { name: 'v1.3.0', hash: 'bbb2222' }]
const STASHES = [{ index: 0, message: 'stash@{0}: WIP on main: cache keys' }, { index: 1, message: 'stash@{1}: On main: typo' }]
const WORKTREES = [
  { path: '/repo', branch: 'main', head: 'head0000', isMain: true, locked: false },
  { path: '/wt/review', branch: 'feat/ui-cards', head: 'head1111', isMain: false, locked: false },
]

function draw(overrides: Record<string, any> = {}) {
  installMockGitAPI({
    getRemotes: jest.fn().mockResolvedValue({ remotes: [{ name: 'origin', fetchUrl: 'git@github.com:o/r.git', pushUrl: 'git@github.com:o/r.git' }] }),
    getReflog: jest.fn().mockResolvedValue({ entries: [] }),
    getSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
    listWorktrees: jest.fn().mockResolvedValue({ worktrees: WORKTREES }),
    getWorkingChanges: jest.fn().mockResolvedValue({ staged: [], unstaged: [], untracked: [] }),
  })
  const props: Record<string, any> = {
    repoPath: '/repo', repoName: 'repo', currentBranch: 'main',
    branches: BRANCHES, recentRepos: [], stashes: STASHES, tags: TAGS,
    soloBranch: null, visibility: emptyVisibility(),
    showToast: jest.fn(), showPrompt: jest.fn(), showConfirm: jest.fn(),
  }
  for (const k of [
    'onOpenRepo', 'onClone', 'onSetRepo', 'onCheckout', 'onCreateBranch',
    'onDeleteBranch', 'onMergeBranch', 'onRenameBranch', 'onRebaseOnto', 'onPushBranch',
    'onDeleteRemoteBranch', 'onSetUpstream', 'onCreateStash', 'onApplyStash', 'onPopStash',
    'onDropStash', 'onRefreshStashes', 'onCreateTag', 'onDeleteTag', 'onCheckoutTag', 'onGoTo',
    'onPushTag', 'onDeleteRemoteTag', 'onSelectCommit', 'onCompareBranch',
    'onToggleSolo', 'onToggleHide', 'onReveal',
  ]) props[k] = jest.fn()
  Object.assign(props, overrides)
  renderWithProviders(<Sidebar {...(props as any)} />)
  return props
}

/** The press the rows read: the single act is armed, and fires on the timer. */
async function clickRow(el: Element) {
  fireEvent.mouseDown(el)
  await act(async () => { await new Promise(r => setTimeout(r, ROW_DOUBLE_MS + 20)) })
}

beforeEach(() => localStorage.clear())

describe('one click reaches the graph (#275)', () => {
  test('a branch row reveals its tip, and the double-click still switches', async () => {
    const p = draw({ view: 'branches' })
    const row = await screen.findByText('ui-cards')
    await clickRow(row)
    expect(p.onReveal).toHaveBeenCalledWith('feat/ui-cards')
    expect(p.onGoTo).not.toHaveBeenCalled()
    // Two presses inside the window: the switch, and the reveal taken back.
    p.onReveal.mockClear()
    fireEvent.mouseDown(row); fireEvent.mouseDown(row)
    await act(async () => { await new Promise(r => setTimeout(r, ROW_DOUBLE_MS + 20)) })
    expect(p.onGoTo).toHaveBeenCalledWith('feat/ui-cards')
    expect(p.onReveal).not.toHaveBeenCalled()
  })

  test('a tag row reveals the commit it points at', async () => {
    const p = draw({ view: 'tags' })
    await clickRow(await screen.findByText('v1.3.0'))
    expect(p.onReveal).toHaveBeenCalledWith('v1.3.0')
  })

  test('a stash row reveals its own commit, whichever one it is', async () => {
    const p = draw({ view: 'stash' })
    await clickRow(await screen.findByText('On main: typo'))
    expect(p.onReveal).toHaveBeenCalledWith('stash@{1}')
  })

  test("a worktree elsewhere reveals its HEAD; the one on screen goes to the working changes", async () => {
    const onViewWip = jest.fn()
    const p = draw({ view: 'worktrees', onViewWip })
    await clickRow(await screen.findByText('/wt/review'))
    expect(p.onReveal).toHaveBeenCalledWith('head1111')
    p.onReveal.mockClear()
    await clickRow(screen.getByText('/repo'))
    expect(onViewWip).toHaveBeenCalled()
    expect(p.onReveal).not.toHaveBeenCalled()
  })
})

describe('the filter, on every list view (#276)', () => {
  const filterInto = async (text: string) => {
    const field = screen.getByPlaceholderText(/filter/i)
    await userEvent.type(field, text)
  }

  test('narrows the tags', async () => {
    draw({ view: 'tags' })
    await screen.findByText('v1.2.0')
    await filterInto('1.3')
    await waitFor(() => expect(screen.queryByText('v1.2.0')).not.toBeInTheDocument())
    expect(screen.getByText('v1.3.0')).toBeInTheDocument()
  })

  test('narrows the stashes, by what they say', async () => {
    draw({ view: 'stash' })
    await screen.findByText('WIP on main: cache keys')
    await filterInto('typo')
    await waitFor(() => expect(screen.queryByText('WIP on main: cache keys')).not.toBeInTheDocument())
    expect(screen.getByText('On main: typo')).toBeInTheDocument()
  })

  test('narrows the worktrees, by folder or by branch', async () => {
    draw({ view: 'worktrees' })
    await screen.findByText('/repo')
    await filterInto('review')
    await waitFor(() => expect(screen.queryByText('/repo')).not.toBeInTheDocument())
    expect(screen.getByText('/wt/review')).toBeInTheDocument()
  })

  test('narrows the remotes', async () => {
    draw({ view: 'remotes' })
    await screen.findByText('origin')
    await filterInto('nothing-like-this')
    await waitFor(() => expect(screen.queryByText('origin')).not.toBeInTheDocument())
  })

  test('says which list it is filtering', async () => {
    draw({ view: 'tags' })
    expect(await screen.findByPlaceholderText('Filter tags…')).toBeInTheDocument()
  })
})

describe('list or tree (#276)', () => {
  test('the branches are a tree, and the toggle flattens them — and is remembered', async () => {
    draw({ view: 'branches' })
    // A tree: the folder is a row, the leaves read as their last segment.
    expect(await screen.findByText('feat')).toBeInTheDocument()
    expect(screen.getByText('ui-cards')).toBeInTheDocument()
    await userEvent.click(screen.getByTitle('Show as list'))
    await waitFor(() => expect(screen.queryByText('feat')).not.toBeInTheDocument())
    expect(screen.getByText('feat/ui-cards')).toBeInTheDocument()
    expect(localStorage.getItem('gv:sb-layout:local')).toBe('list')
  })

  test('a filter flattens whatever the choice was', async () => {
    draw({ view: 'branches' })
    await screen.findByText('feat')
    await userEvent.type(screen.getByPlaceholderText(/filter/i), 'ui')
    await waitFor(() => expect(screen.queryByText('feat')).not.toBeInTheDocument())
    expect(screen.getByText('feat/ui-cards')).toBeInTheDocument()
  })

  test('a list with no slash in it is not offered a tree', async () => {
    draw({ view: 'tags' })
    await screen.findByText('v1.2.0')
    expect(screen.queryByTitle(/Show as (list|tree)/)).toBeNull()
  })
})
