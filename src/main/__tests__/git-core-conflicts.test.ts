import { execSync, spawnSync } from 'child_process'
import * as fs from 'fs'
import {
  predictConflicts, predictRebaseConflicts, pullRequestConflicts, duplicateCommits,
  type GitRunner, type GitRawRunner,
} from '../git-core'

// The conflict family (#305, #307), against real repositories — because every
// one of these is a claim about what GIT does, not about a string.
//
// `merge-tree` answers by its exit code, so the suite builds a raw runner as
// well as an ordinary one: that difference is the whole reason this family sat
// on the two hosts, written out twice, until the core grew a second runner.

const env = { ...process.env, LC_ALL: 'C' }

/** A repository the tests own, with an identity of its own: a machine's global config is not a fixture. */
function makeRepo(dir: string, branch = 'main'): void {
  execSync(`git init -q -b ${branch} ${dir}`)
  execSync(`git -C ${dir} config user.email t@t.com`)
  execSync(`git -C ${dir} config user.name T`)
}

function runnersFor(dir: string): { run: GitRunner; runRaw: GitRawRunner } {
  const quote = (a: string) => `'${a.replace(/'/g, "'\\''")}'`
  return {
    run: async (args) => execSync(`git -C ${dir} ${args.map(quote).join(' ')}`, { encoding: 'utf8', env }),
    runRaw: async (args) => {
      const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', env })
      return { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' }
    },
  }
}

describe('predicting a merge', () => {
  let dir = ''
  let runRaw: GitRawRunner
  const git = (cmd: string) => execSync(`git -C ${dir} ${cmd}`, { encoding: 'utf8', env })

  beforeEach(() => {
    dir = `/tmp/gv-conflict-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    makeRepo(dir)
    fs.writeFileSync(`${dir}/shared.txt`, 'one\n')
    fs.writeFileSync(`${dir}/theirs-only.txt`, 'untouched\n')
    git('add -A'); git('commit -qm base')
    git('checkout -q -b theirs')
    fs.writeFileSync(`${dir}/shared.txt`, 'their one\n')
    git('commit -qam "theirs"')
    git('checkout -q main')
    ;({ runRaw } = runnersFor(dir))
  })

  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* gone */ } })

  test('a clash is named, file by file', async () => {
    fs.writeFileSync(`${dir}/shared.txt`, 'my one\n')
    git('commit -qam "mine"')
    const r = await predictConflicts(runRaw, 'theirs', 'main')
    expect(r.error).toBeUndefined()
    expect(r.files).toEqual(['shared.txt'])
  })

  test('a clean merge is an empty list and no error — and nothing is written', async () => {
    fs.writeFileSync(`${dir}/mine.txt`, 'elsewhere\n')
    git('add -A'); git('commit -qm "mine, elsewhere"')
    const before = git('rev-parse main HEAD').trim()
    const r = await predictConflicts(runRaw, 'theirs', 'main')
    expect(r).toEqual({ files: [] })
    // No ref moved, no file changed: the prediction is a dry run.
    expect(git('rev-parse main HEAD').trim()).toBe(before)
    expect(git('status --porcelain').trim()).toBe('')
  })

  test('a ref that is an option is refused before git runs', async () => {
    const calls: string[][] = []
    const spy: GitRawRunner = async args => { calls.push(args); return { code: 0, stdout: '', stderr: '' } }
    const r = await predictConflicts(spy, '--upload-pack=boom', 'main')
    expect(r.files).toEqual([])
    expect(r.error).toBeTruthy()
    expect(calls).toEqual([])
  })

  test('a prediction that could not run says so, rather than reporting a clean merge', async () => {
    const r = await predictConflicts(runRaw, 'no-such-branch', 'main')
    expect(r.files).toEqual([])
    expect(r.error).toBeTruthy()
  })
})

describe('predicting a rebase', () => {
  let dir = ''
  let runRaw: GitRawRunner
  const git = (cmd: string) => execSync(`git -C ${dir} ${cmd}`, { encoding: 'utf8', env })

  beforeEach(() => {
    dir = `/tmp/gv-rebase-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    makeRepo(dir)
    fs.writeFileSync(`${dir}/f.txt`, 'base\n')
    git('add -A'); git('commit -qm base')
    ;({ runRaw } = runnersFor(dir))
  })

  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* gone */ } })

  test('a conflict that only happens mid-replay is caught, with the commit that causes it', async () => {
    // The branch touches the line and then puts it back: merging the two TIPS
    // nets to nothing, and the replay still stops on the way through.
    git('checkout -q -b feature')
    fs.writeFileSync(`${dir}/f.txt`, 'feature\n')
    git('commit -qam "feature changes it"')
    const guilty = git('rev-parse --short=7 HEAD').trim()
    fs.writeFileSync(`${dir}/f.txt`, 'base\n')
    git('commit -qam "feature puts it back"')
    git('checkout -q main')
    fs.writeFileSync(`${dir}/f.txt`, 'main moved on\n')
    git('commit -qam "main changes it"')

    // The one-shot tip merge sees nothing...
    expect((await predictConflicts(runRaw, 'feature', 'main')).files).toEqual([])
    // ...the replay does, and says where.
    const r = await predictRebaseConflicts(runRaw, 'main', 'feature')
    expect(r.files).toEqual(['f.txt'])
    expect(r.atCommit).toBe(guilty)
  })

  test('nothing to replay is clean, not unknown', async () => {
    git('checkout -q -b idle')
    const r = await predictRebaseConflicts(runRaw, 'main', 'idle')
    expect(r).toEqual({ files: [] })
  })
})

