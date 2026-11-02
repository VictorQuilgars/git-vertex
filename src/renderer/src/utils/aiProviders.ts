// aiProviders.ts — the provider CATALOG (#169), one module for all four
// surfaces: the desktop main (ai-resolve / ai-call — tsconfig.node.json lists
// this file, the remoteUrl precedent), the settings page, and the extension
// host (esbuild bundles it in).
//
// The insight this file encodes: providers are DATA over four wire dialects
// — Anthropic's messages API, Google's generateContent, the OpenAI
// chat-completions shape that everything else speaks (local runtimes
// included), and TypeSafe's systemone. Adding a cloud is a catalog line; a
// local model is a custom entry over the third dialect; a provider speaking
// none of the four is a code contribution to ai-call, never a user setting.
//
// The fourth dialect is what forced the second axis. The first three answer a
// prompt with prose, so any of them serves any feature and nothing had to say
// so. A judgement engine answers questions with typed verdicts — a
// probability, an option, a level — which is an answer for a feature that
// SELECTS (which commits match, which qualifiers the request means) and no
// answer at all for one that WRITES. So a def may name the features it
// serves, and a def that names none serves them all: the day this arrived
// nobody's settings moved, which is the density rule applied to a catalog.

export type AIDialect = 'anthropic' | 'google' | 'openai-compat' | 'typesafe' | 'copilot'

export interface AIProviderDef {
  id: string
  label: string
  dialect: AIDialect
  /** Where the dialect is spoken, ending in /v1 — chat-completions for
   *  openai-compat, systemone for typesafe. */
  baseUrl?: string
  /** Where the credential lives — catalog entries only; customs carry theirs inline.
   *  For a `signIn` def it is a SWITCH ('true' or absent), never a secret. */
  keySetting?: string
  /**
   * The credential is the HOST's own sign-in, not a key typed into this page.
   *
   * GitHub Copilot is the case: the subscription belongs to the account the
   * desktop's Copilot CLI is logged into, or the one the editor's Copilot
   * extension uses, and neither hands this app anything it could store. So
   * `keySetting` holds whether the user turned it on, the settings row draws
   * a switch rather than a password field, `providerCredential` answers '' —
   * there is no key, and pretending the switch was one would log it as such —
   * and the sealing in settings-secrets skips it, because sealing a 'true'
   * protects nothing and masks the one setting the page has to read back.
   */
  signIn?: boolean
  keyPlaceholder?: string
  /** Brand colour — data, not theme, like GitHub language colours. */
  color?: string
  /** The original four: legacy per-provider model setting + a key tutorial. */
  legacyModelSetting?: string
  defaultModel?: string
  hasTuto?: boolean
  /**
   * The features this provider can serve, or absent for all of them.
   *
   * Absent is the generative case and therefore the common one: a provider
   * that answers a prompt with prose answers every feature's prompt. A
   * provider whose answers are TYPED serves only the features whose answer
   * has that type — hence `providerServes`, which the per-feature pickers
   * filter on and `resolveAICall` falls through on. Ids come from
   * `AIFeature`; `aiProviders.test.ts` fails on one that does not exist.
   */
  features?: readonly string[]
  /**
   * The models it offers, for a provider that publishes no `/models`.
   *
   * The probe answers from here rather than over the wire, in BOTH hosts.
   * Without it the row would sit on "key unverified" for ever and the pickers
   * would draw an empty group — a provider present in the list and impossible
   * to choose, which is worse than one that is absent.
   */
  models?: readonly string[]
  /** User-defined entry (aiCustomProviders). May run keyless — local runtimes do. */
  custom?: boolean
  /** Customs only: the credential, carried inline in the JSON entry. */
  key?: string
  /**
   * Customs only — the auth QUIRKS, never the request format (#169 P2):
   * the header the key rides in (empty = `Authorization: Bearer`; a named
   * header carries the raw key, the Azure `api-key` style), and extra
   * headers some gateways demand beside it.
   */
  authHeader?: string
  extraHeaders?: Record<string, string>
}

