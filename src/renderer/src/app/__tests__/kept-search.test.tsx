import { act, renderHook } from '@testing-library/react'
import { useAppSearch } from '../useAppSearch'
import { useKeptSearch } from '../../hooks/useKeptSearch'
import { installMockGitAPI } from '../../__tests__/test-utils'
import { emptyVisibility } from '../../utils/graphVisibility'
import type { KeptEntry } from '../../hooks/useKept'

const entry: KeptEntry = { id: 'search', name: 'Cache', at: 1000, kind: 'search', query: 'cache file:src/cache.ts author:Alex', ai: false, hashes: ['diff-hit'], requiredHashes: [] }

test('desktop reopening restores text, operators and exact host results, until edited', () => {
  const api = installMockGitAPI({ searchByFile: jest.fn().mockResolvedValue({ hashes: [] }) })
  const app = {
    repoPath: '/repo', commits: [], branches: [], stashes: [], tags: [], notedHashes: null,
    aiSearch: false, aiSearchHashes: null, setAiSearch: jest.fn(), setAiSearchHashes: jest.fn(), setAiSearchLoading: jest.fn(),
    t: (key: string) => key, showToast: jest.fn(), setSelectedCommit: jest.fn(),
    logLimitRef: { current: 500 }, showAllRef: { current: true }, soloRef: { current: null },
    visibilityRef: { current: emptyVisibility() },
  }
  const { result } = renderHook(() => useAppSearch(app as any))
  act(() => result.current.restoreSearch(entry))
  expect(result.current.searchQuery).toBe(entry.query)
  expect(result.current.graphSearchHashes).toEqual(new Set(['diff-hit']))
  expect(result.current.requiredSearchHashes).toEqual(new Set())
  expect(api.searchByFile).not.toHaveBeenCalled()
  act(() => result.current.setSearchQuery('new query'))
  expect(result.current.graphSearchHashes).toBeNull()
  expect(result.current.requiredSearchHashes).toBeNull()
})

test('shared restoration used by the VS Code panel cannot leak results to another repository', () => {
  const { result, rerender } = renderHook(({ repo }) => useKeptSearch(repo), { initialProps: { repo: '/one/repo' } })
  act(() => result.current.restore(entry))
  expect(result.current.restored).toEqual(entry)
  rerender({ repo: '/two/repo' })
  expect(result.current.restored).toBeNull()
  act(() => result.current.clear())
  rerender({ repo: '/one/repo' })
  expect(result.current.restored).toBeNull()
})

// ── Asking is not a mode one arms ───────────────────────────────────────────
// `aiSearch` used to be a switch thrown BEFORE typing, which is why the only
// way to find it was a button. It is now what the graph is showing: the model
// answered. Editing the query is what leaves it, and gives back the live text
// filter that typing wants.
function searchHook(over: Record<string, any> = {}) {
  const app = {
    repoPath: '/repo', commits: [], branches: [], stashes: [], tags: [], notedHashes: null,
    setNotedHashes: jest.fn(), tabs: [{ id: 'a', kind: 'repo', path: '/repo' }, { id: 'b', kind: 'repo', path: '/other' }],
    aiSearch: false, aiSearchHashes: null, setAiSearch: jest.fn(), setAiSearchHashes: jest.fn(), setAiSearchLoading: jest.fn(),
    t: (key: string) => key, showToast: jest.fn(), setSelectedCommit: jest.fn(),
    logLimitRef: { current: 500 }, showAllRef: { current: true }, soloRef: { current: null },
    visibilityRef: { current: emptyVisibility() },
    ...over,
  }
  return { app, hook: renderHook(() => useAppSearch(app as any)) }
}

test('the model answering is what turns the AI reading on', async () => {
  installMockGitAPI({ aiSearchCommits: jest.fn().mockResolvedValue({ hashes: ['a1', 'b2'] }) })
  const { app, hook } = searchHook()
  act(() => hook.result.current.setSearchQuery('what broke the build'))
  // Typing does not ask, and does not pretend an answer is on screen.
  expect(app.setAiSearch).toHaveBeenLastCalledWith(false)
  await act(async () => { await hook.result.current.runAiSearch() })
  expect(app.setAiSearch).toHaveBeenLastCalledWith(true)
  expect(app.setAiSearchHashes).toHaveBeenLastCalledWith(new Set(['a1', 'b2']))
})

