import { numberLines, newSideLines, reviewMaterial, parseReview, reviewComparison, reviewPrompt, reviewRange } from '../ai-review'
import { splitDiff } from '../ai-diff'

// #265 — a review by the model before the pull request is opened. What is
// tested is what makes it trustworthy: the lines the model reads carry their
// numbers, an answer is checked against the diff it was given, and a diff too
// large to send whole says which files were read in part and which not at all.

const DIFF = [
  'diff --git a/src/retry.ts b/src/retry.ts',
  'index 1111111..2222222 100644',
  '--- a/src/retry.ts',
  '+++ b/src/retry.ts',
  '@@ -10,4 +10,5 @@ export function retry() {',
  '   const n = 3',
  '-  if (!ok) throw err',
  '+  if (!ok) return',
  '+  console.log("debug", err)',
  '   return value',
  'diff --git a/src/new.ts b/src/new.ts',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/src/new.ts',
  '@@ -0,0 +1,2 @@',
  '+export const a = 1',
  '+// TODO: remove',
  '',
].join('\n')
const FILES = splitDiff(DIFF)

describe('the lines the model reads', () => {
  test('each carries its number on the new side; a removed line has none', () => {
    const out = numberLines(FILES[0].body)
    expect(out).toContain('L10    const n = 3')
    expect(out).toContain('      -  if (!ok) throw err')
    expect(out).toContain('L11 +  if (!ok) return')
    expect(out).toContain('L12 +  console.log("debug", err)')
    expect(out).toContain('L13    return value')
    // The headers pass through untouched.
    expect(out).toContain('@@ -10,4 +10,5 @@')
  })

  test('the new side, and which of it was added', () => {
    const { shown, added } = newSideLines(FILES[0].body)
    expect([...shown].sort((a, b) => a - b)).toEqual([10, 11, 12, 13])
    expect(added).toEqual([11, 12])
  })
})

describe('the cut, accounted for', () => {
  test('whole when it fits', () => {
    const m = reviewMaterial(FILES, 'standard', 100000)
    expect(m.partial).toEqual([])
    expect(m.unread).toEqual([])
  })

  test('a small budget reads files in part, and says which; below a line, not at all', () => {
    const big = splitDiff([
      'diff --git a/a.ts b/a.ts', '--- a/a.ts', '+++ b/a.ts', '@@ -1,1 +1,400 @@',
      ...Array.from({ length: 400 }, (_, i) => `+line ${i} of something long enough to weigh`),
      'diff --git a/b.ts b/b.ts', '--- a/b.ts', '+++ b/b.ts', '@@ -1,1 +1,1 @@', '-x', '+y', '',
    ].join('\n'))
    const m = reviewMaterial(big, 'standard', 2000)
    expect(m.partial).toEqual(['a.ts'])
    expect(m.text).toContain('[... the rest of a.ts not shown]')
    expect(reviewMaterial(big, 'standard', 200).unread).toContain('a.ts')
    expect(reviewMaterial(big, 'full', 200)).toEqual(expect.objectContaining({ partial: [], unread: [] }))
  })
})

describe('the answer, checked against the diff', () => {
  const answer = (comments: unknown[]) => '```json\n' + JSON.stringify({ comments }) + '\n```'

  test('a comment lands on its line, its kind kept', () => {
    const c = parseReview(answer([{ file: 'src/retry.ts', line: 11, severity: 'risk', body: 'The error is swallowed.' }]), FILES)
    expect(c).toEqual([{ file: 'src/retry.ts', line: 11, severity: 'risk', body: 'The error is swallowed.' }])
  })

  test('one line off snaps to the nearest added line; far off becomes a comment on the file', () => {
    expect(parseReview(answer([{ file: 'src/retry.ts', line: 14, severity: 'leftover', body: 'debug' }]), FILES)[0].line).toBe(12)
    expect(parseReview(answer([{ file: 'src/retry.ts', line: 90, severity: 'note', body: 'x' }]), FILES)[0].line).toBeNull()
  })

  test('a file not in the diff is dropped; a short name for one file is that file', () => {
    const c = parseReview(answer([
      { file: 'src/elsewhere.ts', line: 1, severity: 'risk', body: 'no' },
      { file: 'new.ts', line: 2, severity: 'leftover', body: 'A TODO added.' },
      { file: 'b/src/new.ts', line: null, severity: 'whatever', body: 'File-level.' },
    ]), FILES)
    expect(c).toEqual([
      { file: 'src/new.ts', line: 2, severity: 'leftover', body: 'A TODO added.' },
      { file: 'src/new.ts', line: null, severity: 'note', body: 'File-level.' },
    ])
  })

  test('prose around the JSON is read past; no JSON is no comment, not an error', () => {
    expect(parseReview('Here you go: {"comments":[{"file":"src/new.ts","line":1,"severity":"note","body":"ok"}]} hope it helps', FILES)).toHaveLength(1)
    expect(parseReview('Looks fine to me.', FILES)).toEqual([])
    const many = Array.from({ length: 30 }, () => ({ file: 'src/new.ts', line: 1, severity: 'note', body: 'x' }))
    expect(parseReview(answer(many), FILES)).toHaveLength(20)
  })
})

describe('the call', () => {
  const git = (diff: string) => jest.fn(async (args: string[]) => {
    if (args[0] === 'diff') return diff
    if (args[0] === 'log') return 'Stop throwing on retry\n'
    return ''
  })

  test('asks for the review feature, with numbered lines, the commits and the map', async () => {
    const raw = git(DIFF)
    const run = jest.fn().mockResolvedValue({ text: '{"comments":[{"file":"src/retry.ts","line":12,"severity":"leftover","body":"Debug output left in."}]}' })
    const r = await reviewComparison(raw, run, 'main', 'feat')
    expect(raw).toHaveBeenCalledWith(['diff', '--no-color', '--no-ext-diff', '-M', 'main...feat', '--'])
    const [prompt, feature] = run.mock.calls[0]
    expect(feature).toBe('review')
    expect(prompt).toContain('L12 +  console.log("debug", err)')
    expect(prompt).toContain('- Stop throwing on retry')
    expect(prompt).toContain('src/new.ts  +2')
    expect(r).toEqual({ comments: [{ file: 'src/retry.ts', line: 12, severity: 'leftover', body: 'Debug output left in.' }], partial: [], unread: [] })
  })

  test('nothing to review, an option for a ref, a model that fails: said, and nothing sent', async () => {
    const run = jest.fn()
    expect((await reviewComparison(git(''), run, 'main', 'feat')).error).toMatch(/changes nothing/)
    expect((await reviewComparison(git(DIFF), run, '--output=x', 'feat')).error).toMatch(/Invalid/)
    expect(run).not.toHaveBeenCalled()
    const failing = jest.fn().mockResolvedValue({ error: 'rate limited' })
    expect((await reviewComparison(git(DIFF), failing, 'main', 'feat')).error).toBe('rate limited')
  })

  test('the two axes read what the comparison view shows', () => {
    expect(reviewRange('main', 'feat', 'diverged')).toEqual({ diff: ['main...feat'], log: ['main..feat'] })
    expect(reviewRange('main', 'feat', 'endpoints').diff).toEqual(['main', 'feat'])
    expect(reviewPrompt('m', 'f', [], '', '', 'Only risks')).toContain("The user's instructions for reviews: Only risks")
  })
})
