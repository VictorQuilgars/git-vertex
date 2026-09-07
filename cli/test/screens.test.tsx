import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import { opened, type Screen } from './harness.js'

// What the screens SHOW — the audit's words for what the smoke test was not
// saying (#194). Every assertion here is about a fact of the repository being
// on the screen: a commit's subject and its hash, a branch, a file, a count.

let s: Screen
after(() => s?.stop())

describe('the screen, on a repository of three commits', () => {
  test('the header names the repository and the branch it is on', async () => {
    s = await opened()
    const frame = s.frame()
    assert.match(frame, /Git Vertex/)
    assert.ok(frame.includes(s.repo.split('/').pop()!), 'the repository name is in the header')
    assert.match(frame, /main/)
  })

  test('the graph lists every commit, newest first, with its short hash', async () => {
    const frame = s.frame()
    for (const subject of ['first commit', 'second commit', 'third commit']) {
      assert.ok(frame.includes(subject), `${subject} is on the screen`)
    }
    assert.ok(frame.indexOf('third commit') < frame.indexOf('first commit'), 'newest first')
    for (const hash of s.hashes()) {
      assert.ok(frame.includes(hash), `the short hash ${hash} is shown`)
    }
  })

  test('the panel says how many commits it holds', async () => {
    assert.match(s.frame(), /Commits 3/)
  })

  test('the working tree is a row of its own, counting what changed', async () => {
    // One modified file and one untracked: the row above the history says two.
    assert.match(s.frame(), /WIP · 2 /)
  })

  test('the sidebar lists the branches, the current one marked, and the tag', async () => {
    const frame = s.frame()
    assert.ok(frame.includes('● main'), 'the current branch is marked')
    assert.ok(frame.includes('feature'), 'the other branch is listed')
    assert.ok(frame.includes('v0.1.0'), 'the tag is listed')
  })

  test('the staging pane lists what changed, and says which is which', async () => {
    const frame = s.frame()
    // The mark is the state: ○ changed, + untracked, ● staged.
    assert.ok(frame.includes('○ M notes.txt'), 'the modified file, unstaged')
    assert.ok(frame.includes('+ ? untracked.txt'), 'the untracked file')
  })

  test('nothing is selected in the history until something is', async () => {
    // The selection starts on the working tree, so the details pane is not
    // showing a commit: the third commit's hash appears in the graph only.
    const frame = s.frame()
    const newest = s.hashes()[0]
    assert.equal(frame.split(newest).length - 1, 1, `${newest} appears once — in the graph`)
  })
})
