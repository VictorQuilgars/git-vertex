// What a worktree row says and offers (#285), and what a stash row can reach (#287).
import { act, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { emptyVisibility } from '../../../utils/graphVisibility'
import Sidebar from '../Sidebar'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

const WORKTREES = [
  { path: '/repo', branch: 'main', head: 'head0000', isMain: true, locked: false, dirty: true },
  { path: '/wt/review', branch: 'feat/cards', head: 'head1111', isMain: false, locked: true, lockReason: 'external drive', ahead: 2, behind: 1 },
  { path: '/wt/gone', branch: 'old', head: 'head2222', isMain: false, locked: false, prunable: true },
]
const STASHES = [
  { index: 0, message: 'stash@{0}: WIP on main: cache keys' },
  { index: 2, message: 'stash@{2}: On main: an older one' },
]

function draw(overrides: Record<string, any> = {}, api: Record<string, any> = {}) {
  installMockGitAPI({
    getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
    getReflog: jest.fn().mockResolvedValue({ entries: [] }),
    getSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
    listWorktrees: jest.fn().mockResolvedValue({ worktrees: WORKTREES }),
    getWorkingChanges: jest.fn().mockResolvedValue({ staged: [], unstaged: [], untracked: [] }),
    ...api,
  })
  const props: Record<string, any> = {
    repoPath: '/repo', repoName: 'repo', currentBranch: 'main',
    branches: [{ name: 'main', current: true, remote: false }, { name: 'feat/cards', current: false, remote: false }],
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
    'onCompareStash', 'onSelectStashForCompare',
  ]) props[k] = jest.fn()
  Object.assign(props, overrides)
  renderWithProviders(<Sidebar {...(props as any)} />)
  return props
}

const menuOn = async (el: Element) => {
  fireEvent.contextMenu(el)
  await waitFor(() => expect(document.querySelector('.context-menu, [role="menu"]')).toBeTruthy())
}
// A checked row renders its tick inside the label, so the text is compared
// on what the row SAYS rather than on what it draws.
const menuLabels = () => [...document.querySelectorAll('.context-menu button, [role="menuitem"]')]
  .map(b => (b.textContent ?? '').replace(/^✓/, '').trim())
/** Open a submenu the way the pointer does: hover, and wait out the dwell. */
const openSub = async (label: string) => {
  await userEvent.hover(screen.getByText(label))
  await act(async () => { await new Promise(r => setTimeout(r, 260)) })
}

describe('a worktree row (#285)', () => {
  test('says where it stands: which is active, the lock and why, dirt, tracking, and a folder that is gone', async () => {
    draw({ view: 'worktrees' })
    await screen.findByText('/wt/review')
    expect(screen.getByTitle('The worktree this window is showing')).toBeInTheDocument()
    expect(screen.getByTitle('Locked: external drive')).toBeInTheDocument()
    expect(screen.getByTitle('Has uncommitted changes')).toBeInTheDocument()
    expect(screen.getByTitle(/prune/)).toBeInTheDocument()
    expect(screen.getByText('↑2')).toBeInTheDocument()
    expect(screen.getByText('↓1')).toBeInTheDocument()
  })

  test('offers the terminal, the file manager, the lock — and Open only where there is something to open', async () => {
    draw({ view: 'worktrees' })
    await menuOn(await screen.findByText('/wt/review'))
    const labels = menuLabels()
    expect(labels).toContain('Open Terminal Here')
    expect(labels).toContain('Reveal in File Manager')
    // Locked already: the row offers the way back.
    expect(labels).toContain('Unlock')
    expect(labels).toContain('Open')
  })

  test('the worktree on screen is not offered a way to open itself, and carries its changes out', async () => {
    draw({ view: 'worktrees' })
    await menuOn(await screen.findByText('/repo'))
    const labels = menuLabels()
    expect(labels).not.toContain('Open')
    expect(labels).toContain('Lock')
    // It is the dirty one, so it has something to copy.
    expect(labels).toContain('Copy Working Changes to…')
  })

  test('a clean worktree has no changes to carry', async () => {
    draw({ view: 'worktrees' })
    await menuOn(await screen.findByText('/wt/review'))
    expect(menuLabels()).not.toContain('Copy Working Changes to…')
  })

  test('locking asks for a reason and sends it', async () => {
    const lockWorktree = jest.fn().mockResolvedValue({ success: true })
    const showPrompt = jest.fn().mockResolvedValue('external drive')
    draw({ view: 'worktrees', showPrompt }, { lockWorktree })
    await menuOn(await screen.findByText('/repo'))
    await userEvent.click(screen.getByText('Lock'))
    await waitFor(() => expect(lockWorktree).toHaveBeenCalledWith('/repo', 'external drive'))
  })
})

