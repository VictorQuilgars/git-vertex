import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { parseChangePairs, changeSet, type GitRunner } from '../git-core'

// Every change of a branch, a stash or a pull request, as the before/after
// pairs an editor's multi-file diff opens (#284). The pairs are what matter:
// an added file has no before, a deleted one no after, and a rename is read
// at its OLD path on the left — at the new one the left would be empty, and
// the whole file would show as added.

describe('the pairs, from git\'s -z output', () => {
  const B = 'b'.repeat(40), A = 'a'.repeat(40)

  test('added, deleted, modified and renamed, each with the sides it has', () => {
    const raw = ['A', 'new.ts', 'D', 'gone.ts', 'M', 'kept.ts', 'R087', 'old/name.ts', 'new/name.ts', ''].join('\0')
    expect(parseChangePairs(raw, B, A)).toEqual([
      { path: 'new.ts', status: 'A', before: null, after: { ref: A, path: 'new.ts' } },
      { path: 'gone.ts', status: 'D', before: { ref: B, path: 'gone.ts' }, after: null },
      { path: 'kept.ts', status: 'M', before: { ref: B, path: 'kept.ts' }, after: { ref: A, path: 'kept.ts' } },
      { path: 'new/name.ts', status: 'R', before: { ref: B, path: 'old/name.ts' }, after: { ref: A, path: 'new/name.ts' } },
    ])
  })

  test('a path with a tab or a newline is one path, which is why -z', () => {
    const raw = ['M', 'odd\tname\nhere.txt', ''].join('\0')
    expect(parseChangePairs(raw, B, A).map(p => p.path)).toEqual(['odd\tname\nhere.txt'])
  })

  test('a type change is a modification; nothing is nothing', () => {
    expect(parseChangePairs(['T', 'link', ''].join('\0'), B, A)[0].status).toBe('M')
    expect(parseChangePairs('', B, A)).toEqual([])
  })
})

describe('on a real repository', () => {
  let dir = ''
  let run: GitRunner
  const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' },
  })
  const write = (f: string, body: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true })
    fs.writeFileSync(path.join(dir, f), body)
  }
  const sha = (ref: string) => git('rev-parse', ref).trim()
  const view = (pairs: Awaited<ReturnType<typeof changeSet>>['pairs']) => Object.fromEntries(pairs.map(p => [p.path, [
    p.status, p.before && `${p.before.ref.slice(0, 7)}:${p.before.path}`, p.after && `${p.after.ref.slice(0, 7)}:${p.after.path}`,
  ]]))

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-changeset-'))
    execFileSync('git', ['init', '-q', '-b', 'main', dir])
    git('config', 'user.email', 'test@test.com')
    git('config', 'user.name', 'Test User')
    write('keep.txt', 'one\n')
    write('drop.txt', 'bye\n')
    write('move/from.txt', 'a body long enough to be recognised as the same file\nline two\nline three\n')
    git('add', '-A'); git('commit', '-q', '-m', 'base')
    run = async (args: string[]) => git(...args)
  })

  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  test('a branch, against where it forked — not against what main did since', async () => {
    git('switch', '-q', '-c', 'feat')
    write('keep.txt', 'one\ntwo\n')
    write('added.txt', 'hello\n')
    fs.rmSync(path.join(dir, 'drop.txt'))
    fs.mkdirSync(path.join(dir, 'moved'))
    fs.renameSync(path.join(dir, 'move/from.txt'), path.join(dir, 'moved/to.txt'))
    git('add', '-A'); git('commit', '-q', '-m', 'feat')
    const fork = sha('main')
    git('switch', '-q', 'main')
    write('main-only.txt', 'not the branch\'s\n')
    git('add', '-A'); git('commit', '-q', '-m', 'main moves on')

    const r = await changeSet(run, { kind: 'range', base: 'main', head: 'feat', axis: 'diverged' })
    expect(r.error).toBeUndefined()
    const f = sha('feat').slice(0, 7), b = fork.slice(0, 7)
    expect(view(r.pairs)).toEqual({
      'keep.txt': ['M', `${b}:keep.txt`, `${f}:keep.txt`],
      'added.txt': ['A', null, `${f}:added.txt`],
      'drop.txt': ['D', `${b}:drop.txt`, null],
      'moved/to.txt': ['R', `${b}:move/from.txt`, `${f}:moved/to.txt`],
    })

    // The two trees as they stand also count what main did — the other axis.
    const ends = await changeSet(run, { kind: 'range', base: 'main', head: 'feat', axis: 'endpoints' })
    expect(ends.pairs.map(p => p.path)).toContain('main-only.txt')
  })

  test('a stash, against its parent, its untracked files added', async () => {
    write('keep.txt', 'one\nchanged\n')
    write('fresh.txt', 'never added\n')
    git('stash', 'push', '-q', '-u')
    const stash = sha('stash@{0}')
    const r = await changeSet(run, { kind: 'stash', index: 0 })
    expect(r.error).toBeUndefined()
    expect(view(r.pairs)).toEqual({
      'keep.txt': ['M', `${sha('HEAD').slice(0, 7)}:keep.txt`, `${stash.slice(0, 7)}:keep.txt`],
      'fresh.txt': ['A', null, `${sha('stash@{0}^3').slice(0, 7)}:fresh.txt`],
    })
    // Hashes, never `stash@{0}`: a stash pushed meanwhile must not change what
    // an open diff's sides read.
    for (const p of r.pairs) for (const side of [p.before, p.after]) if (side) expect(side.ref).toMatch(/^[0-9a-f]{40}$/)
  })

  test('what names nothing says so, and an option is never taken for a ref', async () => {
    expect((await changeSet(run, { kind: 'stash', index: 0 })).error).toMatch(/no stash@\{0\}/)
    expect((await changeSet(run, { kind: 'range', base: 'main', head: 'nope', axis: 'diverged' })).error).toMatch(/names no commit/)
    expect((await changeSet(run, { kind: 'range', base: '--output=x', head: 'main', axis: 'diverged' })).error).toMatch(/Invalid/)
  })
})
