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
    /background(-color)?:[^;]*var\(--(accent|accent-emphasis|success|success-strong|success-emphasis|danger|danger-solid|purple|purple-deep|warning|install-bg|pr-merged|amend-confirm-bg|amend-cancel-bg)\)|background:\s*linear-gradient/

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
    const SIGNATURES: [string, string][] = [
      ['GitHub octocat', 'M8 0C3.58 0 0 3.58 0 8c0 3.54'],
      ['Git logo', 'M15.698 7.287 8.712.302'],
      ['VS Code ribbon', 'M70.912 99.317a6.223 6.223 0 0 0 4.96-.19'],
    ]

    it('holds every third-party path it claims to', () => {
      const src = fs.readFileSync(BRAND, 'utf8')
      for (const [label, sig] of SIGNATURES) {
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
      const icons = fs.readFileSync(path.join(SRC, 'components/Icon/Icon.tsx'), 'utf8')
      const names = [...icons.matchAll(/^\s{2}([a-zA-Z]+): \(C: Ink\)/gm)].map(m => m[1])
      expect(names.length).toBeGreaterThan(20)
      expect(names.filter(n => /vscode|github|gitlab|jetbrains/i.test(n))).toEqual([])
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
})
