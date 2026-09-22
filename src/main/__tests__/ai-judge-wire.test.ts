import { callJudge } from '../ai-judge'
import { authHeaders } from '../../renderer/src/utils/aiProviders'

// The fourth dialect on the wire. What matters here is the shape of the
// request — a judgement goes to /systemone, not to /chat/completions — and
// that a refusal arrives as a sentence rather than as an HTTP number.

const target = {
  model: 'jev-latest', apiKey: 'ts_k',
  baseUrl: 'https://api.typesafe.ai/v1',
  authHeader: undefined, extraHeaders: undefined,
}
const questions = { c0: { type: 'noul' as const, instructions: 'Does `commits[0]` answer `search`?' } }

const reply = (body: unknown, init: { status?: number } = {}) => jest.fn().mockResolvedValue({
  ok: (init.status ?? 200) < 400,
  status: init.status ?? 200,
  json: async () => body,
})

afterEach(() => { delete (global as any).fetch })

describe('callJudge on the wire', () => {
  test('posts the questions to /systemone, with the model and the state', async () => {
    const f = reply({ answers: { c0: { type: 'noul', noul: 0.8 } } })
    ;(global as any).fetch = f
    await callJudge(target, { search: 'x' }, questions, authHeaders)

    const [url, init] = f.mock.calls[0]
    // Not /chat/completions: this host serves one endpoint and the other
    // would 404, which the settings page would show as a dead provider.
    expect(url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      model: 'jev-latest', state: { search: 'x' }, questions,
    })
  })

  test('the key rides through the one auth interpreter', async () => {
    const f = reply({ answers: {} })
    ;(global as any).fetch = f
    await callJudge(target, {}, questions, authHeaders)
    expect(f.mock.calls[0][1].headers).toEqual(expect.objectContaining({
      Authorization: 'Bearer ts_k', 'content-type': 'application/json',
    }))
  })

  test('a trailing slash on the base does not double the one in the path', async () => {
    const f = reply({ answers: {} })
    ;(global as any).fetch = f
    await callJudge({ ...target, baseUrl: 'https://api.typesafe.ai/v1//' }, {}, questions, authHeaders)
    expect(f.mock.calls[0][0]).toBe('https://api.typesafe.ai/v1/systemone')
  })

  test('the answers come back keyed as they were asked', async () => {
    ;(global as any).fetch = reply({
      answers: { c0: { type: 'noul', noul: 0.91 } },
      usage: { input_tokens: 1200, output_tokens: 0 },
    })
    const r = await callJudge(target, {}, questions, authHeaders)
    expect(r.answers.c0.noul).toBe(0.91)
    expect(r.usage?.input_tokens).toBe(1200)
  })

  test('a reply with no answers is empty, not undefined', async () => {
    ;(global as any).fetch = reply({})
    expect((await callJudge(target, {}, questions, authHeaders)).answers).toEqual({})
  })

  test('a refused key says so, rather than "HTTP 401"', async () => {
    ;(global as any).fetch = reply({}, { status: 401 })
    await expect(callJudge(target, {}, questions, authHeaders)).rejects.toThrow(/key was refused/i)
  })

  test('being rate limited says which crowd it is — the runtime retries that one', async () => {
    ;(global as any).fetch = reply({}, { status: 429 })
    await expect(callJudge(target, {}, questions, authHeaders)).rejects.toThrow(/rate limited/i)
  })

  test("the provider's own words win over ours when it gives any", async () => {
    ;(global as any).fetch = reply({ error: { message: 'state exceeds 32k tokens' } }, { status: 422 })
    await expect(callJudge(target, {}, questions, authHeaders)).rejects.toThrow('state exceeds 32k tokens')
  })

  test('a body that is not JSON still fails with the status', async () => {
    ;(global as any).fetch = jest.fn().mockResolvedValue({
      ok: false, status: 502, json: async () => { throw new Error('not json') },
    })
    await expect(callJudge(target, {}, questions, authHeaders)).rejects.toThrow('HTTP 502')
  })
})
