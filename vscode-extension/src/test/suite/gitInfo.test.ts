import * as assert from 'assert'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execSync } from 'child_process'
import { getGitInfo, getRepoRootForFile } from '../../gitInfo'

suite('gitInfo', () => {
  let tmpDir: string

  // Create a real git repo for each test
  setup(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gv-git-test-')))
    execSync('git init', { cwd: tmpDir })
    execSync('git config user.email "test@example.com"', { cwd: tmpDir })
    execSync('git config user.name "Test"', { cwd: tmpDir })
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'hello')
    execSync('git add .', { cwd: tmpDir })
    execSync('git commit -m "init"', { cwd: tmpDir })
  })

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('getGitInfo returns branch name for a valid repo', () => {
    const info = getGitInfo(tmpDir)
    assert.ok(info, 'Expected GitInfo, got null')
    assert.ok(typeof info.branch === 'string' && info.branch.length > 0,
      `Expected branch string, got "${info.branch}"`)
    assert.strictEqual(info.repoRoot, tmpDir)
  })

  test('getGitInfo returns ahead=0 behind=0 when no upstream', () => {
    const info = getGitInfo(tmpDir)
    assert.ok(info)
    assert.strictEqual(info.ahead, 0)
    assert.strictEqual(info.behind, 0)
  })

  test('getGitInfo returns null for a non-git directory', () => {
    const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-nongit-'))
    const info = getGitInfo(nonGit)
    fs.rmdirSync(nonGit)
    assert.strictEqual(info, null)
  })

  test('getRepoRootForFile resolves root for a file inside repo', () => {
    const filePath = path.join(tmpDir, 'file.txt')
    const root = getRepoRootForFile(filePath)
    assert.strictEqual(root, tmpDir)
  })

  test('getRepoRootForFile resolves root for a subdirectory', () => {
    const subDir = path.join(tmpDir, 'sub')
    fs.mkdirSync(subDir)
    const root = getRepoRootForFile(subDir)
    assert.strictEqual(root, tmpDir)
  })

  test('getRepoRootForFile returns null outside a git repo', () => {
    const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-nongit2-'))
    const root = getRepoRootForFile(nonGit)
    fs.rmdirSync(nonGit)
    assert.strictEqual(root, null)
  })
})
