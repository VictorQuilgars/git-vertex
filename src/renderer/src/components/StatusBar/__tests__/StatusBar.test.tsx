import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StatusBar from '../StatusBar'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The graph holds a page of history, and nothing said so: a search that found
// nothing had searched the first 500 commits, and looked like it had searched
// the repository. The status bar names the scope and offers the next page.

beforeEach(() => installMockGitAPI())
const base = { repoName: 'repo', branch: 'main', ahead: 0, behind: 0, onFetch: jest.fn() }

test('says how much history the graph holds, and offers more when the page was full', async () => {
  const onLoadMore = jest.fn()
  renderWithProviders(<StatusBar {...base} commitCount={500} historyTruncated onLoadMore={onLoadMore} />)
  expect(screen.getByText('500 commits loaded')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Load 500 more' }))
  expect(onLoadMore).toHaveBeenCalledTimes(1)
})

test('a repository that fits in one page is not offered more', () => {
  renderWithProviders(<StatusBar {...base} commitCount={120} historyTruncated={false} onLoadMore={jest.fn()} />)
  expect(screen.getByText('120 commits loaded')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /more/ })).not.toBeInTheDocument()
})
