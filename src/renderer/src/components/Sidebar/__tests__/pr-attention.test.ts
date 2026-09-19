import { NO_FACTS, PR_GROUPS, classifyPR, groupPRs, isSnoozed, pruneSnoozes, readMarks, writeMarks, type AttentionContext } from '../pr-attention'

// Pull requests by what each one needs (#257): every open request lands in
// exactly one group, and the first rule that holds decides which.

const ctx = (over: Partial<AttentionContext> = {}): AttentionContext => ({
  login: 'me', currentBranch: 'feature/here', facts: NO_FACTS, pinned: new Set(), snoozed: {}, now: Date.parse('2026-09-18T12:00:00Z'), ...over,
})
const pr = (number: number, over: Record<string, unknown> = {}) => ({ number, author: 'me', headRef: `b${number}`, updatedAt: '2026-09-17T10:00:00Z', ...over })
const facts = (over: Partial<typeof NO_FACTS>) => ({ ...NO_FACTS, ...over })

describe('the rules, in the order they are tried', () => {
  test('the request of the branch you are on comes first, whatever else is true of it', () => {
    expect(classifyPR(pr(1, { headRef: 'feature/here', draft: true }), ctx({ facts: facts({ failing: new Set([1]) }) }))).toBe('current')
  })

  test('someone else\'s, with your review asked — by the row, or by the search when the row did not say', () => {
    expect(classifyPR(pr(2, { author: 'ana', reviewers: ['me'] }), ctx())).toBe('needs-review')
    expect(classifyPR(pr(2, { author: 'ana' }), ctx({ facts: facts({ needsReview: new Set([2]) }) }))).toBe('needs-review')
    // Even a draft: a review asked for is asked for.
    expect(classifyPR(pr(2, { author: 'ana', reviewers: ['me'], draft: true }), ctx())).toBe('needs-review')
  })

  test('yours: changes requested, then blocked by red checks, then ready, then waiting', () => {
    expect(classifyPR(pr(3), ctx({ facts: facts({ changesRequested: new Set([3]), failing: new Set([3]) }) }))).toBe('changes-requested')
    // Approved is only ready while its checks are not failing.
    expect(classifyPR(pr(3), ctx({ facts: facts({ approved: new Set([3]), failing: new Set([3]) }) }))).toBe('blocked')
    expect(classifyPR(pr(3), ctx({ facts: facts({ approved: new Set([3]) }) }))).toBe('ready')
    expect(classifyPR(pr(3), ctx())).toBe('waiting')
  })

  test('a draft asks nothing of anybody yet', () => {
    expect(classifyPR(pr(4, { draft: true }), ctx({ facts: facts({ approved: new Set([4]) }) }))).toBe('draft')
  })

  test('someone else\'s that asks nothing of you is Other — and with nobody signed in, everything is', () => {
    expect(classifyPR(pr(5, { author: 'ana' }), ctx())).toBe('other')
    expect(classifyPR(pr(5), ctx({ login: null }))).toBe('other')
  })
})

describe('every request lands in exactly one group', () => {
  test('the groups partition the list, in the order they are shown', () => {
    const prs = [
      pr(1, { headRef: 'feature/here' }), pr(2, { author: 'ana', reviewers: ['me'] }), pr(3), pr(4, { draft: true }),
      pr(5, { author: 'ana' }), pr(6), pr(7), pr(8), pr(9),
    ]
    const groups = groupPRs(prs, ctx({
      facts: facts({ changesRequested: new Set([6]), approved: new Set([7, 8]), failing: new Set([8]) }),
      pinned: new Set([9]), snoozed: { 3: { until: '2026-09-25T08:00:00Z' } },
    }))
    expect(groups.map(g => g.key)).toEqual(PR_GROUPS.map(g => g.key))
    expect(Object.fromEntries(groups.map(g => [g.key, g.rows.map(r => r.number)]))).toEqual({
      pinned: [9], current: [1], 'needs-review': [2], 'changes-requested': [6], ready: [7], blocked: [8],
      waiting: [], draft: [4], other: [5], snoozed: [3],
    })
    expect(groups.reduce((n, g) => n + g.rows.length, 0)).toBe(prs.length)
  })
})

describe('pin and snooze', () => {
  const now = Date.parse('2026-09-18T12:00:00Z')

  test('a pin lifts a request to the top; a snooze puts it aside even when pinned', () => {
    expect(classifyPR(pr(1), ctx({ pinned: new Set([1]) }))).toBe('pinned')
    expect(classifyPR(pr(1), ctx({ pinned: new Set([1]), snoozed: { 1: {} } }))).toBe('snoozed')
  })

  test('until a day: asleep before it, awake from it on', () => {
    expect(isSnoozed({ until: '2026-09-19T08:00:00Z' }, pr(1), now)).toBe(true)
    expect(isSnoozed({ until: '2026-09-18T08:00:00Z' }, pr(1), now)).toBe(false)
  })

  test('until its next update: lifted by the request moving, and by nothing else', () => {
    const snooze = { updatedAt: '2026-09-17T10:00:00Z' }
    expect(isSnoozed(snooze, pr(1), now)).toBe(true)
    expect(isSnoozed(snooze, pr(1, { updatedAt: '2026-09-18T09:00:00Z' }), now)).toBe(false)
    expect(classifyPR(pr(1, { updatedAt: '2026-09-18T09:00:00Z' }), ctx({ snoozed: { 1: snooze } }))).toBe('waiting')
  })

  test('a snooze that has woken, or whose request has closed, is dropped from the store', () => {
    const kept = pruneSnoozes({
      1: { until: '2026-09-25T08:00:00Z' }, 2: { until: '2026-09-01T08:00:00Z' }, 3: { updatedAt: 'old' }, 4: {},
    }, [pr(1), pr(2), pr(3)], now)
    expect(Object.keys(kept)).toEqual(['1'])
  })

  test('kept per repository, and a store that holds nonsense reads as empty', () => {
    const mem = new Map<string, string>()
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) } }
    writeMarks('o/a', { pinned: [4], snoozed: { 7: { until: 'x' } } }, storage)
    expect(readMarks('o/a', storage)).toEqual({ pinned: [4], snoozed: { 7: { until: 'x' } } })
    expect(readMarks('o/b', storage)).toEqual({ pinned: [], snoozed: {} })
    mem.set('gv-pr-marks:o/c', '{not json')
    expect(readMarks('o/c', storage)).toEqual({ pinned: [], snoozed: {} })
    expect(readMarks(null, storage)).toEqual({ pinned: [], snoozed: {} })
  })
})
