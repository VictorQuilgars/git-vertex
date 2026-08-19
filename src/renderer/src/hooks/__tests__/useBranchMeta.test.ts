import { act, renderHook } from '@testing-library/react'
import { useBranchMeta } from '../useBranchMeta'

const KEY = (repo: string) => `gv-branch-meta:${repo}`

beforeEach(() => localStorage.clear())

describe('useBranchMeta (v1.21.0)', () => {
  test('starts empty for an unknown repo', () => {
    const { result } = renderHook(() => useBranchMeta('/repo/a'))
    expect(result.current.isFavorite('main')).toBe(false)
    expect(result.current.issueFor('main')).toBeNull()
  })

  test('toggling a favorite survives a remount', () => {
    const { result, unmount } = renderHook(() => useBranchMeta('/repo/a'))
    act(() => result.current.toggleFavorite('feature/x'))
    expect(result.current.isFavorite('feature/x')).toBe(true)
    unmount()

    const again = renderHook(() => useBranchMeta('/repo/a'))
    expect(again.result.current.isFavorite('feature/x')).toBe(true)
  })

  test('toggling twice removes the favorite', () => {
    const { result } = renderHook(() => useBranchMeta('/repo/a'))
    act(() => result.current.toggleFavorite('feature/x'))
    act(() => result.current.toggleFavorite('feature/x'))
    expect(result.current.isFavorite('feature/x')).toBe(false)
    expect(JSON.parse(localStorage.getItem(KEY('/repo/a'))!).favorites).toEqual([])
  })

  test('metadata is scoped per repo — one repo never leaks into another', () => {
    const a = renderHook(() => useBranchMeta('/repo/a'))
    act(() => a.result.current.toggleFavorite('main'))

    const b = renderHook(() => useBranchMeta('/repo/b'))
    expect(b.result.current.isFavorite('main')).toBe(false)
    expect(a.result.current.isFavorite('main')).toBe(true)
  })

  test('switching repos swaps the whole set', () => {
    const first = renderHook(() => useBranchMeta('/repo/a'))
    act(() => first.result.current.setIssue('main', { provider: 'github', key: '7' }))
    first.unmount()

    const { result, rerender } = renderHook(({ repo }) => useBranchMeta(repo), {
      initialProps: { repo: '/repo/a' },
    })
    expect(result.current.issueFor('main')).toEqual({ provider: 'github', key: '7' })
    rerender({ repo: '/repo/b' })
    expect(result.current.issueFor('main')).toBeNull()
  })

  test('an issue can be linked, replaced and cleared', () => {
    const { result } = renderHook(() => useBranchMeta('/repo/a'))
    act(() => result.current.setIssue('feature/x', { number: 42, title: 'Login bug' }))
    expect(result.current.issueFor('feature/x')).toEqual({ number: 42, title: 'Login bug' })

    act(() => result.current.setIssue('feature/x', { number: 43 }))
    expect(result.current.issueFor('feature/x')).toEqual({ number: 43 })

    act(() => result.current.setIssue('feature/x', null))
    expect(result.current.issueFor('feature/x')).toBeNull()
  })

  test('a null repo path is inert rather than writing a junk key', () => {
    const { result } = renderHook(() => useBranchMeta(null))
    act(() => result.current.toggleFavorite('main'))
    expect(localStorage.length).toBe(0)
  })

  test('corrupt stored JSON degrades to empty instead of throwing', () => {
    localStorage.setItem(KEY('/repo/a'), '{not json')
    const { result } = renderHook(() => useBranchMeta('/repo/a'))
    expect(result.current.isFavorite('main')).toBe(false)
  })

  test('a stored object of the wrong shape is tolerated field by field', () => {
    localStorage.setItem(KEY('/repo/a'), JSON.stringify({ favorites: 'nope', issues: 5 }))
    const { result } = renderHook(() => useBranchMeta('/repo/a'))
    expect(result.current.isFavorite('main')).toBe(false)
    expect(result.current.issueFor('main')).toBeNull()
    // And it still accepts new writes afterwards.
    act(() => result.current.toggleFavorite('main'))
    expect(result.current.isFavorite('main')).toBe(true)
  })

  // The shape changed when a reference stopped being a GitHub number. Anything
  // written by a version before that is still on disk, and a branch that had an
  // issue linked must still show it.
  test('a reference stored under the old shape still reads', () => {
    localStorage.setItem(KEY('/repo/old'), JSON.stringify({
      favorites: ['main'],
      issues: { main: { number: 7, title: 'Login bug', url: 'https://x/7' } },
    }))
    const { result } = renderHook(() => useBranchMeta('/repo/old'))
    expect(result.current.issueFor('main'))
      .toEqual({ provider: 'github', key: '7', title: 'Login bug', url: 'https://x/7' })
    expect(result.current.isFavorite('main')).toBe(true)
  })

  // One unreadable entry is one branch without a link, not a repository whose
  // favourites and links all vanish.
  test('an unreadable entry costs that entry alone', () => {
    localStorage.setItem(KEY('/repo/junk'), JSON.stringify({
      favorites: ['main'],
      issues: { main: { nonsense: true }, dev: { key: 'PROJ-1', provider: 'other' } },
    }))
    const { result } = renderHook(() => useBranchMeta('/repo/junk'))
    expect(result.current.issueFor('main')).toBeNull()
    expect(result.current.issueFor('dev')).toEqual({ provider: 'other', key: 'PROJ-1' })
    expect(result.current.isFavorite('main')).toBe(true)
  })
})
