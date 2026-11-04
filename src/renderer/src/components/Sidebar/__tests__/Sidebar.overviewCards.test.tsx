import { screen, waitFor, fireEvent } from '@testing-library/react'
import { emptyVisibility } from '../../../utils/graphVisibility'
import Sidebar from '../Sidebar'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'
import { worktreeCards, nextRecentPage, recentBranches } from '../sections/OverviewSection'

// #279 — the Overview had one card, for the branch on screen. Now a card per
// branch checked out in another worktree, each card opens its branch's menu,
// and RECENT walks back a page at a time instead of stopping at a month.

const NOW = Date.now()
const daysAgo = (d: number) => Math.round(NOW / 1000 - d * 86400)
const BRANCHES = [
  { name: 'main', current: true, remote: false, commit: 'aaa1111', label: '', date: daysAgo(0) },
  { name: 'review', current: false, remote: false, commit: 'bbb2222', label: '', date: daysAgo(2) },
  { name: 'old', current: false, remote: false, commit: 'ccc3333', label: '', date: daysAgo(200) },
  { name: 'ancient', current: false, remote: false, commit: 'ddd4444', label: '', date: daysAgo(2000) },
]
const WORKTREES = [
  { path: '/repo', branch: 'main', head: 'aaa1111', isMain: true, locked: false },
  { path: '/wt/review-tree', branch: 'review', head: 'bbb2222', isMain: false, locked: false, dirty: true, ahead: 2 },
  { path: '/wt/detached', branch: '(detached)', head: 'eee5555', isMain: false, locked: false },
  { path: '/wt/gone', branch: 'old', head: 'ccc3333', isMain: false, locked: false, prunable: true },
]

function draw(over: Record<string, any> = {}) {
  installMockGitAPI({
    getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
    getReflog: jest.fn().mockResolvedValue({ entries: [] }),
    getSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
    listWorktrees: jest.fn().mockResolvedValue({ worktrees: WORKTREES }),
    getWorkingChanges: jest.fn().mockResolvedValue({ staged: [], unstaged: [], untracked: [] }),
  })
  const props: Record<string, any> = {
    repoPath: '/repo', repoName: 'repo', currentBranch: 'main',
    branches: BRANCHES, recentRepos: [], stashes: [], tags: [],
    soloBranch: null, visibility: emptyVisibility(), view: 'overview',
    showToast: jest.fn(), showPrompt: jest.fn(), showConfirm: jest.fn(),
    ...over,
  }
  for (const k of [
    'onOpenRepo', 'onClone', 'onSetRepo', 'onCheckout', 'onCreateBranch',
    'onDeleteBranch', 'onMergeBranch', 'onRenameBranch', 'onRebaseOnto', 'onPushBranch',
    'onDeleteRemoteBranch', 'onSetUpstream', 'onCreateStash', 'onApplyStash', 'onPopStash',
    'onDropStash', 'onRefreshStashes', 'onCreateTag', 'onDeleteTag', 'onCheckoutTag', 'onGoTo',
    'onPushTag', 'onDeleteRemoteTag', 'onSelectCommit', 'onCompareBranch',
    'onToggleSolo', 'onToggleHide',
  ]) if (!(k in props)) props[k] = jest.fn()
  renderWithProviders(<Sidebar {...(props as any)} />)
  return props
}

const menuLabels = () => [...document.querySelectorAll('.context-menu button, [role="menuitem"]')]
  .map(b => (b.textContent ?? '').replace(/^✓/, '').trim())

describe('the cards\' source', () => {
  test('a card per branch held by ANOTHER worktree — not the one on screen, not a detached or a vanished one', () => {
    expect(worktreeCards(WORKTREES, 'main').map(w => w.path)).toEqual(['/wt/review-tree'])
  })
})

describe('on screen', () => {
  test('two worktrees, two cards; the other one says where it is and how it stands', async () => {
    draw()
    const card = (await screen.findByText('review-tree')).closest('.sb-ov-card') as HTMLElement
    expect(card).toHaveClass('sb-ov-card--elsewhere')
    expect(card.textContent).toContain('review')
    expect(card.textContent).toContain('↑2')
    expect(card.textContent).toContain('✎')
    expect(document.querySelectorAll('.sb-ov-card')).toHaveLength(2)
  })

  test('a click shows its tip, a double-click opens its worktree', async () => {
    const p = draw()
    const card = (await screen.findByText('In the other worktrees (1)')).parentElement!.nextElementSibling as HTMLElement
    fireEvent.click(card)
    expect(p.onSelectCommit).toHaveBeenCalledWith('bbb2222')
    fireEvent.doubleClick(card)
    expect(p.onSetRepo).toHaveBeenCalledWith('/wt/review-tree')
  })

  test('a right-click on either card opens that branch\'s menu', async () => {
    draw()
    const other = (await screen.findByText('In the other worktrees (1)')).parentElement!.nextElementSibling as HTMLElement
    fireEvent.contextMenu(other)
    await waitFor(() => expect(document.querySelector('.context-menu, [role="menu"]')).toBeTruthy())
    // Held by another worktree, so the menu opens that worktree rather than
    // offering a switch git would refuse (#285).
    expect(menuLabels().some(l => /worktree/i.test(l))).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })

    const current = document.querySelector('.sb-ov-card:not(.sb-ov-card--elsewhere)') as HTMLElement
    fireEvent.contextMenu(current)
    await waitFor(() => expect(menuLabels().length).toBeGreaterThan(0))
    expect(menuLabels().some(l => /Push/.test(l))).toBe(true)
  })
})

describe('RECENT, a page at a time', () => {
  test('the next page is the first one that shows more, and there is none past the oldest', () => {
    // A week shows `review`; a month adds nothing, so the next page is the year.
    expect(nextRecentPage(BRANCHES as any, 7, NOW)).toBe(365)
    expect(nextRecentPage(BRANCHES as any, 365, NOW)).toBe(Infinity)
    expect(nextRecentPage(BRANCHES as any, Infinity, NOW)).toBeNull()
    expect(recentBranches(BRANCHES as any, Infinity, NOW).map(b => b.name)).toEqual(['review', 'old', 'ancient'])
  })

  test('Show older walks back, and stops when everything is shown', async () => {
    draw()
    await screen.findByText('In the other worktrees (1)')
    fireEvent.click(screen.getByText('Show older'))
    const recentNames = () => [...document.querySelectorAll('.sb-ov-recent-name')].map(e => e.textContent)
    expect(recentNames()).toEqual(['review', 'old'])
    expect(screen.getByText('1 year')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Show older'))
    expect(recentNames()).toEqual(['review', 'old', 'ancient'])
    expect(screen.queryByText('Show older')).not.toBeInTheDocument()
  })
})
