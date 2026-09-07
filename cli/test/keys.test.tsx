import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { opened, git, KEY, type Screen } from './harness.js'

// What a KEY does — the other half of what the smoke test could not say (#194).
// Each of these fails if the key stops doing what it does today, and says what
// was on the screen instead.
//
// Every test opens its own repository: a key that stages a file changes the
// state the next one would start from, and a suite whose tests depend on their
// order is a suite that lies about which key broke.

async function withScreen(fn: (s: Screen) => Promise<void>): Promise<void> {
  const s = await opened()
  try { await fn(s) } finally { s.stop() }
}

/** The details pane names the selected commit, so its hash is on screen twice. */
const selected = (s: Screen, hash: string) => s.frame().split(hash).length - 1 >= 2

describe('the history, under the arrow keys', () => {
  test('down selects the first commit, and the details pane follows', async () => {
    await withScreen(async s => {
      const [newest] = s.hashes()
      await s.press(KEY.down)
      await s.until('the newest commit selected', () => selected(s, newest))
      assert.ok(s.frame().includes('third commit'), 'its subject is still on the screen')
    })
  })

  test('down again moves on, and up comes back — j and k do the same', async () => {
    await withScreen(async s => {
      const [newest, second] = s.hashes()
      await s.press(KEY.down, KEY.down)
      await s.until('the second commit selected', () => selected(s, second))
      await s.press(KEY.up)
      await s.until('the newest commit selected again', () => selected(s, newest))
      await s.press('j')
      await s.until('j moving down like the arrow', () => selected(s, second))
      await s.press('k')
      await s.until('k moving up like the arrow', () => selected(s, newest))
    })
  })

  test('the selection stops at the ends rather than wrapping', async () => {
    await withScreen(async s => {
      const hashes = s.hashes()
      const oldest = hashes[hashes.length - 1]
      // Four commits' worth of presses over a history of three, plus the
      // working-tree row: the last one is still the oldest commit.
      await s.press(KEY.down, KEY.down, KEY.down, KEY.down, KEY.down)
      await s.until('the oldest commit selected', () => selected(s, oldest))
      await s.press(KEY.up, KEY.up, KEY.up, KEY.up, KEY.up)
      await s.until('back on the working tree, nothing selected below it',
        () => s.frame().split(hashes[0]).length - 1 === 1)
    })
  })
})

describe('what a commit opens onto', () => {
  test('Enter shows the commit\'s diff, and Escape gives the graph back', async () => {
    await withScreen(async s => {
      await s.press(KEY.down, KEY.enter)
      await s.until('the diff of the newest commit', f => f.includes('third line') && f.includes('@@'))
      // The centre is the diff now, so the rest of the history is not drawn.
      assert.ok(!s.frame().includes('first commit'), 'the graph gave up the centre')
      await s.press(KEY.escape)
      await s.until('the graph back', f => f.includes('Commits 3') && f.includes('first commit'))
    })
  })
})

describe('the working tree, from the keyboard', () => {
  test('3 focuses the files and Space stages the one under the cursor', async () => {
    await withScreen(async s => {
      assert.ok(s.frame().includes('○ M notes.txt'), 'notes.txt starts unstaged')
      await s.press('3', KEY.space)
      await s.until('notes.txt staged', f => f.includes('● M notes.txt'))
      assert.ok(!s.frame().includes('○ M notes.txt'), 'and no longer listed as unstaged')
      assert.equal(git(s.repo, 'diff', '--cached', '--name-only').trim(), 'notes.txt',
        'git agrees: the file is in the index')
    })
  })

  test('Space again takes it back out', async () => {
    await withScreen(async s => {
      await s.press('3', KEY.space)
      await s.until('staged', f => f.includes('● M notes.txt'))
      // The staged file is the last row of the pane; the cursor followed it.
      await s.press(KEY.down, KEY.space)
      await s.until('unstaged again', f => f.includes('○ M notes.txt'))
      assert.equal(git(s.repo, 'diff', '--cached', '--name-only').trim(), '', 'the index is empty again')
    })
  })
})

describe('reading the repository again', () => {
  test('r picks up a commit made behind the app\'s back', async () => {
    await withScreen(async s => {
      assert.ok(s.frame().includes('Commits 3'))
      fs.writeFileSync(path.join(s.repo, 'from-elsewhere.txt'), 'x\n')
      git(s.repo, 'add', 'from-elsewhere.txt')
      git(s.repo, 'commit', '-q', '-m', 'made from a terminal')
      await s.press('r')
      await s.until('the fourth commit', f => f.includes('Commits 4') && f.includes('made from a terminal'))
    })
  })
})

describe('the help', () => {
  test('? opens it over everything, and a key closes it', async () => {
    await withScreen(async s => {
      await s.press('?')
      await s.until('the help', f => f.includes('Tab') && !f.includes('third commit'))
      await s.press(KEY.escape)
      await s.until('the app back', f => f.includes('third commit'))
    })
  })
})
