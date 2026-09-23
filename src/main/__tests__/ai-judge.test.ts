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

  test('every question names the search and its own subject', () => {
    // The first cut made each question a bare pointer at the state, to keep
    // the repeating half cheap. Measured, it returned 34 of 100 commits for
    // "générateur de thème de couleur", led by a release chore. A question's
    // ID never reaches the model, so a question that names nothing is one it
    // cannot answer — and the verdicts collapsed into a band around 0.6.
    const { questions } = searchCommitsQuestions(
      'colour theme generator', [commit(1), commit(2)], '2026-09-22')
    expect(questions.c0.instructions).toContain('"colour theme generator"')
    expect(questions.c0.instructions).toContain('`commits[0]`')
    expect(questions.c0.instructions).toContain('subject 1')
    expect(questions.c1.instructions).toContain('subject 2')
    expect(questions.c0.criteria!.true).toContain('colour theme generator')
  })

  test('the state carries what a question cannot — the author, the date, today', () => {
    const { state } = searchCommitsQuestions('last week', [commit(1)], '2026-09-22')
    expect(state).toEqual(expect.objectContaining({ today: '2026-09-22' }))
    expect(JSON.stringify(state)).toContain('Ada')
  })

  test('a commit that only touches the same area in passing is ruled out by the criteria', () => {
    // Where the 34 came from: forty commits near the theme code, none of them
    // the change being searched for.
    const { questions } = searchCommitsQuestions('x', [commit(1)], '2026-09-22')
    expect(questions.c0.criteria!.false).toContain('in passing')
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
    const { questions } = searchCommitsQuestions('  fix the parser  ', [commit(1)], '2026-09-22')
    expect(questions.c0.instructions).toContain('"fix the parser"')
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

  test('it asks git for full hashes, over the whole ceiling and one past it', async () => {
    const log = jest.fn().mockResolvedValue(logOf(3))
    await searchCommitsByJudgement(log, flat(0.9), 'x', '2026-09-22')
    const args = log.mock.calls[0][0] as string[]
    // The one past it is how the search knows the history goes on.
    expect(args).toContain(`--max-count=${JUDGE_SEARCH_MAX + 1}`)
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

  // A capped answer and a complete one used to be the same fifty hashes. The
  // caller cannot say "the fifty most likely of 250" without being told 250.
  test('an answer cut by the cap says how many passed', async () => {
    const r = await searchCommitsByJudgement(async () => logOf(250), flat(0.9), 'x', '2026-09-22')
    expect(r.hashes).toHaveLength(50)
    expect(r.total).toBe(250)
  })

  test('an answer the cap did not touch says nothing more', async () => {
    const r = await searchCommitsByJudgement(async () => logOf(12), flat(0.9), 'x', '2026-09-22')
    expect(r.hashes).toHaveLength(12)
    expect(r.total).toBeUndefined()
    expect(r.readOnly).toBeUndefined()
  })

  test('a history longer than the ceiling says how much of it was read', async () => {
    const run = jest.fn().mockImplementation(flat(0.02))
    const r = await searchCommitsByJudgement(async () => logOf(JUDGE_SEARCH_MAX + 1), run, 'x', '2026-09-22')
    expect(r.readOnly).toBe(JUDGE_SEARCH_MAX)
    // The commit past the ceiling is a probe, not a commit to judge.
    const judged = run.mock.calls.reduce((n: number, [, qs]: any) => n + Object.keys(qs).length, 0)
    expect(judged).toBe(JUDGE_SEARCH_MAX)
  })

  test('a history exactly at the ceiling was read whole', async () => {
    const r = await searchCommitsByJudgement(async () => logOf(JUDGE_SEARCH_MAX), flat(0.02), 'x', '2026-09-22')
    expect(r.readOnly).toBeUndefined()
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
    // Out of how many, so it can be said as a share of the history.
    expect(r.batches).toBe(3)
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

describe('the filter query, composed rather than written', () => {
  const {
    filterQueryQuestions, readFilterAnswers, requestCandidates, dateCandidates,
    FILTER_NONE, FILTER_CONFIDENCE, FILTER_TEXT,
  } = require('../ai-judge')
  const { validateGhQuery, ghFilterKeys } = require('../../renderer/src/components/Sidebar/ghFilters')
  const TODAY = '2026-09-22'
  const choice = (c: string, confidence = 1) => ({ type: 'choice', choice: c, confidence })
  const none = (confidence = 1) => choice(FILTER_NONE, confidence)

  test('every qualifier of the section is asked about, and only its own values offered', () => {
    const { questions } = filterQueryQuestions('prs', 'anything', TODAY)
    // `review` is a pull request's, `milestone` is an issue's — asking a
    // section about a qualifier it does not have is how an invalid token gets
    // written in the first place.
    expect(Object.keys(questions['q:review'].criteria).sort())
      .toEqual(['approved', 'changes_requested', 'none', FILTER_NONE].sort())
    expect(questions['q:milestone']).toBeUndefined()
    expect(filterQueryQuestions('issues', 'anything', TODAY).questions['q:review']).toBeUndefined()
  })

  test('a merge date is a pull request\'s, a close date is both sections\'', () => {
    // "merged since 2026-09-01" had no qualifier to hang its date on, and
    // came back as a query without it.
    const prs = filterQueryQuestions('prs', 'merged since 2026-09-01', TODAY).questions
    expect(Object.keys(prs['q:merged'].criteria)).toContain('>=2026-09-01')
    expect(prs['q:closed']).toBeDefined()
    const issues = filterQueryQuestions('issues', 'closed this week', TODAY).questions
    expect(issues['q:merged']).toBeUndefined()
    expect(Object.keys(issues['q:closed'].criteria)).toContain('>=2026-09-15')
  })

  test('closed: steps aside for merged:, which already says it', () => {
    // Measured: "PR de VictorQuilgars mergées cette année" lit both, with the
    // same date. A merged pull request is a closed one.
    const ask = 'merged this year'
    const answers = { 'q:merged': choice('>=2026-01-01'), 'q:closed': choice('>=2026-01-01') }
    const q = readFilterAnswers(answers, 'prs', ask, TODAY)
    expect(q).toBe('merged:>=2026-01-01')
    expect(validateGhQuery(q, 'prs')).toEqual({ ok: true })
  })

  test('closed: alone is kept — it only steps aside for a merge', () => {
    const q = readFilterAnswers({ 'q:closed': choice('>=2026-09-15') }, 'issues', 'closed this week', TODAY)
    expect(q).toBe('closed:>=2026-09-15')
  })

  test('merged: is read before closed:, which the rule above depends on', () => {
    const keys = ghFilterKeys('prs') as string[]
    expect(keys.indexOf('merged')).toBeLessThan(keys.indexOf('closed'))
  })

  test('the person is one WHO and one ROLE, never six competing questions', () => {
    // Measured: asked a qualifier at a time, "mes pull requests encore
    // ouvertes" put author:@me at 0.31 and assignee:@me at 0.28 — six
    // questions none of which knew the others existed. Split this way both
    // came back above 0.9.
    const { questions } = filterQueryQuestions('prs', 'mes pull requests', TODAY)
    expect(Object.keys(questions['q:role'].criteria)).toContain('review-requested')
    expect(Object.keys(questions['q:who'].criteria)).toContain('@me')
    for (const k of ['author', 'assignee', 'involves', 'reviewed-by']) {
      expect(questions[`q:${k}`]).toBeUndefined()
    }
  })

  test('a free value can only be a word the person typed', () => {
    const { questions } = filterQueryQuestions('prs', 'PR vers main', TODAY)
    const opts = Object.keys(questions['q:base'].criteria)
    expect(opts).toContain('main')
    expect(opts).toEqual(expect.arrayContaining(['PR', 'vers', 'main', FILTER_NONE]))
  })

  test('every question names the request — the lesson the search paid for', () => {
    const { questions } = filterQueryQuestions('issues', 'open bugs', TODAY)
    for (const q of Object.values(questions) as any[]) {
      expect(q.instructions).toContain('"open bugs"')
    }
  })

  test('a value the engine was never offered is dropped, not written', () => {
    // The guarantee the prose path buys with a validator and a regex: here a
    // token outside the vocabulary cannot be composed at all.
    const q = readFilterAnswers({
      'q:is': choice('merged'), 'q:label': choice('not-a-word-we-offered'),
    } as any, 'prs', 'merged pull requests', TODAY)
    expect(q).toBe('is:merged')
    expect(validateGhQuery(q, 'prs').ok).toBe(true)
  })

  test('an unsure qualifier stays out', () => {
    // Erring high: a qualifier too many narrows a search to nothing, and
    // nothing looks exactly like a filter that did not apply.
    const below = readFilterAnswers({ 'q:draft': choice('true', FILTER_CONFIDENCE - 0.01) } as any,
      'prs', 'draft pull requests', TODAY)
    const above = readFilterAnswers({ 'q:draft': choice('true', FILTER_CONFIDENCE) } as any,
      'prs', 'draft pull requests', TODAY)
    expect(below).toBe('')
    expect(above).toBe('draft:true')
  })

  test('a role without a name, or a name without a role, writes nothing', () => {
    const roleOnly = readFilterAnswers({ 'q:role': choice('author'), 'q:who': none() } as any,
      'prs', 'pull requests', TODAY)
    const whoOnly = readFilterAnswers({ 'q:who': choice('@me'), 'q:role': none() } as any,
      'prs', 'my pull requests', TODAY)
    expect(roleOnly).toBe('')
    expect(whoOnly).toBe('')
    expect(readFilterAnswers({ 'q:who': choice('@me'), 'q:role': choice('author') } as any,
      'prs', 'my pull requests', TODAY)).toBe('author:@me')
  })

  test('a role the section does not have is refused', () => {
    // `reviewed-by` is a pull request's; an issue has no review cycle.
    expect(ghFilterKeys('issues')).not.toContain('reviewed-by')
    expect(readFilterAnswers({ 'q:who': choice('@me'), 'q:role': choice('reviewed-by') } as any,
      'issues', 'issues I reviewed', TODAY)).toBe('')
  })

  test('`state:` steps aside for `is:`, which says the same and more', () => {
    const q = readFilterAnswers({ 'q:is': choice('merged'), 'q:state': choice('closed') } as any,
      'prs', 'merged pull requests', TODAY)
    expect(q).toBe('is:merged')
  })

  test('a word spent as a value is not also free text', () => {
    const described = 'issues labelled bug'
    const i = requestCandidates(described).indexOf('bug')
    const q = readFilterAnswers({
      'q:label': choice('bug'), [`t:${i}`]: { type: 'noul', noul: 0.99 },
    } as any, 'issues', described, TODAY)
    expect(q).toBe('label:bug')
  })

  test('free text survives when no qualifier claimed it', () => {
    const described = 'issues about the theme picker'
    const cands: string[] = requestCandidates(described)
    const answers: any = {}
    cands.forEach((w, i) => { answers[`t:${i}`] = { type: 'noul', noul: ['theme', 'picker'].includes(w) ? 0.9 : 0.2 } })
    expect(readFilterAnswers(answers, 'issues', described, TODAY)).toBe('theme picker')
  })

  test('a quoted phrase comes through whole, and is quoted back', () => {
    const described = 'issues labelled "good first issue"'
    const cands: string[] = requestCandidates(described)
    expect(cands).toContain('good first issue')
    const answers: any = { [`t:${cands.indexOf('good first issue')}`]: { type: 'noul', noul: 0.95 } }
    expect(readFilterAnswers(answers, 'issues', described, TODAY)).toBe('"good first issue"')
  })

  test('a word below the text cut stays out', () => {
    const described = 'the theme picker'
    const cands: string[] = requestCandidates(described)
    const answers: any = {}
    cands.forEach((_, i) => { answers[`t:${i}`] = { type: 'noul', noul: FILTER_TEXT - 0.01 } })
    expect(readFilterAnswers(answers, 'issues', described, TODAY)).toBe('')
  })

  test('dates are computed here — the engine picks one, it never writes one', () => {
    const out: string[] = dateCandidates(TODAY, 'since 2026-09-01')
    expect(out).toContain('>=2026-09-15')   // a week back
    expect(out).toContain('>=2026-01-01')   // this year
    expect(out).toContain('>=2026-09-01')   // the literal in the request
    for (const o of out) expect(o).toMatch(/^>=\d{4}-\d{2}-\d{2}$/)
  })

  test('whatever comes back, the query passes the editor’s own validator', () => {
    for (const kind of ['prs', 'issues'] as const) {
      const { questions } = filterQueryQuestions(kind, 'mes PR ouvertes vers main "good first issue"', TODAY)
      // Every qualifier answered with its first option, every word free text:
      // the most a run could ever produce.
      const answers: any = {}
      for (const [id, q] of Object.entries(questions) as any[]) {
        if (q.type === 'choice') {
          const first = Object.keys(q.criteria).find(o => o !== FILTER_NONE)!
          answers[id] = { type: 'choice', choice: first, confidence: 1 }
        } else answers[id] = { type: 'noul', noul: 1 }
      }
      const query = readFilterAnswers(answers, kind, 'mes PR ouvertes vers main "good first issue"', TODAY)
      expect(validateGhQuery(query, kind)).toEqual({ ok: true })
    }
  })

  test('nothing understood is an empty query, which the caller refuses', () => {
    const allNone: any = {}
    for (const id of Object.keys(filterQueryQuestions('prs', 'hello there', TODAY).questions)) {
      allNone[id] = id.startsWith('t:') ? { type: 'noul', noul: 0 } : none()
    }
    expect(readFilterAnswers(allNone, 'prs', 'hello there', TODAY)).toBe('')
  })
})
