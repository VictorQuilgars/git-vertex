import { remoteNames, shortName, canonicalRef, publishedNameFor } from '../branchRefs'
import type { BranchInfo } from '../../../types'

const b = (name: string, remote = false): BranchInfo =>
  ({ name, current: false, remote, commit: 'abc1234', label: name })

const branches: BranchInfo[] = [
  b('main'), b('feat/x'), b('feat/local-only'),
  b('remotes/origin/main', true), b('remotes/origin/feat/x', true),
  b('remotes/upstream/main', true),
]

describe('branch ref shapes', () => {
  test('remoteNames collects every remote that has a branch', () => {
    expect(remoteNames(branches)).toEqual(new Set(['origin', 'upstream']))
  })

  describe('shortName', () => {
    const remotes = remoteNames(branches)

    test('strips the branch-list form', () => {
      expect(shortName('remotes/origin/feat/x', remotes)).toBe('feat/x')
    })

    test('strips the graph decoration form', () => {
      expect(shortName('origin/feat/x', remotes)).toBe('feat/x')
    })

    test('leaves a local branch whose first segment is not a remote', () => {
      expect(shortName('feat/x', remotes)).toBe('feat/x')
      expect(shortName('main', remotes)).toBe('main')
    })

    test('a branch named after a remote is only stripped when it really is one', () => {
      expect(shortName('upstream/main', remotes)).toBe('main')
      expect(shortName('release/main', remotes)).toBe('release/main')
    })
  })

  describe('canonicalRef', () => {
    test('turns a graph decoration into the branch-list form', () => {
      expect(canonicalRef('origin/feat/x', branches)).toBe('remotes/origin/feat/x')
    })

    test('leaves an already-canonical ref alone', () => {
      expect(canonicalRef('remotes/origin/main', branches)).toBe('remotes/origin/main')
    })

    test('leaves a local branch alone, even one shaped like a remote ref', () => {
      expect(canonicalRef('feat/x', branches)).toBe('feat/x')
      expect(canonicalRef('release/main', branches)).toBe('release/main')
    })
  })

  describe('publishedNameFor', () => {
    test('names the remote copy of a local branch', () => {
      expect(publishedNameFor('feat/x', branches)).toBe('origin/feat/x')
    })

    test('answers for a remote ref too', () => {
      expect(publishedNameFor('remotes/origin/feat/x', branches)).toBe('origin/feat/x')
    })

    test('is null when the remote has never seen the branch', () => {
      expect(publishedNameFor('feat/local-only', branches)).toBeNull()
    })
  })
})
