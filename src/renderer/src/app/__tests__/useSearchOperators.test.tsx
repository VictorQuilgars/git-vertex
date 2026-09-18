import { act, renderHook } from '@testing-library/react'
import { useSearchOperators } from '../useSearchOperators'
import { installMockGitAPI } from '../../__tests__/test-utils'

// `file:` is the one operator git answers. The hook asks once per set of
// paths, when the hand stops, and hands back the hashes a row has to be among.

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())
const settle = async () => { await act(async () => { jest.advanceTimersByTime(300); await Promise.resolve() }) }

test('no file: operator asks git nothing, and requires nothing', async () => {
  const searchByFile = jest.fn()
  installMockGitAPI({ searchByFile } as any)
  const { result } = renderHook(() => useSearchOperators('author:ana after:2w cache', '/repo'))
  await settle()
  expect(searchByFile).not.toHaveBeenCalled()
  expect(result.current.requiredHashes).toBeNull()
  expect(result.current.freeText).toBe('cache')
})

test('file: asks git for the paths — all of them at once — and the answer is what a row has to be among', async () => {
  const searchByFile = jest.fn().mockResolvedValue({ hashes: ['h1', 'h2'] })
  installMockGitAPI({ searchByFile } as any)
  const { result } = renderHook(() => useSearchOperators('file:src/main file:"my docs" cache', '/repo'))
  // Not yet answered: nothing is required, so the graph narrows by the rest and waits.
  expect(result.current.requiredHashes).toBeNull()
  expect(result.current.loading).toBe(true)
  await settle()
  expect(searchByFile).toHaveBeenCalledTimes(1)
  expect(searchByFile).toHaveBeenCalledWith(['src/main', 'my docs'])
  expect([...result.current.requiredHashes!]).toEqual(['h1', 'h2'])
  expect(result.current.loading).toBe(false)
})

test('typing the rest of the query does not ask again; changing the path does; clearing it lets go', async () => {
  const searchByFile = jest.fn().mockResolvedValue({ hashes: ['h1'] })
  installMockGitAPI({ searchByFile } as any)
  const { result, rerender } = renderHook(({ q }) => useSearchOperators(q, '/repo'), { initialProps: { q: 'file:src' } })
  await settle()
  rerender({ q: 'file:src cache key' }); await settle()
  expect(searchByFile).toHaveBeenCalledTimes(1)
  rerender({ q: 'file:src/main cache key' }); await settle()
  expect(searchByFile).toHaveBeenCalledTimes(2)
  rerender({ q: 'cache key' }); await settle()
  expect(result.current.requiredHashes).toBeNull()
})

test('a search that fails matches nothing, rather than everything', async () => {
  installMockGitAPI({ searchByFile: jest.fn().mockRejectedValue(new Error('boom')) } as any)
  const { result } = renderHook(() => useSearchOperators('file:src', '/repo'))
  await settle()
  expect(result.current.requiredHashes?.size).toBe(0)
})
