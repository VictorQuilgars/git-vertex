#!/usr/bin/env node
// Every scenario, against the extension in a real VS Code — one editor, one
// repository, one report.
//
//   npm run ext:test              # all of them
//   npm run ext:test -- --only branch-rows
//   npm run ext:test -- --keep    # leave the editor open on a failure
//
// This is the guarding half; `npm run ext:drive` is the looking half. The
// desktop's equivalent is `npm run e2e`, which has been in CI since it was
// written — a harness that does not run rots, and this repository has the
// receipt: scripts/e2e/compact-panel.cjs sat broken on main from #243 until
// somebody happened to run it.
//
// One editor for the lot: launching VS Code is ~8s, and a scenario is under
// two. They run in order and a failure does not stop the next one, so one run
// says everything that is wrong rather than the first thing.
'use strict'
const { execFileSync, spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { openPanel, ROOT } = require('./lib/vscode')

const SCENARIOS = ['host-answers', 'commands', 'branch-rows', 'branch-create']

// Linux without a display: xvfb gives the editor somewhere to paint. The same
// re-run the desktop suite does, so neither needs anything in the workflow.
if (process.platform === 'linux' && !process.env.DISPLAY && !process.argv.includes('--no-xvfb')) {
  if (spawnSync('which', ['xvfb-run']).status !== 0) {
    console.error('no DISPLAY and no xvfb-run: install xvfb (apt-get install -y xvfb) or set DISPLAY')
    process.exit(2)
  }
  const r = spawnSync('xvfb-run', ['-a', '-s', '-screen 0 1600x1000x24',
    process.execPath, __filename, ...process.argv.slice(2), '--no-xvfb'], { stdio: 'inherit' })
  process.exit(r.status ?? 1)
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-ext-'))
  fs.rmSync(dir, { recursive: true, force: true })
  execFileSync('bash', [path.join(ROOT, 'scripts', 'make-demo-repo.sh'), dir], { stdio: ['ignore', 'ignore', 'inherit'] })
  return dir
}

async function main() {
  const argv = process.argv.slice(2)
  const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null
  const keep = argv.includes('--keep')
  const names = only ? SCENARIOS.filter(n => n.includes(only)) : SCENARIOS
  if (!names.length) throw new Error(`no scenario matches "${only}" — have: ${SCENARIOS.join(', ')}`)

  const repo = makeRepo()
  console.log(`· ${names.length} scenario${names.length > 1 ? 's' : ''}, on a demo repository`)
  // Maximised: a short panel keeps half the rail behind "More…", and a
  // scenario should be reading the product, not working around the window.
  const vs = await openPanel({ repo, maximize: true, keepProfile: keep })

  const failed = []
  try {
    for (const name of names) {
      const scenario = require(path.join(ROOT, 'scripts', 'scenarios', `${name}.js`))
      process.exitCode = 0
      const started = Date.now()
      try {
        await scenario({ ...vs, repo })
        if (process.exitCode) failed.push(name)
        else console.log(`  ✓ ${name}  ${Date.now() - started}ms`)
      } catch (e) {
        console.error(`  ✗ ${name}: ${e.message}`)
        failed.push(name)
      }
    }
  } finally {
    if (keep && failed.length) console.log(`· left open — profile ${vs.profile}, log ${vs.logFile}`)
    else await vs.stop()
    fs.rmSync(repo, { recursive: true, force: true })
  }

  process.exitCode = failed.length ? 1 : 0
  console.log('')
  console.log(failed.length
    ? `✗ ${failed.length} of ${names.length} failed: ${failed.join(', ')}`
    : `✓ ${names.length} scenarios, all green`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
