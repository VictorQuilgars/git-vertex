import * as fs from 'fs'
import * as path from 'path'
import {
  parseSplit, splitPrompt, explainBranchPrompt, changelogPrompt, truncateDiff,
  commitMessagePrompt, rewordCommitPrompt, explainCommitPrompt, pullRequestPrompt,
  parsePullRequest,
} from '../ai-prompts'

// The split is the one AI answer in the app whose every claim can be checked
// before anyone sees it — the paths it names either exist or they do not. So
// they are checked, the way aiSearchCommits checks the hashes it is handed
// back. These tests are that check.

const answer = (...blocks: string[]) => blocks.join('\n')
const block = (message: string, files: string[]) =>
  `=== COMMIT ===\nMESSAGE:\n${message}\nFILES:\n${files.join('\n')}`

describe('parseSplit', () => {
  const files = ['src/a.ts', 'src/b.ts', 'src/c.ts']

  test('reads a sequence of commits, in order', () => {
    const r = parseSplit(answer(
      block('refactor(a): extract the helper', ['src/a.ts']),
      block('feat(b): use it\n\nAnd say why.', ['src/b.ts', 'src/c.ts']),
    ), files)
    expect(r.groups).toEqual([
      { message: 'refactor(a): extract the helper', files: ['src/a.ts'] },
      { message: 'feat(b): use it\n\nAnd say why.', files: ['src/b.ts', 'src/c.ts'] },
    ])
    expect(r.unassigned).toEqual([])
    expect(r.invented).toEqual([])
  })

  test('a path the model invented is dropped, and reported', () => {
    const r = parseSplit(block('chore: tidy', ['src/a.ts', 'src/nope.ts']), files)
    expect(r.groups[0].files).toEqual(['src/a.ts'])
    expect(r.invented).toEqual(['src/nope.ts'])
  })

  test('a file claimed twice belongs to the first commit that claimed it', () => {
    const r = parseSplit(answer(
      block('one', ['src/a.ts', 'src/b.ts']),
      block('two', ['src/b.ts', 'src/c.ts']),
    ), files)
    expect(r.groups[0].files).toEqual(['src/a.ts', 'src/b.ts'])
    expect(r.groups[1].files).toEqual(['src/c.ts'])
  })

  test('a file the model placed nowhere comes back rather than vanishing', () => {
    // Silently dropping it would lose work: the user would commit two of three
    // files and believe the split was complete.
    const r = parseSplit(block('one', ['src/a.ts']), files)
    expect(r.unassigned).toEqual(['src/b.ts', 'src/c.ts'])
  })

  test('a commit left with no real file is dropped entirely', () => {
    // Its message described those files, so it describes nothing now.
    const r = parseSplit(answer(
      block('real', ['src/a.ts']),
      block('hallucinated', ['src/ghost.ts']),
    ), files)
    expect(r.groups.map(g => g.message)).toEqual(['real'])
  })

  test('tolerates the decorations a model adds on its own', () => {
    const r = parseSplit(
      '===== COMMIT =====\nMESSAGE:\nfix: it\nFILES:\n- `src/a.ts`\n  src/b.ts  \n', files)
    expect(r.groups[0].files).toEqual(['src/a.ts', 'src/b.ts'])
  })

  test('an answer in no recognisable shape yields no commit, never a guess', () => {
    expect(parseSplit('Sure! Here is how I would split this work: …', files).groups).toEqual([])
    expect(parseSplit('', files).unassigned).toEqual(files)
  })
})

