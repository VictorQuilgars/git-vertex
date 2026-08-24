import * as fs from 'fs'
import * as path from 'path'

// Every class a component asks for has to have a rule somewhere.
//
// This exists because three of them stopped having one. Editing a stylesheet
// by locating two strings and replacing everything between them swallowed the
// branch tree's rules, and the only visible symptom was a folder's count
// sticking to its name — "feat2" — because without its rule the row was not a
// flex line at all. The other two were invisible until something failed.
//
// A missing rule cannot be caught by the type checker, and it does not throw:
// it just draws the wrong thing, quietly, in a place nobody happens to be
// looking.

const ROOT = path.resolve(__dirname, '..')

/** Every `.css` in the renderer, as one body of rules. */
function allCss(): string {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { if (e.name !== '__tests__') walk(p) }
      else if (e.name.endsWith('.css')) out.push(fs.readFileSync(p, 'utf8'))
    }
  }
  walk(ROOT)
  return out.join('\n')
}

/** Every `.tsx` under the renderer, minus its tests. */
function components(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { if (e.name !== '__tests__') walk(p) }
      else if (e.name.endsWith('.tsx')) out.push(p)
    }
  }
  walk(ROOT)
  return out
}

const CSS = allCss()
const defined = new Set([...CSS.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)].map(m => m[1]))

/**
 * The prefixes this repository writes its component classes with. Limiting it
 * to those keeps the check honest: a class from a third-party stylesheet, or
 * one built at runtime, is not this test's business.
 */
const OURS = /^(sb|cg|idv|pr|rp|cm|ir|pdrawer|chip|mchip|bstrip|tb|cv|ctx)-/

/**
 * Classes that were already asking for a rule nobody had written when this
 * check was added. They are debt, not decisions: each is either dead markup or
 * a name that lost its stylesheet long before this test existed. Deleting one
 * from this set and finding the test still passes means it has been dealt with.
 */
const KNOWN_UNSTYLED = new Set([
  'sb-item', 'idv-block', 'idv-close',
  'rp-banner-icon', 'rp-commit-actions', 'rp-file-status', 'rp-section', 'rp-section-title',
])

describe('every class a component uses has a rule', () => {
  test('no component asks for a class no stylesheet defines', () => {
    const missing: string[] = []
    for (const file of components()) {
      const src = fs.readFileSync(file, 'utf8')
      // Only LITERAL class names: `className="a b"` and the static part of a
      // template. A name assembled at runtime is not checkable here.
      const literals = [
        ...[...src.matchAll(/className="([^"]*)"/g)].map(m => m[1]),
        ...[...src.matchAll(/className=\{`([^`$]*)/g)].map(m => m[1]),
      ]
      for (const group of literals) {
        for (const cls of group.split(/\s+/)) {
          // A trailing `-` is the static half of a template — `idv-state--${x}`
          // — not a class anybody wrote.
          if (!cls || cls.endsWith('-') || !OURS.test(cls) || defined.has(cls)) continue
          if (KNOWN_UNSTYLED.has(cls)) continue
          missing.push(`${path.relative(ROOT, file)}  .${cls}`)
        }
      }
    }
    expect([...new Set(missing)].sort()).toEqual([])
  })
})
