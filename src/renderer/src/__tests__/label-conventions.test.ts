import * as fs from 'fs'
import * as path from 'path'

// The label conventions, enforced rather than documented.
//
// Lot V aligned the vocabulary of the two products after an audit found the
// same action carrying two different names depending on where you clicked, a
// command palette showing two identical entries, and a reset mode described in
// a way that says the opposite of what git does. None of that was caught by a
// test, so all of it drifted quietly.
//
// These checks walk the real sources, so the next label that breaks a
// convention fails here instead of shipping.

const TRANSLATIONS = path.resolve(__dirname, '../i18n/translations.ts')
const EXT_MANIFEST = path.resolve(__dirname, '../../../../vscode-extension/package.json')

const src = fs.readFileSync(TRANSLATIONS, 'utf8')
const enSrc = src.slice(src.indexOf('const en:'))

/**
 * Every entry of a catalogue half, as a key and the TEXT a user would read.
 *
 * Two forms, and reading only the first is how the emoji rule below policed
 * half the catalogue for a year: a plain `'key': 'value'`, and a function
 * whose body is a template literal — `(b) => \`Delete ${b}\`` — which is what
 * every label taking an argument is. Those were the ones carrying 🗑 🔀 🔗 ⛙,
 * unseen, in the same menus as the labels this test was passing.
 *
 * The template's `${...}` holes are dropped: what is checked is the prose
 * around them, and an interpolated branch name is not this test's business.
 */
function entries(half: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of half.matchAll(/'([a-zA-Z0-9._]+)':\s*'((?:[^'\\]|\\.)*)'/g)) {
    out.set(m[1], m[2])
  }
  for (const m of half.matchAll(/'([a-zA-Z0-9._]+)':\s*\([^)]*\)\s*=>\s*`([^`]*)`/g)) {
    if (!out.has(m[1])) out.set(m[1], m[2].replace(/\$\{[^}]*\}/g, '').trim())
  }
  return out
}

const en = entries(enSrc)

// A menu entry the user clicks — as opposed to a toast, a tooltip or a
// sentence. Those may legitimately be sentence case and carry a symbol.
const ACTION_KEY = /^(graph\.menu|sb\.branch|sb\.remote|sb\.wt)\.[a-zA-Z]+$/

describe('label conventions', () => {
  test('no action label starts with an emoji or a symbol', () => {
    // An emoji does not inherit the text colour, so it cannot follow the
    // hover/disabled state of its own row, and a screen reader announces it
    // ("cherry, Cherry-pick Commit"). Icons belong in an element, not a string.
    const offenders: string[] = []
    for (const [key, value] of en) {
      if (!ACTION_KEY.test(key)) continue
      const first = [...value][0]
      if (first && /[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Sm}\p{So}]/u.test(first)) {
        offenders.push(`${key} → ${value}`)
      }
    }
    expect(offenders).toEqual([])
  })

  // Interpolation here is a FUNCTION, not a template: `t(key, ...args)` calls
  // the value. A string with a {0} in it therefore renders the braces — which
  // is what "Browse {0} more themes" did on the theme card, in the shipped UI.
  test('no value fakes interpolation with a placeholder', () => {
    const offenders: string[] = []
    for (const [name, half] of [['fr', src.slice(0, src.indexOf('const en:'))], ['en', enSrc]] as const) {
      for (const m of half.matchAll(/^\s*'([a-zA-Z0-9._]+)':\s*(['"`])(.*?)\2\s*,\s*$/gm)) {
        if (/\{\s*\d+\s*\}|%[sd]\b/.test(m[3])) offenders.push(`${name}: ${m[1]} → ${m[3]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('no duplicate key in either half of the catalogue', () => {
    // A duplicate is not an error in a JS object literal: the last one silently
    // wins. `cp.empty` was declared twice, with two different texts, for months.
    for (const [name, half] of [['fr', src.slice(0, src.indexOf('const en:'))], ['en', enSrc]] as const) {
      const seen = new Set<string>()
      const dupes: string[] = []
      for (const m of half.matchAll(/^\s*'([a-zA-Z0-9._]+)':/gm)) {
        if (seen.has(m[1])) dupes.push(m[1])
        seen.add(m[1])
      }
      expect({ [name]: dupes }).toEqual({ [name]: [] })
    }
  })

  test('the shared commit actions read the same in both products', () => {
    // `src/renderer` is compiled into the desktop app and into the VS Code
    // panel, but the panel's context menu takes its wording from the
    // extension manifest. Nothing kept the two in step: six of these drifted.
    const manifest = JSON.parse(fs.readFileSync(EXT_MANIFEST, 'utf8'))
    const titles = new Map<string, string>(
      manifest.contributes.commands
        .filter((c: { command: string }) => c.command.includes('.commitMenu.'))
        .map((c: { command: string; title: string }) => [c.command.split('.').pop()!, c.title])
    )

    // extension command suffix → the app's translation key for the same action
    const SAME: Record<string, string> = {
      switchTo: 'checkout',
      createBranch: 'createBranch',
      createTag: 'createTag',
      createWorktree: 'createWorktree',
      modifyFromHere: 'interactiveRebase',
      reword: 'reword',
      cherryPick: 'cherryPick',
      revert: 'revert',
      drop: 'dropCommit',
      moveUp: 'moveUp',
      moveDown: 'moveDown',
      rebaseOnto: 'rebaseOntoCommit',
      pushToCommit: 'pushToCommit',
      copyShortHash: 'copyShortHash',
      copyFullHash: 'copyFullHash',
      copyMessage: 'copyMessage',
      createPatch: 'createPatch',
      copyPatch: 'copyPatch',
      openOnRemote: 'openOnRemote',
      compareWorking: 'compareWorking',
      selectForCompare: 'selectForCompare',
      compareWithSelected: 'compareWithSelected',
    }

    const mismatched: string[] = []
    for (const [suffix, key] of Object.entries(SAME)) {
      const extTitle = titles.get(suffix)
      const appLabel = en.get(`graph.menu.${key}`)
      if (!extTitle || !appLabel) {
        mismatched.push(`${suffix}: missing (extension=${extTitle}, app=${appLabel})`)
        continue
      }
      if (extTitle !== appLabel) {
        mismatched.push(`${suffix}: extension "${extTitle}" ≠ app "${appLabel}"`)
      }
    }
    expect(mismatched).toEqual([])
  })

  test('no two extension commands share a title', () => {
    // Two commands both called "Open in Git Vertex" gave the palette two
    // indistinguishable entries that did the same thing.
    const manifest = JSON.parse(fs.readFileSync(EXT_MANIFEST, 'utf8'))
    const byTitle = new Map<string, string[]>()
    for (const c of manifest.contributes.commands as { command: string; title: string }[]) {
      byTitle.set(c.title, [...(byTitle.get(c.title) ?? []), c.command])
    }
    const dupes = [...byTitle].filter(([, ids]) => ids.length > 1)
    expect(dupes).toEqual([])
  })

  test('the reset modes describe what git actually does', () => {
    // `--mixed` does not "keep unstaged changes": it unstages everything and
    // leaves the working copy alone. The old wording said the opposite of the
    // risk it carries.
    expect(en.get('graph.menu.resetMixed')).toMatch(/working copy/i)
    expect(en.get('graph.menu.resetMixed')).toMatch(/index/i)
    expect(en.get('graph.menu.resetSoft')).toMatch(/staged/i)
    expect(en.get('graph.menu.resetHard')).toMatch(/discard/i)
  })
})
