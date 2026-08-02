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
