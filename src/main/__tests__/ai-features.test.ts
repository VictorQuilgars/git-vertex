import { resolveBase, workingMaterial, branchMaterial, type Raw } from '../ai-material'
import {
  explainBranch, explainStash, explainWorking, generateChangelog, proposeCommitSplit,
  noteList, insertedIn, withInserted,
  type Run, type NoteRecord, type NoteStore, type ChangelogRecord,
} from '../ai-features'

// A fake git and a fake model, so the whole of a feature — which base it
// reads against, what it refuses, which feature's model it runs on — is
// exercised without a repository or an API key. This is what makes the two
// products' agreement checkable: the extension host calls these same
// functions, so a test here holds for the panel too.

/** `git` as a lookup: the joined argv, or a prefix of it, to its output. */
function fakeGit(table: Record<string, string>, missing: string[] = []): Raw {
  return async (args: string[]) => {
    const key = args.join(' ')
    if (missing.includes(key)) throw new Error('exit 1')
    if (key in table) return table[key]
    const prefix = Object.keys(table).find(k => key.startsWith(k))
    return prefix ? table[prefix] : ''
  }
}

/** A model that always answers `text`, and records what it was asked. */
function fakeModel(text: string) {
  const calls: { prompt: string; maxTokens: number; feature: string }[] = []
  const run: Run = async (prompt, maxTokens, feature) => {
    calls.push({ prompt, maxTokens, feature })
    return { text }
  }
  return { run, calls }
}

describe('resolveBase — worked out, never assumed', () => {
  test('a branch is read against the trunk the remote declares', async () => {
    const raw = fakeGit({
      'remote': 'origin\n',
      'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main\n',
      'rev-parse --verify --quiet refs/remotes/origin/main': 'abc\n',
    })
    expect(await resolveBase(raw, 'feat/x')).toBe('origin/main')
  })

  test('the remote copy of the trunk wins over the local one', async () => {
    // A local `main` a fortnight behind would make the branch look like it
    // carries the trunk's last fortnight as well as its own work.
    const raw = fakeGit({
      'remote': 'origin\n',
      'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main\n',
      'rev-parse --verify --quiet refs/remotes/origin/main': 'abc\n',
      'rev-parse --verify --quiet refs/heads/main': 'def\n',
    })
    expect(await resolveBase(raw, 'feat/x')).toBe('origin/main')
  })

  test('no <remote>/HEAD: main or master, whichever the remote has', async () => {
    const raw = fakeGit({
      'remote': 'origin\n',
      'rev-parse --verify --quiet refs/remotes/origin/master': 'abc\n',
    }, ['symbolic-ref --short refs/remotes/origin/HEAD'])
    expect(await resolveBase(raw, 'feat/x')).toBe('origin/master')
  })

  test('the trunk itself is read against its own upstream', async () => {
    // "What have I not pushed" — the only base that leaves the question
    // answerable when the branch asked about IS the trunk.
    const raw = fakeGit({
      'remote': 'origin\n',
      'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main\n',
      'rev-parse --abbrev-ref --symbolic-full-name main@{upstream}': 'origin/main\n',
    })
    expect(await resolveBase(raw, 'main')).toBe('origin/main')
  })

  test('the trunk decorated as the graph names it is still the trunk', async () => {
    // `origin/main` and `remotes/origin/main` both reach here from the branch
    // menu. Read as ordinary branches they would be handed themselves as
    // their own base, and every answer would be "carries nothing".
    const raw = fakeGit({
      'remote': 'origin\n',
      'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main\n',
      'rev-parse --abbrev-ref --symbolic-full-name origin/main@{upstream}': '',
      'rev-parse --abbrev-ref --symbolic-full-name remotes/origin/main@{upstream}': '',
    })
    expect(await resolveBase(raw, 'origin/main')).toBeNull()
    expect(await resolveBase(raw, 'remotes/origin/main')).toBeNull()
  })

  test('a branch whose name contains a slash keeps all of it', async () => {
    // Stripping "the first path segment" would turn `feat/x` into `x`.
    const raw = fakeGit({
      'remote': 'origin\n',
      'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/feat\n',
      'rev-parse --verify --quiet refs/remotes/origin/feat': 'abc\n',
    })
    expect(await resolveBase(raw, 'feat/x')).toBe('origin/feat')
  })

  test('a repository with no remote falls back to a local trunk', async () => {
    const raw = fakeGit({ 'rev-parse --verify --quiet refs/heads/main': 'abc\n' })
    expect(await resolveBase(raw, 'feat/x')).toBe('main')
  })

  test('nothing to compare against is null, not a guess', async () => {
    expect(await resolveBase(fakeGit({}), 'feat/x')).toBeNull()
  })
})

