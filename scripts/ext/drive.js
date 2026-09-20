#!/usr/bin/env node
// Open the extension in a real VS Code and look at it — or drive it.
//
//   node scripts/ext/drive.js --repo /path/to/repo
//   node scripts/ext/drive.js --repo … --shot panel.png [--maximize]
//   node scripts/ext/drive.js --repo … --eval 'document.querySelectorAll(".cg-row").length'
//   node scripts/ext/drive.js --repo … --scenario scripts/ext/scenarios/branch-rows.js
//   node scripts/ext/drive.js --demo                 # build a demo repo first
//
// `--eval` runs in the extension's own frame, not in the editor's. `--keep`
// leaves the editor open (and its profile on disk) so it can be poked at by
// hand afterwards; without it everything is torn down, including the throwaway
// profile — the VS Code the user has open is never touched either way.
//
// See scripts/ext/lib/vscode.js for why a webview needs two frames to reach.
'use strict'
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { openPanel, ROOT } = require('./lib/vscode')

function parseArgs(argv) {
  const out = { repo: null, shot: null, eval: null, scenario: null, keep: false, demo: false, maximize: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--keep') out.keep = true
    else if (a === '--maximize') out.maximize = true
    else if (a === '--demo') out.demo = true
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
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 17).map(l => l.replace(/^\/\/ ?/, '')).join('\n'))
    return
  }
  const repo = args.demo || !args.repo ? makeDemoRepo() : path.resolve(args.repo)

  console.log(`· opening ${repo}`)
  const vs = await openPanel({ repo, keepProfile: args.keep, maximize: args.maximize })
  console.log('· the panel is up')

  try {
    if (args.scenario) {
      const scenario = require(path.resolve(args.scenario))
      await scenario(vs)
    } else if (args.eval) {
      const value = await vs.panel.eval(args.eval)
      console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
    } else {
      // Nothing asked for: say what is on screen, which is the first thing
      // anybody wants from a harness like this.
      const facts = await vs.panel.eval(`JSON.stringify({
        rows: document.querySelectorAll('.cg-row').length,
        branch: document.querySelector('.gvt-branch-name')?.textContent?.trim() ?? null,
        views: [...document.querySelectorAll('.gv-rail-btn')].map(b => b.getAttribute('aria-label')),
      })`)
      console.log(facts)
    }

    if (args.shot) {
      // From the WORKBENCH: it is the window, and the webview is drawn inside
      // it. A capture of the webview target alone comes back empty.
      const png = await vs.workbench.screenshot()
      fs.writeFileSync(path.resolve(args.shot), png)
      console.log(`· ${args.shot}`)
    }
  } finally {
    if (args.keep) console.log(`· left open — profile ${vs.profile}, log ${vs.logFile}`)
    else await vs.stop()
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1) })
