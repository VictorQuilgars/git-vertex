import { MIN_GIT_FOR_FSMONITOR, TUNED_KEY, TUNED_VALUE, isTuned, maybeTuneRepository, tuneRepository, type TuningRunner } from '../repo-tuning'
import { execFile, execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// These settings go into the user's own repository and every git client on
// the machine reads them afterwards. So the tests are mostly about restraint:
// what it refuses to do, on a git too old, on a platform without the daemon,
// on a filesystem whose mtimes git does not trust, and over a value the user
// put there themselves.

/** A runner over a scripted set of answers, recording what it was asked. */
function runner(answers: Record<string, { code?: number; stdout?: string }> = {}) {
  const asked: string[][] = []
  const run: TuningRunner = async (args) => {
    asked.push(args)
    const key = args.join(' ')
    const a = answers[key] ?? {}
    return { code: a.code ?? 0, stdout: a.stdout ?? '', stderr: '' }
  }
  return { run, asked, ran: (prefix: string) => asked.some(a => a.join(' ').startsWith(prefix)) }
}

const modern = { gitVersion: '2.45.0', platform: 'win32' }

test('on a modern git and a supported platform, both are switched on', async () => {
  const { run, asked, ran } = runner({ 'config --get core.fsmonitor': { code: 1 } })
  const report = await tuneRepository(run, modern)
  expect(report).toEqual({ fsmonitor: 'set', commitGraph: 'set' })
  expect(ran('config core.fsmonitor true')).toBe(true)
  expect(ran('commit-graph write --reachable')).toBe(true)
  expect(ran('config fetch.writeCommitGraph true')).toBe(true)
  expect(asked[asked.length - 1]).toEqual(['config', TUNED_KEY, TUNED_VALUE])
})

// It belongs in the list on merit and is left out because of how it has to be
// switched on: git's own test writes a file into the WORKING TREE and sleeps
// on it for six seconds. A background pass must not do that to someone's
// repository — see the note in repo-tuning.ts.
test('the untracked cache is not touched, and its six-second test is never run', async () => {
  const { run, ran } = runner({ 'config --get core.fsmonitor': { code: 1 } })
  await tuneRepository(run, modern)
  expect(ran('update-index --test-untracked-cache')).toBe(false)
  expect(ran('update-index --untracked-cache')).toBe(false)
  expect(ran('config core.untrackedCache')).toBe(false)
})

test('a git older than 2.37 has no built-in daemon, and is not asked to pretend', async () => {
  const { run, ran } = runner({})
  const report = await tuneRepository(run, { gitVersion: '2.36.0', platform: 'win32' })
  expect(report.fsmonitor).toBe('unsupported')
  expect(ran('config core.fsmonitor')).toBe(false)
})

test('a version git did not report is treated as too old', async () => {
  const { run, ran } = runner({})
  expect((await tuneRepository(run, { gitVersion: null, platform: 'win32' })).fsmonitor).toBe('unsupported')
  expect(ran('config core.fsmonitor')).toBe(false)
})

test('Linux has no built-in fsmonitor daemon; the commit-graph still applies', async () => {
  const { run, ran } = runner({})
  const report = await tuneRepository(run, { gitVersion: '2.45.0', platform: 'linux' })
  expect(report.fsmonitor).toBe('unsupported')
  expect(report.commitGraph).toBe('set')
  expect(ran('config core.fsmonitor')).toBe(false)
})

// A value already there is very possibly a path to the user's own hook, and
// `true` would quietly replace it with the built-in daemon.
test('a setting the user already made is left exactly as it is', async () => {
  const { run, ran } = runner({
    'config --get core.fsmonitor': { code: 0, stdout: '.git/hooks/fsmonitor-watchman\n' },
  })
  const report = await tuneRepository(run, modern)
  expect(report.fsmonitor).toBe('already')
  expect(ran('config core.fsmonitor true')).toBe(false)
})

test('a commit-graph that cannot be written does not stop the rest, nor claim a fetch hook', async () => {
  const { run, ran } = runner({
    'config --get core.fsmonitor': { code: 1 },
    'commit-graph write --reachable': { code: 1 },
  })
  const report = await tuneRepository(run, modern)
  expect(report.commitGraph).toBe('failed')
  expect(report.fsmonitor).toBe('set')
  expect(ran('config fetch.writeCommitGraph')).toBe(false)
})

test('a config write that fails is reported, not thrown', async () => {
  const { run } = runner({
    'config --get core.fsmonitor': { code: 1 },
    'config core.fsmonitor true': { code: 1 },
  })
  expect((await tuneRepository(run, modern)).fsmonitor).toBe('failed')
})

describe('a repository is tuned once', () => {
  test('the marker is read with one process', async () => {
    const { run, asked } = runner({ [`config --get ${TUNED_KEY}`]: { code: 0, stdout: `${TUNED_VALUE}\n` } })
    expect(await isTuned(run)).toBe(true)
    expect(asked).toHaveLength(1)
  })

  test('no marker, or an older one, means it has not been', async () => {
    expect(await isTuned(runner({ [`config --get ${TUNED_KEY}`]: { code: 1 } }).run)).toBe(false)
    expect(await isTuned(runner({ [`config --get ${TUNED_KEY}`]: { code: 0, stdout: '0\n' } }).run)).toBe(false)
  })
})

test('the floor for the built-in daemon is the version git shipped it in', () => {
  expect(MIN_GIT_FOR_FSMONITOR).toBe('2.37')
})


// Against real git, because everything above is a fake runner agreeing with
// the code that calls it. What this proves is the part a fake cannot: that
// these are the arguments git actually takes, and that the keys land in the
// repository's own config.
//
// `platform: 'linux'` deliberately, on whatever machine this runs: it is the
// one value that skips core.fsmonitor, and switching that on would leave a
// `git fsmonitor--daemon` behind for a directory the test is about to
// delete. What fsmonitor does with its arguments is covered above.
// The whole decision, which both hosts call rather than writing twice. The
// second copy would have lived in the extension host, where no test in this
// repository can reach it — and the panel would have drawn the checkbox with
// nothing behind it, which is the failure CLAUDE.md records shipping twice.
describe('maybeTuneRepository', () => {
  const modernOn = { enabled: true, gitVersion: '2.45.0', platform: 'win32' }

  test('the setting off means git is not even asked whether it has been done', async () => {
    const { run, asked } = runner({})
    expect(await maybeTuneRepository(run, { ...modernOn, enabled: false })).toBeNull()
    expect(asked).toEqual([])
  })

  test('a repository already tuned is left alone, at the cost of one process', async () => {
    const { run, asked } = runner({ [`config --get ${TUNED_KEY}`]: { code: 0, stdout: `${TUNED_VALUE}\n` } })
    expect(await maybeTuneRepository(run, modernOn)).toBeNull()
    expect(asked).toHaveLength(1)
  })

  test('a repository not yet tuned is, and says what it did', async () => {
    const { run, ran } = runner({
      [`config --get ${TUNED_KEY}`]: { code: 1 },
      'config --get core.fsmonitor': { code: 1 },
    })
    const report = await maybeTuneRepository(run, modernOn)
    expect(report).toEqual({ fsmonitor: 'set', commitGraph: 'set' })
    expect(ran('config core.fsmonitor true')).toBe(true)
  })

  // Called three seconds after a repository opens, from a main process and
  // from an extension host. Neither has anywhere useful to put a throw.
  test('a runner that throws is a repository that works as before', async () => {
    const angry: TuningRunner = async () => { throw new Error('git is gone') }
    await expect(maybeTuneRepository(angry, modernOn)).resolves.toBeNull()
  })
})

describe('against real git', () => {
  let dir: string
  const run: TuningRunner = (args) => new Promise(resolve => {
    execFile('git', ['-C', dir, ...args], { env: { ...process.env, LC_ALL: 'C' } }, (err, stdout, stderr) =>
      resolve({ code: err ? ((err as { code?: unknown }).code as number ?? 1) : 0, stdout: stdout || '', stderr: stderr || '' }))
  })
  const config = (key: string) => {
    try { return execSync(`git -C ${dir} config --get ${key}`).toString().trim() } catch { return '' }
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-tuning-'))
    execSync(`cd ${dir} && git init -q -b main && git config user.email t@t.c && git config user.name T`)
    fs.writeFileSync(path.join(dir, 'f.txt'), 'x')
    execSync(`cd ${dir} && git add . && git commit -q -m init`)
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  test('a real repository comes out tuned, and says it has been', async () => {
    expect(await isTuned(run)).toBe(false)
    const report = await tuneRepository(run, { gitVersion: '2.45.0', platform: 'linux' })

    expect(report.commitGraph).toBe('set')
    expect(fs.existsSync(path.join(dir, '.git', 'objects', 'info', 'commit-graph'))
      || fs.existsSync(path.join(dir, '.git', 'objects', 'info', 'commit-graphs'))).toBe(true)
    expect(config('fetch.writeCommitGraph')).toBe('true')

    expect(config(TUNED_KEY)).toBe(TUNED_VALUE)
    expect(await isTuned(run)).toBe(true)
  })
})