describe('the prompts', () => {
  test('the split hands over the real paths, verbatim and countable', () => {
    const p = splitPrompt(['src/a.ts', 'b.md'], ' 2 files changed', 'diff --git a/src/a.ts')
    expect(p).toContain('Files (2):')
    expect(p).toContain('src/a.ts\nb.md')
    expect(p).toContain('EXACTLY ONE commit')
  })

  test('a branch is explained against a named base, with its commits in order', () => {
    const p = explainBranchPrompt('feat/x', 'origin/main', ['first', 'second'], '', '', undefined)
    expect(p).toContain('`feat/x`')
    expect(p).toContain('`origin/main`')
    expect(p.indexOf('- first')).toBeLessThan(p.indexOf('- second'))
  })

  test('guidance rides the explain prompt, and only when there is some', () => {
    expect(explainBranchPrompt('b', 'main', [], '', '', '  ')).not.toContain('User guidance')
    expect(explainBranchPrompt('b', 'main', [], '', '', 'the migration')).toContain('User guidance (what to focus the explanation on): the migration')
  })

  test('a branch with no commit of its own says so, rather than sending an empty list', () => {
    expect(explainBranchPrompt('b', 'main', [], '', '')).toContain('no commit of its own')
  })

  test('the changelog forbids the empty sections a model fills to be helpful', () => {
    const p = changelogPrompt('feat/x', 'main', ['feat: a'], '')
    expect(p).toContain('Never emit an empty section')
    expect(p).toContain('### Added')
  })
})

describe('truncateDiff', () => {
  test('says it cut, so the answer can be honest about what it did not see', () => {
    expect(truncateDiff('x'.repeat(50), 10)).toBe('x'.repeat(10) + '\n... [diff truncated]')
    expect(truncateDiff('short', 10)).toBe('short')
  })
})

describe('the four that used to live in two copies', () => {
  const diff = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n+one\n'

  test('each one still carries the diff, rendered at the level asked for', () => {
    for (const prompt of [
      commitMessagePrompt(diff, { detail: 'summary' }),
      rewordCommitPrompt(diff, 'wip', { detail: 'summary' }),
      explainCommitPrompt(diff, 'wip', undefined, { detail: 'summary' }),
      pullRequestPrompt('main', 'feat/x', ['one'], ' a | 1 +', diff, { detail: 'summary' }),
    ]) {
      expect(prompt).toContain('Files changed (1)')
      expect(prompt).toContain('do not name a behaviour')
    }
  })

  test('the reword hands over the old message labelled as unreliable', () => {
    // The feature exists for the commit whose message is "wip" or is about
    // the change its author meant to make — believing it defeats the point.
    expect(rewordCommitPrompt(diff, 'wip', {})).toContain('may be inaccurate or vague')
  })

  test('a focus reaches the commit explanation, as it does the branch one', () => {
    expect(explainCommitPrompt(diff, 'x', 'only the migration', {}))
      .toContain('User guidance (what to focus the explanation on): only the migration')
    expect(explainCommitPrompt(diff, 'x', '   ', {})).not.toContain('User guidance')
  })

  test('a pull request over fifty commits says how many it did not list', () => {
    const many = Array.from({ length: 60 }, (_, i) => `commit ${i}`)
    const p = pullRequestPrompt('main', 'feat/x', many, '', diff, {})
    expect(p).toContain('Commit subjects (60):')
    expect(p).toContain('- … and 10 more')
    expect(p).not.toContain('commit 55')
  })

  test('the pull request no longer claims the diff is its own beginning', () => {
    // It said "what follows is its beginning" whenever the diff was long —
    // true of a prefix cut, false since #185, and contradicted by what
    // renderDiff writes inside the same fence.
    const p = pullRequestPrompt('main', 'feat/x', ['one'], '', 'x'.repeat(30000), {})
    expect(p).not.toContain('its beginning')
  })

  test('the answer is read back as a title and a body, decoration stripped', () => {
    expect(parsePullRequest('\n## **Add the thing**\n\nWhat it does.\n- one'))
      .toEqual({ title: 'Add the thing', body: 'What it does.\n- one' })
    expect(parsePullRequest('   ')).toBeNull()
  })

  test('neither product keeps a copy of them any more', () => {
    // The drift these replace was real: the desktop asked about
    // "files/behaviors" with "no bullet lists", the extension about "files and
    // behaviours" with "no bullet list". Two products, two answers.
    const files = [
      path.join(__dirname, '../index.ts'),
      path.join(__dirname, '../../../vscode-extension/src/aiService.ts'),
    ]
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8')
      expect({ file, has: src.includes('Conventional Commits') }).toEqual({ file, has: false })
      expect({ file, has: src.includes('You write pull request titles') })
        .toEqual({ file, has: false })
    }
  })
})
