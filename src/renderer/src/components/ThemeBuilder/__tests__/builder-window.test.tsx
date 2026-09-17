import { act, renderHook } from '@testing-library/react'
import { useBuilderWindow } from '../useBuilderWindow'

test('detach, native close, re-detach and unmount clean up the window', () => {
  const doc = document.implementation.createHTMLDocument()
  const events = new EventTarget()
  const close = jest.fn()
  const win = { document: doc, close, closed: false, focus: jest.fn(),
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) }
  const open = jest.spyOn(window, 'open').mockReturnValue(win as unknown as Window)
  const { result, unmount } = renderHook(() => useBuilderWindow())
  act(() => result.current.detach())
  expect(result.current.container?.ownerDocument).toBe(doc)
  act(() => events.dispatchEvent(new Event('beforeunload')))
  expect(result.current.container).toBeNull()
  act(() => result.current.detach())
  act(() => result.current.attach())
  expect(result.current.container).toBeNull()
  expect(close).toHaveBeenCalledTimes(1)
  act(() => result.current.detach())
  unmount()
  expect(close).toHaveBeenCalledTimes(2)
  open.mockRestore()
})

test('a blocked popup leaves the floating editor available', () => {
  const open = jest.spyOn(window, 'open').mockReturnValue(null)
  const { result, unmount } = renderHook(() => useBuilderWindow())
  act(() => result.current.detach())
  expect(result.current.container).toBeNull()
  unmount(); open.mockRestore()
})
