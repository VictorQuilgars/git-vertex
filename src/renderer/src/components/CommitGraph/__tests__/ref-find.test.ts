import {
  elideRefName, matchRefs, parseTerms, pickLanding, refFindCandidates, scoreName, scoreTerm, stepIndex,
  type RefFindCandidate,
} from '../ref-find'

// The `/` finder is a type-ahead: what it can find, what a query matches, the
// order ↓ walks and the match the graph lands on. RefFinder.tsx draws these.

const branch = (name: string, over: Record<string, unknown> = {}) =>
  ({ name, current: false, remote: false, commit: 'abc1234', label: '', ...over }) as any
const cand = (label: string, over: Partial<RefFindCandidate> = {}): RefFindCandidate =>
  ({ kind: 'head', label, ref: label, aliases: [], current: false, ...over })

describe('what the finder can find', () => {
  const rows = new Map([['main', 0], ['origin/feature/x', 7], ['v1.0.0', 9]])
  const rowOf = (name: string) => rows.get(name)

  test('local and remote branches, tags and worktrees — loaded or not', () => {
    const found = refFindCandidates({
      branches: [
        branch('main', { current: true, date: 300 }),
        branch('feature/far', { date: 100, commit: 'far0000' }),
        branch('remotes/origin/feature/x', { remote: true, commit: 'fx00000' }),
      ],
      tags: [{ name: 'v1.0.0' }, { name: 'v0.9.0' }],
      worktrees: [
        { path: '/code/repo', branch: 'refs/heads/main', isMain: true },
        { path: '/code/repo-hotfix/', branch: 'refs/heads/feature/far' },
      ],
      rowOf,
    })
    expect(found.map(c => `${c.kind}:${c.label}`)).toEqual([
      'head:main', 'head:feature/far', 'remote:origin/feature/x', 'tag:v1.0.0', 'tag:v0.9.0', 'worktree:repo-hotfix',
    ])
    expect(found[0]).toMatchObject({ current: true, row: 0, date: 300 })
    expect(found[1].row).toBeUndefined()
    expect(found[2]).toMatchObject({ ref: 'origin/feature/x', row: 7 })
    // A tag is asked of git by its full name: a branch may be called the same.
    expect(found[3]).toMatchObject({ ref: 'refs/tags/v1.0.0', row: 9 })
    // A worktree is found by its folder AND by the branch it has out.
    expect(found[5]).toMatchObject({ ref: 'feature/far', aliases: ['feature/far'] })
  })

  test('a remote level with its local is an alias of it, not a second stop', () => {
    const found = refFindCandidates({
      branches: [
        branch('main', { commit: 'same111' }),
        branch('remotes/origin/main', { remote: true, commit: 'same111' }),
        branch('remotes/origin/HEAD', { remote: true, commit: 'same111' }),
        branch('dev', { commit: 'dev2222' }),
        branch('remotes/origin/dev', { remote: true, commit: 'dev9999' }),
      ],
      tags: [], rowOf: () => undefined,
    })
    expect(found.map(c => c.label)).toEqual(['main', 'dev', 'origin/dev'])
    expect(found[0].aliases).toEqual(['origin/main'])
  })

  test('what the user hid from the graph is not found: going there would undo the choice', () => {
    const found = refFindCandidates({
      branches: [branch('main'), branch('secret')], tags: [{ name: 'v1' }], rowOf: () => undefined,
      hidden: (name, kind) => name === 'secret' || kind === 'tag',
    })
    expect(found.map(c => c.label)).toEqual(['main'])
  })

  test('a detached HEAD is not a branch to go to', () => {
    const found = refFindCandidates({
      branches: [branch('rebasing feature', { detached: true, current: true }), branch('feature')],
      tags: [], rowOf: () => undefined,
    })
    expect(found.map(c => c.label)).toEqual(['feature'])
  })
})

