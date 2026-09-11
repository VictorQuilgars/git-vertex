import * as core from '../git-core'
import { makeSimpleGit } from '../git-service'
import simpleGit from 'simple-git'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

// The shared core (#191), exercised the way both products use it.
//
// Two runners, one set of cases. The desktop builds its simple-git through
// makeSimpleGit — the binary resolved via a login shell, so an app launched
// from the Finder does not fall back to Apple's git; the panel takes plain
// simple-git in VS Code's environment. Every case below runs against BOTH and
// asserts the two agree, because "the two hosts disagree" is the bug class this
// core exists to close: getBlame formatted its dates `fr-FR` on one side and
// `en-US` on the other, and no parity test could see it — the method existed on
// both sides with the right arity and quietly did something else.

// What the panel builds, reproduced: simple-git over an explicit allow-list
// with LC_ALL pinned (vscode-extension/src/gitService.ts::simpleGitEnv). The
// pinning is not decoration — the first run of this file, with a bare
// simpleGit(), had the two hosts disagree on the text of every failure because
// git answered one of them in French. A runner that does not pin the locale
// does not satisfy the contract in git-core.ts.
const PANEL_ENV_KEYS = [
  'HOME', 'PATH', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'SSH_AUTH_SOCK', 'XDG_CONFIG_HOME',
  'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM',
  'SystemRoot', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'ProgramData', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP',
]
function panelEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of PANEL_ENV_KEYS) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  env.LC_ALL = 'C'
  return env
}

const HOSTS: [string, (repo: string) => core.GitRunner][] = [
  ['desktop runner', repo => args => makeSimpleGit(repo).raw(args)],
  ['panel runner', repo => args => simpleGit(repo).env(panelEnv()).raw(args)],
]

/** Run one producer on both hosts, assert they agree, and return the result. */
async function onBothHosts<T>(repo: string, call: (run: core.GitRunner) => Promise<T>): Promise<T> {
  const [desktop, panel] = await Promise.all(HOSTS.map(([, make]) => call(make(repo))))
  expect(panel).toEqual(desktop)
  return desktop as T
}

