// How far behind the Electron we build on is, and a ratchet so it cannot get
// further behind without somebody saying so (#198).
//
// Electron supports the LATEST THREE MAJORS. Anything older gets no security
// fix — not for the Chromium in it, not for the Node in it — and the app ships
// a browser to every user who installs it. That is the whole reason this file
// exists: the version was never checked by anything, so it aged in silence.
//
//   node scripts/check-electron.js
//
// It compares the major in package.json with the registry's `latest`. A gap
// larger than TOLERATED is an error; a gap up to it is printed and passes.
// TOLERATED is a debt, written down: LOWER it as the upgrade happens, and do
// not raise it without meaning to. A registry that cannot be reached is not a
// failure — the network is not the thing under test.
'use strict'
const { execFileSync } = require('child_process')
const path = require('path')

/**
 * How many majors behind we currently are, and accept being.
 *
 * 12 on 2026-09-07: the app builds on Electron 32 (Chromium 128, August 2024)
 * and the current stable is 44. It is a real gap and it is not fixed here —
 * an Electron upgrade is its own change, with its own testing — but from now
 * on it cannot widen unnoticed.
 */
const TOLERATED = 12

const major = v => Number(String(v).replace(/^[^\d]*/, '').split('.')[0])

function latestStable() {
  try {
    return execFileSync('npm', ['view', 'electron', 'version'], {
      stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000,
    }).toString().trim()
  } catch {
    return null
  }
}

const pkg = require(path.join(__dirname, '..', 'package.json'))
const declared = pkg.devDependencies?.electron
if (!declared) {
  console.error('electron is not a devDependency of this package — nothing to check.')
  process.exit(1)
}
const ours = major(declared)
const latest = latestStable()
if (latest === null) {
  console.log(`· electron ${declared} — the registry could not be reached, so nothing was compared.`)
  process.exit(0)
}
const behind = major(latest) - ours

if (behind <= 0) {
  console.log(`✓ electron ${declared} is current (latest stable ${latest}).`)
  process.exit(0)
}
const supported = behind < 3
const line = `electron ${declared} is ${behind} major${behind > 1 ? 's' : ''} behind the current stable (${latest})`
if (behind > TOLERATED) {
  console.error(`✗ ${line} — more than the ${TOLERATED} written down in scripts/check-electron.js.`)
  console.error('  Upgrade, or raise TOLERATED on purpose and say why in the commit.')
  process.exit(1)
}
console.log(`${supported ? '·' : '!'} ${line}${supported ? '' : ', which is outside the three majors Electron supports: no security fixes.'}`)
console.log(`  Tolerated: ${TOLERATED}. Lower it in scripts/check-electron.js as the upgrade happens.`)
process.exit(0)
