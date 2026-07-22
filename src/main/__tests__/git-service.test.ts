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
  // Conflict prediction (dry-run, never touches the working tree)
  // ─────────────────────────────────────────────────────────────────────

  describe('conflict prediction', () => {
    test('predictConflicts: clean merge predicts no files', async () => {
      fs.writeFileSync(path.join(tempDir, 'file.txt'), 'base')
      execSync(`cd ${tempDir} && git add . && git commit -m base`)
      execSync(`cd ${tempDir} && git checkout -b feature`)
      fs.writeFileSync(path.join(tempDir, 'other.txt'), 'x')
      execSync(`cd ${tempDir} && git add . && git commit -m feat`)
      execSync(`cd ${tempDir} && git checkout main`)
      const r = await git.predictConflicts('feature')
      expect(r.error).toBeUndefined()
      expect(r.files).toEqual([])
    })

    test('predictConflicts: conflicting merge lists the file', async () => {
      fs.writeFileSync(path.join(tempDir, 'shared.txt'), 'base')
      execSync(`cd ${tempDir} && git add . && git commit -m base`)
      execSync(`cd ${tempDir} && git checkout -b feature`)
      fs.writeFileSync(path.join(tempDir, 'shared.txt'), 'feature')
      execSync(`cd ${tempDir} && git add . && git commit -m feat`)
      execSync(`cd ${tempDir} && git checkout main`)
      fs.writeFileSync(path.join(tempDir, 'shared.txt'), 'main')
      execSync(`cd ${tempDir} && git add . && git commit -m mainedit`)
      const r = await git.predictConflicts('feature')
      expect(r.files).toContain('shared.txt')
    })

    test('predictRebaseConflicts: clean replay predicts no files', async () => {
      fs.writeFileSync(path.join(tempDir, 'file.txt'), 'base')
      execSync(`cd ${tempDir} && git add . && git commit -m base`)
      execSync(`cd ${tempDir} && git checkout -b topic`)
      fs.writeFileSync(path.join(tempDir, 'topic.txt'), 'x')
      execSync(`cd ${tempDir} && git add . && git commit -m t1`)
      execSync(`cd ${tempDir} && git checkout main`)
      fs.writeFileSync(path.join(tempDir, 'main.txt'), 'y')
      execSync(`cd ${tempDir} && git add . && git commit -m m1`)
      const r = await git.predictRebaseConflicts('main', 'topic')
      expect(r.error).toBeUndefined()
      expect(r.files).toEqual([])
    })

    // The decisive case: f.txt L2 is changed then reverted on topic, so the net
    // change is zero — a one-shot tip-merge sees NO conflict (false negative),
    // but the real per-commit replay conflicts on the first topic commit.
    test('predictRebaseConflicts catches a mid-replay conflict a tip-merge misses', async () => {
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'L1\nL2\nL3\n')
      execSync(`cd ${tempDir} && git add . && git commit -m base`)
      execSync(`cd ${tempDir} && git checkout -b topic`)
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'L1\nL2-topic\nL3\n')
      execSync(`cd ${tempDir} && git add . && git commit -m c1`)
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'L1\nL2\nL3\n')
      execSync(`cd ${tempDir} && git add . && git commit -m c2-revert`)
      execSync(`cd ${tempDir} && git checkout main`)
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'L1\nL2-main\nL3\n')
      execSync(`cd ${tempDir} && git add . && git commit -m mainedit`)

      // Tip-merge heuristic misses it (net topic change on L2 is zero).
      const heuristic = await git.predictConflicts('topic', 'main')
      expect(heuristic.files).toEqual([])
      // Accurate simulation catches it, and points at the offending commit.
      const sim = await git.predictRebaseConflicts('main', 'topic')
      expect(sim.files).toContain('f.txt')
      expect(sim.atCommit).toBeTruthy()
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

    test('rebaseOnto pauses on conflict so the user can resolve', async () => {
      setupDivergingConflict()
      // currently on main; rebase main onto feature → conflict
      const mainTipBefore = execSync(`cd ${tempDir} && git rev-parse main`).toString().trim()

      const result = await git.rebaseOnto('feature')
      expect(result.success).toBe(false)
      expect(result.conflict).toBe(true)

      // The rebase is left in progress with the conflict staged for resolution
      const status = execSync(`cd ${tempDir} && git status --porcelain`).toString()
      expect(status.includes('UU')).toBe(true)

      // Aborting must bring main back exactly where it was
      execSync(`cd ${tempDir} && git rebase --abort`)
      const mainTipAfter = execSync(`cd ${tempDir} && git rev-parse main`).toString().trim()
      expect(mainTipAfter).toBe(mainTipBefore)
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

  // ─────────────────────────────────────────────────────────────────────
  // Diff between two commits (feature)
  // ─────────────────────────────────────────────────────────────────────

  describe('diff between commits', () => {
    beforeEach(() => {
      fs.writeFileSync(path.join(tempDir, 'a.txt'), 'one\n')
      execSync(`cd ${tempDir} && git add . && git commit -m "A"`)
      fs.writeFileSync(path.join(tempDir, 'a.txt'), 'one\ntwo\n')
      fs.writeFileSync(path.join(tempDir, 'b.txt'), 'new file\n')
      execSync(`cd ${tempDir} && git add . && git commit -m "B"`)
    })

    test('diffBetweenCommits returns the diff between two commits', async () => {
      const log = await git.getLog()
      const older = log.commits[1].hash
      const newer = log.commits[0].hash
      const r = await git.diffBetweenCommits(older, newer)
      expect(r.error).toBeUndefined()
      expect(r.diff).toContain('two')
      expect(r.diff).toContain('b.txt')
    })

    test('diffBetweenCommits rejects an empty ref', async () => {
      const r = await git.diffBetweenCommits('', 'HEAD')
      expect(r.error).toMatch(/empty/i)
      expect(r.diff).toBe('')
    })

    test('filesBetweenCommits lists changed files with status', async () => {
      const log = await git.getLog()
      const older = log.commits[1].hash
      const newer = log.commits[0].hash
      const r = await git.filesBetweenCommits(older, newer)
      const paths = r.files.map(f => f.path)
      expect(paths).toContain('a.txt')
      expect(paths).toContain('b.txt')
      expect(r.files.find(f => f.path === 'b.txt')?.status).toBe('A')
    })
  })

  // ─────────────────────────────────────────────────────────────────────
  // Conflict resolution tool (feature fix)
  // ─────────────────────────────────────────────────────────────────────

  describe('conflict resolution', () => {
    function setupConflict(): void {
      fs.writeFileSync(path.join(tempDir, 'shared.txt'), 'base\n')
      execSync(`cd ${tempDir} && git add . && git commit -m "Base"`)
      execSync(`cd ${tempDir} && git checkout -b feature`)
      fs.writeFileSync(path.join(tempDir, 'shared.txt'), 'theirs\n')
      execSync(`cd ${tempDir} && git add . && git commit -m "Feature"`)
      execSync(`cd ${tempDir} && git checkout main`)
      fs.writeFileSync(path.join(tempDir, 'shared.txt'), 'ours\n')
      execSync(`cd ${tempDir} && git add . && git commit -m "Main"`)
      execSync(`cd ${tempDir} && git merge feature || true`)
    }

    test('resolveConflict writes chosen content and clears the conflict', async () => {
      setupConflict()
      expect((await git.getConflictedFiles()).files).toContain('shared.txt')

      const r = await git.resolveConflict('shared.txt', 'merged result\n')
      expect(r.success).toBe(true)

      const content = fs.readFileSync(path.join(tempDir, 'shared.txt'), 'utf8')
      expect(content).toBe('merged result\n')
      expect(content).not.toMatch(/<<<<<<<|=======|>>>>>>>/)
      expect((await git.getConflictedFiles()).files).not.toContain('shared.txt')
    })

    test('resolveConflictWithSide(ours) keeps our version', async () => {
      setupConflict()
      const r = await git.resolveConflictWithSide('shared.txt', 'ours')
      expect(r.success).toBe(true)
      expect(fs.readFileSync(path.join(tempDir, 'shared.txt'), 'utf8')).toBe('ours\n')
      expect((await git.getConflictedFiles()).files).not.toContain('shared.txt')
    })

    test('resolveConflictWithSide(theirs) keeps their version', async () => {
      setupConflict()
      const r = await git.resolveConflictWithSide('shared.txt', 'theirs')
      expect(r.success).toBe(true)
      expect(fs.readFileSync(path.join(tempDir, 'shared.txt'), 'utf8')).toBe('theirs\n')
    })

    test('resolveConflict rejects a path escaping the repo', async () => {
      setupConflict()
      const r = await git.resolveConflict('../escape.txt', 'x')
      expect(r.success).toBe(false)
      expect(r.error).toMatch(/escape|invalid|empty/i)
    })

    test('getConflictVersions returns base, ours, and theirs from git stages', async () => {
      setupConflict()
      const v = await git.getConflictVersions('shared.txt')
      expect(v.base).toContain('base')
      expect(v.ours).toContain('ours')
      expect(v.theirs).toContain('theirs')
    })

    test('getConflictedFiles lists all files with conflict markers', async () => {
      setupConflict()
      const r = await git.getConflictedFiles()
      expect(r.files).toContain('shared.txt')
      expect(r.files.length).toBeGreaterThanOrEqual(1)
    })

    test('getConflictMode detects merge-in-progress via MERGE_HEAD', async () => {
      setupConflict()
      const r = await git.getConflictMode()
      expect(r.mode).toBe('merge')
    })

    test('getConflictMode returns null when no operation in progress', async () => {
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'x')
      execSync(`cd ${tempDir} && git add . && git commit -m "init"`)
      const r = await git.getConflictMode()
      expect(r.mode).toBeNull()
    })

    test('abortMerge cancels the in-progress merge', async () => {
      setupConflict()
      expect((await git.getConflictMode()).mode).toBe('merge')
      const r = await git.abortMerge()
      expect(r.success).toBe(true)
      expect((await git.getConflictMode()).mode).toBeNull()
      // Working tree should be clean after abort
      const status = await git.getStatus()
      expect(status.staged.length + status.unstaged.length).toBe(0)
    })

    test('continueMerge commits after all conflicts are resolved', async () => {
      setupConflict()
      await git.resolveConflict('shared.txt', 'merged\n')
      const r = await git.continueMerge('Merge resolved')
      expect(r.success).toBe(true)
      expect((await git.getConflictMode()).mode).toBeNull()
      const log = await git.getLog()
      expect(log.commits[0].message).toContain('Merge resolved')
    })
  })

  // ─────────────────────────────────────────────────────────────────────
  // undoLastAction
  // ─────────────────────────────────────────────────────────────────────

  describe('undoLastAction', () => {
    test('undoes last commit via reset --soft, keeps changes staged', async () => {
      fs.writeFileSync(path.join(tempDir, 'a.txt'), 'hello')
      execSync(`cd ${tempDir} && git add . && git commit -m "First"`)
      fs.writeFileSync(path.join(tempDir, 'b.txt'), 'world')
      execSync(`cd ${tempDir} && git add . && git commit -m "Second"`)

      const r = await git.undoLastAction()
      expect(r.success).toBe(true)
      expect(r.action).toMatch(/second/i)

      // commit should be gone
      const log = await git.getLog()
      expect(log.commits[0].message).toBe('First')

      // b.txt should still be staged
      const status = await git.getStatus()
      expect(status.staged).toContain('b.txt')
    })

    test('fails gracefully on root commit with no parent', async () => {
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'x')
      execSync(`cd ${tempDir} && git add . && git commit -m "Root"`)

      const r = await git.undoLastAction()
      expect(r.success).toBe(false)
      expect(r.error).toBeTruthy()
    })

    test('uses ORIG_HEAD to undo a merge when ORIG_HEAD exists', async () => {
      // Setup: two branches, clean merge
      fs.writeFileSync(path.join(tempDir, 'main.txt'), 'main')
      execSync(`cd ${tempDir} && git add . && git commit -m "Init"`)
      execSync(`cd ${tempDir} && git checkout -b feat`)
      fs.writeFileSync(path.join(tempDir, 'feat.txt'), 'feat')
      execSync(`cd ${tempDir} && git add . && git commit -m "Feat"`)
      execSync(`cd ${tempDir} && git checkout main`)
      execSync(`cd ${tempDir} && git merge feat --no-ff -m "Merge feat"`)

      // ORIG_HEAD should exist after the merge
      const beforeLog = await git.getLog()
      expect(beforeLog.commits[0].message).toBe('Merge feat')

      const r = await git.undoLastAction()
      expect(r.success).toBe(true)

      const afterLog = await git.getLog()
      expect(afterLog.commits[0].message).toBe('Init')
    })
  })

  // ─────────────────────────────────────────────────────────────────────
  // redoLastAction
  // ─────────────────────────────────────────────────────────────────────

  describe('redoLastAction', () => {
    test('redo restores a commit undone via undoLastAction', async () => {
      fs.writeFileSync(path.join(tempDir, 'a.txt'), 'hello')
      execSync(`cd ${tempDir} && git add . && git commit -m "First"`)
      fs.writeFileSync(path.join(tempDir, 'b.txt'), 'world')
      execSync(`cd ${tempDir} && git add . && git commit -m "Second"`)

      await git.undoLastAction()
      expect((await git.getLog()).commits[0].message).toBe('First')

      const r = await git.redoLastAction()
      expect(r.success).toBe(true)

      // The "Second" commit is back at HEAD
      expect((await git.getLog()).commits[0].message).toBe('Second')
    })

    test('fails gracefully when there is nothing to redo', async () => {
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'x')
      execSync(`cd ${tempDir} && git add . && git commit -m "Root"`)

      const r = await git.redoLastAction()
      expect(r.success).toBe(false)
      expect(r.error).toBeTruthy()
    })

    test('making a new commit clears the redo stack', async () => {
      fs.writeFileSync(path.join(tempDir, 'a.txt'), 'hello')
      execSync(`cd ${tempDir} && git add . && git commit -m "First"`)
      fs.writeFileSync(path.join(tempDir, 'b.txt'), 'world')
      execSync(`cd ${tempDir} && git add . && git commit -m "Second"`)

      await git.undoLastAction()
      // A fresh commit invalidates the redo target
      fs.writeFileSync(path.join(tempDir, 'c.txt'), 'new')
      await git.stageAll()
      await git.commit('Third')

      const r = await git.redoLastAction()
      expect(r.success).toBe(false)
    })
  })

  // ─────────────────────────────────────────────────────────────────────
  // Stash operations
  // ─────────────────────────────────────────────────────────────────────

  describe('stash operations', () => {
    function makeCommit(msg: string) {
      fs.writeFileSync(path.join(tempDir, `${msg}.txt`), msg)
      execSync(`cd ${tempDir} && git add . && git commit -m "${msg}"`)
    }

    test('createStash saves unstaged changes and cleans the working tree', async () => {
      makeCommit('init')
      fs.writeFileSync(path.join(tempDir, 'dirty.txt'), 'unstaged change')
      execSync(`cd ${tempDir} && git add dirty.txt`)

      const r = await git.createStash('my stash')
      expect(r.success).toBe(true)

      const status = await git.getStatus()
      expect(status.staged.length + status.unstaged.length).toBe(0)
    })

    test('applyStash restores stashed changes without removing the stash', async () => {
      makeCommit('init')
      fs.writeFileSync(path.join(tempDir, 'dirty.txt'), 'stashed')
      execSync(`cd ${tempDir} && git add dirty.txt && git stash`)

      const r = await git.applyStash(0)
      expect(r.success).toBe(true)
      expect(fs.existsSync(path.join(tempDir, 'dirty.txt'))).toBe(true)

      // stash still exists after apply
      const stashes = await git.getStashes()
      expect(stashes.stashes.length).toBe(1)
    })

    test('popStash restores and removes the stash', async () => {
      makeCommit('init')
      fs.writeFileSync(path.join(tempDir, 'dirty.txt'), 'stashed')
      execSync(`cd ${tempDir} && git add dirty.txt && git stash`)

      const r = await git.popStash(0)
      expect(r.success).toBe(true)
      expect(fs.existsSync(path.join(tempDir, 'dirty.txt'))).toBe(true)

      const stashes = await git.getStashes()
      expect(stashes.stashes.length).toBe(0)
    })

    test('dropStash removes the stash without restoring', async () => {
      makeCommit('init')
      fs.writeFileSync(path.join(tempDir, 'dirty.txt'), 'stashed')
      execSync(`cd ${tempDir} && git add dirty.txt && git stash`)

      const r = await git.dropStash(0)
      expect(r.success).toBe(true)

      const stashes = await git.getStashes()
      expect(stashes.stashes.length).toBe(0)
      expect(fs.existsSync(path.join(tempDir, 'dirty.txt'))).toBe(false)
    })
  })

  // ─────────────────────────────────────────────────────────────────────
  // getMergeMessage
  // ─────────────────────────────────────────────────────────────────────

  describe('getMergeMessage', () => {
    function setupConflict() {
      fs.writeFileSync(path.join(tempDir, 'shared.txt'), 'base\n')
      execSync(`cd ${tempDir} && git add . && git commit -m "Base"`)
      execSync(`cd ${tempDir} && git checkout -b feature`)
      fs.writeFileSync(path.join(tempDir, 'shared.txt'), 'theirs\n')
      execSync(`cd ${tempDir} && git add . && git commit -m "Feature"`)
      execSync(`cd ${tempDir} && git checkout main`)
      fs.writeFileSync(path.join(tempDir, 'shared.txt'), 'ours\n')
      execSync(`cd ${tempDir} && git add . && git commit -m "Main"`)
      execSync(`cd ${tempDir} && git merge feature || true`)
    }

    test('returns the MERGE_MSG content when a merge is in progress', async () => {
      setupConflict()
      const r = await git.getMergeMessage()
      expect(r.message).toBeTruthy()
      expect(r.message.toLowerCase()).toContain('feature')
    })

    test('returns empty string when no merge in progress', async () => {
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'x')
      execSync(`cd ${tempDir} && git add . && git commit -m "init"`)
      const r = await git.getMergeMessage()
      expect(r.message).toBe('')
    })
  })

  // ─────────────────────────────────────────────────────────────────────
  // getFileContent
  // ─────────────────────────────────────────────────────────────────────

  describe('getFileContent', () => {
    test('returns the raw content of an existing file', async () => {
      fs.writeFileSync(path.join(tempDir, 'hello.txt'), 'hello world\n')
      execSync(`cd ${tempDir} && git add . && git commit -m "init"`)
      const r = await git.getFileContent('hello.txt')
      expect(r.error).toBeUndefined()
      expect(r.content).toBe('hello world\n')
    })

    test('returns error for a non-existent file', async () => {
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'x')
      execSync(`cd ${tempDir} && git add . && git commit -m "init"`)
      const r = await git.getFileContent('does-not-exist.txt')
      expect(r.error).toBeTruthy()
    })
  })

  // ─────────────────────────────────────────────────────────────────────
  // getFileAtCommit (full file view in CenterFileDiff)
  // ─────────────────────────────────────────────────────────────────────

  describe('getFileAtCommit', () => {
    test('returns the file content as it was at a given commit', async () => {
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'v1\n')
      execSync(`cd ${tempDir} && git add . && git commit -m "v1"`)
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'v2\n')
      execSync(`cd ${tempDir} && git add . && git commit -m "v2"`)

      const log = await git.getLog()
      const firstCommit = log.commits[1].hash

      const r = await git.getFileAtCommit(firstCommit, 'f.txt')
      expect(r.error).toBeUndefined()
      expect(r.content).toBe('v1\n')
    })

    test('rejects an empty / invalid ref', async () => {
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'x')
      execSync(`cd ${tempDir} && git add . && git commit -m "init"`)
      const r = await git.getFileAtCommit('', 'f.txt')
      expect(r.error).toBeTruthy()
      expect(r.content).toBe('')
    })

    test('returns an error for a file that did not exist at that commit', async () => {
      fs.writeFileSync(path.join(tempDir, 'a.txt'), 'a')
      execSync(`cd ${tempDir} && git add . && git commit -m "first"`)
      const log = await git.getLog()
      const r = await git.getFileAtCommit(log.commits[0].hash, 'never.txt')
      expect(r.error).toBeTruthy()
    })
  })

  // ─────────────────────────────────────────────────────────────────────
  // applyPatch (partial staging by hunk / line)
  // ─────────────────────────────────────────────────────────────────────

  describe('applyPatch', () => {
    test('stages a working-tree change via its diff patch', async () => {
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'one\ntwo\nthree\n')
      execSync(`cd ${tempDir} && git add . && git commit -m "init"`)

      // Modify the file but leave it unstaged
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'one\ntwo changed\nthree\n')

      const { diff } = await git.getWorkingFileDiff('f.txt', false)
      expect(diff).toContain('two changed')

      const r = await git.applyPatch(diff, false)
      expect(r.success).toBe(true)

      // The change must now be staged
      const status = await git.getStatus()
      expect(status.staged).toContain('f.txt')
    })

    test('unstages a staged change with the reverse flag', async () => {
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'one\ntwo\n')
      execSync(`cd ${tempDir} && git add . && git commit -m "init"`)

      // Stage a modification
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'one\ntwo\nthree\n')
      execSync(`cd ${tempDir} && git add f.txt`)

      const { diff } = await git.getWorkingFileDiff('f.txt', true)
      expect(diff).toContain('three')

      const r = await git.applyPatch(diff, true)
      expect(r.success).toBe(true)

      // No longer staged
      const status = await git.getStatus()
      expect(status.staged).not.toContain('f.txt')
    })

    test('returns an error for a malformed patch', async () => {
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'x')
      execSync(`cd ${tempDir} && git add . && git commit -m "init"`)
      const r = await git.applyPatch('this is not a valid patch\n', false)
      expect(r.success).toBe(false)
      expect(r.error).toBeTruthy()
    })
  })

  // ─────────────────────────────────────────────────────────────────────
  // getLog — signature field & ref filtering (solo/mute branches)
  // ─────────────────────────────────────────────────────────────────────

  describe('getLog signature & refs', () => {
    test('unsigned commits report signature "N"', async () => {
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'x')
      execSync(`cd ${tempDir} && git add . && git commit -m "init"`)
      const log = await git.getLog()
      expect(log.commits[0].signature).toBe('N')
    })

    test('refs option restricts the log to the given branch (solo)', async () => {
      // main: one commit
      fs.writeFileSync(path.join(tempDir, 'main.txt'), 'main')
      execSync(`cd ${tempDir} && git add . && git commit -m "Main commit"`)

      // feature: branch off with its own commit
      execSync(`cd ${tempDir} && git checkout -b feature`)
      fs.writeFileSync(path.join(tempDir, 'feat.txt'), 'feat')
      execSync(`cd ${tempDir} && git add . && git commit -m "Feature commit"`)

      execSync(`cd ${tempDir} && git checkout main`)

      // Solo main: feature-only commit must be absent
      const mainOnly = await git.getLog({ refs: ['main'] })
      const messages = mainOnly.commits.map(c => c.message)
      expect(messages).toContain('Main commit')
      expect(messages).not.toContain('Feature commit')

      // Explicit feature ref includes both (feature descends from main)
      const featLog = await git.getLog({ refs: ['feature'] })
      expect(featLog.commits.map(c => c.message)).toContain('Feature commit')
    })

    test('refs option with multiple branches unions their commits (mute = all but one)', async () => {
      fs.writeFileSync(path.join(tempDir, 'main.txt'), 'main')
      execSync(`cd ${tempDir} && git add . && git commit -m "Main commit"`)
      execSync(`cd ${tempDir} && git checkout -b a`)
      fs.writeFileSync(path.join(tempDir, 'a.txt'), 'a')
      execSync(`cd ${tempDir} && git add . && git commit -m "A commit"`)
      execSync(`cd ${tempDir} && git checkout main && git checkout -b b`)
      fs.writeFileSync(path.join(tempDir, 'b.txt'), 'b')
      execSync(`cd ${tempDir} && git add . && git commit -m "B commit"`)

      // Visible = main + a (branch b muted)
      const log = await git.getLog({ refs: ['main', 'a'] })
      const messages = log.commits.map(c => c.message)
      expect(messages).toContain('A commit')
      expect(messages).not.toContain('B commit')
    })
  })

  // ─────────────────────────────────────────────────────────────────────
  // commit — GPG sign parameter
  // ─────────────────────────────────────────────────────────────────────

  describe('commit signing', () => {
    test('commit succeeds without signing when sign=false', async () => {
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'x')
      execSync(`cd ${tempDir} && git add f.txt`)
      const r = await git.commit('Unsigned commit', false, false)
      expect(r.success).toBe(true)
      const log = await git.getLog()
      expect(log.commits[0].signature).toBe('N')
    })

    test('commit with sign=true surfaces an error when signing is impossible', async () => {
      // Force a non-existent GPG program so signing deterministically fails
      // regardless of any GPG key the host machine may have configured. -S must
      // then report an error rather than silently producing an unsigned commit.
      execSync(`cd ${tempDir} && git config gpg.program /nonexistent-gpg-binary`)
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'x')
      execSync(`cd ${tempDir} && git add f.txt`)
      const r = await git.commit('Signed commit', false, true)
      expect(r.success).toBe(false)
      expect(r.error).toBeTruthy()
    })
  })

  // ─────────────────────────────────────────────────────────────────────
  // Empty repository (no commit yet) — first-commit flow
  // ─────────────────────────────────────────────────────────────────────

  describe('empty repository', () => {
    test('getLog returns an empty list instead of throwing', async () => {
      const log = await git.getLog()
      expect(log.commits).toEqual([])
    })

    test('getLog with all=true returns an empty list', async () => {
      const log = await git.getLog({ all: true })
      expect(log.commits).toEqual([])
    })

    test('getBranches reports the unborn current branch', async () => {
      const r = await git.getBranches()
      const current = r.branches.find(b => b.current)
      expect(current).toBeDefined()
      expect(current!.name.length).toBeGreaterThan(0)
      expect(current!.remote).toBe(false)
    })

    test('first commit works and then appears in the log', async () => {
      fs.writeFileSync(path.join(tempDir, 'first.txt'), 'hello')
      execSync(`cd ${tempDir} && git add first.txt`)
      const r = await git.commit('First commit')
      expect(r.success).toBe(true)
      const log = await git.getLog()
      expect(log.commits.length).toBe(1)
      expect(log.commits[0].parents).toEqual([])
    })

    test('getWorkingChanges sees untracked files before the first commit', async () => {
      fs.writeFileSync(path.join(tempDir, 'new.txt'), 'x')
      const r = await git.getWorkingChanges()
      const all = [...r.untracked, ...r.unstaged.map(f => f.path), ...r.staged.map(f => f.path)]
      expect(all.some(p => p.includes('new.txt'))).toBe(true)
    })
  })

  // ─────────────────────────────────────────────────────────────────────
  // Regression coverage for handled edge cases (matrix fixes)
  // ─────────────────────────────────────────────────────────────────────

  describe('discardFile on untracked files', () => {
    test('removes an untracked file from the working tree', async () => {
      fs.writeFileSync(path.join(tempDir, 'base.txt'), 'x')
      execSync(`cd ${tempDir} && git add base.txt && git commit -m "base"`)
      fs.writeFileSync(path.join(tempDir, 'junk.txt'), 'temp')

      const r = await git.discardFile('junk.txt')
      expect(r.success).toBe(true)
      expect(fs.existsSync(path.join(tempDir, 'junk.txt'))).toBe(false)
    })

    test('still reverts a tracked file without deleting it', async () => {
      fs.writeFileSync(path.join(tempDir, 'tracked.txt'), 'original')
      execSync(`cd ${tempDir} && git add tracked.txt && git commit -m "base"`)
      fs.writeFileSync(path.join(tempDir, 'tracked.txt'), 'modified')

      const r = await git.discardFile('tracked.txt')
      expect(r.success).toBe(true)
      expect(fs.existsSync(path.join(tempDir, 'tracked.txt'))).toBe(true)
      expect(fs.readFileSync(path.join(tempDir, 'tracked.txt'), 'utf8')).toBe('original')
    })
  })

  describe('revert of a merge commit', () => {
    test('succeeds by using the first parent as mainline', async () => {
      fs.writeFileSync(path.join(tempDir, 'a.txt'), 'a')
      execSync(`cd ${tempDir} && git add a.txt && git commit -m "init"`)
      execSync(`cd ${tempDir} && git checkout -b side`)
      fs.writeFileSync(path.join(tempDir, 'b.txt'), 'b')
      execSync(`cd ${tempDir} && git add b.txt && git commit -m "side change"`)
      execSync(`cd ${tempDir} && git checkout main || git checkout master`)
      fs.writeFileSync(path.join(tempDir, 'c.txt'), 'c')
      execSync(`cd ${tempDir} && git add c.txt && git commit -m "main change"`)
      execSync(`cd ${tempDir} && git merge --no-ff side -m "Merge side"`)

      const mergeHash = (await git.getLog()).commits[0].hash
      const r = await git.revert(mergeHash)
      expect(r.success).toBe(true)
      // The merge brought in b.txt; reverting it (mainline = first parent) removes it.
      expect(fs.existsSync(path.join(tempDir, 'b.txt'))).toBe(false)
    })
  })

  describe('setUpstream remote fallback', () => {
    test('uses the only configured remote even when not named origin', async () => {
      fs.writeFileSync(path.join(tempDir, 'a.txt'), 'a')
      execSync(`cd ${tempDir} && git add a.txt && git commit -m "init"`)
      // Bare repo acting as a remote called "upstream" (not "origin").
      const remoteDir = `${tempDir}-remote.git`
      execSync(`git init --bare ${remoteDir}`)
      execSync(`cd ${tempDir} && git remote add upstream ${remoteDir}`)
      const branch = (await git.getTracking()).branch ?? 'main'
      execSync(`cd ${tempDir} && git push upstream ${branch}`)

      const r = await git.setUpstream(branch)
      expect(r.success).toBe(true)
      const tracking = await git.getTracking()
      expect(tracking.upstream).toBe(`upstream/${branch}`)
      execSync(`rm -rf ${remoteDir}`)
    })

    test('fails cleanly when no remote is configured', async () => {
      fs.writeFileSync(path.join(tempDir, 'a.txt'), 'a')
      execSync(`cd ${tempDir} && git add a.txt && git commit -m "init"`)
      const branch = (await git.getTracking()).branch ?? 'main'
      const r = await git.setUpstream(branch)
      expect(r.success).toBe(false)
    })
  })

  describe('stash apply conflict detection', () => {
    test('reports a conflict instead of a false success', async () => {
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'base\n')
      execSync(`cd ${tempDir} && git add f.txt && git commit -m "base"`)
      // Stash a change to f.txt, then make a conflicting committed change.
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'stashed change\n')
      await git.createStash('wip')
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'committed change\n')
      execSync(`cd ${tempDir} && git add f.txt && git commit -m "diverge"`)

      const r = await git.applyStash(0)
      expect(r.success).toBe(false)
      expect(r.error).toMatch(/conflict/i)
    })
  })

  describe('gitflow finish with conflict', () => {
    test('aborts the merge and reports rather than stranding the repo', async () => {
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'base\n')
      execSync(`cd ${tempDir} && git add f.txt && git commit -m "base"`)
      await git.gitflowInit()
      await git.gitflowStart('feature', 'x')
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'feature line\n')
      execSync(`cd ${tempDir} && git add f.txt && git commit -m "feature"`)
      // Make develop conflict with the feature on the same line.
      execSync(`cd ${tempDir} && git checkout develop`)
      fs.writeFileSync(path.join(tempDir, 'f.txt'), 'develop line\n')
      execSync(`cd ${tempDir} && git add f.txt && git commit -m "develop"`)

      const r = await git.gitflowFinish('feature', 'x')
      expect(r.success).toBe(false)
      // Repo must be clean (merge aborted), not left mid-merge.
      const mode = await git.getConflictMode()
      expect(mode.mode).toBe(null)
    })
  })

  describe('resolveConflictWithSide on a modify/delete conflict', () => {
    // Sets up a merge where fileB is modified on main (ours) and deleted on
    // feature (theirs) → `checkout --theirs` has no version to take.
    const setupModifyDelete = () => {
      fs.writeFileSync(path.join(tempDir, 'fileB.txt'), 'base\n')
      execSync(`cd ${tempDir} && git add . && git commit -m "base"`)
      execSync(`cd ${tempDir} && git checkout -b feature`)
      execSync(`cd ${tempDir} && git rm fileB.txt && git commit -m "delete fileB"`)
      execSync(`cd ${tempDir} && git checkout main 2>/dev/null || git checkout master`)
      fs.writeFileSync(path.join(tempDir, 'fileB.txt'), 'modified on main\n')
      execSync(`cd ${tempDir} && git add fileB.txt && git commit -m "modify fileB"`)
      try { execSync(`cd ${tempDir} && git merge feature`, { stdio: 'ignore' }) } catch { /* conflict */ }
    }

    test('taking the deleting side (theirs) removes the file and clears the conflict', async () => {
      setupModifyDelete()
      const r = await git.resolveConflictWithSide('fileB.txt', 'theirs')
      expect(r.success).toBe(true)
      expect(fs.existsSync(path.join(tempDir, 'fileB.txt'))).toBe(false)
      const conflicts = await git.getConflictedFiles()
      expect(conflicts.files).not.toContain('fileB.txt')
    })

    test('taking the modified side (ours) keeps the file and clears the conflict', async () => {
      setupModifyDelete()
      const r = await git.resolveConflictWithSide('fileB.txt', 'ours')
      expect(r.success).toBe(true)
      expect(fs.existsSync(path.join(tempDir, 'fileB.txt'))).toBe(true)
      const conflicts = await git.getConflictedFiles()
      expect(conflicts.files).not.toContain('fileB.txt')
    })
  })

})
