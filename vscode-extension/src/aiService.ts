// aiService.ts — AI pipeline for the VS Code extension host.
// Mirrors the desktop app's runAIPrompt + feature prompts, but calls the
// providers' REST APIs directly with fetch (no SDK dependencies) so the
// extension stays lightweight. Configuration comes from VS Code settings
// (gitVertex.aiProvider / aiApiKey / aiModel), falling back to the shared
// gvSettings store (same keys as the desktop app) if present.
import * as vscode from 'vscode'

export interface AIConfig { provider: string; apiKey: string; model: string }

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

export function readAIConfig(state: vscode.Memento): AIConfig | null {
  const cfg = vscode.workspace.getConfiguration('gitVertex')
  const gv = state.get<Record<string, string>>('gvSettings', {})
  const provider = (userSetting(cfg, 'aiProvider') || gv.aiProvider || 'groq').toLowerCase()
  const apiKey = userSetting(cfg, 'aiApiKey')
    || gv[KEY_SETTING[provider] ?? 'aiGroqKey']
    || (provider === 'groq' ? gv.groqApiKey : '')
    || ''
  const model = userSetting(cfg, 'aiModel')
    || gv[MODEL_SETTING[provider] ?? '']
    || MODEL_DEFAULTS[provider]
    || MODEL_DEFAULTS.groq
  if (!apiKey) return null
  return { provider, apiKey, model }
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
  if (res.status === 429) msg = `${label} : quota ou limite de débit atteint (429)${detail ? ` — ${detail}` : ''}. Attendez un peu ou changez de modèle/fournisseur.`
  else if (res.status === 503 || res.status === 529) msg = `${label} : modèle surchargé (${res.status})${detail ? ` — ${detail}` : ''}. Réessayez dans quelques instants ou changez de modèle.`
  else if (res.status === 401 || res.status === 403) msg = `${label} : clé API refusée (${res.status})${detail ? ` — ${detail}` : ''}.`
  else msg = `${label} HTTP ${res.status}${detail ? ` — ${detail}` : ''}`
  throw new AIHttpError(msg, res.status, retryAfterMs)
}

async function callOnce(cfg: AIConfig, prompt: string, maxTokens: number): Promise<string> {
  const { provider, apiKey, model } = cfg
  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!res.ok) await throwHttpError(provider, res)
    const data = await res.json() as any
    return (data.content?.[0]?.text ?? '').trim()
  }
  if (provider === 'google') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    })
    if (!res.ok) await throwHttpError(provider, res)
    const data = await res.json() as any
    return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
  }
  // groq & openai share the OpenAI chat-completions shape
  const base = provider === 'openai' ? 'https://api.openai.com' : 'https://api.groq.com/openai'
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) await throwHttpError(provider, res)
  const data = await res.json() as any
  return (data.choices?.[0]?.message?.content ?? '').trim()
}

export async function runAIPrompt(cfg: AIConfig, prompt: string, maxTokens = 512): Promise<{ text?: string; error?: string }> {
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
  return { error: 'Le modèle a retourné une réponse vide après 3 tentatives' }
}

export const truncateDiff = (diff: string, max = 6000) =>
  diff.length > max ? diff.slice(0, max) + '\n... [diff tronqué]' : diff

// Live model list per provider — mirrors the desktop's ai:list-provider-models
// (Groq's audio-only whisper models filtered out, OpenAI trimmed to chat models).
export async function listProviderModels(provider: string, apiKey: string): Promise<{ models?: string[]; error?: string }> {
  try {
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
  if (!stagedDiff.trim()) return { error: 'Aucun changement indexé à analyser' }
  const prompt = `You are a Git expert. Analyze this diff and generate a concise commit message following Conventional Commits (feat/fix/docs/chore/refactor/style/test/perf). First line: type(scope): description (max 72 chars). Reply ONLY with the commit message in English.\n\nDiff:\n\`\`\`diff\n${truncateDiff(stagedDiff)}\n\`\`\``
  const r = await runAIPrompt(cfg, prompt)
  return r.error ? { error: r.error } : { message: r.text }
}

export async function aiRecomposeCommit(cfg: AIConfig, diff: string, currentMsg: string) {
  if (!diff.trim()) return { error: 'Ce commit ne contient aucun changement à analyser (commit de merge ?)' }
  const prompt = `You are a Git expert. Rewrite this commit's message based on what the diff ACTUALLY changes. Follow Conventional Commits (feat/fix/docs/chore/refactor/style/test/perf). First line: type(scope): description (max 72 chars). If the change warrants it, add a short body (1-3 lines) after a blank line explaining the why. Reply ONLY with the commit message in English — no preamble, no code fences.\n\nCurrent message (may be inaccurate or vague):\n${currentMsg}\n\nDiff:\n\`\`\`diff\n${truncateDiff(diff)}\n\`\`\``
  const r = await runAIPrompt(cfg, prompt)
  return r.error ? { error: r.error } : { message: r.text }
}

export async function aiExplainCommit(cfg: AIConfig, diff: string, subject: string) {
  if (!diff.trim()) return { error: 'Ce commit ne contient aucun changement à analyser (commit de merge ?)' }
  const prompt = `Tu es un expert Git. Explique en français, simplement et concrètement, ce que fait ce commit : quels fichiers/comportements changent et pourquoi c'est probablement fait. 3 à 6 phrases maximum, pas de liste à puces, pas de préambule.\n\nMessage du commit : ${subject}\n\nDiff :\n\`\`\`diff\n${truncateDiff(diff)}\n\`\`\``
  const r = await runAIPrompt(cfg, prompt, 768)
  return r.error ? { error: r.error } : { explanation: r.text }
}

const AI_CONFLICT_MAX_CHARS = 24000
export async function aiResolveConflict(cfg: AIConfig, filepath: string, content: string, instruction?: string) {
  if (!/^<{7}/m.test(content)) return { error: 'Aucun marqueur de conflit trouvé dans ce fichier' }
  if (content.length > AI_CONFLICT_MAX_CHARS) {
    return { error: `Fichier trop long pour la résolution IA (${content.length} caractères, max ${AI_CONFLICT_MAX_CHARS})` }
  }
  const extra = instruction?.trim()
    ? `\n\nUser guidance (follow it when choosing between sides): ${instruction.trim()}`
    : ''
  const prompt = `You are a Git merge expert. This file contains merge conflict markers (<<<<<<<, =======, >>>>>>>, and possibly ||||||| base sections). Resolve every conflict by producing the correct merged file: keep the intent of BOTH sides when they are compatible, otherwise pick the side that keeps the file consistent.${extra}

CRITICAL formatting rules:
- Copy the chosen lines EXACTLY as they appear: preserve every space, tab, indentation, trailing whitespace and blank line. Never reformat, re-indent, trim or normalize anything outside the conflicted regions — and inside them, reproduce the chosen side's lines byte-for-byte.
- No conflict markers, no code fences, no commentary inside the file.

Reply in EXACTLY this format:
EXPLANATION: <1 à 3 phrases en français expliquant quels côtés tu as choisis et pourquoi>
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
  if (/^[<=>]{7}/m.test(resolution)) return { error: "La proposition de l'IA contient encore des marqueurs de conflit — réessayez, éventuellement avec une instruction plus précise" }
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
