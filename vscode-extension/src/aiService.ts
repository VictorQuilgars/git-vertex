// aiService.ts — AI pipeline for the VS Code extension host.
// Mirrors the desktop app's runAIPrompt + feature prompts, but calls the
// providers' REST APIs directly with fetch (no SDK dependencies) so the
// extension stays lightweight. Configuration comes from VS Code settings
// (gitVertex.aiProvider / aiApiKey / aiModel), falling back to the shared
// gvSettings store (same keys as the desktop app) if present.
import * as vscode from 'vscode'
import { providerById, providerCredential, providerUsable, authHeaders, type AIDialect } from '../../src/renderer/src/utils/aiProviders'

export interface AIConfig {
  provider: string; apiKey: string; model: string
  /** How callOnce speaks to it, and where (openai-compat) — from the shared
   *  catalog (#169), customs included. */
  dialect: AIDialect
  baseUrl?: string
  /** A custom endpoint may run keyless — local runtimes do (#169). */
  keyless?: boolean
  /** Auth quirks (customs only, #169 P2) — interpreted by authHeaders(). */
  authHeader?: string
  extraHeaders?: Record<string, string>
  /** The user's standing instructions — global plus the feature's own (#70). */
  instructions?: string
}

/** The desktop's AIFeature vocabulary — see src/main/index.ts (#70). */
export type AIFeature = 'commit' | 'explain' | 'conflict' | 'search' | 'filter' | 'pr' | 'issue'

const MODEL_DEFAULTS: Record<string, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  google: 'gemini-2.0-flash',
  groq: 'llama-3.3-70b-versatile',
  openai: 'gpt-4o-mini',
}
const KEY_SETTING: Record<string, string> = {
  anthropic: 'aiAnthropicKey', google: 'aiGoogleKey', groq: 'aiGroqKey', openai: 'aiOpenaiKey',
}
const MODEL_SETTING: Record<string, string> = {
  anthropic: 'aiAnthropicModel', google: 'aiGoogleModel', groq: 'aiGroqModel', openai: 'aiOpenaiModel',
}

// A VS Code setting only takes precedence when the USER actually set it —
// cfg.get() would return the declared default ("groq") even when untouched,
// silently shadowing the gvSettings store written by the in-panel settings
// page (e.g. provider=anthropic + an Anthropic key → wrongly looked up a
// Groq key → NO_API_KEY). inspect() ignores the declared default.
function userSetting(cfg: vscode.WorkspaceConfiguration, key: string): string | undefined {
  const i = cfg.inspect<string>(key)
  const v = i?.workspaceFolderValue ?? i?.workspaceValue ?? i?.globalValue
  return v?.trim() ? v : undefined
}

