import { useSyncExternalStore } from 'react'

// Whether the theme builder's drawer is open, and what it starts from (#242).
//
// A module-level store rather than a provider, on purpose: the drawer is
// mounted once at each product's root and opened from the settings page,
// which sits several components away in a tab of its own. Threading a prop
// through the tab strip for one boolean is more plumbing than the feature.

export interface BuilderState {
  open: boolean
  /** The theme to start from — a built-in or installed id — or null for the current one. */
  from: string | null
}

let state: BuilderState = { open: false, from: null }
const listeners = new Set<() => void>()
const emit = (): void => { for (const l of listeners) l() }

export function openThemeBuilder(from: string | null = null): void {
  state = { open: true, from }
  emit()
}

export function closeThemeBuilder(): void {
  state = { open: false, from: null }
  emit()
}

export function useThemeBuilder(): BuilderState {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => state,
    () => state,
  )
}
