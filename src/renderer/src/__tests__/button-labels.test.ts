import * as fs from 'fs'
import * as path from 'path'

// An icon-only button with no title and no aria-label is anonymous: nothing on
// hover, nothing for a screen reader. This walks the real source so a newly
// added icon button fails here instead of shipping unlabelled.
//
// Buttons carrying a visible word are exempt — their own text is the label.

const ROOTS = [
  path.resolve(__dirname, '../components'),
  path.resolve(__dirname, '../../../../vscode-extension/src/webview'),
]

// Buttons whose visible text is a real word, so a tooltip would just repeat it.
const VISIBLE_WORD = /[A-Za-zÀ-ÿ]{3,}/

function tsxFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === '__tests__' ? [] : tsxFiles(p)
    return e.isFile() && p.endsWith('.tsx') ? [p] : []
  })
}

/** Yields [openingTag, innerHtml, lineNumber] for every <button> in a source file. */
function buttons(src: string): [string, string, number][] {
  const out: [string, string, number][] = []
  const re = /<button\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    // Walk to the '>' that closes the opening tag, ignoring any inside a JSX
    // expression container (onClick={() => f(a > b)} would otherwise fool us).
    let depth = 0
    let j = m.index
    while (j < src.length) {
      const c = src[j]
      if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) break
      j++
    }
    const end = src.indexOf('</button>', j)
    out.push([
      src.slice(m.index, j + 1),
      end === -1 ? '' : src.slice(j + 1, end),
      src.slice(0, m.index).split('\n').length,
    ])
  }
  return out
}

function visibleText(inner: string): string {
  return inner
    .replace(/<svg[\s\S]*?<\/svg>/g, '')   // icons carry no text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')  // JSX comments
    .trim()
}

describe('every icon-only button is labelled', () => {
  const files = ROOTS.flatMap(tsxFiles)

  test('the source tree was actually found', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  test('no icon-only button lacks both title and aria-label', () => {
    const offenders: string[] = []
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8')
      for (const [tag, inner, line] of buttons(src)) {
        if (tag.includes('title=') || tag.includes('aria-label=')) continue
        if (VISIBLE_WORD.test(visibleText(inner))) continue
        offenders.push(`${path.relative(process.cwd(), file)}:${line}`)
      }
    }
    // Dialog's "OK" is the one exemption: two letters, but plainly a label.
    const allowed = new Set(['src/renderer/src/components/Dialog/Dialog.tsx'])
    const real = offenders.filter(o => !allowed.has(o.split(':')[0]))
    expect(real).toEqual([])
  })
})
