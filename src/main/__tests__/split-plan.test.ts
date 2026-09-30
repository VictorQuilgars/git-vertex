import { measureSplit, readSplitProposal } from '../split-plan'
import { parseSplit } from '../ai-prompts'

// A split is a claim about files, from the composer's model or from an MCP
// agent (#88). Both go through measureSplit before anything reaches the
// review screen, and what is checked here is that the claim is made true
// rather than believed.

describe('measureSplit', () => {
  const known = ['README.md', 'src/a.ts', 'src/b.ts']

  test('keeps a plan that names real files, and lists the ones it left out', () => {
    const r = measureSplit([
      { message: 'feat: a', files: ['src/a.ts'] },
      { message: 'docs: readme', files: ['README.md'] },
    ], known)
    expect(r.groups).toEqual([
      { message: 'feat: a', files: ['src/a.ts'] },
      { message: 'docs: readme', files: ['README.md'] },
    ])
    expect(r.unassigned).toEqual(['src/b.ts'])
    expect(r.invented).toEqual([])
  })

  test('drops a path with no uncommitted work, and says so', () => {
    const r = measureSplit([{ message: 'feat: a', files: ['src/a.ts', 'src/gone.ts'] }], known)
    expect(r.groups).toEqual([{ message: 'feat: a', files: ['src/a.ts'] }])
    expect(r.invented).toEqual(['src/gone.ts'])
  })

  test('a file claimed twice belongs to the first commit', () => {
    const r = measureSplit([
      { message: 'feat: a', files: ['src/a.ts'] },
      { message: 'feat: b', files: ['src/a.ts', 'src/b.ts'] },
    ], known)
    expect(r.groups[1].files).toEqual(['src/b.ts'])
  })

  test('a commit left with no file, or with no message, is not kept', () => {
    const r = measureSplit([
      { message: 'feat: ghost', files: ['src/gone.ts'] },
      { message: '   ', files: ['src/a.ts'] },
    ], known)
    expect(r.groups).toEqual([])
    // The file of the messageless commit is not lost: it comes back loose.
    expect(r.unassigned).toEqual(known)
  })

  test('matches across Unicode normalizations and hands back git\'s spelling', () => {
    const nfd = 'démo.txt'  // what a macOS directory listing can give
    const nfc = 'démo.txt'   // what an agent's prompt usually carries
    const r = measureSplit([{ message: 'docs: demo', files: [nfc] }], [nfd])
    expect(r.groups).toEqual([{ message: 'docs: demo', files: [nfd] }])
    expect(r.invented).toEqual([])
  })

  test('parseSplit still reads the model\'s answer through it', () => {
    const r = parseSplit([
      '=== COMMIT ===', 'MESSAGE:', 'feat: a', 'FILES:', '- src/a.ts', '`src/invented.ts`',
    ].join('\n'), known)
    expect(r.groups).toEqual([{ message: 'feat: a', files: ['src/a.ts'] }])
    expect(r.invented).toEqual(['src/invented.ts'])
    expect(r.unassigned).toEqual(['README.md', 'src/b.ts'])
  })
})

describe('readSplitProposal', () => {
  test('reads the payload propose_split writes', () => {
    const payload = JSON.stringify({
      kind: 'split',
      commits: [{ message: 'feat: a', files: ['src/a.ts'] }, { message: 'docs: b', files: ['README.md'] }],
    })
    expect(readSplitProposal(payload)).toEqual([
      { message: 'feat: a', files: ['src/a.ts'] },
      { message: 'docs: b', files: ['README.md'] },
    ])
  })

  test.each([
    ['not JSON', 'nope'],
    ['no commits', JSON.stringify({ kind: 'split' })],
    ['a commit with no message', JSON.stringify({ commits: [{ files: ['a'] }] })],
    ['a file list that is not strings', JSON.stringify({ commits: [{ message: 'x', files: [1] }] })],
  ])('refuses %s rather than opening an empty screen', (_what, content) => {
    expect(() => readSplitProposal(content)).toThrow()
  })
})
