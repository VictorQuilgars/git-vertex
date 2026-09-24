import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import Sidebar from '../Sidebar'
import { sidebarCounts, shortCount } from '../sidebarCounts'
import { viewForKey, keyForView, SIDEBAR_VIEWS, STACKED_SECTION } from '../viewKeys'
import { forgeGap, NO_FORGE_REMOTE, NOT_AUTHENTICATED } from '../forgeGap'
import { emptyVisibility } from '../../../utils/graphVisibility'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The side bar's chrome (#277) and its empty GitHub views (#292):
//
//   - a list the side bar reads for itself and could not read says so, with
//     Try again, instead of showing an empty list — which says "there are none";
//   - the counts come from one rule, which the panel's rail counts with too;
//   - a key per view;
//   - an empty pull request or issue view says which of its reasons it is.

const base: Record<string, any> = {
  repoPath: '/r', repoName: 'r', currentBranch: 'main', recentRepos: [],
  branches: [
    { name: 'main', current: true, commit: 'a' },
    { name: 'feat/x', current: false, commit: 'b' },
    { name: 'remotes/origin/main', current: false, commit: 'a', remote: true },
  ],
  stashes: [{ index: 0, message: 'WIP on main' }],
  tags: [{ name: 'v1', hash: 'a' }, { name: 'v2', hash: 'b' }, { name: 'v3', hash: 'c' }],
  soloBranch: null, visibility: emptyVisibility(),
  showToast: jest.fn(), showPrompt: jest.fn().mockResolvedValue(null), showConfirm: jest.fn().mockResolvedValue(false),
}
for (const k of [
  'onOpenRepo', 'onClone', 'onSetRepo', 'onCheckout', 'onCreateBranch',
  'onDeleteBranch', 'onMergeBranch', 'onRenameBranch', 'onRebaseOnto', 'onPushBranch',
  'onDeleteRemoteBranch', 'onSetUpstream', 'onCreateStash', 'onApplyStash', 'onPopStash',
  'onDropStash', 'onRefreshStashes', 'onCreateTag', 'onDeleteTag', 'onCheckoutTag', 'onGoTo',
  'onPushTag', 'onDeleteRemoteTag', 'onSelectCommit', 'onCompareBranch', 'onToggleSolo', 'onToggleHide',
]) base[k] = jest.fn()

function api(over: Record<string, any> = {}) {
  return installMockGitAPI({
    getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
    getReflog: jest.fn().mockResolvedValue({ entries: [] }),
    getSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
    listWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
    getWorkingChanges: jest.fn().mockResolvedValue({ staged: [], unstaged: [], untracked: [] }),
    ...over,
  })
}
const draw = (props: Record<string, any> = {}) => renderWithProviders(<Sidebar {...(base as any)} {...props} />)
const header = (title: string) => screen.getByText(title).closest('.sb-section-header') as HTMLElement
const countOf = (title: string) => header(title).querySelector('.sb-section-count')?.textContent

beforeEach(() => localStorage.clear())

