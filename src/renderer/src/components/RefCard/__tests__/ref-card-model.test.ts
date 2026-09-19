import { branchOf, mergeTargetOf, mergeVerdict, splitRemoteRef, upstreamFacts } from '../ref-card-model'

// What a branch's card concludes — tested as sentences' inputs, without a DOM.

describe('where a branch stands against its upstream', () => {
  test('each state, from the row git already gave', () => {
    expect(upstreamFacts({})).toEqual({ state: 'unpublished', ahead: 0, behind: 0 })
    expect(upstreamFacts({ upstream: 'origin/x' })).toMatchObject({ state: 'level', name: 'origin/x' })
    expect(upstreamFacts({ upstream: 'origin/x', ahead: 2 })).toMatchObject({ state: 'ahead', ahead: 2, behind: 0 })
    expect(upstreamFacts({ upstream: 'origin/x', behind: 3 })).toMatchObject({ state: 'behind', behind: 3 })
    expect(upstreamFacts({ upstream: 'origin/x', ahead: 1, behind: 3 })).toMatchObject({ state: 'diverged' })
  })

  test('an upstream that is gone is named, and counts nothing', () => {
    expect(upstreamFacts({ upstream: 'origin/x', gone: true, ahead: 4 })).toEqual({ state: 'missing', name: 'origin/x', ahead: 0, behind: 0 })
  })
})

describe('the one verdict against the merge target', () => {
  const facts = (ahead: number, behind: number, conflicts: number | null = null) => ({ target: 'main', ahead, behind, conflicts })

  test('behind, the check decides: clean, conflicts, or unknown when it could not say', () => {
    expect(mergeVerdict(facts(2, 5, 0))).toBe('clean')
    expect(mergeVerdict(facts(2, 5, 3))).toBe('conflicts')
    expect(mergeVerdict(facts(2, 5, null))).toBe('unknown')
  })

  test('not behind: nothing of the target\'s is missing here', () => {
    expect(mergeVerdict(facts(4, 0))).toBe('in-sync')
    // Conflicts cannot matter when the merge is a fast-forward.
    expect(mergeVerdict(facts(4, 0, 7))).toBe('in-sync')
  })

  test('nothing of its own left and the target moved on: merged', () => {
    expect(mergeVerdict(facts(0, 12))).toBe('merged')
  })

  test('a branch just cut is new, not merged', () => {
    expect(mergeVerdict(facts(0, 0))).toBe('in-sync')
  })
})

describe('which branch a reference merges into', () => {
  const head = (name: string) => ({ kind: 'head' as const, name, hash: 'h' })
  test('the default branch — unless this is it, or there is none', () => {
    expect(mergeTargetOf(head('feature'), 'main')).toBe('main')
    expect(mergeTargetOf(head('main'), 'main')).toBeNull()
    expect(mergeTargetOf(head('feature'), null)).toBeNull()
  })
  test('a remote branch and a tag merge into nothing', () => {
    expect(mergeTargetOf({ kind: 'remote', name: 'origin/feature', hash: 'h' }, 'main')).toBeNull()
    expect(mergeTargetOf({ kind: 'tag', name: 'v1', hash: 'h' }, 'main')).toBeNull()
  })
})

describe('finding the row a chip stands for', () => {
  const rows = [
    { name: 'feature/x', remote: false }, { name: 'remotes/origin/feature/x', remote: true },
  ] as any[]
  test('a remote chip is listed under remotes/, and a local one is not mistaken for it', () => {
    expect(branchOf({ kind: 'head', name: 'feature/x', hash: 'h' }, rows)).toBe(rows[0])
    expect(branchOf({ kind: 'remote', name: 'origin/feature/x', hash: 'h' }, rows)).toBe(rows[1])
    expect(branchOf({ kind: 'tag', name: 'feature/x', hash: 'h' }, rows)).toBeUndefined()
  })
  test('origin/feature/x is feature/x on origin', () => {
    expect(splitRemoteRef('origin/feature/x')).toEqual({ remote: 'origin', branch: 'feature/x' })
  })
})
