// The four acts on a pull request's code, and what each one asks git for (#290).
import { renderHook, act, waitFor } from '@testing-library/react'
import { usePullRequestCode, type PullRequestCodeDeps } from '../usePullRequestCode'
import { installMockGitAPI } from '../../__tests__/test-utils'

const t = (key: string, ...args: any[]) => args.length ? `${key}(${args.join(',')})` : key

function setup(over: Partial<PullRequestCodeDeps> = {}, api: Record<string, any> = {}) {
  installMockGitAPI({
    fetchPullRequest: jest.fn().mockResolvedValue({ success: true, branch: 'pr/42' }),
    selectDirectory: jest.fn().mockResolvedValue({ path: '/wt/pr-42' }),
    addWorktree: jest.fn().mockResolvedValue({ success: true }),
    ...api,
  })
  const deps: PullRequestCodeDeps = {
    t, showToast: jest.fn(), defaultRemote: 'origin',
    onCompare: jest.fn(), onSwitched: jest.fn(), onWorktreeAdded: jest.fn(),
    ...over,
  }
  const { result } = renderHook(() => usePullRequestCode(deps))
  return { run: result.current, deps, api: window.gitAPI as any }
}

const PR = { number: 42, baseRef: 'main' }

test('reading the changes fetches the head and never switches to it', async () => {
  const { run, deps, api } = setup()
  await act(async () => { await run(PR, 'changes') })
  expect(api.fetchPullRequest).toHaveBeenCalledWith(42, { checkout: false })
  // What the request itself shows: what the head did since the two parted.
  expect(deps.onCompare).toHaveBeenCalledWith('origin/main', 'pr/42', 'diverged')
  expect(deps.onSwitched).not.toHaveBeenCalled()
})

test('comparing is the two trees as they stand, not what one of them did', async () => {
  const { run, deps } = setup()
  await act(async () => { await run(PR, 'compare') })
  expect(deps.onCompare).toHaveBeenCalledWith('origin/main', 'pr/42', 'endpoints')
})

test('the base is read from the remote, not from a local branch that may be behind', async () => {
  const { run, deps } = setup({ defaultRemote: 'upstream' })
  await act(async () => { await run(PR, 'changes') })
  expect(deps.onCompare).toHaveBeenCalledWith('upstream/main', 'pr/42', 'diverged')
  // With no base at all, it is measured against where you stand.
  const second = setup()
  await act(async () => { await second.run({ number: 7 }, 'changes') })
  expect(second.deps.onCompare).toHaveBeenCalledWith('HEAD', 'pr/42', 'diverged')
})

test('switching asks for the checkout, and tells the host to reload', async () => {
  const { run, deps, api } = setup()
  await act(async () => { await run(PR, 'switch') })
  expect(api.fetchPullRequest).toHaveBeenCalledWith(42, { checkout: true })
  expect(deps.onSwitched).toHaveBeenCalled()
  expect(deps.onCompare).not.toHaveBeenCalled()
})

test('a worktree is made on the fetched branch, at the folder that was picked', async () => {
  const { run, deps, api } = setup()
  await act(async () => { await run(PR, 'worktree') })
  expect(api.addWorktree).toHaveBeenCalledWith('/wt/pr-42', 'pr/42')
  expect(deps.onWorktreeAdded).toHaveBeenCalled()
})

test('a folder nobody picked makes no worktree', async () => {
  const { run, api } = setup({}, { selectDirectory: jest.fn().mockResolvedValue({ path: undefined }) })
  await act(async () => { await run(PR, 'worktree') })
  expect(api.addWorktree).not.toHaveBeenCalled()
})

test('a fetch that fails outright is reported, and nothing else is attempted', async () => {
  const { run, deps, api } = setup({}, {
    fetchPullRequest: jest.fn().mockResolvedValue({ success: false, error: 'no such request' }),
  })
  await act(async () => { await run(PR, 'changes') })
  expect(deps.showToast).toHaveBeenCalledWith('toast.err(no such request)', 'err')
  expect(deps.onCompare).not.toHaveBeenCalled()
  expect(api.addWorktree).not.toHaveBeenCalled()
})

test('a checkout that fails still says which branch the head landed on', async () => {
  const { run, deps } = setup({}, {
    fetchPullRequest: jest.fn().mockResolvedValue({ success: false, branch: 'pr/42', error: 'local changes' }),
  })
  await act(async () => { await run(PR, 'switch') })
  expect(deps.showToast).toHaveBeenCalledWith('toast.err(local changes)', 'err')
  // The host still reloads: the branch is there whether or not HEAD moved.
  await waitFor(() => expect(deps.onSwitched).toHaveBeenCalled())
})

test('with nowhere to open a comparison, the fetch is still reported', async () => {
  const { run, deps } = setup({ onCompare: undefined })
  await act(async () => { await run(PR, 'changes') })
  expect(deps.showToast).toHaveBeenCalledWith('gh.pr.fetched(pr/42)')
})
