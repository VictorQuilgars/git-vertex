#!/usr/bin/env node
// Runs the part of the extension suite that needs no VS Code and no display.
//
// `npm test` launches a real VS Code via @vscode/test-electron, so it cannot
// run on a headless release runner — which is why the release gate only
// compiled (see scripts/products.sh) and why the host-parity guard, written
// precisely to catch a method drifting out of the extension host, never ran
// against a release. getDefaultBranch reached the panel as "not-implemented"
// that way: the test was red for two releases and nothing looked at it.
//
// A test is picked up here when its SOURCE never imports `vscode`. That is the
// only thing that stops it from running in plain node, and deriving it from the
// source means a new pure test is included without touching this file.
const fs = require('fs')
const path = require('path')
const Mocha = require('mocha')

const EXT_ROOT = path.resolve(__dirname, '..')
const SRC_SUITE = path.join(EXT_ROOT, 'src', 'test', 'suite')
const OUT_SUITE = path.join(EXT_ROOT, 'out', 'test', 'suite')

if (!fs.existsSync(OUT_SUITE)) {
  console.error('out/test/suite is missing — run `npm run compile` first.')
  process.exit(1)
}

const pure = fs.readdirSync(SRC_SUITE)
  .filter(f => f.endsWith('.test.ts'))
  .filter(f => !/from ['"]vscode['"]/.test(fs.readFileSync(path.join(SRC_SUITE, f), 'utf8')))
  .map(f => f.replace(/\.ts$/, '.js'))
  .filter(f => fs.existsSync(path.join(OUT_SUITE, f)))

if (pure.length === 0) {
  console.error('No display-free tests found. Did the compile output move?')
  process.exit(1)
}

// tdd: the suite uses suite()/test(), matching the VS Code runner's default.
const mocha = new Mocha({ ui: 'tdd', color: true })
for (const f of pure) mocha.addFile(path.join(OUT_SUITE, f))

mocha.run(failures => process.exit(failures > 0 ? 1 : 0))
