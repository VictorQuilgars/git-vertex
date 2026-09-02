import { screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { emptyVisibility } from '../../../utils/graphVisibility'
import Sidebar from '../Sidebar'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// #176 — the column stopped being one scroller: a section body scrolls on its
// own and the headings stay put, and an open section can be resized by its
// bottom edge. The stylesheet does the scrolling, which jsdom does not apply;
// what IS testable is the shape it keys on, and the height that is kept —
// under the sidebar's own key, the same for every repository.

const TAGS = [
  { name: 'v1.22.0', hash: 'b4e1f37' },
  { name: 'v1.21.1', hash: 'a77e361' },
]

function draw() {
  installMockGitAPI({
    getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
    getReflog: jest.fn().mockResolvedValue({ entries: [] }),
    getSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
    listWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
    getWorkingChanges: jest.fn().mockResolvedValue({ staged: [], unstaged: [], untracked: [] }),
  })
  const props: Record<string, any> = {
    repoPath: '/repo', repoName: 'repo', currentBranch: 'main',
    branches: [], recentRepos: [], stashes: [], tags: TAGS,
    soloBranch: null, visibility: emptyVisibility(),
    view: 'tags',
    showToast: jest.fn(), showPrompt: jest.fn(), showConfirm: jest.fn(),
  }
  for (const k of [
    'onOpenRepo', 'onClone', 'onSetRepo', 'onRemoveRecent', 'onCheckout', 'onCreateBranch',
    'onDeleteBranch', 'onMergeBranch', 'onRenameBranch', 'onRebaseOnto', 'onPushBranch',
    'onDeleteRemoteBranch', 'onSetUpstream', 'onCreateStash', 'onApplyStash', 'onPopStash',
    'onDropStash', 'onRefreshStashes', 'onCreateTag', 'onDeleteTag', 'onCheckoutTag', 'onGoTo',
    'onPushTag', 'onDeleteRemoteTag', 'onSelectCommit', 'onCompareBranch',
    'onToggleSolo', 'onToggleHide',
  ]) props[k] = jest.fn()
  renderWithProviders(<Sidebar {...(props as any)} />)
}

async function openTags() {
  if (!screen.queryByText('v1.22.0')) await userEvent.click(screen.getByText('TAGS'))
  await waitFor(() => expect(screen.getByText('v1.22.0')).toBeInTheDocument())
}

describe('Sidebar — sections scroll inside, and can be resized', () => {
  beforeEach(() => localStorage.removeItem('gv-sb-height:tags'))

  test('an open section carries its body and its handle; a folded one neither', async () => {
    draw()
    await openTags()
    const section = screen.getByText('TAGS').closest('.sb-section') as HTMLElement
    expect(section.classList.contains('sb-section--open')).toBe(true)
    expect(section.querySelector('.sb-section-body')).toContainElement(screen.getByText('v1.22.0'))
    expect(section.querySelector('.sb-section-resizer')).toBeTruthy()
    await userEvent.click(screen.getByText('TAGS'))
    expect(section.classList.contains('sb-section--open')).toBe(false)
    expect(section.querySelector('.sb-section-resizer')).toBeNull()
  })

  test('dragging the edge sets and keeps the height; a double-click hands it back', async () => {
    draw()
    await openTags()
    const section = screen.getByText('TAGS').closest('.sb-section') as HTMLElement
    const handle = section.querySelector('.sb-section-resizer')!
    jest.spyOn(section, 'getBoundingClientRect').mockReturnValue({ height: 200 } as DOMRect)

    fireEvent.mouseDown(handle, { clientY: 300, button: 0 })
    fireEvent.mouseMove(window, { clientY: 340 })
    fireEvent.mouseUp(window)
    expect(section.style.flex).toBe('0 0 240px')
    expect(localStorage.getItem('gv-sb-height:tags')).toBe('240')

    // never below a header and two rows, whatever the drag says
    fireEvent.mouseDown(handle, { clientY: 300, button: 0 })
    fireEvent.mouseMove(window, { clientY: 0 })
    fireEvent.mouseUp(window)
    expect(localStorage.getItem('gv-sb-height:tags')).toBe('78')

    fireEvent.doubleClick(handle)
    expect(section.style.flex).toBe('')
    expect(localStorage.getItem('gv-sb-height:tags')).toBeNull()
  })

  test('a kept height comes back on the next draw', async () => {
    localStorage.setItem('gv-sb-height:tags', '150')
    draw()
    await openTags()
    const section = screen.getByText('TAGS').closest('.sb-section') as HTMLElement
    expect(section.style.flex).toBe('0 0 150px')
  })
})
