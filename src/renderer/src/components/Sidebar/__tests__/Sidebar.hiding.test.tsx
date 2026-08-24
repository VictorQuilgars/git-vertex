import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { emptyVisibility, type GraphVisibility } from '../../../utils/graphVisibility'
import Sidebar from '../Sidebar'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// Hiding could only ever hide a branch, one at a time. A tag, a whole remote
// and the stash had no way in, and there was nothing on screen to say a section
// was filtering the graph — so these cover the two halves that were missing:
// the per-row action on the kinds that gained it, and the group action with the
// count that makes it findable.

const TAGS = [
  { name: 'v1.22.0', hash: 'b4e1f37' },
  { name: 'v1.21.1', hash: 'a77e361' },
]
const REMOTES = [
  { name: 'origin', fetchUrl: 'git@github.com:o/r.git', pushUrl: 'git@github.com:o/r.git' },
  { name: 'upstream', fetchUrl: 'git@github.com:up/r.git', pushUrl: 'git@github.com:up/r.git' },
]

function render(view: 'tags' | 'remotes', overrides: Record<string, any> = {}) {
  installMockGitAPI({
    getRemotes: jest.fn().mockResolvedValue({ remotes: REMOTES }),
    getReflog: jest.fn().mockResolvedValue({ entries: [] }),
    getSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
    listWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
    getWorkingChanges: jest.fn().mockResolvedValue({ staged: [], unstaged: [], untracked: [] }),
  })
  const props: Record<string, any> = {
    repoPath: '/repo', repoName: 'repo', currentBranch: 'main',
    branches: [], recentRepos: [], stashes: [], tags: TAGS,
    soloBranch: null, visibility: emptyVisibility(),
    view,
    showToast: jest.fn(), showPrompt: jest.fn(), showConfirm: jest.fn(),
  }
  for (const k of [
    'onOpenRepo', 'onClone', 'onSetRepo', 'onRemoveRecent', 'onCheckout', 'onCreateBranch',
    'onDeleteBranch', 'onMergeBranch', 'onRenameBranch', 'onRebaseOnto', 'onPushBranch',
    'onDeleteRemoteBranch', 'onSetUpstream', 'onCreateStash', 'onApplyStash', 'onPopStash',
    'onDropStash', 'onRefreshStashes', 'onCreateTag', 'onDeleteTag', 'onCheckoutTag', 'onGoTo',
    'onPushTag', 'onDeleteRemoteTag', 'onSelectCommit', 'onCompareBranch',
    'onToggleSolo', 'onToggleHide', 'onToggleHideTag', 'onToggleHideRemote', 'onSetFamilyHidden',
  ]) props[k] = jest.fn()

  Object.assign(props, overrides)
  renderWithProviders(<Sidebar {...(props as any)} />)
  return props
}

const hiding = (patch: Partial<GraphVisibility>): GraphVisibility => ({ ...emptyVisibility(), ...patch })

describe('hiding a row', () => {
  test('a tag offers Hide from Graph, and the hidden one offers the way back', async () => {
    const props = render('tags')
    await waitFor(() => expect(screen.getByText('v1.22.0')).toBeInTheDocument())

    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('v1.22.0') })
    await userEvent.click(await screen.findByText('Hide from Graph'))

    expect(props.onToggleHideTag).toHaveBeenCalledWith('v1.22.0')
  })

  test('an already hidden tag says Show in Graph instead', async () => {
    render('tags', { visibility: hiding({ tags: new Set(['v1.22.0']) }) })
    await waitFor(() => expect(screen.getByText('v1.22.0')).toBeInTheDocument())

    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('v1.22.0') })

    expect(await screen.findByText('Show in Graph')).toBeInTheDocument()
    expect(screen.queryByText('Hide from Graph')).not.toBeInTheDocument()
  })

  test('a remote hides all of its branches at once', async () => {
    const props = render('remotes')
    await waitFor(() => expect(screen.getByText('origin')).toBeInTheDocument())

    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('origin') })
    await userEvent.click(await screen.findByText('Hide from Graph'))

    expect(props.onToggleHideRemote).toHaveBeenCalledWith('origin')
  })
})

