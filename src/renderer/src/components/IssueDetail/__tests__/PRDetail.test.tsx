import { screen, waitFor, fireEvent, act } from '@testing-library/react'
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
    // The cleanup is only offered for branches that still exist (#140), so the
    // default repository has the request's head on both sides.
    getBranches: jest.fn().mockResolvedValue({
      branches: [
        { name: 'feat/speed', commit: 'abc123', remote: false },
        { name: 'remotes/origin/feat/speed', commit: 'abc123', remote: true },
        { name: 'main', commit: 'deadbee', remote: false },
      ],
    }),
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
    const fastForwardToUpstream = jest.fn().mockResolvedValue({ success: true })
    const { api } = draw({ merged: true, state: 'closed' }, {
      deleteRemoteBranch: jest.fn().mockResolvedValue({ success: true }),
      deleteBranch, checkout, fastForwardToUpstream,
    })
    await screen.findByText('Speed up the graph')
    await userEvent.click(screen.getByText('Delete Work Branches'))
    await waitFor(() => expect(checkout).toHaveBeenCalledWith('main'))
    expect(deleteBranch).toHaveBeenCalledTimes(2)
    // The app moved them onto the base, so it owes them one that holds the
    // merge — by naming the upstream ref, never by `pull --ff-only`, which a
    // repository fetching several refs refuses for reasons of its own.
    expect(fastForwardToUpstream).toHaveBeenCalled()
    expect(await screen.findByText(/switched to main and brought it up to date/))
      .toBeInTheDocument()
  })

  // ⚠️ A diverged base is left exactly as it is: reconciling someone's trunk
  // unasked is worse than the stale state this fixes.
  test('a base that will not fast-forward is left alone, and said to be behind', async () => {
    const deleteBranch = jest.fn()
      .mockResolvedValueOnce({ success: false, error: "cannot delete branch 'feat/speed' checked out at '/x'" })
      .mockResolvedValueOnce({ success: true })
    const fastForwardToUpstream = jest.fn().mockResolvedValue({ success: false, error: 'Not possible to fast-forward, aborting.' })
    draw({ merged: true, state: 'closed' }, {
      deleteRemoteBranch: jest.fn().mockResolvedValue({ success: true }),
      deleteBranch, fastForwardToUpstream,
      checkout: jest.fn().mockResolvedValue({ success: true }),
    })
    await screen.findByText('Speed up the graph')
    await userEvent.click(screen.getByText('Delete Work Branches'))
    expect(await screen.findByText(/switched to main, which is still behind/))
      .toBeInTheDocument()
  })

  test('no switch, no fast-forward — the base is only touched because the app moved you', async () => {
    const fastForwardToUpstream = jest.fn()
    draw({ merged: true, state: 'closed' }, {
      deleteRemoteBranch: jest.fn().mockResolvedValue({ success: true }),
      deleteBranch: jest.fn().mockResolvedValue({ success: true }),
      fastForwardToUpstream,
    })
    await screen.findByText('Speed up the graph')
    await userEvent.click(screen.getByText('Delete Work Branches'))
    expect(await screen.findByText(/Local : deleted/)).toBeInTheDocument()
    expect(fastForwardToUpstream).not.toHaveBeenCalled()
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

// Victor: he pushed, opened the request and waited for its checks. They went
// green above and the merge buttons never came — because GitHub answers
// `mergeable: null` while it computes, and this pane asked exactly once.
describe('a request that GitHub has not finished deciding about', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  // Generous by default: the wait stretches while nothing changes (backoff),
  // so a test that advanced exactly one cadence would miss the next tick.
  const settle = async (ms = 30_000) => { await act(async () => { jest.advanceTimersByTime(ms) }) }

  test('it asks again while mergeability is computing, and the button arrives', async () => {
    const githubGetPR = jest.fn()
      .mockResolvedValueOnce({ pr: { ...FULL_PR, mergeable: null, mergeableState: 'unknown' } })
      .mockResolvedValue({ pr: { ...FULL_PR, mergeable: true, mergeableState: 'clean' } })
    draw({}, { githubGetPR })
    expect(await screen.findByText('Mergeability still computing…')).toBeInTheDocument()
    // no button while it is unknown — that is the reported state
    expect(screen.queryByText('Merge Pull Request')).not.toBeInTheDocument()

    await settle()
    expect(await screen.findByText('No conflicts')).toBeInTheDocument()
    expect(await screen.findByText('Merge Pull Request')).toBeInTheDocument()
  })

  // Settled does not mean finished: comments arrive, a review lands, a failed
  // check is re-run. The reads are conditional, so watching costs nothing —
  // it slows down rather than stopping.
  test('a settled request keeps watching, at a slower cadence', async () => {
    const githubGetPR = jest.fn().mockResolvedValue({ pr: { ...FULL_PR, mergeable: true } })
    draw({}, { githubGetPR })
    await screen.findByText('No conflicts')
    // The first tick is armed before the pane knows what it is looking at —
    // nothing is loaded yet, so it asks at the urgent cadence once.
    await settle(5_000)
    const settledAt = githubGetPR.mock.calls.length

    // from then on the urgent cadence is too soon for a settled request
    await settle(5_000)
    expect(githubGetPR.mock.calls.length).toBe(settledAt)

    await settle(20_000)
    expect(githubGetPR.mock.calls.length).toBeGreaterThan(settledAt)
  })

  // A poll that finds nothing new must not re-render the pane under the
  // reader — the whole reason the reads carry an ETag.
  test('an unchanged answer is not written back', async () => {
    const githubGetPR = jest.fn()
      .mockResolvedValueOnce({ pr: { ...FULL_PR, mergeable: true } })
      .mockResolvedValue({ pr: { ...FULL_PR, title: 'SHOULD NOT APPEAR' }, notModified: true })
    draw({}, { githubGetPR })
    await screen.findByText('Speed up the graph')
    await settle(20_000)
    await settle(20_000)
    expect(screen.getByText('Speed up the graph')).toBeInTheDocument()
    expect(screen.queryByText('SHOULD NOT APPEAR')).not.toBeInTheDocument()
  })

  // "au fur et à mesure" — each poll shows where the checks have got to, not
  // just the final answer.
  test('the counts move as the checks land, one poll at a time', async () => {
    const githubGetChecks = jest.fn()
      .mockResolvedValueOnce({ checks: { total: 4, passed: 1, failed: 0, pending: 3 } })
      .mockResolvedValueOnce({ checks: { total: 4, passed: 2, failed: 0, pending: 2 } })
      .mockResolvedValueOnce({ checks: { total: 4, passed: 3, failed: 0, pending: 1 } })
      .mockResolvedValue({ checks: { total: 4, passed: 4, failed: 0, pending: 0 } })
    draw({}, { githubGetChecks })
    expect(await screen.findByText('3 of 4 checks pending')).toBeInTheDocument()
    await settle()
    expect(await screen.findByText('2 of 4 checks pending')).toBeInTheDocument()
    await settle()
    expect(await screen.findByText('1 of 4 checks pending')).toBeInTheDocument()
    await settle()
    expect(await screen.findByText('4 checks passed')).toBeInTheDocument()
    expect(await screen.findByText('Merge Pull Request')).toBeInTheDocument()
  })

  test('a pending check is unsettled too', async () => {
    const githubGetChecks = jest.fn()
      .mockResolvedValueOnce({ checks: { total: 4, passed: 2, failed: 0, pending: 2 } })
      .mockResolvedValue({ checks: { total: 4, passed: 4, failed: 0, pending: 0 } })
    draw({}, { githubGetChecks })
    expect(await screen.findByText('2 of 4 checks pending')).toBeInTheDocument()
    expect(screen.queryByText('Merge Pull Request')).not.toBeInTheDocument()
    await settle()
    expect(await screen.findByText('4 checks passed')).toBeInTheDocument()
    expect(await screen.findByText('Merge Pull Request')).toBeInTheDocument()
  })

  // A refresh would replace the text under the cursor.
  test('it does not ask while the description is being edited', async () => {
    const githubGetPR = jest.fn().mockResolvedValue({ pr: { ...FULL_PR, mergeable: null } })
    draw({}, { githubGetPR })
    await screen.findByText('Mergeability still computing…')
    const once = githubGetPR.mock.calls.length
    // Clicking the title opens its editor — a refresh there would replace the
    // text under the cursor.
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    await user.click(screen.getByText('Speed up the graph'))
    await settle()
    expect(githubGetPR.mock.calls.length).toBe(once)
  })

  // A merged request has nothing left to DECIDE, so it takes the slow cadence
  // rather than the urgent one — but it still gets comments.
  test('a merged request watches slowly, not urgently', async () => {
    const githubGetPR = jest.fn().mockResolvedValue({
      pr: { ...FULL_PR, merged: true, state: 'closed', mergeable: null },
    })
    draw({}, { githubGetPR })
    await screen.findByText('Merged')
    await settle(5_000)            // the one tick armed before anything loaded
    const once = githubGetPR.mock.calls.length
    await settle(5_000)
    expect(githubGetPR.mock.calls.length).toBe(once)
    await settle(20_000)
    expect(githubGetPR.mock.calls.length).toBeGreaterThan(once)
  })
})

// Victor pushed, opened the request, and was offered a merge button over
// "4 checks passed" — the previous head's result, still on screen. Merging
// there is what GitHub refuses: the checks it requires have not run on what
// was just pushed.
describe('checks belong to the commit they ran on', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())
  // Generous by default: the wait stretches while nothing changes (backoff),
  // so a test that advanced exactly one cadence would miss the next tick.
  const settle = async (ms = 30_000) => { await act(async () => { jest.advanceTimersByTime(ms) }) }

  test('a moved head takes its predecessor\'s checks — and the button — away', async () => {
    const githubGetPR = jest.fn()
      .mockResolvedValueOnce({ pr: { ...FULL_PR, headSha: 'old111', mergeable: true } })
      .mockResolvedValue({ pr: { ...FULL_PR, headSha: 'new222', mergeable: true } })
    const githubGetChecks = jest.fn()
      .mockResolvedValueOnce({ checks: { total: 4, passed: 4, failed: 0, pending: 0 } })
      // nothing has run on the new head yet
      .mockResolvedValue({ checks: { total: 0, passed: 0, failed: 0, pending: 0 } })
    draw({}, { githubGetPR, githubGetChecks })

    expect(await screen.findByText('4 checks passed')).toBeInTheDocument()
    expect(await screen.findByText('Merge Pull Request')).toBeInTheDocument()

    // the head moves — the old result is not evidence about the new commit
    await settle(20_000)
    await waitFor(() => expect(githubGetChecks).toHaveBeenCalledWith('o', 'r', 'new222'))
    expect(screen.queryByText('4 checks passed')).not.toBeInTheDocument()
  })

  test('checks for the head that is showing are used as before', async () => {
    const githubGetChecks = jest.fn().mockResolvedValue({ checks: { total: 4, passed: 4, failed: 0, pending: 0 } })
    draw({}, { githubGetChecks })
    expect(await screen.findByText('4 checks passed')).toBeInTheDocument()
    expect(await screen.findByText('Merge Pull Request')).toBeInTheDocument()
  })

  // Deliberately NOT asserted here: that a head with zero check runs is "still
  // deciding". Zero is also what a repository with no CI answers, and treating
  // it as undecided would make those poll urgently forever. Which of the two it
  // is, is GitHub's own `mergeableState` to say — and the pane already shows it.

})