describe("a pull request's conflicts", () => {
  let dir = ''
  let remote = ''
  let run: GitRunner
  let runRaw: GitRawRunner
  let headSha = ''
  const git = (cmd: string) => execSync(`git -C ${dir} ${cmd}`, { encoding: 'utf8', env })

  beforeEach(() => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    dir = `/tmp/gv-prconf-${stamp}`
    remote = `/tmp/gv-prconf-${stamp}-remote.git`
    // -b main on the bare one too: its HEAD decides what a clone lands on, and
    // a runner whose init.defaultBranch is master would hand the suite `master`.
    execSync(`git init -q --bare -b main ${remote}`)

    const seed = `${dir}-seed`
    makeRepo(seed)
    fs.writeFileSync(`${seed}/CHANGELOG.md`, '# Changelog\n\n## Unreleased\n')
    execSync(`git -C ${seed} add -A && git -C ${seed} commit -qm base`)
    execSync(`git -C ${seed} push -q ${remote} main`)

    // The request: an entry under Unreleased, published where GitHub puts it.
    execSync(`git -C ${seed} checkout -q -b theirs`)
    fs.writeFileSync(`${seed}/CHANGELOG.md`, '# Changelog\n\n## Unreleased\n\n- what the request adds\n')
    execSync(`git -C ${seed} commit -qam "the request"`)
    headSha = execSync(`git -C ${seed} rev-parse HEAD`, { encoding: 'utf8' }).trim()
    execSync(`git -C ${seed} push -q ${remote} HEAD:refs/pull/42/head`)

    // The clone, taken BEFORE the base moves: its `main` is stale from here on,
    // which is the whole point of reading the base from the remote.
    execSync(`git clone -q ${remote} ${dir}`)
    git('config user.email t@t.com')
    git('config user.name T')

    // ...and now the base grows its own entry in the same place.
    execSync(`git -C ${seed} checkout -q main`)
    fs.writeFileSync(`${seed}/CHANGELOG.md`, '# Changelog\n\n## Unreleased\n\n- what the base added meanwhile\n')
    execSync(`git -C ${seed} commit -qam "the base moves on"`)
    execSync(`git -C ${seed} push -q ${remote} main`)
    fs.rmSync(seed, { recursive: true, force: true })

    ;({ run, runRaw } = runnersFor(dir))
  })

  afterEach(() => {
    for (const p of [dir, remote]) { try { fs.rmSync(p, { recursive: true, force: true }) } catch { /* gone */ } }
  })

  test('names the files, reading the base from the remote and not the stale local branch', async () => {
    // Against what this clone holds, there is nothing to conflict with.
    expect((await predictConflicts(runRaw, 'origin/main', 'main')).files).toEqual([])

    const r = await pullRequestConflicts(run, runRaw, { remote: 'origin', number: 42, baseRef: 'main', headSha })
    expect(r.error).toBeUndefined()
    expect(r.files).toEqual(['CHANGELOG.md'])
    expect(r.head).toBe(headSha)
    expect(r.base).not.toBe(git('rev-parse main').trim())   // the remote's tip, not ours
    expect(r.moved).toBeUndefined()
  })

  test('writes no ref: no branch is made for the head it read', async () => {
    const refs = () => git("for-each-ref --format='%(refname)' refs/heads").trim()
    const before = refs()
    await pullRequestConflicts(run, runRaw, { remote: 'origin', number: 42, baseRef: 'main' })
    expect(git('branch --list pr/42').trim()).toBe('')
    expect(refs()).toBe(before)
  })

  test('a head that has moved since the forge answered is said, not passed off as the same commit', async () => {
    const r = await pullRequestConflicts(run, runRaw, {
      remote: 'origin', number: 42, baseRef: 'main', headSha: '0'.repeat(40),
    })
    expect(r.moved).toBe(true)
    expect(r.head).toBe(headSha)
  })

  test('a request the remote does not publish is an error, never an empty list read as clean', async () => {
    const r = await pullRequestConflicts(run, runRaw, { remote: 'origin', number: 999, baseRef: 'main' })
    expect(r.files).toEqual([])
    expect(r.error).toMatch(/#999/)
  })

  test('a number that is not one, and a remote that is an option, are refused before git', async () => {
    const calls: string[][] = []
    const spy: GitRunner = async args => { calls.push(args); return '' }
    const spyRaw: GitRawRunner = async args => { calls.push(args); return { code: 0, stdout: '', stderr: '' } }
    expect((await pullRequestConflicts(spy, spyRaw, { remote: 'origin', number: 0, baseRef: 'main' })).error).toBeTruthy()
    expect((await pullRequestConflicts(spy, spyRaw, { remote: '--upload-pack=boom', number: 1, baseRef: 'main' })).error).toBeTruthy()
    expect((await pullRequestConflicts(spy, spyRaw, { remote: 'origin', number: 1, baseRef: '--exec=boom' })).error).toBeTruthy()
    expect(calls).toEqual([])
  })
})

