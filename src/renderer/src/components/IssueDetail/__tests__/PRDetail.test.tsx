import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PRDetail from '../PRDetail'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The PR detail — #110 §2 + #73's P2 merge. What these hold: the request is
// fetched fresh (mergeability lives there), the checks hang off the head sha,
// and the merge button follows the reference's rule — it EXISTS only when
// checks are green (or absent) and there are no conflicts. The rest of the
// pane rides the issue endpoints, which a pull request is to GitHub.

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
    githubMergePR: jest.fn().mockResolvedValue({ success: true, sha: 'deadbeef' }),
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

  test('when both hold, the merge button exists — and merges', async () => {
    const { api } = draw()
    await screen.findByText('Speed up the graph')
    expect(await screen.findByText('5 checks passed')).toBeInTheDocument()
    expect(screen.getByText('No conflicts')).toBeInTheDocument()
    const btn = await screen.findByText('Merge Pull Request')
    await userEvent.click(btn)
    await waitFor(() => expect(api.githubMergePR).toHaveBeenCalledWith('o', 'r', 42, 'merge'))
    // the pane flips to Merged without a reload, and the button goes
    expect(await screen.findByText('Merged')).toBeInTheDocument()
    expect(screen.queryByText('Merge Pull Request')).not.toBeInTheDocument()
  })

  // The repo's own case: checks green, no conflicts, but a ruleset demands a
  // review the bypass will skip. The button says so — the web UI's consent
  // checkbox, folded into the label.
  test('a protections-blocked request gets the bypass wording, and still merges', async () => {
    const { api } = draw({ mergeableState: 'blocked' })
    await screen.findByText('Speed up the graph')
    const btn = await screen.findByText('Merge, Bypassing Rules')
    expect(screen.queryByText('Merge Pull Request')).not.toBeInTheDocument()
    await userEvent.click(btn)
    await waitFor(() => expect(api.githubMergePR).toHaveBeenCalledWith('o', 'r', 42, 'merge'))
    expect(await screen.findByText('Merged')).toBeInTheDocument()
  })

  test('the method picker changes what the click sends', async () => {
    const { api } = draw()
    await screen.findByText('Speed up the graph')
    await screen.findByText('Merge Pull Request')
    await userEvent.click(screen.getByTitle('Merge method'))
    await userEvent.click(screen.getByText('Squash and Merge'))
    await userEvent.click(screen.getByText('Squash and Merge'))
    await waitFor(() => expect(api.githubMergePR).toHaveBeenCalledWith('o', 'r', 42, 'squash'))
  })

  test('failing checks, pending checks or conflicts mean NO button — not a disabled one', async () => {
    draw({ mergeable: true }, {
      githubGetChecks: jest.fn().mockResolvedValue({ checks: { total: 5, passed: 3, failed: 2, pending: 0 } }),
    })
    await screen.findByText('Speed up the graph')
    await screen.findByText('2 of 5 checks failed')
    expect(screen.queryByText('Merge Pull Request')).not.toBeInTheDocument()
  })

  test('a refused merge shows GitHub\'s message and changes nothing', async () => {
    draw({}, { githubMergePR: jest.fn().mockResolvedValue({ error: 'Required status check missing' }) })
    await screen.findByText('Speed up the graph')
    await userEvent.click(await screen.findByText('Merge Pull Request'))
    expect(await screen.findByText('Required status check missing')).toBeInTheDocument()
    expect(screen.queryByText('Merged')).not.toBeInTheDocument()
    expect(screen.getByText('Merge Pull Request')).toBeInTheDocument()
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
