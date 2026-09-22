import {
  searchCommitsQuestions, readSearchAnswers, rankHits, batchCommits, parseJudgeLog,
  JUDGE_BATCH, JUDGE_HIT, JUDGE_MAX_HITS, type JudgedCommit, type JudgeAnswer,
} from '../ai-judge'

// The failure this replaces: the prose search sent 200 short hashes and asked
// for the matching ones back, which is a COPYING task. The handler carried a
// `catch { /* hallucinated hash — skip */ }` for the ones that came back
// invented. What is tested here is mostly that the same mistake is no longer
// available to make — the model is never shown a hash at all.

const commit = (n: number, over: Partial<JudgedCommit> = {}): JudgedCommit => ({
  hash: String(n).padStart(40, '0'),
  author: 'Ada',
  date: '2026-09-01',
  subject: `subject ${n}`,
  ...over,
})

describe('what the engine is shown', () => {
  test('no hash reaches the state — the model cannot name one', () => {
    const { state } = searchCommitsQuestions('theme picker', [commit(1), commit(2)], '2026-09-22')
    const json = JSON.stringify(state)
    expect(json).not.toContain('0000000000')
    expect(json).toContain('subject 1')
    expect(json).toContain('Ada')
  })

  test('the query, the date and what matching means are shared, not repeated', () => {
    const { state, questions } = searchCommitsQuestions('last week', [commit(1), commit(2)], '2026-09-22')
    expect(state).toEqual(expect.objectContaining({ today: '2026-09-22', search: 'last week' }))
    // The part that repeats N times stays a pointer: the explanation is in the
    // state, paid for once, and the question carries none of it.
    expect(questions.c0.instructions).toBe('Does `commits[0]` answer `search`?')
    expect(questions.c1.instructions).toBe('Does `commits[1]` answer `search`?')
    expect(questions.c0.instructions.length).toBeLessThan(60)
  })

  test('one noul per commit, with both criteria', () => {
    const { questions } = searchCommitsQuestions('x', [commit(1), commit(2), commit(3)], '2026-09-22')
    expect(Object.keys(questions)).toEqual(['c0', 'c1', 'c2'])
    for (const q of Object.values(questions)) {
      expect(q.type).toBe('noul')
      expect(q.criteria?.true).toBeTruthy()
      expect(q.criteria?.false).toBeTruthy()
    }
  })

  test('the query is trimmed — a trailing space is not a search term', () => {
    const { state } = searchCommitsQuestions('  fix the parser  ', [commit(1)], '2026-09-22')
    expect((state as any).search).toBe('fix the parser')
  })
})

describe('reading the verdicts back', () => {
  const three = [commit(1), commit(2), commit(3)]
  const answers = (ps: (number | undefined)[]): Record<string, JudgeAnswer> =>
    Object.fromEntries(ps.flatMap((p, i) => p === undefined ? [] : [[`c${i}`, { type: 'noul' as const, noul: p }]]))

  test('above the cut is a hit, below it is not', () => {
    const hits = readSearchAnswers(answers([0.92, 0.10, 0.63]), three)
    expect(hits.map(h => h.hash)).toEqual([three[0].hash, three[2].hash])
    expect(hits[0].probability).toBe(0.92)
  })

  test('exactly at the cut counts — the constant is the floor it says it is', () => {
    expect(readSearchAnswers(answers([JUDGE_HIT]), [commit(1)])).toHaveLength(1)
  })

  test('a missing verdict is dropped, never read as a no', () => {
    // A half-failed request must shrink the ANSWER, not silently turn its
    // unanswered commits into refusals the user cannot tell from real ones.
    const hits = readSearchAnswers(answers([0.9, undefined, 0.8]), three)
    expect(hits.map(h => h.hash)).toEqual([three[0].hash, three[2].hash])
  })

  test('a malformed verdict is dropped rather than coerced', () => {
    const hits = readSearchAnswers({ c0: { type: 'noul' }, c1: { type: 'noul', noul: NaN } } as any, three)
    expect(hits).toEqual([])
  })

  test('no answers at all is no hits, not a throw', () => {
    expect(readSearchAnswers(undefined, three)).toEqual([])
  })

  test('a verdict for a commit that was never asked about is ignored', () => {
    // The answer map is keyed by position, so a reply carrying more than it
    // was asked cannot reach past the batch it belongs to.
    const hits = readSearchAnswers({ c0: { type: 'noul', noul: 0.9 }, c7: { type: 'noul', noul: 0.99 } }, three)
    expect(hits.map(h => h.hash)).toEqual([three[0].hash])
  })
})

