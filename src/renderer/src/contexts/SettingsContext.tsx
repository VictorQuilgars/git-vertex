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
export const BUILT_IN_THEMES = [
  'aqua-dark', 'aqua-light',
  // Imported — see the IMPORTED THEMES block in tokens.css.
  'one-dark-pro', 'catppuccin-frappe', 'gitpod-dark', 'dracula-theme',
  'github-dark', 'monokai-dimmed', 'monokai', 'vscode-dark',
  'vscode-red', 'kimbie-dark', 'solarized-dark', 'abyss',
  'tomorrow-night-blue', 'gruvbox-dark-hard', 'ayu-dark', 'atom-one-dark',
  'tokyo-night', 'rose-pine', 'night-owl', 'community-material-theme',
  'powershell-ise', 'catppuccin-latte', 'gitpod-light', 'github-light',
  'quiet-light', 'vscode-light', 'solarized-light', 'gruvbox-light-hard',
  'ayu-light', 'tokyo-night-light',
] as const

/** One of the 32 in tokens.css. A literal union, so a typo is a compile error. */
export type BuiltInTheme = (typeof BUILT_IN_THEMES)[number]

/**
 * A theme id: built-in OR installed.
 *
 * Deliberately widened to `string`. An installed theme's id is a runtime value
 * that arrives from the server, so it cannot be a member of a compile-time
 * union — and if this stayed narrow, `resolveTheme` would reject every
 * downloaded theme and the choice would revert to aqua-dark on each restart.
 * The safety that the union used to give is now `resolveTheme`'s job, which
 * accepts only BUILT_IN_THEMES ∪ installed and falls back otherwise.
 */
export type ThemeId = string

/** @deprecated Use BUILT_IN_THEMES. Kept so an out-of-tree import still builds. */
export const THEMES = BUILT_IN_THEMES

/** Mirrors the chosen theme so main.tsx can apply it before React mounts. */
export const THEME_STORAGE_KEY = 'gv-theme'

/**
 * Mirrors the SEEDS of an installed theme, next to its id.
 *
 * An installed theme has no `[data-theme]` block in tokens.css, so setting the
 * attribute alone selects nothing and the first frame paints unstyled. main.tsx
 * reads this and injects a real rule before React mounts.
 */
export const THEME_SEEDS_KEY = 'gv-theme-seeds'

/** Installed themes, kept in module state so resolveTheme can see them without
 *  a round trip. Set once the main process answers. */
let installedThemes: InstalledThemeInfo[] = []

export interface InstalledThemeInfo {
  id: string
  name: string
  dark: boolean
  lic: string
  src: string
  srcUrl: string
  notice: string
  seeds: Record<string, string>
}

export function getInstalledThemes(): InstalledThemeInfo[] { return installedThemes }

/**
 * Which theme to paint.
 *
 * In the panel the default is still to follow the editor — a panel that does
 * not match the editor around it reads as broken, and following it is what an
 * extension is expected to do. VS Code puts `vscode-light`, `vscode-dark` or
 * `vscode-high-contrast` on <body> and changes it the moment the user
 * switches, so `watchHostTheme` below re-reads it.
 *
 * Turning `panelFollowEditorTheme` off is the user saying "I want my own", and
 * only then does the picker apply. The desktop has no editor to follow and
 * ignores the setting entirely.
 *
 * Unknown ids fall back to the default rather than painting nothing. That is
 * what makes a stale id harmless — a theme removed from the bank, or an
 * installed file that failed validation and was discarded, leaves a settings
 * value pointing at nothing.
 */
export function resolveTheme(s: SettingsMap): ThemeId {
  if (isVSCodeHost && typeof document !== 'undefined' && followsEditor(s)) {
    return document.body.classList.contains('vscode-light') ? 'aqua-light' : 'aqua-dark'
  }
  const want = s.theme
  if ((BUILT_IN_THEMES as readonly string[]).includes(want)) return want
  if (installedThemes.some(t => t.id === want)) return want
  return SETTING_DEFAULTS.theme
}

/** Only meaningful in the panel; the desktop has no editor to follow. */
export function followsEditor(s: SettingsMap): boolean {
  if (!isVSCodeHost) return false
  return (s.panelFollowEditorTheme ?? SETTING_DEFAULTS.panelFollowEditorTheme) !== 'false'
}

