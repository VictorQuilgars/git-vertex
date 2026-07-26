import * as assert from 'assert'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execSync } from 'child_process'
import { GitService } from '../../gitService'

// The v1.22/v1.23 git operations, ported into the extension's own GitService.
// GitService imports no `vscode`, so this runs under plain mocha too:
//   npx mocha --ui tdd out/test/suite/gitService.parity.test.js

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
}

function run(cmd: string, cwd: string): string {
  return execSync(cmd, { cwd, env: GIT_ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
}

function tmpDir(prefix: string): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)))
}

// -b main so the tests don't depend on the machine's init.defaultBranch.
function initRepo(dir: string): void {
  run('git init -b main', dir)
  run('git config user.email "test@example.com"', dir)
  run('git config user.name "Test"', dir)
}

function commit(dir: string, file: string, content: string, message: string): void {
  fs.writeFileSync(path.join(dir, file), content)
  run('git add -A', dir)
  run(`git commit -m "${message}"`, dir)
}

suite('extension GitService — stash parity (v1.23.0)', () => {
  let dir: string
  let git: GitService

  setup(() => {
    dir = tmpDir('gv-parity-stash-')
    initRepo(dir)
    commit(dir, 'a.txt', 'a1\n', 'init')
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a2\n')
    run('git add a.txt', dir)
    fs.writeFileSync(path.join(dir, 'b.txt'), 'b1\n')       // untracked
    git = new GitService(dir)
  })

  teardown(() => fs.rmSync(dir, { recursive: true, force: true }))

  test('scope "staged" takes the index and leaves the rest alone', async () => {
    const res = await git.createStash('only staged', { scope: 'staged' })
    assert.strictEqual(res.success, true, res.error)
    // a.txt goes back to its committed content, b.txt is still sitting there.
    assert.strictEqual(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'a1\n')
    assert.ok(fs.existsSync(path.join(dir, 'b.txt')))
  })

  test('scope "unstaged" keeps the index staged', async () => {
    const res = await git.createStash('only unstaged', { scope: 'unstaged' })
    assert.strictEqual(res.success, true, res.error)
    const staged = run('git diff --cached --name-only', dir).trim()
    assert.strictEqual(staged, 'a.txt', 'the staged change should have survived')
  })

  test('a pathspec stashes only those files', async () => {
    // Commit c.txt first so it has a committed state to revert to, then set up
    // the real scenario: a.txt staged, c.txt modified, only c.txt stashed.
    fs.writeFileSync(path.join(dir, 'c.txt'), 'c1\n')
    run('git add c.txt', dir)
    run('git commit -m second', dir)          // also commits the staged a.txt
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a3\n')
    run('git add a.txt', dir)
    fs.writeFileSync(path.join(dir, 'c.txt'), 'c2\n')

    const res = await git.createStash('just c', { paths: ['c.txt'] })
    assert.strictEqual(res.success, true, res.error)
    assert.strictEqual(fs.readFileSync(path.join(dir, 'c.txt'), 'utf8'), 'c1\n')
    // a.txt is outside the pathspec: still staged, still modified on disk.
    assert.strictEqual(run('git diff --cached --name-only', dir).trim(), 'a.txt')
    assert.strictEqual(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'a3\n')
  })

  test('default scope still stashes everything, untracked included', async () => {
    const res = await git.createStash('all of it')
    assert.strictEqual(res.success, true, res.error)
    assert.strictEqual(fs.existsSync(path.join(dir, 'b.txt')), false)
    assert.strictEqual(run('git status --porcelain', dir).trim(), '')
  })

  test('renameStash relabels the entry and puts it back on top', async () => {
    await git.createStash('first stash')
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a3\n')
    await git.createStash('second stash')

    const res = await git.renameStash(1, 'renamed stash')
    assert.strictEqual(res.success, true, res.error)

    const { stashes } = await git.getStashes()
    assert.strictEqual(stashes.length, 2)
    // Re-storing pushes it back to index 0 — the prompt says so.
    assert.ok(stashes[0].message.includes('renamed stash'),
      `expected the new label on top, got "${stashes[0].message}"`)
    assert.ok(!stashes.some(s => s.message.includes('first stash')),
      'the old label should be gone')
  })

  test('renameStash reports a missing index instead of throwing', async () => {
    const res = await git.renameStash(7, 'nope')
    assert.strictEqual(res.success, false)
    assert.ok(res.error)
  })
})