test('a model that cannot answer leaves the filter alone rather than emptying the graph', async () => {
  installMockGitAPI({ aiSearchCommits: jest.fn().mockResolvedValue({ error: 'NO_API_KEY' }) })
  const { app, hook } = searchHook()
  act(() => hook.result.current.setSearchQuery('what broke the build'))
  await act(async () => { await hook.result.current.runAiSearch() })
  expect(app.setAiSearch).not.toHaveBeenCalledWith(true)
  expect(app.showToast).toHaveBeenCalledWith('toast.noAiKey', 'err')
})

test('editing the query after an answer comes back to filtering', () => {
  installMockGitAPI()
  const { app, hook } = searchHook({ aiSearch: true, aiSearchHashes: new Set(['a1']) })
  act(() => hook.result.current.setSearchQuery('cache'))
  expect(app.setAiSearch).toHaveBeenCalledWith(false)
  expect(app.setAiSearchHashes).toHaveBeenCalledWith(null)
})


// ── A search is about a repository, not about the window ────────────────────
// Switching tabs used to leave the words typed in the repository you had just
// left sitting in the field: the graph of the new one opened greyed out under
// a query nobody had typed for it, and its count read 0.
test('the search goes with the repository it was typed in, and comes back with it', () => {
  installMockGitAPI()
  const app: Record<string, any> = {
    repoPath: '/one', commits: [], branches: [], stashes: [], tags: [], notedHashes: null,
    setNotedHashes: jest.fn(), tabs: [{ id: 'a', kind: 'repo', path: '/one' }, { id: 'b', kind: 'repo', path: '/two' }],
    aiSearch: false, aiSearchHashes: null, setAiSearch: jest.fn(), setAiSearchHashes: jest.fn(), setAiSearchLoading: jest.fn(),
    t: (key: string) => key, showToast: jest.fn(), setSelectedCommit: jest.fn(),
    logLimitRef: { current: 500 }, showAllRef: { current: true }, soloRef: { current: null },
    visibilityRef: { current: emptyVisibility() },
  }
  const { result, rerender } = renderHook(() => useAppSearch(app as any))
  act(() => result.current.setSearchQuery('fix'))
  act(() => result.current.setExtendedSearch(true))
  expect(result.current.searchQuery).toBe('fix')

  app.repoPath = '/two'
  rerender()
  expect(result.current.searchQuery).toBe('')
  expect(result.current.extendedSearch).toBe(false)
  // What the graph is given with it: no host hits, and no noted set either.
  expect(app.setAiSearchHashes).toHaveBeenLastCalledWith(null)
  expect(app.setNotedHashes).toHaveBeenLastCalledWith(null)

  app.repoPath = '/one'
  rerender()
  expect(result.current.searchQuery).toBe('fix')
  expect(result.current.extendedSearch).toBe(true)
})

test('a repository whose tab was closed is not searched again on its return', () => {
  installMockGitAPI()
  const app: Record<string, any> = {
    repoPath: '/one', commits: [], branches: [], stashes: [], tags: [], notedHashes: null,
    setNotedHashes: jest.fn(), tabs: [{ id: 'a', kind: 'repo', path: '/one' }, { id: 'b', kind: 'repo', path: '/two' }],
    aiSearch: false, aiSearchHashes: null, setAiSearch: jest.fn(), setAiSearchHashes: jest.fn(), setAiSearchLoading: jest.fn(),
    t: (key: string) => key, showToast: jest.fn(), setSelectedCommit: jest.fn(),
    logLimitRef: { current: 500 }, showAllRef: { current: true }, soloRef: { current: null },
    visibilityRef: { current: emptyVisibility() },
  }
  const { result, rerender } = renderHook(() => useAppSearch(app as any))
  act(() => result.current.setSearchQuery('fix'))
  // Its tab is closed while it is the one on screen: leaving it, nothing is kept.
  app.tabs = [{ id: 'b', kind: 'repo', path: '/two' }]
  app.repoPath = '/two'
  rerender()
  app.tabs = [{ id: 'b', kind: 'repo', path: '/two' }, { id: 'c', kind: 'repo', path: '/one' }]
  app.repoPath = '/one'
  rerender()
  expect(result.current.searchQuery).toBe('')
})
