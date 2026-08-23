import { screen, waitFor, fireEvent } from '@testing-library/react'
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

  // GitHub's own shape: the method button keeps its method label even when
  // blocked; the bypass is ANOTHER button, revealed by the first click,
  // danger-toned, and only it merges.
  test('blocked with bypass rights: the method button reveals a separate bypass button', async () => {
    const { api } = draw({ mergeableState: 'blocked', reviewDecision: 'REVIEW_REQUIRED', canBypass: true })
    await screen.findByText('Speed up the graph')
    // the blocked block says so, github.com's way
    expect(await screen.findByText('Merging is blocked')).toBeInTheDocument()
    expect(screen.getByText('At least one approving review is awaited.')).toBeInTheDocument()
    // ...and says the viewer is a bypass actor for it, before any click
    expect(screen.getByText('You can bypass this rule and merge anyway')).toBeInTheDocument()
    // the method button keeps its method label
    const btn = await screen.findByText('Merge Pull Request')
    expect(btn).toBeEnabled()
    expect(screen.queryByText('Bypass Rules and Merge')).not.toBeInTheDocument()
    await userEvent.click(btn)
    expect(api.githubMergePR).not.toHaveBeenCalled()
    const bypass = await screen.findByText('Bypass Rules and Merge')
    await userEvent.click(bypass)
    await waitFor(() => expect(api.githubMergePR).toHaveBeenCalledWith('o', 'r', 42, 'merge'))
    expect(await screen.findByText('Merged')).toBeInTheDocument()
  })

  test('a click anywhere else hides the bypass button again', async () => {
    const { api } = draw({ mergeableState: 'blocked', reviewDecision: 'REVIEW_REQUIRED', canBypass: true })
    await screen.findByText('Speed up the graph')
    await userEvent.click(await screen.findByText('Merge Pull Request'))
    await screen.findByText('Bypass Rules and Merge')
    fireEvent.mouseDown(screen.getByText('Speed up the graph'))
    await waitFor(() =>
      expect(screen.queryByText('Bypass Rules and Merge')).not.toBeInTheDocument())
    expect(api.githubMergePR).not.toHaveBeenCalled()
  })

  // Without the rights: github.com's interface — the reason, and a disabled
  // method button. No bypass button, ever.
  test('blocked without bypass rights: reviews awaited, disabled button, no bypass', async () => {
    const { api } = draw({ mergeableState: 'blocked', reviewDecision: 'REVIEW_REQUIRED', canBypass: false })
    await screen.findByText('Speed up the graph')
    expect(await screen.findByText('Merging is blocked')).toBeInTheDocument()
    expect(screen.getByText('At least one approving review is awaited.')).toBeInTheDocument()
    // and the pane says why the button will not move FOR THIS VIEWER
    expect(screen.getByText('You cannot bypass this rule')).toBeInTheDocument()
    const btn = await screen.findByText('Merge Pull Request')
    expect(btn.closest('button')).toBeDisabled()
    await userEvent.click(btn)
    expect(screen.queryByText('Bypass Rules and Merge')).not.toBeInTheDocument()
    expect(api.githubMergePR).not.toHaveBeenCalled()
  })

  test('changes requested is named as the reason', async () => {
    draw({ mergeableState: 'blocked', reviewDecision: 'CHANGES_REQUESTED', canBypass: true })
    await screen.findByText('Speed up the graph')
    expect(await screen.findByText('Changes have been requested.')).toBeInTheDocument()
  })

  // The viewer's own permission, stated with the checks and the conflicts.
  // A measured lack of it takes the button away — GitHub would answer 403,
  // and a button that cannot work is worse than a sentence that explains.
  test('write access is reported alongside the checks', async () => {
    draw({ canMerge: true })
    await screen.findByText('Speed up the graph')
    expect(await screen.findByText('You have merge permission')).toBeInTheDocument()
    expect(await screen.findByText('Merge Pull Request')).toBeInTheDocument()
  })

  test('read-only access: the pane says so and offers no merge button', async () => {
    const { api } = draw({ canMerge: false })
    await screen.findByText('Speed up the graph')
    expect(await screen.findByText('You do not have merge permission')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('5 checks passed')).toBeInTheDocument())
    expect(screen.queryByText('Merge Pull Request')).not.toBeInTheDocument()
    expect(api.githubMergePR).not.toHaveBeenCalled()
  })

  // An older host, or a failed lookup, sends no permission at all. Unknown is
  // not a refusal: the button stays and GitHub judges at the click.
  test('an unknown permission says nothing and keeps the button', async () => {
    draw({ canMerge: null })
    await screen.findByText('Speed up the graph')
    expect(await screen.findByText('Merge Pull Request')).toBeInTheDocument()
    expect(screen.queryByText('You have merge permission')).not.toBeInTheDocument()
    expect(screen.queryByText('You do not have merge permission')).not.toBeInTheDocument()
  })

  // #124: a merged request offers its branches' cleanup, both sides in one
  // action, each outcome reported where the click happened.
  test('a merged request offers Delete Work Branches, and reports per branch', async () => {
    const { api } = draw({ merged: true, state: 'closed' }, {
      deleteRemoteBranch: jest.fn().mockResolvedValue({ success: true }),
      deleteBranch: jest.fn().mockResolvedValue({ success: false, error: 'branch not found' }),
    })
    await screen.findByText('Speed up the graph')
    await userEvent.click(screen.getByText('Delete Work Branches'))
    await waitFor(() => expect(api.deleteRemoteBranch).toHaveBeenCalledWith('feat/speed'))
    expect(api.deleteBranch).toHaveBeenCalledWith('feat/speed')
    expect(await screen.findByText(/Remote : deleted/)).toBeInTheDocument()
    expect(screen.getByText(/Local : not found/)).toBeInTheDocument()
  })

  // Victor's own first use: the branch being deleted is the one checked out —
  // you just merged its PR. git refuses; the answer is the reference
  // clients': step onto the base, then delete.
  test('a checked-out local branch is deleted by switching to the base first', async () => {
    const deleteBranch = jest.fn()
      .mockResolvedValueOnce({ success: false, error: "error: cannot delete branch 'feat/speed' used by worktree at '/x'" })
      .mockResolvedValueOnce({ success: true })
    const checkout = jest.fn().mockResolvedValue({ success: true })
    const pull = jest.fn().mockResolvedValue({ success: true })
    const { api } = draw({ merged: true, state: 'closed' }, {
      deleteRemoteBranch: jest.fn().mockResolvedValue({ success: true }),
      deleteBranch, checkout, pull,
    })
    await screen.findByText('Speed up the graph')
    await userEvent.click(screen.getByText('Delete Work Branches'))
    await waitFor(() => expect(checkout).toHaveBeenCalledWith('main'))
    expect(deleteBranch).toHaveBeenCalledTimes(2)
    // The app moved them onto the base, so it owes them one that holds the
    // merge — and a fast-forward, never anything that could rewrite work.
    expect(pull).toHaveBeenCalledWith('ff-only')
    expect(await screen.findByText(/switched to main and brought it up to date/))
      .toBeInTheDocument()
  })

  // ⚠️ A diverged base is left exactly as it is: reconciling someone's trunk
  // unasked is worse than the stale state this fixes.
  test('a base that will not fast-forward is left alone, and said to be behind', async () => {
    const deleteBranch = jest.fn()
      .mockResolvedValueOnce({ success: false, error: "cannot delete branch 'feat/speed' checked out at '/x'" })
      .mockResolvedValueOnce({ success: true })
    const pull = jest.fn().mockResolvedValue({ success: false, error: 'Not possible to fast-forward, aborting.' })
    draw({ merged: true, state: 'closed' }, {
      deleteRemoteBranch: jest.fn().mockResolvedValue({ success: true }),
      deleteBranch, pull,
      checkout: jest.fn().mockResolvedValue({ success: true }),
    })
    await screen.findByText('Speed up the graph')
    await userEvent.click(screen.getByText('Delete Work Branches'))
    expect(await screen.findByText(/switched to main, which is still behind/))
      .toBeInTheDocument()
  })

  test('no switch, no pull — the base is only touched because the app moved you', async () => {
    const pull = jest.fn()
    draw({ merged: true, state: 'closed' }, {
      deleteRemoteBranch: jest.fn().mockResolvedValue({ success: true }),
      deleteBranch: jest.fn().mockResolvedValue({ success: true }),
      pull,
    })
    await screen.findByText('Speed up the graph')
    await userEvent.click(screen.getByText('Delete Work Branches'))
    expect(await screen.findByText(/Local : deleted/)).toBeInTheDocument()
    expect(pull).not.toHaveBeenCalled()
  })

  // The action deletes ONE ref by name and must keep doing exactly that. What
  // else stands on the merged commit is reported, never removed.
  test('another branch on the merged commit is named, and left alone', async () => {
    const deleteBranch = jest.fn().mockResolvedValue({ success: true })
    draw({ merged: true, state: 'closed' }, {
      deleteRemoteBranch: jest.fn().mockResolvedValue({ success: true }),
      deleteBranch,
      getBranches: jest.fn().mockResolvedValue({
        branches: [
          { name: 'feat/speed', commit: 'abc123', remote: false },
          { name: 'feat/speed-1', commit: 'abc123', remote: false },
          { name: 'main', commit: 'deadbee', remote: false },
          { name: 'remotes/origin/feat/speed', commit: 'abc123', remote: true },
        ],
      }),
    })
    await screen.findByText('Speed up the graph')
    await userEvent.click(screen.getByText('Delete Work Branches'))
    expect(await screen.findByText(/Also on this commit: feat\/speed-1/)).toBeInTheDocument()
    // named, not deleted — and the remote twin is not a local leftover
    expect(deleteBranch).toHaveBeenCalledTimes(1)
    expect(deleteBranch).toHaveBeenCalledWith('feat/speed')
  })

  test("when even the switch fails, git's own message stays", async () => {
    const { api } = draw({ merged: true, state: 'closed' }, {
      deleteRemoteBranch: jest.fn().mockResolvedValue({ success: true }),
      deleteBranch: jest.fn().mockResolvedValue({ success: false, error: "cannot delete branch 'feat/speed' used by worktree at '/elsewhere'" }),
      checkout: jest.fn().mockResolvedValue({ success: false, error: 'local changes would be overwritten' }),
    })
    await screen.findByText('Speed up the graph')
    await userEvent.click(screen.getByText('Delete Work Branches'))
    expect(await screen.findByText(/used by worktree/)).toBeInTheDocument()
    expect(api.deleteBranch).toHaveBeenCalledTimes(1)
  })

  test('an open request offers no branch cleanup', async () => {
    draw()
    await screen.findByText('Speed up the graph')
    expect(screen.queryByText('Delete Work Branches')).not.toBeInTheDocument()
  })

  test('the method picker relabels the button, and changes what the click sends', async () => {
    const { api } = draw()
    await screen.findByText('Speed up the graph')
    await screen.findByText('Merge Pull Request')
    await userEvent.click(screen.getByTitle('Merge method'))
    await userEvent.click(screen.getByText('Squash and Merge'))
    // the button now SAYS the chosen method
    const btn = await screen.findByText('Squash and Merge')
    expect(screen.queryByText('Merge Pull Request')).not.toBeInTheDocument()
    await userEvent.click(btn)
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
