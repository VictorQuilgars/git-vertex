// settings.json: where it is, and the secrets in it sealed on the way in and opened on the way out.
import { app, safeStorage } from 'electron'
import { openSecrets, sealSecrets, type Cipher } from './settings-secrets'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join as pathJoin } from 'path'

export function getSettingsPath(): string {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  return pathJoin(dir, 'settings.json')
}

// The secrets in settings.json go through the system's protected storage —
// see settings-secrets.ts for what is sealed, opened and masked. A file
// written in clear by an older version reads as it is and is sealed by its
// next write; on a platform with no protected storage it stays in clear.
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
