// autolinks.ts — turning "JIRA-421" in a commit message into a link.
//
// The message pane linkified exactly one thing: `#123`, always to the GitHub
// issue of the repository's own remote. Every team that tracks work anywhere
// else — Jira, Linear, a ticketing system with a URL — read their own
// references as plain text.
//
// A pattern is a prefix and a URL template. Nothing here knows about any
// particular tracker, which is the point: the ones people use are too many to
// enumerate and too boring to special-case.

export interface Autolink {
  /** What the reference starts with — `JIRA-`, `GH-`, `#`. */
  prefix: string
  /** Where it goes. `<num>` is replaced by the digits that followed the prefix. */
  url: string
}

/** The `#123 → issue` rule every repository with a GitHub remote gets for free. */
export const ISSUE_PREFIX = '#'

/**
 * Read the stored setting. Kept forgiving on purpose: this is user-entered
 * configuration, and one malformed row should cost that row, not the feature.
 * Anything unusable is dropped rather than thrown.
 */
export function parseAutolinks(raw: string | null | undefined): Autolink[] {
  if (!raw || !raw.trim()) return []
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return [] }
  if (!Array.isArray(parsed)) return []
  const out: Autolink[] = []
  for (const row of parsed) {
    if (!row || typeof row !== 'object') continue
    const prefix = String((row as any).prefix ?? '').trim()
    const url = String((row as any).url ?? '').trim()
    // A URL with no <num> would send every reference to the same page, which
    // looks like it works until someone clicks the second one.
    if (!prefix || !url || !url.includes('<num>')) continue
    out.push({ prefix, url })
  }
  return out
}

export function serializeAutolinks(links: Autolink[]): string {
  return JSON.stringify(links.filter(l => l.prefix.trim() && l.url.includes('<num>')))
}

/** Escapes a prefix so `C++-` or `A.B-` is matched literally, not as a pattern. */
function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface AutolinkMatch {
  /** Index in the source text where the reference starts. */
  index: number
  /** The whole matched reference, `JIRA-421`. */
  text: string
  /** Just the digits. */
  number: number
  url: string
}

/**
 * Every reference in `text`, left to right, non-overlapping.
 *
 * Longest prefix wins where two could match the same spot: with both `GH-` and
 * `G-` configured, `GH-4` is a GH reference, not a G reference to "H-4".
 *
 * A reference must not start mid-word — `abcJIRA-1` is not a ticket — which is
 * the same rule the `#123` matcher already used, generalised.
 */
export function findAutolinks(text: string, links: Autolink[]): AutolinkMatch[] {
  if (!text || links.length === 0) return []
  const byLongestPrefix = [...links].sort((a, b) => b.prefix.length - a.prefix.length)
  const matches: AutolinkMatch[] = []
  let i = 0
  outer: while (i < text.length) {
    for (const link of byLongestPrefix) {
      if (!text.startsWith(link.prefix, i)) continue
      // Not preceded by a word character or a slash: `a/b#1` and `x#1` are not
      // references, `(#1` and `see #1` are.
      const before = i > 0 ? text[i - 1] : ''
      if (before && /[\w/]/.test(before)) continue
      const rest = text.slice(i + link.prefix.length)
      const digits = rest.match(/^\d{1,9}/)?.[0]
      if (!digits) continue
      // And not glued to more word characters after: `#1a` is not a reference.
      const after = text[i + link.prefix.length + digits.length] ?? ''
      if (after && /\w/.test(after)) continue
      matches.push({
        index: i,
        text: link.prefix + digits,
        number: parseInt(digits, 10),
        url: link.url.replace(/<num>/g, digits),
      })
      i += link.prefix.length + digits.length
      continue outer
    }
    i++
  }
  return matches
}
