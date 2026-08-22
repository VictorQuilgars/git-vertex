/**
 * The one judgement in "may this account bypass the rules protecting a
 * branch" — kept here, free of `electron` and `vscode`, because both products
 * ask the question and a twin that drifts would answer it differently.
 *
 * The fetching stays with each host (they have their own client and their own
 * headers). What they share is what to conclude from GitHub's answers.
 */

/** A repository with more protecting rulesets than this is not probed. */
export const RULESET_PROBE_CAP = 10

/**
 * What a list of `current_user_can_bypass` values means, one per ruleset that
 * protects the branch.
 *
 * `never` is the only value that means no. `always` and the pull-request-only
 * mode both mean yes here, because a merge from this pane IS a pull request —
 * so the test is against `never` rather than a list of the ways to say yes,
 * which also keeps a value GitHub has not shipped yet from reading as a
 * refusal.
 *
 * ANY ruleset is enough. Measured on this repository: a broad "protect main"
 * that nobody bypasses sits beside a narrow "review required (others only)"
 * that the owner does — demanding every ruleset be bypassable would call the
 * owner a non-bypasser on the very configuration the feature exists for. The
 * cost of the looser rule is a bypass button GitHub then refuses, inline,
 * which is this pane's standing contract.
 *
 * `null` — never `false` — when the answer is incomplete: no ruleset covers
 * the branch (the block is classic branch protection, which the rulesets do
 * not describe), or one of them could not be read. One unreadable ruleset
 * could be the one that matters, in either direction. The caller falls back
 * to its permission heuristic rather than asserting an unmeasured refusal.
 */
export function bypassVerdict(verdicts: readonly (string | null)[]): boolean | null {
  if (!verdicts.length) return null
  if (verdicts.some(v => v === null)) return null
  return verdicts.some(v => v !== 'never')
}
