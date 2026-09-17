import { act, renderHook } from '@testing-library/react'
import { openThemeBuilder, closeThemeBuilder, useThemeBuilder } from '../builderStore'

// The drawer's switch (#242): one store, read by the root, flipped from the settings page.

test('opens with what it starts from, and closes clean', () => {
  const { result } = renderHook(() => useThemeBuilder())
  expect(result.current).toEqual({ open: false, from: null })
  act(() => openThemeBuilder('dracula-theme'))
  expect(result.current).toEqual({ open: true, from: 'dracula-theme' })
  act(() => openThemeBuilder())
  expect(result.current).toEqual({ open: true, from: null })
  act(() => closeThemeBuilder())
  expect(result.current).toEqual({ open: false, from: null })
})