export function readAIConfig(state: vscode.Memento, feature?: AIFeature): AIConfig | null {
  const cfg = vscode.workspace.getConfiguration('gitVertex')
  const gv = state.get<Record<string, string>>('gvSettings', {})
  const trimmed = (v: unknown) => typeof v === 'string' ? v.trim() : ''
  const keyFor = (p: string) => {
    const def = providerById(gv, p)
    return def ? providerCredential(gv, def) : ''
  }
  const usable = (p: string) => {
    const def = providerById(gv, p)
    return !!def && providerUsable(gv, def)
  }
  const legacyProvider = (gv.aiProvider || 'groq').toLowerCase()

  // The desktop's resolution (#70 rework): no active provider — every choice
  // carries its own (provider, model) pair, and a pair whose provider lost
  // its key falls through. The VS Code settings, when the USER set them, stay
  // the editor-level pin they always were and shortcut everything.
  let provider: string
  let model: string
  const pinnedProvider = userSetting(cfg, 'aiProvider')?.toLowerCase()
  const pinnedModel = userSetting(cfg, 'aiModel')
  const fp = feature ? trimmed(gv[`aiFeatureProvider:${feature}`]) : ''
  const fm = feature ? trimmed(gv[`aiFeatureModel:${feature}`]) : ''
  if (pinnedModel) {
    provider = pinnedProvider || legacyProvider
    model = pinnedModel
  } else if (fp && fm && usable(fp)) { provider = fp; model = fm }
  else if (!fp && fm && usable(legacyProvider)) { provider = legacyProvider; model = fm }
  else if (trimmed(gv.aiDefaultProvider) && trimmed(gv.aiDefaultModel) && usable(trimmed(gv.aiDefaultProvider))) {
    provider = trimmed(gv.aiDefaultProvider); model = trimmed(gv.aiDefaultModel)
  } else {
    provider = pinnedProvider || legacyProvider
    model = gv[MODEL_SETTING[provider] ?? ''] || MODEL_DEFAULTS[provider] || MODEL_DEFAULTS.groq
  }
  const def = providerById(gv, provider)
  const apiKey = userSetting(cfg, 'aiApiKey') || keyFor(provider)
  if (!apiKey && !def?.custom) return null
  const extras = [gv.aiGlobalInstructions, feature ? gv[`aiFeatureInstructions:${feature}`] : '']
    .map(x => (x ?? '').trim()).filter(Boolean)
  return {
    provider, apiKey, model,
    dialect: def?.dialect ?? 'openai-compat',
    baseUrl: def?.baseUrl,
    keyless: !!def?.custom,
    authHeader: def?.authHeader,
    extraHeaders: def?.extraHeaders,
    instructions: extras.length ? extras.join('\n') : undefined,
  }
}

// HTTP error carrying the status + optional Retry-After so the retry loop
// can back off intelligently and the UI can explain what happened.
class AIHttpError extends Error {
  constructor(message: string, public status: number, public retryAfterMs?: number) { super(message) }
}

async function throwHttpError(provider: string, res: Response): Promise<never> {
  let detail = ''
  try {
    const body = await res.json() as any
    detail = body?.error?.message ?? body?.error ?? ''
    if (typeof detail !== 'string') detail = ''
  } catch { /* non-JSON body */ }
  const ra = res.headers.get('retry-after')
  const retryAfterMs = ra ? (isNaN(Number(ra)) ? undefined : Number(ra) * 1000) : undefined
  const label = provider.charAt(0).toUpperCase() + provider.slice(1)
  let msg: string
  if (res.status === 429) msg = `${label}: quota or rate limit reached (429)${detail ? ` — ${detail}` : ''}. Wait a moment or switch model/provider.`
  else if (res.status === 503 || res.status === 529) msg = `${label}: model overloaded (${res.status})${detail ? ` — ${detail}` : ''}. Try again shortly or switch model.`
  else if (res.status === 401 || res.status === 403) msg = `${label}: API key rejected (${res.status})${detail ? ` — ${detail}` : ''}.`
  else msg = `${label} HTTP ${res.status}${detail ? ` — ${detail}` : ''}`
  throw new AIHttpError(msg, res.status, retryAfterMs)
}

async function callOnce(cfg: AIConfig, prompt: string, maxTokens: number): Promise<string> {
  const { provider, apiKey, model } = cfg
  if (cfg.dialect === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!res.ok) await throwHttpError(provider, res)
    const data = await res.json() as any
    return (data.content?.[0]?.text ?? '').trim()
  }
  if (cfg.dialect === 'google') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    })
    if (!res.ok) await throwHttpError(provider, res)
    const data = await res.json() as any
    return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
  }
  // openai-compat — the base URL is the whole point: a catalog cloud, a
  // custom gateway, an Ollama on localhost (#169). Keyless stays keyless.
  const base = (cfg.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '')
  const headers: Record<string, string> = { 'content-type': 'application/json', ...authHeaders(cfg) }
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) await throwHttpError(provider, res)
  const data = await res.json() as any
  return (data.choices?.[0]?.message?.content ?? '').trim()
}

