// The `/` finder's rules: what can be found, what a query matches, in which
// order the matches are walked, and which one the graph lands on (#252).
//
// It is a TYPE-AHEAD, not a picker: the input is there to see and correct what
// was typed, and the graph answers by going to the best match on every
// keystroke. So there is no list to rank for reading — only an order to step
// through (the graph's own, top to bottom) and one match to land on (the best).
//
// Pure: names in, matches out. RefFinder.tsx draws, CommitGraph moves.
import type { BranchInfo } from '../../types'

export type RefFindKind = 'head' | 'remote' | 'tag' | 'worktree'

export interface RefFindCandidate {
  kind: RefFindKind
  /** What is shown and matched first: `main`, `origin/main`, `v1.2.0`, a worktree's folder. */
  label: string
  /** What git resolves when the tip is not on the page. */
  ref: string
  /** Other names that find it: the remote a local is level with, a worktree's branch. */
  aliases: string[]
  /** When the tip was committed, seconds since the epoch — what "recent" means here. */
  date?: number
  current: boolean
  /** Its row in the loaded graph; undefined when the page does not reach it. */
  row?: number
}

export interface RefFindMatch extends RefFindCandidate { score: number }

export interface RefFindSources {
  branches: readonly BranchInfo[]
  tags: readonly { name: string }[]
  worktrees?: readonly { path: string; branch: string; isMain?: boolean }[]
  /** The row a decorated name sits on — `main`, `origin/main`, `v1.2.0` — when it is loaded. */
  rowOf: (name: string, kind: RefFindKind) => number | undefined
  /** Hidden from the graph by the user: going to it would silently undo that choice. */
  hidden?: (name: string, kind: RefFindKind) => boolean
}

