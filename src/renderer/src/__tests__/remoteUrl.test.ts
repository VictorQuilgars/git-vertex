import { parseRemote, pickRemote, repoFromRemotes, remoteUrl, shortBranch, rangeFromSelection } from '../utils/remoteUrl'

// Before this existed, one URL shape was written out by hand in three places
// with github.com hardcoded, and nothing else in either product could be linked
// at all. These tests are the shape of what replaced it.

describe('parseRemote — the forms git actually hands out', () => {
  test('scp-like SSH, the default for a key-based clone', () => {
    expect(parseRemote('git@github.com:VictorQuilgars/git-vertex.git'))
      .toMatchObject({ host: 'github.com', owner: 'VictorQuilgars', repo: 'git-vertex', kind: 'github' })
  })

  test('explicit ssh:// scheme, with and without a port', () => {
    expect(parseRemote('ssh://git@github.com/o/r.git')).toMatchObject({ host: 'github.com', owner: 'o', repo: 'r' })
    expect(parseRemote('ssh://git@git.example.com:2222/o/r.git')).toMatchObject({ host: 'git.example.com', owner: 'o', repo: 'r' })
  })

  test('https, with or without .git, with or without credentials', () => {
    expect(parseRemote('https://github.com/o/r.git')).toMatchObject({ owner: 'o', repo: 'r' })
    expect(parseRemote('https://github.com/o/r')).toMatchObject({ owner: 'o', repo: 'r' })
    expect(parseRemote('https://user:tok@github.com/o/r.git')).toMatchObject({ host: 'github.com', owner: 'o', repo: 'r' })
  })

  test('a trailing slash does not become part of the name', () => {
    expect(parseRemote('https://github.com/o/r/')).toMatchObject({ repo: 'r' })
    expect(parseRemote('https://github.com/o/r.git/')).toMatchObject({ repo: 'r' })
  })

  // GitLab groups nest arbitrarily deep, so the owner cannot be just the first
  // segment — taking it that way would link to a repository that is not there.
  test('a nested GitLab group stays whole', () => {
    expect(parseRemote('git@gitlab.com:group/sub/team/proj.git'))
      .toMatchObject({ owner: 'group/sub/team', repo: 'proj', kind: 'gitlab' })
  })

  test('what it refuses rather than guess', () => {
    expect(parseRemote('/Users/victor/some/local/repo')).toBeNull()   // a path remote
    expect(parseRemote('https://github.com/lonely')).toBeNull()       // no repo name
    expect(parseRemote('')).toBeNull()
    expect(parseRemote(null)).toBeNull()
    expect(parseRemote(undefined)).toBeNull()
  })

  // Self-hosted GitHub Enterprise is far more common than a self-hosted
  // anything-else, so an unknown host reads as GitHub: a plausible link beats
  // none. Named hosts are still recognised on their own.
  test('host family', () => {
    expect(parseRemote('git@gitlab.example.com:o/r.git')!.kind).toBe('gitlab')
    expect(parseRemote('git@bitbucket.org:o/r.git')!.kind).toBe('bitbucket')
    expect(parseRemote('git@git.acme.internal:o/r.git')!.kind).toBe('github')
  })
})

describe('pickRemote', () => {
  const remotes = [
    { name: 'upstream', fetchUrl: 'git@github.com:up/r.git', pushUrl: '' },
    { name: 'origin', fetchUrl: 'git@github.com:me/r.git', pushUrl: '' },
  ]

  test('prefers the named default, then origin, then the first', () => {
    expect(pickRemote(remotes, 'upstream')!.name).toBe('upstream')
    expect(pickRemote(remotes)!.name).toBe('origin')
    expect(pickRemote([remotes[0]])!.name).toBe('upstream')
    expect(pickRemote([])).toBeNull()
  })

  test('a default that no longer exists falls back rather than failing', () => {
    expect(pickRemote(remotes, 'deleted')!.name).toBe('origin')
  })

  test('repoFromRemotes falls back to pushUrl when there is no fetch URL', () => {
    expect(repoFromRemotes([{ name: 'origin', fetchUrl: '', pushUrl: 'git@github.com:o/r.git' }]))
      .toMatchObject({ owner: 'o', repo: 'r' })
  })
})

