import { parseShortlog, contributors, refArgs } from '../git-core'

// Who wrote here, as git's shortlog reports it.

describe('the shortlog parser', () => {
  test('a count, a name, an address — most commits first, as git orders them', () => {
    const raw = '   128\tAlice Martin <alice@example.test>\n     7\tBob <bob@example.test>\n'
    expect(parseShortlog(raw)).toEqual([
      { commits: 128, name: 'Alice Martin', email: 'alice@example.test' },
      { commits: 7, name: 'Bob', email: 'bob@example.test' },
    ])
  })
  test('a line that is not a shortlog row is skipped', () => {
    expect(parseShortlog('fatal: not a git repository\n')).toEqual([])
    expect(parseShortlog('')).toEqual([])
  })
})

describe('the core call', () => {
  test('asks for every branch, merges left out, and cuts to the limit', async () => {
    const calls: string[][] = []
    const run = async (args: string[]) => { calls.push(args); return '  3\tA <a@x>\n  2\tB <b@x>\n  1\tC <c@x>\n' }
    const { contributors: who } = await contributors(run, { limit: 2 })
    // The same refs the graph is drawn from, not `--all`: a contributor counted
    // from a ref the graph cannot name is a name with no rows behind it.
    expect(calls[0]).toEqual(['shortlog', '-sne', '--no-merges', ...refArgs({ all: true })])
    expect(calls[0]).not.toContain('--all')
    expect(who.map(c => c.name)).toEqual(['A', 'B'])
  })
  test('a repository with no history answers with nobody', async () => {
    const run = async () => { throw new Error('fatal') }
    expect(await contributors(run)).toEqual({ contributors: [] })
  })
})