describe('hiding a whole section', () => {
  test('the header menu hides everything the section lists', async () => {
    const props = render('tags')
    await waitFor(() => expect(screen.getByText('v1.22.0')).toBeInTheDocument())

    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('TAGS') })
    await userEvent.click(await screen.findByText('Hide All from Graph'))

    expect(props.onSetFamilyHidden).toHaveBeenCalledWith('tags', true)
  })

  // The group actions live in a menu nobody thinks to open. The count is what
  // says the graph is filtered at all, so it is also the way back.
  test('the header counts what is hidden, and clicking the count restores it', async () => {
    const props = render('tags', { visibility: hiding({ tags: new Set(['v1.22.0']) }) })
    await waitFor(() => expect(screen.getByText('v1.22.0')).toBeInTheDocument())

    const chip = screen.getByTitle(/click to show them all/i)
    expect(within(chip).getByText('1')).toBeInTheDocument()

    await userEvent.click(chip)
    expect(props.onSetFamilyHidden).toHaveBeenCalledWith('tags', false)
  })

  test('a family hidden wholesale counts every row, not the ones ticked one by one', async () => {
    render('tags', { visibility: hiding({ families: new Set(['tags' as const]) }) })
    await waitFor(() => expect(screen.getByText('v1.22.0')).toBeInTheDocument())

    expect(within(screen.getByTitle(/click to show them all/i)).getByText('2')).toBeInTheDocument()
  })

  test('nothing hidden, no chip', async () => {
    render('tags')
    await waitFor(() => expect(screen.getByText('v1.22.0')).toBeInTheDocument())

    expect(screen.queryByTitle(/click to show them all/i)).not.toBeInTheDocument()
  })
})

// #132 - the graph's widest scope moved out of the toolbar and in here, where
// everything else that decides what the graph draws already lived.
describe('the graph scope on the LOCAL header', () => {
  const openLocalMenu = async (overrides: Record<string, any> = {}) => {
    const props = render('branches' as any, overrides)
    await waitFor(() => expect(screen.getByText('LOCAL')).toBeInTheDocument())
    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('LOCAL') })
    return props
  }

  test('the entry is there when every branch is drawn', async () => {
    await openLocalMenu({ showAllBranches: true, onToggleAllBranches: jest.fn() })
    expect(await screen.findByText('All Branches in the Graph')).toBeInTheDocument()
  })

  test('clicking it hands the decision back to the host', async () => {
    const onToggleAllBranches = jest.fn()
    await openLocalMenu({ showAllBranches: true, onToggleAllBranches })
    await userEvent.click(await screen.findByText('All Branches in the Graph'))
    expect(onToggleAllBranches).toHaveBeenCalled()
  })

  // It is not a third member of the hide family: hiding takes refs away from
  // `--all`, this decides whether there is an `--all` at all.
  test('it sits after the family rows, not among them', async () => {
    await openLocalMenu({ showAllBranches: false, onToggleAllBranches: jest.fn() })
    await screen.findByText('Hide All from Graph')
    const labels = Array.from(document.querySelectorAll('[class*="ctx"]'))
      .map(n => n.textContent ?? '')
    const scope = labels.findIndex(l => l === 'All Branches in the Graph')
    const showAll = labels.findIndex(l => l === 'Show All in Graph')
    expect(scope).toBeGreaterThan(showAll)
  })

  test('no handler, no entry - the family rows stand alone', async () => {
    await openLocalMenu()
    expect(await screen.findByText('Hide All from Graph')).toBeInTheDocument()
    expect(screen.queryByText('All Branches in the Graph')).not.toBeInTheDocument()
  })
})

