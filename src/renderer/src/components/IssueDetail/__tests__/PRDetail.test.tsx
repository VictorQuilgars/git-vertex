import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PRDetail from '../PRDetail'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The PR detail — #110 §2. What these hold: the request is fetched fresh
// (mergeability lives there), the checks hang off the head sha, and there is
// deliberately NO merge button — merging is #73's write surface. The rest
// of the pane rides the issue endpoints, which a pull request is to GitHub.

const FULL_PR = {
  number: 42, title: 'Speed up the graph', state: 'open', merged: false, draft: false,
  author: 'alice', createdAt: new Date(Date.now() - 3600_000).toISOString(),
  body: 'A **faster** layout.',
  headRef: 'feat/speed', headSha: 'abc123', baseRef: 'main',
  commits: 2, changedFiles: 9, additions: 726, deletions: 10,
  mergeable: true, mergeableState: 'clean',
  labels: [{ name: 'perf', color: '00ff00' }], assignees: [], reviewers: ['victor'],
  url: 'https://x/pr/42',
}

function draw(prOverrides: Record<string, any> = {}, apiOverrides: Record<string, any> = {}) {
  const api = installMockGitAPI({
    githubGetPR: jest.fn().mockResolvedValue({ pr: { ...FULL_PR, ...prOverrides } }),
    githubGetChecks: jest.fn().mockResolvedValue({ checks: { total: 5, passed: 5, failed: 0, pending: 0 } }),
    githubIssueComments: jest.fn().mockResolvedValue({ comments: [] }),
    githubAddIssueComment: jest.fn().mockResolvedValue({ success: true }),
    githubUpdateIssue: jest.fn().mockResolvedValue({ success: true }),
    githubListAssignees: jest.fn().mockResolvedValue({ assignees: ['alice', 'victor'] }),
    githubListRepoLabels: jest.fn().mockResolvedValue({ labels: [{ name: 'perf', color: '00ff00' }] }),
    openExternal: jest.fn(),
    ...apiOverrides,
  })
  const view = renderWithProviders(
    <PRDetail repo={{ owner: 'o', repo: 'r' }} number={42} onClose={() => {}} />
  )
  return { api, ...view }
}

describe('the PR detail', () => {
  test('the cost line and the branches are the header facts', async () => {
    draw()
    await screen.findByText('Speed up the graph')
    expect(screen.getByText(/2 commits · 9 files/)).toBeInTheDocument()
    expect(screen.getByText('+726')).toBeInTheDocument()
    expect(screen.getByText('−10')).toBeInTheDocument()
    expect(screen.getByText('feat/speed')).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('@victor')).toBeInTheDocument()   // reviewer
  })

  test('mergeability is read and reported — and there is NO merge button', async () => {
    const { api } = draw()
    await screen.findByText('Speed up the graph')
    await waitFor(() => expect(api.githubGetChecks).toHaveBeenCalledWith('o', 'r', 'abc123'))
    expect(await screen.findByText('5 checks passed')).toBeInTheDocument()
    expect(screen.getByText('No conflicts')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^merge( pull request)?$/i })).not.toBeInTheDocument()
  })

  test('a null mergeable says computing, never guesses', async () => {
    draw({ mergeable: null })
    await screen.findByText('Speed up the graph')
    expect(screen.getByText(/still computing/)).toBeInTheDocument()
  })

  test('failing checks and conflicts are named', async () => {
    draw({ mergeable: false }, {
      githubGetChecks: jest.fn().mockResolvedValue({ checks: { total: 5, passed: 3, failed: 2, pending: 0 } }),
    })
    await screen.findByText('Speed up the graph')
    expect(await screen.findByText('2 of 5 checks failed')).toBeInTheDocument()
    expect(screen.getByText('Conflicts with the base')).toBeInTheDocument()
  })

  test('a merged request shows Merged and stops offering the state editor', async () => {
    draw({ merged: true, state: 'closed' })
    await screen.findByText('Speed up the graph')
    expect(screen.getByText('Merged')).toBeInTheDocument()
    expect(document.querySelector('.idv-state-bar')).not.toBeInTheDocument()
  })

  test('a comment goes through the issue endpoints — a PR is an issue to them', async () => {
    const { api } = draw()
    await screen.findByText('Speed up the graph')
    await userEvent.type(screen.getByPlaceholderText(/Add a comment/), 'LGTM')
    await userEvent.click(screen.getByText('Add Comment'))
    await waitFor(() => expect(api.githubAddIssueComment).toHaveBeenCalledWith('o', 'r', 42, 'LGTM'))
  })

  test('closing goes through the same PATCH as an issue', async () => {
    const { api } = draw()
    await screen.findByText('Speed up the graph')
    const statusBlock = document.querySelector('.idv-state-bar')!.closest('.idv-block')!
    await userEvent.click(statusBlock.querySelector('.idv-pencil')!)
    const closed = [...statusBlock.querySelectorAll('.idv-pick-row')].find(b => b.textContent?.includes('Closed'))!
    await userEvent.click(closed)
    await waitFor(() => expect(api.githubUpdateIssue).toHaveBeenCalledWith('o', 'r', 42, { state: 'closed' }))
  })

  test('a refused load shows the error, not an empty frame', async () => {
    draw({}, { githubGetPR: jest.fn().mockResolvedValue({ error: 'HTTP 404' }) })
    expect(await screen.findByText('HTTP 404')).toBeInTheDocument()
  })
})