describe('git-core — pure parsing', () => {
  describe('numstatPath', () => {
    test('a plain path is itself', () => {
      expect(core.numstatPath('src/App.tsx')).toBe('src/App.tsx')
    })
    test('a rename resolves to the new path', () => {
      expect(core.numstatPath('old.ts => new.ts')).toBe('new.ts')
    })
    test('a braced rename expands around the common parts', () => {
      expect(core.numstatPath('src/{old => new}/file.ts')).toBe('src/new/file.ts')
    })
    test('a braced rename with an empty side leaves no double slash', () => {
      expect(core.numstatPath('src/{ => nested}/file.ts')).toBe('src/nested/file.ts')
    })
  })

  describe('parseNumstat', () => {
    test('counts per path, renames keyed on the new name', () => {
      const out = core.parseNumstat('3\t1\tsrc/a.ts\n10\t0\tsrc/{x => y}/b.ts\n')
      expect(out.get('src/a.ts')).toEqual({ additions: 3, deletions: 1 })
      expect(out.get('src/y/b.ts')).toEqual({ additions: 10, deletions: 0 })
    })
    test('a binary file is omitted rather than counted as zero', () => {
      // git prints "-" for both columns; a 0/0 entry would claim it was read.
      expect([...core.parseNumstat('-\t-\timage.png\n').keys()]).toEqual([])
    })
  })

  describe('parseNameAndNumStat', () => {
    test('joins the two outputs, and a rename takes its new path', () => {
      const files = core.parseNameAndNumStat(
        'M\tsrc/a.ts\nA\tsrc/b.ts\nR100\tsrc/old.ts\tsrc/new.ts\n',
        '2\t1\tsrc/a.ts\n5\t0\tsrc/b.ts\n0\t0\tsrc/new.ts\n',
      )
      expect(files).toEqual([
        { path: 'src/a.ts', status: 'M', additions: 2, deletions: 1 },
        { path: 'src/b.ts', status: 'A', additions: 5, deletions: 0 },
        { path: 'src/new.ts', status: 'R', additions: 0, deletions: 0 },
      ])
    })
    test('a file with no stats line still appears, at zero', () => {
      expect(core.parseNameAndNumStat('M\tsrc/a.ts\n', '')).toEqual([
        { path: 'src/a.ts', status: 'M', additions: 0, deletions: 0 },
      ])
    })
    test('empty output is no files, not one empty file', () => {
      expect(core.parseNameAndNumStat('', '')).toEqual([])
    })
  })

  describe('parseBlamePorcelain', () => {
    const hashA = 'a'.repeat(40)
    const hashB = 'b'.repeat(40)
    // --porcelain names the author once per commit and only repeats the header
    // afterwards, which is the whole reason this parser carries a cache.
    const OUT = [
      `${hashA} 1 1 2`,
      'author Ada Lovelace',
      'author-time 1700000000',
      'author-tz +0000',
      'summary first',
      'filename src/a.ts',
      '\tconst a = 1',
      `${hashA} 2 2`,
      '\tconst b = 2',
      `${hashB} 3 3 1`,
      'author Grace Hopper',
      'author-time 1700086400',
      'summary second',
      'filename src/a.ts',
      '\tconst c = 3',
      '',
    ].join('\n')

    test('one entry per line, with its content and final line number', () => {
      const lines = core.parseBlamePorcelain(OUT)
      expect(lines.map(l => [l.lineNum, l.content])).toEqual([
        [1, 'const a = 1'], [2, 'const b = 2'], [3, 'const c = 3'],
      ])
    })

    test('a commit named once carries its author to every later line of its own', () => {
      const lines = core.parseBlamePorcelain(OUT)
      expect(lines.map(l => l.author)).toEqual(['Ada Lovelace', 'Ada Lovelace', 'Grace Hopper'])
      expect(lines.map(l => l.shortHash)).toEqual(['aaaaaaa', 'aaaaaaa', 'bbbbbbb'])
    })

    test('dates are written in one locale, whatever the host', () => {
      // The drift this core was built for: `fr-FR` on the desktop, `en-US` in
      // the panel, the same file blamed in the same shared view.
      expect(core.BLAME_DATE_LOCALE).toBe('en-US')
      const expected = new Date(1700000000 * 1000).toLocaleDateString('en-US')
      expect(core.parseBlamePorcelain(OUT)[0].date).toBe(expected)
      // …and that really is a different string from the one it used to produce.
      expect(expected).not.toBe(new Date(1700000000 * 1000).toLocaleDateString('fr-FR'))
    })

    test('output that is not blame produces no lines rather than junk', () => {
      expect(core.parseBlamePorcelain('fatal: no such path\n')).toEqual([])
    })
  })

  describe('compareRange', () => {
    test('endpoints is two-dot, diverged is three', () => {
      expect(core.compareRange('main', 'feature', 'endpoints')).toEqual(['main..feature'])
      expect(core.compareRange('main', 'feature', 'diverged')).toEqual(['main...feature'])
    })
    test('a null target is the working tree — one argument, no range', () => {
      expect(core.compareRange('main', null, 'endpoints')).toEqual(['main'])
      expect(core.compareRange('main', null, 'diverged')).toEqual(['main'])
    })
  })

  describe('workingFileDiffArgs', () => {
    test('staged reads the index', () => {
      expect(core.workingFileDiffArgs('a.ts', true)).toEqual(['diff', '--cached', '--', 'a.ts'])
    })
    test('no context means no -U at all — git keeps its own default', () => {
      expect(core.workingFileDiffArgs('a.ts', false)).toEqual(['diff', '--', 'a.ts'])
    })
    test('a context size is passed as -U, zero included', () => {
      expect(core.workingFileDiffArgs('a.ts', false, 0)).toEqual(['diff', '-U0', '--', 'a.ts'])
      expect(core.workingFileDiffArgs('a.ts', true, 9)).toEqual(['diff', '--cached', '-U9', '--', 'a.ts'])
    })
    test('a nonsense context is ignored rather than passed on', () => {
      expect(core.workingFileDiffArgs('a.ts', false, NaN)).toEqual(['diff', '--', 'a.ts'])
      expect(core.workingFileDiffArgs('a.ts', false, -4)).toEqual(['diff', '-U0', '--', 'a.ts'])
    })
  })

  describe('assertRef', () => {
    test('a real ref passes', () => {
      expect(core.assertRef('HEAD~2')).toBeNull()
    })
    test('empty is refused, and says which argument it was', () => {
      expect(core.assertRef('  ', 'commit')).toBe('Empty git commit')
      expect(core.assertRef(undefined as any)).toBe('Empty git reference')
    })
    test('a leading dash is refused — git would read it as an option', () => {
      expect(core.assertRef('--exec=rm', 'commit')).toBe('Invalid git commit: "--exec=rm"')
    })
  })
})

