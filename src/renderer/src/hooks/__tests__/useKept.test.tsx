import { act, renderHook, waitFor } from '@testing-library/react'
import { changeKept, decodeKept, readKept, useKept, type KeptEntry } from '../useKept'
import { installMockGitAPI } from '../../__tests__/test-utils'

const comparison: KeptEntry = { id: 'cmp', name: 'Release review', at: 1000, kind: 'comparison', a: 'v1', b: null, axis: 'endpoints', reviewed: [] }
const search: KeptEntry = { id: 'search', name: 'Cache work', at: 2000, kind: 'search', query: 'cache file:src author:Alex', ai: false, hashes: ['host-hit'], requiredHashes: [] }
let settings: Record<string, string>
beforeEach(() => {
  settings = {}
  installMockGitAPI({
    settingsGetAll: jest.fn(async () => ({ ...settings })),
    settingsSet: jest.fn(async (key, value) => { settings[key] = value; return { success: true } }),
  })
})

test('host storage survives a fresh mount and isolates repositories with the same name', async () => {
  await changeKept('/one/repo', () => [comparison, search])
  await changeKept('/two/repo', () => [{ ...comparison, name: 'Other' }])
  const first = renderHook(() => useKept('/one/repo'))
  await waitFor(() => expect(first.result.current.entries).toEqual([comparison, search]))
  first.unmount()
  localStorage.clear()
  const second = renderHook(({ repo }) => useKept(repo), { initialProps: { repo: '/one/repo' } })
  await waitFor(() => expect(second.result.current.entries).toEqual([comparison, search]))
  second.rerender({ repo: '/two/repo' })
  await waitFor(() => expect(second.result.current.entries[0]?.name).toBe('Other'))
})

test('review ticks, rename and removal are persisted without losing another entry', async () => {
  await changeKept('/repo', () => [comparison, search])
  const { result } = renderHook(() => useKept('/repo'))
  await waitFor(() => expect(result.current.entries).toHaveLength(2))
  await act(async () => {
    await Promise.all([result.current.review('cmp', 'src/cache.ts', true), result.current.rename('search', ' Cache changes ')])
  })
  expect(await readKept('/repo')).toEqual([{ ...comparison, reviewed: ['src/cache.ts'] }, { ...search, name: 'Cache changes' }])
  await act(async () => { await result.current.review('cmp', 'src/cache.ts', false); await result.current.remove('search') })
  expect(await readKept('/repo')).toEqual([comparison])
})

test('invalid storage is ignored; failed writes are reported and do not poison later saves', async () => {
  for (const raw of ['bad', '{}', '[null]', '[{"kind":"search"}]']) expect(decodeKept(raw)).toEqual([])
  const { result } = renderHook(() => useKept('/repo'))
  ;(window.gitAPI.settingsSet as jest.Mock).mockRejectedValueOnce(new Error('disk full'))
  await act(async () => { await result.current.rename('absent', 'Name') })
  expect(result.current.error).toBe(true)
  await act(async () => { await changeKept('/repo', () => [search]) })
  expect(await readKept('/repo')).toEqual([search])
})
