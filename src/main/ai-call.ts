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

/**
 * What came back, and whether the model was cut off mid-answer.
 *
 * `truncated` is the fact this used to throw away (#183). All three dialects
 * say it — `finish_reason: 'length'`, `stop_reason: 'max_tokens'`,
 * `finishReason: 'MAX_TOKENS'` — and discarding it is how a budget that was
 * too small for a reasoning model read as "the model returned nothing", three
 * times, with no way to tell it from a bad key.
 */
export interface ProviderAnswer { text: string; truncated: boolean }

export async function callProvider(
  target: Pick<ResolvedAI, 'provider' | 'model' | 'apiKey' | 'dialect' | 'baseUrl' | 'authHeader' | 'extraHeaders'>,
  prompt: string, maxTokens: number,
): Promise<ProviderAnswer> {
  const { model, apiKey } = target
  if (target.dialect === 'anthropic') {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey })
    const res = await client.messages.create({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] })
    return {
      text: (res.content[0] as any)?.text?.trim() ?? '',
      truncated: (res as any).stop_reason === 'max_tokens',
    }
  }
  if (target.dialect === 'google') {
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(apiKey)
    const genModel = genAI.getGenerativeModel({ model })
    const result = await genModel.generateContent(prompt)
    const reason = (result.response as any)?.candidates?.[0]?.finishReason
    return { text: result.response.text().trim(), truncated: reason === 'MAX_TOKENS' }
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
  const choice = data.choices?.[0]
  return {
    text: (choice?.message?.content ?? '').trim(),
    // `length` is the OpenAI spelling; some gateways send `max_tokens`.
    truncated: choice?.finish_reason === 'length' || choice?.finish_reason === 'max_tokens',
  }
}
