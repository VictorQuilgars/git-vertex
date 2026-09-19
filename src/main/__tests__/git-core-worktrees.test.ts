import { execSync } from 'child_process'
import * as fs from 'fs'
import {
  parseWorktrees, worktreeOfBranch, worktrees, copyChangesToWorktree, type GitRunner,
} from '../git-core'

// Where each worktree stands, and carrying work between them (#285). The
// parse was written out twice — once per service — and both threw away the
// lock it read; this is the one copy, and the facts it could not know.

describe('the list git prints', () => {
  const RAW = [
    'worktree /repo',
    'HEAD 1111111111111111111111111111111111111111',
    'branch refs/heads/main',
    '',
    'worktree /wt/review',
    'HEAD 2222222222222222222222222222222222222222',
    'branch refs/heads/feat/cards',
    'locked on a drive that comes and goes',
    '',
    'worktree /wt/detached',
    'HEAD 3333333333333333333333333333333333333333',
    'detached',
    '',
    'worktree /wt/gone',
    'HEAD 4444444444444444444444444444444444444444',
    'branch refs/heads/old',
    'prunable gitdir file points to non-existent location',
    '',
  ].join('\n')

  test('reads the path, the branch, the short head — and the first one is the main tree', () => {
    const rows = parseWorktrees(RAW)
    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({ path: '/repo', branch: 'main', head: '1111111', isMain: true })
    expect(rows[1]).toMatchObject({ path: '/wt/review', branch: 'feat/cards', isMain: false })
    expect(rows.slice(1).every(r => !r.isMain)).toBe(true)
  })

  test('the lock is read, with the reason git was given', () => {
    const rows = parseWorktrees(RAW)
    expect(rows[1]).toMatchObject({ locked: true, lockReason: 'on a drive that comes and goes' })
    expect(rows[0].locked).toBe(false)
    // `locked` with no reason is still locked, and says nothing more.
    const bare = parseWorktrees('worktree /x\nHEAD 1111111\nbranch refs/heads/b\nlocked\n')
    expect(bare[0]).toMatchObject({ locked: true })
    expect(bare[0].lockReason).toBeUndefined()
  })

  test('a detached worktree is named as one, and a gone one is prunable', () => {
    const rows = parseWorktrees(RAW)
    expect(rows[2].branch).toBe('(detached)')
    expect(rows[3].prunable).toBe(true)
  })

  test('nothing at all is no worktrees, not a half-read one', () => {
    expect(parseWorktrees('')).toEqual([])
    expect(parseWorktrees('HEAD 1111111\nbranch refs/heads/orphan\n')).toEqual([])
  })
})

test('which worktree holds a branch', () => {
  const rows = parseWorktrees('worktree /repo\nbranch refs/heads/main\n\nworktree /wt/x\nbranch refs/heads/feat/x\n')
  expect(worktreeOfBranch(rows, 'feat/x')?.path).toBe('/wt/x')
  expect(worktreeOfBranch(rows, 'refs/heads/feat/x')?.path).toBe('/wt/x')
  expect(worktreeOfBranch(rows, 'nothing')).toBeNull()
})

describe('on a real repository', () => {
  let dir = ''
  let wt = ''
  let run: GitRunner
  const git = (cmd: string, at = dir) => execSync(`git -C ${at} ${cmd}`, { encoding: 'utf8' })

  beforeEach(() => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    dir = `/tmp/gv-wt-${stamp}`
    wt = `/tmp/gv-wt-${stamp}-second`
    fs.mkdirSync(dir, { recursive: true })
    execSync(`git init -q -b main ${dir}`)
    git('config user.email test@test.com')
    git('config user.name "Test User"')
    fs.writeFileSync(`${dir}/file.txt`, 'one\n')
    git('add -A')
    git('commit -q -m base')
    git(`worktree add -q -b second ${wt}`)
    run = async (args: string[]) => execSync(
      `git -C ${dir} ${args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`,
      { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } })
  })

  afterEach(() => {
    for (const p of [dir, wt]) { try { fs.rmSync(p, { recursive: true, force: true }) } catch { /* gone */ } }
  })

  test('the plain list says nothing about dirt; asking for the facts does', async () => {
    fs.appendFileSync(`${wt}/file.txt`, 'work\n')
    const plain = (await worktrees(run)).worktrees
    // macOS resolves /tmp through /private, and git prints what it resolved.
    expect(plain.map(w => w.path.replace('/private', ''))).toEqual([dir, wt])
    expect(plain[1].dirty).toBeUndefined()
    const facts = (await worktrees(run, { facts: true })).worktrees
    expect(facts[0].dirty).toBe(false)
    expect(facts[1].dirty).toBe(true)
    // It tracks nothing, so there are no counts — which is not the same as 0.
    expect(facts[1].ahead).toBeUndefined()
  })

  test('carrying work into another worktree leaves the stash behind either way', async () => {
    fs.appendFileSync(`${dir}/file.txt`, 'carried\n')
    const r = await copyChangesToWorktree(run, dir, wt, 'to the second')
    expect(r).toMatchObject({ success: true, leftInStash: true })
    expect(fs.readFileSync(`${wt}/file.txt`, 'utf8')).toContain('carried')
    // Applied, not popped: the one copy of the work is still in the list.
    expect(git('stash list')).toMatch(/to the second/)
    // And it left the source clean, because the stash took it.
    expect(git('status --porcelain').trim()).toBe('')
  })

  test('a clean worktree has nothing to carry, and is told so before anything is stashed', async () => {
    const r = await copyChangesToWorktree(run, dir, wt, 'nothing')
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/clean/)
    expect(git('stash list').trim()).toBe('')
  })

  test('the same worktree twice is refused', async () => {
    expect(await copyChangesToWorktree(run, dir, dir, 'x')).toMatchObject({
      success: false, error: 'That is the same worktree',
    })
  })

  test('an apply that fails still says where the work is', async () => {
    // The same file, changed differently on both sides: the apply cannot land.
    fs.appendFileSync(`${wt}/file.txt`, 'theirs\n')
    fs.appendFileSync(`${dir}/file.txt`, 'mine\n')
    const r = await copyChangesToWorktree(run, dir, wt, 'clashing')
    expect(r.success).toBe(false)
    expect(r.leftInStash).toBe(true)
    expect(git('stash list')).toMatch(/clashing/)
  })
})
