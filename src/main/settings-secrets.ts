// The secrets in settings.json, and the two things that happen to them.
//
// At rest they are SEALED: `githubToken` and the API keys used to sit in the
// file in clear, readable by anything that can read the user's home. They go
// through the system's protected storage now — Electron's safeStorage, the
// Keychain on macOS, DPAPI on Windows, the keyring on Linux — and the file
// holds a ciphertext that only this app on this machine opens. A file copied
// to another machine yields no token, which is the point.
//
// Toward the window they are MASKED: the renderer asked for "all settings"
// and got the tokens with them, though nothing there ever needed a token's
// value — the main process makes every call that uses one. It gets a mask now,
// enough to say "configured"; a mask sent back is "leave it as it is".
//
// Pure, so it is testable with a cipher that is not the Keychain. The Electron
// wiring is in index.ts.

/** Settings whose value is a credential. */
export const SECRET_KEYS = new Set([
  'githubToken', 'githubEnterpriseToken',
  'aiAnthropicKey', 'aiGoogleKey', 'aiGroqKey', 'aiOpenaiKey',
  'groqApiKey', 'geminiApiKey',
])
/** A JSON array whose entries carry a `key` — the custom AI providers. */
export const SECRET_BLOBS = new Set(['aiCustomProviders'])

export const SECRET_MASK = '••••••••'
const SEALED = 'enc:v1:'

export interface Cipher {
  available(): boolean
  seal(plain: string): string
  open(sealed: string): string
}

type Settings = Record<string, string>

export function isSecretSetting(key: string): boolean {
  return SECRET_KEYS.has(key) || SECRET_BLOBS.has(key)
}

/** What is written: every secret sealed, when the platform can. */
export function sealSecrets(data: Settings, cipher: Cipher): Settings {
  const out: Settings = { ...data }
  if (!cipher.available()) return out
  for (const key of Object.keys(out)) {
    const value = out[key]
    if (!isSecretSetting(key) || !value || value.startsWith(SEALED)) continue
    try { out[key] = SEALED + cipher.seal(value) } catch { /* left in clear rather than lost */ }
  }
  return out
}

/** What is read: every sealed value opened. One that cannot be is absent, not garbage. */
export function openSecrets(data: Settings, cipher: Cipher): Settings {
  const out: Settings = { ...data }
  for (const key of Object.keys(out)) {
    const value = out[key]
    if (typeof value !== 'string' || !value.startsWith(SEALED)) continue
    try { out[key] = cipher.available() ? cipher.open(value.slice(SEALED.length)) : '' } catch { out[key] = '' }
  }
  return out
}

/** What the window sees: a mask where a secret is set, nothing where it is not. */
export function maskSecrets(data: Settings): Settings {
  const out: Settings = { ...data }
  for (const key of SECRET_KEYS) if (out[key]) out[key] = SECRET_MASK
  for (const key of SECRET_BLOBS) {
    if (!out[key]) continue
    try {
      const arr = JSON.parse(out[key])
      if (!Array.isArray(arr)) continue
      out[key] = JSON.stringify(arr.map(e => e && typeof e === 'object' && typeof e.key === 'string' && e.key ? { ...e, key: SECRET_MASK } : e))
    } catch { /* malformed: nothing to mask, nothing to leak either */ }
  }
  return out
}

/**
 * A value the window sends back for a secret setting. The mask means "keep
 * what is stored": for a plain secret the stored value, for the providers
 * blob the stored key of the entry with the same id. Returns the value to
 * store, or null when nothing should change.
 */
export function resolveSecretWrite(stored: Settings, key: string, value: string): string | null {
  if (SECRET_KEYS.has(key)) return value === SECRET_MASK ? null : value
  if (!SECRET_BLOBS.has(key)) return value
  try {
    const incoming = JSON.parse(value)
    if (!Array.isArray(incoming)) return value
    let kept: any[] = []
    try { kept = JSON.parse(stored[key] || '[]') } catch { kept = [] }
    if (!Array.isArray(kept)) kept = []
    const storedKey = (id: unknown) => kept.find(e => e && e.id === id)?.key
    return JSON.stringify(incoming.map(e =>
      e && typeof e === 'object' && e.key === SECRET_MASK ? { ...e, key: typeof storedKey(e.id) === 'string' ? storedKey(e.id) : '' } : e))
  } catch { return value }
}
