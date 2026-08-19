#!/usr/bin/env node
// Fails the build on a name the panel's webview cannot resolve.
//
// Why this exists rather than a plain typecheck: `src/webview` is excluded from
// tsconfig.json (its own comment says so) and esbuild resolves no names, so the
// panel's entry file is in **no** typecheck program. That hole has now shipped
// one crash and produced two more:
//
//   ext-v1.28.0  `I is not defined`      — a helper deleted by a refactor
//   Unreleased   `showPrompt` before init — a dependency array above its const
//   Unreleased   `repoName` / `handleCreateBranchFromIssue` — VertexApp locals
//                                           read from module scope by two tabs
//
// Every one of them renders nothing at all, and every one is a name that does
// not exist or is not there yet. Those are the three TypeScript codes below.
//
// The file has a backlog of other errors (a preload mirror missing entries,
// a `gitAPI` redeclaration, a few loose types) — that is issue #105, and
// clearing it is what would let this be replaced by a real gate. Until then
// this catches the class that crashes, and nothing else, so it can run today.

const { execFileSync } = require('child_process')
const path = require('path')

const EXT_ROOT = path.resolve(__dirname, '..')
const ENTRY = path.join('src', 'webview', 'app.tsx')

// TS2304 cannot find name · TS2448 used before its declaration · TS2454 used
// before being assigned. All three are "this name is not there", which is a
// ReferenceError the moment that line runs.
const FATAL = /error (TS2304|TS2448|TS2454):/

let output = ''
try {
  execFileSync('npx', [
    'tsc', '--noEmit', '--jsx', 'react-jsx', '--esModuleInterop', '--skipLibCheck',
    '--target', 'ES2020', '--module', 'esnext', '--moduleResolution', 'bundler', '--strict',
    ENTRY,
  ], { cwd: EXT_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
} catch (e) {
  // tsc exits non-zero on the known backlog; only the codes above are ours.
  output = `${e.stdout ?? ''}${e.stderr ?? ''}`
}

const fatal = output.split('\n').filter(line => FATAL.test(line))
if (fatal.length) {
  console.error('\nThe panel references names that do not exist. Each of these is a')
  console.error('ReferenceError at runtime, and the panel renders nothing:\n')
  for (const line of fatal) console.error(`  ${line}`)
  console.error('\n(Other type errors in this file are the known backlog — see issue #105.)')
  process.exit(1)
}
console.log('webview names: ok')
