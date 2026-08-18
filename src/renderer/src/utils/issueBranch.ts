// issueBranch.ts — the branch name an issue suggests.
//
// Associating an issue with a branch has existed since v1.21.0; this is the
// other direction, and it is the one people reach for — you pick up an issue
// and you need a branch for it, not the reverse.
//
// The name is only ever a *suggestion*: the caller prompts with it, and what
// the user types wins. So this errs towards readable rather than towards
// clever, and it never invents a name it cannot defend — an issue with no
// title is just its number.

/** How long a suggested name may get before it is cut on a word boundary. */
const MAX = 60

/**
 * `123-the-title-in-kebab-case`, or `123` when the issue has no title.
 *
 * The output is a valid refname by construction: everything that is not a
 * letter or a digit becomes a single `-`, which leaves none of what git
 * refuses (a space, `~^:?*[\`, `..`, a trailing `.lock`, a leading or trailing
 * `/`). Accents are folded rather than dropped, so "Créer un dépôt" gives
 * `creer-un-depot` and not `cr-er-un-d-p-t`.
 */
export function issueBranchName(number: number, title?: string): string {
  const slug = (title ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // fold accents onto their base letter
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!slug) return String(number)

  const full = `${number}-${slug}`
  if (full.length <= MAX) return full

  // Cut on a word boundary, so a truncated name still reads as words rather
  // than ending mid-syllable — and never leave the dash that cut it.
  const cut = full.slice(0, MAX)
  const lastDash = cut.lastIndexOf('-')
  return (lastDash > String(number).length ? cut.slice(0, lastDash) : cut).replace(/-+$/, '')
}
