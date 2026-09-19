import { batchPlan, resolveBatch, BatchDeps, NO_API_KEY } from '../conflict-batch'

// The run behind "Resolve all with AI" (#269), over injected calls: what it
// attempts, what it leaves to the user, and how it ends.

function deps(over: Partial<BatchDeps> = {}): BatchDeps & { written: Record<string, string> } {
  const written: Record<string, string> = {}
  return {
    written,
    propose: async file => ({ resolution: `merged ${file}`, explanation: `why ${file}` }),
    write: async (file, content) => { written[file] = content; return { success: true } },
    stopped: () => false,
    ...over,
  }
}

describe('batchPlan', () => {
  test('content conflicts are attempted; a deletion on one side is the user’s call', () => {
    const plan = batchPlan(['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'], {
      'a.ts': 'both-modified', 'b.ts': 'deleted-by-them', 'c.ts': 'both-added',
      'd.ts': 'added-by-us', /* e.ts: the host could not say */
    })
    expect(plan).toEqual({ attempt: ['a.ts', 'c.ts', 'e.ts'], skip: ['b.ts', 'd.ts'] })
  })
})

describe('resolveBatch', () => {
  test('every file is proposed, written and reported in the order of the list', async () => {
    const d = deps()
    const { outcomes, missingKey } = await resolveBatch(['a', 'b', 'c'], d)
    expect(missingKey).toBe(false)
    expect(outcomes).toEqual([
      { file: 'a', status: 'resolved', explanation: 'why a' },
      { file: 'b', status: 'resolved', explanation: 'why b' },
      { file: 'c', status: 'resolved', explanation: 'why c' },
    ])
    expect(d.written).toEqual({ a: 'merged a', b: 'merged b', c: 'merged c' })
  })

  test('one file failing does not stop the others, and says why', async () => {
    const d = deps({
      propose: async file => file === 'b'
        ? { error: 'The AI proposal still contains conflict markers' }
        : { resolution: 'ok', explanation: '' },
      write: async file => file === 'c' ? { success: false, error: 'EACCES' } : { success: true },
    })
    const { outcomes } = await resolveBatch(['a', 'b', 'c', 'd'], d)
    expect(outcomes.map(o => o.status)).toEqual(['resolved', 'failed', 'failed', 'resolved'])
    expect(outcomes[1]).toMatchObject({ error: expect.stringContaining('markers') })
    expect(outcomes[2]).toMatchObject({ error: 'EACCES' })
  })

  test('a thrown call is a failed file, not a failed run', async () => {
    const { outcomes } = await resolveBatch(['a', 'b'], deps({
      propose: async file => { if (file === 'a') throw new Error('socket hang up'); return { resolution: 'x' } },
    }))
    expect(outcomes).toEqual([
      { file: 'a', status: 'failed', error: 'socket hang up' },
      { file: 'b', status: 'resolved', explanation: '' },
    ])
  })

  test('no key stops the run: every other file would fail the same way', async () => {
    const asked: string[] = []
    const { outcomes, missingKey } = await resolveBatch(['a', 'b', 'c', 'd'], deps({
      propose: async file => { asked.push(file); return { error: NO_API_KEY } },
    }), 1)
    expect(missingKey).toBe(true)
    expect(asked).toEqual(['a'])
    expect(outcomes.every(o => o.status === 'not-run')).toBe(true)
  })

  test('a stop is honoured between files, and a proposal arriving after it is not written', async () => {
    let stop = false
    const d = deps({
      propose: async file => { if (file === 'b') stop = true; return { resolution: `merged ${file}` } },
      stopped: () => stop,
    })
    const { outcomes } = await resolveBatch(['a', 'b', 'c'], d, 1)
    expect(outcomes.map(o => o.status)).toEqual(['resolved', 'not-run', 'not-run'])
    expect(d.written).toEqual({ a: 'merged a' })
  })

  test('never more requests in flight than asked', async () => {
    let inFlight = 0
    let peak = 0
    await resolveBatch(['a', 'b', 'c', 'd', 'e'], deps({
      propose: async () => {
        peak = Math.max(peak, ++inFlight)
        await new Promise(r => setTimeout(r, 5))
        inFlight--
        return { resolution: 'x' }
      },
    }), 2)
    expect(peak).toBe(2)
  })
})
