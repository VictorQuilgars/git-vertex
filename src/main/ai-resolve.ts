import { providerById, providerCredential, providerUsable, type AIDialect } from '../renderer/src/utils/aiProviders'

// ai-resolve.ts — which (provider, model, key) an AI call runs on, and which
// instructions ride it. Free of `electron` on purpose, the theme-validate
// pattern: the main process imports it, the unit suite exercises it, and the
// manual live suite (tests-live/) drives real API calls through the exact
// resolution production uses — not a re-implementation that could agree with
// nothing.

/**
 * The features a model call can belong to (#70). A feature is what the
 * settings page lets the user override — its (provider, model) pair and its
 * own instructions — so this id set IS the settings vocabulary:
 * `aiFeatureProvider:<id>`, `aiFeatureModel:<id>`, `aiFeatureInstructions:<id>`.
 */
export type AIFeature = 'commit' | 'explain' | 'conflict' | 'search' | 'filter' | 'pr' | 'issue'

export interface ResolvedAI {
  provider: string
  model: string
  apiKey: string
  /** How ai-call speaks to it, and where (openai-compat). */
  dialect: AIDialect
  baseUrl?: string
  /** A custom endpoint may run with no key — local runtimes do (#169). */
  keyless: boolean
}

/** Any read-only view over the flat settings store. */
export type AISettings = Record<string, string | undefined>

const keyFor = (s: AISettings, p: string): string => {
  const def = providerById(s, p)
  return def ? providerCredential(s, def) : ''
}

/** Usable = credentialed, or a custom endpoint (keyless local runtimes). */
const usable = (s: AISettings, p: string): boolean => {
  const def = providerById(s, p)
  return !!def && providerUsable(s, def)
}

const trimmed = (v: unknown): string => typeof v === 'string' ? v.trim() : ''

/**
 * There is no ACTIVE provider (#70 rework): a provider with a key is
 * connected, and every choice carries its own (provider, model) pair — a
 * model id alone is ambiguous across providers. Resolution, most specific
 * first, and a pair whose provider lost its key falls through rather than
 * calling with an empty credential:
 *   1. the feature's own pair;
 *   2. a legacy feature model without a provider (written before the rework)
 *      read against the legacy provider;
 *   3. the default pair;
 *   4. the legacy aiProvider + its per-provider model.
 */
export function resolveAICall(s: AISettings, feature?: AIFeature): ResolvedAI {
  const legacyProvider = s.aiProvider ?? 'groq'
  const legacyModels: Record<string, string> = {
    anthropic: s.aiAnthropicModel || 'claude-haiku-4-5-20251001',
    google:    s.aiGoogleModel    || 'gemini-2.0-flash',
    groq:      s.aiGroqModel      || 'llama-3.3-70b-versatile',
    openai:    s.aiOpenaiModel    || 'gpt-4o-mini',
  }
  const fp = feature ? trimmed(s[`aiFeatureProvider:${feature}`]) : ''
  const fm = feature ? trimmed(s[`aiFeatureModel:${feature}`]) : ''
  let provider: string
  let model: string
  if (fp && fm && usable(s, fp)) { provider = fp; model = fm }
  else if (!fp && fm && usable(s, legacyProvider)) { provider = legacyProvider; model = fm }
  else if (trimmed(s.aiDefaultProvider) && trimmed(s.aiDefaultModel) && usable(s, trimmed(s.aiDefaultProvider))) {
    provider = trimmed(s.aiDefaultProvider); model = trimmed(s.aiDefaultModel)
  } else { provider = legacyProvider; model = legacyModels[legacyProvider] }
  const def = providerById(s, provider)
  return {
    provider, model,
    apiKey: keyFor(s, provider),
    dialect: def?.dialect ?? 'openai-compat',
    baseUrl: def?.baseUrl,
    keyless: !!def?.custom,
  }
}

/**
 * The user's standing instructions ride every prompt — global first, the
 * feature's own after, both AFTER the format rules so a wish cannot unsay a
 * contract (and the outputs that are checked stay checked).
 */
export function appendInstructions(prompt: string, s: AISettings, feature?: AIFeature): string {
  const extras = [s.aiGlobalInstructions, feature ? s[`aiFeatureInstructions:${feature}`] : '']
    .map(x => (x ?? '').trim()).filter(Boolean)
  if (!extras.length) return prompt
  return prompt
    + `\n\nAdditional instructions from the user — follow them where they do not conflict with the rules above:\n${extras.join('\n')}`
}