// Victor pushed, opened the request, and got a bare "fetch failed" — the pane
// replaced by a red line with no way back but closing it.
describe('a failed open heals itself', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())
  // Generous by default: the wait stretches while nothing changes (backoff),
  // so a test that advanced exactly one cadence would miss the next tick.
  const settle = async (ms = 30_000) => { await act(async () => { jest.advanceTimersByTime(ms) }) }

  test('the error goes when the next attempt succeeds', async () => {
    const githubGetPR = jest.fn()
      .mockResolvedValueOnce({ error: 'fetch failed' })
      .mockResolvedValue({ pr: { ...FULL_PR, mergeable: true } })
    draw({}, { githubGetPR })
    expect(await screen.findByText('fetch failed')).toBeInTheDocument()

    // nothing loaded is UNSETTLED: it retries in seconds, not twenty
    await settle(5_000)
    expect(await screen.findByText('Speed up the graph')).toBeInTheDocument()
    expect(screen.queryByText('fetch failed')).not.toBeInTheDocument()
  })

  test('a failed retry changes nothing that is already on screen', async () => {
    const githubGetPR = jest.fn()
      .mockResolvedValueOnce({ pr: { ...FULL_PR, mergeable: true } })
      .mockResolvedValue({ error: 'fetch failed' })
    draw({}, { githubGetPR })
    await screen.findByText('Speed up the graph')
    await settle(20_000)
    await settle(20_000)
    // the request is still there, and the failure is not shown
    expect(screen.getByText('Speed up the graph')).toBeInTheDocument()
    expect(screen.queryByText('fetch failed')).not.toBeInTheDocument()
  })
})

