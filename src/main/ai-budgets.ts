// ai-budgets.ts — how much room each feature gives an answer, and how much
// more it gives a model that needs it (#183).
//
// The numbers were calibrated against one model, back when there was one. The
// comment they came from is worth keeping: at 128 tokens the configured model
// returned nothing THREE TIMES, because a reasoning model spends its budget
// thinking before it emits a single character — `finish_reason: length`, empty
// content, and an app that said "the model returned an empty response". 128
// failed, 512 barely cleared, 1024 left room.
//
// Since #169 any model can be wired to any feature, a local one that thinks
// out loud included, so a ceiling that suits one can strangle another. Hence
// the headroom: a multiplier the user can set, and that a truncation raises on
// its own — into a control they can then see and undo.
//
// Free of `electron` and `vscode`: both hosts read the same numbers, where
// before they kept a copy each and were free to drift.

import type { AIFeature } from './ai-resolve'

/** What each feature asks for, before any headroom. */
export const BASE_BUDGET: Record<AIFeature, number> = {
  // A commit message is a subject and maybe three lines.
  commit: 512,
  // Prose about a diff: a commit, a branch, a stash, the working tree.
  explain: 768,
  // A whole file comes back rewritten, markers resolved. By far the largest.
  conflict: 8192,
  // A list of hashes — short, but a reasoning model still thinks first.
  search: 1024,
  // One line of query vocabulary, and the same caveat.
  filter: 1024,
  pr: 1024,
  issue: 1024,
  changelog: 2048,
  compose: 2048,
}

/** The steps offered, and what they mean. Not a free-text number: nobody can
 *  calibrate one, and three named steps are a choice rather than a guess. */
export const HEADROOM_STEPS = [1, 2, 4] as const
export type Headroom = typeof HEADROOM_STEPS[number]

/** Where a feature's headroom is kept — the settings vocabulary of #70. */
export const headroomKey = (feature: AIFeature): string => `aiHeadroom:${feature}`

/** What the user (or a truncation) has settled on for this feature. */
export function headroomFor(
  settings: Record<string, string | undefined>, feature?: AIFeature,
): Headroom {
  if (!feature) return 1
  const raw = Number((settings[headroomKey(feature)] ?? '').trim())
  return (HEADROOM_STEPS as readonly number[]).includes(raw) ? raw as Headroom : 1
}

/** The room this call gets: the feature's own, times what it has learned. */
export function budgetFor(
  settings: Record<string, string | undefined>, feature?: AIFeature,
): number {
  const base = feature ? BASE_BUDGET[feature] : 512
  return base * headroomFor(settings, feature)
}

/**
 * The next step up, or null at the top.
 *
 * A truncation retries with more room rather than with the same — retrying
 * identically is how the empty answer repeated three times and told nobody
 * why.
 */
export function nextHeadroom(current: number): Headroom | null {
  const at = (HEADROOM_STEPS as readonly number[]).indexOf(current)
  if (at === -1) return HEADROOM_STEPS[1]
  return at + 1 < HEADROOM_STEPS.length ? HEADROOM_STEPS[at + 1] : null
}