describe('the same patch under another hash', () => {
  let dir = ''
  let run: GitRunner
  const git = (cmd: string) => execSync(`git -C ${dir} ${cmd}`, { encoding: 'utf8', env })

  beforeEach(() => {
    dir = `/tmp/gv-dup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    makeRepo(dir)
    fs.writeFileSync(`${dir}/f.txt`, 'base\n')
    git('add -A'); git('commit -qm base')
    ;({ run } = runnersFor(dir))
  })

  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* gone */ } })

  test("a base rebase-merged into the target leaves the stacked branch's copy, and it is found", async () => {
    // The base branch, and the work stacked on top of it.
    git('checkout -q -b base-work')
    fs.appendFileSync(`${dir}/f.txt`, 'the base work\n')
    git('commit -qam "the base work"')
    const original = git('rev-parse --short=7 HEAD').trim()
    git('checkout -q -b stacked')
    fs.appendFileSync(`${dir}/f.txt`, 'the stacked work\n')
    git('commit -qam "the stacked work"')

    // The forge merges the base with REBASE: a copy lands on main. The target
    // has to have moved first, or the replay of a commit onto its own parent
    // reproduces it byte for byte — which is a copy nobody could tell apart,
    // and not the case this is about.
    git('checkout -q main')
    fs.writeFileSync(`${dir}/elsewhere.txt`, 'main moved on\n')
    git('add -A'); git('commit -qm "main moves on"')
    git(`cherry-pick ${original}`)
    const copy = git('rev-parse --short=7 HEAD').trim()
    expect(copy).not.toBe(original)

    const r = await duplicateCommits(run, 'stacked', 'main')
    expect(r.error).toBeUndefined()
    expect(r.total).toBe(2)
    expect(r.duplicates).toHaveLength(1)
    expect(r.duplicates[0]).toMatchObject({ shortHash: original, subject: 'the base work' })
  })

  test('a branch whose work is all its own reports none', async () => {
    git('checkout -q -b mine')
    fs.appendFileSync(`${dir}/f.txt`, 'only mine\n')
    git('commit -qam "only mine"')
    const r = await duplicateCommits(run, 'mine', 'main')
    expect(r).toEqual({ duplicates: [], total: 1 })
  })

  test('a branch with nothing of its own reports none, and no total', async () => {
    git('checkout -q -b idle')
    expect(await duplicateCommits(run, 'idle', 'main')).toEqual({ duplicates: [], total: 0 })
  })

  test('a ref that is an option is refused before git runs', async () => {
    const calls: string[][] = []
    const spy: GitRunner = async args => { calls.push(args); return '' }
    expect((await duplicateCommits(spy, '--exec=boom', 'main')).error).toBeTruthy()
    expect((await duplicateCommits(spy, 'mine', '--exec=boom')).error).toBeTruthy()
    expect(calls).toEqual([])
  })
})
