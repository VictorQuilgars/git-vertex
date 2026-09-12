import { act, renderHook, waitFor } from '@testing-library/react'
import { useRepoSession } from '../useRepoSession'
import { installMockGitAPI } from '../../__tests__/test-utils'

// One repository shown, the others kept behind their tabs. A load is bound to
// its path from start to end: a late answer lands in its own snapshot, never
// in whatever repository is shown by then; coming back is a restore.

// Each test starts with nothing kept: the graph cache lives in localStorage,
// which jsdom shares across a file, and a repository that another test left
// behind is exactly what "no snapshot yet" must not mean here.
beforeEach(() => { try { localStorage.clear() } catch { /* no storage, nothing kept */ } })

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

// The five waves a refresh used to be are the refresh, on a machine where
// starting git costs more than running it. Nothing here depends on anything
// else, so nothing waits: the log is held back 40 ms and every other question
// has already left by then. Under the old order getStashes would not have been
// asked yet — it waited for the log.
test('a refresh asks for everything at once', async () => {
  const { apis, view } = setup({ '/a': 40 })
  act(() => view.result.current.setRepoPath('/a'))
  let load!: Promise<void>
  act(() => { load = view.result.current.loadRepoData() })
  const a = apis['/a']
  for (const asked of [a.getBranches, a.getLog, a.getStashes, a.getTags, a.getConflictedFiles, a.getConflictMode, a.getWorkingChanges]) {
    expect(asked).toHaveBeenCalled()
  }
  await act(async () => { await load })
})

// getTracking spent three more processes — rev-parse HEAD, rev-parse @{u}, a
// rev-list walk — recomputing what getBranches already read for every branch
// in one for-each-ref.
test('ahead/behind comes off the current branch, with no second question', async () => {
  const { apis, view } = setup()
  apis['/a'].getBranches.mockResolvedValue({ branches: [
    { name: 'a-main', current: true, ahead: 2, behind: 3 },
    { name: 'other', current: false, ahead: 9, behind: 9 },
  ] })
  act(() => view.result.current.setRepoPath('/a'))
  await act(async () => { await view.result.current.loadRepoData() })
  expect(view.result.current.tracking).toEqual({ ahead: 2, behind: 3 })
  expect(apis['/a'].getTracking).not.toHaveBeenCalled()
})

