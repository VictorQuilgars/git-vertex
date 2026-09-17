import { changedFileCount } from '../workingChanges'

// The number on the working-tree row and in the pane's header. It is a count
// of files, and a file has one path however many columns of `git status` it
// occupies.

const f = (path: string) => ({ path, status: 'M' })

test('a file staged and then modified again is one file (#232)', () => {
  expect(changedFileCount({ staged: [f('a.ts')], unstaged: [f('a.ts')], untracked: [] })).toBe(1)
  expect(changedFileCount({ staged: [f('a.ts'), f('b.ts')], unstaged: [f('a.ts')], untracked: ['c.ts'] })).toBe(3)
})

test('three lists of different files simply add up', () => {
  expect(changedFileCount({ staged: [f('a')], unstaged: [f('b')], untracked: ['c', 'd/'] })).toBe(4)
})

test('nothing, or a list missing, is zero — not a crash', () => {
  expect(changedFileCount(null)).toBe(0)
  expect(changedFileCount({ staged: [], unstaged: [], untracked: [] })).toBe(0)
  expect(changedFileCount({ staged: [f('a')] })).toBe(1)
})