describe('workingMaterial', () => {
  test('untracked files count as work — by path, and by content', async () => {
    const raw = fakeGit({
      'diff --cached': 'staged diff',
      'diff --name-only': 'src/b.ts\n',
      'diff --cached --name-only': 'src/a.ts\n',
      'ls-files --others --exclude-standard': 'src/new.ts\n',
      'diff --no-index -- /dev/null src/new.ts': '--- /dev/null\n+++ b/src/new.ts\n+hello',
      'diff --stat HEAD': ' src/a.ts | 2 +-',
      'diff': 'unstaged diff',
    })
    const m = await workingMaterial(raw)
    expect(m.files).toEqual(['src/a.ts', 'src/b.ts', 'src/new.ts'])
    expect(m.unstaged).toContain('+hello')
    // `--stat HEAD` cannot see an untracked file: it is in neither HEAD nor
    // the index, so without this the stat says the work is smaller than it is.
    expect(m.diffstat).toContain('src/new.ts (new file)')
  })

  test('a clean tree yields nothing to explain', async () => {
    const m = await workingMaterial(fakeGit({}))
    expect(m.files).toEqual([])
    expect(m.staged).toBe('')
  })
})

describe('branchMaterial', () => {
  test('reads the branch on the three-dot axis, subjects oldest first', async () => {
    const raw = fakeGit({
      'remote': 'origin\n',
      'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main\n',
      'rev-parse --verify --quiet refs/remotes/origin/main': 'abc\n',
      'log --reverse --format=%s origin/main..feat/x': 'first\nsecond\n',
      'diff --stat origin/main...feat/x': ' 1 file changed',
      'diff origin/main...feat/x': 'the diff',
    })
    const m = await branchMaterial(raw, 'feat/x')
    expect(m).toEqual({
      base: 'origin/main', subjects: ['first', 'second'],
      diffstat: ' 1 file changed', diff: 'the diff',
    })
  })
})

describe('the five features', () => {
  const withTrunk = {
    'remote': 'origin\n',
    'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main\n',
    'rev-parse --verify --quiet refs/remotes/origin/main': 'abc\n',
  }

  test('explainBranch runs on the explain feature, and names its base', async () => {
    const raw = fakeGit({ ...withTrunk, 'log --reverse --format=%s origin/main..feat/x': 'first\n', 'diff origin/main...feat/x': 'd' })
    const m = fakeModel('It adds a thing.')
    expect(await explainBranch(raw, m.run, 'feat/x')).toEqual({ explanation: 'It adds a thing.', base: 'origin/main' })
    expect(m.calls[0].feature).toBe('explain')
  })

  test('a branch level with its base is refused before an API call is spent', async () => {
    const raw = fakeGit(withTrunk)
    const m = fakeModel('never asked')
    const r = await explainBranch(raw, m.run, 'feat/x')
    expect(r.error).toContain('carries nothing over origin/main')
    expect(m.calls).toEqual([])
  })

  test('a branch with no base at all says which two things are missing', async () => {
    const r = await explainBranch(fakeGit({}), fakeModel('x').run, 'feat/x')
    expect(r.error).toContain('no upstream')
  })

  test('explainStash falls back when the git is too old for --include-untracked', async () => {
    const raw = fakeGit({
      'log -1 --format=%s stash@{0}': 'WIP on main: abc\n',
      'stash show -p stash@{0}': 'the stash diff',
    }, ['stash show --include-untracked -p stash@{0}'])
    const m = fakeModel('Parked work.')
    expect(await explainStash(raw, m.run, 0)).toEqual({ explanation: 'Parked work.' })
    expect(m.calls[0].prompt).toContain('the stash diff')
    expect(m.calls[0].prompt).toContain('WIP on main: abc')
  })

  test('explainWorking refuses a clean tree', async () => {
    const m = fakeModel('never asked')
    expect((await explainWorking(fakeGit({}), m.run)).error).toBe('Nothing uncommitted to analyze')
    expect(m.calls).toEqual([])
  })

  test('generateChangelog runs on its own feature, and counts what it read', async () => {
    const raw = fakeGit({
      ...withTrunk,
      'log --reverse --format=%s%n%b%x1e origin/main..feat/x': 'feat: a\nwhy\n\x1efix: b\n\x1e',
    })
    const m = fakeModel('### Added\n- a')
    const r = await generateChangelog(raw, m.run, 'feat/x')
    expect(r).toEqual({ changelog: '### Added\n- a', base: 'origin/main', commits: 2 })
    expect(m.calls[0].feature).toBe('changelog')
  })

  test('a changelog for a branch with no commit is refused, not invented', async () => {
    const r = await generateChangelog(fakeGit(withTrunk), fakeModel('x').run, 'feat/x')
    expect(r.error).toContain('no commit over origin/main')
  })

  test('proposeCommitSplit runs on the compose feature and returns a checked plan', async () => {
    const raw = fakeGit({
      'diff --cached --name-only': 'src/a.ts\n',
      'diff --name-only': 'src/b.ts\n',
      'diff --cached': 'A',
      'diff': 'B',
    })
    const m = fakeModel('=== COMMIT ===\nMESSAGE:\nfeat: a\nFILES:\nsrc/a.ts\nsrc/ghost.ts')
    const r = await proposeCommitSplit(raw, m.run)
    expect(m.calls[0].feature).toBe('compose')
    expect(r.groups).toEqual([{ message: 'feat: a', files: ['src/a.ts'] }])
    expect(r.unassigned).toEqual(['src/b.ts'])
    expect(r.invented).toEqual(['src/ghost.ts'])
  })

  test('one file is already one commit — no call, and it says why', async () => {
    const raw = fakeGit({ 'diff --cached --name-only': 'src/a.ts\n', 'diff --cached': 'A' })
    const m = fakeModel('never asked')
    expect((await proposeCommitSplit(raw, m.run)).error).toBe('One file is already one commit')
    expect(m.calls).toEqual([])
  })

  test('an unusable answer is an error, never an empty plan presented as one', async () => {
    const raw = fakeGit({
      'diff --cached --name-only': 'src/a.ts\n', 'diff --name-only': 'src/b.ts\n', 'diff --cached': 'A',
    })
    const r = await proposeCommitSplit(raw, fakeModel('I would split this into two commits.').run)
    expect(r.error).toBe('The model proposed no usable commit')
    expect(r.groups).toEqual([])
  })
})

