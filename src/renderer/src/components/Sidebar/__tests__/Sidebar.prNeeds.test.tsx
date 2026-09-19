import { screen, fireEvent, act, waitFor } from '@testing-library/react'
import Sidebar from '../Sidebar'
import { askForPRGroup } from '../sections/PrsSection'
import { emptyVisibility } from '../../../utils/graphVisibility'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'
import { LanguageProvider } from '../../../i18n/LanguageContext'
import { SettingsProvider } from '../../../contexts/SettingsContext'

// The pull requests view, read by what each request needs (#257): a mode
// beside the grouping by account, with a count on every group, the rows
// keeping their actions, and a pin and a snooze beside each.

const base: any = {
  repoPath: '/r', repoName: 'r', currentBranch: 'feature/here', branches: [], recentRepos: [],
  stashes: [], tags: [], soloBranch: null, visibility: emptyVisibility(),
  showToast: () => {}, showPrompt: async () => null, showConfirm: async () => true,
  onOpenRepo: () => {}, onClone: () => {}, onSetRepo: () => {},
  onCheckout: () => {}, onCreateBranch: () => {}, onDeleteBranch: () => {},
  onMergeBranch: () => {}, onRenameBranch: () => {}, onRebaseOnto: () => {},
  onPushBranch: () => {}, onDeleteRemoteBranch: () => {}, onSetUpstream: () => {},
  onCreateStash: () => {}, onApplyStash: () => {}, onPopStash: () => {}, onDropStash: () => {},
  onRefreshStashes: () => {}, onCreateTag: () => {}, onDeleteTag: () => {},
  onCheckoutTag: () => {}, onGoTo: () => {}, onPushTag: () => {}, onDeleteRemoteTag: () => {},
  onSelectCommit: () => {}, onCompareBranch: () => {}, onToggleSolo: () => {}, onToggleHide: () => {},
  githubLogin: 'me', githubRepo: { owner: 'o', repo: 'r' }, githubIssues: [],
}
const pr = (number: number, title: string, over: Record<string, unknown> = {}) =>
  ({ number, title, author: 'me', url: `https://x/${number}`, headRef: `b${number}`, updatedAt: '2026-09-17T10:00:00Z', ...over })
const prs = [
  pr(1, 'on this branch', { headRef: 'feature/here' }),
  pr(2, 'theirs, for me', { author: 'ana', reviewers: ['me'] }),
  pr(3, 'mine, approved'),
  pr(4, 'mine, red'),
  pr(5, 'mine, waiting'),
]

beforeEach(() => {
  localStorage.clear()
  const search = jest.fn((q: string) => Promise.resolve({
    items: /review:approved/.test(q) ? [{ number: 3 }, { number: 4 }] : /status:failure/.test(q) ? [{ number: 4 }] : [],
  }))
  installMockGitAPI({
    getReflog: jest.fn().mockResolvedValue({ entries: [] }), getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
    getSubmodules: jest.fn().mockResolvedValue({ submodules: [] }), getWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
    listWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }), listSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
    listAgents: jest.fn().mockResolvedValue({ agents: [] }), githubSearchIssues: search,
  } as any)
})

const groups = () => Object.fromEntries(Array.from(document.querySelectorAll('.sb-gh-group-head')).map(h =>
  [h.querySelector('.sb-gh-group-title')!.textContent, Number(h.querySelector('.sb-gh-group-count')!.textContent)]))

test('by account is what it was; by what they need is one group per need, each with its count', async () => {
  renderWithProviders(<Sidebar {...base} githubPRs={prs} />)
  fireEvent.click(screen.getByText('PULL REQUESTS'))
  expect(groups()).toMatchObject({ 'All Pull Requests': 5 })
  expect((window as any).gitAPI.githubSearchIssues).not.toHaveBeenCalled()

  fireEvent.click(screen.getByText('By what they need'))
  // The review decisions and the checks arrive from the searches: approved-but-red is Blocked, not Ready.
  await waitFor(() => expect(groups()).toEqual({
    'Current Branch': 1, 'Needs Your Review': 1, 'Ready to Merge': 1, 'Blocked': 1, 'Waiting for Review': 1,
  }))
  expect(Object.values(groups()).reduce((a, b) => a + b, 0)).toBe(prs.length)
  expect(localStorage.getItem('gv-prs-group-by')).toBe('need')
})

test('a pin lifts a request to the top and is kept for the repository; a snooze puts it aside until it is woken', async () => {
  renderWithProviders(<Sidebar {...base} githubPRs={prs} />)
  fireEvent.click(screen.getByText('PULL REQUESTS'))
  fireEvent.click(screen.getByText('By what they need'))
  await waitFor(() => expect(groups()['Waiting for Review']).toBe(1))
  fireEvent.click(screen.getByText('Waiting for Review'))
  const rowOf = (title: string) => screen.getByText(title).closest('.sb-gh-need-row') as HTMLElement
  fireEvent.click(rowOf('mine, waiting').querySelector('[aria-label="Pin to the top"]')!)
  expect(groups()).toMatchObject({ Pinned: 1 })
  expect(groups()['Waiting for Review']).toBeUndefined()
  expect(JSON.parse(localStorage.getItem('gv-pr-marks:o/r')!).pinned).toEqual([5])

  // Pinned opens on its own: snooze the row that is in it.
  fireEvent.click(rowOf('mine, waiting').querySelector('[aria-label="Snooze…"]')!)
  await act(async () => { fireEvent.click(await screen.findByText('Until its next update')) })
  expect(groups()).toMatchObject({ Snoozed: 1 })
  expect(groups().Pinned).toBeUndefined()
  expect(JSON.parse(localStorage.getItem('gv-pr-marks:o/r')!).snoozed['5']).toEqual({ updatedAt: '2026-09-17T10:00:00Z' })
})

test('a snooze until the next update is lifted when the request moves', async () => {
  localStorage.setItem('gv-prs-group-by', 'need')
  localStorage.setItem('gv-pr-marks:o/r', JSON.stringify({ pinned: [], snoozed: { 5: { updatedAt: '2026-09-17T10:00:00Z' } } }))
  const { rerender } = renderWithProviders(<Sidebar {...base} githubPRs={prs} />)
  fireEvent.click(screen.getByText('PULL REQUESTS'))
  await waitFor(() => expect(groups().Snoozed).toBe(1))
  const moved = prs.map(p => p.number === 5 ? { ...p, updatedAt: '2026-09-18T09:00:00Z' } : p)
  await act(async () => { rerender(<LanguageProvider><SettingsProvider><Sidebar {...base} githubPRs={moved} /></SettingsProvider></LanguageProvider>) })
  await waitFor(() => expect(groups().Snoozed).toBeUndefined())
  expect(groups()['Waiting for Review']).toBe(1)
  // Woken for good: the store no longer holds it.
  expect(JSON.parse(localStorage.getItem('gv-pr-marks:o/r')!).snoozed).toEqual({})
})

test('a "Waiting on you" line of the overview opens the view in this mode, on its group', async () => {
  renderWithProviders(<Sidebar {...base} githubPRs={prs} />)
  fireEvent.click(screen.getByText('PULL REQUESTS'))
  await act(async () => { askForPRGroup('needs-review') })
  await waitFor(() => expect(groups()['Needs Your Review']).toBe(1))
  // Its group is open: the row is there to be read.
  expect(screen.getByText('theirs, for me')).toBeInTheDocument()
})
