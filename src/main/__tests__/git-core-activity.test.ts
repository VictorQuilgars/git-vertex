import { parseActivity, activity } from '../git-core'

// The commits as points in time, for the activity chart.

describe('the activity parser', () => {
  test('a line is seconds, a name and a hash, NUL apart', () => {
    expect(parseActivity('1758153600\0Alice\0abc\n1758067200\0Bob\0def\n')).toEqual([
      { at: 1758153600, author: 'Alice', hash: 'abc' },
      { at: 1758067200, author: 'Bob', hash: 'def' },
    ])
  })
  test('what is not such a line is skipped', () => {
    expect(parseActivity('fatal: bad revision\n\n')).toEqual([])
  })
})

describe('the core call', () => {
  test('asks every branch, merges out, one more than the cap so it can say it was cut', async () => {
    const calls: string[][] = []
    const run = async (args: string[]) => { calls.push(args); return Array.from({ length: 4 }, (_, i) => `${1758153600 - i}\0A\0h${i}`).join('\n') }
    const r = await activity(run, { max: 3, path: 'src' })
    expect(calls[0]).toEqual(['log', '--all', '--no-merges', '--format=%at%x00%aN%x00%H', '-n', '4', '--', 'src'])
    expect(r.points).toHaveLength(3)
    expect(r.truncated).toBe(true)
  })
  test('no history is no points', async () => {
    expect(await activity(async () => { throw new Error('x') })).toEqual({ points: [], truncated: false })
  })
})
