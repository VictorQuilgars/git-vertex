import * as assert from 'assert'
import * as fs from 'fs'
import * as path from 'path'
import { DESKTOP_ONLY, KNOWN_GAPS } from './parity-lists'

// The other half of the parity problem — the half hostParity.test.ts cannot see.
//
// hostParity forces every window.gitAPI method to be CLASSIFIED: implemented in
// the extension, or written down as DESKTOP_ONLY / KNOWN_GAPS. What it never
// asks is whether the panel still puts the classified ones on screen. Both lists
// answer `{ success: false, error: 'not-implemented: <method>' }` at runtime, so
// a control wired to one is a button that does nothing — and declaring the gap
// yourself does not stop the shared renderer from rendering the button.
//
// That is how three of them shipped at once: the Agents view in the activity
// rail (listAgents) sat empty, the #123 hover card in the graph and the commit
// panel (githubGetIssue) never resolved, and Settings asked the host for an
// updater state it has no updater for (getUpdaterState). Each was individually
// invisible: every call site swallowed its own failure.
//
// So this test walks the panel's real module graph — the transitive relative
// imports of src/webview/app.tsx, which is exactly what esbuild bundles into
// the webview — and fails on any call to a method that answers not-implemented.
//
// The rule it enforces, and the reason the lot that added it exists: a method
// classified as unavailable in the panel must EITHER be implemented in the
// extension host, OR have its entry point removed from the UI in embedded mode.
//
// PANEL_UNREACHABLE below is the third option, and the only one that needs a
// human: the call site stays in a shared file because the desktop needs it, and
// the panel never reaches it because something guards it. That claim is a
// judgement the test cannot make on its own, so it is written down with the
// guard that backs it — and the test then re-checks that both the call site and
// its guard are still there. It does not prove unreachability; it makes a
// reachability decision impossible to change silently.

const EXT_ROOT = path.resolve(__dirname, '../../..')
const REPO_ROOT = path.resolve(EXT_ROOT, '..')
const PANEL_ENTRY = path.join(EXT_ROOT, 'src', 'webview', 'app.tsx')

interface Unreachable {
  /** The not-implemented method being called. */
  method: string
  /** Repo-relative file holding the call site. */
  file: string
  /** Why the panel never gets there. */
  why: string
  /** Verbatim source of the guard that backs `why` — must still exist. */
  guard: string
  /**
   * How many lines above the call site the guard must appear, when the guard
   * encloses the call. Keep it as tight as the code allows: a window wide
   * enough to catch some *other* call site's guard proves nothing, which is
   * how the unguarded getUpdaterState below hid behind the getGitCapabilities
   * guard while this list was being written.
   *
   * Omitted when the guard is at the USE site rather than around the call —
   * a handler defined near the top of a component and referenced only inside
   * guarded JSX further down. Those need a token unique to the whole file.
   */
  within?: number
}

/**
 * Call sites the panel cannot reach. Shared files serve both products, so a
 * desktop-only control legitimately lives next to the panel's code — but the
 * guard that keeps it off the panel's screen is the whole argument, so it is
 * quoted here and re-checked on every run.
 */
const PANEL_UNREACHABLE: Unreachable[] = [
  {
    method: 'getGitCapabilities',
    file: 'src/renderer/src/components/SettingsModal/SettingsModal.tsx',
    why: 'Fetched on mount for the desktop-only "which git we run" block, behind an explicit embedded check.',
    guard: 'if (!embedded) {',
    within: 3,
  },
  {
    method: 'getUpdaterState',
    file: 'src/renderer/src/components/SettingsModal/SettingsModal.tsx',
    why: 'Mount-time too: VS Code updates the extension itself, so the panel has no updater state to ask for.',
    guard: 'if (!embedded) {',
    within: 3,
  },
  {
    method: 'resolveGitBinary',
    file: 'src/renderer/src/components/SettingsModal/SettingsModal.tsx',
    why: 'Button inside the "which git we run" block, which the panel does not render — the extension inherits VS Code\'s PATH.',
    guard: '{!embedded && (',
    within: 45,
  },
  // githubStartAuth and githubDisconnect used to sit here: the "Connect" button
  // was hidden embedded because desktop OAuth needs a gitgui:// deep link. They
  // are implemented in the panel now — sign-in goes through VS Code's own
  // GitHub provider — so the button is shown on both products and there is
  // nothing left to declare unreachable. This is the list shrinking in the
  // direction it is supposed to.
  {
    method: 'checkForUpdates',
    file: 'src/renderer/src/components/SettingsModal/SettingsModal.tsx',
    why: 'Lives in the About section, which the embedded nav drops entirely.',
    guard: "const DESKTOP_ONLY_SECTIONS: Section[] = ['externalTools', 'ssh', 'about']",
  },
  {
    method: 'installManual',
    file: 'src/renderer/src/components/SettingsModal/SettingsModal.tsx',
    why: 'About section again — installing a desktop build from the panel is meaningless.',
    guard: "const DESKTOP_ONLY_SECTIONS: Section[] = ['externalTools', 'ssh', 'about']",
  },
  {
    method: 'installUpdate',
    file: 'src/renderer/src/components/SettingsModal/SettingsModal.tsx',
    why: 'About section again — electron-updater fallback for the manual install above.',
    guard: "const DESKTOP_ONLY_SECTIONS: Section[] = ['externalTools', 'ssh', 'about']",
  },
]

/**
 * Files we know are bundled into the panel. A resolver that silently stops
 * following imports would make every assertion below pass on an empty set, so
 * the graph proves itself before anything is checked against it.
 */
