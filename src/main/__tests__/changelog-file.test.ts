import {
  mergeIntoChangelog, findChangelog, findChangelogs, isMergedInto, similarity,
  readShape, NEW_SECTION, CHANGELOG_CANDIDATES,
} from '../changelog-file'
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

describe('mergeIntoChangelog', () => {
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
    const r = mergeIntoChangelog(file, entry)
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
    const r = mergeIntoChangelog(file, '### Fixed\n- A bug.')
    expect(r.content).toContain('### Added\n- Something earlier.\n\n### Fixed\n- A bug.')
    expect(r.content).toContain('## 1.0.0')
  })

  test('never says the same thing twice — inserting an updated changelog over its own earlier insert', () => {
    const file = '# Changelog\n\n## Unreleased\n\n### Added\n- A first thing.\n'
    const r = mergeIntoChangelog(file, entry)
    expect(r.added).toBe(2)
    expect(r.content.match(/- A first thing\./g)).toHaveLength(1)
    expect(r.content).toContain('- A second thing.')
  })

  test('re-inserting the very same entry changes nothing', () => {
    const once = mergeIntoChangelog('# Changelog\n\n## Unreleased\n', entry)
    const twice = mergeIntoChangelog(once.content, entry)
    expect(twice.added).toBe(0)
    expect(twice.content).toBe(once.content)
  })

  test('no section for unreleased work: it writes nothing and asks', () => {
    // Inventing one on a file that keeps its changelog another way is
    // imposing a convention on somebody who chose a different one.
    const file = '# Changelog\n\n## 1.0.0\n\n### Added\n- The beginning.\n'
    const r = mergeIntoChangelog(file, '### Fixed\n- A bug.')
    expect(r.needsSection).toBe(true)
    expect(r.content).toBe(file)
    expect(r.shape?.sections.map(h => h.text)).toEqual(['1.0.0'])
  })

  test('told to make one, it makes one — above the newest section', () => {
    const file = '# Changelog\n\n## 1.0.0\n\n### Added\n- The beginning.\n'
    const r = mergeIntoChangelog(file, '### Fixed\n- A bug.', [], NEW_SECTION)
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

  test('told which section, it writes into that one', () => {
    const file = '# Changelog\n\n## 1.0.0\n\n### Added\n- The beginning.\n'
    const r = mergeIntoChangelog(file, '### Added\n- A thing.', [], '1.0.0')
    expect(r.content).toContain('### Added\n- The beginning.\n- A thing.')
  })

  test('a file with only a title gets the section under it, when asked', () => {
    const r = mergeIntoChangelog('# Changelog — Git Vertex\n', '### Added\n- A thing.', [], NEW_SECTION)
    expect(r.content).toBe('# Changelog — Git Vertex\n\n## Unreleased\n\n### Added\n- A thing.\n')
  })

  test('`## [Unreleased]` is the same section — the Keep a Changelog spelling', () => {
    const r = mergeIntoChangelog('# C\n\n## [Unreleased]\n\n### Added\n- Earlier.\n', entry)
    expect(r.sectionCreated).toBe(false)
    expect(r.content).toContain('## [Unreleased]')
    expect(r.content).toContain('- Earlier.\n- A first thing.')
  })

  test('no file at all is a whole file, written once', () => {
    const r = mergeIntoChangelog(null, entry)
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
    const r = mergeIntoChangelog('# C\n\n## Unreleased\n', 'Here is your changelog!\n\n### Added\n- A thing.')
    expect(r.content).not.toContain('Here is your changelog')
    expect(r.content).toContain('- A thing.')
  })

  test('an answer with no heading at all leaves the file exactly as it was', () => {
    const file = '# C\n\n## Unreleased\n\n### Added\n- Earlier.\n'
    const r = mergeIntoChangelog(file, 'I could not find anything to report.')
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
    const r = mergeIntoChangelog(file, entry)
    for (const line of file.split('\n').filter(l => l.trim())) {
      expect(r.content).toContain(line)
    }
  })
})

