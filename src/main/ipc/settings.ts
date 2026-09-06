// settings:* and themes:* — what the settings page reads and writes.
import { handle } from './handle'
import { app, ipcMain } from 'electron'
import { ThemeStore } from '../theme-store'
import { maskSecrets, resolveSecretWrite, isSecretSetting } from '../settings-secrets'
import { BUILT_IN_THEME_IDS } from '../theme-validate'
import { scheduleAutoFetch, applySshConfig } from '../repo-session'
import { readSettings, writeSettings } from '../settings-store'

// ── Themes ───────────────────────────────────────────────────────────────────
// The renderer never fetches: it is sandboxed and shared with the extension, so
// the network lives here and the same ThemeStore backs GitVertexHost. Installed
// themes go under userData/themes/, next to settings.json.
export let themeStore: ThemeStore | null = null

export function getThemeStore(): ThemeStore {
  if (!themeStore) {
    themeStore = new ThemeStore({
      baseDir: app.getPath('userData'),
      builtIns: BUILT_IN_THEME_IDS,
    })
  }
  return themeStore
}

export function registerSettingsHandlers(): void {
  handle('themes:catalogue', async (_event, opts?: { refresh?: boolean }) => {
    // Deliberately never rejects — the settings page must open with no network.
    return getThemeStore().catalogue(opts ?? {})
  })

  handle('themes:install', async (_event, id: string) => {
    try {
      return { success: true, theme: await getThemeStore().install(id) }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  handle('themes:remove', (_event, id: string) => {
    try {
      getThemeStore().remove(id)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  handle('themes:installed', () => {
    const store = getThemeStore()
    const themes = store.installed()
    // Anything validation threw away is reported rather than silently missing —
    // "my theme vanished" with no reason is the bug this avoids.
    return { themes, discarded: store.takeDiscarded() }
  })

  // ── Settings: get/set all ──────────────────────────────────────
  // The window gets a mask where a secret is set: nothing there needs a token's
  // value, every call that uses one is made here. A mask sent back means "keep
  // what is stored" — see settings-secrets.ts.
  handle('settings:get-all', () => {
    return maskSecrets(readSettings())
  })

  handle('settings:set', (_e, key: string, value: string) => {
    const s = readSettings()
    const resolved = isSecretSetting(key) ? resolveSecretWrite(s, key, value) : value
    if (resolved === null) return { success: true }
    s[key] = resolved; writeSettings(s)
    if (key === 'autoFetchInterval') scheduleAutoFetch()
    if (key === 'sshUseAgent' || key === 'sshPrivateKey') applySshConfig()
    return { success: true }
  })
}
