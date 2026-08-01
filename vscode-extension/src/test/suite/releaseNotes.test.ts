import * as assert from 'assert'
import * as fs from 'fs'
import * as path from 'path'
import { RELEASE_NOTES } from '../../releaseNotes'

// The extension twin of src/main/__tests__/release-notes.test.ts. It describes
// itself in two places, for two audiences:
//
//   vscode-extension/CHANGELOG.md    the public log, and what the Marketplace
//                                    shows on its Changelog tab
//   src/releaseNotes.ts              the "What's new" tab, opened in the editor
//                                    the first time a new version runs
//
// They are written at different moments, and on the desktop side nothing tied
// them together until a lot landed a changelog entry and no in-app note at all.
// The same trap exists here now that `scripts/products.sh` lists this file as
// the extension's P_NOTES: a release with no entry does not fail loudly, it
// opens the PREVIOUS version's note, which reads as if nothing shipped.
//
// `release.sh` accepts `Unreleased` in both files and promotes it to the real
// number in the release commit. These tests only care that the two stay in step.

const EXT_ROOT = path.resolve(__dirname, '../../..')
const CHANGELOG = fs.readFileSync(path.join(EXT_ROOT, 'CHANGELOG.md'), 'utf8')

/** The body of a changelog section, blank-trimmed — '' when absent or empty. */
function section(heading: string): string {
  const lines = CHANGELOG.split('\n')
  const start = lines.findIndex(l => l.trim() === `## ${heading}`)
  if (start === -1) return ''
  const rest = lines.slice(start + 1)
  const end = rest.findIndex(l => l.startsWith('## '))
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim()
}

/** Every `## X.Y.Z` heading in the changelog, Unreleased excluded. */
function changelogVersions(): string[] {
  return [...CHANGELOG.matchAll(/^## (\d+\.\d+\.\d+)\s*$/gm)].map(m => m[1])
}

suite('release notes stay in step with the changelog', () => {
  test('an Unreleased changelog section has an Unreleased in-app note', () => {
    // The direction that actually broke, on the desktop side.
    if (section('Unreleased')) {
      assert.ok(Object.keys(RELEASE_NOTES).includes('Unreleased'),
        'CHANGELOG.md has an ## Unreleased section but releaseNotes.ts has no Unreleased entry. '
        + 'A release cut from this state would open the previous version\'s note.')
    }
  })

  test('an Unreleased in-app note has an Unreleased changelog section', () => {
    if (RELEASE_NOTES['Unreleased'] !== undefined) {
      assert.notStrictEqual(section('Unreleased'), '',
        'releaseNotes.ts has an Unreleased entry and CHANGELOG.md has no ## Unreleased section.')
    }
  })

  test('every in-app note is non-empty and titled after its own key', () => {
    // `release.sh` rewrites the key and the title together when it promotes
    // Unreleased; a title naming a different version means one was hand-edited.
    for (const [version, body] of Object.entries(RELEASE_NOTES)) {
      assert.notStrictEqual(body.trim(), '', `${version}: the note is empty`)
      assert.strictEqual(body.split('\n')[0], `## What's new in ${version}`,
        `${version}: the note's title names a different version`)
    }
  })

  test('every released version in the notes has its changelog section', () => {
    const missing = Object.keys(RELEASE_NOTES)
      .filter(v => v !== 'Unreleased')
      .filter(v => section(v) === '')
    assert.deepStrictEqual(missing, [],
      `These versions have an in-app note and no changelog section: ${missing.join(', ')}`)
  })

  // The half the desktop's twin does NOT check, added here because backfilling
  // every past version is what this file was created for: a released version in
  // the changelog with no note is a version whose "What's new" silently falls
  // back to an older one.
  test('every released version in the changelog has an in-app note', () => {
    const missing = changelogVersions().filter(v => RELEASE_NOTES[v] === undefined)
    assert.deepStrictEqual(missing, [],
      `These versions are in CHANGELOG.md and have no in-app note: ${missing.join(', ')}`)
  })
})
