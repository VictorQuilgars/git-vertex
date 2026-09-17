import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// The shipped UI is English-only (CLAUDE.md, since v1.24.0), and a new French
// string is a bug rather than a translation.
//
// The TUI predates that rule and kept fifty-one sites of it — a whole help
// panel, every status label, thirteen error messages from the service layer
// (#77). Translating them once is not the fix: the desktop and the panel were
// swept too, and the CLI is where it came back, because nothing was looking.
// This is what looks.
//
// It reads the SOURCE rather than a rendered frame on purpose. A string only
// some branch of some mode reaches would never appear in a screenshot test, and
// those are exactly the ones that survived the last two sweeps.

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '..', 'src')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return sources(p)
    return /\.tsx?$/.test(name) ? [p] : []
  })
}

/**
 * The accented letters French uses and English does not.
 *
 * Deliberately not a word list: a word list is a guess at which French will be
 * written next, and the one that broke this rule twice was never on it. Anything
 * that renders with an accent is either French or a proper noun, and the CLI
 * writes no proper noun with one.
 */
const ACCENTED = /[àâäéèêëîïôöùûüÿçÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇ]/

/**
 * French that carries no accent, so the letters above cannot see it. This one IS
 * a word list, and it only has to hold the words this codebase actually reached
 * for — every entry below was in `src/` before #77.
 */
const UNACCENTED = [
  'aide', 'aucun', 'aucune', 'branche', 'fichier', 'fichiers', 'graphe',
  'indexer', 'modifs', 'nouvelle', 'panneaux', 'quitter', 'recharger',
  'naviguer', 'revenir', 'supprimer', 'touche', 'valider', 'defiler',
  'annuler', 'creer',
  // Stems, not whole words. `${n} modif${n !== 1 ? 's' : ''}` renders as
  // "modifs" and contains neither: a word list matched against SOURCE has to
  // hold what is WRITTEN, and a template writes the stem. That one survived the
  // first pass of #77 and was caught by looking at a rendered frame, which is
  // the lesson this comment exists to keep.
  'modif', 'distantes', 'locales',
  // NOT 'sequence': it is English too, and the French one carried an accent —
  // the rule above already had it. A word list earns its place only where the
  // accented rule cannot reach.
]

/** A line's worth of evidence, for a failure that has to be actionable. */
function offenders(): string[] {
  const out: string[] = []
  for (const file of sources(SRC)) {
    const rel = relative(join(HERE, '..'), file)
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const word = UNACCENTED.find(w => new RegExp(`\\b${w}\\b`, 'i').test(line))
      if (ACCENTED.test(line) || word) out.push(`${rel}:${i + 1}  ${line.trim().slice(0, 90)}`)
    })
  }
  return out
}

describe('the TUI is English-only, like the rest of the shipped UI', () => {
  test('no French reaches the screen, nor the errors behind it', () => {
    const found = offenders()
    assert.deepEqual(found, [],
      'French in the CLI sources. The shipped UI is English-only since v1.24.0 '
      + '(CLAUDE.md); translate it rather than adding it to a map — the CLI has no '
      + `i18n and is not getting one for this.\n  ${found.join('\n  ')}`)
  })

  test('the guard can actually see French', () => {
    // A rule nothing can trip is a rule that passes for the wrong reason. Both
    // halves are exercised: the accent, and the word list behind it.
    assert.ok(ACCENTED.test("Rien d’indexé"), 'the accented half')
    assert.ok(UNACCENTED.some(w => /\bbranche\b/i.test('Aucune branche') && w === 'branche'),
      'the unaccented half')
    assert.ok(!ACCENTED.test('No branches'), 'English passes')
    assert.ok(!UNACCENTED.some(w => new RegExp(`\\b${w}\\b`, 'i').test('No branches')), 'English passes')
  })
})
