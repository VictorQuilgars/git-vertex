import {
  BASE_BUDGET, HEADROOM_STEPS, budgetFor, headroomFor, headroomKey, nextHeadroom,
} from '../ai-budgets'
import type { AIFeature } from '../ai-resolve'

// The numbers themselves were calibrated once, against one model, and the
// comment they came from is the reason this module exists: at 128 tokens a
// reasoning model returned NOTHING three times, because it spends its budget
// thinking before it writes a character. What is tested here is not the
// numbers but the thing that was missing — that a model needing more room can
// get it, and that what it got is visible afterwards.

const FEATURES: AIFeature[] = [
  'commit', 'explain', 'conflict', 'search', 'filter', 'pr', 'issue', 'changelog', 'compose',
]

describe('what each feature asks for', () => {
  test('every feature has a budget — a missing one would silently become 512', () => {
    for (const f of FEATURES) {
      expect({ f, budget: BASE_BUDGET[f] }).toEqual({ f, budget: expect.any(Number) })
      expect(BASE_BUDGET[f]).toBeGreaterThan(0)
    }
  })

  test('a whole rewritten file gets more room than a commit subject', () => {
    // The ordering is the claim: conflict resolution returns an entire file,
    // a commit message returns a line.
    expect(BASE_BUDGET.conflict).toBeGreaterThan(BASE_BUDGET.changelog)
    expect(BASE_BUDGET.changelog).toBeGreaterThan(BASE_BUDGET.explain)
    expect(BASE_BUDGET.explain).toBeGreaterThan(BASE_BUDGET.commit)
  })
})

describe('headroom', () => {
  test('none set is one — the feature asks for exactly what it always did', () => {
    expect(headroomFor({}, 'explain')).toBe(1)
    expect(budgetFor({}, 'explain')).toBe(BASE_BUDGET.explain)
  })

  test('a step multiplies that feature and no other', () => {
    const s = { [headroomKey('explain')]: '4' }
    expect(budgetFor(s, 'explain')).toBe(BASE_BUDGET.explain * 4)
    expect(budgetFor(s, 'commit')).toBe(BASE_BUDGET.commit)
  })

  test('anything that is not a step is one — a hand-edited settings file cannot ask for 900,000 tokens', () => {
    for (const bad of ['3', '0', '-2', '999', 'lots', '', ' ']) {
      expect({ bad, room: headroomFor({ [headroomKey('explain')]: bad }, 'explain') }).toEqual({ bad, room: 1 })
    }
  })

  test('a call with no feature still gets a budget rather than nothing', () => {
    expect(budgetFor({}, undefined)).toBeGreaterThan(0)
    expect(headroomFor({}, undefined)).toBe(1)
  })
})

describe('growing after a truncation', () => {
  test('each step leads to the next, and the last leads nowhere', () => {
    expect(nextHeadroom(1)).toBe(2)
    expect(nextHeadroom(2)).toBe(4)
    // At the top it stops rather than doubling for ever — an answer that will
    // not fit in four times the room is not a budget problem to solve
    // silently, it is one to report.
    expect(nextHeadroom(4)).toBeNull()
  })

  test('a value that is not a step climbs from the bottom rather than getting stuck', () => {
    expect(nextHeadroom(3)).toBe(HEADROOM_STEPS[1])
    expect(nextHeadroom(0)).toBe(HEADROOM_STEPS[1])
  })

  test('the key is the settings vocabulary the two products already share', () => {
    // The desktop writes it, the panel reads it, and one control shows it.
    expect(headroomKey('explain')).toBe('aiHeadroom:explain')
    expect(headroomKey('changelog')).toBe('aiHeadroom:changelog')
  })
})