// Third time this bit, so it gets its own test: `notModified` says "the same
// body I last sent", and the cache saying it lives in the main process, which
// outlives every pane. A 304 is therefore routine for something THIS pane has
// never seen — and dropping the answer on it left "Checks: unknown" on screen
// for a request whose checks were green.
describe('a 304 is not a reason to know less', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())
  // Generous by default: the wait stretches while nothing changes (backoff),
  // so a test that advanced exactly one cadence would miss the next tick.
  const settle = async (ms = 30_000) => { await act(async () => { jest.advanceTimersByTime(ms) }) }

  test('checks arriving as not-modified still bind to the head being shown', async () => {
    const githubGetPR = jest.fn().mockResolvedValue({ pr: { ...FULL_PR, headSha: 'sha222', mergeable: true } })
    // The pane never saw these; the main process had them cached.
    const githubGetChecks = jest.fn().mockResolvedValue({
      checks: { total: 4, passed: 4, failed: 0, pending: 0 }, notModified: true,
    })
    draw({}, { githubGetPR, githubGetChecks })
    expect(await screen.findByText('4 checks passed')).toBeInTheDocument()
    expect(screen.queryByText('Checks: unknown')).not.toBeInTheDocument()
    expect(await screen.findByText('Merge Pull Request')).toBeInTheDocument()
  })

  test('a head that moves picks up cached checks for the new sha', async () => {
    const githubGetPR = jest.fn()
      .mockResolvedValueOnce({ pr: { ...FULL_PR, headSha: 'old111', mergeable: true } })
      .mockResolvedValue({ pr: { ...FULL_PR, headSha: 'new222', mergeable: true } })
    const githubGetChecks = jest.fn()
      .mockResolvedValueOnce({ checks: { total: 4, passed: 4, failed: 0, pending: 0 } })
      // the new sha answers 304 — this pane has still never seen it
      .mockResolvedValue({ checks: { total: 2, passed: 2, failed: 0, pending: 0 }, notModified: true })
    draw({}, { githubGetPR, githubGetChecks })
    await screen.findByText('4 checks passed')
    await settle(20_000)
    await waitFor(() => expect(githubGetChecks).toHaveBeenCalledWith('o', 'r', 'new222'))
    await settle(0)   // let the checks promise land
    // it does not fall back to unknown: the 304 carried the answer
    expect(screen.getByText('2 checks passed')).toBeInTheDocument()
  })
})