describe('git-core — against a real repository, on both hosts', () => {
  let repo: string
  let first: string
  let second: string

  const run = (cmd: string) => execSync(cmd, { cwd: repo, env: { ...process.env, LC_ALL: 'C' } }).toString()
  const write = (name: string, body: string) => fs.writeFileSync(path.join(repo, name), body)

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(require('os').tmpdir(), 'git-core-'))
    execSync(`git init -b main`, { cwd: repo })
    execSync(`git config user.email test@test.com && git config user.name "Test User"`, { cwd: repo, shell: '/bin/sh' })
    write('a.txt', 'one\ntwo\nthree\n')
    run('git add a.txt && git commit -m first')
    first = run('git rev-parse HEAD').trim()
    write('a.txt', 'one\nTWO\nthree\n')
    write('b.txt', 'new file\n')
    run('git add -A && git commit -m second')
    second = run('git rev-parse HEAD').trim()
  })

  afterEach(() => fs.rmSync(repo, { recursive: true, force: true }))

  test('commitDiff reads a commit, and the root commit through show', async () => {
    const later = await onBothHosts(repo, r => core.commitDiff(r, second))
    expect(later.error).toBeUndefined()
    expect(later.diff).toContain('+TWO')
    const root = await onBothHosts(repo, r => core.commitDiff(r, first))
    expect(root.diff).toContain('+one')
  })

  test('a commit that does not exist is an error, not an empty diff', async () => {
    // The whole point of the DiffResult contract: the view says what happened
    // instead of "No changes" over a commit git refused to show.
    const out = await onBothHosts(repo, r => core.commitDiff(r, 'f'.repeat(40)))
    expect(out.diff).toBe('')
    expect(out.error).toBeTruthy()
  })

  test('commitFiles lists what a commit touched, with its counts', async () => {
    const { files } = await onBothHosts(repo, r => core.commitFiles(r, second))
    expect(files).toEqual([
      { path: 'a.txt', status: 'M', additions: 1, deletions: 1 },
      { path: 'b.txt', status: 'A', additions: 1, deletions: 0 },
    ])
  })

  test('commitFiles reports the root commit too (--root)', async () => {
    const { files } = await onBothHosts(repo, r => core.commitFiles(r, first))
    expect(files.map(f => f.path)).toEqual(['a.txt'])
  })

  test('diffBetweenCommits follows the axis it is given', async () => {
    run('git checkout -q -b feature')
    write('c.txt', 'from the branch\n')
    run('git add -A && git commit -m branch')
    run('git checkout -q main')
    write('d.txt', 'from main\n')
    run('git add -A && git commit -m main-moved')

    const endpoints = await onBothHosts(repo, r => core.diffBetweenCommits(r, 'main', 'feature', 'endpoints'))
    const diverged = await onBothHosts(repo, r => core.diffBetweenCommits(r, 'main', 'feature', 'diverged'))
    // Two-dot reports what main gained as DELETED — the reason the axis exists.
    expect(endpoints.diff).toContain('d.txt')
    expect(diverged.diff).not.toContain('d.txt')
    expect(diverged.diff).toContain('c.txt')
  })

  test('a ref that git would read as an option never reaches git', async () => {
    const out = await onBothHosts(repo, r => core.diffBetweenCommits(r, '--output=/tmp/pwned', 'main'))
    expect(out).toEqual({ diff: '', error: 'Invalid git commit: "--output=/tmp/pwned"' })
    expect(fs.existsSync('/tmp/pwned')).toBe(false)
  })

  test('filesBetweenCommits answers the same comparison as a file list', async () => {
    const { files } = await onBothHosts(repo, r => core.filesBetweenCommits(r, first, second))
    expect(files.map(f => f.path)).toEqual(['a.txt', 'b.txt'])
  })

  test('mergeBase names the commit two refs share, and nothing when they share none', async () => {
    run('git checkout -q -b feature')
    write('c.txt', 'x\n')
    run('git add -A && git commit -m branch')
    const { base } = await onBothHosts(repo, r => core.mergeBase(r, 'main', 'feature'))
    expect(base).toBe(second)

    run('git checkout -q --orphan unrelated && git rm -rq --cached . && git clean -fdq')
    write('z.txt', 'z\n')
    run('git add -A && git commit -m orphan')
    const none = await onBothHosts(repo, r => core.mergeBase(r, 'main', 'unrelated'))
    expect(none.base).toBeNull()
  })

  test('workingFileDiff reads the working tree and the index apart', async () => {
    write('a.txt', 'one\nTWO\nTHREE\n')
    const unstaged = await onBothHosts(repo, r => core.workingFileDiff(r, 'a.txt', false))
    expect(unstaged.diff).toContain('+THREE')
    run('git add a.txt')
    const staged = await onBothHosts(repo, r => core.workingFileDiff(r, 'a.txt', true))
    expect(staged.diff).toContain('+THREE')
    expect((await onBothHosts(repo, r => core.workingFileDiff(r, 'a.txt', false))).diff).toBe('')
  })

  test('workingFileDiff honours the context it is asked for', async () => {
    const many = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`)
    write('ctx.txt', many.join('\n') + '\n')
    run('git add -A && git commit -m ctx')
    many[29] = 'changed'
    write('ctx.txt', many.join('\n') + '\n')
    const full = await onBothHosts(repo, r => core.workingFileDiff(r, 'ctx.txt', false, 10000))
    expect(full.diff).toContain('\n line 1\n')
    const zero = await onBothHosts(repo, r => core.workingFileDiff(r, 'ctx.txt', false, 0))
    expect(zero.diff).not.toContain('\n line 29\n')
  })

  test('workingNumstat counts each section on its own', async () => {
    write('a.txt', 'one\nTWO\nthree\nfour\n')
    run('git add a.txt')
    write('a.txt', 'one\nTWO\nthree\nfour\nfive\n')
    const staged = await onBothHosts(repo, r => core.workingNumstat(r, ['--cached']))
    const unstaged = await onBothHosts(repo, r => core.workingNumstat(r, []))
    expect(staged.get('a.txt')).toEqual({ additions: 1, deletions: 0 })
    expect(unstaged.get('a.txt')).toEqual({ additions: 1, deletions: 0 })
  })

  test('diffCommitToWorking compares a commit with what is on disk now', async () => {
    write('a.txt', 'one\nTWO\nthree\nfour\n')
    const out = await onBothHosts(repo, r => core.diffCommitToWorking(r, first))
    expect(out.diff).toContain('+four')
  })

  test('fileDiffAtCommit shows one path within one commit', async () => {
    const out = await onBothHosts(repo, r => core.fileDiffAtCommit(r, second, 'a.txt'))
    expect(out.diff).toContain('+TWO')
    expect(out.diff).not.toContain('b.txt')
  })

  test('stashDiff reads a stash, untracked files included', async () => {
    write('a.txt', 'one\nSTASHED\nthree\n')
    write('untracked.txt', 'not added\n')
    run('git stash push -u -m wip')
    const out = await onBothHosts(repo, r => core.stashDiff(r, 0))
    expect(out.error).toBeUndefined()
    expect(out.diff).toContain('+STASHED')
    expect(out.diff).toContain('untracked.txt')
  })

  test('stashDiff on a stash that is not there is an error', async () => {
    const out = await onBothHosts(repo, r => core.stashDiff(r, 7))
    expect(out).toEqual({ diff: '', error: expect.any(String) })
    expect(out.error).toBeTruthy()
  })

  test('blame names the author and the date of every line, identically on both hosts', async () => {
    const { lines } = await onBothHosts(repo, r => core.blame(r, 'HEAD', 'a.txt'))
    expect(lines.map(l => l.content)).toEqual(['one', 'TWO', 'three'])
    expect(lines.map(l => l.lineNum)).toEqual([1, 2, 3])
    expect(lines.every(l => l.author === 'Test User')).toBe(true)
    expect(lines[0].hash).toBe(first)
    expect(lines[1].hash).toBe(second)
    // en-US, not the host's locale: M/D/YYYY, never D/M/YYYY.
    expect(lines[0].date).toBe(new Date().toLocaleDateString('en-US'))
  })

  test('blame of a path that is not there is no lines, not a throw', async () => {
    await expect(onBothHosts(repo, r => core.blame(r, 'HEAD', 'nope.txt'))).resolves.toEqual({ lines: [] })
  })

  test('searchInDiffs finds the commit that introduced a string', async () => {
    const { hashes } = await onBothHosts(repo, r => core.searchInDiffs(r, 'TWO'))
    expect(hashes).toContain(second)
    expect(hashes).not.toContain(first)
  })

  test('searchInDiffs finds nothing for a string no commit carries', async () => {
    await expect(onBothHosts(repo, r => core.searchInDiffs(r, 'nothing-here-at-all')))
      .resolves.toEqual({ hashes: [] })
  })
})
