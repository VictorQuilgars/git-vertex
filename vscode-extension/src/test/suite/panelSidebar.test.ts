import * as assert from 'assert'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

// The side bar is one shared component, and each host hands it its actions.
// What it can do in a product is exactly what that product passes it — so the
// panel's side bar drifted from the desktop's one prop at a time, and none of
// it showed in a test (#273):
//
//   - a STUB — `onSetRepo={() => {}}`: Worktrees › Open, and a click on a
//     worktree row, did nothing;
//   - an OMISSION — no `githubLogin`, no `githubRepo`, no
//     `onShowGithubDetail`: the account groups never appeared, the filter
//     button opened nothing, a row opened the browser instead of the sheet;
//   - a POORER SIGNATURE — `onCreateStash={handleStash}`, the toolbar's
//     handler, which takes no argument: Staged only and Unstaged only stashed
//     everything, untracked files included.
//
// hostParity and panelSurface cannot see any of this: they are about the
// host's `window.gitAPI`, and every one of these methods existed. This suite
// reads the two `<Sidebar>` elements — the desktop's App.tsx and the panel's
// app.tsx — with the TypeScript parser, and fails on each of the three.
//
// The desktop is the reference because it is the product the side bar was
// written for: it passes everything. A prop the panel leaves out on purpose is
// written down in PANEL_OMITS with the guard that keeps its entry off the
// screen — the test re-checks that guard, so the claim cannot go stale.

import { EXT_ROOT, REPO_ROOT } from './roots'
const DESKTOP_HOST = path.join(REPO_ROOT, 'src', 'renderer', 'src', 'App.tsx')
const PANEL_HOST = path.join(EXT_ROOT, 'src', 'webview', 'app.tsx')
const SIDEBAR = path.join(REPO_ROOT, 'src', 'renderer', 'src', 'components', 'Sidebar')

interface Omission {
  /** Why the panel does not pass it. */
  why: string
  /** Repo-relative file holding the guard. */
  file: string
  /** Verbatim source of the guard that hides the entry when the prop is absent. */
  guard: string
}

/**
 * Props the desktop passes and the panel does not, on purpose. Each one hides
 * its entry when absent — the rule the side bar keeps for a host that cannot
 * do something — and the guard quoted here is what makes that true.
 */
const PANEL_OMITS: Record<string, Omission> = {
  onViewWip: {
    why: 'The rail has its own Working Changes entry; without onViewWip the side bar draws no second one.',
    file: 'src/renderer/src/components/Sidebar/Sidebar.tsx',
    guard: '{repoPath && onViewWip && !showAI && (',
  },
  wipCount: {
    why: 'Only the WIP row reads it, and the panel draws no WIP row (see onViewWip).',
    file: 'src/renderer/src/components/Sidebar/Sidebar.tsx',
    guard: '{repoPath && onViewWip && !showAI && (',
  },
  wipSelected: {
    why: 'Only the WIP row reads it, and the panel draws no WIP row (see onViewWip).',
    file: 'src/renderer/src/components/Sidebar/Sidebar.tsx',
    guard: '{repoPath && onViewWip && !showAI && (',
  },
  tab: {
    why: 'The list / AI strip is the stacked layout\'s; in the panel the rail picks the view, the AI one included.',
    file: 'src/renderer/src/components/Sidebar/Sidebar.tsx',
    guard: '{!single && repoPath && (',
  },
  onTab: {
    why: 'The strip it answers is not drawn in the single-view layout (see tab).',
    file: 'src/renderer/src/components/Sidebar/Sidebar.tsx',
    guard: '{!single && repoPath && (',
  },
  onShowCommits: {
    why: 'Pointing the graph at a reading\'s commits needs a set of hashes handed to the graph, and the panel\'s '
      + 'graph is not given one. Absent, neither the button nor the menu row is drawn.',
    file: 'src/renderer/src/components/Sidebar/ai-rows.tsx',
    guard: 'if (!onShow || !hashes?.length) return null',
  },
}