describe('ranking across batches', () => {
  test('best first, whichever batch it came from', () => {
    const ranked = rankHits([
      [{ hash: 'a', probability: 0.6 }, { hash: 'b', probability: 0.99 }],
      [{ hash: 'c', probability: 0.8 }],
    ])
    expect(ranked).toEqual(['b', 'c', 'a'])
  })

  test('capped — the cap takes the BEST, not the first to arrive', () => {
    const weak = Array.from({ length: JUDGE_MAX_HITS }, (_, i) => ({ hash: `w${i}`, probability: 0.51 }))
    const strong = { hash: 'strong', probability: 0.97 }
    const ranked = rankHits([weak, [strong]])
    expect(ranked).toHaveLength(JUDGE_MAX_HITS)
    expect(ranked[0]).toBe('strong')
  })
})

describe('batching', () => {
  test('cut at the batch size, the last one short', () => {
    const many = Array.from({ length: JUDGE_BATCH * 2 + 7 }, (_, i) => commit(i))
    const batches = batchCommits(many)
    expect(batches).toHaveLength(3)
    expect(batches[0]).toHaveLength(JUDGE_BATCH)
    expect(batches[2]).toHaveLength(7)
    // Nothing lost and nothing duplicated: a commit missing from every batch
    // is a commit the search silently cannot find.
    expect(batches.flat().map(c => c.hash)).toEqual(many.map(c => c.hash))
  })

  test('fewer commits than a batch is one batch', () => {
    expect(batchCommits([commit(1), commit(2)])).toHaveLength(1)
  })

  test('nothing is no batches, so no request goes out', () => {
    expect(batchCommits([])).toEqual([])
  })
})

describe('reading git log', () => {
  const line = (h: string, rest: string) => `${h}|${rest}`
  const full = 'a'.repeat(40)

  test('the FULL hash is kept — nothing expands a short one afterwards', () => {
    const [c] = parseJudgeLog(line(full, 'Ada|2026-09-01|fix: the parser'))
    expect(c).toEqual({ hash: full, author: 'Ada', date: '2026-09-01', subject: 'fix: the parser' })
  })

  test('a subject holding the separator keeps it whole', () => {
    const [c] = parseJudgeLog(line(full, 'Ada|2026-09-01|feat: a|b toggle, and more'))
    expect(c.subject).toBe('feat: a|b toggle, and more')
  })

  test('an author holding the separator does not eat the date', () => {
    const [c] = parseJudgeLog(line(full, 'Ada|2026-09-01|x'))
    expect(c.date).toBe('2026-09-01')
  })

  test('a runaway subject is cut, so one commit cannot cost the batch its budget', () => {
    const [c] = parseJudgeLog(line(full, `Ada|2026-09-01|${'x'.repeat(500)}`))
    expect(c.subject).toHaveLength(160)
  })

  test('a line that is not a commit costs its line, never the list', () => {
    const out = parseJudgeLog([
      line(full, 'Ada|2026-09-01|good'),
      'garbage with no separators',
      line('short', 'Ada|2026-09-01|not a full hash'),
      '',
      line('b'.repeat(40), 'Bob|2026-09-02|also good'),
    ].join('\n'))
    expect(out.map(c => c.subject)).toEqual(['good', 'also good'])
  })

  test('an empty log is an empty list', () => {
    expect(parseJudgeLog('')).toEqual([])
  })
})

