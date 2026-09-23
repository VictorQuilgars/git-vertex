import { providerById, providerCredential, providerUsable, providerServes, type AIDialect } from '../renderer/src/utils/aiProviders'

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
export type AIFeature =
  | 'commit' | 'explain' | 'conflict' | 'search' | 'filter' | 'pr' | 'issue'
  | 'changelog' | 'compose'

export interface ResolvedAI {
  provider: string
  model: string
  apiKey: string
  /** How ai-call speaks to it, and where (openai-compat, typesafe). */
  dialect: AIDialect
  baseUrl?: string
  /** A custom endpoint may run with no key — local runtimes do (#169). */
  keyless: boolean
  /** Auth quirks (customs only, #169 P2) — interpreted by authHeaders(). */
  authHeader?: string
  extraHeaders?: Record<string, string>
}

/** Any read-only view over the flat settings store. */
export type AISettings = Record<string, string | undefined>

const keyFor = (s: AISettings, p: string): string => {
  const def = providerById(s, p)
  return def ? providerCredential(s, def) : ''
}

/**
 * Known, and with an answer for THIS feature — the gate without the
 * credential, for the last resort, which is allowed to have no key (the call
 * then fails as NO_API_KEY, which says what to do) but not to be unable to
 * answer at all.
 */
const serves = (s: AISettings, p: string, feature?: AIFeature): boolean => {
  const def = providerById(s, p)
  return !!def && providerServes(def, feature)
}

/**
 * Usable = credentialed (or a custom endpoint — keyless local runtimes), AND
 * able to answer THIS feature.
 *
 * The feature belongs here rather than beside the call because the two ways a
 * pair can be stale are the same kind of staleness: a provider that lost its
 * key and a provider that never served this feature both leave a pair that
 * names something which cannot run, and both have to fall through to the next
 * level rather than reach the wire. A judgement engine is the case that made
 * the second one possible — a pair pointing it at `commit` asks for prose
 * from a model that returns probabilities.
 */
const usable = (s: AISettings, p: string, feature?: AIFeature): boolean => {
  const def = providerById(s, p)
  return !!def && providerUsable(s, def) && providerServes(def, feature)
}

const trimmed = (v: unknown): string => typeof v === 'string' ? v.trim() : ''

/**
 * There is no ACTIVE provider (#70 rework): a provider with a key is
 * connected, and every choice carries its own (provider, model) pair — a
 * model id alone is ambiguous across providers. Resolution, most specific
 * first, and a pair that cannot run falls through rather than reaching the
 * wire — whether its provider lost its key or never served this feature:
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
  if (fp && fm && usable(s, fp, feature)) { provider = fp; model = fm }
  else if (!fp && fm && usable(s, legacyProvider, feature)) { provider = legacyProvider; model = fm }
  else if (trimmed(s.aiDefaultProvider) && trimmed(s.aiDefaultModel) && usable(s, trimmed(s.aiDefaultProvider), feature)) {
    provider = trimmed(s.aiDefaultProvider); model = trimmed(s.aiDefaultModel)
  } else {
    // The last resort answers whatever was asked — it is what the three
    // levels above fall onto — so a provider that serves only some features
    // cannot be it. `aiProvider` is the pre-rework setting and only ever held
    // one of the four, but it is a string in a JSON file anybody can edit,
    // and landing here with a judgement engine would mean no model at all.
    provider = serves(s, legacyProvider, feature) ? legacyProvider : 'groq'
    model = legacyModels[provider] ?? legacyModels.groq
  }
  const def = providerById(s, provider)
  return {
    provider, model,
    apiKey: keyFor(s, provider),
    dialect: def?.dialect ?? 'openai-compat',
    baseUrl: def?.baseUrl,
    keyless: !!def?.custom,
    authHeader: def?.authHeader,
    extraHeaders: def?.extraHeaders,
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
