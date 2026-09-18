import { bucketize, topAuthors, bucketLabel } from '../activity'

// The commits as bars in time: where a day, a week and a month begin, and
// what lands in each.

const now = new Date(2026, 8, 18, 15, 30).getTime()   // Friday 18 September 2026
const at = (y: number, m: number, d: number, h = 12) => Math.floor(new Date(y, m - 1, d, h).getTime() / 1000)
const pt = (when: number, author: string, hash = String(when)) => ({ at: when, author, hash })

describe('the buckets', () => {
  test('days: the newest is today, the oldest sixty days back, each a calendar day', () => {
    const b = bucketize([pt(at(2026, 9, 18, 1), 'A'), pt(at(2026, 9, 17, 23), 'B')], 'day', undefined, now)
    expect(b).toHaveLength(60)
    expect(b[59].total).toBe(1)
    expect(b[58].total).toBe(1)
    expect(new Date(b[59].start * 1000).getDate()).toBe(18)
  })
  test('weeks start on Monday', () => {
    const b = bucketize([pt(at(2026, 9, 14, 0), 'A'), pt(at(2026, 9, 13, 23), 'B')], 'week', 2, now)
    expect(new Date(b[1].start * 1000).getDay()).toBe(1)   // Monday 14 September
    expect(b[1].total).toBe(1)
    expect(b[0].total).toBe(1)
  })
  test('months are calendar months, and a point before the first bucket is left out', () => {
    const b = bucketize([pt(at(2026, 9, 1, 0), 'A'), pt(at(2026, 8, 31, 23), 'A'), pt(at(2020, 1, 1), 'A')], 'month', 2, now)
    expect(b.map(x => x.total)).toEqual([1, 1])
    expect(b[1].byAuthor).toEqual({ A: 1 })
    expect(b[1].hashes).toHaveLength(1)
  })
})

describe('the legend and the labels', () => {
  test('the top authors are those with the most commits, ties by name', () => {
    const b = bucketize([pt(at(2026, 9, 18), 'B'), pt(at(2026, 9, 18, 13), 'B'), pt(at(2026, 9, 17), 'A'), pt(at(2026, 9, 17, 13), 'C')], 'day', undefined, now)
    expect(topAuthors(b, 2)).toEqual(['B', 'A'])
  })
  test('a bucket names its span', () => {
    const [day] = bucketize([], 'day', 1, now)
    expect(bucketLabel(day, 'day', 'en-US')).toBe('Sep 18')
    const [month] = bucketize([], 'month', 1, now)
    expect(bucketLabel(month, 'month', 'en-US')).toBe('September 2026')
    const [week] = bucketize([], 'week', 1, now)
    expect(bucketLabel(week, 'week', 'en-US')).toBe('Sep 14 – 20')
  })
})