// #134 — the sections draw a branch name as the path it is.
describe('the branch tree in the sections', () => {
  const b = (name: string, over: any = {}) =>
    ({ name, current: false, remote: false, commit: 'abc1234', label: name, ...over })

  const drawBranches = (branches: any[], overrides: Record<string, any> = {}) =>
    render('branches' as any, { branches, ...overrides })

  test('the segments before the last become folder rows', async () => {
    drawBranches([b('feat/views-in-tabs'), b('fix/a'), b('fix/b'), b('main', { current: true })])
    await waitFor(() => expect(screen.getByText('LOCAL')).toBeInTheDocument())
    expect(await screen.findByText('feat')).toBeInTheDocument()
    expect(screen.getByText('fix')).toBeInTheDocument()
    // the leaf reads as its last segment, the folders spelling the rest
    expect(screen.getByText('views-in-tabs')).toBeInTheDocument()
    expect(screen.queryByText('feat/views-in-tabs')).not.toBeInTheDocument()
    // and a name with no slash stays a plain row
    expect(screen.getByText('main')).toBeInTheDocument()
  })

  test('a folder says how many branches are under it', async () => {
    drawBranches([b('fix/a'), b('fix/b'), b('fix/c')])
    await waitFor(() => expect(screen.getByText('fix')).toBeInTheDocument())
    // Its own count, not the section's — both say 3 here, which is the point
    // of asking the folder row for it.
    const folder = screen.getByText('fix').closest('.sb-tree-folder')!
    expect(within(folder as HTMLElement).getByText('3')).toBeInTheDocument()
  })

  test('clicking a folder folds it, and its branches go with it', async () => {
    drawBranches([b('fix/a'), b('main')])
    await waitFor(() => expect(screen.getByText('fix')).toBeInTheDocument())
    expect(screen.getByText('a')).toBeInTheDocument()
    await userEvent.click(screen.getByText('fix'))
    expect(screen.queryByText('a')).not.toBeInTheDocument()
    // ...and nothing else moved
    expect(screen.getByText('main')).toBeInTheDocument()
  })

  // A tree that stays folded while you type reads as an empty section.
  test('a filter flattens the tree for as long as it is set', async () => {
    drawBranches([b('fix/typecheck-gate-holes'), b('main')])
    await waitFor(() => expect(screen.getByText('fix')).toBeInTheDocument())
    const filter = screen.getByPlaceholderText(/filter/i)
    await userEvent.type(filter, 'typecheck')
    // no folder row, and the row that matched reads in full
    expect(screen.queryByText('fix')).not.toBeInTheDocument()
    expect(screen.getByText('fix/typecheck-gate-holes')).toBeInTheDocument()
  })

  // REMOTE is a section of the branches view, not the remotes one.
  test('a remote is the first folder, so two mains are told apart by position', async () => {
    drawBranches([
      b('remotes/origin/main', { remote: true }),
      b('remotes/upstream/main', { remote: true }),
    ])
    await waitFor(() => expect(screen.getByText('origin')).toBeInTheDocument())
    expect(screen.getByText('upstream')).toBeInTheDocument()
    expect(screen.getAllByText('main')).toHaveLength(2)
  })
})

// Eleven headers in a column of small capitals are told apart by reading them.
describe('the section marks', () => {
  test('a header carries its own icon, before its title', async () => {
    render('branches' as any, { branches: [] })
    await waitFor(() => expect(screen.getByText('LOCAL')).toBeInTheDocument())
    const header = screen.getByText('LOCAL').closest('.sb-section-header')!
    expect(header.querySelector('.sb-section-icon')).toBeTruthy()
    // ...and it sits between the disclosure triangle and the label.
    const marks = Array.from(header.children).map(n => n.className.toString())
    expect(marks.findIndex(c => c.includes('sb-section-icon')))
      .toBeLessThan(marks.findIndex(c => c.includes('sb-section-title')))
  })

  test('every section drawn has one — none is left unmarked', async () => {
    render('branches' as any, { branches: [] })
    await waitFor(() => expect(screen.getByText('LOCAL')).toBeInTheDocument())
    const headers = Array.from(document.querySelectorAll('.sb-section-header'))
    expect(headers.length).toBeGreaterThan(0)
    for (const h of headers) {
      expect(h.querySelector('.sb-section-icon')).toBeTruthy()
    }
  })
})

// A header shows its count at rest and its controls on hover — they SWAP, so
// the corner never carries two things at once. Both stay in the tree, which is
// what keeps them reachable by Tab.
describe('the header swaps its count for its controls', () => {
  test('the count and the buttons are both present, and both styled', async () => {
    const props = render('branches' as any, { branches: [] })
    await waitFor(() => expect(screen.getByText('LOCAL')).toBeInTheDocument())
    const header = screen.getByText('LOCAL').closest('.sb-section-header')!
    expect(header.querySelector('.sb-section-count')).toBeTruthy()
    // hidden by CSS, never unmounted: a button that is not in the tree cannot
    // be reached by keyboard
    expect(header.querySelector('.sb-add-btn.sb-on-hover')).toBeTruthy()
    expect(props).toBeTruthy()
  })

  // The pinned state is covered where the GitHub sections are drawn — see
  // "a refresh in flight stays visible" in Sidebar.github.test.tsx.

})
