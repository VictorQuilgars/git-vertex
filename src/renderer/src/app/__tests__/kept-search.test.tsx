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
