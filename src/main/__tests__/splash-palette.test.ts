import * as fs from 'fs'
import * as path from 'path'
import { splashHtml } from '../splash'

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
    const fromIcon = shapes(fs.readFileSync(ICON, 'utf8'))
    expect(fromSplash.length).toBeGreaterThan(6)
    expect(fromSplash).toEqual(fromIcon)
  })
})
