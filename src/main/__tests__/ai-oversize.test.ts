import { readOversize, oversizeMessage } from '../ai-oversize'

// The strings below are REAL — copied from what each provider actually
// returned, not from its documentation. The Groq one is what this feature's
// own measurement produced, asking for the Complete level on a 28,000-character
// branch: the app showed it verbatim, organization id included.

const GROQ = 'Request too large for model `openai/gpt-oss-120b` in organization '
  + 'org_01ksn2tp7hfxqsa0jecdtpdad5 service tier `on_demand` on tokens per minute (TPM): '
  + 'Limit 8000, Requested 10013, please reduce your message size and try again.'
const OPENAI = "This model's maximum context length is 8192 tokens. However, your messages "
  + 'resulted in 10013 tokens. Please reduce the length of the messages.'
const ANTHROPIC = 'prompt is too long: 250000 tokens > 200000 maximum'
const GOOGLE = 'The input token count (1234567) exceeds the maximum number of tokens allowed (1048576).'

describe('recognising the refusal', () => {
  test('each provider says it differently, and each is read', () => {
    expect(readOversize(GROQ)).toEqual({ limit: 8000, requested: 10013 })
    expect(readOversize(OPENAI)).toEqual({ limit: 8192, requested: 10013 })
    expect(readOversize(ANTHROPIC)).toEqual({ limit: 200000, requested: 250000 })
    expect(readOversize(GOOGLE)).toEqual({ limit: 1048576, requested: 1234567 })
  })

  test('the phrase is enough — the numbers are a bonus, not the test', () => {
    // A local runtime gives prose and no figures at all.
    expect(readOversize('the request exceeds the available context size')).toEqual({})
    expect(readOversize('context_length_exceeded')).toEqual({})
  })

  test('an ordinary rate limit is NOT this, and must keep its retries', () => {
    // The dangerous false positive: waiting fixes a 429, and sending someone
    // to a detail setting instead would be advice that cannot work. It carries
    // Limit/Requested too, which is why numbers alone can never decide.
    expect(readOversize('Rate limit reached for gpt-4o in organization org_1 on requests per '
      + 'minute (RPM): Limit 500, Requested 501. Please try again in 120ms.')).toBeNull()
    expect(readOversize('overloaded_error')).toBeNull()
    expect(readOversize('model not found')).toBeNull()
    expect(readOversize('')).toBeNull()
  })
})

describe('what the user is told instead', () => {
  const at = (detail: any, headroom = 1) =>
    oversizeMessage(readOversize(GROQ)!, { model: 'openai/gpt-oss-120b', detail, headroom, raw: GROQ })

  test('the two numbers, in figures anyone can compare', () => {
    expect(at('full')).toContain('10,013 tokens against a limit of 8,000')
    expect(at('full')).toContain('openai/gpt-oss-120b')
  })

  test('it names ONE control, and the value to move it to', () => {
    // Three suggestions is a message nobody acts on.
    expect(at('full')).toContain('"What the model sees" to Standard')
    expect(at('full')).not.toContain('to Summary')
    expect(at('standard')).toContain('"What the model sees" to Summary')
    expect(at('standard')).not.toContain('to Standard')
  })

  test('no Markdown — the error is rendered as plain text in a span', () => {
    // AIAnswer.tsx puts it in <span>{error}</span>. Asterisks would show as
    // asterisks, which is how emphasis becomes litter. Only OUR sentence is
    // held to this: the provider quotes its own model name in backticks, and
    // that text is quoted, not authored.
    for (const d of ['full', 'standard', 'summary', undefined]) {
      // The first ' (' opens the quoted tail — our own sentence has no parens.
      const ours = at(d).slice(0, at(d).indexOf(' ('))
      expect({ d, markup: /[*_`]/.test(ours) }).toEqual({ d, markup: false })
    }
  })

  test('at the bottom there is nothing left to send less of, and it says so', () => {
    // Promising a setting that cannot help is worse than the raw string.
    expect(at('summary')).toContain('a model with more room')
    expect(at('summary')).not.toContain('What the model sees')
  })

  test('a feature with no diff is not sent to a diff setting', () => {
    // A conflict resolution sends a whole file; a search sends an index.
    expect(at(undefined)).toContain('no diff to send less of')
  })

  test('the reply ceiling is a clause, never the headline', () => {
    expect(at('full', 1)).not.toContain('reply length')
    const grown = at('full', 4)
    expect(grown).toContain('reply length is set to 4×')
    expect(grown.indexOf('*Standard*')).toBeLessThan(grown.indexOf('reply length'))
  })

  test("the provider's own words are kept — every account's limits differ", () => {
    expect(at('full')).toContain('Limit 8000, Requested 10013')
  })

  test('but not its upsell — a billing URL does not belong in an error line', () => {
    const withAd = GROQ + ' Need more tokens? Upgrade to Dev Tier today at '
      + 'https://console.groq.com/settings/billing'
    const msg = oversizeMessage(readOversize(withAd)!, {
      model: 'm', detail: 'full', headroom: 1, raw: withAd,
    })
    expect(msg).not.toContain('console.groq.com')
    expect(msg).toContain('…)')
  })

  test('a provider that gave no numbers still produces a sentence', () => {
    const msg = oversizeMessage({}, { model: 'llama3', detail: 'full', raw: 'context exceeded' })
    expect(msg).toContain('llama3 would not take this request — more than it takes')
    expect(msg).toContain('to Standard')
  })
})
