import { sameView } from '../App'

// Opening a view twice should land you back on the tab you already have, not
// give you a second one — the rule the theme gallery already followed and that
// every view now shares. What counts as "the same view" is the whole rule: a
// comparison is its pair of refs, a history is its file, a stash is its index.

const compare = (a: string, b: string | null) =>
  ({ view: 'compare', a, b, axis: 'diverged', label: `${a} … ${b}` }) as const

describe('sameView', () => {
  test('a comparison is its two refs', () => {
    expect(sameView(compare('main', 'feature'), compare('main', 'feature'))).toBe(true)
    expect(sameView(compare('main', 'feature'), compare('main', 'other'))).toBe(false)
    expect(sameView(compare('main', null), compare('main', null))).toBe(true)
    expect(sameView(compare('main', null), compare('main', 'feature'))).toBe(false)
  })

  // The label carries the axis, so two comparisons of the same pair are one
  // tab whichever question it opened on — reopening it from a branch menu
  // should not strand you with two tabs of the same two refs.
  test('the label is not part of the identity', () => {
    const a = { view: 'compare', a: 'main', b: 'feature', axis: 'diverged', label: 'main … feature' } as const
    const b = { view: 'compare', a: 'main', b: 'feature', axis: 'endpoints', label: 'main ‥ feature' } as const
    expect(sameView(a, b)).toBe(true)
  })

  test('a history is its file, a stash is its index', () => {
    expect(sameView({ view: 'fileHistory', file: 'a.ts' }, { view: 'fileHistory', file: 'a.ts' })).toBe(true)
    expect(sameView({ view: 'fileHistory', file: 'a.ts' }, { view: 'fileHistory', file: 'b.ts' })).toBe(false)
    expect(sameView({ view: 'stash', index: 0, message: 'x' }, { view: 'stash', index: 0, message: 'y' })).toBe(true)
    expect(sameView({ view: 'stash', index: 0, message: 'x' }, { view: 'stash', index: 1, message: 'x' })).toBe(false)
  })

  test('two different kinds are never the same view', () => {
    expect(sameView(compare('main', 'feature'), { view: 'fileHistory', file: 'a.ts' })).toBe(false)
  })
})
