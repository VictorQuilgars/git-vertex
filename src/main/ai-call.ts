// ai-call.ts — one provider round-trip, given everything already resolved.
// Free of `electron` (the theme-validate pattern) so the manual live suite
// (tests-live/) can drive the SAME code production uses. The retry loop and
// the logging stay in the main process, which owns the policy; this module
// owns only the wire shapes.

export async function callProvider(
  provider: string, apiKey: string, model: string, prompt: string, maxTokens: number,
): Promise<string> {
  if (provider === 'anthropic') {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey })
    const res = await client.messages.create({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] })
    return (res.content[0] as any).text?.trim() ?? ''
  }
  if (provider === 'google') {
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(apiKey)
    const genModel = genAI.getGenerativeModel({ model })
    const result = await genModel.generateContent(prompt)
    return result.response.text().trim()
  }
  if (provider === 'openai') {
    const OpenAI = (await import('openai')).default
    const client = new OpenAI({ apiKey })
    const response = await client.chat.completions.create({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] })
    return response.choices[0]?.message?.content?.trim() ?? ''
  }
  // groq (default)
  const Groq = (await import('groq-sdk')).default
  const client = new Groq({ apiKey })
  const response = await client.chat.completions.create({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] })
  return response.choices[0]?.message?.content?.trim() ?? ''
}
