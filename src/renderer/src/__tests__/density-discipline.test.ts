import fs from 'fs'
import path from 'path'
import { DENSITIES, resolveDensity } from '../contexts/SettingsContext'
import { ROW_HEIGHT_FALLBACK, REF_LINE_FALLBACK } from '../components/CommitGraph/graph-layout'
import { NODE_RADIUS } from '../components/CommitGraph/graph-parts'

// The density tier (#195), held to the same kind of rule as the themes next to
// it — and it needs its own, because `token-discipline.test.ts` polices only
// `:root` and `[data-theme="…"]` blocks. A `[data-density]` block is invisible
// to it: the one block in tokens.css that nothing was watching.
//
// What a theme is to colour, a density is to LENGTH. That is the whole rule,
// and everything below is a way of saying it:
//
//   a density block declares lengths, of tokens the default already has,
//   for a density the app can actually select.

const SRC = path.resolve(__dirname, '..')
const css = fs.readFileSync(path.join(SRC, 'tokens.css'), 'utf8')

/** Every `[data-density="x"] { … }` block, as (id, body). */
function densityBlocks(): [string, string][] {
  return [...css.matchAll(/^\[data-density="([^"]+)"\][^{]*\{([\s\S]*?)^\}/gm)]
    .map(m => [m[1], m[2]] as [string, string])
}

/** The declarations of a block, as (token, value). */
function declarations(body: string): [string, string][] {
  return [...body.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gm)]
    .map(m => [m[1], m[2].trim()] as [string, string])
}