export const AI_PROVIDER_CATALOG: AIProviderDef[] = [
  { id: 'anthropic', label: 'Anthropic (Claude)', dialect: 'anthropic',
    keySetting: 'aiAnthropicKey', legacyModelSetting: 'aiAnthropicModel',
    defaultModel: 'claude-haiku-4-5-20251001', keyPlaceholder: 'sk-ant-...', color: '#d4a27f', hasTuto: true },
  { id: 'google', label: 'Google (Gemini)', dialect: 'google',
    keySetting: 'aiGoogleKey', legacyModelSetting: 'aiGoogleModel',
    defaultModel: 'gemini-2.0-flash', keyPlaceholder: 'AIza...', color: '#4285f4', hasTuto: true },
  { id: 'groq', label: 'Groq', dialect: 'openai-compat', baseUrl: 'https://api.groq.com/openai/v1',
    keySetting: 'aiGroqKey', legacyModelSetting: 'aiGroqModel',
    defaultModel: 'llama-3.3-70b-versatile', keyPlaceholder: 'gsk_...', color: '#f55036', hasTuto: true },
  { id: 'openai', label: 'OpenAI', dialect: 'openai-compat', baseUrl: 'https://api.openai.com/v1',
    keySetting: 'aiOpenaiKey', legacyModelSetting: 'aiOpenaiModel',
    defaultModel: 'gpt-4o-mini', keyPlaceholder: 'sk-...', color: '#10a37f', hasTuto: true },
  { id: 'mistral', label: 'Mistral', dialect: 'openai-compat', baseUrl: 'https://api.mistral.ai/v1',
    keySetting: 'aiMistralKey', keyPlaceholder: '…', color: '#fa500f' },
  { id: 'deepseek', label: 'DeepSeek', dialect: 'openai-compat', baseUrl: 'https://api.deepseek.com/v1',
    keySetting: 'aiDeepseekKey', keyPlaceholder: 'sk-...', color: '#4d6bfe' },
  { id: 'xai', label: 'xAI (Grok)', dialect: 'openai-compat', baseUrl: 'https://api.x.ai/v1',
    keySetting: 'aiXaiKey', keyPlaceholder: 'xai-...', color: '#9aa0a6' },
  { id: 'openrouter', label: 'OpenRouter', dialect: 'openai-compat', baseUrl: 'https://openrouter.ai/api/v1',
    keySetting: 'aiOpenrouterKey', keyPlaceholder: 'sk-or-...', color: '#6467f2' },
  // A judgement engine, and so far the only def that names its features: it
  // answers `search` and `filter`, which pick among things that already
  // exist, and it has nothing to say to a feature that has to write a
  // sentence. `defaultModel` is the moving alias on purpose — one model is
  // published at a time and `/models` is not offered, so the id the user
  // keeps should follow it rather than pin a version that gets retired.
  { id: 'typesafe', label: 'TypeSafe (Jev)', dialect: 'typesafe', baseUrl: 'https://api.typesafe.ai/v1',
    keySetting: 'aiTypesafeKey', keyPlaceholder: '…', defaultModel: 'jev-latest',
    features: ['search', 'filter'], models: ['jev-latest', 'jev-1.13.0'] },
  // The user's Copilot subscription, spoken through whatever the HOST has
  // signed in: on the desktop the Copilot CLI run in server mode by
  // @github/copilot-sdk (the user installs and logs into the CLI — the
  // runtime the SDK can bundle is 171 MB per platform), in VS Code the
  // editor's own Language Model API. Neither publishes a URL or a key, so
  // the dialect is its own and each host implements it. The model list is
  // the account's, asked live, and no `defaultModel` is pinned here on
  // purpose: which models a seat offers is the organisation's policy and
  // moves, and a default naming a retired one is a pair that cannot run.
  { id: 'copilot', label: 'GitHub Copilot', dialect: 'copilot',
    keySetting: 'aiCopilotEnabled', signIn: true, color: '#8957e5', hasTuto: true },
]

