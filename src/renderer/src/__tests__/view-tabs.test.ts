import { sameView, viewNeedsRepo } from '../App'

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

  test('a file diff is that file, at that version', () => {
    const at = (hash: string, file: string) =>
      ({ view: 'fileDiff', target: { type: 'commit', commitHash: hash, filePath: file } }) as const
    expect(sameView(at('abc', 'a.ts'), at('abc', 'a.ts'))).toBe(true)
    expect(sameView(at('abc', 'a.ts'), at('def', 'a.ts'))).toBe(false)
    expect(sameView(at('abc', 'a.ts'), at('abc', 'b.ts'))).toBe(false)
  })

  // Staged and unstaged are two different diffs of one file, and reading one
  // while the other is open is the whole point of them being tabs.
  test('and a working file staged is not the same as unstaged', () => {
    const work = (area: 'staged' | 'unstaged') =>
      ({ view: 'fileDiff', target: { type: 'working', filePath: 'a.ts', area } }) as const
    expect(sameView(work('staged'), work('staged'))).toBe(true)
    expect(sameView(work('staged'), work('unstaged'))).toBe(false)
    expect(sameView(work('staged'), { view: 'fileDiff', target: { type: 'commit', commitHash: 'abc', filePath: 'a.ts' } })).toBe(false)
  })

  // These two show the whole of a thing rather than one of many, so a second
  // one would be the same tab twice.
  test('there is one GitHub tab and one settings tab', () => {
    expect(sameView({ view: 'github' }, { view: 'github' })).toBe(true)
    expect(sameView({ view: 'settings' }, { view: 'settings' })).toBe(true)
    expect(sameView({ view: 'github' }, { view: 'settings' })).toBe(false)
  })

  test('two different kinds are never the same view', () => {
    expect(sameView(compare('main', 'feature'), { view: 'fileHistory', file: 'a.ts' })).toBe(false)
  })

  // Reported: with no repository open, the gear, the profile chip and ⌘, all
  // did nothing. The tabs batch gave every view tab a repository — right for
  // the ones that are *of* something checked out, wrong for the settings, which
  // are the application's own screen. The guard now asks this rather than
  // assuming, so the two cannot drift apart again.
  test('the settings are not about a repository; everything else is', () => {
    expect(viewNeedsRepo({ view: 'settings' })).toBe(false)

    expect(viewNeedsRepo(compare('main', 'feature'))).toBe(true)
    expect(viewNeedsRepo({ view: 'fileHistory', file: 'a.ts' })).toBe(true)
    expect(viewNeedsRepo({ view: 'stash', index: 0, message: 'x' })).toBe(true)
    expect(viewNeedsRepo({ view: 'github' })).toBe(true)
    expect(viewNeedsRepo({
      view: 'fileDiff', target: { type: 'commit', commitHash: 'abc', filePath: 'a.ts' },
    })).toBe(true)
  })
})
