import * as fs from 'fs'
import * as path from 'path'
import { resolveAICall, appendInstructions } from '../ai-resolve'
import { AI_PROVIDER_CATALOG } from '../../renderer/src/utils/aiProviders'

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

describe('a provider that serves only some features', () => {
  const KEY = { aiTypesafeKey: 'ts_x', aiGroqKey: 'gsk_x' }

  test('it resolves for a feature it serves, dialect and base carried over', () => {
    const r = resolveAICall({
      ...KEY,
      aiDefaultProvider: 'groq', aiDefaultModel: 'llama-3.3-70b-versatile',
      'aiFeatureProvider:search': 'typesafe', 'aiFeatureModel:search': 'jev-latest',
    }, 'search')
    expect(r).toEqual(expect.objectContaining({
      provider: 'typesafe', model: 'jev-latest', apiKey: 'ts_x',
      dialect: 'typesafe', baseUrl: 'https://api.typesafe.ai/v1',
    }))
  })

  test('a pair on a feature it cannot serve falls through, exactly like a lost key', () => {
    // The picker will not offer this, so it can only arrive from a hand-edited
    // settings.json or from a `features` list that grew after the pair was
    // written. Either way it must not reach the wire: asking a judgement
    // engine for a commit message gets a probability where prose was wanted.
    const r = resolveAICall({
      ...KEY,
      aiDefaultProvider: 'groq', aiDefaultModel: 'llama-3.3-70b-versatile',
      'aiFeatureProvider:commit': 'typesafe', 'aiFeatureModel:commit': 'jev-latest',
    }, 'commit')
    expect(r).toEqual(expect.objectContaining({
      provider: 'groq', model: 'llama-3.3-70b-versatile', dialect: 'openai-compat',
    }))
  })

  test('as the DEFAULT pair it serves what it can and falls through for the rest', () => {
    const s = {
      ...KEY,
      aiProvider: 'groq', aiGroqModel: 'llama-3.3-70b-versatile',
      aiDefaultProvider: 'typesafe', aiDefaultModel: 'jev-latest',
    }
    expect(resolveAICall(s, 'filter').provider).toBe('typesafe')
    expect(resolveAICall(s, 'explain').provider).toBe('groq')
  })

  test('without its key it falls through even on a feature it serves', () => {
    const r = resolveAICall({
      aiGroqKey: 'gsk_x',
      aiDefaultProvider: 'groq', aiDefaultModel: 'llama-3.3-70b-versatile',
      'aiFeatureProvider:search': 'typesafe', 'aiFeatureModel:search': 'jev-latest',
    }, 'search')
    expect(r.provider).toBe('groq')
  })

  test('the last resort is never a provider that cannot answer', () => {
    // Level 4 is what the three above fall onto, so it has to answer whatever
    // was asked. `aiProvider` predates the rework and only ever held one of
    // the four — but it is a string in a JSON file, and landing here with a
    // judgement engine would leave the call with no model at all.
    const r = resolveAICall({ ...KEY, aiProvider: 'typesafe' }, 'commit')
    expect(r.provider).toBe('groq')
    expect(r.model).toBe('llama-3.3-70b-versatile')
  })

  test('it still answers there for a feature it serves', () => {
    const r = resolveAICall({ ...KEY, aiProvider: 'typesafe' }, 'search')
    expect(r).toEqual(expect.objectContaining({ provider: 'typesafe', dialect: 'typesafe' }))
  })

  test('an unknown legacy provider lands on a real one rather than on nothing', () => {
    // Falls out of the same gate: an id nothing in the catalog answers to used
    // to come back paired with `model: undefined`.
    const r = resolveAICall({ aiGroqKey: 'gsk_x', aiProvider: 'not-a-provider' }, 'commit')
    expect(r.provider).toBe('groq')
    expect(r.model).toBe('llama-3.3-70b-versatile')
  })

  test('every feature a catalog entry claims is a real feature', () => {
    // The DIFF_FEATURES arrangement: `AIFeature` is a type, erased before any
    // test can see it, so the union is read out of its own source. A typo in
    // a `features` list would otherwise be a provider silently offered
    // nowhere — and `providerServes` would answer false for ever.
    const src = fs.readFileSync(path.join(__dirname, '../ai-resolve.ts'), 'utf8')
    const m = src.match(/export type AIFeature =([\s\S]*?)\n\n/)
    expect(m).not.toBeNull()
    const known = [...m![1].matchAll(/'([a-z]+)'/g)].map(x => x[1])
    expect(known).toContain('search')
    for (const p of AI_PROVIDER_CATALOG) {
      for (const f of p.features ?? []) expect(known).toContain(f)
    }
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