type Attrs = Map<string, ts.Expression | undefined>

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}

/** The attributes of every `<Sidebar …>` in the file, by name. */
function sidebarElements(sf: ts.SourceFile): Attrs[] {
  const found: Attrs[] = []
  const visit = (node: ts.Node): void => {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(sf) === 'Sidebar') {
      const attrs: Attrs = new Map()
      for (const a of node.attributes.properties) {
        if (!ts.isJsxAttribute(a)) continue
        const value = a.initializer && ts.isJsxExpression(a.initializer) ? a.initializer.expression : undefined
        attrs.set(a.name.getText(sf), value)
      }
      found.push(attrs)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

const isFunction = (e: ts.Node): e is ts.ArrowFunction | ts.FunctionExpression =>
  ts.isArrowFunction(e) || ts.isFunctionExpression(e)

const isNothing = (e: ts.Expression): boolean =>
  e.kind === ts.SyntaxKind.NullKeyword
  || (ts.isIdentifier(e) && e.text === 'undefined')
  || ts.isVoidExpression(e)

/** `() => {}`, `() => undefined`, `undefined` — a handler that does nothing. */
function isStub(e: ts.Expression | undefined): boolean {
  if (!e) return false
  while (ts.isParenthesizedExpression(e)) e = e.expression
  if (isNothing(e)) return true
  if (!isFunction(e)) return false
  if (ts.isBlock(e.body)) return e.body.statements.length === 0
  return isNothing(e.body)
}

/** How many arguments a function takes — Infinity with a rest parameter. */
const arityOf = (params: ts.NodeArray<ts.ParameterDeclaration>): number =>
  params.some(p => p.dotDotDotToken) ? Infinity : params.length

/**
 * How many arguments the handler passed as a prop accepts: an inline function,
 * or a name declared in the same file as a function, `useCallback(fn, deps)`
 * or `function name()`. Undefined when it cannot be told from the source — a
 * member (`branchMeta.toggleFavorite`), a state setter — and those are skipped.
 */
function handlerArity(e: ts.Expression | undefined, sf: ts.SourceFile): number | undefined {
  if (!e) return undefined
  while (ts.isParenthesizedExpression(e)) e = e.expression
  if (isFunction(e)) return arityOf(e.parameters)
  if (!ts.isIdentifier(e)) return undefined
  const name = e.text
  let arity: number | undefined
  const visit = (node: ts.Node): void => {
    if (arity !== undefined) return
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) { arity = arityOf(node.parameters); return }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
      let init: ts.Expression = node.initializer
      if (ts.isCallExpression(init) && init.expression.getText(sf) === 'useCallback' && init.arguments[0]) init = init.arguments[0]
      if (isFunction(init)) { arity = arityOf(init.parameters); return }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return arity
}

/** Each function-typed member of SidebarProps, and how many arguments the side bar passes it. */
function propArities(): Map<string, number> {
  const sf = parse(path.join(SIDEBAR, 'types.tsx'))
  const out = new Map<string, number>()
  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === 'SidebarProps') {
      for (const m of node.members) {
        if (ts.isPropertySignature(m) && m.type && ts.isFunctionTypeNode(m.type)) {
          out.set(m.name.getText(sf), m.type.parameters.length)
        }
      }
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

suite('panel side bar — every entry it shows does what it says', () => {
  let desktop: Attrs | null = null
  let panel: Attrs | null = null
  let panelSource: ts.SourceFile | null = null

  suiteSetup(() => {
    // The extension can be built from a standalone checkout; skip rather than
    // fail when the desktop sources aren't there.
    if (!fs.existsSync(DESKTOP_HOST)) return
    const d = sidebarElements(parse(DESKTOP_HOST))
    panelSource = parse(PANEL_HOST)
    const p = sidebarElements(panelSource)
    assert.strictEqual(d.length, 1, `expected one <Sidebar> in App.tsx, found ${d.length}`)
    assert.strictEqual(p.length, 1, `expected one <Sidebar> in the panel's app.tsx, found ${p.length}`)
    desktop = d[0]
    panel = p[0]
  })

  test('the parser really reads both elements', function () {
    if (!desktop || !panel) { this.skip(); return }
    // A reader that silently found no attributes would pass everything below.
    for (const [who, attrs] of [['desktop', desktop], ['panel', panel]] as const) {
      for (const name of ['onCheckout', 'onCreateStash', 'onSetRepo', 'githubPRs']) {
        assert.ok(attrs.has(name), `the ${who}'s <Sidebar> was read without ${name} — is the parser still finding it?`)
      }
    }
    assert.ok(propArities().get('onCreateStash') === 1, 'SidebarProps was read without onCreateStash(scope)')
  })

  test('the panel passes everything the desktop passes, or says why not', function () {
    if (!desktop || !panel) { this.skip(); return }
    const missing = [...desktop.keys()].filter(name => !panel!.has(name) && !(name in PANEL_OMITS))
    assert.deepStrictEqual(missing, [],
      'The desktop hands the side bar these and the panel does not, so the entries they drive are missing '
      + 'or do something else in VS Code. Wire them in vscode-extension/src/webview/app.tsx as the desktop '
      + 'does — or, if the panel cannot, make sure the side bar hides the entry when the prop is absent and '
      + `add it to PANEL_OMITS with that guard: ${missing.join(', ')}`)
  })

  test('PANEL_OMITS is still true, and its guards are still there', function () {
    if (!desktop || !panel) { this.skip(); return }
    const problems: string[] = []
    for (const [name, o] of Object.entries(PANEL_OMITS)) {
      if (panel.has(name)) problems.push(`${name} — the panel passes it now; drop it from PANEL_OMITS`)
      if (!desktop.has(name)) problems.push(`${name} — the desktop no longer passes it; drop it from PANEL_OMITS`)
      const file = path.join(REPO_ROOT, o.file)
      if (!fs.existsSync(file) || !fs.readFileSync(file, 'utf8').includes(o.guard)) {
        problems.push(`${name} — ${o.file} no longer holds the guard that hides its entry: ${o.guard}`)
      }
    }
    assert.deepStrictEqual(problems, [], `PANEL_OMITS is out of date:\n  ${problems.join('\n  ')}`)
  })

  test('no handler the panel passes is a stub', function () {
    if (!panel || !panelSource) { this.skip(); return }
    const stubs = [...panel.entries()]
      .filter(([, value]) => isStub(value))
      .map(([name, value]) => `${name}={${value!.getText(panelSource!)}}`)
    assert.deepStrictEqual(stubs, [],
      'The panel hands the side bar handlers that do nothing, so their entries are shown and do nothing. '
      + 'Wire them, or — if the panel cannot — leave the prop out and let the side bar hide the entry '
      + `(an optional prop, and PANEL_OMITS): ${stubs.join(', ')}`)
  })

  test('no handler the panel passes takes fewer arguments than the side bar gives it', function () {
    if (!panel || !panelSource) { this.skip(); return }
    // The stash `+` passes a scope; a handler with no parameter drops it and
    // runs its default instead — the entry succeeds while doing something else.
    // The actions only (`on…`): showConfirm's second argument asks for a red
    // button, and VS Code's modal has none to give — a look, not a choice.
    const expected = propArities()
    const poorer: string[] = []
    for (const [name, value] of panel) {
      if (!/^on[A-Z]/.test(name)) continue
      const given = expected.get(name)
      const takes = handlerArity(value, panelSource)
      if (given === undefined || takes === undefined) continue
      if (takes < given) poorer.push(`${name}: the side bar passes ${given}, ${value!.getText(panelSource).slice(0, 60)} takes ${takes}`)
    }
    assert.deepStrictEqual(poorer, [],
      `These handlers ignore arguments the side bar passes — the choice made in the menu is lost:\n  ${poorer.join('\n  ')}`)
  })
})
