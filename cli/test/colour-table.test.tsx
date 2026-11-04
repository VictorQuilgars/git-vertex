import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { THEME, LANES, SEEDS, mixOklab, isTruecolor } from '../src/ui/theme.js'

// One place a colour may be written — #76.
//
// Ink takes real values, not CSS variables, so the TUI cannot read `tokens.css`
// the way the app and the panel do. That is a constraint. What was a bug is
// that the values were then scattered: 63 literals across five files, 24
// distinct, so nothing could be changed without finding all of them and nothing
// could say when a change had been missed.
//
// It HAD been missed, three times — the splash screen, three surfaces in
// dfb01d3, and this. Which is why the issue's own conclusion was that the fix
// is a test, not one more pass by hand. This is it.

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '..', 'src')
const TABLE = join(SRC, 'ui', 'theme.ts')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return sources(p)
    return /\.tsx?$/.test(name) ? [p] : []
  })
}

const HEX = /#[0-9a-fA-F]{3,8}\b/g

describe('the palette is a table, and the table is the only place', () => {
  test('no colour is written anywhere but ui/theme.ts', () => {
    const offenders: string[] = []
    for (const file of sources(SRC)) {
      if (file === TABLE) continue
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        for (const hit of line.match(HEX) ?? []) {
          offenders.push(`${relative(join(HERE, '..'), file)}:${i + 1}  ${hit}`)
        }
      })
    }
    assert.deepEqual(offenders, [],
      'A colour outside ui/theme.ts. Give it a ROLE in the table and read it from '
      + `there — that is what makes the palette changeable in one edit.\n  ${offenders.join('\n  ')}`)
  })

  test('the guard can actually see one', () => {
    // A rule nothing can trip passes for the wrong reason.
    assert.equal('const c = "#0d1117"'.match(HEX)?.length, 1)
    assert.equal('const c = THEME.bg'.match(HEX), null)
  })
})

describe('what the table has to hold', () => {
  test('every role is a real colour', () => {
    for (const [role, value] of Object.entries(THEME)) {
      assert.match(value, /^#[0-9a-fA-F]{6}$/, `THEME.${role} is not a colour`)
    }
  })

  test('ten lanes, like the desktop, so a graph wraps at the same branch', () => {
    assert.equal(LANES.length, 10)
    for (const lane of LANES) assert.match(lane, /^#[0-9a-fA-F]{6}$/)
    assert.equal(new Set(LANES).size, 10, 'two lanes of the same colour are one lane')
  })

  test('the roles that must be told apart are told apart', () => {
    // The same trap the theme validator catches for the other two products:
    // added and removed the same colour means a diff that cannot be read.
    assert.notEqual(THEME.added, THEME.removed)
    assert.notEqual(THEME.added, THEME.modified)
    assert.notEqual(THEME.removed, THEME.modified)
    // And the selected row's text must not be the row's own colour.
    assert.notEqual(THEME.onSelected, THEME.selBg)
  })
})

// #76, the other half: the table is the DESKTOP's palette, not one of its own.
// It drifted once already — the TUI kept #0d1117/#3fb950/#f85149/#58a6ff for
// months after the seeds moved, because nothing compared the two.
describe('the palette is the desktop\'s', () => {
  const TOKENS = readFileSync(join(HERE, '..', '..', 'src', 'renderer', 'src', 'tokens.css'), 'utf8')

  /** The seeds of the default theme's block — `:root, [data-theme="aqua-dark"]`. */
  function rootSeeds(): Record<string, string> {
    const start = TOKENS.indexOf(':root,')
    assert.notEqual(start, -1, 'tokens.css has no :root block')
    const block = TOKENS.slice(start, TOKENS.indexOf('}', start))
    const out: Record<string, string> = {}
    for (const m of block.matchAll(/--seed-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) out[m[1]] = m[2].toUpperCase()
    return out
  }

  test('SEEDS is tokens.css\'s default theme, key for key', () => {
    const upper = Object.fromEntries(Object.entries(SEEDS).map(([k, v]) => [k, v.toUpperCase()]))
    assert.deepEqual(upper, rootSeeds(),
      'cli/src/ui/theme.ts SEEDS no longer matches the :root seeds of src/renderer/src/tokens.css — copy them across.')
    assert.equal(Object.keys(SEEDS).length, 24)
  })

  test('the lanes are the seed lanes, in order', () => {
    assert.deepEqual(LANES, Array.from({ length: 10 }, (_, i) => SEEDS[`lane-${i + 1}` as keyof typeof SEEDS]))
  })

  test('no role paints a surface or a well', () => {
    // At 256 colours canvas, surface and sunken land on one cell (#76): a role
    // that is one of the two would be drawn as the canvas, or as a smudge.
    const forbidden = new Set<string>([SEEDS.surface, SEEDS.sunken])
    for (const [role, value] of Object.entries(THEME)) assert.ok(!forbidden.has(value), `THEME.${role} is a surface seed`)
  })

  test('the oklab mix is the browser\'s', () => {
    // Read off Chromium's color-mix(in oklab, …) for these very pairs.
    assert.equal(mixOklab('#1C222C', 80, '#3FD8C2'), '#284247')
    assert.equal(mixOklab('#1C222C', 60, '#3FD8C2'), '#316564')
    assert.equal(mixOklab('#9B8FF5', 80, '#E8ECF1'), '#A9A2F6')
    assert.equal(mixOklab('#E0A25C', 74, '#E8ECF1'), '#E3B686')
    assert.equal(mixOklab('#0E1116', 87, '#5FC98F'), '#182524')
    assert.equal(mixOklab('#F0645C', 30, '#3FD8C2'), '#9BBBA4')
    assert.equal(mixOklab('#3FD8C2', 100, '#000000'), '#3FD8C2')
  })

  test('truecolor is what COLORTERM says, and nothing else', () => {
    assert.equal(isTruecolor({ COLORTERM: 'truecolor' }), true)
    assert.equal(isTruecolor({ COLORTERM: '24bit' }), true)
    assert.equal(isTruecolor({}), false)
    assert.equal(isTruecolor({ COLORTERM: 'yes' }), false)
  })

  test('focus is not the colour of rest', () => {
    // The old palette told them apart by green vs blue; the new success and
    // accent are both aqua-greens, so a title at rest must not be the accent.
    assert.notEqual(THEME.title, THEME.menuOn)
  })
})
