import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

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
const isVSCodeHost = typeof window !== 'undefined' && (window as any).appInfo?.platform === 'vscode'

// Defaults for keys that drive appearance/graph so the UI has sane values
// before the user ever opens preferences.
export const SETTING_DEFAULTS: SettingsMap = {
  accentColor: '#58a6ff',
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
  const accent = s.accentColor || SETTING_DEFAULTS.accentColor
  root.style.setProperty('--accent', accent)
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SettingsMap>(SETTING_DEFAULTS)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    window.gitAPI.settingsGetAll().then((s: SettingsMap) => {
      const merged = { ...SETTING_DEFAULTS, ...s }
      setSettings(merged)
      applyAppearance(merged)
      setReady(true)
    }).catch(() => {
      applyAppearance(SETTING_DEFAULTS)
      setReady(true)
    })
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