/** The two local runtimes worth a one-click preset. Both speak openai-compat. */
export const AI_LOCAL_PRESETS = [
  { label: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
  { label: 'LM Studio', baseUrl: 'http://localhost:1234/v1' },
]

/**
 * The user-defined entries, from the `aiCustomProviders` settings JSON.
 * Malformed input costs the entry, never the feature — the autolink rule.
 */
export function parseCustomProviders(raw: string | undefined): AIProviderDef[] {
  try {
    const arr = JSON.parse(raw || '[]')
    if (!Array.isArray(arr)) return []
    return arr
      .filter(e => e && typeof e.id === 'string' && e.id && typeof e.baseUrl === 'string' && e.baseUrl)
      .map(e => ({
        id: e.id,
        label: String(e.label || e.id),
        dialect: 'openai-compat' as const,
        baseUrl: String(e.baseUrl).replace(/\/+$/, ''),
        key: typeof e.key === 'string' ? e.key : '',
        authHeader: typeof e.authHeader === 'string' ? e.authHeader.trim() : undefined,
        extraHeaders: e.extraHeaders && typeof e.extraHeaders === 'object' && !Array.isArray(e.extraHeaders)
          ? Object.fromEntries(Object.entries(e.extraHeaders)
              .filter(([k, v]) => k && typeof v === 'string')
              .map(([k, v]) => [String(k), String(v)]))
          : undefined,
        custom: true,
      }))
  } catch { return [] }
}

export type AISettingsView = { [k: string]: string | undefined }

export function allProviders(s: AISettingsView): AIProviderDef[] {
  return [...AI_PROVIDER_CATALOG, ...parseCustomProviders(s.aiCustomProviders)]
}

export function providerById(s: AISettingsView, id: string): AIProviderDef | undefined {
  return allProviders(s).find(p => p.id === id)
}

export function providerCredential(s: AISettingsView, def: AIProviderDef): string {
  if (def.custom) return def.key ?? ''
  // A sign-in provider has no key to give: its switch is not one.
  if (def.signIn) return ''
  const v = s[def.keySetting ?? ''] ?? ''
  // backward compat: groqApiKey was the old key
  return v || (def.id === 'groq' ? (s.groqApiKey ?? '') : '')
}

/**
 * Whether a call may run on this provider. A credential says yes; so does a
 * custom endpoint with none — local runtimes are keyless, and "connected"
 * stopped meaning "has a key" the day they arrived (#169).
 */
export function providerUsable(s: AISettingsView, def: AIProviderDef): boolean {
  return !!providerCredential(s, def) || !!def.custom || signedInEnabled(s, def)
}

/**
 * A sign-in provider the user switched on. Whether the host's sign-in is
 * actually there is only known by asking it — the settings row's model probe
 * does, and a call made without one fails saying how to sign in.
 */
export function signedInEnabled(s: AISettingsView, def: AIProviderDef): boolean {
  return !!def.signIn && (s[def.keySetting ?? ''] ?? '').trim() === 'true'
}

/**
 * Runs with no key — a custom endpoint (local runtimes), or a host sign-in the
 * user switched on. Switched OFF it is not keyless, it is unconfigured: the
 * legacy `aiProvider` mirror can still name it after the user turned it off,
 * and that must end as NO_API_KEY rather than as a call they took back.
 */
export function providerKeyless(s: AISettingsView, def: AIProviderDef | undefined): boolean {
  return !!def?.custom || (!!def && signedInEnabled(s, def))
}

/**
 * Whether this provider can serve this feature — the second gate, beside the
 * credential.
 *
 * Absent `features` means all of them, so every generative def answers yes to
 * everything and the three dialects that shipped first are untouched. A def
 * that names its features answers yes only to those, and the two callers read
 * it in the two places a choice is made: the per-feature picker, which stops
 * offering what cannot run, and `resolveAICall`, which falls a stored pair
 * through rather than calling. Both are needed — the picker keeps the setting
 * honest, the resolver keeps a setting written before this existed (or by
 * hand, in settings.json) from reaching the wire.
 */
export function providerServes(def: AIProviderDef, feature?: string): boolean {
  return !def.features || !feature || def.features.includes(feature)
}

/**
 * The headers a call (or a /models probe) sends — the ONE place the auth
 * quirks are interpreted, so the two hosts and the live suite cannot drift.
 * Default is `Authorization: Bearer`; a named header carries the raw key.
 * Extra headers ride with or without a key — a gateway may want them alone.
 */
export function authHeaders(
  target: { apiKey?: string; authHeader?: string; extraHeaders?: Record<string, string> },
): Record<string, string> {
  const h: Record<string, string> = { ...(target.extraHeaders ?? {}) }
  const key = target.apiKey ?? ''
  if (key) {
    const name = (target.authHeader ?? '').trim()
    if (name && name.toLowerCase() !== 'authorization') h[name] = key
    else h.Authorization = `Bearer ${key}`
  }
  return h
}
