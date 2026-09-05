import { callProvider } from '../ai-call'

// The fact this used to throw away (#183): every dialect says when it ran out
// of room, and discarding it is how a budget too small for a reasoning model
// read as "the model returned nothing", three times, indistinguishable from a
// bad key or a bad prompt.

const target = {
  provider: 'local', model: 'a-model', apiKey: '', dialect: 'openai-compat' as const,
  baseUrl: 'http://localhost:1234/v1',
}

function answering(body: unknown, ok = true) {
  return jest.fn().mockResolvedValue({
    ok, status: ok ? 200 : 400, json: async () => body,
  }) as unknown as typeof fetch
}

describe('an openai-compatible answer', () => {
  const original = global.fetch
  afterEach(() => { global.fetch = original })

  test('a complete answer is not truncated', async () => {
    global.fetch = answering({ choices: [{ message: { content: ' done ' }, finish_reason: 'stop' }] })
    expect(await callProvider(target, 'p', 512)).toEqual({ text: 'done', truncated: false })
  })

  test('`length` is the model running out of room, and it is reported', async () => {
    global.fetch = answering({ choices: [{ message: { content: 'half an ans' }, finish_reason: 'length' }] })
    expect(await callProvider(target, 'p', 512)).toEqual({ text: 'half an ans', truncated: true })
  })

  test('a gateway that spells it `max_tokens` means the same thing', async () => {
    global.fetch = answering({ choices: [{ message: { content: 'x' }, finish_reason: 'max_tokens' }] })
    expect((await callProvider(target, 'p', 512)).truncated).toBe(true)
  })

  test('cut off before it wrote anything — the case that read as "empty"', async () => {
    // A reasoning model spends the budget thinking and emits nothing at all.
    // Empty AND truncated: without the second half there is nothing to say.
    global.fetch = answering({ choices: [{ message: { content: '' }, finish_reason: 'length' }] })
    expect(await callProvider(target, 'p', 128)).toEqual({ text: '', truncated: true })
  })

  test('an error is still an error, not a truncation', async () => {
    global.fetch = answering({ error: { message: 'model not found' } }, false)
    await expect(callProvider(target, 'p', 512)).rejects.toThrow('model not found')
  })

  test('a body with no choices at all does not crash', async () => {
    global.fetch = answering({})
    expect(await callProvider(target, 'p', 512)).toEqual({ text: '', truncated: false })
  })

  test('the budget it was given is the budget it sends', async () => {
    const fetchMock = answering({ choices: [{ message: { content: 'x' }, finish_reason: 'stop' }] })
    global.fetch = fetchMock
    await callProvider(target, 'the prompt', 3072)
    const body = JSON.parse((fetchMock as jest.Mock).mock.calls[0][1].body)
    expect(body).toMatchObject({ model: 'a-model', max_tokens: 3072 })
  })
})
