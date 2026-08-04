import * as fs from 'fs'
import * as path from 'path'
import { splashHtml, SPLASH_ANIMATION_MS, SPLASH_STILL_MS } from '../splash'

// The splash runs in the MAIN process, before any renderer exists, so it cannot
// read tokens.css — its palette and its mark are written out by hand.
//
// That is exactly how it missed the aqua/iris migration and went on showing the
// old GitHub palette at every launch, which is the first thing a user sees. This
// file is the guard that stops it happening twice.

const TOKENS = path.resolve(__dirname, '../../renderer/src/tokens.css')
const ICON = path.resolve(__dirname, '../../../resources/icon.svg')

const seeds = (() => {
  const css = fs.readFileSync(TOKENS, 'utf8')
  // The default block only — a theme's seeds are not what the splash snapshots.
  // Both markers are matched at the START of a line: the file's header comment
  // names the light theme too, and indexOf would find that first.
  const start = /^:root,$/m.exec(css)!.index
  const end = /^\[data-theme="aqua-light"\]/m.exec(css)!.index
  const block = css.slice(start, end)
  return Object.fromEntries(
    [...block.matchAll(/--seed-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{3,8})/g)].map(m => [m[1], m[2].toUpperCase()]),
  )
})()

const html = splashHtml('9.9.9')