describe('a list that could not be loaded says so (#277)', () => {
  test('in place of the list: the error as it came, and Try again that reloads it', async () => {
    const listWorktrees = jest.fn()
      .mockRejectedValueOnce(new Error('fatal: not a git repository'))
      .mockResolvedValue({ worktrees: [{ path: '/r', head: 'a', branch: 'main' }, { path: '/r-wt', head: 'b', branch: 'feat/x' }] })
    api({ listWorktrees })
    draw({ view: 'worktrees' })
    expect(await screen.findByText('fatal: not a git repository')).toBeInTheDocument()
    expect(screen.getByText('This list could not be loaded.')).toBeInTheDocument()
    // Not "No worktree", which is what it used to say — and no count, which
    // would have been a zero.
    expect(screen.queryByText('No worktree')).not.toBeInTheDocument()
    expect(countOf('WORKTREES')).toBeUndefined()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByText('fatal: not a git repository')).not.toBeInTheDocument())
    expect(listWorktrees).toHaveBeenCalledTimes(2)
    expect(countOf('WORKTREES')).toBe('2')
  })

  test('an answer that carries an error is a refusal too — the host’s not-implemented', async () => {
    api({ getRemotes: jest.fn().mockResolvedValue({ success: false, error: 'not-implemented: getRemotes' }) })
    draw({ view: 'remotes' })
    expect(await screen.findByText('not-implemented: getRemotes')).toBeInTheDocument()
    expect(screen.queryByText('No remote')).not.toBeInTheDocument()
  })

  test('a list that loads shows no notice at all', async () => {
    api()
    draw({ view: 'worktrees' })
    expect(await screen.findByText('No worktree')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  test('submodules, hidden while there are none, show up to say they failed', async () => {
    api({ getSubmodules: jest.fn().mockRejectedValue(new Error('bad .gitmodules')) })
    draw({ view: 'overview' })
    expect(await screen.findByText('SUBMODULES')).toBeInTheDocument()
  })
})

describe('the counts have one source (#277)', () => {
  test('sidebarCounts: local branches only, and no count for a list never asked', () => {
    expect(sidebarCounts({
      branches: base.branches, stashes: base.stashes, tags: base.tags,
      remotes: ['origin'], worktrees: [{}, {}], prs: [], issues: undefined,
    })).toEqual({ branches: 2, stash: 1, tags: 3, remotes: 1, worktrees: 2, prs: 0 })
  })

  test('the headers count with it — the same numbers the rail is given', async () => {
    api()
    draw({ githubPRs: [{ number: 1, title: 'A', url: 'u' }], githubIssues: [] })
    const counts = sidebarCounts({ branches: base.branches, stashes: base.stashes, tags: base.tags, prs: [{}], issues: [] })
    await waitFor(() => expect(countOf('LOCAL')).toBe(String(counts.branches)))
    expect(countOf('TAGS')).toBe(String(counts.tags))
    expect(countOf('STASH')).toBe(String(counts.stash))
    expect(countOf('PULL REQUESTS')).toBe(String(counts.prs))
    expect(countOf('GITHUB ISSUES')).toBe(String(counts.issues))
  })

  test('a count past two digits is shortened, not clipped', () => {
    expect(shortCount(7)).toBe('7')
    expect(shortCount(99)).toBe('99')
    expect(shortCount(1234)).toBe('99+')
  })
})

describe('a key per view (#277)', () => {
  const key = (k: string, init: KeyboardEventInit = {}) => new KeyboardEvent('keydown', { key: k, ...init })
  afterEach(() => { document.body.innerHTML = '' })

  test('1 to 9, in the rail’s order', () => {
    expect(SIDEBAR_VIEWS).toHaveLength(9)
    SIDEBAR_VIEWS.forEach((v, i) => {
      expect(viewForKey(key(String(i + 1)))).toBe(v)
      expect(keyForView(v)).toBe(String(i + 1))
    })
    expect(viewForKey(key('0'))).toBeNull()
  })

  test('never a chord: those are the workbench’s in VS Code', () => {
    for (const mod of ['ctrlKey', 'metaKey', 'altKey'] as const) expect(viewForKey(key('4', { [mod]: true }))).toBeNull()
  })

  test('never while typing, nor under a dialog or a menu', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    expect(viewForKey(key('4'))).toBeNull()
    input.blur()
    expect(viewForKey(key('4'))).toBe('branches')
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)
    expect(viewForKey(key('4'))).toBeNull()
  })

  test('on the desktop every view is a section of the stacked column, or a tab of it', () => {
    expect(STACKED_SECTION.branches).toBe('local')
    expect(STACKED_SECTION.ai).toBeNull()
    for (const v of SIDEBAR_VIEWS) expect(v in STACKED_SECTION).toBe(true)
  })
})

