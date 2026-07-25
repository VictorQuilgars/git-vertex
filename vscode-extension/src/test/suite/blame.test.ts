import * as assert from 'assert'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execSync } from 'child_process'
import { BlameLine, blameFile, getUserEmail, parseLinePorcelain } from '../../blame/blame'
import { DEFAULT_LINE_FORMAT, formatAnnotation, formatRelative, truncate } from '../../blame/format'
import { bucketColor, heatmapBucket, heatmapIcon } from '../../blame/heatmap'
import { lensTitle, summarize } from '../../blame/summary'

// These modules deliberately avoid importing `vscode`, so this file runs both
// in the extension host and under plain `mocha out/test/suite/blame.test.js`.

const HOUR = 3600
const DAY = 24 * HOUR

function line(over: Partial<BlameLine> = {}): BlameLine {
  return {
    line: 1,
    hash: 'a'.repeat(40),
    shortHash: 'a'.repeat(8),
    author: 'Ada',
    authorMail: 'ada@example.com',
    authorTime: 1_700_000_000,
    summary: 'feat: something',
    uncommitted: false,
    ...over,
  }
}

suite('blame — porcelain parsing', () => {
  const fixture = [
    '1111111111111111111111111111111111111111 1 1 2',
    'author Ada Lovelace',
    'author-mail <ada@example.com>',
    'author-time 1700000000',
    'author-tz +0200',
    'committer Ada Lovelace',
    'committer-mail <ada@example.com>',
    'committer-time 1700000000',
    'committer-tz +0200',
    'summary first commit',
    'boundary',
    'filename file.txt',
    '\tfirst line',
    '1111111111111111111111111111111111111111 2 2',
    'author Ada Lovelace',
    'author-mail <ada@example.com>',
    'author-time 1700000000',
    'author-tz +0200',
    'summary first commit',
    'previous 0000000000000000000000000000000000000001 file.txt',
    'filename file.txt',
    '\tsecond line',
    '0000000000000000000000000000000000000000 3 3 1',
    'author Not Committed Yet',
    'author-mail <not.committed.yet>',
    'author-time 1700009999',
    'author-tz +0200',
    'summary Version of file.txt from file.txt',
    'filename file.txt',
    '\tthird line, still in the buffer',
    '',
  ].join('\n')

  test('reads author, mail, time and summary for every line', () => {
    const lines = parseLinePorcelain(fixture)
    assert.strictEqual(lines.length, 3)
    assert.strictEqual(lines[0].author, 'Ada Lovelace')
    assert.strictEqual(lines[0].authorMail, 'ada@example.com')
    assert.strictEqual(lines[0].authorTime, 1_700_000_000)
    assert.strictEqual(lines[0].summary, 'first commit')
    assert.strictEqual(lines[0].shortHash, '11111111')
  })

  test('numbers lines from the final file, not from the commit', () => {
    const lines = parseLinePorcelain(fixture)
    assert.deepStrictEqual(lines.map(l => l.line), [1, 2, 3])
  })

  test('flags the all-zero sha as uncommitted, and only that one', () => {
    const lines = parseLinePorcelain(fixture)
    assert.deepStrictEqual(lines.map(l => l.uncommitted), [false, false, true])
  })

  test('keeps tab-indented content out of the header parsing', () => {
    // A source line that itself looks like a porcelain header must not be
    // mistaken for one — content lines are tab-prefixed and end the entry.
    const tricky = [
      '2222222222222222222222222222222222222222 1 1 1',
      'author Bob',
      'author-mail <bob@example.com>',
      'author-time 1700000000',
      'summary only commit',
      'filename f.txt',
      '\t3333333333333333333333333333333333333333 9 9 9',
      '',
    ].join('\n')
    const lines = parseLinePorcelain(tricky)
    assert.strictEqual(lines.length, 1)
    assert.strictEqual(lines[0].author, 'Bob')
  })

  test('returns nothing for empty output', () => {
    assert.deepStrictEqual(parseLinePorcelain(''), [])
  })
})

