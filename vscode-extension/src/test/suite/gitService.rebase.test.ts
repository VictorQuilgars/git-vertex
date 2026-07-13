import * as assert from 'assert'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execSync } from 'child_process'
import { GitService } from '../../gitService'

// End-to-end rebase-state coverage on a real repo: a feature branch rebased
// onto a conflicting main, driven exactly like the rebase tab drives it.
suite('gitService rebase state', () => {
  let tmpDir: string
  let svc: GitService

  const git = (cmd: string): string =>
    execSync(`git ${cmd}`, {
      cwd: tmpDir, encoding: 'utf8',
      env: { ...process.env, GIT_SEQUENCE_EDITOR: ':', GIT_EDITOR: 'true' },
    })

  setup(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gv-rebase-test-')))
    execSync('git init -b main', { cwd: tmpDir })
    git('config user.email "test@example.com"')
    git('config user.name "Test"')
    fs.writeFileSync(path.join(tmpDir, 'f.txt'), 'base\n')
    git('add .')
    git('commit -m "base"')
    git('checkout -b feature')
    fs.writeFileSync(path.join(tmpDir, 'f.txt'), 'feat1\n')
    git('commit -am "feat: change one"')
    fs.writeFileSync(path.join(tmpDir, 'f.txt'), 'feat1\nfeat2\n')
    git('commit -am "feat: change two"')
    git('checkout main')
    fs.writeFileSync(path.join(tmpDir, 'f.txt'), 'main-change\n')
    git('commit -am "main: conflicting change"')
    git('checkout feature')
    svc = new GitService(tmpDir)
  })

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  const startConflictedRebase = (): void => {
    try { git('rebase -i main') } catch { /* stops on the expected conflict */ }
  }

  test('getRebaseState reports not-in-progress on a quiet repo', async () => {
    const s = await svc.getRebaseState()
    assert.strictEqual(s.inProgress, false)
    assert.strictEqual(s.conflicts.length, 0)
  })

  test('getRebaseState parses a conflicted interactive rebase', async () => {
    startConflictedRebase()
    const s = await svc.getRebaseState()
    assert.strictEqual(s.inProgress, true)
    assert.strictEqual(s.interactive, true)
    assert.strictEqual(s.headName, 'feature')
    assert.ok(s.ontoHash.length >= 7)
    assert.strictEqual(s.stepCurrent, 1)
    assert.strictEqual(s.stepTotal, 2)
    assert.strictEqual(s.done.length, 1)
    assert.strictEqual(s.done[0].action, 'pick')
    // Subject must be clean even when git writes it as "pick <sha> # <subject>"
    assert.strictEqual(s.done[0].subject, 'feat: change one')
    assert.strictEqual(s.todo.length, 1)
    assert.strictEqual(s.todo[0].subject, 'feat: change two')
    assert.deepStrictEqual(s.conflicts, ['f.txt'])
  })

  test('continueRebase resumes after resolving, skipRebase finishes it', async () => {
    startConflictedRebase()
    fs.writeFileSync(path.join(tmpDir, 'f.txt'), 'resolved\n')
    git('add f.txt')
    const cont = await svc.continueRebase()
    // Second commit re-conflicts on this history — the rebase must stay paused.
    assert.strictEqual(cont.success, false)
    assert.strictEqual((cont as { conflict?: boolean }).conflict, true)
    const mid = await svc.getRebaseState()
    assert.strictEqual(mid.inProgress, true)
    assert.strictEqual(mid.stepCurrent, 2)

    const skip = await svc.skipRebase()
    assert.strictEqual(skip.success, true)
    const end = await svc.getRebaseState()
    assert.strictEqual(end.inProgress, false)
    // Working tree must be clean after the rebase completes.
    assert.strictEqual(git('status --porcelain').trim(), '')
  })

  test('abortRebase restores the original branch state', async () => {
    const before = git('rev-parse HEAD').trim()
    startConflictedRebase()
    const abort = await svc.abortRebase()
    assert.strictEqual(abort.success, true)
    assert.strictEqual(git('rev-parse HEAD').trim(), before)
    const s = await svc.getRebaseState()
    assert.strictEqual(s.inProgress, false)
  })
})