describe('the search both products run', () => {
  const { searchCommitsByJudgement, JUDGE_SEARCH_MAX } = require('../ai-judge')
  const H = (n: number) => String(n).padStart(40, '0')
  const logOf = (n: number) => Array.from({ length: n },
    (_, i) => `${H(i)}|Ada|2026-09-01|subject ${i}`).join('\n')

  /** A policy that answers every question with the same probability. */
  const flat = (p: number) => async (_s: unknown, qs: Record<string, unknown>) =>
    ({ answers: Object.fromEntries(Object.keys(qs).map(k => [k, { type: 'noul', noul: p }])) })

  test('it asks git for full hashes, over the whole ceiling', async () => {
    const log = jest.fn().mockResolvedValue(logOf(3))
    await searchCommitsByJudgement(log, flat(0.9), 'x', '2026-09-22')
    const args = log.mock.calls[0][0] as string[]
    expect(args).toContain(`--max-count=${JUDGE_SEARCH_MAX}`)
    expect(args.join(' ')).toContain('%H|%an|%ad|%s')
  })

  test('more commits than a batch become several requests, and one answer', async () => {
    const run = jest.fn().mockImplementation(flat(0.9))
    const r = await searchCommitsByJudgement(async () => logOf(250), run, 'x', '2026-09-22')
    expect(run).toHaveBeenCalledTimes(3)
    // Capped at 50, and every hash is one git actually gave us.
    expect(r.hashes).toHaveLength(50)
    const real = new Set(Array.from({ length: 250 }, (_, i) => H(i)))
    expect(r.hashes!.filter((h: string) => !real.has(h))).toEqual([])
  })

  test('one refused batch costs its batch, not the search', async () => {
    let n = 0
    const run = jest.fn().mockImplementation(async (s: unknown, qs: any) => {
      n += 1
      return n === 2 ? { error: 'Rate limited' } : flat(0.9)(s, qs)
    })
    const r = await searchCommitsByJudgement(async () => logOf(250), run, 'x', '2026-09-22')
    expect(r.error).toBeUndefined()
    expect(r.partial).toBe(1)
    expect(r.hashes!.length).toBeGreaterThan(0)
  })

  test('every batch refused IS the failure — not "nothing matched"', async () => {
    // A refused key answering "no commit matched" is a lie the user acts on:
    // they retype the query instead of fixing the key.
    const r = await searchCommitsByJudgement(
      async () => logOf(250), async () => ({ error: 'The API key was refused' }), 'x', '2026-09-22')
    expect(r.error).toBe('The API key was refused')
    expect(r.hashes).toBeUndefined()
  })

  test('nothing above the cut is an empty answer, and not an error', async () => {
    const r = await searchCommitsByJudgement(async () => logOf(10), flat(0.02), 'x', '2026-09-22')
    expect(r).toEqual({ hashes: [] })
  })

  test('an empty history asks nothing at all', async () => {
    const run = jest.fn()
    expect(await searchCommitsByJudgement(async () => '', run, 'x', '2026-09-22')).toEqual({ hashes: [] })
    expect(run).not.toHaveBeenCalled()
  })

  test('a blank query asks nothing — and does not even read the history', async () => {
    const log = jest.fn()
    expect(await searchCommitsByJudgement(log, flat(0.9), '   ', '2026-09-22')).toEqual({ hashes: [] })
    expect(log).not.toHaveBeenCalled()
  })

  test('git failing is said as itself', async () => {
    const r = await searchCommitsByJudgement(
      async () => { throw new Error('not a repository') }, flat(0.9), 'x', '2026-09-22')
    expect(r.error).toBe('Could not read the history')
  })

  test('the hashes it returns were never sent — they come from the log', async () => {
    // The whole point: a verdict is about a POSITION, so the answer can only
    // be made of hashes git gave us. There is no path by which an invented
    // one reaches the graph.
    const seen: string[] = []
    const run = async (s: any, qs: any) => { seen.push(JSON.stringify(s)); return flat(0.9)(s, qs) }
    const r = await searchCommitsByJudgement(async () => logOf(5), run, 'x', '2026-09-22')
    for (const sent of seen) expect(sent).not.toContain('00000000')
    expect(r.hashes).toEqual([H(0), H(1), H(2), H(3), H(4)])
  })
})
