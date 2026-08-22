import { prIntentFor, type PRContext } from '../prIntent'
import type { BranchInfo } from '../../../types'

const local = (name: string, over: Partial<BranchInfo> = {}): BranchInfo =>
  ({ name, current: false, remote: false, commit: 'abc1234', label: name, ...over })
const remote = (name: string): BranchInfo =>
  ({ name: `remotes/origin/${name}`, current: false, remote: true, commit: 'abc1234', label: name })

// A repo with a published trunk, one published topic branch and one that has
// never left the machine.
const repo = (currentBranch: string, over: Partial<PRContext> = {}): PRContext => ({
  currentBranch,
  defaultBranch: 'main',
  branches: [
    local('main', { current: currentBranch === 'main' }),
    local('feat/published', { current: currentBranch === 'feat/published' }),
    local('feat/local-only', { current: currentBranch === 'feat/local-only' }),
    remote('main'),
    remote('feat/published'),
  ],
  ...over,
})

describe('prIntentFor', () => {
  describe('rule 1 — the base has to exist on the remote', () => {
    test('a local-only branch is not a pull request target', () => {
      expect(prIntentFor('feat/local-only', repo('feat/published'))).toBeNull()
    })

    test('a published branch is', () => {
      expect(prIntentFor('feat/published', repo('feat/local-only'))).toMatchObject({
        head: 'feat/local-only', base: 'feat/published', baseLabel: 'origin/feat/published',
      })
    })

    test('nothing is offered at all when the trunk itself is unpublished', () => {
      const ctx = repo('feat/local-only', {
        branches: [local('main'), local('feat/local-only', { current: true })],
      })
      expect(prIntentFor('feat/local-only', ctx)).toBeNull()
      expect(prIntentFor('main', ctx)).toBeNull()
    })
  })

  describe('rule 2 — nothing starts from the default branch', () => {
    test('no pull request out of the branch you are on when it is the trunk', () => {
      expect(prIntentFor('main', repo('main'))).toBeNull()
    })

    test('and none out of the trunk towards a topic branch', () => {
      // The nonsense case: standing on main, right-clicking a feature branch
      // must not propose merging main into it.
      const intent = prIntentFor('feat/published', repo('main'))
      expect(intent).not.toBeNull()
      expect(intent!.head).not.toBe('main')
    })
  })

  test('rule 3 — the branch you are on goes into the default branch', () => {
    expect(prIntentFor('feat/published', repo('feat/published'))).toEqual({
      head: 'feat/published', base: 'main', baseLabel: 'origin/main', needsPush: false,
    })
  })

  test('rule 4 — on a topic branch, the branch you clicked is the base', () => {
    expect(prIntentFor('feat/published', repo('feat/local-only'))).toEqual({
      head: 'feat/local-only', base: 'feat/published', baseLabel: 'origin/feat/published',
      needsPush: true,
    })
  })

  describe('rule 5 — on the default branch, the branch you clicked is the head', () => {
    test('a local branch is pushed and proposed into the trunk', () => {
      expect(prIntentFor('feat/local-only', repo('main'))).toEqual({
        head: 'feat/local-only', base: 'main', baseLabel: 'origin/main', needsPush: true,
      })
    })

    test('the remote row of a branch proposes the same thing, without a push', () => {
      const ctx = repo('main')
      ctx.branches = ctx.branches.filter(b => b.name !== 'feat/published')  // remote-only
      expect(prIntentFor('remotes/origin/feat/published', ctx)).toEqual({
        head: 'feat/published', base: 'main', baseLabel: 'origin/main', needsPush: false,
      })
    })

    test('the trunk\'s own remote row still offers nothing', () => {
      expect(prIntentFor('remotes/origin/main', repo('main'))).toBeNull()
    })
  })

  describe('needsPush', () => {
    test('set when the branch has commits the remote has not seen', () => {
      const ctx = repo('feat/published')
      ctx.branches = ctx.branches.map(b =>
        b.name === 'feat/published' && !b.remote ? { ...b, ahead: 2 } : b)
      expect(prIntentFor('feat/published', ctx)!.needsPush).toBe(true)
    })

    test('clear when it is published and up to date', () => {
      expect(prIntentFor('feat/published', repo('feat/published'))!.needsPush).toBe(false)
    })
  })

  describe('edge cases', () => {
    test('a detached HEAD offers nothing', () => {
      expect(prIntentFor('feat/published', repo(''))).toBeNull()
    })

    test('an unknown default branch still allows a pull request from where you are', () => {
      expect(prIntentFor('feat/local-only', repo('feat/local-only', { defaultBranch: null })))
        .toEqual({ head: 'feat/local-only', base: null, baseLabel: null, needsPush: true })
    })

    test('a branch published under a non-origin remote is labelled with it', () => {
      const ctx = repo('feat/local-only', {
        defaultBranch: 'trunk',
        branches: [
          local('feat/local-only', { current: true }),
          { name: 'remotes/upstream/trunk', current: false, remote: true, commit: 'a', label: 'trunk' },
        ],
      })
      expect(prIntentFor('feat/local-only', ctx)).toMatchObject({ baseLabel: 'upstream/trunk' })
    })
  })
})

// Rule 6 — Victor's report: a branch whose pull request is already open still
// offered "Push and start a Pull Request" on right-click. The panel knew: the
// same list puts the #N chip on that branch two panels away.
describe('rule 6 — a request that already exists is not proposed again', () => {
  const openPR = (headRef: string, baseRef: string) => ({ headRef, baseRef })

  test('the branch you are on, with its request already open, offers nothing', () => {
    const ctx = repo('feat/published', { openPRs: [openPR('feat/published', 'main')] })
    expect(prIntentFor('feat/published', ctx)).toBeNull()
  })

  test('and offers it again once nothing is open for that pair', () => {
    expect(prIntentFor('feat/published', repo('feat/published', { openPRs: [] })))
      .toMatchObject({ head: 'feat/published', base: 'main' })
  })

  // Rule 5's direction has to be checked against the SAME pair it proposes —
  // the row clicked is the head there, not the base.
  test('from the default branch, a row whose request is open is suppressed too', () => {
    const ctx = repo('main', { openPRs: [openPR('feat/published', 'main')] })
    expect(prIntentFor('feat/published', ctx)).toBeNull()
  })

  // GitHub only refuses the exact pair; a different base is a stacked request.
  test('the same head into a different base is still a request to start', () => {
    const ctx = repo('main', { openPRs: [openPR('feat/published', 'feat/other')] })
    expect(prIntentFor('feat/published', ctx)).toMatchObject({
      head: 'feat/published', base: 'main',
    })
  })

  test('someone else\'s open request does not silence your branch', () => {
    const ctx = repo('feat/published', { openPRs: [openPR('feat/unrelated', 'main')] })
    expect(prIntentFor('feat/published', ctx)).toMatchObject({ head: 'feat/published' })
  })

  // Before the list arrives, and in a repo with no GitHub at all, the row must
  // behave exactly as it did — absent is not empty.
  test('no list at all proposes as before', () => {
    expect(prIntentFor('feat/published', repo('feat/published'))).toMatchObject({
      head: 'feat/published', base: 'main',
    })
  })
})
