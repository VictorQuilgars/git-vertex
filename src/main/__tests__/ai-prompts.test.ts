import { parseSplit, splitPrompt, explainBranchPrompt, changelogPrompt, truncateDiff } from '../ai-prompts'

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
