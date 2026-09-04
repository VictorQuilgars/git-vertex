import { mergeIntoUnreleased, findChangelog, findChangelogs, isMergedInto, CHANGELOG_CANDIDATES } from '../changelog-file'
import type { Raw } from '../ai-material'

// This module edits a file the user did not open. The only thing that makes
// that acceptable is that it never removes a line, so that is what these
// check — that, and the second `### Added` three lines under the first, which
// is what a naive "paste at the top" would produce every single time.

const entry = `### Added
- A first thing.
- A second thing.

### Fixed
- A bug.`

describe('mergeIntoUnreleased', () => {
  test('adds under the headings the section already has', () => {
    const file = `# Changelog

## Unreleased

### Added
- Something earlier.

### Fixed
- An earlier bug.

## 1.0.0

### Added
- The beginning.
`
    const r = mergeIntoUnreleased(file, entry)
    expect(r.added).toBe(3)
    expect(r.content).toBe(`# Changelog

## Unreleased

### Added
- Something earlier.
- A first thing.
- A second thing.

### Fixed
- An earlier bug.
- A bug.

## 1.0.0

### Added
- The beginning.
`)
  })

  test('a heading the section lacks is appended, not merged into another', () => {
    const file = '# Changelog\n\n## Unreleased\n\n### Added\n- Something earlier.\n\n## 1.0.0\n'
    const r = mergeIntoUnreleased(file, '### Fixed\n- A bug.')
    expect(r.content).toContain('### Added\n- Something earlier.\n\n### Fixed\n- A bug.')
    expect(r.content).toContain('## 1.0.0')
  })

  test('never says the same thing twice — inserting an updated changelog over its own earlier insert', () => {
    const file = '# Changelog\n\n## Unreleased\n\n### Added\n- A first thing.\n'
    const r = mergeIntoUnreleased(file, entry)
    expect(r.added).toBe(2)
    expect(r.content.match(/- A first thing\./g)).toHaveLength(1)
    expect(r.content).toContain('- A second thing.')
  })

  test('re-inserting the very same entry changes nothing', () => {
    const once = mergeIntoUnreleased('# Changelog\n\n## Unreleased\n', entry)
    const twice = mergeIntoUnreleased(once.content, entry)
    expect(twice.added).toBe(0)
    expect(twice.content).toBe(once.content)
  })

  test('no Unreleased section: one is opened above the topmost release', () => {
    const file = '# Changelog\n\n## 1.0.0\n\n### Added\n- The beginning.\n'
    const r = mergeIntoUnreleased(file, '### Fixed\n- A bug.')
    expect(r.sectionCreated).toBe(true)
    expect(r.content).toBe(`# Changelog

## Unreleased

### Fixed
- A bug.

## 1.0.0

### Added
- The beginning.
`)
  })

  test('a file with only a title gets the section under it', () => {
    const r = mergeIntoUnreleased('# Changelog — Git Vertex\n', '### Added\n- A thing.')
    expect(r.content).toBe('# Changelog — Git Vertex\n\n## Unreleased\n\n### Added\n- A thing.\n')
  })

  test('`## [Unreleased]` is the same section — the Keep a Changelog spelling', () => {
    const r = mergeIntoUnreleased('# C\n\n## [Unreleased]\n\n### Added\n- Earlier.\n', entry)
    expect(r.sectionCreated).toBe(false)
    expect(r.content).toContain('## [Unreleased]')
    expect(r.content).toContain('- Earlier.\n- A first thing.')
  })

  test('no file at all is a whole file, written once', () => {
    const r = mergeIntoUnreleased(null, entry)
    expect(r.created).toBe(true)
    expect(r.content).toBe(`# Changelog

## Unreleased

### Added
- A first thing.
- A second thing.

### Fixed
- A bug.
`)
  })

  test('a preamble the model was told not to write is dropped, never committed', () => {
    const r = mergeIntoUnreleased('# C\n\n## Unreleased\n', 'Here is your changelog!\n\n### Added\n- A thing.')
    expect(r.content).not.toContain('Here is your changelog')
    expect(r.content).toContain('- A thing.')
  })

  test('an answer with no heading at all leaves the file exactly as it was', () => {
    const file = '# C\n\n## Unreleased\n\n### Added\n- Earlier.\n'
    const r = mergeIntoUnreleased(file, 'I could not find anything to report.')
    expect(r.content).toBe(file)
    expect(r.added).toBe(0)
  })

  test('nothing is ever removed', () => {
    const file = `# Changelog

Some prose about how this file works.

## Unreleased

### Added
- Earlier.

<!-- a comment that must survive -->

## 1.0.0
- The beginning.
`
    const r = mergeIntoUnreleased(file, entry)
    for (const line of file.split('\n').filter(l => l.trim())) {
      expect(r.content).toContain(line)
    }
  })
})

describe('findChangelog', () => {
  const raw = (out: string): Raw => async () => out

  test('asks in our order, not the alphabetical one git answers in', () => {
    // `git ls-files` sorts, so a repository with both would hand back
    // CHANGES.md first — and CHANGELOG.md is the changelog.
    return expect(findChangelog(raw('CHANGES.md\nCHANGELOG.md\n'))).resolves.toBe('CHANGELOG.md')
  })

  test('a nested one counts', async () => {
    expect(await findChangelog(raw('docs/CHANGELOG.md\n'))).toBe('docs/CHANGELOG.md')
  })

  test('no tracked changelog is null, not a guess', async () => {
    expect(await findChangelog(raw(''))).toBeNull()
    expect(await findChangelog(async () => { throw new Error('not a repo') })).toBeNull()
  })

  test('the candidates are the conventional names, most specific first', () => {
    expect(CHANGELOG_CANDIDATES[0]).toBe('CHANGELOG.md')
    expect(CHANGELOG_CANDIDATES).toContain('HISTORY.md')
  })
})

describe('the two things insertion refuses to decide alone', () => {
  test('a repository with several changelogs hands back all of them', async () => {
    // A monorepo has one per package, and writing into the first would put
    // the desktop app's release notes in the CLI's changelog.
    const raw = (async () => 'docs/CHANGELOG.md\nCHANGELOG.md\n') as any
    expect(await findChangelogs(raw)).toEqual(['CHANGELOG.md', 'docs/CHANGELOG.md'])
  })

  test('a path git does not track is not in the list', async () => {
    const raw = (async () => '') as any
    expect(await findChangelogs(raw)).toEqual([])
  })

  test('a branch with nothing its base lacks is already in it', async () => {
    const none = (async () => '0\n') as any
    expect(await isMergedInto(none, 'feat/x', 'origin/main')).toBe(true)
  })

  test('a branch that still carries commits is not merged', async () => {
    const three = (async () => '3\n') as any
    expect(await isMergedInto(three, 'feat/x', 'origin/main')).toBe(false)
  })

  test('it counts, it does not read an exit code — the trap this walked into', async () => {
    // `merge-base --is-ancestor` prints nothing and answers by exiting;
    // simple-git resolves a silent non-zero exit, so "no" came back as "yes"
    // and EVERY branch read as already merged. An empty answer is not a zero.
    const silent = (async () => '') as any
    expect(await isMergedInto(silent, 'feat/x', 'origin/main')).toBe(false)
  })

  test('a question git cannot answer is not a yes', async () => {
    const boom = (async () => { throw new Error('unrelated histories') }) as any
    expect(await isMergedInto(boom, 'feat/x', 'origin/main')).toBe(false)
  })
})