/**
 * Writes one `<style>` holding a `[data-theme]` rule per installed theme.
 *
 * A rule, not inline custom properties on <html>, and the reason is the picker:
 * tokens.css derives ~90 tokens with `color-mix()` at `:root`, and a custom
 * property's `var()` is substituted on the element where it is DECLARED. Seeds
 * set inline on <html> do reach `:root` and would paint the app correctly — but
 * the picker's chips carry `data-theme` on a *descendant* and read the seeds
 * from there, so only a real rule reaches them. One rule serves both.
 */
function injectInstalledThemeRules(themes: InstalledThemeInfo[]): void {
  if (typeof document === 'undefined') return
  const id = 'gv-installed-themes'
  let el = document.getElementById(id) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = id
    document.head.appendChild(el)
  }
  el.textContent = themes.map(t => cssRuleFor(t.id, t.seeds)).join('\n')
}

/**
 * One `[data-theme]` block. Shared with main.tsx so the pre-mount injection and
 * the post-mount one cannot drift into producing different CSS.
 *
 * The values reaching this have been validated in the main process against
 * /^#[0-9A-Fa-f]{6}$/ — this builds a stylesheet, so anything else would be an
 * injection. The filter here is belt-and-braces for the localStorage path,
 * which a user can edit by hand.
 */
export function cssRuleFor(themeId: string, seeds: Record<string, string>): string {
  const safeId = /^[a-z0-9][a-z0-9-]{0,63}$/.test(themeId) ? themeId : ''
  if (!safeId) return ''
  const body = Object.entries(seeds)
    .filter(([k, v]) => /^[a-z0-9-]+$/.test(k) && /^#[0-9A-Fa-f]{6}$/.test(v))
    .map(([k, v]) => `--seed-${k}:${v}`)
    .join(';')
  return body ? `[data-theme="${safeId}"]{${body}}` : ''
}

/** Called once the main process answers with what is installed. */
export function setInstalledThemes(themes: InstalledThemeInfo[]): void {
  installedThemes = themes
  injectInstalledThemeRules(themes)
}

// Defaults for keys that drive appearance/graph so the UI has sane values
// before the user ever opens preferences.
export const SETTING_DEFAULTS: SettingsMap = {
  theme: 'aqua-dark',
  dateFormat: 'relative',          // 'relative' | 'absolute'
  graphShowAvatars: 'true',
  graphShowAuthor: 'true',
  graphShowDate: 'true',
  graphShowSha: 'true',
  // Off by default in the VS Code panel — narrower real estate than the
  // desktop window, and the stat bar is more of a "nice to have" there.
  graphShowStats: isVSCodeHost ? 'false' : 'true',
  graphCompactColumns: 'false',
  // Panel only. On by default: giving the panel its own picker means it can
  // stop matching the editor, and a panel that does not match its editor reads
  // as broken. Turning this off is the user asking for their own.
  panelFollowEditorTheme: 'true',
}

function applyAppearance(s: SettingsMap) {
  const root = document.documentElement
  // A theme rewrites the seeds, and that is now the ONLY thing that decides
  // the accent. There used to be an accentColor setting layered on top, set
  // inline on <html>; a palette the user picks and an accent they pin on top
  // of it are two answers to one question, and the pinned one won even when it
  // fought the theme. An old accentColor left in settings.json is ignored.
  const theme = resolveTheme(s)
  root.dataset.theme = theme
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
    // An installed theme's seeds go with its id, or the next launch sets
    // data-theme to something tokens.css has no block for and the first frame
    // paints unstyled. Cleared for a built-in so a stale mirror cannot outlive
    // the theme that needed it.
    const installed = installedThemes.find(t => t.id === theme)
    if (installed) localStorage.setItem(THEME_SEEDS_KEY, JSON.stringify(installed.seeds))
    else localStorage.removeItem(THEME_SEEDS_KEY)
  } catch { /* private mode */ }

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

    // Installed themes first: resolveTheme has to know about them before it can
    // accept the stored id, otherwise a downloaded theme reverts to the default
    // on every launch and the bug reads as "my choice does not stick".
    //
    // Not awaited as a precondition of rendering — a settings page that waits
    // on disk before painting is the flash this whole path exists to avoid.
    const load = window.gitAPI.themesInstalled?.()
      .then((r: { themes?: InstalledThemeInfo[] }) => {
        setInstalledThemes(r?.themes ?? [])
      })
      .catch(() => { /* none installed, or an older host: the 32 still work */ })
      ?? Promise.resolve()

    load.then(() => window.gitAPI.settingsGetAll()).then((s: SettingsMap) => {
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