export async function runAIPrompt(cfg: AIConfig, prompt: string, maxTokens = 512): Promise<{ text?: string; error?: string }> {
  // The user's standing instructions ride every prompt, AFTER the format
  // rules — a wish cannot unsay a contract, and checked outputs stay checked.
  if (cfg.instructions) {
    prompt += `\n\nAdditional instructions from the user — follow them where they do not conflict with the rules above:\n${cfg.instructions}`
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const text = await callOnce(cfg, prompt, maxTokens)
      if (text) return { text }
      if (attempt < 3) await new Promise(r => setTimeout(r, 500 * attempt))
    } catch (e: any) {
      const status = e instanceof AIHttpError ? e.status : 0
      // Auth/key problems won't fix themselves — fail fast.
      if (status === 401 || status === 403) return { error: e.message }
      if (attempt === 3) return { error: e?.message ?? 'AI API error' }
      // Overload/rate-limit: honor Retry-After when given, else back off
      // exponentially (2s, 4s) — hammering a 429 every 500ms makes it worse.
      const wait = (status === 429 || status === 503 || status === 529)
        ? (e.retryAfterMs ?? 2000 * Math.pow(2, attempt - 1))
        : 500 * attempt
      await new Promise(r => setTimeout(r, Math.min(wait, 15000)))
    }
  }
  return { error: 'The model returned an empty response after 3 attempts' }
}

export const truncateDiff = (diff: string, max = 6000) =>
  diff.length > max ? diff.slice(0, max) + '\n... [diff truncated]' : diff

// Live model list per provider — mirrors the desktop's ai:list-provider-models
// (Groq's audio-only whisper models filtered out, OpenAI trimmed to chat models).
export async function listProviderModels(provider: string, apiKey: string, baseUrl?: string, quirks?: { authHeader?: string; extraHeaders?: Record<string, string> }): Promise<{ models?: string[]; error?: string }> {
  try {
    // Everything that is not Anthropic or Google is the OpenAI dialect —
    // one GET {base}/models covers the catalog's clouds, the customs and
    // the keyless local runtimes (#169).
    if (provider !== 'anthropic' && provider !== 'google') {
      const base = (baseUrl ?? '').replace(/\/+$/, '')
      if (base) {
        const headers = authHeaders({ apiKey, ...quirks })
        const res = await fetch(`${base}/models`, { headers })
        const data = await res.json().catch(() => ({})) as any
        if (!res.ok || data.error) return { error: data.error?.message ?? `HTTP ${res.status}` }
        const list: any[] = Array.isArray(data) ? data : (data.data ?? data.models ?? [])
        let ids = list.map((m: any) => (m.id ?? m.name) as string).filter(Boolean)
        if (provider === 'groq') ids = ids.filter(m => !m.startsWith('whisper') && !m.startsWith('distil-whisper'))
        return { models: ids.sort() }
      }
    }
    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      })
      if (!res.ok) return { error: `HTTP ${res.status}` }
      const data = await res.json() as any
      return { models: (data.data ?? []).map((m: any) => m.id) }
    }
    if (provider === 'google') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`)
      if (!res.ok) return { error: `HTTP ${res.status}` }
      const data = await res.json() as any
      return {
        models: (data.models ?? [])
          .filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
          .map((m: any) => String(m.name).replace(/^models\//, ''))
          .filter((n: string) => n.includes('gemini')),
      }
    }
    const base = provider === 'openai' ? 'https://api.openai.com' : 'https://api.groq.com/openai'
    const res = await fetch(`${base}/v1/models`, { headers: { Authorization: `Bearer ${apiKey}` } })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const data = await res.json() as any
    let models: string[] = (data.data ?? []).map((m: any) => m.id)
    if (provider === 'groq') models = models.filter(m => !m.startsWith('whisper') && !m.startsWith('distil-whisper'))
    if (provider === 'openai') models = models.filter(m => /^(gpt|o\d|chatgpt)/.test(m))
    return { models: models.sort() }
  } catch (e: any) {
    return { error: e?.message ?? 'network error' }
  }
}

// ── Feature prompts (kept in sync with the desktop app's src/main/index.ts) ──

export async function aiGenerateCommitMessage(cfg: AIConfig, stagedDiff: string) {
  if (!stagedDiff.trim()) return { error: 'No staged change to analyse' }
  const prompt = `You are a Git expert. Analyze this diff and generate a concise commit message following Conventional Commits (feat/fix/docs/chore/refactor/style/test/perf). First line: type(scope): description (max 72 chars). Reply ONLY with the commit message in English.\n\nDiff:\n\`\`\`diff\n${truncateDiff(stagedDiff)}\n\`\`\``
  const r = await runAIPrompt(cfg, prompt)
  return r.error ? { error: r.error } : { message: r.text }
}

