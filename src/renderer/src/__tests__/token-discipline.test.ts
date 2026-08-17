import fs from 'fs'
import path from 'path'

// The renderer's palette has to be reachable from tokens.css alone — that is
// what makes a theme swappable. Three ways it stops being true, each of which
// has actually happened:
//
//   1. a colour literal creeps back into a component stylesheet
//   2. a token is referenced that does not exist (typo, or a theme file that
//      forgot a role)
//   3. --text-on-emphasis is used as "the brightest text" instead of "text on
//      a filled emphasis surface" — invisible on a dark theme, fatal on a
//      light one. It was painting the commit message.
//   4. a literal reaches the page through a `style={{ … }}` object instead of a
//      stylesheet. Those never touch the cascade, so the .css scan below cannot
//      see them, and 37 of them existed before the tokenisation.
//
// These are conventions, not behaviour, so they are checked by reading the
// files, in the style of label-conventions.test.ts.

const SRC = path.resolve(__dirname, '..')
const TOKENS = path.join(SRC, 'tokens.css')
// The panel's own chrome — rail, compact toolbar, conflict banner, stacked bar.
// It is checked here rather than in the extension's mocha suite because the rule
// it has to obey is this file's rule, and the tokens it must use are this
// project's tokens. Same reach as button-labels.test.ts, which already reads it.
const EXT_WEBVIEW = path.resolve(__dirname, '../../../../vscode-extension/src/webview')

function filesWithExt(dir: string, ext: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === '__tests__' ? [] : filesWithExt(p, ext)
    return e.name.endsWith(ext) ? [p] : []
  })
}
const cssFiles = (dir: string) => filesWithExt(dir, '.css')
const tsxFiles = (dir: string) => filesWithExt(dir, '.tsx')

/**
 * Every `style={{ … }}` object in a file, as raw text. Brace-counted rather
 * than regexed so a ternary or a nested object inside the style still yields
 * one whole block.
 */
function inlineStyles(src: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = []
  const marker = 'style={{'
  for (let i = src.indexOf(marker); i !== -1; i = src.indexOf(marker, i + 1)) {
    let depth = 2                      // the two braces the marker opened
    let j = i + marker.length
    while (j < src.length && depth > 0) {
      if (src[j] === '{') depth++
      else if (src[j] === '}') depth--
      j++
    }
    out.push({ text: src.slice(i, j), line: src.slice(0, i).split('\n').length })
    i = j - 1
  }
  return out
}

/** Comments carry example literals on purpose — strip them before scanning. */
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const ALL = [...cssFiles(SRC), ...(fs.existsSync(EXT_WEBVIEW) ? cssFiles(EXT_WEBVIEW) : [])]
const COMPONENT_CSS = ALL.filter(f => f !== TOKENS)
const COMPONENT_TSX = [...tsxFiles(SRC), ...(fs.existsSync(EXT_WEBVIEW) ? tsxFiles(EXT_WEBVIEW) : [])]
const rel = (f: string) => path.relative(path.resolve(SRC, '../../..'), f)

