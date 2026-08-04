import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { resetThemeCache } from '../components/CommitGraph/graph-layout'

// Centralized app settings. Loads everything once from the main process, exposes
// a typed getter helper + a setter that persists and updates live, and applies
// appearance settings (accent color, etc.) to the document root so the whole UI
// reacts immediately — live preferences.

export type SettingsMap = Record<string, string>

interface SettingsContextValue {
  settings: SettingsMap
  ready: boolean
  set: (key: string, value: string) => void
  get: (key: string, fallback?: string) => string
  getBool: (key: string, fallback?: boolean) => boolean
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

// Same convention as the `isMac` checks in App.tsx/Toolbar.tsx — the VS Code
// shim sets window.appInfo.platform to 'vscode' (see gitApiShim.ts).
export const isVSCodeHost =
  typeof window !== 'undefined' && (window as any).appInfo?.platform === 'vscode'

/** Every theme tokens.css defines. A theme is a `[data-theme]` block of seeds. */
export const THEMES = ['aqua-dark', 'aqua-light'] as const
export type ThemeId = (typeof THEMES)[number]

/** Mirrors the chosen theme so main.tsx can apply it before React mounts. */
export const THEME_STORAGE_KEY = 'gv-theme'

/**
 * In the panel we do not offer a theme at all — we follow the editor's, which is
 * what an extension is expected to do. VS Code puts `vscode-light`,
 * `vscode-dark` or `vscode-high-contrast` on <body>, and it changes there the
 * moment the user switches, so `watchHostTheme` below re-reads it.
 */
function resolveTheme(s: SettingsMap): ThemeId {
  if (isVSCodeHost && typeof document !== 'undefined') {
    return document.body.classList.contains('vscode-light') ? 'aqua-light' : 'aqua-dark'
  }
  const want = s.theme as ThemeId
  return THEMES.includes(want) ? want : (SETTING_DEFAULTS.theme as ThemeId)
}

// Defaults for keys that drive appearance/graph so the UI has sane values
// before the user ever opens preferences.
export const SETTING_DEFAULTS: SettingsMap = {
  theme: 'aqua-dark',
  accentColor: 'var(--accent-static)',
  dateFormat: 'relative',          // 'relative' | 'absolute'
  graphShowAvatars: 'true',
  graphShowAuthor: 'true',
  graphShowDate: 'true',
  graphShowSha: 'true',
  // Off by default in the VS Code panel — narrower real estate than the
  // desktop window, and the stat bar is more of a "nice to have" there.
  graphShowStats: isVSCodeHost ? 'false' : 'true',
  graphCompactColumns: 'false',
}

function applyAppearance(s: SettingsMap) {
  const root = document.documentElement
  // Theme first: it rewrites the seeds, and the accent below may point at one
  // of them (`var(--accent-static)` is the default, so the accent follows the
  // theme unless the user has pinned a colour of their own).
  const theme = resolveTheme(s)
  root.dataset.theme = theme
  try { localStorage.setItem(THEME_STORAGE_KEY, theme) } catch { /* private mode */ }

  const accent = s.accentColor || SETTING_DEFAULTS.accentColor
  root.style.setProperty('--accent', accent)
  // The graph resolves --lane-n and --bg-canvas to literals once and caches
  // them, because it does arithmetic on them. Anything that rewrites tokens on
  // <html> has to drop that cache, or the graph keeps painting the old theme.
  resetThemeCache()
}

/**
 * Re-apply when VS Code's own theme changes under us. Returns a teardown.
 * A no-op outside the panel, where nothing changes <body>'s classes.
 */
function watchHostTheme(onChange: () => void): () => void {
  if (!isVSCodeHost || typeof MutationObserver === 'undefined') return () => {}
  const obs = new MutationObserver(onChange)
  obs.observe(document.body, { attributes: true, attributeFilter: ['class'] })
  return () => obs.disconnect()
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SettingsMap>(SETTING_DEFAULTS)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let current = SETTING_DEFAULTS
    window.gitAPI.settingsGetAll().then((s: SettingsMap) => {
      current = { ...SETTING_DEFAULTS, ...s }
      setSettings(current)
      applyAppearance(current)
      setReady(true)
    }).catch(() => {
      applyAppearance(SETTING_DEFAULTS)
      setReady(true)
    })
    return watchHostTheme(() => applyAppearance(current))
  }, [])

  const set = useCallback((key: string, value: string) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      applyAppearance(next)
      return next
    })
    window.gitAPI.settingsSet(key, value)
  }, [])

  const get = useCallback(
    (key: string, fallback = '') => settings[key] ?? fallback,
    [settings]
  )
  const getBool = useCallback(
    (key: string, fallback = false) => {
      const v = settings[key]
      return v === undefined ? fallback : v === 'true'
    },
    [settings]
  )

  return (
    <SettingsContext.Provider value={{ settings, ready, set, get, getBool }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider')
  return ctx
}
