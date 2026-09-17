import fs from 'fs'
import path from 'path'

// The layout is the fourth token family (#240), and like the density it is a
// block that token-discipline does not look inside: that test polices `:root`
// and `[data-theme]` blocks. So this one says what may be in it — lengths,
// and references to tokens the default declares — and that the default is the
// rendering the app had, so the family arriving moved nobody who turns it off.

const TOKENS = path.resolve(__dirname, '../tokens.css')
const css = fs.readFileSync(TOKENS, 'utf8')

/** Every `[data-layout="x"] … { … }` block, as (selector, body). */
function layoutBlocks(): Array<[string, string]> {
  return [...css.matchAll(/^(\[data-layout="[^"]+"\][^{]*)\{([\s\S]*?)^\}/gm)].map(m => [m[1].trim(), m[2]])
}
function declarations(body: string): Array<[string, string]> {
  return [...body.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gm)].map(m => [m[1], m[2].trim()])
}
const LENGTH = /^\d+(?:\.\d+)?px$/
const REF = /^var\((--[a-z0-9-]+)\)$/
const rootBody = css.match(/^:root,?[^{]*\{([\s\S]*?)^\}/m)![1]
const rootTokens = new Set(declarations(rootBody).map(d => d[0]))

describe('the layout family', () => {
  test('there are blocks and flush, and nothing else', () => {
    const ids = layoutBlocks().map(([sel]) => sel.match(/data-layout="([^"]+)"/)![1])
    expect(new Set(ids)).toEqual(new Set(['blocks', 'flush']))
  })

  // Flush is what :root carries, and it has a block only because custom
  // properties inherit: the picker's flush preview sits under a blocks <html>
  // and drew the blocks. So the block must say exactly what :root says, and
  // must say everything blocks says, or something leaks through.
  test('the flush block repeats :root, to the byte, and covers everything blocks sets', () => {
    const root = Object.fromEntries(declarations(rootBody))
    const flush = Object.fromEntries(declarations(layoutBlocks().find(([sel]) => sel.includes('data-layout="flush"'))![1]))
    for (const [token, value] of Object.entries(flush)) expect([token, value]).toEqual([token, root[token]])
    const blocksTokens = layoutBlocks().filter(([sel]) => sel.includes('data-layout="blocks"')).flatMap(([, body]) => declarations(body).map(d => d[0]))
    for (const token of blocksTokens) expect(flush).toHaveProperty(token)
  })

  test('every declaration is a plain length or a reference to a token the default declares', () => {
    const offenders: string[] = []
    for (const [sel, body] of layoutBlocks()) {
      for (const [token, value] of declarations(body)) {
        const ref = value.match(REF)
        if (LENGTH.test(value)) continue
        if (ref && rootTokens.has(ref[1])) continue
        offenders.push(`${sel} ${token}: ${value}`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('it only redefines tokens the default already declares', () => {
    const strays: string[] = []
    for (const [sel, body] of layoutBlocks()) {
      for (const [token] of declarations(body)) if (!rootTokens.has(token)) strays.push(`${sel} ${token}`)
    }
    expect(strays).toEqual([])
  })

  test('the default is flush: no gap, no radius, a 1px edge, the canvas as shell', () => {
    const root = Object.fromEntries(declarations(rootBody))
    expect(root['--pane-gap']).toBe('0px')
    expect(root['--pane-radius']).toBe('0px')
    expect(root['--pane-edge']).toBe('1px')
    expect(root['--bg-shell']).toBe('var(--bg-canvas)')
  })

  test('blocks has a gap and a radius, and takes the edge away', () => {
    const [, body] = layoutBlocks().find(([sel]) => sel.includes('data-layout="blocks"') && !sel.includes('data-density'))!
    const b = Object.fromEntries(declarations(body))
    expect(parseFloat(b['--pane-gap'])).toBeGreaterThan(0)
    expect(parseFloat(b['--pane-radius'])).toBeGreaterThan(0)
    expect(b['--pane-edge']).toBe('0px')
  })

  test('compact takes the frame in, never lets it out', () => {
    const blocks = Object.fromEntries(declarations(layoutBlocks().find(([sel]) => sel.includes('data-layout="blocks"') && !sel.includes('data-density'))![1]))
    const compact = layoutBlocks().find(([sel]) => sel.includes('data-density="compact"'))
    expect(compact).toBeDefined()
    for (const [token, value] of declarations(compact![1])) {
      expect(parseFloat(value)).toBeLessThanOrEqual(parseFloat(blocks[token]))
    }
  })

  // The four pane edges are the ones the frame replaces; a bare `1px` there
  // would draw a line through the gap in the blocks layout.
  test('the pane edges are drawn with the edge token', () => {
    const SRC = path.resolve(__dirname, '..')
    const edges: Array<[string, RegExp]> = [
      ['components/Sidebar/Sidebar.css', /^\s*border-right:\s*var\(--pane-edge\) solid/m],
      ['components/RightPanel/RightPanel.css', /^\s*border-left:\s*var\(--pane-edge\) solid/m],
      ['components/Toolbar/Toolbar.css', /^\s*border-bottom:\s*var\(--pane-edge\) solid/m],
      ['components/StatusBar/StatusBar.css', /^\s*border-top:\s*var\(--pane-edge\) solid/m],
    ]
    for (const [file, re] of edges) {
      expect(fs.readFileSync(path.join(SRC, file), 'utf8')).toMatch(re)
    }
  })
})
