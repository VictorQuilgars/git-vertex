import { splitDiff, shareBudget, renderDiff, fileMap, detailFor, detailKey } from '../ai-diff'

// The failure this replaces: `diff.slice(0, 6000)`. On a branch touching forty
// files that is the first two IN FULL and nothing at all of the rest — a
// partial view described with the confidence of a whole one. What is tested
// here is that nothing can disappear silently again.

const file = (path: string, plus: number, minus = 0) => [
  `diff --git a/${path} b/${path}`,
  `index 111..222 100644`,
  `--- a/${path}`,
  `+++ b/${path}`,
  `@@ -1,${minus} +1,${plus} @@`,
  ...Array.from({ length: plus }, (_, i) => `+line ${i} of ${path}`),
  ...Array.from({ length: minus }, (_, i) => `-old ${i} of ${path}`),
].join('\n')

describe('splitDiff', () => {
  test('a diff is the files it is made of', () => {
    const files = splitDiff([file('src/a.ts', 3), file('docs/b.md', 1, 2)].join('\n'))
    expect(files.map(f => f.path)).toEqual(['src/a.ts', 'docs/b.md'])
    expect(files[0]).toMatchObject({ added: 3, removed: 0 })
    expect(files[1]).toMatchObject({ added: 1, removed: 2 })
  })

  test('the +++/--- headers are not counted as changed lines', () => {
    // They start with + and -, and counting them inflates every file by one.
    expect(splitDiff(file('a.ts', 1))[0]).toMatchObject({ added: 1, removed: 0 })
  })

  test('a deletion is named by the file it was, not by /dev/null', () => {
    const gone = [
      'diff --git a/src/gone.ts b/src/gone.ts',
      'deleted file mode 100644',
      '--- a/src/gone.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-one', '-two',
    ].join('\n')
    expect(splitDiff(gone)[0]).toMatchObject({ path: 'src/gone.ts', removed: 2 })
  })

  test('anything before the first file belongs to no file and is dropped', () => {
    const files = splitDiff('some porcelain preamble\n' + file('a.ts', 1))
    expect(files).toHaveLength(1)
    expect(files[0].body.startsWith('diff --git')).toBe(true)
  })

  test('text that is not a diff yields no files rather than a wrong one', () => {
    expect(splitDiff('just prose about a change')).toEqual([])
  })
})

describe('shareBudget', () => {
  test('an even split when nobody needs less', () => {
    expect(shareBudget([100, 100, 100], 30)).toEqual([10, 10, 10])
  })

  test('a file smaller than its slice gives the rest back', () => {
    // Without the give-back the small file wastes its share and the large one
    // is cut harder than it needed to be.
    expect(shareBudget([5, 100], 50)).toEqual([5, 45])
  })

  test('everything fits, everything is kept', () => {
    expect(shareBudget([10, 20], 500)).toEqual([10, 20])
  })

  test('one enormous file cannot be the only one anybody sees', () => {
    // The prefix cut's exact failure: 6000 characters of file one, nothing of
    // the other two.
    const shares = shareBudget([100000, 500, 500], 3000)
    expect(shares[1]).toBe(500)
    expect(shares[2]).toBe(500)
    expect(shares[0]).toBe(2000)
  })

  test('a budget too small for one character each stops rather than looping', () => {
    expect(shareBudget([100, 100, 100], 2)).toEqual([0, 0, 0])
  })

  test('no files, no shares', () => {
    expect(shareBudget([], 100)).toEqual([])
  })
})

describe('renderDiff', () => {
  const big = [file('src/huge.ts', 400), file('src/small.ts', 2), file('docs/tiny.md', 1)].join('\n')

  test('the map is there at every level, whole', () => {
    for (const detail of ['summary', 'standard', 'full'] as const) {
      const out = renderDiff(big, { detail, budget: 400 })
      expect({ detail, files: out.includes('src/huge.ts') && out.includes('docs/tiny.md') })
        .toEqual({ detail, files: true })
      expect(out).toContain('Files changed (3)')
    }
  })

  test('summary is the whole change at no detail — not a sample of it', () => {
    const out = renderDiff(big, { detail: 'summary' })
    expect(out).toContain('+400')
    expect(out).not.toContain('+line 3 of src/huge.ts')
    expect(out).toContain('not a sample')
  })

  test('full is everything, budget or no budget', () => {
    const out = renderDiff(big, { detail: 'full', budget: 10 })
    expect(out).toContain('+line 399 of src/huge.ts')
    expect(out).toContain('+line 0 of docs/tiny.md')
  })

  test('standard shows every file, not the first two', () => {
    // The whole point: the small files survive the presence of a huge one.
    const out = renderDiff(big, { detail: 'standard', budget: 2000 })
    expect(out).toContain('+line 0 of src/small.ts')
    expect(out).toContain('+line 0 of docs/tiny.md')
    expect(out).toContain('more lines of src/huge.ts not shown')
  })

  test('what was cut is said, per file, in lines', () => {
    const out = renderDiff(big, { detail: 'standard', budget: 2000 })
    expect(out).toMatch(/\[\.\.\. \d+ more lines of src\/huge\.ts not shown\]/)
  })

  test('a cut lands on a line boundary — half a diff line reads as a real one', () => {
    const out = renderDiff(big, { detail: 'standard', budget: 2000 })
    for (const line of out.split('\n')) {
      // every kept body line is a whole one: a header, a hunk, or a +/- line
      if (line.startsWith('+line') || line.startsWith('-old')) {
        expect(line).toMatch(/^[+-](line \d+|old \d+) of \S+$/)
      }
    }
  })

  test('a file that got nothing still says it exists and was not read', () => {
    // Silence here is what let a model describe a change it had not seen.
    const out = renderDiff(big, { detail: 'standard', budget: 40 })
    expect(out).toContain('Files changed (3)')
    expect(out).toMatch(/\[src\/huge\.ts not shown — \d+ lines\]/)
    // A share that buys the `diff --git` line and nothing else is a header
    // pretending to be content — every file says it was not read instead.
    expect(out).not.toContain('@@')
  })

  test('something that is not a diff is cut plainly, and says it was', () => {
    const prose = 'x'.repeat(500)
    expect(renderDiff(prose, { budget: 100 })).toBe('x'.repeat(100) + '\n... [truncated]')
    expect(renderDiff(prose, { detail: 'full', budget: 100 })).toBe(prose)
  })

  test('an empty diff stays empty rather than growing a header', () => {
    expect(renderDiff('', { detail: 'standard' })).toBe('')
  })
})

describe('the setting', () => {
  test('nothing chosen is what everyone already had', () => {
    expect(detailFor({}, 'explain')).toBe('standard')
  })

  test('a level is per feature, and a nonsense value is not a level', () => {
    expect(detailFor({ [detailKey('explain')]: 'full' }, 'explain')).toBe('full')
    expect(detailFor({ [detailKey('explain')]: 'everything' }, 'explain')).toBe('standard')
    expect(detailFor({ [detailKey('explain')]: 'full' }, 'commit')).toBe('standard')
  })

  test('the key is the vocabulary the two products share', () => {
    expect(detailKey('explain')).toBe('aiDetail:explain')
  })
})

describe('fileMap', () => {
  test('one line per file, with what it did', () => {
    expect(fileMap(splitDiff([file('a.ts', 2, 1), file('b.ts', 0, 3)].join('\n'))))
      .toBe('  a.ts  +2 −1\n  b.ts  +0 −3')
  })
})
