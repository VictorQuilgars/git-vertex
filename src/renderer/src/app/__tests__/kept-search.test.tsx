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
