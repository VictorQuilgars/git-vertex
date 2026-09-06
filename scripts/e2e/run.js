#!/usr/bin/env node
// The end-to-end suite: the built app, driven over the Chrome DevTools
// Protocol on a throwaway profile, through the journeys the audit reproduced
// by hand. No display is needed — on Linux it re-runs itself under xvfb.
//
//   npm run e2e              run every journey (builds if out/ is missing)
//   npm run e2e -- --build   rebuild first
//   npm run e2e -- --update  record the screenshots as the references
//
// A journey is a file in ./journeys exporting { name, run(ctx) }. They run in
// order, in one window; a failure is reported and the next one still runs, so
// one run says everything that is wrong. Screenshots go to ./out; when a
// reference exists in ./references it is compared with a tolerance.
'use strict'
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { ensureBuilt, makeProfile, launch, stop } = require('./lib/app')
const { makeFixture } = require('./lib/fixture')
const { decode, differ } = require('./lib/png')
const { expect, E2EFailure } = require('./lib/assert')

const args = new Set(process.argv.slice(2))
const OUT = path.join(__dirname, 'out')
// A reference is a platform's: text is not rasterised the same on macOS and
// on the Linux runner, and a tolerance that let that through would let a
// regression through too.
const REFS = path.join(__dirname, 'references', process.platform)
const TOLERANCE = 0.005   // half a percent of pixels may differ: anti-aliasing, a cursor

// Linux without a display: xvfb gives the window somewhere to paint.
if (process.platform === 'linux' && !process.env.DISPLAY && !args.has('--no-xvfb')) {
  const has = spawnSync('which', ['xvfb-run']).status === 0
  if (!has) { console.error('no DISPLAY and no xvfb-run: install xvfb (apt-get install -y xvfb) or set DISPLAY'); process.exit(2) }
  const r = spawnSync('xvfb-run', ['-a', '-s', '-screen 0 1600x1000x24', process.execPath, __filename, ...process.argv.slice(2), '--no-xvfb'], { stdio: 'inherit' })
  process.exit(r.status ?? 1)
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  ensureBuilt({ build: args.has('--build') })
  const fixture = makeFixture()
  const profile = makeProfile([fixture.repo1, fixture.repo2])
  const logFile = path.join(OUT, 'app.log')
  console.log(`· profile ${profile}\n· repositories ${fixture.root}`)
  const { child, page } = await launch({ profile, logFile })
  const failures = []
  const notes = []

  // A screenshot is taken once the window has stopped changing: the sidebar's
  // counts and the graph's rows arrive over several loads, and a capture in
  // the middle of them is a picture of a moment, not of the layout.
  const settled = async () => {
    let last = await page.screenshot()
    if (!last) return null
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 250))
      const next = await page.screenshot()
      if (!next) return last
      if (differ(decode(last), decode(next)).ratio === 0) return next
      last = next
    }
    return last
  }
  const snapshot = async (name) => {
    const png = await settled()
    if (!png) { notes.push(`${name}: no screenshot (the window could not be painted — hidden?)`); return }
    fs.writeFileSync(path.join(OUT, `${name}.png`), png)
    const ref = path.join(REFS, `${name}.png`)
    if (args.has('--update')) { fs.mkdirSync(REFS, { recursive: true }); fs.writeFileSync(ref, png); notes.push(`${name}: reference recorded`); return }
    if (!fs.existsSync(ref)) { notes.push(`${name}: no reference yet (run with --update to record one)`); return }
    const d = differ(decode(fs.readFileSync(ref)), decode(png))
    if (d.ratio > TOLERANCE) throw new E2EFailure(`${name}: ${(d.ratio * 100).toFixed(2)}% of pixels differ from the reference${d.reason ? ` (${d.reason})` : ''} — see ${path.relative(process.cwd(), path.join(OUT, name + '.png'))}`)
    notes.push(`${name}: matches the reference (${(d.ratio * 100).toFixed(2)}% differ)`)
  }

  // A failed journey may leave a menu or a dialog open; Escape closes either
  // before the next one starts. A journey that fails is given one more go —
  // a real regression fails twice, a lost keystroke does not — and a pass on
  // the second go is said out loud, so a flaky journey is not a silent one.
  const reset = async () => { await page.press('Escape'); await page.press('Escape') }
  const files = fs.readdirSync(path.join(__dirname, 'journeys')).filter(f => f.endsWith('.js')).sort()
  for (const file of files) {
    const journey = require(path.join(__dirname, 'journeys', file))
    const t0 = Date.now()
    let error = null
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await journey.run({ page, expect, fixture, snapshot })
        console.log(`${attempt === 1 ? '✓' : '✓ (on the second go)'} ${journey.name} (${Date.now() - t0}ms)`)
        error = null
        break
      } catch (e) {
        error = e
        const png = await page.screenshot()
        if (png) fs.writeFileSync(path.join(OUT, `failure-${file.replace(/\.js$/, '')}${attempt === 1 ? '' : '-retry'}.png`), png)
        await reset()
      }
    }
    if (error) { failures.push({ journey: journey.name, error }); console.log(`✗ ${journey.name}\n    ${error.message}`) }
  }
  for (const n of notes) console.log(`  · ${n}`)
  if (page.exceptions.length) { failures.push({ journey: 'the window', error: new Error('uncaught exceptions: ' + page.exceptions.join(' | ')) }); console.log(`✗ uncaught exceptions in the window:\n    ${page.exceptions.join('\n    ')}`) }
  if (page.consoleErrors.length) console.log(`  · console errors (not failures):\n    ${page.consoleErrors.join('\n    ')}`)
  page.close()
  stop(child)
  fs.rmSync(fixture.root, { recursive: true, force: true })
  fs.rmSync(profile, { recursive: true, force: true })
  console.log(failures.length ? `\n${failures.length} of ${files.length} journeys failed` : `\n${files.length} journeys passed`)
  process.exit(failures.length ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