test('a branch in sync, or a detached HEAD, is zero and zero', async () => {
  const { apis, view } = setup()
  apis['/a'].getBranches.mockResolvedValue({ branches: [{ name: 'detached at 1a2b3c4', current: true, detached: true }] })
  act(() => view.result.current.setRepoPath('/a'))
  await act(async () => { await view.result.current.loadRepoData() })
  expect(view.result.current.tracking).toEqual({ ahead: 0, behind: 0 })
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

// The first frame of the next launch. A window that opens on a repository it
// has seen before draws the graph it had, at once, with no call made — and the
// refresh that follows is silent because something correct-looking is already
// there.
test('a repository seen in an earlier run is drawn before anything is asked', async () => {
  const first = setup()
  act(() => first.view.result.current.setRepoPath('/a'))
  await act(async () => { await first.view.result.current.loadRepoData() })
  act(() => { first.view.result.current.saveSnapshot() })
  first.view.unmount()

  // A new hook, as after a relaunch: nothing in memory, only what was kept.
  const next = setup()
  expect(next.view.result.current.hasSnapshot('/a')).toBe(true)
  let restored = false
  act(() => { restored = next.view.result.current.restoreSnapshot('/a') })
  expect(restored).toBe(true)
  expect(next.view.result.current.commits.map(c => c.message)).toEqual(['a'])
  expect(next.view.result.current.currentBranch).toBe('a-main')
  expect(next.apis['/a'].getLog).not.toHaveBeenCalled()
})

// What the working tree is doing is not kept: it changes while the app is
// closed, and a stale conflict banner is a wrong statement rather than a
// slightly old graph. The refresh is making that `git status` anyway.
test('the restored graph says nothing about the working tree', async () => {
  const first = setup()
  first.apis['/a'].getConflictedFiles.mockResolvedValue({ files: ['clash.txt'] })
  first.apis['/a'].getWorkingChanges.mockResolvedValue({ staged: ['a'], unstaged: [], untracked: [] })
  act(() => first.view.result.current.setRepoPath('/a'))
  await act(async () => { await first.view.result.current.loadRepoData() })
  expect(first.view.result.current.conflictFiles).toEqual(['clash.txt'])
  act(() => { first.view.result.current.saveSnapshot() })
  first.view.unmount()

  const next = setup()
  act(() => { next.view.result.current.restoreSnapshot('/a') })
  expect(next.view.result.current.commits.map(c => c.message)).toEqual(['a'])
  expect(next.view.result.current.conflictFiles).toEqual([])
  expect(next.view.result.current.wipCount).toBe(0)
})

// Closing a repository means closing it: it must not come back, drawn from
// last week, the next time it is opened from the recents.
test('a repository that was forgotten is not drawn from the cache either', async () => {
  const first = setup()
  act(() => first.view.result.current.setRepoPath('/a'))
  await act(async () => { await first.view.result.current.loadRepoData() })
  act(() => { first.view.result.current.saveSnapshot() })
  act(() => { first.view.result.current.forgetRepo('/a') })
  first.view.unmount()

  const next = setup()
  expect(next.view.result.current.hasSnapshot('/a')).toBe(false)
  let restored = true
  act(() => { restored = next.view.result.current.restoreSnapshot('/a') })
  expect(restored).toBe(false)
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

describe('a toast says which repository it is about, when that is not the one shown', () => {
  test('an operation started on one tab reports after a switch with that repository\'s name', () => {
    const chromeToast = jest.fn()
    installMockGitAPI({ session: jest.fn(() => repoApi('x')), setCurrentRepo: jest.fn(), onRepoChangedAny: jest.fn(() => () => {}) })
    const view = renderHook(() => useRepoSession({ showToast: chromeToast } as any))
    act(() => view.result.current.setRepoPath('/work/alpha'))
    // The handler that started the push holds the showToast of this render.
    const toastFromAlpha = view.result.current.showToast
    act(() => view.result.current.setRepoPath('/work/beta'))
    toastFromAlpha('Pushed', 'ok')
    expect(chromeToast).toHaveBeenLastCalledWith('alpha · Pushed', 'ok', undefined, undefined)
    // The one made for the repository shown now says nothing more.
    view.result.current.showToast('Hello', 'ok')
    expect(chromeToast).toHaveBeenLastCalledWith('Hello', 'ok', undefined, undefined)
  })

  test('what arrives from the main process names its repository explicitly', () => {
    const chromeToast = jest.fn()
    installMockGitAPI({ session: jest.fn(() => repoApi('x')), setCurrentRepo: jest.fn(), onRepoChangedAny: jest.fn(() => () => {}) })
    const view = renderHook(() => useRepoSession({ showToast: chromeToast } as any))
    act(() => view.result.current.setRepoPath('/work/beta'))
    view.result.current.showToast('Auto-fetch failed: offline', 'err', undefined, undefined, '/work/alpha')
    expect(chromeToast).toHaveBeenLastCalledWith('alpha · Auto-fetch failed: offline', 'err', undefined, undefined)
    view.result.current.showToast('Auto-fetch failed: offline', 'err', undefined, undefined, '/work/beta')
    expect(chromeToast).toHaveBeenLastCalledWith('Auto-fetch failed: offline', 'err', undefined, undefined)
    // No repository shown at all: nothing to compare against, nothing added.
    act(() => view.result.current.setRepoPath(null))
    view.result.current.showToast('Saved', 'ok')
    expect(chromeToast).toHaveBeenLastCalledWith('Saved', 'ok', undefined, undefined)
  })
})