const remoteShort = (name: string) => name.replace(/^remotes\//, '')

/**
 * Every reference the finder can reach. They come from the host's lists, not
 * from the loaded rows, so a branch whose tip is three pages down is findable.
 *
 * A remote branch level with the local branch of its name is not a second
 * candidate: the graph draws the two as one chip, and stepping would land
 * twice on the same row. Its name becomes an alias of the local.
 */
export function refFindCandidates(src: RefFindSources): RefFindCandidate[] {
  const out: RefFindCandidate[] = []
  const hidden = src.hidden ?? (() => false)
  const locals = src.branches.filter(b => !b.remote && !b.detached)
  const byName = new Map(locals.map(b => [b.name, b]))
  const folded = new Map<string, string[]>()
  const remotes: BranchInfo[] = []
  for (const b of src.branches) {
    if (!b.remote) continue
    const short = remoteShort(b.name)
    // `origin/HEAD` is a pointer to a branch, not a branch.
    if (/\/HEAD$/.test(short)) continue
    const local = byName.get(short.slice(short.indexOf('/') + 1))
    if (local && local.commit === b.commit && !hidden(local.name, 'head')) {
      folded.set(local.name, [...(folded.get(local.name) ?? []), short])
    } else remotes.push(b)
  }
  for (const b of locals) {
    if (hidden(b.name, 'head')) continue
    out.push({
      kind: 'head', label: b.name, ref: b.name, aliases: folded.get(b.name) ?? [],
      date: b.date, current: b.current, row: src.rowOf(b.name, 'head'),
    })
  }
  for (const b of remotes) {
    const short = remoteShort(b.name)
    if (hidden(short, 'remote')) continue
    out.push({
      kind: 'remote', label: short, ref: short, aliases: [],
      date: b.date, current: false, row: src.rowOf(short, 'remote'),
    })
  }
  for (const tag of src.tags) {
    if (hidden(tag.name, 'tag')) continue
    out.push({
      kind: 'tag', label: tag.name, ref: `refs/tags/${tag.name}`, aliases: [],
      current: false, row: src.rowOf(tag.name, 'tag'),
    })
  }
  for (const wt of src.worktrees ?? []) {
    // The main worktree is the repository itself: its branch is already here.
    if (wt.isMain || !wt.branch) continue
    const branch = wt.branch.replace(/^refs\/heads\//, '')
    const folder = wt.path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || wt.path
    out.push({
      kind: 'worktree', label: folder, ref: branch, aliases: [branch],
      date: byName.get(branch)?.date, current: false, row: src.rowOf(branch, 'head'),
    })
  }
  return out
}

/** Lower-cased, split on whitespace: every term has to match (AND). */
export function parseTerms(query: string): string[] {
  return query.toLowerCase().trim().split(/\s+/).filter(Boolean)
}

/**
 * A term holding a slash matches path segments IN ORDER, and may skip some:
 * `d/foo` finds `debt/feature/foo`. Each term segment must be contained in a
 * name segment.
 */
function scoreSegments(name: string, term: string): number {
  const want = term.split('/').filter(Boolean)
  const have = name.split('/')
  if (want.length === 0) return 0
  let at = 0, skipped = 0, allPrefix = true, leaf: 'exact' | 'matched' | 'none' = 'none'
  for (let w = 0; w < want.length; w++) {
    let found = -1
    for (let h = at; h < have.length; h++) {
      if (have[h].includes(want[w])) { found = h; break }
    }
    if (found < 0) return 0
    skipped += found - at
    if (!have[found].startsWith(want[w])) allPrefix = false
    if (w === want.length - 1 && found === have.length - 1) leaf = have[found] === want[w] ? 'exact' : 'matched'
    at = found + 1
  }
  const base = allPrefix ? 0.85 : 0.65
  const bonus = leaf === 'exact' ? 0.1 : leaf === 'matched' ? 0.05 : 0
  return Math.max(0.3, base + bonus - 0.03 * Math.min(skipped, 4))
}

/**
 * One term against one name, 0 when it does not match.
 *
 * A plain term is a SUBSTRING of the name, never a subsequence: in a
 * repository of a thousand refs three letters in order match a third of them,
 * and a finder that lands somewhere on every keystroke has to land where the
 * letters are. The whole name scores 1, a prefix 0.9, a prefix of the last
 * path segment 0.8; anywhere else less, earlier and shorter first.
 */
export function scoreTerm(name: string, term: string): number {
  const n = name.toLowerCase()
  if (!term) return 0
  if (term.includes('/')) return scoreSegments(n, term)
  const at = n.indexOf(term)
  if (at < 0) return 0
  if (n === term) return 1
  if (at === 0) return 0.9
  const leaf = n.slice(n.lastIndexOf('/') + 1)
  if (leaf.startsWith(term)) return 0.8
  return 0.7 - Math.min(at, 40) / 100 - Math.min(n.length, 80) / 1000
}

/** Every term has to match; the weakest one decides. */
export function scoreName(name: string, terms: readonly string[]): number {
  let weakest = Infinity
  for (const term of terms) {
    const s = scoreTerm(name, term)
    if (s <= 0) return 0
    if (s < weakest) weakest = s
  }
  return weakest === Infinity ? 0 : weakest
}

/** The best of its label and its aliases. */
export function scoreCandidate(c: RefFindCandidate, terms: readonly string[]): number {
  let best = scoreName(c.label, terms)
  for (const alias of c.aliases) best = Math.max(best, scoreName(alias, terms))
  return best
}

/**
 * The matches, in the order ↓ walks them: the GRAPH's, top to bottom, so "next"
 * means "further down". What the page does not hold comes after, most recent
 * tip first, then what carries no date, then by name. An empty query matches
 * nothing.
 */
export function matchRefs(candidates: readonly RefFindCandidate[], query: string): RefFindMatch[] {
  const terms = parseTerms(query)
  if (terms.length === 0) return []
  const out: RefFindMatch[] = []
  for (const c of candidates) {
    const score = scoreCandidate(c, terms)
    if (score > 0) out.push({ ...c, score })
  }
  return out.sort((a, b) => {
    if (a.row !== undefined && b.row !== undefined) return a.row - b.row || a.label.localeCompare(b.label)
    if (a.row !== undefined) return -1
    if (b.row !== undefined) return 1
    if (a.date !== undefined && b.date !== undefined && a.date !== b.date) return b.date - a.date
    if (a.date !== undefined && b.date === undefined) return -1
    if (b.date !== undefined && a.date === undefined) return 1
    return a.label.localeCompare(b.label)
  })
}

/**
 * Which match the graph lands on when the query changes: the best score; then
 * a branch or a tag before a worktree, the current branch, the earlier row.
 */
export function pickLanding(matches: readonly RefFindMatch[]): number {
  let best = -1
  const better = (a: RefFindMatch, b: RefFindMatch): boolean => {
    if (a.score !== b.score) return a.score > b.score
    if ((a.kind === 'worktree') !== (b.kind === 'worktree')) return b.kind === 'worktree'
    if (a.current !== b.current) return a.current
    return (a.row ?? Infinity) < (b.row ?? Infinity)
  }
  matches.forEach((m, i) => { if (best < 0 || better(m, matches[best])) best = i })
  return best
}

/** ↓ and ↑ wrap. */
export function stepIndex(index: number, delta: number, count: number): number {
  return count <= 0 ? -1 : (index + delta + count) % count
}

/**
 * A name cut to fit, from the LEFT: the tail is what tells two branches apart.
 * Leading path segments go first — `…/feature/foo` — and only then the leaf.
 */
export function elideRefName(label: string, max: number): string {
  if (label.length <= max) return label
  const parts = label.split('/')
  while (parts.length > 1) {
    parts.shift()
    const kept = `…/${parts.join('/')}`
    if (kept.length <= max) return kept
  }
  return `…${parts[0].slice(Math.max(0, parts[0].length - (max - 1)))}`
}
