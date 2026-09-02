// ai-call.ts — one provider round-trip, given everything already resolved.
// Free of `electron` (the theme-validate pattern) so the manual live suite
// (tests-live/) can drive the SAME code production uses. The retry loop and
// the logging stay in the main process, which owns the policy; this module
// owns only the wire DIALECTS — three of them, and the third (OpenAI
// chat-completions) is what every extra cloud and every local runtime
// speaks, which is why adding a provider is a catalog line and not a
// function here (#169).

import type { ResolvedAI } from './ai-resolve'
import { authHeaders } from '../renderer/src/utils/aiProviders'

export async function callProvider(
  target: Pick<ResolvedAI, 'provider' | 'model' | 'apiKey' | 'dialect' | 'baseUrl' | 'authHeader' | 'extraHeaders'>,
  prompt: string, maxTokens: number,
): Promise<string> {
  const { model, apiKey } = target
  if (target.dialect === 'anthropic') {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey })
    const res = await client.messages.create({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] })
    return (res.content[0] as any).text?.trim() ?? ''
  }
  if (target.dialect === 'google') {
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(apiKey)
    const genModel = genAI.getGenerativeModel({ model })
    const result = await genModel.generateContent(prompt)
    return result.response.text().trim()
  }
  // openai-compat — a plain fetch, because the base URL is the whole point:
  // api.openai.com, api.groq.com/openai, a Mistral, an Ollama on localhost.
  const base = (target.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '')
  // The auth quirks live in ONE interpreter (authHeaders) — a named header
  // carries the raw key, extras ride along, default stays Bearer.
  const headers: Record<string, string> = { 'content-type': 'application/json', ...authHeaders(target) }
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  })
  const data = await res.json().catch(() => ({})) as any
  if (!res.ok) throw new Error(data?.error?.message ?? data?.error ?? `HTTP ${res.status}`)
  return (data.choices?.[0]?.message?.content ?? '').trim()
}
