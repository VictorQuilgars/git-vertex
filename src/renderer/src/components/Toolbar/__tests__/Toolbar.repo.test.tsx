import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Toolbar from '../Toolbar'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The toolbar's left edge: which repository, which branch, and whether that
// branch is heading for a fight. The first two moved here out of the left
// panel's header — 47px of list back — and the third is the one fact you want
// before a merge, said before you go looking for it.

// `label` is the last commit's subject, not a name — the picker must not use
// it, and these fixtures say so out loud.
const BRANCHES = [
  { name: 'main', current: false, remote: false, commit: 'a', label: 'chore: the beginning' },
  { name: 'feat/cache', current: true, remote: false, commit: 'b', label: 'feat: a cache' },
  { name: 'remotes/origin/main', current: false, remote: true, commit: 'a', label: 'chore: the beginning' },
]

function render(props: Record<string, any> = {}, api: Record<string, any> = {}) {
  const mock = installMockGitAPI({
    conflictOutlook: jest.fn().mockResolvedValue({ base: 'origin/main', files: [] }),
    ...api,
  })
  const all: Record<string, any> = {
    repoPath: '/repo', currentBranch: 'feat/cache', searchQuery: '',
    repoName: 'demo', recentRepos: ['/repo', '/other/taskflow'],
    branches: BRANCHES,
    pullMode: 'ff', loading: false,
    onSearch: jest.fn(), onUndo: jest.fn(), onRedo: jest.fn(), onFetch: jest.fn(),
    onPush: jest.fn(), onPushModal: jest.fn(), onPull: jest.fn(), onSetPullMode: jest.fn(),
    onCreateBranch: jest.fn(), onRefresh: jest.fn(),
    onOpenRepo: jest.fn(), onClone: jest.fn(), onSetRepo: jest.fn(), onRemoveRecent: jest.fn(),
    onGoTo: jest.fn(),
    ...props,
  }
  renderWithProviders(<Toolbar {...(all as any)} />)
  return { props: all, mock }
}

describe('the toolbar’s repository and branch', () => {
  test('both are named, and the branch offers the ways out of it', async () => {
    const { props } = render()
    expect(screen.getByText('demo')).toBeInTheDocument()
    await userEvent.click(screen.getByText('feat/cache'))
    // local first — leaving a branch usually means going to another of yours
    const items = screen.getAllByRole('button').filter(b => b.className.includes('tb-branch-item'))
    expect(items.map(b => b.querySelector('.tb-branch-label')?.textContent))
      .toEqual(['main', 'feat/cache', 'origin/main'])
    await userEvent.click(items[0])
    expect(props.onGoTo).toHaveBeenCalledWith('main')
  })

  test('the filter narrows the list without leaving the menu', async () => {
    render()
    await userEvent.click(screen.getByText('feat/cache'))
    await userEvent.type(screen.getByPlaceholderText(/Filter branches/i), 'cache')
    const items = screen.getAllByRole('button').filter(b => b.className.includes('tb-branch-item'))
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent('feat/cache')
  })

  test('the recents are the other repositories, never the open one', async () => {
    const { props } = render()
    await userEvent.click(screen.getByText('demo'))
    expect(screen.getByText('taskflow')).toBeInTheDocument()
    expect(screen.queryByText('repo')).not.toBeInTheDocument()
    await userEvent.click(screen.getByText('taskflow'))
    expect(props.onSetRepo).toHaveBeenCalledWith('/other/taskflow')
  })

  test('a clean outlook says what it was measured against', async () => {
    render()
    await waitFor(() =>
      expect(screen.getByTitle('No conflicts detected against origin/main')).toBeInTheDocument())
    expect(document.querySelector('.tb-outlook--conflict')).toBeNull()
  })

  test('conflicts are counted, and coloured — the one thing you want before a merge', async () => {
    render({}, { conflictOutlook: jest.fn().mockResolvedValue({ base: 'origin/main', files: ['a.ts', 'b.ts'] }) })
    const badge = await screen.findByTitle('2 files would conflict with origin/main')
    expect(badge.className).toContain('tb-outlook--conflict')
    expect(within(badge).getByText('2')).toBeInTheDocument()
  })

  test('it fails open: an error is "we do not know", never a warning', async () => {
    render({}, { conflictOutlook: jest.fn().mockResolvedValue({ error: 'merge-tree failed' }) })
    await waitFor(() =>
      expect(screen.getByTitle('Nothing to compare this branch against')).toBeInTheDocument())
    expect(document.querySelector('.tb-outlook--conflict')).toBeNull()
  })

  test('a host without the handler is the same silence', async () => {
    render({}, { conflictOutlook: undefined })
    await waitFor(() =>
      expect(screen.getByTitle('Nothing to compare this branch against')).toBeInTheDocument())
  })

  test('a branch with no base to land on says so rather than claiming it is clean', async () => {
    render({}, { conflictOutlook: jest.fn().mockResolvedValue({ base: null, files: [] }) })
    await waitFor(() =>
      expect(screen.getByTitle('Nothing to compare this branch against')).toBeInTheDocument())
  })

  test('the click explains the badge rather than only re-running it', async () => {
    // A coloured glyph in a toolbar says nothing on its own: what was
    // simulated, against what, what came of it, and that nothing was touched.
    render({}, { conflictOutlook: jest.fn().mockResolvedValue({ base: 'origin/main', files: ['src/a.ts', 'src/b.ts'] }) })
    await userEvent.click(await screen.findByTitle('2 files would conflict with origin/main'))
    expect(screen.getByText('Merge outlook')).toBeInTheDocument()
    expect(screen.getByText('Merging origin/main into feat/cache, simulated.')).toBeInTheDocument()
    expect(screen.getByText('src/a.ts')).toBeInTheDocument()
    expect(screen.getByText(/dry run/)).toBeInTheDocument()
  })

  test('a clean outlook explains itself too, and says what was read', async () => {
    render()
    await userEvent.click(await screen.findByTitle('No conflicts detected against origin/main'))
    expect(screen.getByText('Merge outlook')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  test('asked again when the branch changes, and from the panel', async () => {
    const outlook = jest.fn().mockResolvedValue({ base: 'origin/main', files: [] })
    const { mock } = render({}, { conflictOutlook: outlook })
    await waitFor(() => expect(outlook).toHaveBeenCalledWith('feat/cache'))
    await userEvent.click(screen.getByTitle('No conflicts detected against origin/main'))
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }))
    await waitFor(() => expect(mock.conflictOutlook).toHaveBeenCalledTimes(2))
  })

  test('a host that supplies neither gets neither control', async () => {
    render({ onOpenRepo: undefined, onGoTo: undefined })
    expect(screen.queryByText('demo')).not.toBeInTheDocument()
    expect(document.querySelector('.tb-outlook')).toBeNull()
  })
})
