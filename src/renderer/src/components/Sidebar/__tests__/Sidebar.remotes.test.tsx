// What a remote row offers, and what it opens onto (#289): the repository and
// its branches on the forge, the default taken back, and the remote's own
// branches listed under it with the rows Branches › REMOTE draws.
import { screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { emptyVisibility } from '../../../utils/graphVisibility'
import Sidebar from '../Sidebar'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

const REMOTES = [
  { name: 'origin', fetchUrl: 'git@github.com:me/app.git', pushUrl: 'git@github.com:me/app.git' },
  { name: 'upstream', fetchUrl: 'https://gitlab.com/team/sub/app.git', pushUrl: '' },
  { name: 'disk', fetchUrl: '/Users/me/mirror.git', pushUrl: '' },
]

const BRANCHES = [
  { name: 'main', current: true, remote: false, commit: 'aaa1', label: 'main' },
  { name: 'remotes/origin/main', current: false, remote: true, commit: 'aaa1', label: 'main' },
  { name: 'remotes/origin/feat/cards', current: false, remote: true, commit: 'bbb2', label: 'cards' },
  { name: 'remotes/upstream/release', current: false, remote: true, commit: 'ccc3', label: 'release' },
]

function draw(overrides: Record<string, any> = {}, api: Record<string, any> = {}) {
  const gitAPI = installMockGitAPI({
    getRemotes: jest.fn().mockResolvedValue({ remotes: REMOTES }),
    getDefaultRemote: jest.fn().mockResolvedValue({ remote: 'origin', explicit: false }),
    setDefaultRemote: jest.fn().mockResolvedValue({ success: true }),
    unsetDefaultRemote: jest.fn().mockResolvedValue({ success: true }),
    fetchRemote: jest.fn().mockResolvedValue({ success: true }),
    getReflog: jest.fn().mockResolvedValue({ entries: [] }),
    getSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
    listWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
    getWorkingChanges: jest.fn().mockResolvedValue({ staged: [], unstaged: [], untracked: [] }),
    ...api,
  })
  const props: Record<string, any> = {
    repoPath: '/repo', repoName: 'repo', currentBranch: 'main', view: 'remotes',
    branches: BRANCHES, recentRepos: [], stashes: [], tags: [],
    soloBranch: null, visibility: emptyVisibility(),
    showToast: jest.fn(), showPrompt: jest.fn().mockResolvedValue(null), showConfirm: jest.fn().mockResolvedValue(true),
  }
  for (const k of [
    'onOpenRepo', 'onClone', 'onSetRepo', 'onCheckout', 'onCreateBranch',
    'onDeleteBranch', 'onMergeBranch', 'onRenameBranch', 'onRebaseOnto', 'onPushBranch',
    'onDeleteRemoteBranch', 'onSetUpstream', 'onCreateStash', 'onApplyStash', 'onPopStash',
    'onDropStash', 'onRefreshStashes', 'onCreateTag', 'onDeleteTag', 'onCheckoutTag', 'onGoTo',
    'onPushTag', 'onDeleteRemoteTag', 'onSelectCommit', 'onCompareBranch',
    'onToggleSolo', 'onToggleHide', 'onReveal', 'onOpenCard', 'onOpenGithubItem',
    'onOpenBranchOnRemote',
  ]) props[k] = jest.fn()
  Object.assign(props, overrides)
  renderWithProviders(<Sidebar {...(props as any)} />)
  return { props, gitAPI }
}

const rowOf = async (name: string) =>
  (await screen.findByText(name, { selector: '.sb-remote-name' })).closest('.sb-remote-item')! as HTMLElement

const menuOn = async (el: Element) => {
  fireEvent.contextMenu(el)
  await waitFor(() => expect(document.querySelector('.context-menu, [role="menu"]')).toBeTruthy())
}
const menuLabels = () => [...document.querySelectorAll('.context-menu button, [role="menuitem"]')]
  .map(b => (b.textContent ?? '').replace(/^✓/, '').trim())

beforeEach(() => localStorage.clear())

describe('a remote row on the forge (#289)', () => {
  test('opens the repository and its branches page — its own, not the default remote’s', async () => {
    const { props } = draw()
    await menuOn(await rowOf('upstream'))
    expect(menuLabels()).toEqual(expect.arrayContaining([
      'Open Repository on Remote', 'Open Branches on Remote', 'Copy URL', 'Copy Branches URL',
    ]))
    await userEvent.click(screen.getByText('Open Branches on Remote'))
    expect(props.onOpenGithubItem).toHaveBeenCalledWith('https://gitlab.com/team/sub/app/-/branches')

    await menuOn(await rowOf('origin'))
    await userEvent.click(screen.getByText('Open Repository on Remote'))
    expect(props.onOpenGithubItem).toHaveBeenLastCalledWith('https://github.com/me/app')
  })

  test('copies the branches page’s address, and says so', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const { props } = draw()
    await menuOn(await rowOf('origin'))
    await userEvent.click(screen.getByText('Copy Branches URL'))
    expect(writeText).toHaveBeenCalledWith('https://github.com/me/app/branches')
    expect(props.showToast).toHaveBeenCalledWith('Link copied')
  })

  test('a remote with no page offers no page', async () => {
    draw()
    await menuOn(await rowOf('disk'))
    const labels = menuLabels()
    expect(labels).not.toContain('Open Repository on Remote')
    expect(labels).not.toContain('Open Branches on Remote')
    expect(labels).not.toContain('Copy Branches URL')
    // What does not depend on a page is still there.
    expect(labels).toContain('Copy URL')
  })
})

