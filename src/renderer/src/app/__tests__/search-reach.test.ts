import { planReach, planAnswer, answerMessage } from '../search-reach'

// #188: a hit beyond the loaded page is loaded and selected, or said to be
// out of reach. Pages of 500, a reach of 5,000, as the app has them.

const h = (n: number) => n.toString(16).padStart(40, '0')
const loaded = new Set([h(1), h(2), h(3)])

test('every hit in the page: nothing to load, nothing to select, nothing to say', () => {
  const plan = planReach([h(1), h(3)], loaded, {}, 500)
  expect(plan).toEqual({ loadTo: 0, select: null, beyond: [], unreached: [] })
})

test('a hit 800 commits back grows the page to 1,000 and is selected', () => {
  const plan = planReach([h(9)], loaded, { [h(9)]: 801 }, 500)
  expect(plan.loadTo).toBe(1000)
  expect(plan.select).toBe(h(9))
  expect(plan.beyond).toEqual([])
})

test('the page grows to the farthest hit within reach, the nearest is selected', () => {
  const plan = planReach([h(7), h(8), h(9)], loaded, { [h(7)]: 1300, [h(8)]: 620, [h(9)]: 2101 }, 500)
  expect(plan.loadTo).toBe(2500)
  expect(plan.select).toBe(h(8))
})

test('a hit beyond the reach is reported with its position, not loaded', () => {
  const plan = planReach([h(9)], loaded, { [h(9)]: 7412 }, 500)
  expect(plan.loadTo).toBe(0)
  expect(plan.select).toBeNull()
  expect(plan.beyond).toEqual([{ hash: h(9), position: 7412 }])
})

test('hits on both sides of the reach: the near ones loaded, the far ones said, nearest first', () => {
  const plan = planReach([h(7), h(8), h(9)], loaded, { [h(7)]: 9000, [h(8)]: 640, [h(9)]: 5001 }, 500)
  expect(plan.loadTo).toBe(1000)
  expect(plan.select).toBe(h(8))
  expect(plan.beyond.map(x => x.position)).toEqual([5001, 9000])
})

test('a hit at the reach itself is within it', () => {
  expect(planReach([h(9)], loaded, { [h(9)]: 5000 }, 500).loadTo).toBe(5000)
})

test('a hit no shown ref reaches has no position and is listed as unreached', () => {
  const plan = planReach([h(9), h(8)], loaded, { [h(8)]: 700 }, 500)
  expect(plan.unreached).toEqual([h(9)])
  expect(plan.select).toBe(h(8))
})

test('a page already large enough is not reloaded', () => {
  // The hit is missing from `loaded` but its row is within the limit: a page
  // that is still loading, or a graph filtered by something else. Growing it
  // would change nothing.
  expect(planReach([h(9)], loaded, { [h(9)]: 900 }, 1000).loadTo).toBe(0)
})

test('the page and the reach can be given', () => {
  const plan = planReach([h(9)], loaded, { [h(9)]: 250 }, 100, 300, 100)
  expect(plan.loadTo).toBe(300)
  expect(planReach([h(9)], loaded, { [h(9)]: 301 }, 100, 300, 100).beyond).toHaveLength(1)
})

// The model's answer is RANKED. The order used to die at the first Set: every
// hit lit alike, the page grown for none of them. It now decides where the
// graph goes — and the page still grows for every hit within reach.
describe('the answer of a model, reached', () => {
  test('the most probable hit is selected, not the nearest', () => {
    // h(3) is loaded and nearest; h(9) is further back and ranked first.
    const plan = planAnswer([h(9), h(3)], loaded, { [h(9)]: 801 }, 500)
    expect(plan.select).toBe(h(9))
    expect(plan.loadTo).toBe(1000)
  })

  test('the best hit already on the page is selected without growing it', () => {
    const plan = planAnswer([h(2), h(1)], loaded, {}, 500)
    expect(plan.select).toBe(h(2))
    expect(plan.loadTo).toBe(0)
  })

  test('a best hit out of reach gives way to the next one the graph can show', () => {
    const plan = planAnswer([h(9), h(8), h(1)], loaded, { [h(9)]: 40000 }, 500)
    // h(8) is on no ref the graph shows, h(9) too far: h(1) is what can be shown.
    expect(plan.select).toBe(h(1))
    expect(plan.beyond.map(b => b.hash)).toEqual([h(9)])
    expect(plan.unreached).toEqual([h(8)])
  })

  test('the page grows for every hit within reach, not only the selected one', () => {
    const plan = planAnswer([h(9), h(10)], loaded, { [h(9)]: 600, [h(10)]: 1400 }, 500)
    expect(plan.select).toBe(h(9))
    expect(plan.loadTo).toBe(1500)
  })

  test('nothing to show is nothing selected', () => {
    expect(planAnswer([], loaded, {}, 500).select).toBeNull()
  })
})

describe('what an answer leaves out, said', () => {
  const t = (key: string, ...args: any[]) => `${key}(${args.join(',')})`

  test('a complete answer says nothing', () => {
    expect(answerMessage(t, { hashes: ['a', 'b'] })).toBeNull()
  })

  test('a capped answer says how many passed', () => {
    const hashes = Array.from({ length: 50 }, (_, i) => String(i))
    expect(answerMessage(t, { hashes, total: 73 })).toBe('search.ai.capped(50,73)')
  })

  test('a history read in part says how much', () => {
    expect(answerMessage(t, { hashes: [], readOnly: 1000 })).toBe('search.ai.readOnly(1,000)')
  })

  test('a batch that never answered is said as a share', () => {
    expect(answerMessage(t, { hashes: ['a'], partial: 2, batches: 10 })).toBe('search.ai.partial(2,10)')
  })

  test('all three at once are all said', () => {
    const said = answerMessage(t, { hashes: ['a'], total: 3, readOnly: 1000, partial: 1, batches: 10 })!
    expect(said).toContain('capped')
    expect(said).toContain('readOnly')
    expect(said).toContain('partial')
  })
})
