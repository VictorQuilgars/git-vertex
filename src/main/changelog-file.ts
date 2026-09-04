// changelog-file.ts — putting a generated changelog where changelogs live.
//
// A generated entry that has to be copied, then pasted, then placed by hand
// under the right heading is three steps of the work still left undone. This
// module does the placing: it finds the repository's own changelog, and
// merges an entry into its Unreleased section — under the headings that are
// already there, never as a second `### Added` three lines under the first.
//
// The merge is pure text in, text out, so it is tested rather than trusted:
// it edits a file the user did not open, and the only thing that makes that
// acceptable is that it never removes a line.
//
// Free of `electron` and `vscode`: the desktop main process and the extension
// host both call it with their own git and their own fs.

import type { Raw } from './ai-material'

/**
 * Where a changelog is kept, in the order a repository is asked. The names
 * are the conventional ones; the search is `git ls-files`, so an untracked
 * file is not a changelog — a repository's changelog is a tracked file, and
 * matching an untracked one would let a stray CHANGELOG.md in a build folder
 * win over the real one.
 */
export const CHANGELOG_CANDIDATES = [
  'CHANGELOG.md', 'CHANGELOG', 'CHANGELOG.rst', 'CHANGELOG.txt',
  'docs/CHANGELOG.md', 'doc/CHANGELOG.md',
  'HISTORY.md', 'NEWS.md', 'CHANGES.md',
]

/**
 * Every changelog this repository tracks, in OUR order of preference — not
 * git's, which sorts alphabetically and would prefer `CHANGES.md` to
 * `CHANGELOG.md` in a repository with both.
 *
 * Plural on purpose. A monorepo has one per package, and picking the first
 * and writing into it is the kind of helpfulness that puts a desktop app's
 * release notes in the CLI's changelog. The caller asks when there are
 * several; it does not guess.
 */
export async function findChangelogs(raw: Raw): Promise<string[]> {
  let listed = ''
  try { listed = await raw(['ls-files', '--', ...CHANGELOG_CANDIDATES]) } catch { return [] }
  const found = listed.split('\n').map(l => l.trim()).filter(Boolean)
  const ranked = CHANGELOG_CANDIDATES.filter(c => found.includes(c))
  return [...ranked, ...found.filter(f => !ranked.includes(f))]
}

/** The one it would use when there is no doubt. Null when there is none. */
export async function findChangelog(raw: Raw): Promise<string | null> {
  return (await findChangelogs(raw))[0] ?? null
}

/**
 * Is this branch already in the thing it would land on?
 *
 * The case this exists for: a changelog written for a branch, the branch
 * merged, and the drawer reopened a fortnight later from the AI stack — where
 * it still sits, because it was kept. Inserting it then adds a release's
 * worth of bullets that are already in the file, into whatever branch happens
 * to be checked out.
 *
 * ⚠️ NOT `merge-base --is-ancestor`, for the reason git-service.ts already
 * writes down in getRewordPlan: it answers through its exit code and prints
 * nothing, and simple-git only treats a non-zero exit as an error when stderr
 * is non-empty — so "no" resolves exactly like "yes". This asked it that way
 * first, and every branch came back merged. `rev-list --count` answers with a
 * NUMBER: nothing on the branch that the base lacks means the base has it all.
 */
export async function isMergedInto(raw: Raw, branch: string, base: string): Promise<boolean> {
  try {
    const out = (await raw(['rev-list', '--count', `${base}..${branch}`])).trim()
    return /^\d+$/.test(out) && Number(out) === 0
  } catch {
    return false   // unrelated histories, a ref that is gone: we do not know
  }
}

/** One `### Heading` and the lines under it, as the entry was written. */
interface Section { heading: string; lines: string[] }

