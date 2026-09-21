import { parseCustomProviders, providerUsable, providerServes, providerCredential, allProviders, AI_PROVIDER_CATALOG } from '../utils/aiProviders'

// #169 — providers are DATA over three dialects. The catalog is code; the
// customs are user JSON, and malformed input costs the entry, never the
// feature (the autolink rule).

describe('the catalog', () => {
  test('every entry knows its dialect, and the ones spoken elsewhere their base', () => {
    for (const p of AI_PROVIDER_CATALOG) {
      if (p.dialect === 'openai-compat' || p.dialect === 'typesafe') expect(p.baseUrl).toMatch(/^https:\/\//)
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

describe('serves — what a provider has an answer for', () => {
  const generative = AI_PROVIDER_CATALOG.find(p => p.id === 'groq')!
  const judge = AI_PROVIDER_CATALOG.find(p => p.id === 'typesafe')!

  test('a def that names no features serves them all, asked or not', () => {
    expect(providerServes(generative, 'commit')).toBe(true)
    expect(providerServes(generative, 'search')).toBe(true)
    expect(providerServes(generative, undefined)).toBe(true)
  })

  test('a def that names its features serves those and refuses the rest', () => {
    expect(providerServes(judge, 'search')).toBe(true)
    expect(providerServes(judge, 'filter')).toBe(true)
    expect(providerServes(judge, 'commit')).toBe(false)
    expect(providerServes(judge, 'conflict')).toBe(false)
  })

  test('no feature named is not a refusal — it is the question not being asked', () => {
    // A call with no feature is the one runAIPrompt makes for the odd jobs
    // that belong to no setting. Reading that as "serves nothing" would make
    // the default pair unresolvable for them.
    expect(providerServes(judge, undefined)).toBe(true)
  })

  test('only the judgement engine is restricted, so far', () => {
    // Not a style rule: every other entry answers a prompt with prose, and
    // an entry that quietly grew a `features` list would silently stop
    // being offered on features it used to serve.
    expect(AI_PROVIDER_CATALOG.filter(p => p.features).map(p => p.id)).toEqual(['typesafe'])
  })

  test('a custom entry is never restricted — the blob cannot carry features', () => {
    // Customs speak openai-compat by construction (#169). Letting a user
    // hand-write `features` would let them hide a provider from a feature
    // with no control on screen to put it back.
    const [c] = parseCustomProviders(JSON.stringify([
      { id: 'custom-x', baseUrl: 'https://gw/v1', features: ['search'] },
    ]))
    expect(c.features).toBeUndefined()
    expect(providerServes(c, 'commit')).toBe(true)
  })
})

describe('the auth quirks — one interpreter, never formats (#169 P2)', () => {
  const { authHeaders } = require('../utils/aiProviders')

  test('the default is Bearer, and no key means no auth header at all', () => {
    expect(authHeaders({ apiKey: 'k' })).toEqual({ Authorization: 'Bearer k' })
    expect(authHeaders({})).toEqual({})
  })

  test('a named header carries the RAW key — the api-key style', () => {
    expect(authHeaders({ apiKey: 'k', authHeader: 'api-key' })).toEqual({ 'api-key': 'k' })
  })

  test('naming Authorization itself keeps the Bearer prefix', () => {
    expect(authHeaders({ apiKey: 'k', authHeader: 'Authorization' })).toEqual({ Authorization: 'Bearer k' })
  })

  test('extra headers ride along — and alone, when there is no key', () => {
    expect(authHeaders({ apiKey: 'k', extraHeaders: { 'X-Title': 'Git Vertex' } }))
      .toEqual({ 'X-Title': 'Git Vertex', Authorization: 'Bearer k' })
    expect(authHeaders({ extraHeaders: { 'X-Tenant': 't1' } })).toEqual({ 'X-Tenant': 't1' })
  })

  test('the quirks survive the customs blob round-trip', () => {
    const [c] = parseCustomProviders(JSON.stringify([{
      id: 'custom-gw', label: 'Gateway', baseUrl: 'https://gw.local/v1',
      key: 'k', authHeader: 'api-key', extraHeaders: { 'X-Tenant': 't1', bad: 42 },
    }]))
    expect(c.authHeader).toBe('api-key')
    expect(c.extraHeaders).toEqual({ 'X-Tenant': 't1' })  // the non-string value cost its line
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
