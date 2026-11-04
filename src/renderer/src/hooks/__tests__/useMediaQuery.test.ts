import { renderHook, act } from '@testing-library/react'
import { useMediaQuery } from '../useMediaQuery'

// #245 — the toolbar stayed compact at 1300px under an emulated resize: the
// query already matched when asked, but its `change` event never reached the
// hook. The hook now also re-reads the query on `resize`, which is the case
// these tests pin: a viewport that moved without a `change`.

function fakeMedia(initial: boolean) {
  const listeners = new Set<() => void>()
  const media = {
    matches: initial,
    addEventListener: (_: string, fn: () => void) => { listeners.add(fn) },
    removeEventListener: (_: string, fn: () => void) => { listeners.delete(fn) },
  }
  return { media, listeners }
}

const realMatchMedia = window.matchMedia
afterEach(() => { window.matchMedia = realMatchMedia })

test('a change event is still heard', () => {
  const { media, listeners } = fakeMedia(true)
  window.matchMedia = (() => media) as any
  const { result } = renderHook(() => useMediaQuery('(max-width: 1250px)'))
  expect(result.current).toBe(true)
  act(() => { media.matches = false; listeners.forEach(f => f()) })
  expect(result.current).toBe(false)
})

test('a resize with no change event still moves it', () => {
  const { media } = fakeMedia(true)
  window.matchMedia = (() => media) as any
  const { result } = renderHook(() => useMediaQuery('(max-width: 1250px)'))
  expect(result.current).toBe(true)
  act(() => { media.matches = false; window.dispatchEvent(new Event('resize')) })
  expect(result.current).toBe(false)
})

test('both listeners go when the hook unmounts', () => {
  const { media, listeners } = fakeMedia(false)
  window.matchMedia = (() => media) as any
  const remove = jest.spyOn(window, 'removeEventListener')
  const { unmount } = renderHook(() => useMediaQuery('(max-width: 1250px)'))
  expect(listeners.size).toBe(1)
  unmount()
  expect(listeners.size).toBe(0)
  expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
  remove.mockRestore()
})
