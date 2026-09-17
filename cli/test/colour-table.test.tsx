import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { THEME, LANES } from '../src/ui/theme.js'

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
