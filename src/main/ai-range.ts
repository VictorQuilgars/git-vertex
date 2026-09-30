// ai-range.ts — a reading whose subject is a RANGE rather than a branch (#293).
//
// The readings were written for "what does this branch carry over its base",
// with the base worked out by resolveBase. Three entries on the side bar ask
// the same question of a base they choose themselves:
//
//   Explain unpushed changes         <upstream>..<branch>
//   Generate changelog since a tag   <tag>..<current branch>
//   Recompose commits                <base>..<branch>   (the base still resolved)
//
// Rather than a second parameter threaded through every call, store and host
// — which is how the two products drifted before — the subject itself says
// it: `base..tip`. Git refuses `..` in a ref name, so a subject with one can
// never be a branch, and every place that already carries "the branch" (the
// IPC call, the kept note's key, the changelog store's key, the VS Code tab's
// boot payload) carries the range unchanged.
//
// Free of `electron` and `vscode`, and imported by the renderer too: the side
// bar builds the subjects this module reads.

/**
 * Either end would be read by git as an OPTION (the rule git-core's
 * assertRef applies). A range puts a second, caller-chosen name on the
 * command line, so the readings refuse one before anything runs.
 */
export function optionLike(subject: string): boolean {
  const { tip, base } = readRange(subject)
  return tip.trimStart().startsWith('-') || !!base?.trimStart().startsWith('-')
}

/** A range subject, in git's own notation. */
export const rangeSubject = (base: string, tip: string): string => `${base}..${tip}`

/**
 * The tip a subject is about, and the base it names — none for a plain branch,
 * which is read against the base resolveBase works out.
 *
 * Three dots are git's other axis and not something any caller builds; they
 * are handed back whole rather than read as a two-dot range with a stray dot.
 */
export function readRange(subject: string): { tip: string; base?: string } {
  const at = subject.indexOf('..')
  if (at <= 0) return { tip: subject }
  const base = subject.slice(0, at)
  const tip = subject.slice(at + 2)
  if (!tip || tip.startsWith('.')) return { tip: subject }
  return { tip, base }
}
