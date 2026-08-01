import * as fs from 'fs'
import * as path from 'path'
import { RELEASE_NOTES } from '../release-notes'

// A desktop release describes itself in two places, for two audiences:
//
//   CHANGELOG.md            the public log, and the body of the GitHub release
//   src/main/release-notes  the "What's new" tab, shown inside the app on the
//                           first launch after an update
//
// They are written at different moments and nothing tied them together, so the
// vocabulary lot landed a changelog entry and no in-app note at all. Nobody
// would have noticed until release day, when release.sh refuses to go on — or
// worse, until a user opened an empty tab.
//
// `release.sh` accepts `Unreleased` in both files and promotes it to the real
// number in the release commit. These tests only care that the two stay in step.

const ROOT = path.resolve(__dirname, '../../..')
const CHANGELOG = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8')

/** The body of a changelog section, blank-trimmed — '' when absent or empty. */
function section(heading: string): string {
  const lines = CHANGELOG.split('\n')
  const start = lines.findIndex(l => l.trim() === `## ${heading}`)
  if (start === -1) return ''
  const rest = lines.slice(start + 1)
  const end = rest.findIndex(l => l.startsWith('## '))
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim()
}

describe('release notes stay in step with the changelog', () => {
  test('an Unreleased changelog section has an Unreleased in-app note', () => {
    // The direction that actually broke: notes written in one file only.
    if (section('Unreleased')) {
      expect(Object.keys(RELEASE_NOTES)).toContain('Unreleased')
    }
  })

  test('an Unreleased in-app note has an Unreleased changelog section', () => {
    // The other direction, so neither file can be the lone one.
    if (RELEASE_NOTES['Unreleased'] !== undefined) {
      expect(section('Unreleased')).not.toBe('')
    }
  })

  test('every in-app note is non-empty and titled after its own key', () => {
    // `release.sh` rewrites the key and the title together when it promotes
    // Unreleased; a title naming a different version means one was hand-edited.
    for (const [version, body] of Object.entries(RELEASE_NOTES)) {
      expect({ version, empty: body.trim() === '' }).toEqual({ version, empty: false })
      expect({ version, title: body.split('\n')[0] })
        .toEqual({ version, title: `## What's new in ${version}` })
    }
  })

  test('every released version in the notes has its changelog section', () => {
    // A version shipped with an in-app note but no changelog entry would reach
    // the CI gate and fail there, after the branch is already on main.
    const missing = Object.keys(RELEASE_NOTES)
      .filter(v => v !== 'Unreleased')
      .filter(v => section(v) === '')
    expect(missing).toEqual([])
  })
})
