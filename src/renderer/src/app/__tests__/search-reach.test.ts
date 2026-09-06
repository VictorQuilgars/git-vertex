import { planReach } from '../search-reach'

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
