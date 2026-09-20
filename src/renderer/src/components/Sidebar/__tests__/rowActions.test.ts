// The state → acts mapping every side bar row is drawn from (#274).
import {
  branchRowActions, stashRowActions, tagRowActions, remoteRowActions, worktreeRowActions,
} from '../rowActions'

describe('a branch row', () => {
  const local = (extra: Partial<Parameters<typeof branchRowActions>[0]> = {}) =>
    branchRowActions({ current: false, publishedAs: 'origin/x', ...extra })

  test('behind pulls, ahead pushes, level offers no sync at all', () => {
    expect(local({ behind: 3 })).toContain('pull')
    expect(local({ behind: 3 })).not.toContain('push')
    expect(local({ ahead: 2 })).toContain('push')
    expect(local({ ahead: 2 })).not.toContain('pull')
    expect(local()).toEqual(['card', 'switch'])
  })

  test('diverged pulls — a push would be refused, so it is not what is offered', () => {
    expect(local({ ahead: 2, behind: 3 })).toEqual(['card', 'switch', 'pull'])
  })

  test('a branch the remote has never seen publishes', () => {
    expect(local({ publishedAs: undefined })).toEqual(['card', 'switch', 'publish'])
    // Even when it is ahead: there is no upstream for "ahead" to mean anything
    // against, and publishing is what sets one.
    expect(local({ publishedAs: undefined, ahead: 4 })).toEqual(['card', 'switch', 'publish'])
  })

  test('an upstream that is gone offers no sync: there is nothing to sync with', () => {
    expect(local({ gone: true, behind: 3 })).toEqual(['card', 'switch'])
  })

  test('the checked-out branch is not offered a switch to itself', () => {
    expect(branchRowActions({ current: true, publishedAs: 'origin/main', behind: 1 })).toEqual(['card', 'pull'])
    expect(branchRowActions({ current: true, publishedAs: 'origin/main' })).toEqual(['card'])
  })

  test('a remote branch lands and fetches, whatever its counts say', () => {
    expect(branchRowActions({ current: false, remote: true, ahead: 9, behind: 9 })).toEqual(['card', 'switch', 'fetch'])
  })
})

test('the other rows offer what is ever done to them', () => {
  expect(stashRowActions()).toEqual(['apply', 'pop', 'delete'])
  expect(tagRowActions()).toEqual(['card', 'switch'])
  expect(remoteRowActions()).toEqual(['fetch', 'open'])
  expect(worktreeRowActions({ active: false })).toEqual(['open'])
  // The one on screen is already open.
  expect(worktreeRowActions({ active: true })).toEqual([])
})
