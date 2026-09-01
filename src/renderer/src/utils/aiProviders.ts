// aiProviders.ts — the provider CATALOG (#169), one module for all four
// surfaces: the desktop main (ai-resolve / ai-call — tsconfig.node.json lists
// this file, the remoteUrl precedent), the settings page, and the extension
// host (esbuild bundles it in).
//
// The insight this file encodes: providers are DATA over three wire dialects
// — Anthropic's messages API, Google's generateContent, and the OpenAI
// chat-completions shape that everything else speaks, local runtimes
// included. Adding a cloud is a catalog line; a local model is a custom
// entry over the same third dialect; a provider speaking none of the three
// is a code contribution to ai-call, never a user setting.

export type AIDialect = 'anthropic' | 'google' | 'openai-compat'

export interface AIProviderDef {
  id: string
  label: string
  dialect: AIDialect
  /** Chat-completions base for the openai-compat dialect, ending in /v1. */
  baseUrl?: string
  /** Where the credential lives — catalog entries only; customs carry theirs inline. */
  keySetting?: string
  keyPlaceholder?: string
  /** Brand colour — data, not theme, like GitHub language colours. */
  color?: string
  /** The original four: legacy per-provider model setting + a key tutorial. */
  legacyModelSetting?: string
  defaultModel?: string
  hasTuto?: boolean
  /** User-defined entry (aiCustomProviders). May run keyless — local runtimes do. */
  custom?: boolean
  /** Customs only: the credential, carried inline in the JSON entry. */
  key?: string
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
  return !!providerCredential(s, def) || !!def.custom
}