suite('blame — against a real repository', () => {
  let tmpDir: string
  const filePath = (): string => path.join(tmpDir, 'file.txt')

  const commit = (message: string, name: string, email: string, date: string): void => {
    execSync('git add -A', { cwd: tmpDir, stdio: 'ignore' })
    execSync(`git commit -m "${message}"`, {
      cwd: tmpDir,
      stdio: 'ignore',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email, GIT_COMMITTER_DATE: date,
      },
    })
  }

  setup(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gv-blame-test-')))
    execSync('git init', { cwd: tmpDir, stdio: 'ignore' })
    execSync('git config user.email "ada@example.com"', { cwd: tmpDir, stdio: 'ignore' })
    execSync('git config user.name "Ada"', { cwd: tmpDir, stdio: 'ignore' })

    fs.writeFileSync(filePath(), 'one\ntwo\nthree\n')
    commit('first', 'Ada', 'ada@example.com', '2024-01-01T10:00:00+00:00')

    fs.writeFileSync(filePath(), 'one\nTWO\nthree\n')
    commit('second', 'Bob', 'bob@example.com', '2024-02-01T10:00:00+00:00')
  })

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('attributes each line to the commit that last touched it', async () => {
    const lines = await blameFile(tmpDir, 'file.txt')
    assert.strictEqual(lines.length, 3)
    assert.deepStrictEqual(lines.map(l => l.author), ['Ada', 'Bob', 'Ada'])
    assert.deepStrictEqual(lines.map(l => l.summary), ['first', 'second', 'first'])
    assert.deepStrictEqual(lines.map(l => l.line), [1, 2, 3])
    assert.strictEqual(lines.every(l => !l.uncommitted), true)
  })

  test('blames unsaved buffer contents, marking edited lines uncommitted', async () => {
    const lines = await blameFile(tmpDir, 'file.txt', { contents: 'one\nTWO\nedited in the editor\n' })
    assert.strictEqual(lines.length, 3)
    assert.strictEqual(lines[2].uncommitted, true)
    assert.strictEqual(lines[0].uncommitted, false)
    assert.strictEqual(lines[1].author, 'Bob')
  })

  test('reports added lines without touching the file on disk', async () => {
    const before = fs.readFileSync(filePath(), 'utf8')
    const lines = await blameFile(tmpDir, 'file.txt', { contents: 'one\nTWO\nthree\nfour\n' })
    assert.strictEqual(lines.length, 4)
    assert.strictEqual(lines[3].uncommitted, true)
    assert.strictEqual(fs.readFileSync(filePath(), 'utf8'), before)
  })

  test('ignoreWhitespace keeps re-indented lines with their original commit', async () => {
    const reindented = '  one\n  TWO\n  three\n'
    const ignoring = await blameFile(tmpDir, 'file.txt', { contents: reindented, ignoreWhitespace: true })
    assert.deepStrictEqual(ignoring.map(l => l.author), ['Ada', 'Bob', 'Ada'])
    const notIgnoring = await blameFile(tmpDir, 'file.txt', { contents: reindented })
    assert.strictEqual(notIgnoring.every(l => l.uncommitted), true)
  })

  test('returns nothing for an untracked file instead of throwing', async () => {
    fs.writeFileSync(path.join(tmpDir, 'untracked.txt'), 'nope\n')
    assert.deepStrictEqual(await blameFile(tmpDir, 'untracked.txt'), [])
  })

  test('returns nothing outside a repository', async () => {
    const nonGit = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gv-nongit-')))
    fs.writeFileSync(path.join(nonGit, 'file.txt'), 'x\n')
    const lines = await blameFile(nonGit, 'file.txt')
    fs.rmSync(nonGit, { recursive: true, force: true })
    assert.deepStrictEqual(lines, [])
  })

  test('getUserEmail reads the repository identity', async () => {
    assert.strictEqual(await getUserEmail(tmpDir), 'ada@example.com')
  })
})

suite('blame — annotation formatting', () => {
  const now = 1_700_000_000_000

  test('formatRelative walks the usual units', () => {
    const at = (seconds: number): string => formatRelative(now / 1000 - seconds, now)
    assert.strictEqual(at(10), 'just now')
    assert.strictEqual(at(60), '1 minute ago')
    assert.strictEqual(at(3 * 60), '3 minutes ago')
    assert.strictEqual(at(HOUR), '1 hour ago')
    assert.strictEqual(at(5 * HOUR), '5 hours ago')
    assert.strictEqual(at(DAY), '1 day ago')
    assert.strictEqual(at(3 * DAY), '3 days ago')
    assert.strictEqual(at(8 * DAY), '1 week ago')
    assert.strictEqual(at(45 * DAY), '1 month ago')
    assert.strictEqual(at(400 * DAY), '1 year ago')
  })

  test('a commit dated in the future reads as fresh, not negative', () => {
    assert.strictEqual(formatRelative(now / 1000 + 3 * HOUR, now), 'just now')
  })

  test('renders the default template', () => {
    const text = formatAnnotation(DEFAULT_LINE_FORMAT, line({ authorTime: now / 1000 - 2 * DAY }), { now })
    assert.strictEqual(text, 'Ada, 2 days ago • feat: something')
  })

  test('says "You" for the repository user, whatever the case', () => {
    const text = formatAnnotation('${author}', line(), { now, currentUserEmail: 'ADA@example.com' })
    assert.strictEqual(text, 'You')
    const other = formatAnnotation('${author}', line(), { now, currentUserEmail: 'bob@example.com' })
    assert.strictEqual(other, 'Ada')
  })

  test('uncommitted lines bypass the template', () => {
    const text = formatAnnotation(DEFAULT_LINE_FORMAT, line({ uncommitted: true, author: '', summary: '' }), { now })
    assert.strictEqual(text, 'You, uncommitted changes')
  })

  test('truncates the message to messageLength', () => {
    const long = line({ summary: 'a'.repeat(80) })
    const text = formatAnnotation('${message}', long, { now, messageLength: 10 })
    assert.strictEqual(text.length, 10)
    assert.ok(text.endsWith('…'))
    assert.strictEqual(formatAnnotation('${message}', long, { now, messageLength: 0 }).length, 80)
  })

  test('truncate leaves short strings alone', () => {
    assert.strictEqual(truncate('short', 40), 'short')
    assert.strictEqual(truncate('short', 0), 'short')
  })

  test('unknown tokens resolve to nothing', () => {
    assert.strictEqual(formatAnnotation('${author}${nope}', line(), { now }), 'Ada')
  })

  test('exposes hash and date tokens', () => {
    const text = formatAnnotation('${hash}', line(), { now })
    assert.strictEqual(text, 'aaaaaaaa')
    assert.ok(formatAnnotation('${date}', line(), { now }).length > 0)
  })
})

