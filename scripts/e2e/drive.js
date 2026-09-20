#!/usr/bin/env node
// Open the desktop app on a repository and look at it — or drive it.
//
//   npm run app:drive -- --repo /path/to/repo
//   npm run app:drive -- --repo … --shot app.png
//   npm run app:drive -- --repo … --eval 'document.querySelectorAll(".cg-row").length'
//   npm run app:drive -- --repo … --scenario scripts/e2e/scenarios/branch-rows.js
//   npm run app:drive -- --demo                  # a demo repository, built for the occasion
//   npm run app:drive -- --repo … --keep         # leave it open to poke at by hand
//
// The twin of `npm run ext:drive`, which does this for the VS Code panel. Both
// exist because a feature is finished when it has been seen in the products,
// not when the suites are green: a unit test can pass over a component whose
// wiring gives it nothing.
//
// `npm run e2e` is the other thing entirely — the recorded journeys, with
// screenshot references. This one is for looking, one question at a time.
'use strict'
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { ROOT, ensureBuilt, makeProfile, launch, stopAndWait } = require('./lib/app')

function parseArgs(argv) {
  const out = { repo: null, shot: null, eval: null, scenario: null, keep: false, demo: false, build: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--keep') out.keep = true
    else if (a === '--demo') out.demo = true
    else if (a === '--build') out.build = true
    else if (a === '--repo') out.repo = argv[++i]
    else if (a === '--shot') out.shot = argv[++i]
    else if (a === '--eval') out.eval = argv[++i]
    else if (a === '--scenario') out.scenario = argv[++i]
    else if (a === '--help' || a === '-h') out.help = true
    else throw new Error(`unknown argument: ${a}`)
  }
  return out
}

/** A repository with branches, tags and merges — make-demo-repo.sh already builds one. */
function makeDemoRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-demo-'))
  fs.rmSync(dir, { recursive: true, force: true })
  console.log('· building a demo repository')
  execFileSync('bash', [path.join(ROOT, 'scripts', 'make-demo-repo.sh'), dir], { stdio: 'inherit' })
  return dir
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 18).map(l => l.replace(/^\/\/ ?/, '')).join('\n'))
    return
  }
  const repo = args.demo || !args.repo ? makeDemoRepo() : path.resolve(args.repo)
  ensureBuilt({ build: args.build })

  // Its own profile, seeded with this repository as the one to open: the app
  // someone has running is neither reused nor disturbed — the single-instance
  // lock is per userData.
  const profile = makeProfile([repo])
  const logFile = path.join(profile, 'app.log')
  console.log(`· opening ${repo}`)
  const { child, page } = await launch({ profile, logFile })

  try {
    await page.until(`!!document.querySelector('.app')`, { what: 'the window' })
    // The app opens on its WELCOME, with the profile's recents listed — it does
    // not reopen the last repository by itself. The first recent is the one
    // seeded above, so opening it is one click, the way a person starts.
    await page.until(`!!document.querySelector('.welcome-recent-item')`, { what: 'the welcome screen' })
    await page.click('.welcome-recent-item')
    await page.until(`!!document.querySelector('.cg-row, .sb-branch-item')`, { what: 'the repository', timeoutMs: 30000 })

    if (args.scenario) {
      await require(path.resolve(args.scenario))({ page, repo, profile })
    } else if (args.eval) {
      const value = await page.eval(args.eval)
      console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
    } else {
      console.log(await page.eval(`JSON.stringify({
        rows: document.querySelectorAll('.cg-row').length,
        branch: document.querySelector('.tb-branch-name, .sb-branch-item.current .sb-branch-name')?.textContent?.trim() ?? null,
        title: document.title,
      })`))
    }

    if (args.shot) {
      fs.writeFileSync(path.resolve(args.shot), await page.screenshot())
      console.log(`· ${args.shot}`)
    }
  } finally {
    if (args.keep) console.log(`· left open — profile ${profile}, log ${logFile}`)
    else { await stopAndWait(child); fs.rmSync(profile, { recursive: true, force: true }) }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1) })
