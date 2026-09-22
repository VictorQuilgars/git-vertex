// settings.json: where it is, and the secrets in it sealed on the way in and opened on the way out.
import { app, safeStorage } from 'electron'
import { openSecrets, sealSecrets, unsealedSecrets, type Cipher } from './settings-secrets'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join as pathJoin } from 'path'

export function getSettingsPath(): string {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  return pathJoin(dir, 'settings.json')
}

// The secrets in settings.json go through the system's protected storage —
// see settings-secrets.ts for what is sealed, opened and masked. A file
// written in clear by an older version is sealed at STARTUP now, by
// resealSettings() below, rather than whenever the user next happens to save
// something; on a platform with no protected storage it stays in clear,
// because there is nowhere to put it.
export const settingsCipher: Cipher = {
  available: () => { try { return safeStorage.isEncryptionAvailable() } catch { return false } },
  seal: (plain) => safeStorage.encryptString(plain).toString('base64'),
  open: (sealed) => safeStorage.decryptString(Buffer.from(sealed, 'base64')),
}

export function readSettings(): Record<string, string> {
  try { return openSecrets(JSON.parse(readFileSync(getSettingsPath(), 'utf-8')), settingsCipher) } catch { return {} }
}

export function writeSettings(data: Record<string, string>): void {
  writeFileSync(getSettingsPath(), JSON.stringify(sealSecrets(data, settingsCipher), null, 2), 'utf-8')
}

/**
 * Seal, at startup, whatever an older version left in clear.
 *
 * Waiting for the next write is what let four API keys sit readable for six
 * releases: sealing is correct on write, and nothing forced a write. This runs
 * once when the app starts and returns WHICH settings it had to fix — the
 * caller tells the user, because a file rewritten today says nothing about the
 * copies a backup or a synced folder took yesterday. Those keys have to be
 * regenerated, and only their owner can do that.
 *
 * Nothing to seal, or no protected storage on this platform, and it is a
 * no-op: reporting an exposure the app cannot fix would be an alarm with no
 * action under it.
 */
export function resealSettings(): string[] {
  if (!settingsCipher.available()) return []
  let raw: Record<string, string>
  try { raw = JSON.parse(readFileSync(getSettingsPath(), 'utf-8')) } catch { return [] }
  const inClear = unsealedSecrets(raw)
  if (!inClear.length) return []
  try {
    writeFileSync(getSettingsPath(), JSON.stringify(sealSecrets(raw, settingsCipher), null, 2), 'utf-8')
  } catch { return [] }
  return inClear
}