// Victor: "2 of 4 checks pending", stuck. The poll had run once and armed no
// successor, because the timer was re-created by the effect and the effect was
// re-created by its own writes — so a tick that changed nothing ended the loop.
// Changing nothing is the NORMAL case for a request still running its checks.
describe('the poll survives finding nothing new', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())
  // Generous by default: the wait stretches while nothing changes (backoff),
  // so a test that advanced exactly one cadence would miss the next tick.
  const settle = async (ms = 30_000) => { await act(async () => { jest.advanceTimersByTime(ms) }) }

  test('it keeps asking while the answer stays identical', async () => {
    // Same numbers every time: nothing to write, nothing to re-render.
    const githubGetChecks = jest.fn().mockResolvedValue({ checks: { total: 4, passed: 2, failed: 0, pending: 2 } })
    const githubGetPR = jest.fn().mockResolvedValue({ pr: { ...FULL_PR, mergeable: true }, notModified: true })
    draw({}, { githubGetPR, githubGetChecks })
    expect(await screen.findByText('2 of 4 checks pending')).toBeInTheDocument()

    await settle(30_000)
    const after1 = githubGetChecks.mock.calls.length
    await settle(30_000)
    const after2 = githubGetChecks.mock.calls.length
    await settle(30_000)
    const after3 = githubGetChecks.mock.calls.length

    expect(after2).toBeGreaterThan(after1)
    expect(after3).toBeGreaterThan(after2)
  })

  test('and it gets there in the end', async () => {
    const githubGetChecks = jest.fn()
      .mockResolvedValueOnce({ checks: { total: 4, passed: 2, failed: 0, pending: 2 } })
      .mockResolvedValueOnce({ checks: { total: 4, passed: 2, failed: 0, pending: 2 } })
      .mockResolvedValueOnce({ checks: { total: 4, passed: 2, failed: 0, pending: 2 } })
      .mockResolvedValue({ checks: { total: 4, passed: 4, failed: 0, pending: 0 } })
    draw({}, { githubGetChecks })
    await screen.findByText('2 of 4 checks pending')
    for (let i = 0; i < 6; i++) await settle(30_000)
    expect(screen.getByText('4 checks passed')).toBeInTheDocument()
    expect(screen.getByText('Merge Pull Request')).toBeInTheDocument()
  })
})