describe('matching is by substring, never by subsequence', () => {
  test('the tiers: the whole name, a prefix, a prefix of the last segment, anywhere', () => {
    expect(scoreTerm('main', 'main')).toBe(1)
    expect(scoreTerm('maintenance', 'main')).toBe(0.9)
    expect(scoreTerm('feature/login', 'log')).toBe(0.8)
    const anywhere = scoreTerm('feature/relogin', 'log')
    expect(anywhere).toBeGreaterThan(0)
    expect(anywhere).toBeLessThan(0.8)
    // Letters in order are not a match: `gra` must not find `garbage-collector`.
    expect(scoreTerm('garbage-collector', 'gra')).toBe(0)
  })

  test('anywhere: earlier and shorter first', () => {
    expect(scoreTerm('a-login', 'log')).toBeGreaterThan(scoreTerm('a-very-long-prefix-login', 'log'))
    expect(scoreTerm('x-log', 'log')).toBeGreaterThan(scoreTerm('x-log-with-a-long-tail-after-it', 'log'))
  })

  test('it is not case sensitive', () => {
    expect(scoreName('Feature/LOGIN', parseTerms('feature/login'))).toBeGreaterThan(0.9)
  })

  test('a term with a slash matches path segments in order, and may skip some', () => {
    expect(scoreTerm('debt/feature/foo', 'd/foo')).toBeGreaterThan(0)
    expect(scoreTerm('debt/feature/foo', 'd/f/foo')).toBeGreaterThan(scoreTerm('debt/feature/foo', 'd/foo'))
    expect(scoreTerm('debt/feature/foo', 'foo/d')).toBe(0)
    // Matching the leaf exactly beats merely reaching it.
    expect(scoreTerm('debt/foo', 'd/foo')).toBeGreaterThan(scoreTerm('debt/foobar', 'd/foo'))
  })

  test('several terms all have to match, and the weakest decides', () => {
    expect(scoreName('feature/login-form', parseTerms('login form'))).toBeGreaterThan(0)
    expect(scoreName('feature/login-form', parseTerms('login nope'))).toBe(0)
    expect(scoreName('login', parseTerms('login log'))).toBe(0.9)
  })

  test('an empty query matches nothing', () => {
    expect(matchRefs([cand('main')], '')).toEqual([])
    expect(matchRefs([cand('main')], '   ')).toEqual([])
  })

  test('an alias finds its candidate', () => {
    const [hit] = matchRefs([cand('main', { aliases: ['origin/main'] })], 'origin')
    expect(hit.label).toBe('main')
  })
})

describe('the order ↓ walks, and where the graph lands', () => {
  const found = [
    cand('feature/old', { date: 100 }),
    cand('feature/b', { row: 40 }),
    cand('feature/new', { date: 900 }),
    cand('feature/a', { row: 3 }),
    cand('origin/feature/remote', { kind: 'remote' }),
    cand('feature', { row: 12, current: true }),
  ]

  test('the graph\'s own order first; then what is not loaded, most recent tip first, dateless last', () => {
    expect(matchRefs(found, 'feature').map(m => m.label)).toEqual([
      'feature/a', 'feature', 'feature/b', 'feature/new', 'feature/old', 'origin/feature/remote',
    ])
  })

  test('the landing is the best score, not the first row', () => {
    const matches = matchRefs(found, 'feature')
    expect(matches[pickLanding(matches)].label).toBe('feature')
  })

  test('ties: a branch before a worktree, the current branch, then the earlier row', () => {
    const tie = matchRefs([
      cand('wt', { kind: 'worktree', row: 1 }),
      cand('wt', { row: 9 }),
    ], 'wt')
    expect(tie[pickLanding(tie)].kind).toBe('head')
    const current = matchRefs([cand('fix-a', { row: 1 }), cand('fix-b', { row: 5, current: true })], 'fix')
    expect(current[pickLanding(current)].label).toBe('fix-b')
    const earlier = matchRefs([cand('fix-b', { row: 5 }), cand('fix-a', { row: 1 })], 'fix')
    expect(earlier[pickLanding(earlier)].label).toBe('fix-a')
    expect(pickLanding([])).toBe(-1)
  })

  test('↓ and ↑ wrap', () => {
    expect(stepIndex(2, 1, 3)).toBe(0)
    expect(stepIndex(0, -1, 3)).toBe(2)
    expect(stepIndex(0, 1, 0)).toBe(-1)
  })
})

describe('a long name is cut from the left: the tail tells two branches apart', () => {
  test('whole when it fits', () => expect(elideRefName('feature/foo', 36)).toBe('feature/foo'))
  test('leading segments go first', () => {
    expect(elideRefName('team/platform/feature/a-rather-long-branch-name', 36)).toBe('…/feature/a-rather-long-branch-name')
  })
  test('then the leaf, keeping its end', () => {
    const cut = elideRefName('a-single-segment-that-is-much-too-long-to-fit-anywhere', 20)
    expect(cut).toHaveLength(20)
    expect(cut.startsWith('…')).toBe(true)
    expect(cut.endsWith('fit-anywhere')).toBe(true)
  })
})