describe('remoteUrl — GitHub, the one we actually use', () => {
  const r = parseRemote('git@github.com:VictorQuilgars/git-vertex.git')!

  test('repo, commit, branch', () => {
    expect(remoteUrl.repo(r)).toBe('https://github.com/VictorQuilgars/git-vertex')
    expect(remoteUrl.commit(r, 'abc123')).toBe('https://github.com/VictorQuilgars/git-vertex/commit/abc123')
    expect(remoteUrl.branch(r, 'main')).toBe('https://github.com/VictorQuilgars/git-vertex/tree/main')
  })

  // A slash in a branch name is a real path separator in every shape we build,
  // so encoding the whole ref would produce a 404 for the commonest naming
  // convention there is.
  test('a slashed branch keeps its slashes and encodes the rest', () => {
    expect(remoteUrl.branch(r, 'feat/lot h')).toBe('https://github.com/VictorQuilgars/git-vertex/tree/feat/lot%20h')
  })

  test('a remote-tracking name links to the branch, not to remotes/origin/…', () => {
    expect(remoteUrl.branch(r, 'remotes/origin/main')).toBe('https://github.com/VictorQuilgars/git-vertex/tree/main')
    expect(shortBranch('remotes/upstream/feat/x')).toBe('feat/x')
  })

  test('a file, with and without a line range', () => {
    const base = 'https://github.com/VictorQuilgars/git-vertex/blob/abc123/src/main/index.ts'
    expect(remoteUrl.file(r, 'abc123', 'src/main/index.ts')).toBe(base)
    expect(remoteUrl.file(r, 'abc123', 'src/main/index.ts', { from: 12, to: 12 })).toBe(`${base}#L12`)
    expect(remoteUrl.file(r, 'abc123', 'src/main/index.ts', { from: 12, to: 40 })).toBe(`${base}#L12-L40`)
  })

  // Selecting upwards in an editor gives an anchor line after the active one.
  test('a backwards selection still reads low to high', () => {
    expect(remoteUrl.file(r, 'abc123', 'a.ts', { from: 40, to: 12 }))
      .toBe('https://github.com/VictorQuilgars/git-vertex/blob/abc123/a.ts#L12-L40')
  })

  test('a leading slash on the path does not double up', () => {
    expect(remoteUrl.file(r, 'abc123', '/src/a.ts'))
      .toBe('https://github.com/VictorQuilgars/git-vertex/blob/abc123/src/a.ts')
  })

  test('comparison and pull request', () => {
    expect(remoteUrl.compare(r, 'main', 'feat/x'))
      .toBe('https://github.com/VictorQuilgars/git-vertex/compare/main...feat/x')
    expect(remoteUrl.pullRequest(r, 11)).toBe('https://github.com/VictorQuilgars/git-vertex/pull/11')
    expect(remoteUrl.issue(r, 42)).toBe('https://github.com/VictorQuilgars/git-vertex/issues/42')
  })
})

// Declared from each host's published shapes, not verified against a live
// instance — see the comment on SHAPES. Pinned so a change to them is a
// deliberate one.
describe('remoteUrl — the shapes we declare for other hosts', () => {
  const gl = parseRemote('git@gitlab.com:group/sub/proj.git')!
  const bb = parseRemote('git@bitbucket.org:team/proj.git')!

  test('GitLab puts everything under /-/ and spells ranges L12-40', () => {
    expect(remoteUrl.commit(gl, 'abc')).toBe('https://gitlab.com/group/sub/proj/-/commit/abc')
    expect(remoteUrl.file(gl, 'abc', 'a.ts', { from: 12, to: 40 }))
      .toBe('https://gitlab.com/group/sub/proj/-/blob/abc/a.ts#L12-40')
    expect(remoteUrl.pullRequest(gl, 7)).toBe('https://gitlab.com/group/sub/proj/-/merge_requests/7')
    expect(remoteUrl.issue(gl, 7)).toBe('https://gitlab.com/group/sub/proj/-/issues/7')
  })

  test('Bitbucket says commits, src, and lines-12:40', () => {
    expect(remoteUrl.commit(bb, 'abc')).toBe('https://bitbucket.org/team/proj/commits/abc')
    expect(remoteUrl.file(bb, 'abc', 'a.ts', { from: 12, to: 40 }))
      .toBe('https://bitbucket.org/team/proj/src/abc/a.ts#lines-12:40')
    expect(remoteUrl.pullRequest(bb, 7)).toBe('https://bitbucket.org/team/proj/pull-requests/7')
  })
})

// Editors count from 0 and end a selection exclusively once the caret wraps to
// the next line, which is what dragging down a column gives you. Taken at face
// value every such link covers one line too many.
describe('rangeFromSelection — the off-by-one', () => {
  test('a caret on one line links that line', () => {
    expect(rangeFromSelection(11, 11, 4)).toEqual({ from: 12, to: 12 })
  })

  test('a selection ending mid-line keeps that line', () => {
    expect(rangeFromSelection(11, 39, 7)).toEqual({ from: 12, to: 40 })
  })

  test('a selection wrapped to column 0 does NOT swallow the next line', () => {
    expect(rangeFromSelection(11, 40, 0)).toEqual({ from: 12, to: 40 })
  })

  // A triple-click selects one whole line and lands at column 0 of the next.
  test('a triple-clicked single line stays one line', () => {
    expect(rangeFromSelection(11, 12, 0)).toEqual({ from: 12, to: 12 })
  })

  test('column 0 on the SAME line is a caret, not a wrap', () => {
    expect(rangeFromSelection(11, 11, 0)).toEqual({ from: 12, to: 12 })
  })
})
