import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { emptyVisibility } from '../../../utils/graphVisibility'
import Sidebar from '../Sidebar'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The AI stack (#70). A generated changelog was reachable only from the menu
// of the branch it belonged to — which meant remembering it existed — and the
// explanations the commit panel has been storing since v1.10 were listed
// nowhere at all. What is checked here is that the list tells the truth: what
// it covers, when it was written, and how far the branch has moved since.

const ENTRIES = [
  { branch: 'feat/cache', text: '### Added\n- A cache.', base: 'origin/main', commits: 3, at: Date.now() - 3600_000, newCommits: 0 },
  { branch: 'feat/logging', text: '### Added\n- A logger.', base: 'origin/main', commits: 5, at: Date.now() - 86400_000, newCommits: 2 },
]

function renderAI(overrides: Record<string, any> = {}, api: Record<string, any> = {}) {
  const mock = installMockGitAPI({
    getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
    getReflog: jest.fn().mockResolvedValue({ entries: [] }),
    getSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
    listWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
    getWorkingChanges: jest.fn().mockResolvedValue({ staged: [], unstaged: [], untracked: [] }),
    aiChangelogList: jest.fn().mockResolvedValue({ entries: ENTRIES }),
    aiGetExplanations: jest.fn().mockResolvedValue({ explanations: { ['a'.repeat(40)]: 'It renames the thing.' } }),
    aiForgetChangelog: jest.fn().mockResolvedValue({ success: true }),
    ...api,
  })
  const props: Record<string, any> = {
    repoPath: '/repo', repoName: 'repo', currentBranch: 'main',
    branches: [], recentRepos: [], stashes: [], tags: [],
    soloBranch: null, visibility: emptyVisibility(),
    showToast: jest.fn(),
    showPrompt: jest.fn().mockResolvedValue(null),
    showConfirm: jest.fn().mockResolvedValue(false),
    onOpenChangelog: jest.fn(),
    onOpenExplanation: jest.fn(),
    subjectFor: (h: string) => h.startsWith('a') ? 'refactor: rename the thing' : undefined,
  }
  for (const k of [
    'onOpenRepo', 'onClone', 'onSetRepo', 'onRemoveRecent', 'onCheckout', 'onCreateBranch',
    'onDeleteBranch', 'onMergeBranch', 'onRenameBranch', 'onRebaseOnto', 'onPushBranch',
    'onDeleteRemoteBranch', 'onSetUpstream', 'onCreateStash', 'onApplyStash', 'onPopStash',
    'onDropStash', 'onRefreshStashes', 'onCreateTag', 'onDeleteTag', 'onCheckoutTag',
    'onPushTag', 'onDeleteRemoteTag', 'onSelectCommit', 'onCompareBranch',
    'onToggleSolo', 'onToggleHide', 'onRefresh', 'onGoTo',
  ]) props[k] = props[k] ?? jest.fn()

  Object.assign(props, overrides)
  renderWithProviders(<Sidebar {...(props as any)} />)
  return { props, mock }
}

const openAI = async () => userEvent.click(screen.getByRole('tab', { name: /AI/ }))

beforeEach(() => localStorage.clear())

describe('the sidebar AI stack', () => {
  test('the desktop panel offers the two stacks, and starts on the list', async () => {
    renderAI()
    await waitFor(() => expect(screen.getByRole('tab', { name: /List/ })).toBeInTheDocument())
    expect(screen.getByRole('tab', { name: /List/ })).toHaveAttribute('aria-selected', 'true')
    // the list is what it has always been
    expect(screen.getByText('LOCAL')).toBeInTheDocument()
    expect(screen.queryByText('CHANGELOGS')).not.toBeInTheDocument()
  })

  test('the AI stack lists what was written, newest first, with what it covers', async () => {
    renderAI()
    await openAI()
    await screen.findByText('CHANGELOGS')
    expect(screen.getByText('feat/cache')).toBeInTheDocument()
    expect(screen.getByText(/3 commits over origin\/main/)).toBeInTheDocument()
    // The list replaces the branch stack rather than sitting under it.
    expect(screen.queryByText('LOCAL')).not.toBeInTheDocument()
  })

  test('a changelog its branch has outrun says by how much', async () => {
    renderAI()
    await openAI()
    await screen.findByText('feat/logging')
    const row = screen.getByText('feat/logging').closest('.sb-ai-item') as HTMLElement
    expect(within(row).getByText('+2')).toBeInTheDocument()
    // and the one still level with its branch wears nothing
    const fresh = screen.getByText('feat/cache').closest('.sb-ai-item') as HTMLElement
    expect(within(fresh).queryByText(/^\+/)).not.toBeInTheDocument()
  })

  test('a row opens the changelog it stands for — no call, the drawer recalls', async () => {
    const { props } = renderAI()
    await openAI()
    await userEvent.click(await screen.findByText('feat/cache'))
    expect(props.onOpenChangelog).toHaveBeenCalledWith('feat/cache')
  })

  test('forgetting one drops it from the store and from the list', async () => {
    // The list is re-read after the forget, so what it answers has to follow
    // the store rather than a call count — the loader also runs on mount.
    let kept = ENTRIES
    const { mock } = renderAI({}, {
      aiChangelogList: jest.fn().mockImplementation(async () => ({ entries: kept })),
      aiForgetChangelog: jest.fn().mockImplementation(async (branch: string) => {
        kept = kept.filter(e => e.branch !== branch)
        return { success: true }
      }),
    })
    await openAI()
    const row = (await screen.findByText('feat/cache')).closest('.sb-ai-item') as HTMLElement
    await userEvent.pointer({ keys: '[MouseRight]', target: row })
    await userEvent.click(await screen.findByText('Forget'))
    expect(mock.aiForgetChangelog).toHaveBeenCalledWith('feat/cache')
    await waitFor(() => expect(screen.queryByText('feat/cache')).not.toBeInTheDocument())
  })

  test('the explanations the commit panel has been keeping are finally listed', async () => {
    const { props } = renderAI()
    await openAI()
    await screen.findByText('EXPLANATIONS')
    expect(screen.getByText('refactor: rename the thing')).toBeInTheDocument()
    expect(screen.getByText('aaaaaaa')).toBeInTheDocument()
    await userEvent.click(screen.getByText('refactor: rename the thing'))
    expect(props.onOpenExplanation).toHaveBeenCalledWith('a'.repeat(40))
  })

  test('a commit outside the loaded history still has a row', async () => {
    renderAI({ subjectFor: () => undefined })
    await openAI()
    await screen.findByText('EXPLANATIONS')
    expect(screen.getByText('A commit outside the loaded history')).toBeInTheDocument()
  })

  test('an empty stack says where these come from rather than nothing', async () => {
    renderAI({}, {
      aiChangelogList: jest.fn().mockResolvedValue({ entries: [] }),
      aiGetExplanations: jest.fn().mockResolvedValue({ explanations: {} }),
    })
    await openAI()
    expect(await screen.findByText(/No changelog written/)).toBeInTheDocument()
    expect(screen.getByText(/No explanation kept/)).toBeInTheDocument()
  })

  test('a host that answers neither leaves the stack empty, not broken', async () => {
    renderAI({}, {
      aiChangelogList: jest.fn().mockRejectedValue(new Error('not-implemented')),
      aiGetExplanations: jest.fn().mockRejectedValue(new Error('not-implemented')),
    })
    await openAI()
    expect(await screen.findByText(/No changelog written/)).toBeInTheDocument()
  })

  test('the chosen stack is kept — it is a way of working, not a one-off', async () => {
    const { props } = renderAI()
    await openAI()
    await screen.findByText('CHANGELOGS')
    expect(localStorage.getItem('sb-tab')).toBe('ai')
    // a fresh mount comes back to it
    renderWithProviders(<Sidebar {...(props as any)} />)
    await waitFor(() => expect(screen.getAllByText('CHANGELOGS').length).toBe(2))
  })

  test('the VS Code panel has no strip — its rail already chooses', async () => {
    renderAI({ view: 'ai' })
    await screen.findByText('CHANGELOGS')
    expect(screen.queryByRole('tab', { name: /List/ })).not.toBeInTheDocument()
  })
})
