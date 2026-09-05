// What every handler shares: the window and the git service of the repository that is open.
// One place, read at call time, so a handler registered at boot answers for the repository of the moment.
import { BrowserWindow, Notification } from 'electron'
import { GitService } from './git-service'
import { readSettings } from './settings-store'

export const state = {
  /** Assigned by createWindow; every handler runs after it. */
  mainWindow: null as unknown as BrowserWindow,
  /** The service of the repository that is open, or none. */
  gitService: null as GitService | null,
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