const MUST_BE_BUNDLED = [
  'vscode-extension/src/webview/app.tsx',
  'vscode-extension/src/webview/ActivityRail.tsx',
  'src/renderer/src/components/Sidebar/Sidebar.tsx',
  'src/renderer/src/components/SettingsModal/SettingsModal.tsx',
  'src/renderer/src/components/CommitGraph/CommitGraph.tsx',
  'src/renderer/src/components/RightPanel/RightPanel.tsx',
  'src/renderer/src/components/IssueLink/IssueLink.tsx',
]

/** Resolve a relative import the way esbuild does for this bundle. */
function resolveImport(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null   // node_modules — not our surface
  const base = path.resolve(path.dirname(fromFile), spec)
  for (const candidate of [`${base}.tsx`, `${base}.ts`, path.join(base, 'index.tsx'), path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  return null   // .css, images, and anything else that carries no gitAPI call
}

/** Every TS/TSX source esbuild pulls into the webview bundle. */
function panelBundle(): string[] {
  const seen = new Set<string>()
  const visit = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    const source = fs.readFileSync(file, 'utf8')
    for (const m of source.matchAll(/(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
      const resolved = resolveImport(file, m[1])
      if (resolved) visit(resolved)
    }
  }
  visit(PANEL_ENTRY)
  return [...seen].sort()
}

interface CallSite { method: string; file: string; line: number; source: string }

/**
 * Calls to `method` in `source`. Matches `x.method(`, `x.method?.(` and the
 * `(window.gitAPI as any).method(` cast the shared renderer uses for anything
 * the preload types don't cover. Comment lines are skipped so a commented-out
 * call is not reported as a live entry point.
 */
function callSites(file: string, relPath: string, methods: Set<string>): CallSite[] {
  const found: CallSite[] = []
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return
    for (const method of methods) {
      if (new RegExp(`\\.${method}\\s*(?:\\?\\.)?\\s*\\(`).test(line)) {
        found.push({ method, file: relPath, line: i + 1, source: trimmed.slice(0, 100) })
      }
    }
  })
  return found
}

suite('panel surface — nothing the VS Code panel reaches is unimplemented', () => {
  let bundle: string[] | null = null

  suiteSetup(() => {
    // The extension can be built from a standalone checkout; skip rather than
    // fail when the shared desktop renderer isn't there.
    bundle = fs.existsSync(path.join(REPO_ROOT, 'src', 'renderer')) ? panelBundle() : null
  })

  test('the module graph really covers the panel', function () {
    if (!bundle) { this.skip(); return }
    const relative = bundle.map(f => path.relative(REPO_ROOT, f))
    const missing = MUST_BE_BUNDLED.filter(f => !relative.includes(f))
    assert.deepStrictEqual(missing, [],
      'The import walk did not reach files known to be in the panel bundle, so every other '
      + 'assertion in this suite is checking an incomplete graph. Did an import path or a file '
      + `name change? Missing: ${missing.join(', ')}`)
  })

  test('no unimplemented method is reachable from the panel', function () {
    if (!bundle) { this.skip(); return }
    const unavailable = new Set([...DESKTOP_ONLY, ...KNOWN_GAPS])
    const declared = new Set(PANEL_UNREACHABLE.map(u => `${u.method}@${u.file}`))

    const live = bundle
      .flatMap(f => callSites(f, path.relative(REPO_ROOT, f), unavailable))
      .filter(c => !declared.has(`${c.method}@${c.file}`))

    assert.deepStrictEqual(live.map(c => `${c.method} — ${c.file}:${c.line}`), [],
      'These calls are reachable from the VS Code panel and answer "not-implemented" there, '
      + 'which renders as a control that silently does nothing. Implement the method in '
      + 'vscode-extension/src/gitService.ts (or add a case in GitVertexHost), remove the entry '
      + 'point from the shared UI in embedded mode, or — if it is already unreachable — say so '
      + `in PANEL_UNREACHABLE with the guard that makes it true:\n  ${live.map(c => `${c.method} — ${c.file}:${c.line}\n    ${c.source}`).join('\n  ')}`)
  })

  test('every PANEL_UNREACHABLE claim still has a call site and a guard', function () {
    if (!bundle) { this.skip(); return }
    const relative = new Map(bundle.map(f => [path.relative(REPO_ROOT, f), f]))
    const problems: string[] = []

    for (const entry of PANEL_UNREACHABLE) {
      const abs = relative.get(entry.file)
      if (!abs) {
        problems.push(`${entry.method} — ${entry.file} is no longer in the panel bundle; drop this entry`)
        continue
      }
      const lines = fs.readFileSync(abs, 'utf8').split('\n')
      const sites = callSites(abs, entry.file, new Set([entry.method]))
      if (sites.length === 0) {
        problems.push(`${entry.method} — no longer called in ${entry.file}; drop this entry`)
        continue
      }
      for (const site of sites) {
        // `within` set: the guard has to sit just above THIS call, not merely
        // somewhere in a 1000-line component. Unset: use-site guard, so the
        // token has to be unique enough to stand on its own file-wide.
        const window = entry.within === undefined
          ? lines
          : lines.slice(Math.max(0, site.line - 1 - entry.within), site.line)
        if (!window.join('\n').includes(entry.guard)) {
          problems.push(
            `${entry.method} — ${entry.file}:${site.line} is no longer behind the guard that kept it `
            + `off the panel${entry.within === undefined ? '' : ` (expected within ${entry.within} lines above)`}. `
            + `Expected to find: ${entry.guard}`)
        }
      }
    }

    assert.deepStrictEqual(problems, [],
      'PANEL_UNREACHABLE is out of date. Each entry claims a call site the panel cannot reach, '
      + `and that claim no longer holds:\n  ${problems.join('\n  ')}`)
  })
})