describe('token discipline', () => {
  it('finds the stylesheets it is meant to check', () => {
    expect(COMPONENT_CSS.length).toBeGreaterThan(20)
    expect(fs.existsSync(TOKENS)).toBe(true)
    // The panel's own stylesheet is in scope, not silently skipped.
    expect(COMPONENT_CSS.some(f => f.endsWith('vertex-vscode.css'))).toBe(true)
    // Same for the components, on both sides of the shared renderer.
    expect(COMPONENT_TSX.length).toBeGreaterThan(20)
    expect(COMPONENT_TSX.some(f => f.endsWith('RightPanel.tsx'))).toBe(true)
    expect(COMPONENT_TSX.some(f => f.includes('vscode-extension'))).toBe(true)
  })

  it('reads inline styles rather than pattern-matching them', () => {
    // The scanner is only worth trusting if it survives a ternary and a nested
    // object — the two shapes a naive regex stops at, and both of which the
    // real components use.
    const blocks = inlineStyles(
      `<a style={{ color: x ? '#aabbcc' : '#ddeeff' }} />\n` +
      `<b style={{ grid: { gap: 2 }, background: '#123456' }} />`,
    )
    expect(blocks).toHaveLength(2)
    expect(blocks[0].text).toContain('#ddeeff')
    expect(blocks[1].text).toContain('#123456')
    expect(blocks[1].line).toBe(2)
  })

  it('keeps every colour literal in tokens.css', () => {
    const offenders: string[] = []
    for (const f of COMPONENT_CSS) {
      const css = stripComments(fs.readFileSync(f, 'utf8'))
      css.split('\n').forEach((line, i) => {
        const hits = line.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/g)
        if (hits) offenders.push(`${rel(f)}:${i + 1}  ${hits.join(' ')}  ${line.trim()}`)
      })
    }
    expect(offenders).toEqual([])
  })

  // An inline style never enters the cascade, so a literal here is exactly as
  // unthemeable as one in a stylesheet — and the .css scan above is blind to it.
  //
  // Scope is deliberately the style object and not the whole file: a hex sitting
  // in a const is data until something paints with it, and the colours that
  // legitimately stay literal (GitHub language colours, AI provider brands, the
  // accent presets, the lane fallback) all live in exactly that form. Bounding
  // the rule this way is what lets it run without an allowlist to maintain.
  it('keeps colour literals out of inline styles', () => {
    const offenders: string[] = []
    for (const f of COMPONENT_TSX) {
      for (const block of inlineStyles(fs.readFileSync(f, 'utf8'))) {
        const hits = block.text.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/g)
        if (hits) offenders.push(`${rel(f)}:${block.line}  ${hits.join(' ')}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('only references tokens that tokens.css defines', () => {
    const defined = new Set(
      [...fs.readFileSync(TOKENS, 'utf8').matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map(m => m[1]),
    )
    // A stylesheet may also define its own custom properties locally.
    const localToFile = (css: string) =>
      new Set([...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map(m => m[1]))

    const missing: string[] = []
    for (const f of COMPONENT_CSS) {
      const css = stripComments(fs.readFileSync(f, 'utf8'))
      const local = localToFile(css)
      for (const m of css.matchAll(/var\((--[a-z0-9-]+)/g)) {
        if (!defined.has(m[1]) && !local.has(m[1])) missing.push(`${rel(f)}  ${m[1]}`)
      }
    }
    expect([...new Set(missing)]).toEqual([])
  })

  // Selectors whose fill is a colour set inline from JS (a lane colour, an
  // accent preset) or by a sibling modifier class. White really is correct on
  // those, whatever the theme, so --text-on-emphasis is the right role.
  const INLINE_FILLED = [
    '.cg-author-bullet-initials', // background: lane colour, CommitGraph.tsx
    '.cg-avatar',
    '.rp-avatar',
    '.cd-avatar-sq',
    '.stg-swatch',                // background: the accent preset being offered
    '.mt-badge',                  // .mt-badge-ours / -theirs carry the fill
    '.cd-ai-sep',                 // sits inside .cd-ai-btn's purple gradient
  ]

  const SOLID_FILL =
    /background(-color)?:[^;]*var\(--(accent|accent-emphasis|accent-strong|success|success-strong|success-emphasis|danger|danger-solid|purple|purple-deep|warning|install-bg|pr-merged|amend-confirm-bg|amend-cancel-bg)\)|background:\s*linear-gradient/

  // A theme is a block of SEEDS. Two ways that stops being true, and both fail
  // silently rather than loudly:
  //
  //   1. a theme forgets a seed — it inherits the default's, so a light theme
  //      ships with three dark values scattered through it;
  //   2. a theme redefines a DERIVED token — it then no longer follows its
  //      seed, and editing that seed stops working for that theme only, which
  //      is the worst kind of bug to find by eye.
  describe('themes redefine seeds and nothing else', () => {
    const css = fs.readFileSync(TOKENS, 'utf8')
    const blocks = [...css.matchAll(/^(:root,?[^{]*|\[data-theme="[^"]+"\][^{]*)\{([\s\S]*?)^\}/gm)]
    const seedsOf = (body: string) =>
      new Set([...body.matchAll(/^\s*(--seed-[a-z0-9-]+)\s*:/gm)].map(m => m[1]))

    it('finds a default block and at least one theme', () => {
      expect(blocks.length).toBeGreaterThanOrEqual(2)
      expect(blocks.some(b => b[1].includes('[data-theme='))).toBe(true)
    })

    it('gives every theme the same seed set as the default', () => {
      const [base, ...themes] = blocks
      const want = seedsOf(base[2])
      expect(want.size).toBeGreaterThan(10)
      for (const t of themes) {
        const got = seedsOf(t[2])
        const missing = [...want].filter(s => !got.has(s))
        const extra = [...got].filter(s => !want.has(s))
        expect({ theme: t[1].trim(), missing, extra })
          .toEqual({ theme: t[1].trim(), missing: [], extra: [] })
      }
    })

    // A theme block nobody can select, or a BUILT_IN_THEMES entry with no block
    // behind it, are both invisible: the first never renders, the second falls
    // back to the default in resolveTheme() and looks like the user's choice not
    // sticking. Adding a theme is meant to be a block plus a line, and this is
    // what says so when only one of the two happened.
    //
    // Scoped to BUILT_IN_THEMES on purpose. An INSTALLED theme is in neither
    // tokens.css nor that list — it is downloaded at runtime and injected as a
    // [data-theme] rule by SettingsContext — so widening this test would fail
    // the moment anyone installed one. What it still guarantees is the thing it
    // was written for: nothing ships in tokens.css that cannot be selected.
    it('registers exactly the themes tokens.css defines', () => {
      const declared = blocks
        .flatMap(b => [...b[1].matchAll(/\[data-theme="([^"]+)"\]/g)].map(m => m[1]))
        .sort()
      const ctx = fs.readFileSync(path.join(SRC, 'contexts', 'SettingsContext.tsx'), 'utf8')
      const listed = [...ctx.match(/export const BUILT_IN_THEMES = \[([^\]]*)\]/)![1]
        .matchAll(/'([^']+)'/g)].map(m => m[1]).sort()
      expect(listed).toEqual(declared)
    })

    // The main process keeps its own copy of the same ids, because the
    // validator has to refuse an installed theme that would shadow a built-in,
    // and it cannot import the renderer — the two are built separately. The
    // duplication is only safe while something checks it, which is this.
    it('keeps the main process copy of the built-in ids in step', () => {
      const declared = blocks
        .flatMap(b => [...b[1].matchAll(/\[data-theme="([^"]+)"\]/g)].map(m => m[1]))
        .sort()
      const main = fs.readFileSync(
        path.join(SRC, '..', '..', 'main', 'theme-validate.ts'), 'utf8')
      const listed = [...main.match(/export const BUILT_IN_THEME_IDS: readonly string\[\] = \[([^\]]*)\]/)![1]
        .matchAll(/'([^']+)'/g)].map(m => m[1]).sort()
      expect(listed).toEqual(declared)
    })

    // The theme picker's chips used to restate each theme's canvas, border and
    // accent as hexes in the .tsx. They arrived through an identifier rather
    // than a literal, so the style={{ … }} scan above never saw them, and two
    // of the three had drifted. The chip reads the seeds now — see
    // .stg-theme-chip in SettingsModal.css.
    it('keeps the theme picker off a second copy of the palette', () => {
      const modal = fs.readFileSync(
        path.join(SRC, 'components', 'SettingsModal', 'SettingsModal.tsx'), 'utf8')
      const presets = modal.match(/const THEME_PRESETS[^=]*=\s*\[([\s\S]*?)\]/)
      expect(presets).not.toBeNull()
      expect(presets![1]).not.toMatch(/#[0-9A-Fa-f]{3,8}/)
    })

    it('never lets a theme override a derived token', () => {
      const [base, ...themes] = blocks
      // Derived = defined in the default block, not a seed.
      const derived = new Set(
        [...base[2].matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)]
          .map(m => m[1])
          .filter(n => !n.startsWith('--seed-')),
      )
      for (const t of themes) {
        const overridden = [...t[2].matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)]
          .map(m => m[1])
          .filter(n => derived.has(n))
        expect({ theme: t[1].trim(), overridden }).toEqual({ theme: t[1].trim(), overridden: [] })
      }
    })

    it('resolves every derived token through a seed', () => {
      const [base] = blocks
      const offenders: string[] = []
      for (const line of base[2].split('\n')) {
        const m = /^\s*(--[a-z0-9-]+)\s*:\s*(.+);/.exec(line)
        if (!m || m[1].startsWith('--seed-')) continue
        const [, name, value] = m
        // Shape tokens (sizes, durations, z-indices) and the two deliberate
        // literals are not colours and have no seed to point at.
        if (!/color-mix|var\(--seed-/.test(value) && /#|rgb|transparent|black/.test(value)) {
          if (!['--syntax-bg', '--scrim'].includes(name)) offenders.push(`${name}: ${value}`)
        }
      }
      expect(offenders).toEqual([])
    })
  })

  // components/Mark draws the symbol in JSX, because it has to follow the theme
  // and an <img> cannot. That makes it a SECOND copy of a drawing whose first
  // copy is resources/icon.svg — and a second copy is exactly how the lockups
  // silently kept dashed commits after the symbol moved to dots.
  //
  // Colours legitimately differ (tokens here, literals there, since an .icns
  // cannot hold a var()). Geometry must not. Both files are written by
  // docs-private/logo-piste-g/logo.py, so a mismatch means one was hand-edited
  // or the script was run for only one of them.
  const shapesOf = (s: string) =>
    [...s.matchAll(/<(path|circle)\b([^>]*)\/?>/g)]
      .map(m => m[2])
      .filter(a => !a.includes('width="512"'))          // the icon's tile
      .map(a => [...a.matchAll(/\b(d|cx|cy|r|transform)=[{"]?"?([^"}]+)"/g)]
        .map(x => `${x[1]}=${x[2]}`).join(' '))
      .filter(Boolean)

  it('keeps the Mark component identical to the app icon, full cut', () => {
    const mark = fs.readFileSync(path.join(SRC, 'components/Mark/Mark.tsx'), 'utf8')
    const icon = fs.readFileSync(path.resolve(SRC, '../../../resources/icon.svg'), 'utf8')
    const full = mark.slice(mark.indexOf("c === 'full'"), mark.indexOf("c === 'lite'"))
    const fromMark = shapesOf(full).map(s => s.replace(/^d=VERTEX_FULL$/, 'vertex'))
    const fromIcon = shapesOf(icon)
    expect(fromMark.length).toBeGreaterThan(10)
    // the vertex is a named constant in the component, inlined in the SVG
    expect(fromMark.filter(s => !s.startsWith('d=VERTEX')))
      .toEqual(fromIcon.filter(s => !s.startsWith('d=M214 422')))
  })

  it('keeps the Mark component identical to the small icon, lite cut', () => {
    const mark = fs.readFileSync(path.join(SRC, 'components/Mark/Mark.tsx'), 'utf8')
    const icon = fs.readFileSync(path.resolve(SRC, '../../../resources/icon-small.svg'), 'utf8')
    const lite = mark.slice(mark.indexOf("c === 'lite'"), mark.indexOf("c === 'bare'"))
    expect(shapesOf(lite).filter(s => !s.startsWith('d=VERTEX')))
      .toEqual(shapesOf(icon).filter(s => !s.startsWith('d=M204 422')))
  })

  // An unknown icon name is a CRASH, not a red squiggle: Icon throws on a name
  // it cannot find, the Vite build does not typecheck, and tsc over this
  // project already reports a thousand pre-existing errors, so nothing on the
  // path to a release would have said a word. Renaming rocket.svg to
  // liftoff.svg left one call site behind — in a ternary, in single quotes,
  // which a search for the double-quoted form missed — and the Launchpad
  // rendered a black screen.
  it('names an icon that exists at every call site', () => {
    const known = new Set(
      fs.readdirSync(path.join(SRC, 'components/Icon/icons'))
        .filter(f => f.endsWith('.svg')).map(f => f.slice(0, -4)),
    )
    const offenders: string[] = []
    for (const f of COMPONENT_TSX) {
      const src = fs.readFileSync(f, 'utf8')
      // The plain form.
      for (const m of src.matchAll(/<Icon\b[^>]*?\bname="(\w+)"/g)) {
        if (!known.has(m[1])) offenders.push(`${rel(f)}  name="${m[1]}"`)
      }
      // The computed form. Inside `name={…}` only the literals that FOLLOW a
      // `?` or a `:` are results — the ones before them are the condition's
      // operands (`tab.kind === 'launchpad'`) and name no icon.
      for (const m of src.matchAll(/<Icon\b[^>]*?\bname=\{([^}]*)\}/g)) {
        for (const lit of m[1].matchAll(/[?:]\s*'(\w+)'/g)) {
          if (!known.has(lit[1])) offenders.push(`${rel(f)}  name={… '${lit[1]}' …}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  // ── One drawing, one file ─────────────────────────────────────────────────
  //
  // The interface used to inline 91 `<svg>` blocks across 18 components: 71
  // distinct drawings, the same magnifier pasted eight times, three different
  // hands mixed (our own, GitHub's Octicons, Feather). "Change the icon" meant
  // finding every copy, which is how five of them kept the pre-aqua palette
  // through the whole migration.
  //
  // Four files may still hold an <svg> and no others: the two that ARE a
  // drawing (Mark, BrandMark), the one that renders the folder (Icon), and the
  // graph, whose SVG is a canvas it computes rather than an icon.
  it('leaves no icon inlined in a component', () => {
    const ALLOWED = [
      'components/Mark/Mark.tsx',
      'components/BrandMark/BrandMark.tsx',
      'components/Icon/Icon.tsx',
      'components/CommitGraph/CommitGraph.tsx',
    ]
    const offenders = COMPONENT_TSX
      .filter(f => !ALLOWED.some(a => path.resolve(f).endsWith(a)))
      .filter(f => /<svg\b/.test(fs.readFileSync(f, 'utf8')))
      .map(rel)
    expect(offenders).toEqual([])
  })

  // Our own mark has exactly one home too, for the same reason. UpdateOverlay
  // declared a local `Mark()` that shadowed the real component and drew the V
  // by hand — straight lines, the pre-aqua greens — and it survived the whole
  // palette migration because nothing looked for it. The symbol is drawn on a
  // 512 grid; icons are 24 and brand marks 16 or 100, so a 512 viewBox outside
  // Mark.tsx is a hand-drawn mark and nothing else.
  it('keeps the Git Vertex mark out of every component but Mark', () => {
    const HOME = path.join(SRC, 'components/Mark/Mark.tsx')
    const offenders = COMPONENT_TSX
      .filter(f => path.resolve(f) !== path.resolve(HOME))
      .filter(f => /viewBox="0 0 512 512"/.test(fs.readFileSync(f, 'utf8')))
      .map(rel)
    expect(offenders).toEqual([])
  })

  // Two families, and the split only holds if nothing crosses it.
  //
  // components/Icon is ours: stroke drawings that inherit currentColor and
  // follow the theme. components/BrandMark is somebody else's: fixed geometry
  // we display and may not redraw. A brand path pasted loose in a component is
  // how the octocat ended up in App.tsx three times, and how our own `vscode`
  // icon ended up competing with Microsoft's actual logo for the same meaning.
  describe('brand marks stay in BrandMark', () => {
    const BRAND = path.join(SRC, 'components/BrandMark/BrandMark.tsx')
    // A few bytes of each mark, enough to spot a paste and not enough to match
    // anything else.
    // A mark has more than one published cut, and a signature that knows only
    // one of them is a guard with a hole in it: this list held the octocat's
    // 16-grid path only, while SettingsModal carried the 24-grid one in three
    // places for the whole migration without ever failing a test.
    const SIGNATURES: [string, string][] = [
      ['GitHub octocat, 16 grid', 'M8 0C3.58 0 0 3.58 0 8c0 3.54'],
      ['GitHub octocat, 24 grid', 'M12 0C5.37 0 0 5.37 0 12c0 5.31'],
      ['Git logo', 'M15.698 7.287 8.712.302'],
      ['VS Code ribbon', 'M70.912 99.317a6.223 6.223 0 0 0 4.96-.19'],
    ]

    // Only the cuts BrandMark actually ships. The others are listed above so
    // they are recognised as pastes, not so they are required to be present.
    const SHIPPED = SIGNATURES.filter(([l]) => !l.includes('24 grid'))

    it('holds every third-party path it claims to', () => {
      const src = fs.readFileSync(BRAND, 'utf8')
      for (const [label, sig] of SHIPPED) {
        expect([label, src.includes(sig)]).toEqual([label, true])
      }
    })

    it('keeps them out of every other component', () => {
      const offenders: string[] = []
      for (const f of COMPONENT_TSX) {
        if (path.resolve(f) === BRAND) continue
        const src = fs.readFileSync(f, 'utf8')
        for (const [label, sig] of SIGNATURES) {
          if (src.includes(sig)) offenders.push(`${rel(f)}  ${label}`)
        }
      }
      expect(offenders).toEqual([])
    })

    // `editor` is a category. The product is Microsoft's and lives in BrandMark.
    it('does not name an icon after a third-party product', () => {
      const dir = path.join(SRC, 'components/Icon/icons')
      const names = fs.readdirSync(dir).filter(f => f.endsWith('.svg')).map(f => f.slice(0, -4))
      expect(names.length).toBeGreaterThan(20)
      expect(names.filter(n => /vscode|github|gitlab|jetbrains/i.test(n))).toEqual([])
    })
  })

  // The folder is the source, which only holds if the folder and the component
  // agree. A file nobody imports is invisible; an import with no file breaks the
  // build. Both are easy to do by hand and neither is visible in review.
  describe('the icons folder is the icon set', () => {
    const dir = path.join(SRC, 'components/Icon/icons')
    const component = fs.readFileSync(path.join(SRC, 'components/Icon/Icon.tsx'), 'utf8')
    const onDisk = fs.readdirSync(dir).filter(f => f.endsWith('.svg')).map(f => f.slice(0, -4)).sort()
    const imported = [...component.matchAll(/^import (\w+) from '\.\/icons\/([\w-]+)\.svg'$/gm)]

    it('imports every file, and every import has a file', () => {
      expect(onDisk.length).toBeGreaterThan(20)
      expect(imported.map(m => m[2]).sort()).toEqual(onDisk)
    })

    it('names each import after its file', () => {
      expect(imported.filter(m => m[1] !== m[2]).map(m => `${m[1]} <- ${m[2]}.svg`)).toEqual([])
    })

    it('lists every file in the SOURCE map', () => {
      const map = component.slice(component.indexOf('const SOURCE'), component.indexOf('export type IconName'))
      expect(onDisk.filter(n => !new RegExp(`\\b${n}\\b`).test(map))).toEqual([])
    })

    // The component sets the stroke and grows it as the icon shrinks. A width on
    // a shape would win over it and that icon alone would go sub-pixel at 16.
    it('never lets a shape carry its own stroke-width', () => {
      const offenders: string[] = []
      for (const n of onDisk) {
        const src = fs.readFileSync(path.join(dir, `${n}.svg`), 'utf8')
        const shapes = src.replace(/<svg\b[^>]*>/, '').replace(/<!--[\s\S]*?-->/g, '')
        if (/stroke-width=/.test(shapes)) offenders.push(`${n}.svg`)
      }
      expect(offenders).toEqual([])
    })

    // A literal here would not follow the theme. The ones that carry meaning are
    // written var(--token, #fallback): the token wins in the app, the fallback
    // shows when the file is opened on its own.
    it('writes meaningful colours as tokens with a fallback', () => {
      const offenders: string[] = []
      for (const n of onDisk) {
        const src = fs.readFileSync(path.join(dir, `${n}.svg`), 'utf8')
        const body = src.replace(/<!--[\s\S]*?-->/g, '')
        for (const m of body.matchAll(/(?:stroke|fill)="(#[0-9a-fA-F]{3,8})"/g)) {
          offenders.push(`${n}.svg  ${m[1]}`)
        }
      }
      expect(offenders).toEqual([])
    })
  })

  it('uses --text-on-emphasis only on a filled emphasis surface', () => {
    const offenders: string[] = []
    for (const f of COMPONENT_CSS) {
      const css = stripComments(fs.readFileSync(f, 'utf8'))
      for (const chunk of css.split('}')) {
        if (!chunk.includes('--text-on-emphasis') || !chunk.includes('{')) continue
        const [selRaw, body] = chunk.split('{')
        const sel = selRaw.trim().split('\n').map(s => s.trim()).join(' ')
        if (INLINE_FILLED.some(s => sel.includes(s))) continue
        if (SOLID_FILL.test(body)) continue
        offenders.push(`${rel(f)}  ${sel}`)
      }
    }
    expect(offenders).toEqual([])
  })

  // ── The graph's literals ───────────────────────────────────────────────────
  //
  // graph-layout.ts is the one place allowed to hold colour literals, because
  // CommitGraph.dimColor() fades an edge by arithmetic on the hex string and a
  // var() makes its regex fail. It resolves the tokens at runtime, so the
  // literals are only a fallback — for jsdom, and for the frame before the
  // stylesheet lands.
  //
  // A fallback that nothing reads on a normal run is a fallback nobody notices
  // going stale: this file kept the ten pre-aqua lanes and the old GitHub canvas
  // through the whole migration. These two tests are how it gets noticed.
  describe('graph-layout fallbacks still mirror the seeds', () => {
    const layout = fs.readFileSync(
      path.join(SRC, 'components/CommitGraph/graph-layout.ts'), 'utf8')
    // The default block's body only — the same cut the seed-parity tests take.
    // Slicing on markers would not do it: the default block's own selector is
    // `:root,` and `[data-theme="aqua-dark"]` on two lines, so the first
    // data-theme in the file opens the default block rather than closing it.
    const css = fs.readFileSync(TOKENS, 'utf8')
    const base = /^(?::root,?[^{]*)\{([\s\S]*?)^\}/m.exec(css)![1]
    const seed = (name: string) =>
      new RegExp(`--seed-${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(base)![1].toUpperCase()

    it('lists the ten lanes in order', () => {
      const got = [...(/const LANE_FALLBACK = \[([\s\S]*?)\n\]/.exec(layout)![1])
        .matchAll(/'(#[0-9A-Fa-f]{6})'/g)].map(m => m[1].toUpperCase())
      const want = Array.from({ length: 10 }, (_, i) => seed(`lane-${i + 1}`))
      expect(got).toEqual(want)
    })

    it('dims toward the canvas seed', () => {
      const got = [...(/const CANVAS_FALLBACK[^=]*= \[([^\]]*)\]/.exec(layout)![1])
        .matchAll(/0x([0-9a-fA-F]{2})|\b(\d{1,3})\b/g)]
        .map(m => (m[1] ? parseInt(m[1], 16) : Number(m[2])))
      const c = seed('canvas')
      expect(got).toEqual([1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)))
    })
  })
})