describe('splash palette', () => {
  it('reads the seeds it is meant to compare against', () => {
    expect(Object.keys(seeds).length).toBeGreaterThan(10)
    expect(seeds.aqua).toMatch(/^#[0-9A-F]{6}$/)
  })

  // Each --var in the splash maps to the seed it snapshots.
  const MIRRORED: [string, string][] = [
    ['--canvas', 'canvas'],
    ['--surface', 'surface'],
    ['--aqua', 'aqua'],
    ['--iris', 'iris'],
    ['--text', 'text'],
    ['--muted', 'text-3'],
  ]

  it.each(MIRRORED)('%s still equals the %s seed', (cssVar, seed) => {
    const m = new RegExp(`${cssVar}:\\s*(#[0-9A-Fa-f]{3,8})`).exec(html)
    expect(m).not.toBeNull()
    expect(m![1].toUpperCase()).toBe(seeds[seed])
  })

  it('carries no colour the palette does not define', () => {
    const inSplash = new Set(
      [...html.matchAll(/#[0-9A-Fa-f]{6}\b/g)].map(m => m[0].toUpperCase()),
    )
    const known = new Set([...Object.values(seeds), '#FFFFFF'])
    expect([...inSplash].filter(c => !known.has(c))).toEqual([])
  })

  // The splash draws the mark by hand too, for the same reason. Two differences
  // are legitimate and normalised away: it uses its own colour vars, and it
  // groups each arm's three segments into ONE path so a single dash pattern can
  // draw the whole arm. Segments are therefore compared, not path elements.
  it('draws the same mark as resources/icon.svg', () => {
    const shapes = (s: string) =>
      [...s.matchAll(/<(path|circle)\b([^>]*)>/g)]
        .map(m => m[2])
        .filter(a => !a.includes('width="512"'))
        .flatMap(a => {
          const d = /\bd="([^"]+)"/.exec(a)
          if (d) {
            return d[1].split(/(?=M)/).map(seg => `d=${seg.trim()}`).filter(x => x !== 'd=')
          }
          return [[...a.matchAll(/\b(cx|cy|r|transform)="([^"]+)"/g)]
            .map(x => `${x[1]}=${x[2]}`).join(' ')]
        })
        .filter(Boolean)
        .sort()

    const fromSplash = shapes(html.slice(html.indexOf('<svg class="mark"')))
    const fromIcon = fs.readFileSync(ICON, 'utf8')
    expect(fromSplash.length).toBeGreaterThan(6)
    expect(fromSplash).toEqual(shapes(fromIcon))
  })

  // The window the user actually lands in carries a snapshot too — it is what
  // shows between the window appearing and the renderer's first paint, so it
  // was flashing the old GitHub canvas at the end of every launch.
  it('opens the main window on the canvas seed', () => {
    const main = fs.readFileSync(path.resolve(__dirname, '../index.ts'), 'utf8')
    const m = /backgroundColor: '(#[0-9A-Fa-f]{6})'/.exec(main)
    expect(m).not.toBeNull()
    expect(m![1].toUpperCase()).toBe(seeds.canvas)
  })
})

// ── The hold ────────────────────────────────────────────────────────────────
//
// index.ts keeps the main window back until the splash has played, because on
// macOS the app is ready in well under a second and the story was being cut off
// — worse, the delay used to sit on the splash, which is alwaysOnTop, so it
// floated over an app that was already live.
//
// That hold is a NUMBER in one file and a set of CSS durations in another, and
// the whole reason the durations were hoisted into constants is that the two
// must not drift. These tests are what makes that true rather than intended.
describe('splash timing', () => {
  // Each segment of every `animation:` shorthand in the emitted CSS. Timing
  // functions are dropped FIRST: `cubic-bezier(.34,1.56,.64,1)` carries commas,
  // and splitting the shorthand without removing it merges two animations into
  // one — which is how `vertex-in` first read as an infinite loop.
  const segments = (() => {
    const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'))
    const out: { name: string; ms: number[]; loops: boolean }[] = []
    for (const decl of css.matchAll(/animation:\s*([^;]+);/g)) {
      for (const seg of decl[1].replace(/[a-z-]+\([^)]*\)/g, '').split(',')) {
        // The name is the first token, always. Stripping keywords instead
        // would eat the `in` of `vertex-in`, which sits behind a hyphen and
        // so carries a word boundary of its own.
        const name = /^\s*([a-z][a-z-]*)/.exec(seg)
        if (!name) continue
        out.push({
          name: name[1],
          ms: [...seg.matchAll(/(\d+)ms/g)].map(m => Number(m[1])),
          loops: /\binfinite\b/.test(seg),
        })
      }
    }
    return out
  })()

  // A delay set on its own selector rather than inside the shorthand.
  const loneDelays = [...html.matchAll(/animation-delay:\s*(\d+)ms/g)].map(m => Number(m[1]))

  it('parses the stylesheet it is asserting about', () => {
    expect(segments.length).toBeGreaterThan(5)
    expect(segments.map(s => s.name)).toContain('draw')
  })

  // A shorthand is `name <duration> [timing] [delay]`, so a segment ends at the
  // sum of its times.
  const endOf = (name: string) =>
    segments.filter(s => s.name === name).map(s => s.ms.reduce((a, b) => a + b, 0))

  it('waits for the last element of the sequence, not the first', () => {
    const ends = segments.filter(s => !s.loops).map(s => s.ms.reduce((a, b) => a + b, 0))
    expect(SPLASH_ANIMATION_MS).toBe(Math.max(...ends))
  })

  it('waits for the elements whose delay is written on a sibling selector', () => {
    // Two families set `animation-delay` apart from the shorthand, so their end
    // is that delay plus THEIR rule's duration — not the sheet's longest. The
    // count is asserted so a third family cannot be added without landing here.
    expect(loneDelays.length).toBe(4)
    const [iris, ...nodes] = loneDelays
    expect(iris + Math.max(...endOf('draw'))).toBeLessThanOrEqual(SPLASH_ANIMATION_MS)
    for (const n of nodes) {
      expect(n + Math.max(...endOf('pop'))).toBeLessThanOrEqual(SPLASH_ANIMATION_MS)
    }
  })

  it('never waits for an animation that loops forever', () => {
    // `breathe` and `sweep` say "still working". Waiting for them would hang.
    expect(segments.filter(s => s.loops).map(s => s.name).sort()).toEqual(['breathe', 'sweep'])
    expect(segments.some(s => s.name === 'vertex-in' && !s.loops)).toBe(true)
  })

  it('still holds a beat when the system asks for reduced motion', () => {
    // The media query puts everything at its final state, so there is nothing
    // to wait for — but a one-frame flash reads as a glitch.
    expect(html).toContain('prefers-reduced-motion: reduce')
    expect(SPLASH_STILL_MS).toBeGreaterThan(300)
    expect(SPLASH_STILL_MS).toBeLessThan(SPLASH_ANIMATION_MS)
  })

  it('leaves no CSS duration written as a literal', () => {
    // A duration typed into the stylesheet is a duration the hold cannot see.
    const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'))
    expect([...css.matchAll(/animation[^;]*?\b(\d*\.\d+s|\d+s)\b/g)].map(m => m[0]))
      .toEqual([])
  })
})