suite('extension GitService — default remote (v1.23.0)', () => {
  let dir: string
  let git: GitService

  setup(() => {
    dir = tmpDir('gv-parity-remote-')
    initRepo(dir)
    commit(dir, 'a.txt', 'a\n', 'init')
    git = new GitService(dir)
  })

  teardown(() => fs.rmSync(dir, { recursive: true, force: true }))

  test('no remote configured → null', async () => {
    assert.deepStrictEqual(await git.getDefaultRemote(), { remote: null, explicit: false })
  })

  test('origin wins when nothing was chosen', async () => {
    run('git remote add upstream https://example.com/up.git', dir)
    run('git remote add origin https://example.com/o.git', dir)
    assert.deepStrictEqual(await git.getDefaultRemote(), { remote: 'origin', explicit: false })
  })

  test('the only remote wins when there is no origin', async () => {
    run('git remote add fork https://example.com/f.git', dir)
    assert.deepStrictEqual(await git.getDefaultRemote(), { remote: 'fork', explicit: false })
  })

  test('an explicit choice wins, and is stored in the repo config', async () => {
    run('git remote add origin https://example.com/o.git', dir)
    run('git remote add upstream https://example.com/up.git', dir)
    assert.strictEqual((await git.setDefaultRemote('upstream')).success, true)
    assert.deepStrictEqual(await git.getDefaultRemote(), { remote: 'upstream', explicit: true })
    assert.strictEqual(
      run('git config --local --get gitvertex.defaultRemote', dir).trim(), 'upstream')
  })

  test('a choice pointing at a removed remote is ignored', async () => {
    run('git remote add origin https://example.com/o.git', dir)
    run('git remote add upstream https://example.com/up.git', dir)
    await git.setDefaultRemote('upstream')
    run('git remote remove upstream', dir)
    assert.deepStrictEqual(await git.getDefaultRemote(), { remote: 'origin', explicit: false })
  })
})

suite('extension GitService — prune & pull strategy (v1.22/v1.23)', () => {
  let remote: string
  let work: string
  let other: string
  let git: GitService

  setup(() => {
    remote = tmpDir('gv-parity-bare-')
    run('git init --bare -b main', remote)

    work = tmpDir('gv-parity-work-')
    initRepo(work)
    commit(work, 'a.txt', 'a1\n', 'init')
    run(`git remote add origin "${remote}"`, work)
    run('git push -u origin main', work)

    other = tmpDir('gv-parity-other-')
    run(`git clone "${remote}" .`, other)
    run('git config user.email "test@example.com"', other)
    run('git config user.name "Test"', other)

    git = new GitService(work)
  })

  teardown(() => {
    for (const d of [remote, work, other]) fs.rmSync(d, { recursive: true, force: true })
  })

  test('pruneRemote reports the tracking refs it dropped', async () => {
    run('git branch doomed', work)
    run('git push origin doomed', work)
    run('git branch -D doomed', remote)          // gone on the server

    const res = await git.pruneRemote('origin')
    assert.strictEqual(res.success, true, res.error)
    assert.deepStrictEqual(res.pruned, ['origin/doomed'])
  })

  test('pruneRemote is locale-proof', async () => {
    // The old implementation parsed "[would prune]" out of --dry-run, which git
    // translates; under a French locale it found nothing and pruned nothing.
    run('git branch doomed', work)
    run('git push origin doomed', work)
    run('git branch -D doomed', remote)
    const res = await new GitService(work).pruneRemote('origin')
    assert.deepStrictEqual(res.pruned, ['origin/doomed'])
  })

  test('gone branches are listed, then deleted — except the current one', async () => {
    run('git checkout -b doomed', work)
    run('git push -u origin doomed', work)
    run('git branch -D doomed', remote)
    await git.pruneRemote('origin')

    // Still checked out on `doomed`: git would refuse to delete it.
    let gone = await git.getGoneBranches()
    assert.deepStrictEqual(gone.branches, ['doomed'])
    let res = await git.pruneGoneBranches(gone.branches)
    assert.deepStrictEqual(res.deleted, [], 'the checked-out branch must be skipped')

    run('git checkout main', work)
    gone = await git.getGoneBranches()
    assert.deepStrictEqual(gone.branches, ['doomed'])
    res = await git.pruneGoneBranches(gone.branches)
    assert.strictEqual(res.success, true, res.error)
    assert.deepStrictEqual(res.deleted, ['doomed'])
    assert.ok(!run('git branch', work).includes('doomed'))
  })

  test('getGoneBranches ignores branches whose upstream is alive', async () => {
    assert.deepStrictEqual((await git.getGoneBranches()).branches, [])
  })

  test('pull honours the strategy it is given', async () => {
    // Remote moves on…
    commit(other, 'b.txt', 'b1\n', 'remote work')
    run('git push origin main', other)
    // …and so does the local branch: the histories have diverged.
    commit(work, 'c.txt', 'c1\n', 'local work')

    const ffOnly = await git.pull('ff-only')
    assert.strictEqual(ffOnly.success, false,
      'ff-only must refuse a diverged history instead of merging it')

    const rebased = await git.pull('rebase')
    assert.strictEqual(rebased.success, true, rebased.error)
    // Rebase, not merge: linear history, local commit replayed on top.
    const log = run('git log --oneline --graph', work)
    assert.ok(!log.includes('|'), `expected a linear history, got:\n${log}`)
    assert.ok(run('git log -1 --pretty=%s', work).includes('local work'))
  })

  test('a fast-forward pull still works with the default mode', async () => {
    commit(other, 'b.txt', 'b1\n', 'remote work')
    run('git push origin main', other)
    const res = await git.pull()
    assert.strictEqual(res.success, true, res.error)
    assert.ok(fs.existsSync(path.join(work, 'b.txt')))
  })
})
