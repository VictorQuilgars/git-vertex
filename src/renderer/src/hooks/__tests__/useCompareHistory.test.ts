import { read, withComparison, sameComparison, type SavedComparison } from '../useCompareHistory'

// The register is small on purpose, so the two rules that keep it small are the
// ones worth pinning: a repeat moves to the top instead of piling up, and the
// tail falls off. The read side has to survive anything already in storage —
// it is a key a user can edit, and a shape we have changed before.

const cmp = (a: string, b: string | null = 'main', axis: 'diverged' | 'endpoints' = 'diverged'): SavedComparison =>
  ({ a, b, axis })

describe('withComparison', () => {
  test('the newest comparison leads', () => {
    const list = withComparison([cmp('one')], cmp('two'))
    expect(list.map(c => c.a)).toEqual(['two', 'one'])
  })

  test('repeating one moves it up rather than duplicating it', () => {
    const list = withComparison([cmp('two'), cmp('one')], cmp('one'))
    expect(list.map(c => c.a)).toEqual(['one', 'two'])
  })

  // Same refs, other axis: a different question, so a different entry.
  test('the axis is part of what makes a comparison the same one', () => {
    const list = withComparison([cmp('one', 'main', 'diverged')], cmp('one', 'main', 'endpoints'))
    expect(list).toHaveLength(2)
    expect(sameComparison(cmp('one'), cmp('one', 'main', 'endpoints'))).toBe(false)
  })

  test('the working tree is a target like any other', () => {
    const list = withComparison([], cmp('main', null))
    expect(list[0].b).toBeNull()
    expect(withComparison(list, cmp('main', null))).toHaveLength(1)
  })

  test('it keeps six', () => {
    let list: SavedComparison[] = []
    for (let i = 0; i < 10; i++) list = withComparison(list, cmp(`ref-${i}`))
    expect(list).toHaveLength(6)
    expect(list[0].a).toBe('ref-9')
    expect(list.at(-1)!.a).toBe('ref-4')
  })
})

describe('read', () => {
  const KEY = 'gv-compare-history:/repo'
  afterEach(() => localStorage.clear())

  test('round-trips what was written', () => {
    localStorage.setItem(KEY, JSON.stringify([cmp('a', 'b', 'endpoints')]))
    expect(read('/repo')).toEqual([{ a: 'a', b: 'b', axis: 'endpoints' }])
  })

  test('survives anything that is not a register', () => {
    for (const junk of ['', 'not json', '{"a":1}', '[null]', '[{"a":""}]', '[{"b":"main"}]']) {
      localStorage.setItem(KEY, junk)
      expect(read('/repo')).toEqual([])
    }
  })

  test('an unknown axis reads as the default one', () => {
    localStorage.setItem(KEY, JSON.stringify([{ a: 'x', b: 'y', axis: 'sideways' }]))
    expect(read('/repo')[0].axis).toBe('diverged')
  })

  test('no repository, no register', () => {
    expect(read(null)).toEqual([])
  })
})