describe('findChangelog', () => {
  const raw = (out: string): Raw => async () => out

  test('the root one comes first, not the alphabetical one git answers with', () => {
    // `git ls-files` sorts, so a repository with a changelog per package
    // hands back `cli/CHANGELOG.md` above the root one. Depth is the order a
    // person reads them in.
    return expect(findChangelog(raw('cli/CHANGELOG.md\nCHANGELOG.md\nvscode-extension/CHANGELOG.md\n')))
      .resolves.toBe('CHANGELOG.md')
  })

  test('a changelog per product is found — every one of them', async () => {
    // The bug this replaced: exact pathspecs meant `git ls-files -- CHANGELOG.md`
    // never matched `vscode-extension/CHANGELOG.md`, so a repository shipping
    // four products found one changelog and wrote into it without asking.
    expect(await findChangelogs(raw('CHANGELOG.md\ncli/CHANGELOG.md\nmcp/CHANGELOG.md\nvscode-extension/CHANGELOG.md\n')))
      .toEqual(['CHANGELOG.md', 'cli/CHANGELOG.md', 'mcp/CHANGELOG.md', 'vscode-extension/CHANGELOG.md'])
  })

  test('a nested one counts, and is the answer when it is the only one', async () => {
    expect(await findChangelog(raw('docs/CHANGELOG.md\n'))).toBe('docs/CHANGELOG.md')
  })

  test('no tracked changelog is null, not a guess', async () => {
    expect(await findChangelog(raw(''))).toBeNull()
    expect(await findChangelog(async () => { throw new Error('not a repo') })).toBeNull()
  })

  test('the candidates match at any depth — that is what the star is for', () => {
    expect(CHANGELOG_CANDIDATES[0]).toBe('*CHANGELOG.md')
    expect(CHANGELOG_CANDIDATES).toContain('*HISTORY.md')
    // Every one of them, or a nested changelog under that name is invisible.
    expect(CHANGELOG_CANDIDATES.every(c => c.startsWith('*'))).toBe(true)
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

describe('what the reader is shown before anything is written', () => {
  test('the merge reports the lines it would add, one by one', () => {
    const r = mergeIntoChangelog('# C\n\n## Unreleased\n\n### Added\n- Earlier.\n', entry)
    expect(r.addedLines).toEqual(['- A first thing.', '- A second thing.', '- A bug.'])
  })

  test('and the ones it skipped, so "3 added" is not mistaken for "3 of 3"', () => {
    const r = mergeIntoChangelog('# C\n\n## Unreleased\n\n### Added\n- A first thing.\n', entry)
    expect(r.skipped).toEqual(['- A first thing.'])
    expect(r.addedLines).toEqual(['- A second thing.', '- A bug.'])
  })

  test('a line that says the same thing in other words is REPORTED, never dropped', () => {
    // The case that prompted this: a changelog generated once, the file
    // edited by hand meanwhile, and the insert quietly doubling every entry
    // in slightly different wording. Dropping on a judgement loses work; the
    // judgement goes to the reader instead.
    const file = '# C\n\n## Unreleased\n\n### Added\n- Added a caching layer for parsed results.\n'
    const r = mergeIntoChangelog(file, '### Added\n- A caching layer that stores parsed results.')
    expect(r.similar).toEqual([{
      line: '- A caching layer that stores parsed results.',
      existing: '- Added a caching layer for parsed results.',
    }])
    // still added — it is a warning, not a filter
    expect(r.addedLines).toHaveLength(1)
  })

  test('two bullets about different things are not called similar', () => {
    const file = '# C\n\n## Unreleased\n\n### Added\n- Added a retry helper for flaky requests.\n'
    const r = mergeIntoChangelog(file, '### Added\n- A debounce helper for noisy callers.')
    expect(r.similar).toEqual([])
  })
})

describe('similarity', () => {
  test('measures what two bullets are about, not how they are punctuated', () => {
    expect(similarity(
      '- Added a `cache` API that stores values by key.',
      '- A cache API to store values under a key',
    )).toBeGreaterThan(0.6)
  })

  test('two unrelated bullets share nothing', () => {
    expect(similarity('- Added a retry helper.', '- Fixed the splash halo on macOS.')).toBeLessThan(0.2)
  })

  test('an empty line matches nothing, rather than everything', () => {
    expect(similarity('', '- Anything at all')).toBe(0)
  })
})

describe('inserting the same changelog twice, regenerated', () => {
  // The case that has no other answer: regenerating rewords everything, so a
  // second insert would leave two differently-worded copies of one release
  // and no verbatim check would catch it. The lines we wrote are remembered,
  // and a later insert takes them back out.
  const first = '### Added\n- Added a cache API.\n- Added a retry helper.'
  const reworded = '### Added\n- A caching layer, keyed by string.\n- A retry helper that gives up after three tries.'

  const fileAfterFirst = () => {
    const r = mergeIntoChangelog('# C\n\n## Unreleased\n', first)
    return { content: r.content, ours: r.ours }
  }

  test('the reworded entry replaces what we wrote, it does not join it', () => {
    const { content, ours } = fileAfterFirst()
    const r = mergeIntoChangelog(content, reworded, ours)
    expect(r.removed).toEqual(['- Added a cache API.', '- Added a retry helper.'])
    expect(r.addedLines).toEqual(['- A caching layer, keyed by string.', '- A retry helper that gives up after three tries.'])
    expect(r.content).not.toContain('- Added a cache API.')
    expect(r.content).toContain('- A caching layer, keyed by string.')
    // and the section holds two lines, not four
    expect(r.content.split('\n').filter(l => l.startsWith('- '))).toHaveLength(2)
  })

  test('a line the regeneration says again stays where it is', () => {
    const { content, ours } = fileAfterFirst()
    const r = mergeIntoChangelog(content, '### Added\n- Added a cache API.\n- Something new.', ours)
    expect(r.removed).toEqual(['- Added a retry helper.'])
    expect(r.ours).toEqual(['- Added a cache API.', '- Something new.'])
  })

  test('a line of ours that was edited by hand is left alone, and said so', () => {
    // We wrote it once; we do not own it for ever.
    const { ours } = fileAfterFirst()
    const edited = '# C\n\n## Unreleased\n\n### Added\n- Added a cache API, keyed by string (see #12).\n- Added a retry helper.\n'
    const r = mergeIntoChangelog(edited, reworded, ours)
    expect(r.missing).toEqual(['- Added a cache API.'])
    expect(r.content).toContain('- Added a cache API, keyed by string (see #12).')
    expect(r.removed).toEqual(['- Added a retry helper.'])
  })

  test('lines a release moved out of Unreleased are not hunted down', () => {
    const released = `# C

## Unreleased

## 1.0.0

### Added
- Added a cache API.
`
    const r = mergeIntoChangelog(released, reworded, ['- Added a cache API.'])
    expect(r.missing).toEqual(['- Added a cache API.'])
    expect(r.removed).toEqual([])
    // the released section is untouched
    expect(r.content).toContain('## 1.0.0\n\n### Added\n- Added a cache API.')
  })

  test('a line that was already there and merely matches is never claimed as ours', () => {
    // Claiming it would delete someone else's line on the next round.
    const file = '# C\n\n## Unreleased\n\n### Added\n- A hand-written line.\n'
    const r = mergeIntoChangelog(file, '### Added\n- A hand-written line.\n- Ours.', [])
    expect(r.ours).toEqual(['- Ours.'])
    expect(r.skipped).toEqual(['- A hand-written line.'])
  })

  test('with no memory of a previous insert it behaves exactly as it always did', () => {
    const { content } = fileAfterFirst()
    const r = mergeIntoChangelog(content, reworded)
    expect(r.removed).toEqual([])
    expect(r.content.split('\n').filter(l => l.startsWith('- '))).toHaveLength(4)
  })
})

describe('the shapes a changelog actually comes in', () => {
  test('a title over releases: the releases are one level down', () => {
    const shape = readShape('# Changelog\n\n## 1.4.0\n\n### Added\n- x\n\n## 1.3.0\n')
    expect(shape).toMatchObject({ level: 2, groupLevel: 3 })
    expect(shape.sections.map(h => h.text)).toEqual(['1.4.0', '1.3.0'])
  })

  test('no title, releases at the top level', () => {
    // `# 1.4.0` is a release, not a title — which is why the title test asks
    // what the heading SAYS and not merely where it sits.
    const shape = readShape('# 1.4.0\n\n## Added\n- x\n\n# 1.3.0\n')
    expect(shape).toMatchObject({ level: 1, groupLevel: 2 })
    expect(shape.sections.map(h => h.text)).toEqual(['1.4.0', '1.3.0'])
  })

  test('one section and a title is still a title', () => {
    expect(readShape('# Changelog\n\n## Unreleased\n\n### Added\n- x\n')).toMatchObject({ level: 2 })
  })

  test('a single release, no title', () => {
    expect(readShape('## 1.0.0\n\n### Added\n- x\n')).toMatchObject({ level: 2 })
  })

  test('a file with no headings falls back to what every template uses', () => {
    expect(readShape('just some prose\n')).toMatchObject({ level: 2, sections: [] })
  })

  test('a heading inside a fenced block is not a heading', () => {
    const shape = readShape('# Changelog\n\n## 1.0.0\n\n```md\n## Not a section\n```\n')
    expect(shape.sections.map(h => h.text)).toEqual(['1.0.0'])
  })

  test('the section for unreleased work is found under the names it goes by', () => {
    for (const name of ['Unreleased', '[Unreleased]', 'UNRELEASED', 'Next', 'Upcoming',
      'master', 'HEAD', 'À paraître', 'Non publié', 'In progress']) {
      const shape = readShape(`# C\n\n## ${name}\n\n## 1.0.0\n`)
      expect({ name, found: !!shape.unreleased }).toEqual({ name, found: true })
    }
  })

  test('a dated or linked heading is read for its name', () => {
    expect(readShape('# C\n\n## [Unreleased] - ReleaseDate\n\n## 1.0.0\n').unreleased).toBeTruthy()
    expect(readShape('# C\n\n## [1.4.0](https://x/y) — 2026-01-01\n\n## 1.3.0\n')
      .sections.map(h => h.text)).toEqual(['1.4.0', '1.3.0'])
  })

  test('a release is not mistaken for unreleased work', () => {
    expect(readShape('# C\n\n## 1.4.0\n\n## 1.3.0\n').unreleased).toBeNull()
  })
})

describe('following the file rather than a template', () => {
  test("the entry's own headings are re-levelled to sit inside the section", () => {
    // A file whose releases are `#` wants its groups at `##`, not at `###`.
    const file = '# Next\n\n## Added\n- Earlier.\n\n# 1.0.0\n'
    const r = mergeIntoChangelog(file, '### Added\n- A thing.')
    expect(r.content).toContain('## Added\n- Earlier.\n- A thing.')
    expect(r.content).not.toContain('### Added')
  })

  test('a created section is made at the file\'s own level too', () => {
    const file = '# 1.0.0\n\n## Added\n- The beginning.\n'
    const r = mergeIntoChangelog(file, '### Fixed\n- A bug.', [], NEW_SECTION)
    expect(r.content.startsWith('# Unreleased\n\n## Fixed\n- A bug.')).toBe(true)
  })

  test('a section under another name takes the entry without being renamed', () => {
    const file = '# C\n\n## Next\n\n### Added\n- Earlier.\n\n## 1.0.0\n'
    const r = mergeIntoChangelog(file, '### Added\n- A thing.')
    expect(r.needsSection).toBeUndefined()
    expect(r.content).toContain('## Next\n\n### Added\n- Earlier.\n- A thing.')
  })
})