describe('the default remote, taken back (#289)', () => {
  test('a default nobody chose has nothing to unset', async () => {
    draw()
    await menuOn(await rowOf('origin'))
    expect(menuLabels()).not.toContain('Unset as Default Remote')
  })

  test('the chosen one does, on its own row only — and the badge follows the fallback', async () => {
    const getDefaultRemote = jest.fn()
      .mockResolvedValueOnce({ remote: 'upstream', explicit: true })
      .mockResolvedValue({ remote: 'origin', explicit: false })
    const { props, gitAPI } = draw({}, { getDefaultRemote })
    await waitFor(() => expect(within(screen.getByText('upstream', { selector: '.sb-remote-name' })).getByText('default')).toBeInTheDocument())

    await menuOn(await rowOf('origin'))
    expect(menuLabels()).not.toContain('Unset as Default Remote')
    fireEvent.keyDown(document, { key: 'Escape' })

    await menuOn(await rowOf('upstream'))
    await userEvent.click(screen.getByText('Unset as Default Remote'))
    await waitFor(() => expect(gitAPI.unsetDefaultRemote).toHaveBeenCalled())
    expect(props.showToast).toHaveBeenCalledWith('"upstream" is no longer the default remote')
    await waitFor(() => expect(within(screen.getByText('origin', { selector: '.sb-remote-name' })).getByText('default')).toBeInTheDocument())
  })

  test('setting one makes it unsettable without a reload', async () => {
    draw()
    await menuOn(await rowOf('upstream'))
    await userEvent.click(screen.getByText('Set as Default Remote'))
    await menuOn(await rowOf('upstream'))
    await waitFor(() => expect(menuLabels()).toContain('Unset as Default Remote'))
  })
})

describe('a remote opens onto its branches (#289)', () => {
  test('closed by default; opened, it lists its own branches and no one else’s', async () => {
    draw()
    const toggle = await screen.findByRole('button', { name: 'Show the branches of origin' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('group', { name: 'Branches of origin' })).not.toBeInTheDocument()

    await userEvent.click(toggle)
    const group = await screen.findByRole('group', { name: 'Branches of origin' })
    expect(within(group).getByText('main')).toBeInTheDocument()
    expect(within(group).getByText('cards')).toBeInTheDocument()
    expect(within(group).queryByText('release')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide the branches of origin' })).toHaveAttribute('aria-expanded', 'true')
  })

  test('a click on the row opens it too, and a second closes it', async () => {
    draw()
    await userEvent.click(await rowOf('upstream'))
    expect(await screen.findByRole('group', { name: 'Branches of upstream' })).toBeInTheDocument()
    await userEvent.click(await rowOf('upstream'))
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Branches of upstream' })).not.toBeInTheDocument())
  })

  test('the row acts are not a click on the row', async () => {
    const { gitAPI } = draw()
    const row = await rowOf('origin')
    await userEvent.click(within(row).getByRole('button', { name: 'Fetch: origin' }))
    expect(gitAPI.fetchRemote).toHaveBeenCalledWith('origin')
    expect(screen.queryByRole('group', { name: 'Branches of origin' })).not.toBeInTheDocument()
  })

  test('the branches listed are the Branches › REMOTE rows, with their acts and their menu', async () => {
    const { props, gitAPI } = draw()
    await userEvent.click(await screen.findByRole('button', { name: 'Show the branches of upstream' }))
    const group = await screen.findByRole('group', { name: 'Branches of upstream' })
    // The hover acts a remote-tracking row draws: card, switch, fetch.
    await userEvent.click(within(group).getByRole('button', { name: 'Show card: release' }))
    expect(props.onOpenCard).toHaveBeenCalledWith('upstream/release', 'remote')
    await userEvent.click(within(group).getByRole('button', { name: 'Switch: release' }))
    expect(props.onGoTo).toHaveBeenCalledWith('remotes/upstream/release')
    await userEvent.click(within(group).getByRole('button', { name: 'Fetch: release' }))
    expect(gitAPI.fetchRemote).toHaveBeenCalledWith('upstream')
    // And the same menu as the row in Branches › REMOTE.
    await menuOn(within(group).getByText('release'))
    await userEvent.click(screen.getByText('Open Branch on Remote'))
    expect(props.onOpenBranchOnRemote).toHaveBeenCalledWith('remotes/upstream/release')
  })

  test('a remote nothing was fetched from says so', async () => {
    draw()
    await userEvent.click(await screen.findByRole('button', { name: 'Show the branches of disk' }))
    const group = await screen.findByRole('group', { name: 'Branches of disk' })
    expect(within(group).getByText('No branch fetched from this remote')).toBeInTheDocument()
  })
})
