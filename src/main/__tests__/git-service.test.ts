import { GitService } from '../git-service'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

describe('GitService', () => {
  let tempDir: string
  let git: GitService

  /**
   * Setup : créer un repo git vide avec config
   */
  beforeEach(() => {
    tempDir = `/tmp/git-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    fs.mkdirSync(tempDir, { recursive: true })
    execSync(`cd ${tempDir} && git init`)
    execSync(`cd ${tempDir} && git config user.email "test@test.com"`)
    execSync(`cd ${tempDir} && git config user.name "Test User"`)
    git = new GitService(tempDir)
  })

  afterEach(() => {
    try {
      execSync(`rm -rf ${tempDir}`)
    } catch {
      // ignore
    }
  })

  // ─────────────────────────────────────────────────────────────────────
  // Basic operations
  // ─────────────────────────────────────────────────────────────────────

  describe('checkRepo', () => {
    test('should succeed for a valid git repo', async () => {
      await expect(git.checkRepo()).resolves.not.toThrow()
    })

    test('should throw for non-git directory', async () => {
      const invalidDir = `/tmp/not-a-repo-${Date.now()}`
      fs.mkdirSync(invalidDir, { recursive: true })
      const invalidGit = new GitService(invalidDir)
      await expect(invalidGit.checkRepo()).rejects.toThrow()
      fs.rmSync(invalidDir, { recursive: true })
    })
  })

  describe('commit operations', () => {
    test('commit should create a new commit', async () => {
      fs.writeFileSync(path.join(tempDir, 'file.txt'), 'initial content')
      execSync(`cd ${tempDir} && git add file.txt`)

      const result = await git.commit('Initial commit')
      expect(result.success).toBe(true)

      const log = await git.getLog()
      expect(log.commits.length).toBe(1)
      expect(log.commits[0].message).toBe('Initial commit')
      expect(log.commits[0].author).toBe('Test User')
    })

    test('amendMessage should modify the last commit message', async () => {
      fs.writeFileSync(path.join(tempDir, 'file.txt'), 'content')
      execSync(`cd ${tempDir} && git add file.txt && git commit -m "Old message"`)

      const result = await git.amendMessage('New message')
      expect(result.success).toBe(true)

      const log = await git.getLog()
      expect(log.commits[0].message).toBe('New message')
    })

    test('commit should fail with no staged changes', async () => {
      const result = await git.commit('Empty commit')
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('stage/unstage operations', () => {
    test('stage should add files to staging area', async () => {
      fs.writeFileSync(path.join(tempDir, 'file1.txt'), 'content1')
      fs.writeFileSync(path.join(tempDir, 'file2.txt'), 'content2')

      let result = await git.stage(['file1.txt'])
      expect(result.success).toBe(true)

      let status = await git.getStatus()
      expect(status.staged).toContain('file1.txt')
      expect(status.unstaged).not.toContain('file1.txt')
    })

    test('stageAll should stage all changes', async () => {
      fs.writeFileSync(path.join(tempDir, 'a.txt'), 'a')
      fs.writeFileSync(path.join(tempDir, 'b.txt'), 'b')

      const result = await git.stageAll()
      expect(result.success).toBe(true)

      const status = await git.getStatus()
      expect(status.staged.length).toBe(2)
    })

    test('unstage should remove files from staging', async () => {
      fs.writeFileSync(path.join(tempDir, 'file.txt'), 'content')
      execSync(`cd ${tempDir} && git add file.txt`)

      const result = await git.unstage(['file.txt'])
      expect(result.success).toBe(true)

      const status = await git.getStatus()
      expect(status.staged.length).toBe(0)
      expect(status.untracked).toContain('file.txt')
    })
  })

  // ─────────────────────────────────────────────────────────────────────
  // Branch operations
  // ─────────────────────────────────────────────────────────────────────

  describe('branch operations', () => {
    beforeEach(async () => {
      // Create initial commit
      fs.writeFileSync(path.join(tempDir, 'file.txt'), 'content')
      execSync(`cd ${tempDir} && git add file.txt && git commit -m "Initial"`)
    })

    test('createBranch should create a new branch', async () => {
      const result = await git.createBranch('feature/test')
      expect(result.success).toBe(true)

      const branches = await git.getBranches()
      const branch = branches.branches.find(b => b.name === 'feature/test')
      expect(branch).toBeDefined()
    })

    test('createBranchAt should create branch at specific commit', async () => {
      // Create 2 commits
      fs.writeFileSync(path.join(tempDir, 'file.txt'), 'modified')
      execSync(`cd ${tempDir} && git add . && git commit -m "Second commit"`)

      const log = await git.getLog()
      const oldCommitHash = log.commits[1].hash

      const result = await git.createBranchAt('old-branch', oldCommitHash, false)
      expect(result.success).toBe(true)

      // Verify branch points to old commit
      const branches = await git.getBranches()
      const oldBranch = branches.branches.find(b => b.name === 'old-branch')
      expect(oldBranch?.commit).toContain(oldCommitHash.slice(0, 7))
    })

    test('checkout should switch branches', async () => {
      await git.createBranch('feature')
      const result = await git.checkout('feature')
      expect(result.success).toBe(true)

      const branches = await git.getBranches()
      const current = branches.branches.find(b => b.current)
      expect(current?.name).toBe('feature')
    })

    test('renameBranch should rename a branch', async () => {
      await git.createBranch('old-name')
      const result = await git.renameBranch('old-name', 'new-name')
      expect(result.success).toBe(true)

      const branches = await git.getBranches()
      expect(branches.branches.some(b => b.name === 'new-name')).toBe(true)
      expect(branches.branches.some(b => b.name === 'old-name')).toBe(false)
    })

    test('deleteBranch should remove a branch', async () => {
      await git.createBranch('temp-branch')
      // createBranch also checks out the branch — git refuses to delete the
      // current branch, so switch back to the default branch first
      await git.checkout('main')
      const result = await git.deleteBranch('temp-branch')
      expect(result.success).toBe(true)

      const branches = await git.getBranches()
      expect(branches.branches.some(b => b.name === 'temp-branch')).toBe(false)
    })
  })

  // ─────────────────────────────────────────────────────────────────────
  // Commit manipulation (rebase, cherry-pick, drop, move)
  // ─────────────────────────────────────────────────────────────────────

  describe('commit manipulation', () => {
    beforeEach(async () => {
      // Create 3 commits on main
      fs.writeFileSync(path.join(tempDir, 'a.txt'), 'a')
      execSync(`cd ${tempDir} && git add . && git commit -m "Commit A"`)

      fs.writeFileSync(path.join(tempDir, 'b.txt'), 'b')
      execSync(`cd ${tempDir} && git add . && git commit -m "Commit B"`)

      fs.writeFileSync(path.join(tempDir, 'c.txt'), 'c')
      execSync(`cd ${tempDir} && git add . && git commit -m "Commit C"`)
    })

    test('cherry-pick should apply commit to current branch', async () => {
      const logBefore = await git.getLog()
      const hashA = logBefore.commits[2].hash // Oldest (Commit A) — the root
      const hashC = logBefore.commits[0].hash // Latest (Commit C)

      // Branch off Commit A (has no parent, so branch directly from it), then
      // cherry-pick Commit C onto it
      execSync(`cd ${tempDir} && git checkout -b feature ${hashA}`)

      const result = await git.cherryPick(hashC)
      expect(result.success).toBe(true)

      const logAfter = await git.getLog()
      expect(logAfter.commits[0].message).toContain('Commit C')
    })

    test('reset soft should keep changes staged', async () => {
      const logBefore = await git.getLog()
      const hashToReset = logBefore.commits[1].hash // Reset to commit B

      const result = await git.reset(hashToReset, 'soft')
      expect(result.success).toBe(true)

      const status = await git.getStatus()
      // Changes from C should be staged
      expect(status.staged.length).toBeGreaterThan(0)
    })

    test('reset mixed should leave changes in working tree (untracked)', async () => {
      const logBefore = await git.getLog()
      const hashToReset = logBefore.commits[1].hash // reset to Commit B

      const result = await git.reset(hashToReset, 'mixed')
      expect(result.success).toBe(true)

      // c.txt was introduced in Commit C; after reset to B it no longer exists
      // in the index, so it reappears as an untracked file (not "modified")
      const status = await git.getStatus()
      expect(status.untracked).toContain('c.txt')
    })

    test('reset hard should discard all changes', async () => {
      const logBefore = await git.getLog()
      const hashToReset = logBefore.commits[1].hash

      const result = await git.reset(hashToReset, 'hard')
      expect(result.success).toBe(true)

      const logAfter = await git.getLog()
      expect(logAfter.commits.length).toBe(2)
    })

    test('dropCommit should remove a commit from history', async () => {
      const logBefore = await git.getLog()
      const hashB = logBefore.commits[1].hash // Commit B

      const result = await git.dropCommit(hashB)
      expect(result.success).toBe(true)

      const logAfter = await git.getLog()
      expect(logAfter.commits.length).toBe(2)
      expect(logAfter.commits.some(c => c.message.includes('Commit B'))).toBe(false)
    })

    test('moveCommit up should reorder commits', async () => {
      const logBefore = await git.getLog()
      const hashB = logBefore.commits[1].hash // Move Commit B up
      const messageC = logBefore.commits[0].message

      const result = await git.moveCommit(hashB, 'up')
      expect(result.success).toBe(true)

      const logAfter = await git.getLog()
      // After moving B up, order should change
      expect(logAfter.commits[0].message).not.toBe(messageC)
    })
  })

  // ─────────────────────────────────────────────────────────────────────
  // Merge operations
  // ─────────────────────────────────────────────────────────────────────

  describe('merge operations', () => {
    test('merge without conflicts should succeed', async () => {
      // Main: create initial commit
      fs.writeFileSync(path.join(tempDir, 'file.txt'), 'main content')
      execSync(`cd ${tempDir} && git add . && git commit -m "Main commit"`)

      // Feature: create different file
      execSync(`cd ${tempDir} && git checkout -b feature`)
      fs.writeFileSync(path.join(tempDir, 'feature.txt'), 'feature content')
      execSync(`cd ${tempDir} && git add . && git commit -m "Feature commit"`)

      // Merge back to main
      execSync(`cd ${tempDir} && git checkout main`)
      const result = await git.merge('feature')
      expect(result.success).toBe(true)

      const log = await git.getLog()
      expect(log.commits.length).toBe(2)
    })

    test('merge with conflicts should return error', async () => {
      // Common ancestor
      fs.writeFileSync(path.join(tempDir, 'shared.txt'), 'base version')
      execSync(`cd ${tempDir} && git add . && git commit -m "Base"`)

      // Feature: modify shared.txt
      execSync(`cd ${tempDir} && git checkout -b feature`)
      fs.writeFileSync(path.join(tempDir, 'shared.txt'), 'feature version')
      execSync(`cd ${tempDir} && git add . && git commit -m "Feature version"`)

      // main: modify the SAME file differently so the branches truly diverge
      execSync(`cd ${tempDir} && git checkout main`)
      fs.writeFileSync(path.join(tempDir, 'shared.txt'), 'main version')
      execSync(`cd ${tempDir} && git add . && git commit -m "Main version"`)

      // Merge: must conflict (both sides changed shared.txt from a common base)
      const result = await git.merge('feature')
      expect(result.success).toBe(false)
    })
  })

  // ─────────────────────────────────────────────────────────────────────
  // Rebase operations
  // ─────────────────────────────────────────────────────────────────────

  describe('rebase operations', () => {
    test('rebaseOnto should rebase current branch', async () => {
      // Main: 2 commits
      fs.writeFileSync(path.join(tempDir, 'main1.txt'), 'main1')
      execSync(`cd ${tempDir} && git add . && git commit -m "Main 1"`)

      fs.writeFileSync(path.join(tempDir, 'main2.txt'), 'main2')
      execSync(`cd ${tempDir} && git add . && git commit -m "Main 2"`)

      // Feature: branch from first commit, add 1 commit
      execSync(`cd ${tempDir} && git checkout -b feature HEAD~1`)
      fs.writeFileSync(path.join(tempDir, 'feature.txt'), 'feature')
      execSync(`cd ${tempDir} && git add . && git commit -m "Feature commit"`)

      // Rebase feature onto main
      const result = await git.rebaseOnto('main')
      expect(result.success).toBe(true)

      const log = await git.getLog()
      expect(log.commits.length).toBe(3)
    })
  })

  // ─────────────────────────────────────────────────────────────────────
  // Other operations
  // ─────────────────────────────────────────────────────────────────────

  describe('other operations', () => {
    test('revert should create inverse commit', async () => {
      fs.writeFileSync(path.join(tempDir, 'file.txt'), 'content')
      execSync(`cd ${tempDir} && git add . && git commit -m "Add file"`)

      const logBefore = await git.getLog()
      const hashToRevert = logBefore.commits[0].hash

      const result = await git.revert(hashToRevert)
      expect(result.success).toBe(true)

      const logAfter = await git.getLog()
      expect(logAfter.commits.length).toBe(2)
      expect(logAfter.commits[0].message).toContain('Revert')
    })

    test('getLog should return commits in order', async () => {
      fs.writeFileSync(path.join(tempDir, 'a.txt'), 'a')
      execSync(`cd ${tempDir} && git add . && git commit -m "A"`)

      fs.writeFileSync(path.join(tempDir, 'b.txt'), 'b')
      execSync(`cd ${tempDir} && git add . && git commit -m "B"`)

      const log = await git.getLog()
      expect(log.commits.length).toBe(2)
      expect(log.commits[0].message).toBe('B') // Latest first
      expect(log.commits[1].message).toBe('A')
    })

    test('getDiff should return diff for commit', async () => {
      fs.writeFileSync(path.join(tempDir, 'file.txt'), 'line1\nline2\nline3')
      execSync(`cd ${tempDir} && git add . && git commit -m "Initial"`)

      const log = await git.getLog()
      const hash = log.commits[0].hash

      const diff = await git.getDiff(hash)
      expect(diff.diff).toContain('line1')
    })

    test('getCommitFiles should list changed files', async () => {
      fs.writeFileSync(path.join(tempDir, 'a.txt'), 'a')
      fs.writeFileSync(path.join(tempDir, 'b.txt'), 'b')
      execSync(`cd ${tempDir} && git add . && git commit -m "Two files"`)

      const log = await git.getLog()
      const hash = log.commits[0].hash

      const files = await git.getCommitFiles(hash)
      expect(files.files.length).toBe(2)
      expect(files.files.some(f => f.path.includes('a.txt'))).toBe(true)
    })
  })

  // ─────────────────────────────────────────────────────────────────────
  // Hardening — safety guards & conflict handling
  // ─────────────────────────────────────────────────────────────────────

  describe('safety guards', () => {
    beforeEach(() => {
      fs.writeFileSync(path.join(tempDir, 'file.txt'), 'content')
      execSync(`cd ${tempDir} && git add . && git commit -m "Initial"`)
    })

    test('reset rejects an empty ref instead of running', async () => {
      const result = await git.reset('', 'hard')
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/empty/i)
    })

    test('cherryPick rejects a leading-dash ref (option injection)', async () => {
      const result = await git.cherryPick('--hard')
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/invalid/i)
    })

    test('checkout rejects an empty ref', async () => {
      const result = await git.checkout('')
      expect(result.success).toBe(false)
    })

    test('moveBranchTo refuses to hard-reset current branch with uncommitted changes', async () => {
      // Second commit so we have somewhere to move back to
      fs.writeFileSync(path.join(tempDir, 'file.txt'), 'v2')
      execSync(`cd ${tempDir} && git add . && git commit -m "Second"`)

      const log = await git.getLog()
      const olderHash = log.commits[1].hash

      // Introduce uncommitted work
      fs.writeFileSync(path.join(tempDir, 'file.txt'), 'uncommitted work')

      const result = await git.moveBranchTo('main', olderHash)
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/uncommitted/i)

      // The uncommitted work must NOT have been destroyed
      const content = fs.readFileSync(path.join(tempDir, 'file.txt'), 'utf8')
      expect(content).toBe('uncommitted work')
    })

    test('moveBranchTo allows clean current-branch move', async () => {
      fs.writeFileSync(path.join(tempDir, 'file.txt'), 'v2')
      execSync(`cd ${tempDir} && git add . && git commit -m "Second"`)
      const log = await git.getLog()
      const olderHash = log.commits[1].hash

      const result = await git.moveBranchTo('main', olderHash)
      expect(result.success).toBe(true)

      const logAfter = await git.getLog()
      expect(logAfter.commits.length).toBe(1)
    })
  })

  describe('conflict handling', () => {
    // Build two branches that both modify shared.txt from a common ancestor
    function setupDivergingConflict(): void {
      fs.writeFileSync(path.join(tempDir, 'shared.txt'), 'base')
      execSync(`cd ${tempDir} && git add . && git commit -m "Base"`)

      execSync(`cd ${tempDir} && git checkout -b feature`)
      fs.writeFileSync(path.join(tempDir, 'shared.txt'), 'feature change')
      execSync(`cd ${tempDir} && git add . && git commit -m "Feature"`)

      execSync(`cd ${tempDir} && git checkout main`)
      fs.writeFileSync(path.join(tempDir, 'shared.txt'), 'main change')
      execSync(`cd ${tempDir} && git add . && git commit -m "Main"`)
    }

    test('cherryPick reports failure on conflict (no false success)', async () => {
      setupDivergingConflict()
      const featureTip = execSync(`cd ${tempDir} && git rev-parse feature`).toString().trim()

      const result = await git.cherryPick(featureTip)
      expect(result.success).toBe(false)
    })

    test('mergeCommitInto reports failure on conflict (no false success)', async () => {
      setupDivergingConflict()
      const featureTip = execSync(`cd ${tempDir} && git rev-parse feature`).toString().trim()

      const result = await git.mergeCommitInto('main', featureTip)
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/conflict/i)
    })

    test('rebaseOnto aborts on conflict and leaves the branch unchanged', async () => {
      setupDivergingConflict()
      // currently on main; rebase main onto feature → conflict
      const mainTipBefore = execSync(`cd ${tempDir} && git rev-parse main`).toString().trim()

      const result = await git.rebaseOnto('feature')
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/aborted/i)

      // No rebase should be in progress, and main must be exactly where it was
      const mainTipAfter = execSync(`cd ${tempDir} && git rev-parse main`).toString().trim()
      expect(mainTipAfter).toBe(mainTipBefore)

      // A plain git command must work (repo not stuck mid-rebase)
      const status = execSync(`cd ${tempDir} && git status --porcelain`).toString()
      expect(status.includes('UU')).toBe(false)
    })

    test('dropCommit aborts on conflict and leaves history unchanged', async () => {
      // a.txt edited across 3 commits so dropping the middle one conflicts
      fs.writeFileSync(path.join(tempDir, 'a.txt'), 'line1\n')
      execSync(`cd ${tempDir} && git add . && git commit -m "A"`)
      fs.writeFileSync(path.join(tempDir, 'a.txt'), 'line1\nline2\n')
      execSync(`cd ${tempDir} && git add . && git commit -m "B"`)
      fs.writeFileSync(path.join(tempDir, 'a.txt'), 'line1\nline2 changed\n')
      execSync(`cd ${tempDir} && git add . && git commit -m "C"`)

      const headBefore = execSync(`cd ${tempDir} && git rev-parse HEAD`).toString().trim()
      const log = await git.getLog()
      const hashB = log.commits[1].hash // the middle commit

      const result = await git.dropCommit(hashB)

      // Whether it conflicts or not, the repo must never be left mid-rebase
      const status = execSync(`cd ${tempDir} && git status --porcelain`).toString()
      expect(status.includes('UU')).toBe(false)

      if (!result.success) {
        // On conflict it must have aborted, restoring the original HEAD
        const headAfter = execSync(`cd ${tempDir} && git rev-parse HEAD`).toString().trim()
        expect(headAfter).toBe(headBefore)
      }
    })
  })
})