/** A note store in memory, the shape both hosts wrap around their own. */
function fakeNotes(seed: NoteRecord[] = []) {
  let kept = [...seed]
  const store: NoteStore = {
    async all() { return kept },
    async get(kind, key) { return kept.find(n => n.kind === kind && n.key === key) ?? null },
    async set(record) {
      kept = [record, ...kept.filter(n => !(n.kind === record.kind && n.key === record.key))]
    },
    async forget(kind, key) { kept = kept.filter(n => !(n.kind === kind && n.key === key)) },
  }
  return { store, get kept() { return kept } }
}

describe('what the readings leave behind', () => {
  const withTrunk = {
    'remote': 'origin\n',
    'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main\n',
    'rev-parse --verify --quiet refs/remotes/origin/main': 'abc\n',
  }

  test('a branch reading is kept with the tip it describes', async () => {
    const raw = fakeGit({
      ...withTrunk,
      'log --reverse --format=%s origin/main..feat/x': 'first\n',
      'diff origin/main...feat/x': 'd',
      'rev-parse feat/x': 'aaa111\n',
    })
    const notes = fakeNotes()
    await explainBranch(raw, fakeModel('It adds a thing.').run, 'feat/x', { store: notes.store })
    expect(notes.kept).toEqual([expect.objectContaining({
      kind: 'branch', key: 'feat/x', title: 'feat/x', text: 'It adds a thing.', sha: 'aaa111',
    })])
  })

  test('a stash reading is keyed by its COMMIT, not by stash@{0}', async () => {
    // The index shifts under every push and pop; a note keyed by it would
    // follow whichever stash happens to be first afterwards.
    const raw = fakeGit({
      'log -1 --format=%s stash@{0}': 'WIP on main: abc\n',
      'stash show --include-untracked -p stash@{0}': 'the diff',
      'rev-parse stash@{0}': 'bbb222\n',
    })
    const notes = fakeNotes()
    await explainStash(raw, fakeModel('Parked work.').run, 0, { store: notes.store })
    expect(notes.kept[0]).toMatchObject({ kind: 'stash', key: 'bbb222', title: 'WIP on main: abc' })
  })

  test('the working tree is kept without a sha — it is stale the moment anything is typed', async () => {
    const raw = fakeGit({ 'diff --cached': 'A', 'diff --cached --name-only': 'a.ts\n' })
    const notes = fakeNotes()
    await explainWorking(raw, fakeModel('Half a logger.').run, { store: notes.store })
    expect(notes.kept[0]).toMatchObject({ kind: 'working', key: 'working', sha: '' })
  })

  test('a second reading of the same subject replaces the first', async () => {
    const raw = fakeGit({
      ...withTrunk, 'log --reverse --format=%s origin/main..feat/x': 'first\n',
      'diff origin/main...feat/x': 'd', 'rev-parse feat/x': 'aaa111\n',
    })
    const notes = fakeNotes()
    await explainBranch(raw, fakeModel('one').run, 'feat/x', { store: notes.store })
    await explainBranch(raw, fakeModel('two').run, 'feat/x', { store: notes.store })
    expect(notes.kept).toHaveLength(1)
    expect(notes.kept[0].text).toBe('two')
  })

  test('a refused reading leaves nothing behind', async () => {
    const raw = fakeGit(withTrunk)   // the branch carries nothing
    const notes = fakeNotes()
    await explainBranch(raw, fakeModel('never asked').run, 'feat/x', { store: notes.store })
    expect(notes.kept).toEqual([])
  })

  test('the list measures each note against what it stands for now', async () => {
    const notes = fakeNotes([
      { kind: 'branch', key: 'feat/x', title: 'feat/x', text: 'a', at: 2, sha: 'old111' },
      { kind: 'stash', key: 'gone999', title: 'WIP', text: 'b', at: 3, sha: 'gone999' },
      { kind: 'working', key: 'working', title: 'Uncommitted changes', text: 'c', at: 1, sha: '' },
    ])
    const raw = fakeGit({
      'rev-parse feat/x': 'new222\n',
      'rev-list --count old111..feat/x': '3\n',
    })
    const { entries } = await noteList(raw, notes.store)
    // newest first
    expect(entries.map(e => e.key)).toEqual(['gone999', 'feat/x', 'working'])
    expect(entries.find(e => e.key === 'feat/x')).toMatchObject({ newCommits: 3, orphan: false })
    // a dropped stash is orphaned, not deleted — the reading is still worth something
    expect(entries.find(e => e.key === 'gone999')).toMatchObject({ orphan: true })
    // the working tree is never "behind": it has nothing to be behind of
    expect(entries.find(e => e.key === 'working')).toMatchObject({ newCommits: 0, orphan: false })
  })
})

