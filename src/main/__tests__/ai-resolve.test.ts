import { resolveAICall, appendInstructions } from '../ai-resolve'

// #70 — the contract both hosts implement: no active provider, every choice
// a (provider, model) pair, a pair without its key falling through, and the
// user's instructions riding AFTER the prompt's rules. This suite is the
// free half; the paid half (real API calls through the same modules) lives
// in tests-live/ and runs only by hand.

const KEYS = { aiGroqKey: 'gsk_x', aiAnthropicKey: 'sk-ant-x' }

describe('which pair a call runs on', () => {
  test("the feature's own pair wins", () => {
    const r = resolveAICall({
      ...KEYS,
      aiDefaultProvider: 'groq', aiDefaultModel: 'llama-3.3-70b-versatile',
      'aiFeatureProvider:pr': 'anthropic', 'aiFeatureModel:pr': 'claude-haiku-4-5-20251001',
    }, 'pr')
    expect(r).toEqual(expect.objectContaining({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001', apiKey: 'sk-ant-x', dialect: 'anthropic' }))
  })

  test('two features can run on two providers at once', () => {
    const s = {
      ...KEYS,
      aiDefaultProvider: 'groq', aiDefaultModel: 'llama-3.3-70b-versatile',
      'aiFeatureProvider:pr': 'anthropic', 'aiFeatureModel:pr': 'claude-haiku-4-5-20251001',
    }
    expect(resolveAICall(s, 'pr').provider).toBe('anthropic')
    expect(resolveAICall(s, 'commit').provider).toBe('groq')
  })

  test('a pair whose provider lost its key falls through to the default', () => {
    const r = resolveAICall({
      aiGroqKey: 'gsk_x',   // no anthropic key any more
      aiDefaultProvider: 'groq', aiDefaultModel: 'llama-3.3-70b-versatile',
      'aiFeatureProvider:pr': 'anthropic', 'aiFeatureModel:pr': 'claude-haiku-4-5-20251001',
    }, 'pr')
    expect(r).toEqual(expect.objectContaining({ provider: 'groq', model: 'llama-3.3-70b-versatile', apiKey: 'gsk_x', dialect: 'openai-compat' }))
  })

  test('a legacy override — model without provider — reads against the legacy provider', () => {
    const r = resolveAICall({
      aiGroqKey: 'gsk_x', aiProvider: 'groq',
      'aiFeatureModel:filter': 'llama-3.1-8b-instant',
    }, 'filter')
    expect(r).toEqual(expect.objectContaining({ provider: 'groq', model: 'llama-3.1-8b-instant', apiKey: 'gsk_x' }))
  })

  test('no overrides at all resolves the legacy single-provider settings', () => {
    const r = resolveAICall({ aiProvider: 'groq', aiGroqModel: 'llama-3.3-70b-versatile', groqApiKey: 'old-key' })
    expect(r).toEqual(expect.objectContaining({ provider: 'groq', model: 'llama-3.3-70b-versatile', apiKey: 'old-key' }))
  })

  test('a default pair without its key falls through to legacy', () => {
    const r = resolveAICall({
      aiProvider: 'groq', aiGroqKey: 'gsk_x', aiGroqModel: 'llama-3.3-70b-versatile',
      aiDefaultProvider: 'openai', aiDefaultModel: 'gpt-4o-mini',
    }, 'commit')
    expect(r.provider).toBe('groq')
  })
})

describe('providers beyond the original four (#169)', () => {
  const CUSTOM = JSON.stringify([{ id: 'custom-ollama', label: 'Ollama', baseUrl: 'http://localhost:11434/v1' }])

  test('a catalog cloud resolves like any other — a key and its base URL', () => {
    const r = resolveAICall({
      aiMistralKey: 'mk_x',
      aiDefaultProvider: 'mistral', aiDefaultModel: 'mistral-small-latest',
    }, 'commit')
    expect(r).toEqual(expect.objectContaining({
      provider: 'mistral', model: 'mistral-small-latest', apiKey: 'mk_x',
      dialect: 'openai-compat', baseUrl: 'https://api.mistral.ai/v1', keyless: false,
    }))
  })

  test('a keyless local endpoint is USABLE — connected stopped meaning "has a key"', () => {
    const r = resolveAICall({
      aiCustomProviders: CUSTOM,
      aiDefaultProvider: 'custom-ollama', aiDefaultModel: 'qwen2.5-coder:7b',
    }, 'pr')
    expect(r).toEqual(expect.objectContaining({
      provider: 'custom-ollama', model: 'qwen2.5-coder:7b', apiKey: '',
      dialect: 'openai-compat', baseUrl: 'http://localhost:11434/v1', keyless: true,
    }))
  })

  test('a feature can point at the local model while the default stays cloud', () => {
    const s = {
      aiGroqKey: 'gsk_x', aiCustomProviders: CUSTOM,
      aiDefaultProvider: 'groq', aiDefaultModel: 'llama-3.3-70b-versatile',
      'aiFeatureProvider:explain': 'custom-ollama', 'aiFeatureModel:explain': 'deepseek-r1:14b',
    }
    expect(resolveAICall(s, 'explain').baseUrl).toBe('http://localhost:11434/v1')
    expect(resolveAICall(s, 'commit').provider).toBe('groq')
  })

  test('the quirks travel with the resolution to the caller', () => {
    const r = resolveAICall({
      aiCustomProviders: JSON.stringify([{
        id: 'custom-gw', label: 'GW', baseUrl: 'https://gw.local/v1', key: 'k',
        authHeader: 'api-key', extraHeaders: { 'X-Tenant': 't1' },
      }]),
      aiDefaultProvider: 'custom-gw', aiDefaultModel: 'm',
    })
    expect(r.authHeader).toBe('api-key')
    expect(r.extraHeaders).toEqual({ 'X-Tenant': 't1' })
  })

  test('a malformed customs blob costs the entry, never the resolution', () => {
    const r = resolveAICall({
      aiGroqKey: 'gsk_x', aiProvider: 'groq', aiGroqModel: 'llama-3.3-70b-versatile',
      aiCustomProviders: '{not json',
      aiDefaultProvider: 'custom-ollama', aiDefaultModel: 'qwen2.5-coder:7b',
    })
    expect(r.provider).toBe('groq')  // the broken custom fell through to legacy
  })
})

describe('how instructions ride', () => {
  test('global then feature, appended after the rules', () => {
    const out = appendInstructions('THE RULES.', {
      aiGlobalInstructions: 'Keep it concise',
      'aiFeatureInstructions:pr': 'Bullet the notable changes',
    }, 'pr')
    expect(out.startsWith('THE RULES.')).toBe(true)
    expect(out.indexOf('Keep it concise')).toBeLessThan(out.indexOf('Bullet the notable changes'))
    expect(out).toContain('where they do not conflict with the rules above')
  })

  test('no instructions means the prompt untouched — no empty scaffold', () => {
    expect(appendInstructions('THE RULES.', {})).toBe('THE RULES.')
    expect(appendInstructions('THE RULES.', { aiGlobalInstructions: '  ' })).toBe('THE RULES.')
  })

  test("another feature's instructions never leak in", () => {
    const out = appendInstructions('P.', { 'aiFeatureInstructions:pr': 'Bullets' }, 'commit')
    expect(out).toBe('P.')
  })
})
