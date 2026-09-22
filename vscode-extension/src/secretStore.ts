// Where the panel's credentials live.
//
// They lived in `gvSettings` — the extension's globalState — which VS Code
// keeps UNENCRYPTED on disk. Every AI key and every GitHub token was readable
// by anything that could read the user's profile, and the panel handed them
// all to its webview besides. The extension already knew better in one place:
// `oauthHost.ts` puts OAuth tokens in `context.secrets`, which is the editor's
// own keychain-backed store. This puts everything else there too.
//
// The rules about WHAT is a credential are not restated here. They come from
// `src/main/settings-secrets`, the same module the desktop uses, so the two
// products cannot drift on the question — which is exactly how four API keys
// ended up unsealed on the desktop: a second list nobody remembered to edit.
//
// `gvSettings` keeps a MASK where a secret used to be. That way every existing
// reader of a non-secret setting is untouched, and a reader that needs a
// credential has to come through here and say so.

import type * as vscode from 'vscode'
import {
  SECRET_MASK, isSecretSetting, maskSecrets, resolveSecretWrite,
} from '../../src/main/settings-secrets'

/** The editor's own credential store, narrowed to what this needs. */
export interface Secrets {
  get(key: string): Thenable<string | undefined>
  store(key: string, value: string): Thenable<void>
  delete(key: string): Thenable<void>
}

type Settings = Record<string, string>

const STATE_KEY = 'gvSettings'
/** Namespaced, so nothing here collides with oauthHost's own entries. */
const secretKey = (setting: string) => `gvSetting:${setting}`

const readState = (state: vscode.Memento): Settings =>
  state.get<Settings>(STATE_KEY, {})

/**
 * The settings, with the credentials put back.
 *
 * Only the masked entries cost a keychain read, so a page of ordinary settings
 * costs none. Callers that do not need a credential should not use this —
 * `settingsGetAll` deliberately does not, which is how the webview stopped
 * being handed the keys.
 */
export async function resolveSettings(
  state: vscode.Memento, secrets: Secrets,
): Promise<Settings> {
  const out = { ...readState(state) }
  for (const key of Object.keys(out)) {
    if (out[key] !== SECRET_MASK) continue
    // A secret the store lost is an empty string, never the mask: a mask
    // reaching a provider as a key is a 401 that reads like a bad key.
    out[key] = (await secrets.get(secretKey(key))) ?? ''
  }
  return out
}

/**
 * Write one setting, routing a credential to the keychain.
 *
 * The mask coming back means "leave it as it is" — the webview never had the
 * value, so it cannot send it. That contract is the desktop's, applied by the
 * same function, `resolveSecretWrite`.
 */
export async function writeSetting(
  state: vscode.Memento, secrets: Secrets, key: string, value: string,
): Promise<void> {
  const all = readState(state)
  if (!isSecretSetting(key)) {
    all[key] = value
    await state.update(STATE_KEY, all)
    return
  }
  // A blob carries its own masked entries, so it is resolved against what is
  // stored before it is written back.
  const stored = await resolveSettings(state, secrets)
  const resolved = resolveSecretWrite(stored, key, value)
  if (resolved === null) return          // the mask, unchanged
  if (resolved === '') {
    await secrets.delete(secretKey(key))
    delete all[key]
  } else {
    await secrets.store(secretKey(key), resolved)
    all[key] = SECRET_MASK
  }
  await state.update(STATE_KEY, all)
}

/** Remove one setting, credential included. */
export async function deleteSetting(
  state: vscode.Memento, secrets: Secrets, key: string,
): Promise<void> {
  const all = readState(state)
  delete all[key]
  await state.update(STATE_KEY, all)
  if (isSecretSetting(key)) await secrets.delete(secretKey(key))
}

/** What the webview is allowed to see: masks where a credential is set. */
export function maskedSettings(state: vscode.Memento): Settings {
  return maskSecrets(readState(state))
}

/**
 * Move to the keychain whatever is still sitting in globalState in clear.
 *
 * Run once at activation. Returns the setting names it moved, so the caller
 * can TELL the user: a store rewritten today says nothing about the copies a
 * profile backup or a settings-sync took while it was readable, and the only
 * remedy left — regenerating the credential — is theirs.
 *
 * Idempotent: a value already replaced by a mask is not a value to move.
 */
export async function migrateSecretsOutOfState(
  state: vscode.Memento, secrets: Secrets,
): Promise<string[]> {
  const all = readState(state)
  const moved: string[] = []
  for (const key of Object.keys(all)) {
    const value = all[key]
    if (!isSecretSetting(key) || typeof value !== 'string') continue
    if (value === '' || value === SECRET_MASK) continue
    await secrets.store(secretKey(key), value)
    all[key] = SECRET_MASK
    moved.push(key)
  }
  if (moved.length) await state.update(STATE_KEY, all)
  return moved
}
