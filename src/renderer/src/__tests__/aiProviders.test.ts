import { parseCustomProviders, providerUsable, providerCredential, allProviders, AI_PROVIDER_CATALOG } from '../utils/aiProviders'

// #169 — providers are DATA over three dialects. The catalog is code; the
// customs are user JSON, and malformed input costs the entry, never the
// feature (the autolink rule).

describe('the catalog', () => {
  test('every entry knows its dialect, and the openai-compat ones their base', () => {
    for (const p of AI_PROVIDER_CATALOG) {
      if (p.dialect === 'openai-compat') expect(p.baseUrl).toMatch(/^https:\/\//)
      expect(p.keySetting).toBeTruthy()
    }
  })

  test('the four originals kept their legacy settings; the new clouds have none', () => {
    expect(AI_PROVIDER_CATALOG.filter(p => p.legacyModelSetting).map(p => p.id))
      .toEqual(['anthropic', 'google', 'groq', 'openai'])
    expect(AI_PROVIDER_CATALOG.map(p => p.id))
      .toEqual(expect.arrayContaining(['mistral', 'deepseek', 'xai', 'openrouter']))
  })
})

describe('the customs blob', () => {
  test('a good entry comes through normalised — trailing slash shed, key kept', () => {
    const [c] = parseCustomProviders(JSON.stringify([
      { id: 'custom-ollama', label: 'Ollama', baseUrl: 'http://localhost:11434/v1/', key: '' },
    ]))
    expect(c).toEqual(expect.objectContaining({
      id: 'custom-ollama', baseUrl: 'http://localhost:11434/v1', custom: true, dialect: 'openai-compat',
    }))
  })

  test('a malformed entry costs the entry, never the list', () => {
    const out = parseCustomProviders(JSON.stringify([
      { id: 'ok', label: 'x', baseUrl: 'http://a/v1' },
      { label: 'no id', baseUrl: 'http://b/v1' },
      { id: 'no-url' },
      'not even an object',
    ]))
    expect(out.map(c => c.id)).toEqual(['ok'])
  })

  test.each(['{not json', '42', '"a string"'])('garbage (%s) is an empty list', raw => {
    expect(parseCustomProviders(raw)).toEqual([])
  })
})

describe('usable — connected stopped meaning "has a key"', () => {
  const s = { aiCustomProviders: JSON.stringify([{ id: 'custom-lm', label: 'LM', baseUrl: 'http://localhost:1234/v1' }]) }

  test('a keyless custom is usable; a keyless catalog cloud is not', () => {
    const custom = allProviders(s).find(p => p.id === 'custom-lm')!
    const mistral = allProviders(s).find(p => p.id === 'mistral')!
    expect(providerUsable(s, custom)).toBe(true)
    expect(providerUsable(s, mistral)).toBe(false)
  })

  test("groq still answers to its pre-rename key", () => {
    const groq = AI_PROVIDER_CATALOG.find(p => p.id === 'groq')!
    expect(providerCredential({ groqApiKey: 'old' }, groq)).toBe('old')
  })
})