// Victor asked whether all this polling could slow a modest machine. Measured:
// a conditional request costs ~0.8ms of CPU and ~550ms of waiting, and the
// waiting happens in the main process. What matters instead is that the app
// cannot pile requests on itself, and does not keep asking urgently for ever.
describe('what the polling costs', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())
  const settle = async (ms: number) => { await act(async () => { jest.advanceTimersByTime(ms) }) }

  test('a slow answer cannot make ticks overlap — the next is armed after it', async () => {
    let inFlight = 0
    let overlapped = false
    const githubGetPR = jest.fn().mockImplementation(async () => {
      inFlight += 1
      if (inFlight > 1) overlapped = true
      await Promise.resolve()
      inFlight -= 1
      return { pr: { ...FULL_PR, mergeable: null } }   // never settles
    })
    draw({}, { githubGetPR })
    await screen.findByText('Mergeability still computing…')
    for (let i = 0; i < 10; i++) await settle(30_000)
    expect(overlapped).toBe(false)
  })

  // A check suite can run for twenty minutes. Asking every five seconds for
  // all of it is hundreds of ticks to learn nothing.
  test('an undecided request slows down rather than hammering', async () => {
    const githubGetPR = jest.fn().mockResolvedValue({ pr: { ...FULL_PR, mergeable: null } })
    draw({}, { githubGetPR })
    await screen.findByText('Mergeability still computing…')

    await settle(60_000)
    const firstMinute = githubGetPR.mock.calls.length
    await settle(60_000)
    const secondMinute = githubGetPR.mock.calls.length - firstMinute

    // it keeps watching...
    expect(secondMinute).toBeGreaterThan(0)
    // ...but the first minute, the one somebody watches, is the busiest
    expect(secondMinute).toBeLessThanOrEqual(firstMinute)
    // and it never exceeds the settled cadence once stretched
    expect(secondMinute).toBeLessThanOrEqual(60_000 / 20_000 + 1)
  })
})

