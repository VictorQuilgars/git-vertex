import { execSync } from 'child_process'
import * as fs from 'fs'
import {
  parseAheadBehind, upstreamOf, aheadBehindUpstream, fastForwardBranch,
  remoteBranchNames, fixupCommits, squashFixups, type GitRunner,
} from '../git-core'

// What a branch needs, and what it costs to give it (#280). On a real
// repository: the whole point of these is what git does when asked, and a
// fake runner would only prove that the arguments are spelled the way this
// file spells them.

let dir = ''
let remote = ''
let run: GitRunner

const git = (cmd: string, at = dir) => execSync(`git -C ${at} ${cmd}`, { encoding: 'utf8' })
const commit = (text: string, message: string) => {
  fs.appendFileSync(`${dir}/file.txt`, text + '\n')
  git('add -A')
  git(`commit -q -m "${message}"`)
}

beforeEach(() => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  dir = `/tmp/gv-upkeep-${stamp}`
  remote = `/tmp/gv-upkeep-${stamp}-remote.git`
  fs.mkdirSync(dir, { recursive: true })
  execSync(`git init -q -b main ${dir}`)
  git('config user.email test@test.com')
  git('config user.name "Test User"')
  execSync(`git init -q --bare ${remote}`)
  commit('one', 'base')
  git(`remote add origin ${remote}`)
  git('push -q -u origin main')
  run = async (args: string[]) => execSync(
    `git -C ${dir} ${args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`,
    { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } })
})

afterEach(() => {
  for (const p of [dir, remote]) { try { fs.rmSync(p, { recursive: true, force: true }) } catch { /* gone */ } }
})

test('the ahead/behind pair is read as git prints it', () => {
  expect(parseAheadBehind('2\t3\n')).toEqual({ ahead: 2, behind: 3 })
  expect(parseAheadBehind('')).toEqual({ ahead: 0, behind: 0 })
})

describe('what a branch tracks', () => {
  test('is named, or is null when it tracks nothing', async () => {
    expect(await upstreamOf(run, 'main')).toBe('origin/main')
    git('branch -q solo')
    expect(await upstreamOf(run, 'solo')).toBeNull()
    // A ref that is an option is refused before it reaches a command line.
    expect(await upstreamOf(run, '--exec=boom')).toBeNull()
  })

  test('ahead is what the branch has that its upstream lacks', async () => {
    commit('two', 'local work')
    expect(await aheadBehindUpstream(run, 'main', 'origin/main')).toEqual({ ahead: 1, behind: 0 })
  })
})

describe('bringing a branch forward without standing on it', () => {
  /** A second branch, published, that the remote then moves ahead of. */
  const publishAndAdvance = () => {
    git('checkout -q -b feature')
    commit('two', 'shared')
    git('push -q -u origin feature')
    // Somebody else's commit, arriving on the remote — cloned, advanced, pushed.
    const other = `${dir}-other`
    execSync(`git clone -q ${remote} ${other}`)
    execSync(`git -C ${other} config user.email o@o.com`)
    execSync(`git -C ${other} config user.name Other`)
    execSync(`git -C ${other} checkout -q feature`)
    fs.appendFileSync(`${other}/file.txt`, 'three\n')
    execSync(`git -C ${other} commit -qam "theirs"`)
    execSync(`git -C ${other} push -q origin feature`)
    fs.rmSync(other, { recursive: true, force: true })
    git('fetch -q origin')
    git('checkout -q main')
  }

  test('a branch that is only behind is fast-forwarded, and says how far it moved', async () => {
    publishAndAdvance()
    const before = git('rev-parse feature').trim()
    const r = await fastForwardBranch(run, 'feature')
    expect(r).toMatchObject({ success: true, moved: 1, upstream: 'origin/feature' })
    expect(git('rev-parse feature').trim()).toBe(git('rev-parse origin/feature').trim())
    expect(git('rev-parse feature').trim()).not.toBe(before)
    // And it did not switch: the checkout is still main.
    expect(git('symbolic-ref --short HEAD').trim()).toBe('main')
  })

  test('a branch level with its upstream is a success that did nothing', async () => {
    const r = await fastForwardBranch(run, 'main')
    expect(r).toMatchObject({ success: true, upToDate: true, moved: 0 })
  })

  test('a diverged branch is refused, and the refusal says both counts', async () => {
    publishAndAdvance()
    git('checkout -q feature')
    fs.appendFileSync(`${dir}/other.txt`, 'mine\n')
    git('add -A')
    git('commit -q -m "mine"')
    git('checkout -q main')
    const r = await fastForwardBranch(run, 'feature')
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/diverged/)
    expect(r.error).toMatch(/1 ahead, 1 behind/)
  })

  test('a branch that tracks nothing says so, rather than failing at git', async () => {
    git('branch -q solo')
    expect(await fastForwardBranch(run, 'solo')).toMatchObject({
      success: false, error: 'solo tracks no branch',
    })
  })

  test('the branch you are standing on is moved too — as a --ff-only merge', async () => {
    publishAndAdvance()
    git('checkout -q feature')
    const r = await fastForwardBranch(run, 'feature')
    expect(r).toMatchObject({ success: true, moved: 1 })
    expect(git('rev-parse HEAD').trim()).toBe(git('rev-parse origin/feature').trim())
  })
})

test('the upstream picker is offered every remote branch, and never origin/HEAD', async () => {
  git('checkout -q -b feature')
  git('push -q -u origin feature')
  git('checkout -q main')
  // What a clone has: a symbolic origin/HEAD beside the real branches.
  git('remote set-head origin main')
  const names = await remoteBranchNames(run)
  expect(names).toEqual(expect.arrayContaining(['origin/main', 'origin/feature']))
  expect(names).not.toContain('origin/HEAD')
})

describe('squashing the fixups', () => {
  const withFixups = () => {
    git('checkout -q -b feature')
    commit('two', 'feat: the thing')
    const target = git('rev-parse --short HEAD').trim()
    commit('three', `fixup! feat: the thing`)
    return target
  }

  test('the fixup commits over a base are the ones that would fold', async () => {
    withFixups()
    const found = await fixupCommits(run, 'origin/main')
    expect(found).toHaveLength(1)
    expect(found[0].subject).toBe('fixup! feat: the thing')
  })

  test('folding leaves one commit, and the branch where it was', async () => {
    withFixups()
    const base = git('rev-parse origin/main').trim()
    const r = await squashFixups(run, 'origin/main')
    expect(r).toMatchObject({ success: true, squashed: 1 })
    const subjects = git('log --format=%s origin/main..HEAD').trim().split('\n')
    expect(subjects).toEqual(['feat: the thing'])
    // The fork point is what it was rebased onto: the branch did not move on
    // to whatever the upstream has grown since.
    expect(git('merge-base HEAD origin/main').trim()).toBe(base)
  })

  test('nothing to fold is refused, because a rebase would rewrite every hash for nothing', async () => {
    git('checkout -q -b feature')
    commit('two', 'feat: the thing')
    const before = git('rev-parse HEAD').trim()
    const r = await squashFixups(run, 'origin/main')
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/No fixup/)
    expect(git('rev-parse HEAD').trim()).toBe(before)
  })

  test('a base that is not a ref of this repository is said, not thrown', async () => {
    expect(await squashFixups(run, 'origin/nothing-like-this')).toMatchObject({
      success: false, error: 'Nothing in common with origin/nothing-like-this',
    })
    expect((await squashFixups(run, '--exec=boom')).success).toBe(false)
  })
})
