import { act, renderHook, waitFor } from '@testing-library/react'
import { useRepoSession } from '../useRepoSession'
import { installMockGitAPI } from '../../__tests__/test-utils'

// One repository shown, the others kept behind their tabs. A load is bound to
// its path from start to end: a late answer lands in its own snapshot, never
// in whatever repository is shown by then; coming back is a restore.

const commit = (tag: string) => ({ hash: tag.repeat(40).slice(0, 40), shortHash: tag.repeat(7), message: tag, author: '', authorEmail: '', date: '', parents: [], refs: [] })
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

function repoApi(tag: string, logDelay = 0) {
  return {
    getBranches: jest.fn().mockResolvedValue({ branches: [{ name: `${tag}-main`, current: true }] }),
    getLog: jest.fn(async () => { if (logDelay) await wait(logDelay); return { commits: [commit(tag)] } }),
    getStashes: jest.fn().mockResolvedValue({ stashes: [] }),
    getTags: jest.fn().mockResolvedValue({ tags: [] }),
    getConflictedFiles: jest.fn().mockResolvedValue({ files: [] }),
    getConflictMode: jest.fn().mockResolvedValue({ mode: null }),
    getWorkingChanges: jest.fn().mockResolvedValue({ staged: [], unstaged: [], untracked: [] }),
    getTracking: jest.fn().mockResolvedValue({ ahead: 0, behind: 0 }),
  }
}

function setup(delays: Record<string, number> = {}) {
  const apis: Record<string, ReturnType<typeof repoApi>> = {
    '/a': repoApi('a', delays['/a']),
    '/b': repoApi('b', delays['/b']),
  }
  const api = installMockGitAPI({
    session: jest.fn((path: string) => apis[path]),
    setCurrentRepo: jest.fn(),
    closeRepo: jest.fn().mockResolvedValue({ success: true }),
    onRepoChangedAny: jest.fn(() => () => {}),
  })
  const view = renderHook(() => useRepoSession({} as any))
  return { apis, api, view }
}

test('a load that finishes after a switch lands in its own repository, not the shown one', async () => {
  const { apis, view } = setup({ '/a': 60 })
  act(() => view.result.current.setRepoPath('/a'))
  let slow!: Promise<void>
  act(() => { slow = view.result.current.loadRepoData() })
  // Switch to /b while /a's log is still on its way.
  act(() => { view.result.current.saveSnapshot(); view.result.current.restoreSnapshot('/b'); view.result.current.setRepoPath('/b') })
  await act(async () => { await view.result.current.loadRepoData() })
  expect(view.result.current.commits.map(c => c.message)).toEqual(['b'])
  await act(async () => { await slow })
  // /a answered late: the screen still shows /b, and /a's answer is kept for /a.
  expect(view.result.current.commits.map(c => c.message)).toEqual(['b'])
  expect(view.result.current.currentBranch).toBe('b-main')
  expect(apis['/a'].getLog).toHaveBeenCalledTimes(1)
  expect(view.result.current.hasSnapshot('/a')).toBe(true)
  act(() => { view.result.current.restoreSnapshot('/a') })
  expect(view.result.current.commits.map(c => c.message)).toEqual(['a'])
  expect(view.result.current.currentBranch).toBe('a-main')
})

test('coming back to a repository shows what it had, at once, before any call', async () => {
  const { apis, view } = setup()
  act(() => view.result.current.setRepoPath('/a'))
  await act(async () => { await view.result.current.loadRepoData() })
  act(() => { view.result.current.saveSnapshot(); view.result.current.restoreSnapshot('/b'); view.result.current.setRepoPath('/b') })
  await act(async () => { await view.result.current.loadRepoData() })
  const callsBefore = apis['/a'].getLog.mock.calls.length
  act(() => { view.result.current.saveSnapshot() })
  let restored = false
  act(() => { restored = view.result.current.restoreSnapshot('/a') })
  expect(restored).toBe(true)
  expect(view.result.current.commits.map(c => c.message)).toEqual(['a'])
  expect(apis['/a'].getLog).toHaveBeenCalledTimes(callsBefore)
})

test('every plain call is about the shown repository, and a hidden one refreshes into its snapshot', async () => {
  const { api, apis, view } = setup()
  act(() => view.result.current.setRepoPath('/a'))
  expect(api.setCurrentRepo).toHaveBeenLastCalledWith('/a')
  await act(async () => { await view.result.current.loadRepoData() })
  // Switch to /b, which has no snapshot yet: the tab clears the graph, as switchTab does.
  act(() => { view.result.current.saveSnapshot(); if (!view.result.current.restoreSnapshot('/b')) view.result.current.setCommits([]); view.result.current.setRepoPath('/b') })
  expect(api.setCurrentRepo).toHaveBeenLastCalledWith('/b')
  // /a changed while hidden: its refresh is asked of /a and stays out of the screen.
  apis['/a'].getLog.mockResolvedValueOnce({ commits: [commit('a'), commit('c')] })
  await act(async () => { await view.result.current.loadRepoData(true, '/a') })
  expect(view.result.current.commits.map(c => c.message)).toEqual([])   // /b never loaded here
  act(() => { view.result.current.restoreSnapshot('/a') })
  expect(view.result.current.commits.map(c => c.message)).toEqual(['a', 'c'])
})

test('forgetting a repository drops its snapshot and closes its session in the main process', async () => {
  const { api, view } = setup()
  act(() => view.result.current.setRepoPath('/a'))
  await act(async () => { await view.result.current.loadRepoData() })
  act(() => { view.result.current.saveSnapshot() })
  expect(view.result.current.hasSnapshot('/a')).toBe(true)
  act(() => { view.result.current.forgetRepo('/a') })
  expect(view.result.current.hasSnapshot('/a')).toBe(false)
  await waitFor(() => expect(api.closeRepo).toHaveBeenCalledWith('/a'))
})
