import * as assert from 'assert'
import * as fs from 'fs'
import * as path from 'path'

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
// This test forces the choice: implement it in the extension, or declare it
// desktop-only below. It never fails for a method that already exists on both
// sides, and it fails for anything new and unclassified.

// __dirname is out/test/suite at runtime, so every path is resolved from the
// extension root rather than from the compiled tree.
const EXT_ROOT = path.resolve(__dirname, '../../..')
const REPO_ROOT = path.resolve(EXT_ROOT, '..')
const PRELOAD = path.join(REPO_ROOT, 'src', 'preload', 'index.ts')
const EXT_SERVICE = path.join(EXT_ROOT, 'src', 'gitService.ts')
const EXT_HOST = path.join(EXT_ROOT, 'src', 'panel', 'GitVertexHost.ts')

/**
 * Desktop-only by design — the extension has no equivalent surface, or VS Code
 * already provides one. Nothing here is a bug; it is a decision.
 */
const DESKTOP_ONLY = new Set([
  // App shell: the extension lives inside VS Code's window and updater.
  'zoomGet', 'zoomSet', 'isFullscreen',
  'checkForUpdates', 'downloadUpdate', 'installUpdate', 'installManual',
  'getUpdaterState', 'openDownloadedUpdate',
  'getWhatsNew', 'getReleaseNotes', 'markWhatsNewSeen',
  // Repo management: the extension is mono-repo, driven by the workspace
  // folder, so opening/cloning/scanning repos is not its job.
  'openRepo', 'setRepo', 'initRepo', 'initAdvanced', 'cloneTo', 'githubClone',
  'getRecentRepos', 'removeRecentRepo', 'scanLocalRepos', 'readReadme',
  'getWorkspaces', 'setRepoWorkspace', 'openPathInEditor',
  'listGitignoreTemplates', 'listLicenses', 'githubCreateRepo',
  // Deep links need a registered URL scheme — desktop only.
  'getPendingDeepLink',
  // AI credentials: the extension reads its own gitVertex.ai* settings.
  'aiGetApiKey', 'aiSetApiKey', 'aiListModels',
])

/**
 * Known gaps: the shared UI offers these in the panel and they answer
 * not-implemented. Each is claimed by a planned lot — this list must shrink,
 * never grow. See docs-private/gitvertex-plan-versions.md.
 */
const KNOWN_GAPS = new Set([
  // → "GitHub : au-delà du read-only"
  'githubCreatePR', 'githubListBranches', 'githubSharePatch', 'githubShareWipPatch',
  'githubSearchIssues', 'githubCloseIssue', 'githubGetIssue', 'githubListRepos',
  'githubDetectRepoAt', 'githubStartAuth', 'githubDisconnect', 'githubGetToken',
  // → unclaimed: gitflow has no extension host implementation at all
  'gitflowStatus', 'gitflowInit', 'gitflowStart', 'gitflowFinish',
  // → unclaimed: agent scanning is a desktop-side process walk
  'listAgents',
])

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
      'getDefaultRemote', 'setDefaultRemote', 'pruneRemote', 'pruneGoneBranches',
      'getGoneBranches', 'renameStash', 'stashDiff',
      'openExternalDiff', 'openExternalMerge', 'readTempFile',
      'sshBrowseKey', 'sshGenerateKey',
    ]) {
      assert.ok(reachable.has(method), `${method} is not reachable from the webview`)
    }
  })
})
