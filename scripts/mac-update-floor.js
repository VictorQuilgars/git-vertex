// Tell the update feed which macOS this build needs, so an update is not
// offered to a Mac that cannot run it.
//
// The app bundle declares `LSMinimumSystemVersion` (build.mac.minimumSystemVersion
// in package.json), which makes macOS refuse to OPEN a version it cannot run.
// That is one line too late for someone already running the app: the updater
// would have replaced their working copy with one the system then refuses to
// launch, and the old one is gone.
//
// electron-updater does have the guard — `AppUpdater.checkIfUpdateSupported()`
// reads `minimumSystemVersion` out of latest-mac.yml and compares it against
// `os.release()` — but electron-builder never writes that field: it puts
// `minimumSystemVersion` in the Info.plist and nowhere else. So we write it
// after packaging, into the file that was just uploaded.
//
// ⚠️ The value is a DARWIN KERNEL version, not the marketing one. Ventura is
// macOS 13 and Darwin 22, and `os.release()` on macOS 12 answers `21.x.y`.
// Writing "13.0" there would compare 21 against 13, block nothing at all, and
// leave everyone convinced the guard was in place — which is worse than not
// having it.
//
// It is the client ALREADY INSTALLED that runs this check, so the field
// protects the people who cannot be reached any other way: it works on
// versions shipped before this file existed (verified against the
// electron-updater inside 1.34.0).
//
//   node scripts/mac-update-floor.js dist/latest-mac.yml
//   node scripts/mac-update-floor.js dist/latest-mac.yml --macos 13.0
'use strict'
const fs = require('fs')
const path = require('path')

/**
 * macOS marketing version → Darwin major.
 *
 * A table rather than "+9", because that arithmetic stopped being true when
 * Apple went from macOS 15 to macOS 26: 15 is Darwin 24, 26 is Darwin 25. An
 * unknown version is an error here, not a guess — a wrong number in this field
 * silently disables the guard.
 */
const DARWIN_MAJOR = {
  11: 20,  // Big Sur
  12: 21,  // Monterey
  13: 22,  // Ventura
  14: 23,  // Sonoma
  15: 24,  // Sequoia
  26: 25,  // Tahoe — the year-based numbering starts here
}

/** The Darwin version to write for a macOS version like "13.0" or "13". */
function darwinFloor(macosVersion) {
  const major = Number(String(macosVersion).split('.')[0])
  const darwin = DARWIN_MAJOR[major]
  if (!darwin) {
    throw new Error(`no Darwin version known for macOS ${macosVersion} — add it to DARWIN_MAJOR in scripts/mac-update-floor.js (and check it: the +9 rule broke at macOS 26)`)
  }
  return `${darwin}.0.0`
}

/**
 * The yml with the floor in it, once. Idempotent: running twice, or on a file
 * electron-builder one day starts writing the field into, replaces the line
 * rather than adding a second one.
 */
function withFloor(yml, darwin) {
  const line = `minimumSystemVersion: ${darwin}`
  if (new RegExp(`^minimumSystemVersion:.*$`, 'm').test(yml)) {
    return yml.replace(/^minimumSystemVersion:.*$/m, line)
  }
  return yml.trimEnd() + '\n' + line + '\n'
}

module.exports = { DARWIN_MAJOR, darwinFloor, withFloor }

if (require.main === module) {
  const args = process.argv.slice(2)
  const file = args.find(a => !a.startsWith('--'))
  if (!file) {
    console.error('usage: node scripts/mac-update-floor.js <latest-mac.yml> [--macos 13.0]')
    process.exit(1)
  }
  const i = args.indexOf('--macos')
  const declared = i >= 0 && args[i + 1]
    ? args[i + 1]
    : require(path.join(__dirname, '..', 'package.json')).build?.mac?.minimumSystemVersion
  if (!declared) {
    console.error('build.mac.minimumSystemVersion is not set in package.json, and no --macos was given.')
    process.exit(1)
  }
  const darwin = darwinFloor(declared)
  const before = fs.readFileSync(file, 'utf8')
  const after = withFloor(before, darwin)
  fs.writeFileSync(file, after)
  console.log(`✓ ${path.basename(file)}: minimumSystemVersion ${darwin} (macOS ${declared}) — an older Mac will not be offered this update`)
}