suite('blame — heatmap', () => {
  const now = 1_700_000_000_000

  test('buckets run from hot (just changed) to cold (past the threshold)', () => {
    assert.strictEqual(heatmapBucket(now / 1000, now, 90), 0)
    assert.strictEqual(heatmapBucket(now / 1000 - 90 * DAY, now, 90), 9)
    assert.strictEqual(heatmapBucket(now / 1000 - 900 * DAY, now, 90), 9)
    const mid = heatmapBucket(now / 1000 - 45 * DAY, now, 90)
    assert.ok(mid > 2 && mid < 7, `expected a middle bucket, got ${mid}`)
  })

  test('a future commit stays in the hottest bucket', () => {
    assert.strictEqual(heatmapBucket(now / 1000 + 10 * DAY, now, 90), 0)
  })

  test('a zero threshold does not divide by zero', () => {
    assert.strictEqual(heatmapBucket(now / 1000 - DAY, now, 0), 9)
  })

  test('bucket colors interpolate between the two ends', () => {
    assert.strictEqual(bucketColor(0), '#f66a0a')
    assert.strictEqual(bucketColor(9), '#0a60f6')
    for (let i = 0; i < 10; i++) assert.match(bucketColor(i), /^#[0-9a-f]{6}$/)
  })

  test('the gutter icon is a self-contained svg data uri', () => {
    const uri = heatmapIcon('#ff0000')
    assert.ok(uri.startsWith('data:image/svg+xml;base64,'))
    const svg = Buffer.from(uri.split(',')[1], 'base64').toString('utf8')
    assert.ok(svg.includes('#ff0000'))
    assert.ok(svg.startsWith('<svg'))
  })
})

suite('blame — CodeLens summaries', () => {
  const now = 1_700_000_000_000
  const lines: BlameLine[] = [
    line({ line: 1, author: 'Ada', authorMail: 'ada@example.com', authorTime: now / 1000 - 10 * DAY, summary: 'first' }),
    line({ line: 2, author: 'Bob', authorMail: 'bob@example.com', authorTime: now / 1000 - 2 * DAY, summary: 'second' }),
    line({ line: 3, author: 'Ada', authorMail: 'ada@example.com', authorTime: now / 1000 - 30 * DAY, summary: 'third' }),
    line({ line: 4, uncommitted: true, author: '', authorMail: '', authorTime: 0, summary: '' }),
  ]

  test('picks the most recent commit in the range', () => {
    const summary = summarize(lines, 0, 3)
    assert.ok(summary)
    assert.strictEqual(summary.latest.summary, 'second')
  })

  test('counts distinct authors, ignoring uncommitted lines', () => {
    assert.strictEqual(summarize(lines, 0, 3)?.authors, 2)
    assert.strictEqual(summarize(lines, 2, 2)?.authors, 1)
  })

  test('honours range bounds', () => {
    const summary = summarize(lines, 2, 2)
    assert.strictEqual(summary?.latest.summary, 'third')
  })

  test('returns null when a range has nothing committed', () => {
    assert.strictEqual(summarize(lines, 3, 3), null)
    assert.strictEqual(summarize([], 0, 10), null)
  })

  test('titles read as one author, or as a crowd', () => {
    const solo = summarize(lines, 2, 2)!
    assert.strictEqual(lensTitle(solo, now), 'Ada, 1 month ago • third')
    const pair = summarize(lines, 0, 3)!
    assert.strictEqual(lensTitle(pair, now), 'Bob and 1 other, 2 days ago • second')
    const crowd = { latest: pair.latest, authors: 3 }
    assert.ok(lensTitle(crowd, now).startsWith('Bob and 2 others,'))
  })
})
