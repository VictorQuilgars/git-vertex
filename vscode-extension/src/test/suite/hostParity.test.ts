import * as assert from 'assert'
import * as fs from 'fs'
import * as path from 'path'
import { DESKTOP_ONLY, KNOWN_GAPS } from './parity-lists'

// Drift detector between the two products.
//
// The desktop preload (src/preload/index.ts) defines the whole `window.gitAPI`
// surface, and the SHARED renderer calls it on both products. In the extension,
// GitVertexHost answers either from an explicit `case` or by forwarding the
// call reflectively to vscode-extension/src/gitService.ts — and returns
// `not-implemented: <method>` for anything it can't find.
//
// So a method added to the preload for the desktop silently becomes a dead
// button in the VS Code panel. That is exactly how ext-v1.20.0 shipped a stash
// picker, a prune action and a default-remote badge that could not work.
//
// This test forces the choice: implement it in the extension, or classify it in
// parity-lists.ts. It never fails for a method that already exists on both
// sides, and it fails for anything new and unclassified.
//
// Classifying is not the end of it. Both DESKTOP_ONLY and KNOWN_GAPS answer
// not-implemented at runtime, and nothing here stops the shared UI from still
// rendering a control for one — panelSurface.test.ts is the guard for that.

// __dirname is out/test/suite at runtime, so every path is resolved from the
// extension root rather than from the compiled tree.
const EXT_ROOT = path.resolve(__dirname, '../../..')
const REPO_ROOT = path.resolve(EXT_ROOT, '..')
const PRELOAD = path.join(REPO_ROOT, 'src', 'preload', 'index.ts')
const EXT_SERVICE = path.join(EXT_ROOT, 'src', 'gitService.ts')
const EXT_HOST = path.join(EXT_ROOT, 'src', 'panel', 'GitVertexHost.ts')

function preloadMethods(source: string): string[] {
  const body = source.slice(source.indexOf('const gitAPI = {'))
  return [...body.matchAll(/^\s{2}([a-zA-Z][A-Za-z0-9_]*)\s*:/gm)]
    .map(m => m[1])
    // on*/off* are event subscriptions; gitApiShim answers them locally with a
    // no-op unsubscribe, so they never reach the host.
    .filter(name => !/^(on|off)[A-Z]/.test(name))
}

function serviceMethods(source: string): Set<string> {
  return new Set([...source.matchAll(/^\s{2}(?:async\s+)?([a-zA-Z][A-Za-z0-9_]*)\s*\(/gm)].map(m => m[1]))
}

function hostCases(source: string): Set<string> {
  return new Set([...source.matchAll(/case\s+'([a-zA-Z][A-Za-z0-9_]*)'\s*:/g)].map(m => m[1]))
}

suite('host parity — desktop preload vs extension host', () => {
  let preload: string | null = null

  suiteSetup(() => {
    // The extension can be built from a standalone checkout; skip rather than
    // fail when the desktop sources aren't there.
    preload = fs.existsSync(PRELOAD) ? fs.readFileSync(PRELOAD, 'utf8') : null
  })

  test('every gitAPI method is implemented, or explicitly classified', function () {
    if (!preload) { this.skip(); return }

    const reachable = new Set([
      ...serviceMethods(fs.readFileSync(EXT_SERVICE, 'utf8')),
      ...hostCases(fs.readFileSync(EXT_HOST, 'utf8')),
    ])

    const unclassified = preloadMethods(preload)
      .filter(name => !reachable.has(name))
      .filter(name => !DESKTOP_ONLY.has(name) && !KNOWN_GAPS.has(name))

    assert.deepStrictEqual(unclassified, [],
      'These window.gitAPI methods answer "not-implemented" in the VS Code panel. '
      + 'Implement them in vscode-extension/src/gitService.ts (or add a case in '
      + 'GitVertexHost), or add them to DESKTOP_ONLY / KNOWN_GAPS in this test '
      + `with a reason: ${unclassified.join(', ')}`)
  })

  test('the parity lists stay in sync with the preload', function () {
    if (!preload) { this.skip(); return }
    const declared = preloadMethods(preload)
    const stale = [...DESKTOP_ONLY, ...KNOWN_GAPS].filter(name => !declared.includes(name))
    assert.deepStrictEqual(stale, [],
      `These names no longer exist in the preload — drop them from the lists: ${stale.join(', ')}`)
  })

  test('the features this lot ported are reachable from the panel', function () {
    if (!preload) { this.skip(); return }
    const reachable = new Set([
      ...serviceMethods(fs.readFileSync(EXT_SERVICE, 'utf8')),
      ...hostCases(fs.readFileSync(EXT_HOST, 'utf8')),
    ])
    for (const method of [
      // ext-v1.21.0
      'getDefaultRemote', 'setDefaultRemote', 'pruneRemote', 'pruneGoneBranches',
      'getGoneBranches', 'renameStash', 'stashDiff',
      'openExternalDiff', 'openExternalMerge', 'readTempFile',
      'sshBrowseKey', 'sshGenerateKey',
      // Pull requests in the panel: githubCreatePR and githubListBranches are
      // what the composer calls, getDefaultBranch what decides the row exists.
      'githubCreatePR', 'githubListBranches', 'getDefaultBranch',
    ]) {
      assert.ok(reachable.has(method), `${method} is not reachable from the webview`)
    }
  })

  // The signature half of the problem: a method can exist on both sides and
  // still do the wrong thing quietly, which is worse than not-implemented.
  // pull() ignoring its strategy and createStash() ignoring its scope both
  // shipped that way. These are the arities the shared renderer relies on.
  test('ported methods keep the signature the shared renderer calls', () => {
    const service = fs.readFileSync(EXT_SERVICE, 'utf8')
    const arityOf = (name: string): string | null =>
      service.match(new RegExp(`^\\s{2}(?:async\\s+)?${name}\\s*\\(([^)]*)\\)`, 'm'))?.[1] ?? null

    // getLastCommitMessage took no ref at all: the PR composer prefills its
    // title from the head branch, which on the default branch is not HEAD.
    assert.ok(/\bref\b/.test(arityOf('getLastCommitMessage') ?? ''),
      'getLastCommitMessage must accept a ref, or it answers for HEAD whatever it is asked')
    assert.ok(/\bmode\b/.test(arityOf('pull') ?? ''),
      'pull must accept a mode, or the Pull split-button silently runs a bare git pull')
  })
})
