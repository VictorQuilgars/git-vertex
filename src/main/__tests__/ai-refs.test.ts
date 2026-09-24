import { execSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import simpleGit from 'simple-git'
import type { Raw } from '../ai-material'
import { rangeSubject, readRange } from '../ai-range'
import {
  explainBranch, generateChangelog, changelogState, noteList, insertRefusal, proposeCommitSplit,
  type Run, type NoteRecord, type NoteStore, type ChangelogRecord, type ChangelogStore,
} from '../ai-features'
import * as core from '../git-core'
import { makeSimpleGit } from '../git-service'

// The AI entries on the side bar's refs (#293): which RANGE each one sends.
//
// Explain unpushed changes      <upstream>..<branch>
// Changelog since a tag         <tag>..<current branch>
// Recompose commits             <fork point>..<branch>, checked-out branch only
//
// The fake git records every command it is given, so each test says the
// range in git's own words — the thing a wrong subject would get wrong.

function recordingGit(table: Record<string, string>, missing: string[] = []) {
  const calls: string[] = []
  const raw: Raw = async (args: string[]) => {
    const key = args.join(' ')
    calls.push(key)
    if (missing.includes(key)) throw new Error('exit 1')
    if (key in table) return table[key]
    const prefix = Object.keys(table).find(k => key.startsWith(k))
    return prefix ? table[prefix] : ''
  }
  return { raw, calls }
}

function fakeModel(text: string) {
  const calls: { prompt: string; feature: string }[] = []
  const run: Run = async (prompt, feature) => { calls.push({ prompt, feature }); return { text } }
  return { run, calls }
}

function fakeNotes(seed: NoteRecord[] = []) {
  let kept = [...seed]
  const store: NoteStore = {
    async all() { return kept },
    async get(kind, key) { return kept.find(n => n.kind === kind && n.key === key) ?? null },
    async set(record) { kept = [record, ...kept.filter(n => !(n.kind === record.kind && n.key === record.key))] },
    async forget(kind, key) { kept = kept.filter(n => !(n.kind === kind && n.key === key)) },
  }
  return { store, get kept() { return kept } }
}

function fakeChangelogs(seed: Record<string, ChangelogRecord> = {}) {
  const kept: Record<string, ChangelogRecord> = { ...seed }
  const store: ChangelogStore = {
    async get(key) { return kept[key] ?? null },
    async set(key, record) { kept[key] = record },
    async all() { return kept },
    async forget(key) { delete kept[key] },
  }
  return { store, kept }
}

describe('a range subject', () => {
  test('is git\'s two-dot notation, read back as tip and base', () => {
    expect(rangeSubject('origin/feat', 'feat')).toBe('origin/feat..feat')
    expect(readRange('origin/feat..feat')).toEqual({ tip: 'feat', base: 'origin/feat' })
    expect(readRange('v1.2.0..main')).toEqual({ tip: 'main', base: 'v1.2.0' })
  })

  test('a plain branch has no base of its own — git refuses `..` in a ref name', () => {
    expect(readRange('feat/x')).toEqual({ tip: 'feat/x' })
    expect(readRange('remotes/origin/feat')).toEqual({ tip: 'remotes/origin/feat' })
  })

  test('an end git would read as an option is refused before git or the model runs', async () => {
    const git = recordingGit({})
    const m = fakeModel('never')
    expect((await explainBranch(git.raw, m.run, '--output=/tmp/x..feat')).error).toMatch(/^Invalid reference/)
    expect((await generateChangelog(git.raw, m.run, 'v1..-x')).error).toMatch(/^Invalid reference/)
    expect((await proposeCommitSplit(git.raw, m.run, {}, '-x..feat')).error).toMatch(/^Invalid reference/)
    expect(git.calls).toEqual([])
    expect(m.calls).toEqual([])
  })

  test('three dots and half-ranges are handed back whole, never half-read', () => {
    expect(readRange('a...b')).toEqual({ tip: 'a...b' })
    expect(readRange('..b')).toEqual({ tip: '..b' })
    expect(readRange('a..')).toEqual({ tip: 'a..' })
  })
})

describe('Explain unpushed changes — upstream..branch', () => {
  const table = {
    'log --reverse --format=%s origin/feat..feat': 'local one\nlocal two\n',
    'diff --stat origin/feat...feat': ' a.ts | 2 +-',
    'diff origin/feat...feat': 'the unpushed diff',
    'rev-parse feat': 'tip111\n',
    'rev-parse origin/feat': 'up222\n',
  }

  test('reads exactly the commits the upstream lacks, and never asks for the trunk', async () => {
    const git = recordingGit(table)
    const m = fakeModel('Two local commits.')
    const r = await explainBranch(git.raw, m.run, 'origin/feat..feat')
    expect(r).toEqual({ explanation: 'Two local commits.', base: 'origin/feat' })
    expect(git.calls).toContain('log --reverse --format=%s origin/feat..feat')
    expect(git.calls).toContain('diff origin/feat...feat')
    // resolveBase starts by listing the remotes; a named base never gets there.
    expect(git.calls).not.toContain('remote')
    expect(m.calls[0].feature).toBe('explain')
    expect(m.calls[0].prompt).toContain('local one')
  })

  test('kept under the range, beside — not over — the whole-branch reading', async () => {
    const whole: NoteRecord = { kind: 'branch', key: 'feat', title: 'feat', text: 'All of it.', at: 1, sha: 'tip000' }
    const notes = fakeNotes([whole])
    await explainBranch(recordingGit(table).raw, fakeModel('Two local commits.').run, 'origin/feat..feat', { store: notes.store })
    expect(notes.kept).toHaveLength(2)
    expect(notes.kept[0]).toMatchObject({
      kind: 'branch', key: 'origin/feat..feat', title: 'origin/feat..feat', sha: 'tip111', baseSha: 'up222',
    })
    expect(notes.kept[1]).toEqual(whole)
  })

  test('the kept note is measured by its tip', async () => {
    const git = recordingGit({
      'rev-parse feat': 'tip999\n',
      'rev-list --count tip111..feat': '2\n',
      'rev-list --max-count=500 up222..tip111': 'tip111\n',
    })
    const notes = fakeNotes([{ kind: 'branch', key: 'origin/feat..feat', title: 'origin/feat..feat', text: 't', at: 1, sha: 'tip111', baseSha: 'up222' }])
    const { entries } = await noteList(git.raw, notes.store)
    expect(entries[0]).toMatchObject({ subject: 'live', newCommits: 2, hashes: ['tip111'] })
    expect(git.calls).toContain('rev-list --count tip111..feat')
    expect(git.calls.some(c => c.includes('..origin/feat..feat'))).toBe(false)
  })
})

describe('Generate changelog since this tag — tag..current branch', () => {
  const table = {
    'log --reverse --format=%s%n%b%x1e v1.2.0..main': 'feat: one\n\x1efix: two\n\x1e',
    'diff --stat v1.2.0...main': ' 2 files changed',
    'rev-parse main': 'head333\n',
    'rev-parse v1.2.0': 'tag444\n',
  }

  test('reads the commits since the tag, on the named branch', async () => {
    const git = recordingGit(table)
    const m = fakeModel('### Added\n- one')
    const r = await generateChangelog(git.raw, m.run, 'v1.2.0..main')
    expect(r).toMatchObject({ changelog: '### Added\n- one', base: 'v1.2.0', commits: 2 })
    expect(git.calls).toContain('log --reverse --format=%s%n%b%x1e v1.2.0..main')
    expect(git.calls).toContain('diff --stat v1.2.0...main')
    expect(git.calls).not.toContain('remote')
    expect(m.calls[0].feature).toBe('changelog')
  })

  test('filed under the range, so the branch\'s own changelog survives it', async () => {
    const own: ChangelogRecord = { text: 'branch text', base: 'origin/main', headSha: 'h', baseSha: 'b', commits: 1, at: 1 }
    const logs = fakeChangelogs({ main: own })
    await generateChangelog(recordingGit(table).raw, fakeModel('x').run, 'v1.2.0..main', undefined, { store: logs.store })
    expect(logs.kept.main).toEqual(own)
    expect(logs.kept['v1.2.0..main']).toMatchObject({ base: 'v1.2.0', headSha: 'head333', baseSha: 'tag444', commits: 2 })
  })

  test('recalled against the tag, not the trunk', async () => {
    const git = recordingGit(table)
    const logs = fakeChangelogs({ 'v1.2.0..main': { text: 't', base: 'v1.2.0', headSha: 'head333', baseSha: 'tag444', commits: 2, at: 1 } })
    const s = await changelogState(git.raw, logs.store, 'v1.2.0..main')
    expect(s).toMatchObject({ base: 'v1.2.0', newCommits: 0, baseMoved: false })
    expect(git.calls).not.toContain('remote')
  })

  test('inserting it is not refused as "gone" — the tip is what must exist', async () => {
    // `rev-parse --verify` refuses a range outright; asked of the subject,
    // every changelog since a tag read as a deleted branch.
    const git = recordingGit({ 'rev-parse --verify --quiet main': 'head333\n', 'rev-list --count': '0\n' })
    expect(await insertRefusal(git.raw, 'v1.2.0..main')).toBeNull()
    expect(git.calls).toEqual(['rev-parse --verify --quiet main'])
  })

  test('a plain branch keeps both refusals', async () => {
    const gone = recordingGit({}, ['rev-parse --verify --quiet feat'])
    expect(await insertRefusal(gone.raw, 'feat')).toEqual({ branchGone: true })
    const merged = recordingGit({
      'rev-parse --verify --quiet feat': 'f\n',
      'remote': 'origin\n',
      'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main\n',
      'rev-parse --verify --quiet refs/remotes/origin/main': 'm\n',
      'rev-list --count origin/main..feat': '0\n',
    })
    expect(await insertRefusal(merged.raw, 'feat')).toEqual({ alreadyMerged: true, base: 'origin/main' })
  })
})

describe('Recompose commits — the branch over its fork point', () => {
  const withTrunk = {
    'remote': 'origin\n',
    'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main\n',
    'rev-parse --verify --quiet refs/remotes/origin/main': 'abc\n',
  }
  const plan = '=== COMMIT ===\nMESSAGE:\nfeat: a\nFILES:\na.ts\n=== COMMIT ===\nMESSAGE:\nfix: b\nFILES:\nb.ts'

  test('reads fork point..tip, as shas, with renames split into both paths', async () => {
    const git = recordingGit({
      ...withTrunk,
      'symbolic-ref --quiet --short HEAD': 'feat\n',
      'merge-base origin/main feat': 'fork555\n',
      'rev-parse feat': 'tip666\n',
      'rev-list --count fork555..tip666': '3\n',
      'diff --name-only --no-renames fork555 tip666': 'a.ts\nb.ts\n',
    })
    const m = fakeModel(plan)
    const r = await proposeCommitSplit(git.raw, m.run, {}, 'feat')
    expect(r.error).toBeUndefined()
    expect(r.groups.map(g => g.files)).toEqual([['a.ts'], ['b.ts']])
    expect(r.recompose).toEqual({ branch: 'feat', base: 'origin/main', onto: 'fork555', tip: 'tip666', commits: 3 })
    expect(git.calls).toContain('diff --no-renames fork555 tip666')
    expect(m.calls[0].feature).toBe('compose')
    expect(m.calls[0].prompt).toContain('the work the branch feat carries over origin/main, 3 commit(s) taken as one diff')
    // The working tree is not the material here.
    expect(git.calls).not.toContain('diff --cached')
  })

  test('a named base is used as given', async () => {
    const git = recordingGit({
      'symbolic-ref --quiet --short HEAD': 'feat\n',
      'merge-base origin/feat feat': 'fork555\n',
      'rev-parse feat': 'tip666\n',
      'rev-list --count': '1\n',
      'diff --name-only --no-renames fork555 tip666': 'a.ts\nb.ts\n',
    })
    const r = await proposeCommitSplit(git.raw, fakeModel(plan).run, {}, 'origin/feat..feat')
    expect(r.recompose).toMatchObject({ base: 'origin/feat', onto: 'fork555' })
    expect(git.calls).not.toContain('remote')
  })

  test('a branch that is not checked out is refused before the model is asked', async () => {
    const git = recordingGit({ ...withTrunk, 'symbolic-ref --quiet --short HEAD': 'main\n' })
    const m = fakeModel(plan)
    const r = await proposeCommitSplit(git.raw, m.run, {}, 'feat')
    expect(r.error).toBe('feat is not checked out — only the checked-out branch can be recomposed')
    expect(m.calls).toEqual([])
  })

  test('tracked changes are refused: the rewrite would absorb them', async () => {
    const git = recordingGit({ 'symbolic-ref --quiet --short HEAD': 'feat\n', 'status --porcelain --untracked-files=no': ' M a.ts\n' })
    const m = fakeModel(plan)
    const r = await proposeCommitSplit(git.raw, m.run, {}, 'feat')
    expect(r.error).toMatch(/^Commit or stash your uncommitted changes first/)
    expect(m.calls).toEqual([])
  })

  test('an untracked file where the branch has a path is refused', async () => {
    const git = recordingGit({
      ...withTrunk,
      'symbolic-ref --quiet --short HEAD': 'feat\n',
      'merge-base origin/main feat': 'fork555\n',
      'rev-parse feat': 'tip666\n',
      'rev-list --count': '2\n',
      'diff --name-only --no-renames fork555 tip666': 'a.ts\nb.ts\n',
      'ls-files --others --exclude-standard': 'b.ts\nnotes.txt\n',
    })
    const m = fakeModel(plan)
    const r = await proposeCommitSplit(git.raw, m.run, {}, 'feat')
    expect(r.error).toContain('(b.ts)')
    expect(m.calls).toEqual([])
  })

  test('nothing over the base is said, not sent', async () => {
    const git = recordingGit({
      ...withTrunk,
      'symbolic-ref --quiet --short HEAD': 'feat\n',
      'merge-base origin/main feat': 'tip666\n',
      'rev-parse feat': 'tip666\n',
      'rev-list --count': '0\n',
    })
    const m = fakeModel(plan)
    expect((await proposeCommitSplit(git.raw, m.run, {}, 'feat')).error).toBe('feat carries no commit over origin/main')
    expect(m.calls).toEqual([])
  })
})

// The apply half, against a real repository and both hosts' runners: the
// composer's own sequence (reset, then unstage / stage / commit per group)
// must end on the same tree the branch had, with every path accounted for.
// The panel's simple-git runs on an allow-list of the environment with the
// locale pinned (vscode-extension/src/gitService.ts::simpleGitEnv) — copying
// all of it would hand simple-git a GIT_EDITOR it refuses outright.
function panelEnv(): Record<string, string> {
  const env: Record<string, string> = { LC_ALL: 'C' }
  for (const key of ['HOME', 'PATH', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM']) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  return env
}

const RUNNERS: [string, (repo: string) => core.GitRunner][] = [
  ['desktop runner', repo => args => makeSimpleGit(repo).raw(args)],
  ['panel runner', repo => args => simpleGit(repo).env(panelEnv()).raw(args)],
]

describe.each(RUNNERS)('recomposing a real branch — %s', (_label, makeRunner) => {
  let repo: string
  const run = (cmd: string) => execSync(cmd, { cwd: repo, env: { ...process.env, LC_ALL: 'C' } }).toString()
  const write = (name: string, body: string) => fs.writeFileSync(path.join(repo, name), body)

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-recompose-'))
    run('git init -b main')
    run('git config user.email test@test.com && git config user.name "Test User"')
    write('keep.txt', 'base\n'); write('old.txt', 'to be renamed\n'); write('gone.txt', 'to be deleted\n')
    run('git add -A && git commit -m base')
    run('git checkout -b feat')
    write('a.ts', 'a\n'); run('git add -A && git commit -m wip1')
    write('keep.txt', 'base\nchanged\n'); run('git mv old.txt new.txt'); run('git add -A && git commit -m wip2')
    run('git rm -q gone.txt && git commit -m wip3')
  })
  afterEach(() => fs.rmSync(repo, { recursive: true, force: true }))

  test('the proposal covers every path, and applying it keeps the tree', async () => {
    const raw = makeRunner(repo)
    const tipTree = run('git rev-parse feat^{tree}').trim()
    const oldTip = run('git rev-parse feat').trim()
    const answer = [
      '=== COMMIT ===\nMESSAGE:\nfeat: add a\nFILES:\na.ts',
      '=== COMMIT ===\nMESSAGE:\nrefactor: rename old to new\nFILES:\nold.txt\nnew.txt\nkeep.txt',
      '=== COMMIT ===\nMESSAGE:\nchore: drop gone\nFILES:\ngone.txt',
    ].join('\n')
    // `main` is the only trunk this repository has.
    const proposal = await proposeCommitSplit(raw, fakeModel(answer).run, {}, 'main..feat')
    expect(proposal.error).toBeUndefined()
    expect(proposal.unassigned).toEqual([])
    const p = proposal.recompose!
    expect(p).toMatchObject({ branch: 'feat', base: 'main', commits: 3, tip: oldTip })

    expect(await core.resetForRecompose(raw, p.branch, p.onto, p.tip)).toEqual({ success: true })
    // What CommitComposerBody.apply does next, through the same git commands
    // the two services' unstage / stage / commit run.
    const all = proposal.groups.flatMap(g => g.files)
    await raw(['reset', 'HEAD', '--', ...all])
    for (const g of proposal.groups) {
      await raw(['add', '--', ...g.files])
      await raw(['commit', '-m', g.message])
    }
    expect(run('git rev-parse feat^{tree}').trim()).toBe(tipTree)
    expect(run('git log --format=%s main..feat').trim().split('\n'))
      .toEqual(['chore: drop gone', 'refactor: rename old to new', 'feat: add a'])
    expect(run('git status --porcelain').trim()).toBe('')
    // The old tip is still reachable through the reflog.
    expect(run('git reflog --format=%H feat')).toContain(oldTip)
  })

  test('the reset refuses a branch that moved, a dirty tree, and another branch', async () => {
    const raw = makeRunner(repo)
    const onto = run('git merge-base main feat').trim()
    const tip = run('git rev-parse feat').trim()
    const before = run('git rev-parse HEAD').trim()

    expect((await core.resetForRecompose(raw, 'feat', onto, 'a'.repeat(40))).error).toMatch(/has moved since/)

    write('keep.txt', 'uncommitted\n')
    expect((await core.resetForRecompose(raw, 'feat', onto, tip)).error).toMatch(/^Commit or stash/)
    expect(fs.readFileSync(path.join(repo, 'keep.txt'), 'utf8')).toBe('uncommitted\n')
    run('git checkout -q -- keep.txt')

    run('git checkout -q main')
    expect((await core.resetForRecompose(raw, 'feat', onto, tip)).error).toBe('feat is not checked out — only the checked-out branch can be recomposed')
    run('git checkout -q feat')

    // Nothing above moved the branch.
    expect(run('git rev-parse HEAD').trim()).toBe(before)
  })

  test('a fork point that is not behind the tip is refused', async () => {
    const raw = makeRunner(repo)
    run('git checkout -q main'); write('x.txt', 'x\n'); run('git add -A && git commit -q -m elsewhere')
    const elsewhere = run('git rev-parse HEAD').trim()
    run('git checkout -q feat')
    const tip = run('git rev-parse feat').trim()
    expect((await core.resetForRecompose(raw, 'feat', elsewhere, tip)).error).toMatch(/is not where feat forked/)
    expect(run('git rev-parse feat').trim()).toBe(tip)
  })
})
