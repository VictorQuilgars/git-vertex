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
  /** Which ones, so the reader can see them before any of it is written. */
  addedLines: string[]
  /** Lines the file already had, word for word, and that were not repeated. */
  skipped: string[]
  /**
   * Lines that are NOT word-for-word duplicates but say the same thing as one
   * already there. Never dropped — a near-match is a judgement, and dropping
   * on a judgement loses work. Reported, so the judgement is the reader's.
   *
   * It catches a REWORDING (the model's second attempt at its own bullet),
   * not a paraphrase: "a caching layer that stores results" and "a cache API
   * that stores values" are the same change and share almost no words. Which
   * is why `existing` is reported too — the reader gets the comparison, not
   * an opinion about it.
   */
  similar: { line: string; existing: string }[]
  /** What the sections being written into already say. */
  existing: string[]
  /**
   * Lines a previous insert of THIS changelog had written, taken back out
   * because the regenerated entry supersedes them. This is the answer to
   * regenerating: the model rewords everything, so a second insert would
   * otherwise leave two differently-worded copies of one release.
   */
  removed: string[]
  /**
   * Lines it had written and can no longer find in the section: edited by
   * hand, or moved into a released section. Left exactly where they are — we
   * wrote them once, we do not own them for ever.
   */
  missing: string[]
  /** Every line of ours in the file after this merge. Store it; pass it back. */
  ours: string[]
  /**
   * Nothing was written: this file keeps no section for unreleased work under
   * any name, and where the entry goes is not ours to decide. `shape` carries
   * its headings so the caller can ask.
   */
  needsSection?: boolean
  shape?: ChangelogShape
  /** The file did not exist and this is its whole content. */
  created: boolean
  /** An Unreleased section was written because there was none. */
  sectionCreated: boolean
}

/**
 * What a bullet says, with everything that is not saying stripped: markdown
 * emphasis, code ticks, punctuation, and the words too common to carry
 * meaning. Two bullets about the same change rarely match character for
 * character — one is the model's second attempt at the first.
 */
