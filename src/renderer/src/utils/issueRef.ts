// issueRef.ts — the reference to a piece of tracked work, whoever tracks it.
//
// Until now a reference was a **number**, because GitHub numbers its issues and
// GitHub was the only tracker wired. A Jira key is `PROJ-421`; a card is a short
// link. Neither is a number, so the model had to stop being one before a second
// provider is added — otherwise each one writes its own way around a
// GitHub-shaped type, in the renderer both products compile.
//
// Everything here is pure. It knows nothing about any API: a reference is text,
// a title it may or may not have, and a URL it may or may not have. What it can
// still do without an API is **link out**, through the autolink patterns the
// user has already configured — which is what makes this useful on its own,
// before any integration exists.

import { findAutolinks, type Autolink } from './autolinks'

/**
 * `github` means the repository's own GitHub, the one we can call an API about.
 *
 * `other` is a reference the user typed that we can link and nothing more. It is
 * deliberately one value rather than a guess at which tracker it belongs to: the
 * autolink table gives us a prefix, not a vendor. A real provider added later
 * (GitLab, Jira…) gets its own id, and `other` keeps meaning exactly this.
 */
export type IssueProvider = 'github' | 'other'

export interface IssueRef {
  provider: IssueProvider
  /** The reference as its tracker spells it, without decoration: `123`, `PROJ-421`. */
  key: string
  title?: string
  /** Where it lives, when whoever produced the reference told us. */
  url?: string
}

/** A GitHub reference is shown the way GitHub writes it; everything else as typed. */
export function issueRefLabel(ref: Pick<IssueRef, 'provider' | 'key'>): string {
  return ref.provider === 'github' ? `#${ref.key}` : ref.key
}

/**
 * Read a stored reference, whatever shape it was written in.
 *
 * Entries written before this existed are `{ number, title?, url? }`. They are
 * GitHub numbers by construction — it was the only tracker — so they read as
 * such. Returning null for anything unreadable rather than throwing keeps a
 * hand-edited or truncated file from taking the whole branch list with it.
 */
export function migrateIssueRef(raw: unknown): IssueRef | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>

  const title = typeof o.title === 'string' && o.title ? o.title : undefined
  const url = typeof o.url === 'string' && o.url ? o.url : undefined

  if (typeof o.key === 'string' && o.key.trim()) {
    const provider: IssueProvider = o.provider === 'other' ? 'other' : 'github'
    return { provider, key: o.key.trim(), title, url }
  }

  // The old shape. `number` was typed as a number but localStorage is text a
  // user can edit, so a numeric string counts too.
  const n = typeof o.number === 'number' ? o.number
    : typeof o.number === 'string' && /^\d+$/.test(o.number.trim()) ? Number(o.number.trim())
    : null
  if (n === null || !Number.isFinite(n)) return null
  return { provider: 'github', key: String(n), title, url }
}

/**
 * Where this reference points, or null when nothing can say.
 *
 * Order: the URL its tracker gave us, then the autolink patterns. A GitHub
 * reference with no stored URL comes back null on purpose — building it needs
 * the repository, which this module has no business knowing. The caller that
 * has one composes with `remoteUrl.issue`.
 *
 * The match is done by running the existing autolink matcher over the label and
 * requiring it to span the whole of it: `PROJ-421` matches the `PROJ-` pattern,
 * `PROJ-421-old` does not match anything, and the longest-prefix rule the
 * matcher already implements is inherited rather than written again.
 */
export function issueRefUrl(ref: IssueRef, links: Autolink[]): string | null {
  if (ref.url) return ref.url
  const label = issueRefLabel(ref)
  const hit = findAutolinks(label, links).find(m => m.index === 0 && m.text === label)
  return hit?.url ?? null
}

/**
 * Read what someone typed into the associate dialog.
 *
 * This is the only path for a tracker we cannot enumerate, so it takes more than
 * a number: `#123` and `123` are the repository's GitHub, anything matching a
 * configured autolink carries that pattern's URL, and any other non-empty token
 * is kept as typed — a reference we can hold and show, even with nothing behind
 * it. Whitespace inside is what separates a reference from a sentence.
 */
export function parseIssueRefInput(input: string, links: Autolink[]): IssueRef | null {
  const text = input.trim()
  if (!text || /\s/.test(text)) return null

  if (/^#?\d{1,9}$/.test(text)) {
    return { provider: 'github', key: text.replace(/^#/, '') }
  }

  const hit = findAutolinks(text, links).find(m => m.index === 0 && m.text === text)
  if (hit) return { provider: 'other', key: text, url: hit.url }

  return { provider: 'other', key: text }
}
