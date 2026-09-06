// What every handler shares: the window, and the git service of the repository
// the current request is about — the one the preload named in its envelope
// (see ipc/handle.ts and sessions.ts), else the active one. Read at call time,
// so a handler registered at boot answers for the right repository.
import { BrowserWindow, Notification } from 'electron'
import { GitService } from './git-service'
import { readSettings } from './settings-store'
import { sessionFor } from './sessions'

export const state = {
  /** Assigned by createWindow; every handler runs after it. */
  mainWindow: null as unknown as BrowserWindow,
  /** The service of the repository this request is about, or none. */
  get gitService(): GitService | null {
    return sessionFor()?.service ?? null
  },
}

export function sendToWindow(channel: string, payload?: unknown): void {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) state.mainWindow.webContents.send(channel, payload)
}

// ── Desktop notifications ──────────────────────────────────────
// settingKey gates the notification via settings.json; defaultEnabled
// is used when the setting was never written.
export function notify(title: string, body: string, settingKey?: string, defaultEnabled = true): void {
  if (settingKey) {
    const val = readSettings()[settingKey]
    const enabled = val === undefined ? defaultEnabled : val !== 'false'
    if (!enabled) return
  }
  if (!Notification.isSupported()) return
  try { new Notification({ title, body }).show() } catch { /* ignore */ }
}