describe('what we put in which changelog', () => {
  // A repository that ships four products has four changelogs, and one change
  // belongs in more than one of them — so the memory is per FILE.
  const base: ChangelogRecord = {
    text: 'x', base: 'origin/main', headSha: 'a', baseSha: 'b', commits: 1, at: 0,
  }

  test('a record remembers each file separately', () => {
    let r = withInserted(base, 'CHANGELOG.md', ['- a', '- b'])
    r = withInserted(r, 'vscode-extension/CHANGELOG.md', ['- a'])
    expect(insertedIn(r, 'CHANGELOG.md')).toEqual(['- a', '- b'])
    expect(insertedIn(r, 'vscode-extension/CHANGELOG.md')).toEqual(['- a'])
    expect(insertedIn(r, 'cli/CHANGELOG.md')).toEqual([])
  })

  test('re-inserting into one file leaves the others alone', () => {
    let r = withInserted(base, 'CHANGELOG.md', ['- old'])
    r = withInserted(r, 'cli/CHANGELOG.md', ['- cli'])
    r = withInserted(r, 'CHANGELOG.md', ['- new'])
    expect(insertedIn(r, 'CHANGELOG.md')).toEqual(['- new'])
    expect(insertedIn(r, 'cli/CHANGELOG.md')).toEqual(['- cli'])
  })

  test('a record written before the list is read, not thrown away', () => {
    // The shape shipped as a single object first; a changelog inserted then
    // must still be replaceable rather than doubled.
    const legacy = { ...base, inserted: { path: 'CHANGELOG.md', lines: ['- old'], at: 1 } }
    expect(insertedIn(legacy, 'CHANGELOG.md')).toEqual(['- old'])
    expect(insertedIn(withInserted(legacy, 'cli/CHANGELOG.md', ['- cli']), 'CHANGELOG.md'))
      .toEqual(['- old'])
  })

  test('a record that has never been inserted answers with nothing', () => {
    expect(insertedIn(base, 'CHANGELOG.md')).toEqual([])
    expect(insertedIn(null, 'CHANGELOG.md')).toEqual([])
  })
})