/** The default block — `:root, [data-theme="aqua-dark"] { … }`, the first one. */
const defaultBody = /^(?::root,?[^{]*)\{([\s\S]*?)^\}/m.exec(css)![1]
const defaultTokens = new Set(declarations(defaultBody).map(([t]) => t))

describe('a density is a block of lengths', () => {
  test('there is one, and it is the compact one', () => {
    const ids = densityBlocks().map(([id]) => id)
    expect(ids).toEqual(['compact'])
    // Comfortable deliberately has NO block: it is what `:root` already holds,
    // so this feature arriving does not move an existing install. Selecting it
    // writes the attribute anyway, which selects nothing and inherits.
    expect(DENSITIES).toEqual(['comfortable', 'compact'])
  })

  test('every declaration is a plain length — a colour cannot get in here', () => {
    // The rule that replaces the theme test's "seeds and nothing else". A
    // value that is a var(), a color-mix() or a hex is refused whatever it is
    // called: `--text-base` is a size and `--text-primary` is a colour, so the
    // NAME cannot be what decides.
    const LENGTH = /^\d+(\.\d+)?(px|rem|em)$|^\d+(\.\d+)?$/
    const offenders: string[] = []
    for (const [id, body] of densityBlocks()) {
      for (const [token, value] of declarations(body)) {
        if (!LENGTH.test(value)) offenders.push(`[data-density="${id}"] ${token}: ${value}`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('it only redefines tokens the default already declares', () => {
    // A token that exists at one density and not at the other is a rule that
    // silently disappears when the setting is changed back.
    const strays: string[] = []
    for (const [id, body] of densityBlocks()) {
      for (const [token] of declarations(body)) {
        if (!defaultTokens.has(token)) strays.push(`[data-density="${id}"] ${token}`)
      }
    }
    expect(strays).toEqual([])
  })

  test('compact is tighter than the default, never looser', () => {
    const px = (body: string, token: string): number | null => {
      const m = new RegExp(`^\\s*${token}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`, 'm').exec(body)
      return m ? parseFloat(m[1]) : null
    }
    const [, compact] = densityBlocks().find(([id]) => id === 'compact')!
    const looser: string[] = []
    for (const [token] of declarations(compact)) {
      const here = px(compact, token), there = px(defaultBody, token)
      if (here !== null && there !== null && here >= there) {
        looser.push(`${token}: ${here}px is not tighter than the default ${there}px`)
      }
    }
    expect(looser).toEqual([])
  })

  test('the small end of the type scale is the same at both densities', () => {
    // The audit's finding was that metadata at 9 and 10px was too small to
    // read. Compact takes away air, not letters — a density that answered the
    // complaint by making the smallest text smaller would be a regression
    // wearing a setting.
    const [, compact] = densityBlocks().find(([id]) => id === 'compact')!
    const moved = declarations(compact)
      .map(([t]) => t)
      .filter(t => ['--text-micro', '--text-tiny', '--text-xs', '--text-sm'].includes(t))
    expect(moved).toEqual([])
  })

  test('the floor the audit asked for is raised, in both', () => {
    expect(/--text-micro:\s*10px/.test(defaultBody)).toBe(true)
    expect(/--text-tiny:\s*11px/.test(defaultBody)).toBe(true)
  })
})

describe('the graph reads the same rows the stylesheet draws', () => {
  // graph-layout does arithmetic on the two row heights, so it reads them back
  // out of the stylesheet — and falls back to a literal where there is none
  // (jsdom). A fallback that drifts from `:root` lays every test's graph out at
  // a height the app never uses. Same guard as the lane-colour fallbacks.
  test('the fallbacks mirror the default block', () => {
    expect(defaultBody).toContain(`--row-graph: ${ROW_HEIGHT_FALLBACK}px`)
    expect(defaultBody).toContain(`--row-ref: ${REF_LINE_FALLBACK}px`)
  })

  test('no density makes the graph rows shorter than its nodes', () => {
    // The node is a circle of NODE_RADIUS at the centre of the row. Rows are
    // contiguous, so two consecutive nodes are --row-graph apart: below
    // 2 × NODE_RADIUS they touch, and then they overlap into a smear no
    // setting explains. Compact sits exactly on the floor, which is why this
    // is a test and not a comment.
    const floor = 2 * NODE_RADIUS
    const rowGraph = (body: string) => {
      const m = /--row-graph:\s*(\d+)px/.exec(body)
      return m ? parseInt(m[1], 10) : null
    }
    const tooShort: string[] = []
    for (const [id, body] of [['default', defaultBody] as [string, string], ...densityBlocks()]) {
      const h = rowGraph(body)
      if (h !== null && h < floor) tooShort.push(`${id}: --row-graph ${h}px < ${floor}px`)
    }
    expect(tooShort).toEqual([])
  })

  test('the row tokens are declared once, where the density can move them', () => {
    for (const token of ['--row-graph', '--row-ref', '--row-ctl', '--row-field']) {
      expect(defaultTokens.has(token)).toBe(true)
    }
  })

  test('no stylesheet hard-codes the graph row beside the token', () => {
    // The conversion's own guard: a row that kept its literal stays at the
    // comfortable height while everything around it shrinks, which reads as a
    // misaligned graph rather than as a setting that half-worked.
    const graphCss = fs.readFileSync(
      path.join(SRC, 'components', 'CommitGraph', 'CommitGraph.css'), 'utf8')
    const rows = [...graphCss.matchAll(/^\s*height: *(\d+)px/gm)].map(m => m[1])
    expect(rows.filter(v => v === '28' || v === '22')).toEqual([])
  })
})

describe('resolveDensity', () => {
  test('accepts the two it offers', () => {
    expect(resolveDensity('compact')).toBe('compact')
    expect(resolveDensity('comfortable')).toBe('comfortable')
  })

  test('anything else is the default, never an attribute nothing styles', () => {
    // settings.json is a file on disk and the mirror is localStorage; both can
    // hold a value this build does not know — a density removed, or typed by
    // hand. `data-density="cosy"` selects no rule, which is only harmless
    // because it lands on the comfortable default anyway.
    for (const bad of ['cosy', '', null, undefined, 'COMPACT', 'compact ']) {
      expect(resolveDensity(bad as string)).toBe('comfortable')
    }
  })
})