describe('a branch checked out in another worktree (#285)', () => {
  test('opens that worktree rather than offering a switch git would refuse', async () => {
    const onSetRepo = jest.fn()
    const p = draw({ view: 'branches', onSetRepo })
    const row = await screen.findByText('cards')
    await menuOn(row)
    const labels = menuLabels()
    expect(labels).toContain('Open its worktree "review"')
    expect(labels).not.toContain('Switch to Branch')
    await userEvent.click(screen.getByText('Open its worktree "review"'))
    expect(onSetRepo).toHaveBeenCalledWith('/wt/review')
    expect(p.onGoTo).not.toHaveBeenCalled()
  })

  test('and a worktree can be made for a branch without typing its name', async () => {
    draw({ view: 'branches' })
    await menuOn(await screen.findByText('main'))
    expect(menuLabels()).toContain('Create a Worktree for "main"…')
  })
})

describe('a stash row (#287)', () => {
  test('compares with HEAD and with the working tree, by its own ref — older stashes included', async () => {
    const p = draw({ view: 'stash' })
    await menuOn(await screen.findByText('On main: an older one'))
    await openSub('Compare')
    await userEvent.click(screen.getByText('Compare with HEAD'))
    expect(p.onCompareStash).toHaveBeenCalledWith('stash@{2}', 'HEAD')

    await menuOn(screen.getByText('On main: an older one'))
    await openSub('Compare')
    await userEvent.click(screen.getByText('Compare with Working Tree'))
    expect(p.onCompareStash).toHaveBeenCalledWith('stash@{2}', 'working')
  })

  test('is held as one end of a comparison', async () => {
    const p = draw({ view: 'stash' })
    await menuOn(await screen.findByText('WIP on main: cache keys'))
    await openSub('Compare')
    await userEvent.click(screen.getByText('Select for Compare'))
    expect(p.onSelectStashForCompare).toHaveBeenCalledWith('stash@{0}')
  })

  test('copies the sha of the stash it is on, not of the newest one', async () => {
    const resolveCommit = jest.fn().mockResolvedValue({ hash: 'f'.repeat(40) })
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    draw({ view: 'stash' }, { resolveCommit })
    await menuOn(await screen.findByText('On main: an older one'))
    await openSub('Copy')
    await userEvent.click(screen.getByText('Copy Full Hash'))
    await waitFor(() => expect(resolveCommit).toHaveBeenCalledWith('stash@{2}'))
    expect(writeText).toHaveBeenCalledWith('f'.repeat(40))
  })

  test('copies its patch, from its own diff', async () => {
    const stashDiff = jest.fn().mockResolvedValue({ diff: 'diff --git a/x b/x\n' })
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    draw({ view: 'stash' }, { stashDiff })
    await menuOn(await screen.findByText('On main: an older one'))
    await openSub('Copy')
    await userEvent.click(screen.getByText('Copy Changes (Patch)'))
    await waitFor(() => expect(stashDiff).toHaveBeenCalledWith(2))
    expect(writeText).toHaveBeenCalledWith('diff --git a/x b/x\n')
  })

  test('and still shows its changes, which is what the row led with', async () => {
    const p = draw({ view: 'stash' })
    await menuOn(await screen.findByText('WIP on main: cache keys'))
    await userEvent.click(screen.getByText('Show Changes'))
    expect(p.onPreviewStash).toHaveBeenCalledWith(0, 'stash@{0}: WIP on main: cache keys')
  })
})