/**
 * A saved filter described in words → a query. The desktop's twin (#150).
 *
 * The vocabulary is handed over rather than assumed: the two sections do not
 * share one, and a model left to guess writes GitHub's web search syntax —
 * close enough to look right, wrong enough to be refused. The answer is
 * checked by the caller against the same validator a typed query goes through.
 */
/**
 * The budget for a filter query. NOT small, however short the answer is: a
 * reasoning model spends this before it emits anything, and at 128 the
 * configured one was cut off mid-thought — `finish_reason: length`, empty
 * content, three times, which is what "the model returned an empty response
 * after 3 attempts" was. Measured: 128 fails, 512 barely clears, 1024 leaves
 * room. A ceiling only costs what is used.
 */
const AI_QUERY_TOKENS = 1024

export async function aiFilterQuery(
  cfg: AIConfig, kind: 'prs' | 'issues', described: string, vocabulary: string,
): Promise<{ query?: string; error?: string }> {
  if (!described.trim()) return { error: 'nothing to describe' }
  const what = kind === 'prs' ? 'pull requests' : 'issues'
  const prompt = [
    `You write GitHub search queries that filter ${what}.`,
    `ONLY these qualifiers exist. Using any other is an error:`,
    vocabulary,
    // Measured against the configured model: without these three the answers
    // are valid and wrong. "head contains fix or feat" came back as
    // `head:fix head:feat`, which ANDs and therefore matches nothing, and
    // "pull requests I wrote" lost its author entirely for want of @me.
    `Every term is combined with AND. There is no OR and no wildcard: the same qualifier given twice matches nothing.`,
    `base: and head: match a branch name by PREFIX, case-insensitively.`,
    `@me stands for the signed-in user wherever a user_name is taken.`,
    `Rules: reply with the query and nothing else — no prose, no quotes, no backticks.`,
    `Use only the qualifiers listed. Bare words are allowed as free text.`,
    `If the request cannot be expressed exactly, reply with the closest single query that can.`,
    ``,
    `Request: ${described.trim()}`,
  ].join('\n')
  const r = await runAIPrompt(cfg, prompt, AI_QUERY_TOKENS)
  if (r.error) return { error: r.error }
  const query = (r.text ?? '')
    .replace(/```[a-z]*/gi, '')
    .split('\n').map(l => l.trim()).filter(Boolean)[0] ?? ''
  return query ? { query: query.replace(/^["'`]|["'`]$/g, '') } : { error: 'empty answer' }
}

/**
 * The composer's title and description, generated together — the desktop's
 * twin (#130). The host assembles the material (subjects, diffstat, diff) from
 * its own git service, because this module has no repository to ask; the
 * prompt and its budgets stay identical to src/main/index.ts. One call for
 * both fields: they are one answer about one branch, and two calls would let
 * them disagree.
 */
const PR_SUBJECTS_MAX = 50
const PR_DIFF_BUDGET = 12000
const PR_DESCRIPTION_TOKENS = 1024

export async function aiPrDescription(
  cfg: AIConfig, baseName: string, headName: string,
  subjects: string[], diffstat: string, diff: string,
): Promise<{ title?: string; body?: string; error?: string }> {
  if (subjects.length === 0) return { error: `No commits between ${baseName} and ${headName}` }
  const listed = subjects.slice(0, PR_SUBJECTS_MAX)
  const omitted = subjects.length - listed.length
  const cut = diff.length > PR_DIFF_BUDGET
  const prompt = [
    `You write pull request titles and descriptions for a Git branch.`,
    `First line of your reply: the title — imperative, specific, at most 72 characters.`,
    `Then a blank line, then the description in Markdown: one short paragraph saying what the branch does and why, then a bullet list of the notable changes. No heading that restates the title, no preamble, no code fences around the reply.`,
    `Write in English. Reply with nothing but the title and the description.`,
    ``,
    `Branch: ${headName} into ${baseName}`,
    `Commit subjects (${subjects.length}):`,
    listed.map(s => `- ${s}`).join('\n') + (omitted > 0 ? `\n- … and ${omitted} more` : ''),
    ``,
    `Diffstat:`,
    truncateDiff(diffstat, 3000),
    ``,
    cut
      ? `The full diff is too large to include; what follows is its beginning. Weigh the diffstat and the subjects for the rest.`
      : `Full diff:`,
    '```diff',
    truncateDiff(diff, PR_DIFF_BUDGET),
    '```',
  ].join('\n')
  const r = await runAIPrompt(cfg, prompt, PR_DESCRIPTION_TOKENS)
  if (r.error) return { error: r.error }
  const lines = (r.text ?? '').replace(/```[a-z]*/gi, '').split('\n')
  const at = lines.findIndex(l => l.trim())
  if (at < 0) return { error: 'empty answer' }
  const title = lines[at].trim().replace(/^["'#*\s]+|["'*\s]+$/g, '')
  const body = lines.slice(at + 1).join('\n').trim()
  return { title, body }
}

/**
 * An issue from a sentence — the desktop's twin. The brief is the only
 * material; prompt and parse stay identical to src/main/index.ts.
 */
const AI_ISSUE_TOKENS = 1024

export async function aiGenerateIssue(
  cfg: AIConfig, described: string,
): Promise<{ title?: string; body?: string; error?: string }> {
  if (!described.trim()) return { error: 'nothing to describe' }
  const prompt = [
    `You write GitHub issues from a maintainer's note — anything from a few words to a full draft. Keep what is right, tighten what is not, and structure it.`,
    `First line of your reply: the title — specific, at most 72 characters, no trailing period.`,
    `Then a blank line, then the body in Markdown: a short paragraph of context saying what is wrong or wanted and why it matters, then a bullet list of what done looks like. Only state what the note supports — never invent reproduction steps, versions or numbers it does not contain.`,
    `Write in English, whatever language the note is in. Reply with nothing but the title and the body.`,
    ``,
    `Note: ${described.trim()}`,
  ].join('\n')
  const r = await runAIPrompt(cfg, prompt, AI_ISSUE_TOKENS)
  if (r.error) return { error: r.error }
  const lines = (r.text ?? '').replace(/```[a-z]*/gi, '').split('\n')
  const at = lines.findIndex(l => l.trim())
  if (at < 0) return { error: 'empty answer' }
  const title = lines[at].trim().replace(/^["'#*\s]+|["'*\s]+$/g, '')
  const body = lines.slice(at + 1).join('\n').trim()
  return { title, body }
}

export async function aiRecomposeCommit(cfg: AIConfig, diff: string, currentMsg: string) {
  if (!diff.trim()) return { error: 'This commit has no change to analyse (a merge commit?)' }
  const prompt = `You are a Git expert. Rewrite this commit's message based on what the diff ACTUALLY changes. Follow Conventional Commits (feat/fix/docs/chore/refactor/style/test/perf). First line: type(scope): description (max 72 chars). If the change warrants it, add a short body (1-3 lines) after a blank line explaining the why. Reply ONLY with the commit message in English — no preamble, no code fences.\n\nCurrent message (may be inaccurate or vague):\n${currentMsg}\n\nDiff:\n\`\`\`diff\n${truncateDiff(diff)}\n\`\`\``
  const r = await runAIPrompt(cfg, prompt)
  return r.error ? { error: r.error } : { message: r.text }
}

export async function aiExplainCommit(cfg: AIConfig, diff: string, subject: string, guidance?: string) {
  if (!diff.trim()) return { error: 'This commit has no change to analyse (a merge commit?)' }
  // Same shape as aiResolveConflict's instruction: the user's focus, appended.
  const guided = guidance?.trim()
    ? `\n\nUser guidance (what to focus the explanation on): ${guidance.trim()}`
    : ''
  const prompt = `You are a Git expert. Explain simply and concretely, in English, what this commit does: which files and behaviours change, and why it was probably done. 3 to 6 sentences maximum, no bullet list, no preamble.${guided}\n\nCommit message: ${subject}\n\nDiff:\n\`\`\`diff\n${truncateDiff(diff)}\n\`\`\``
  const r = await runAIPrompt(cfg, prompt, 768)
  return r.error ? { error: r.error } : { explanation: r.text }
}

const AI_CONFLICT_MAX_CHARS = 24000
export async function aiResolveConflict(cfg: AIConfig, filepath: string, content: string, instruction?: string) {
  if (!/^<{7}/m.test(content)) return { error: 'No conflict marker found in this file' }
  if (content.length > AI_CONFLICT_MAX_CHARS) {
    return { error: `File too long for AI resolution (${content.length} characters, max ${AI_CONFLICT_MAX_CHARS})` }
  }
  const extra = instruction?.trim()
    ? `\n\nUser guidance (follow it when choosing between sides): ${instruction.trim()}`
    : ''
  const prompt = `You are a Git merge expert. This file contains merge conflict markers (<<<<<<<, =======, >>>>>>>, and possibly ||||||| base sections). Resolve every conflict by producing the correct merged file: keep the intent of BOTH sides when they are compatible, otherwise pick the side that keeps the file consistent.${extra}

CRITICAL formatting rules:
- Copy the chosen lines EXACTLY as they appear: preserve every space, tab, indentation, trailing whitespace and blank line. Never reformat, re-indent, trim or normalize anything outside the conflicted regions — and inside them, reproduce the chosen side's lines byte-for-byte.
- No conflict markers, no code fences, no commentary inside the file.

Reply in EXACTLY this format:
EXPLANATION: <1 to 3 sentences in English explaining which sides you kept and why>
===FILE===
<the complete resolved file content, every line>

File (${filepath}):
${content}`
  const r = await runAIPrompt(cfg, prompt, 8192)
  if (r.error) return { error: r.error }
  const raw = r.text ?? ''
  let explanation = ''
  let resolution = raw
  const markerIdx = raw.indexOf('===FILE===')
  if (markerIdx !== -1) {
    explanation = raw.slice(0, markerIdx).replace(/^EXPLANATION:\s*/i, '').trim()
    resolution = raw.slice(markerIdx + '===FILE==='.length).replace(/^\n/, '')
  }
  const fenced = resolution.match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```\s*$/)
  if (fenced) resolution = fenced[1]
  if (/^[<=>]{7}/m.test(resolution)) return { error: 'The AI proposal still contains conflict markers — try again, possibly with a more precise instruction' }
  return { resolution, explanation }
}

// Returns the SHORT hashes the model matched; the caller expands/validates
// them against the actual repo (rev-parse) before handing them to the graph.
export async function aiSearchCommits(cfg: AIConfig, index: string, query: string): Promise<{ shortHashes?: string[]; error?: string }> {
  if (!query.trim()) return { shortHashes: [] }
  if (!index.trim()) return { shortHashes: [] }
  const today = new Date().toISOString().slice(0, 10)
  const prompt = `You are a Git history search engine. Today is ${today}. Below is a commit index, one commit per line: hash|author|date|subject.\n\nUser query (may be French or English, may reference dates, authors, file kinds, change intent): "${query.trim()}"\n\nReply with ONLY the hashes of matching commits, one per line, best matches first, at most 50. If nothing matches, reply with exactly NONE.\n\nIndex:\n${truncateDiff(index, 12000)}`
  const r = await runAIPrompt(cfg, prompt, 1024)
  if (r.error) return { error: r.error }
  const text = (r.text ?? '').trim()
  if (!text || text === 'NONE') return { shortHashes: [] }
  return { shortHashes: [...text.matchAll(/\b[0-9a-f]{7,40}\b/g)].map(m => m[0]).slice(0, 50) }
}
