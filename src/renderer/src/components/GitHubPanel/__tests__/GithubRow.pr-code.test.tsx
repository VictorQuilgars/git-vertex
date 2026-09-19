// A pull request row reaches its code, an issue row does not (#290).
import { screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GithubRow from '../GithubRow'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

const PR = { kind: 'pr' as const, number: 42, title: 'Cards', url: 'https://github.com/o/r/pull/42' }
const ISSUE = { kind: 'issue' as const, number: 7, title: 'A bug', url: 'https://github.com/o/r/issues/7' }

const menuLabels = () => [...document.querySelectorAll('.ctx-menu .ctx-item')]
  .map(b => (b.textContent ?? '').replace(/^✓/, '').trim())

const open = async (item: any, extra: Record<string, any> = {}) => {
  installMockGitAPI()
  const acts = { onSwitchTo: jest.fn(), onOpenInWorktree: jest.fn(), onViewChanges: jest.fn(), onCompare: jest.fn() }
  renderWithProviders(<GithubRow item={item} prActions={acts} hoverCard={false} {...extra} />)
  fireEvent.contextMenu(screen.getByText(item.title))
  await waitFor(() => expect(document.querySelector('.ctx-menu')).toBeTruthy())
  return acts
}

test('offers switching, a worktree, the changes and a comparison', async () => {
  const acts = await open(PR)
  const labels = menuLabels()
  expect(labels).toContain('View Changes')
  expect(labels).toContain('Switch to its Branch')
  expect(labels).toContain('Open in a New Worktree')
  expect(labels).toContain('Compare Base and Head')
  await userEvent.click(screen.getByText('Switch to its Branch'))
  expect(acts.onSwitchTo).toHaveBeenCalled()
})

test('an issue has no head to fetch, so it is offered none of them', async () => {
  await open(ISSUE)
  const labels = menuLabels()
  expect(labels).not.toContain('Switch to its Branch')
  expect(labels).not.toContain('View Changes')
  expect(labels).toContain('Copy Link')
})

test('a host that wired none of it gets the row it always had', async () => {
  installMockGitAPI()
  renderWithProviders(<GithubRow item={PR} hoverCard={false} />)
  fireEvent.contextMenu(screen.getByText('Cards'))
  await waitFor(() => expect(document.querySelector('.ctx-menu')).toBeTruthy())
  expect(menuLabels()).not.toContain('Switch to its Branch')
})