describe('an empty GitHub view says why (#292)', () => {
  test('forgeGap reads the three causes, and nothing while there is a list or no answer', () => {
    expect(forgeGap(undefined, NO_FORGE_REMOTE)).toEqual({ kind: 'no-remote' })
    expect(forgeGap(undefined, NOT_AUTHENTICATED)).toEqual({ kind: 'no-token' })
    expect(forgeGap(undefined, 'HTTP 502')).toEqual({ kind: 'error', message: 'HTTP 502' })
    expect(forgeGap([], NOT_AUTHENTICATED)).toBeNull()
    expect(forgeGap(undefined, undefined)).toBeNull()
  })

  test('no token: it says so, and opens the GitHub settings', async () => {
    api()
    const onOpenSettings = jest.fn()
    draw({ view: 'prs', githubRepo: { owner: 'o', repo: 'r' }, githubErrors: { prs: NOT_AUTHENTICATED }, onOpenSettings })
    expect(await screen.findByText(/No GitHub account is connected, so the pull requests cannot be listed/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open GitHub Settings' }))
    expect(onOpenSettings).toHaveBeenCalledWith('github')
  })

  test('no remote at all: it says so, and adds one', async () => {
    const mock = api()
    const showPrompt = jest.fn().mockResolvedValueOnce('origin').mockResolvedValueOnce('git@github.com:o/r.git')
    mock.addRemote = jest.fn().mockResolvedValue({ success: true })
    const onRefresh = jest.fn()
    draw({ view: 'issues', githubErrors: { issues: NO_FORGE_REMOTE }, onOpenSettings: jest.fn(), showPrompt, onRefresh })
    expect(await screen.findByText(/This repository has no remote, so it has no issues to list/)).toBeInTheDocument()
    // Settings cannot fix a repository with no remote: the one door is adding it.
    expect(screen.queryByRole('button', { name: 'Open GitHub Settings' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add a remote' }))
    await waitFor(() => expect(mock.addRemote).toHaveBeenCalledWith('origin', 'git@github.com:o/r.git'))
    // The host re-reads the remotes, which is what finds the GitHub one.
    await waitFor(() => expect(onRefresh).toHaveBeenCalled())
  })

  test('remotes, none on GitHub: both doors — an Enterprise host is named in Settings', async () => {
    api({ getRemotes: jest.fn().mockResolvedValue({ remotes: [{ name: 'origin', fetchUrl: 'https://git.corp/o/r.git', pushUrl: '' }] }) })
    draw({ view: 'prs', githubErrors: { prs: NO_FORGE_REMOTE }, onOpenSettings: jest.fn() })
    expect(await screen.findByText(/None of this repository’s remotes is on GitHub/)).toBeInTheDocument()
    const notice = screen.getByRole('status')
    expect(within(notice).getAllByRole('button').map(b => b.textContent)).toEqual(['Open GitHub Settings', 'Add a remote'])
  })

  test('any other refusal is quoted, with Try again', async () => {
    api()
    const onRefreshGithub = jest.fn()
    draw({ view: 'prs', githubRepo: { owner: 'o', repo: 'r' }, githubErrors: { prs: 'HTTP 502' }, onRefreshGithub })
    expect(await screen.findByText('The pull requests could not be loaded.')).toBeInTheDocument()
    expect(screen.getByText('HTTP 502')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRefreshGithub).toHaveBeenCalledWith('prs')
  })

  test('on the desktop, a repository not on GitHub still has no sections', async () => {
    api()
    draw({ githubErrors: { prs: NO_FORGE_REMOTE, issues: NO_FORGE_REMOTE } })
    await waitFor(() => expect(screen.getByText('LOCAL')).toBeInTheDocument())
    expect(screen.queryByText('PULL REQUESTS')).not.toBeInTheDocument()
    expect(screen.queryByText('GITHUB ISSUES')).not.toBeInTheDocument()
  })

  test('on the desktop, a GitHub repository with no account says so in both sections', async () => {
    api()
    draw({ githubRepo: { owner: 'o', repo: 'r' }, githubErrors: { prs: NOT_AUTHENTICATED, issues: NOT_AUTHENTICATED }, onOpenSettings: jest.fn() })
    expect(await screen.findByText(/so the pull requests cannot be listed/)).toBeInTheDocument()
    expect(screen.getByText(/so the issues cannot be listed/)).toBeInTheDocument()
  })
})
