// issueBranch.ts — the branch name an issue suggests.
//
// Associating an issue with a branch has existed since v1.21.0; this is the
// other direction, and it is the one people reach for — you pick up an issue
// and you need a branch for it, not the reverse.
//
// The name is only ever a *suggestion*: the caller prompts with it, and what
// the user types wins. So this errs towards readable rather than towards
// clever, and it never invents a name it cannot defend — an issue with no
// title is just its reference.

/** How long a suggested name may get before it is cut on a word boundary. */
const MAX = 60

/** Fold accents onto their base letter, then replace runs of anything else. */
function slugify(text: string, keepCase: boolean): string {
  const folded = text.normalize('NFD').replace(/[̀-ͯ]/g, '')
  return (keepCase ? folded : folded.toLowerCase())
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * `123-the-title-in-kebab-case`, or just `123` when the issue has no title.
 *
 * The key is whatever its tracker calls the reference — `123` on GitHub,
 * `PROJ-421` on a tracker that uses keys — and **its case is kept**, because a
 * key is a name rather than prose: `PROJ-421-fix-the-login`, not
 * `proj-421-fix-the-login`. The title is always lowered.
 *
 * The output is a valid refname by construction: everything that is not a
 * letter or a digit becomes a single `-`, which leaves none of what git
 * refuses (a space, `~^:?*[\`, `..`, a trailing `.lock`, a leading or trailing
 * `/`). Accents are folded rather than dropped, so "Créer un dépôt" gives
 * `creer-un-depot` and not `cr-er-un-d-p-t`.
 *
 * A key that survives none of that leaves the title alone to carry the name,
 * and if nothing survives at all the answer is the empty string — the caller
 * prompts with it, and an empty prompt is honest where a guess would not be.
 */
export function issueBranchName(key: string, title?: string): string {
  const head = slugify(String(key ?? ''), true)
  const slug = slugify(title ?? '', false)

  if (!slug) return head
  if (!head) return slug

  const full = `${head}-${slug}`
  if (full.length <= MAX) return full

  // Cut on a word boundary, so a truncated name still reads as words rather
  // than ending mid-syllable — never leaving the dash that cut it, and never
  // cutting into the key itself.
  const cut = full.slice(0, MAX)
  const lastDash = cut.lastIndexOf('-')
  return (lastDash > head.length ? cut.slice(0, lastDash) : cut).replace(/-+$/, '')
}