function words(line: string): Set<string> {
  const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'and', 'or', 'is', 'it', 'in', 'on',
    'for', 'with', 'that', 'this', 'now', 'when', 'from', 'by', 'as', 'its', 'you', 'your'])
  return new Set(
    line.toLowerCase()
      .replace(/[`*_~\[\]()]/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter(w => w.length > 2 && !STOP.has(w))
      // The crudest of stems, and it earns its place: "stores" and "store"
      // are the same claim, and without this two wordings of one change score
      // 0.5 where the threshold is 0.6.
      .map(w => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)))
}

/** How much two bullets overlap, 0 to 1 — Jaccard over their meaning words. */
export function similarity(a: string, b: string): number {
  const A = words(a), B = words(b)
  if (!A.size || !B.size) return 0
  let shared = 0
  for (const w of A) if (B.has(w)) shared++
  return shared / (A.size + B.size - shared)
}

/** Above this, two bullets are saying the same thing in different words. */
export const SIMILAR_ENOUGH = 0.6

/**
 * The names a section for unreleased work goes by.
 *
 * Keep a Changelog says "Unreleased" and this started by only knowing that
 * one — which is a convention, not a rule, and a repository that heads its
 * file with `## Next` or `## master` was told it had none and had one
 * invented above its newest release. These are the spellings actually met in
 * the wild, in two languages, and the reader is asked whenever none matches.
 */
const UNRELEASED_NAMES = [
  'unreleased', 'unpublished', 'upcoming', 'next', 'next release', 'nightly',
  'to be released', 'unreleased changes', 'tbd', 'wip', 'in progress',
  'master', 'main', 'head', 'dev', 'develop', 'trunk',
  'à paraître', 'a paraitre', 'non publié', 'non publie', 'prochaine version',
  'en cours', 'à venir', 'a venir',
]

/** `target` for "make a section, I have decided" — never a heading's text. */
export const NEW_SECTION = '::create-a-new-section::'

/** A heading, as it sits in the file. */
export interface ChangelogHeading { line: number; level: number; text: string }

export interface ChangelogShape {
  /** The level a release heading sits at — `## 1.4.0` is 2, `# 1.4.0` is 1. */
  level: number
  /** The level the groups inside one sit at (Added, Fixed…). */
  groupLevel: number
  /** The section for unreleased work, if the file has one under any name. */
  unreleased: ChangelogHeading | null
  /** Every section at the release level, newest first as the file has them. */
  sections: ChangelogHeading[]
}

/** A heading's text, without its hashes, its brackets or its trailing date. */
const headingText = (raw: string): string =>
  raw.replace(/^#+\s*/, '')
    .replace(/^\[([^\]]*)\]\([^)]*\)/, '$1')   // [1.4.0](https://…)
    .replace(/^\[([^\]]*)\]/, '$1')              // [Unreleased]
    .replace(/\s*[—–-]\s*.*$/, '')                // — 2026-01-01, - ReleaseDate
    .trim()

/** Does this heading name a section for work that is not out yet? */
const namesUnreleased = (text: string): boolean =>
  UNRELEASED_NAMES.includes(text.toLowerCase().replace(/[[\]()]/g, '').trim())

/** A heading that names a release rather than the file. */
const namesSection = (text: string): boolean =>
  namesUnreleased(text)
  || /^v?\d+\.\d+/.test(text.trim())          // 1.4.0, v2.0
  || /^\d{4}-\d{2}-\d{2}/.test(text.trim())   // 2026-01-01

/**
 * What shape this changelog is in — read, never assumed.
 *
 * The release level is the shallowest one that is not the file's TITLE, and
 * the title is a single heading, first in the file, whose text does not name
 * a release. That last clause is what tells `# Changelog` (a title, releases
 * one level down) from `# 1.4.0` (a release at the top level), and a file
 * with no headings at all falls back to `##`, which is what every template
 * on earth uses.
 */
export function readShape(existing: string): ChangelogShape {
  const headings: ChangelogHeading[] = []
  let fenced = false
  existing.split('\n').forEach((raw, line) => {
    if (/^\s*```/.test(raw)) { fenced = !fenced; return }
    if (fenced) return
    const m = raw.match(/^(#{1,6})\s+\S/)
    if (m) headings.push({ line, level: m[1].length, text: headingText(raw) })
  })

  let level = 2
  if (headings.length) {
    const min = Math.min(...headings.map(h => h.level))
    const atMin = headings.filter(h => h.level === min)
    const isTitle = atMin.length === 1 && atMin[0] === headings[0] && !namesSection(atMin[0].text)
    const below = headings.filter(h => h.level > min).map(h => h.level)
    level = isTitle ? (below.length ? Math.min(...below) : min + 1) : min
  }

  const sections = headings.filter(h => h.level === level)
  return {
    level,
    groupLevel: level + 1,
    unreleased: sections.find(h => namesUnreleased(h.text)) ?? null,
    sections,
  }
}

/**
 * Merge an entry into the Unreleased section of a changelog.
 *
 * The rules, in the order they matter:
 *   - nothing is ever removed or reworded; only lines are added;
 *   - a bullet already in the target subsection is not added again, so an
 *     updated changelog can be inserted over one that was inserted before;
 *   - a heading already there takes the new bullets — a second `### Added`
 *     is the thing this function exists to prevent;
 *   - the file's own shape is followed, not Keep a Changelog's: the section
 *     for unreleased work is found under any of the names it goes by, and the
 *     entry's headings are re-levelled to sit inside it. `target` names the
 *     section to write into when the caller has asked; without one, and with
 *     no section that names itself unreleased, nothing is written and
 *     `needsSection` comes back with the file's own headings to choose from.
 */
export function mergeIntoChangelog(
  existing: string | null, entry: string, previouslyOurs: string[] = [], target?: string,
): MergeResult {
  const shape = existing === null ? null : readShape(existing)
  const groupLevel = shape?.groupLevel ?? 3
  /** A group heading, at the level THIS file puts its groups at. */
  const at = (heading: string) => '#'.repeat(groupLevel) + heading.replace(/^#+/, '')
  const parts = sections(entry).map(p => ({ ...p, heading: at(p.heading) }))
  const nothing = {
    added: 0, addedLines: [], skipped: [], similar: [], existing: [],
    removed: [], missing: [], ours: [],
    created: false, sectionCreated: false,
  }
  if (!parts.length) return { content: existing ?? '', ...nothing }
  const block = parts.map(s => [s.heading, ...s.lines].join('\n')).join('\n\n')

  if (existing === null) {
    const all = parts.flatMap(s => s.lines.filter(l => l.trim()).map(l => l.trim()))
    return {
      content: `# Changelog\n\n## Unreleased\n\n${block}\n`,
      added: all.length, addedLines: all, skipped: [], similar: [], existing: [],
      removed: [], missing: previouslyOurs, ours: all,
      created: true, sectionCreated: true,
    }
  }

  const lines = existing.split('\n')
  const head = shape!.level
  // Where this goes: the section the caller named, or the one that names
  // itself unreleased under any of the words people use for it.
  const chosen = target
    ? shape!.sections.find(h => h.text === target) ?? null
    : shape!.unreleased
  const start = chosen ? chosen.line : -1
  const addedLines: string[] = []
  const skipped: string[] = []
  const similar: { line: string; existing: string }[] = []
  const already: string[] = []
  const removed: string[] = []
  /** Ours that survive this merge: the ones the new entry says again. */
  const stillOurs: string[] = []

  if (start === -1) {
    // Nothing in this file says "unreleased" under any name it goes by, and
    // the caller has not said where to put it. Inventing a section on a file
    // that keeps its changelog some other way is imposing a convention on
    // someone who chose a different one — so the caller is asked instead,
    // with the file's own headings to choose from.
    if (target !== NEW_SECTION) {
      return { content: existing, ...nothing, needsSection: true, shape: shape! }
    }
    // Above the topmost section, so the newest thing stays at the top —
    // the one rule every changelog convention does agree on. At the file's
    // OWN heading level, not at `##` because a template said so.
    let at = shape!.sections[0]?.line ?? -1
    if (at === -1) {
      const title = lines.findIndex(l => /^#{1,6}\s+\S/.test(l))
      at = title === -1 ? 0 : title + 1
      while (at < lines.length && !lines[at].trim()) at++
    }
    const inserted = ['#'.repeat(head) + ' Unreleased', '', ...block.split('\n'), '']
    lines.splice(at, 0, ...inserted)
    const all = parts.flatMap(s => s.lines.filter(l => l.trim()).map(l => l.trim()))
    return {
      content: lines.join('\n'),
      added: all.length, addedLines: all, skipped: [], similar: [], existing: [],
      removed: [], missing: previouslyOurs, ours: all,
      created: false, sectionCreated: true,
    }
  }

  // The section runs to the next heading at its own level, or to the end.
  const atHead = new RegExp(`^#{1,${head}}\\s+\\S`)
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (atHead.test(lines[i])) { end = i; break }
  }
  const body = lines.slice(start + 1, end)

  // ── What a previous insert of this changelog wrote ──
  // Regenerating rewords everything, so the lines we put there last time say
  // the same release in different words. They come OUT — unless the new entry
  // repeats one word for word, in which case it stays where it is rather than
  // moving to the bottom of its section. What we cannot find, we leave alone:
  // it was edited by hand, or a release moved it, and either way it is no
  // longer ours to remove.
  const entryLines = new Set(parts.flatMap(p => p.lines.map(l => l.trim())).filter(Boolean))
  const inBody = new Set(body.map(l => l.trim()).filter(Boolean))
  const missing = previouslyOurs.filter(l => !inBody.has(l.trim()))
  for (const line of previouslyOurs) {
    const at = body.findIndex(l => l.trim() === line.trim())
    if (at === -1) continue
    if (entryLines.has(line.trim())) { stillOurs.push(line.trim()); continue }
    body.splice(at, 1)
    removed.push(line.trim())
  }

  for (const part of parts) {
    // Where that heading already is, inside this section only.
    const groupHead = new RegExp(`^#{${groupLevel}}\\s+\\S`)
    let at = -1
    for (let i = 0; i < body.length; i++) {
      if (groupHead.test(body[i]) && key(body[i]) === key(part.heading)) { at = i; break }
    }
    if (at === -1) {
      // A new heading goes at the end of the section, after its last content.
      let tail = body.length
      while (tail > 0 && !body[tail - 1].trim()) tail--
      const chunk = tail === 0 ? [] : ['']
      body.splice(tail, 0, ...chunk, part.heading, ...part.lines)
      addedLines.push(...part.lines.filter(l => l.trim()).map(l => l.trim()))
      continue
    }
    // The subsection runs to the next heading of any level.
    let stop = body.length
    const anyHead = new RegExp(`^#{1,${groupLevel}}\\s+\\S`)
    for (let i = at + 1; i < body.length; i++) {
      if (anyHead.test(body[i])) { stop = i; break }
    }
    const existing = body.slice(at + 1, stop).filter(l => l.trim())
    already.push(...existing.map(l => l.trim()))
    const have = new Set(existing.map(bullet).filter(Boolean))
    const fresh: string[] = []
    for (const l of part.lines) {
      if (!l.trim()) continue
      if (have.has(bullet(l))) { skipped.push(l.trim()); continue }
      const near = existing.find(e => similarity(l, e) >= SIMILAR_ENOUGH)
      if (near) similar.push({ line: l.trim(), existing: near.trim() })
      fresh.push(l)
    }
    if (!fresh.length) continue
    let tail = stop
    while (tail > at + 1 && !body[tail - 1].trim()) tail--
    body.splice(tail, 0, ...fresh)
    addedLines.push(...fresh.map(l => l.trim()))
  }

  return {
    content: [...lines.slice(0, start + 1), ...body, ...lines.slice(end)].join('\n'),
    added: addedLines.length, addedLines, skipped, similar, existing: already,
    removed, missing,
    // Ours, from now on: what we just wrote, plus what we had written that the
    // new entry repeats. NEVER a line that was already there and happens to
    // match — removing someone else's line on the next round would be theft.
    ours: [...stillOurs, ...addedLines],
    created: false, sectionCreated: false,
  }
}