/** Split a generated entry into its `###` sections, in order. */
function sections(entry: string): Section[] {
  const out: Section[] = []
  for (const line of entry.split('\n')) {
    if (/^###\s+\S/.test(line.trim())) out.push({ heading: line.trim(), lines: [] })
    else if (out.length) out[out.length - 1].lines.push(line)
    // Anything before the first heading is dropped: the prompt forbids a
    // preamble, and a model that writes one anyway must not get it committed.
  }
  for (const s of out) {
    while (s.lines.length && !s.lines[s.lines.length - 1].trim()) s.lines.pop()
  }
  return out.filter(s => s.lines.some(l => l.trim()))
}

/** Heading text, compared the way a reader compares them. */
const key = (heading: string): string => heading.replace(/^#+\s*/, '').trim().toLowerCase()

/** A bullet, stripped to what it says — so re-inserting adds nothing twice. */
const bullet = (line: string): string => line.trim().replace(/^[-*+]\s*/, '').toLowerCase()

export interface MergeResult {
  content: string
  /** Lines actually added — 0 means the file already said all of it. */
  added: number
  /** The file did not exist and this is its whole content. */
  created: boolean
  /** An Unreleased section was written because there was none. */
  sectionCreated: boolean
}

const UNRELEASED = /^##\s+\[?unreleased\]?/i

/**
 * Merge an entry into the Unreleased section of a changelog.
 *
 * The rules, in the order they matter:
 *   - nothing is ever removed or reworded; only lines are added;
 *   - a bullet already in the target subsection is not added again, so an
 *     updated changelog can be inserted over one that was inserted before;
 *   - a heading already there takes the new bullets — a second `### Added`
 *     is the thing this function exists to prevent;
 *   - no Unreleased section ⇒ one is created above the topmost release, or
 *     under the title of a file that has none.
 */
export function mergeIntoUnreleased(existing: string | null, entry: string): MergeResult {
  const parts = sections(entry)
  if (!parts.length) {
    return { content: existing ?? '', added: 0, created: false, sectionCreated: false }
  }
  const block = parts.map(s => [s.heading, ...s.lines].join('\n')).join('\n\n')

  if (existing === null) {
    return {
      content: `# Changelog\n\n## Unreleased\n\n${block}\n`,
      added: parts.reduce((n, s) => n + s.lines.filter(l => l.trim()).length, 0),
      created: true, sectionCreated: true,
    }
  }

  const lines = existing.split('\n')
  const start = lines.findIndex(l => UNRELEASED.test(l))

  if (start === -1) {
    // Above the topmost `## ` — a release section — so the newest thing in
    // the file stays at the top, which is what every changelog convention
    // agrees on. Failing that, after the title.
    let at = lines.findIndex(l => /^##\s+\S/.test(l))
    if (at === -1) {
      const title = lines.findIndex(l => /^#\s+\S/.test(l))
      at = title === -1 ? 0 : title + 1
      while (at < lines.length && !lines[at].trim()) at++
    }
    const inserted = ['## Unreleased', '', ...block.split('\n'), '']
    lines.splice(at, 0, ...inserted)
    return {
      content: lines.join('\n'),
      added: parts.reduce((n, s) => n + s.lines.filter(l => l.trim()).length, 0),
      created: false, sectionCreated: true,
    }
  }

  // The section runs to the next `## ` heading, or to the end of the file.
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+\S/.test(lines[i])) { end = i; break }
  }
  const body = lines.slice(start + 1, end)
  let added = 0

  for (const part of parts) {
    // Where that heading already is, inside this section only.
    let at = -1
    for (let i = 0; i < body.length; i++) {
      if (/^###\s+\S/.test(body[i]) && key(body[i]) === key(part.heading)) { at = i; break }
    }
    if (at === -1) {
      // A new heading goes at the end of the section, after its last content.
      let tail = body.length
      while (tail > 0 && !body[tail - 1].trim()) tail--
      const chunk = tail === 0 ? [] : ['']
      body.splice(tail, 0, ...chunk, part.heading, ...part.lines)
      added += part.lines.filter(l => l.trim()).length
      continue
    }
    // The subsection runs to the next heading of any level.
    let stop = body.length
    for (let i = at + 1; i < body.length; i++) {
      if (/^#{2,3}\s+\S/.test(body[i])) { stop = i; break }
    }
    const have = new Set(body.slice(at + 1, stop).map(bullet).filter(Boolean))
    const fresh = part.lines.filter(l => l.trim() && !have.has(bullet(l)))
    if (!fresh.length) continue
    let tail = stop
    while (tail > at + 1 && !body[tail - 1].trim()) tail--
    body.splice(tail, 0, ...fresh)
    added += fresh.length
  }

  return {
    content: [...lines.slice(0, start + 1), ...body, ...lines.slice(end)].join('\n'),
    added, created: false, sectionCreated: false,
  }
}
