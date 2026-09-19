import { execSync } from 'child_process'
import * as fs from 'fs'
import {
  pullRequestBranch, pullRequestRefspec, fetchPullRequestHead, type GitRunner,
} from '../git-core'

// A pull request's head, fork included (#290). GitHub publishes every
// request's head under the repository's own `refs/pull/<n>/head` — which is
// why a fork's request needs no remote of its own — and the test builds that
// ref by hand in a bare repository, because that is exactly what the server
// does.

describe('the refspec', () => {
  test('names the request and the branch it lands on', () => {
    expect(pullRequestBranch(123)).toBe('pr/123')
    expect(pullRequestRefspec(123)).toBe('refs/pull/123/head:pr/123')
    expect(pullRequestRefspec(7, 'review/7')).toBe('refs/pull/7/head:review/7')
  })

  test('is never forced: a local branch that moved is not silently rewritten', () => {
    expect(pullRequestRefspec(1).startsWith('+')).toBe(false)
  })
})

describe('fetching it', () => {
  let dir = ''
  let remote = ''
  let run: GitRunner
  const git = (cmd: string, at = dir) => execSync(`git -C ${at} ${cmd}`, { encoding: 'utf8' })

  beforeEach(() => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    dir = `/tmp/gv-pr-${stamp}`
    remote = `/tmp/gv-pr-${stamp}-remote.git`
    execSync(`git init -q --bare ${remote}`)
    // The server side: a base branch, and a head nothing else points at —
    // which is what a fork's request looks like from this clone.
    const seed = `${dir}-seed`
    execSync(`git init -q -b main ${seed}`)
    execSync(`git -C ${seed} config user.email t@t.com`)
    execSync(`git -C ${seed} config user.name T`)
    fs.writeFileSync(`${seed}/file.txt`, 'base\n')
    execSync(`git -C ${seed} add -A && git -C ${seed} commit -q -m base`)
    execSync(`git -C ${seed} push -q ${remote} main`)
    execSync(`git -C ${seed} checkout -q -b theirs`)
    fs.appendFileSync(`${seed}/file.txt`, 'from a fork\n')
    execSync(`git -C ${seed} commit -qam "their work"`)
    // The head, where GitHub publishes it — and NOT as a branch.
    execSync(`git -C ${seed} push -q ${remote} HEAD:refs/pull/42/head`)
    fs.rmSync(seed, { recursive: true, force: true })

    execSync(`git clone -q ${remote} ${dir}`)
    git('config user.email t@t.com')
    git('config user.name T')
    run = async (args: string[]) => execSync(
      `git -C ${dir} ${args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`,
      { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } })
  })

  afterEach(() => {
    for (const p of [dir, remote]) { try { fs.rmSync(p, { recursive: true, force: true }) } catch { /* gone */ } }
  })

  test("a head no branch points at is fetched anyway — the fork's case", async () => {
    // Nothing in the clone knows about it beforehand.
    expect(git('branch -r')).not.toMatch(/theirs/)
    const r = await fetchPullRequestHead(run, 'origin', 42)
    expect(r).toMatchObject({ success: true, branch: 'pr/42' })
    expect(git('log --format=%s -1 pr/42').trim()).toBe('their work')
    // And it did not switch: reading a review should not cost a stash.
    expect(git('symbolic-ref --short HEAD').trim()).toBe('main')
  })

  test('with checkout, it lands on the branch it made', async () => {
    const r = await fetchPullRequestHead(run, 'origin', 42, { checkout: true })
    expect(r).toMatchObject({ success: true, branch: 'pr/42' })
    expect(git('symbolic-ref --short HEAD').trim()).toBe('pr/42')
  })

  test('a request that does not exist fails without making a branch', async () => {
    const r = await fetchPullRequestHead(run, 'origin', 999)
    expect(r.success).toBe(false)
    expect(git('branch --list pr/999').trim()).toBe('')
  })

  test('a local branch of that name that has moved is refused, never overwritten', async () => {
    await fetchPullRequestHead(run, 'origin', 42)
    git('checkout -q pr/42')
    fs.appendFileSync(`${dir}/file.txt`, 'my own review notes\n')
    git('commit -qam "mine"')
    const mine = git('rev-parse pr/42').trim()
    git('checkout -q main')
    const r = await fetchPullRequestHead(run, 'origin', 42)
    expect(r).toMatchObject({ success: false, diverged: true })
    expect(r.error).toMatch(/already exists/)
    // The work on it is still there.
    expect(git('rev-parse pr/42').trim()).toBe(mine)
  })

  test('a number that is not one, and a remote that is an option, are refused before git', async () => {
    const calls: string[][] = []
    const spy: GitRunner = async args => { calls.push(args); return '' }
    expect((await fetchPullRequestHead(spy, 'origin', 0)).success).toBe(false)
    expect((await fetchPullRequestHead(spy, 'origin', 1.5)).success).toBe(false)
    expect((await fetchPullRequestHead(spy, '--upload-pack=boom', 1)).success).toBe(false)
    expect(calls).toEqual([])
  })
})