// Victor, on a request he had merged and whose branches he had already deleted:
// the pane offered him both mergeability and a cleanup, and the cleanup
// answered with two errors.
describe('a finished request offers only what is left to do', () => {
  const noBranches = { getBranches: jest.fn().mockResolvedValue({ branches: [{ name: 'main', commit: 'deadbee', remote: false }] }) }

  test('a merged request shows no mergeability, and asks for no checks', async () => {
    const { api } = draw({ merged: true, state: 'closed' })
    await screen.findByText('Merged')
    expect(screen.queryByText('MERGEABILITY')).not.toBeInTheDocument()
    expect(screen.queryByText('5 checks passed')).not.toBeInTheDocument()
    // and the request per merged PR opened is not spent
    expect(api.githubGetChecks).not.toHaveBeenCalled()
  })

  // Closed without merging is NOT the same case: it can be reopened, and its
  // checks are still the truth about its head.
  test('a request closed without merging keeps its mergeability', async () => {
    draw({ merged: false, state: 'closed' })
    await screen.findByText('Speed up the graph')
    expect(await screen.findByText('5 checks passed')).toBeInTheDocument()
  })

  test('branches already gone: no cleanup offered at all', async () => {
    draw({ merged: true, state: 'closed' }, noBranches)
    await screen.findByText('Merged')
    await waitFor(() => expect(screen.queryByText('Delete Work Branches')).not.toBeInTheDocument())
    expect(screen.queryByText('Delete Local Branch')).not.toBeInTheDocument()
    expect(screen.queryByText('Delete Remote Branch')).not.toBeInTheDocument()
  })

  test('only the local one left: it says so, and touches only that', async () => {
    const deleteRemoteBranch = jest.fn()
    const deleteBranch = jest.fn().mockResolvedValue({ success: true })
    draw({ merged: true, state: 'closed' }, {
      deleteRemoteBranch, deleteBranch,
      getBranches: jest.fn().mockResolvedValue({
        branches: [{ name: 'feat/speed', commit: 'abc123', remote: false }],
      }),
    })
    await screen.findByText('Merged')
    await userEvent.click(await screen.findByText('Delete Local Branch'))
    await waitFor(() => expect(deleteBranch).toHaveBeenCalledWith('feat/speed'))
    expect(deleteRemoteBranch).not.toHaveBeenCalled()
  })

  test('only the remote one left: the same, the other way round', async () => {
    const deleteRemoteBranch = jest.fn().mockResolvedValue({ success: true })
    const deleteBranch = jest.fn()
    draw({ merged: true, state: 'closed' }, {
      deleteRemoteBranch, deleteBranch,
      getBranches: jest.fn().mockResolvedValue({
        branches: [{ name: 'remotes/origin/feat/speed', commit: 'abc123', remote: true }],
      }),
    })
    await screen.findByText('Merged')
    await userEvent.click(await screen.findByText('Delete Remote Branch'))
    await waitFor(() => expect(deleteRemoteBranch).toHaveBeenCalledWith('feat/speed'))
    expect(deleteBranch).not.toHaveBeenCalled()
  })

  // git's push refusal for a branch that is simply not there is two lines of
  // noise, not a failure.
  test("the remote's own not-there wording reads as absent", async () => {
    draw({ merged: true, state: 'closed' }, {
      deleteRemoteBranch: jest.fn().mockResolvedValue({
        success: false,
        error: "error: unable to delete 'feat/speed': remote ref does not exist\nerror: failed to push some refs",
      }),
      deleteBranch: jest.fn().mockResolvedValue({ success: true }),
    })
    await screen.findByText('Merged')
    await userEvent.click(await screen.findByText('Delete Work Branches'))
    expect(await screen.findByText(/Remote : not found/)).toBeInTheDocument()
  })
})
