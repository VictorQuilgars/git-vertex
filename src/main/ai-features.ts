// ai-features.ts — the five capabilities #70 P1 adds, whole: material,
// prompt, budget, the refusal when there is nothing to read, and the parsing
// of what comes back.
//
// The desktop main process and the extension host both call THESE, passing
// only their own git and their own way of reaching a provider. That is the
// point: the four features that shipped before this live in two copies, and
// the copies have disagreed about ref resolution, about wording, and about
// which feature's model a call runs on. Here a host cannot hold a different
// opinion — it has none to hold.
//
// Free of `electron` and `vscode` (the theme-validate pattern), so the unit
// suite drives the real thing with a fake git and a fake model.

import type { AIFeature } from './ai-resolve'
import { branchMaterial, changelogMaterial, resolveBase, stashMaterial, touches, workingMaterial, type Raw } from './ai-material'
import {
  explainBranchPrompt, explainStashPrompt, explainWorkingPrompt, changelogPrompt,
  splitPrompt, parseSplit, type SplitProposal,
} from './ai-prompts'

/**
 * One model call. The FEATURE is passed rather than bound by the caller: it
 * decides which model and whose instructions the call runs on, and a host
 * that picked it itself would be free to pick a different one from the other
 * host — which is exactly the drift this module exists to remove.
 */
export type Run = (prompt: string, maxTokens: number, feature: AIFeature) => Promise<{ text?: string; error?: string }>

/** Prose answers in paragraphs; a changelog and a split answer in lists. */
const PROSE_TOKENS = 768
const CHANGELOG_TOKENS = 2048
const SPLIT_TOKENS = 2048

/**
 * A reading that was kept, and what it was read FROM.
 *
 * Everything the model writes here is kept now — it used to be only the
 * changelog, on the grounds that a branch, a stash and a working tree all
 * move under their answer. They do; the answer to that is the `sha`, not
 * silence. A note that knows which tip it describes can say it is out of
 * date, which is worth more than making the reader pay for it again.
 */
export interface NoteRecord {
  kind: 'branch' | 'stash' | 'working'
  /** The branch name, the stash ref, or 'working' — one note per subject. */
  key: string
  /** What it is about, as the panel should name it. */
  title: string
  text: string
  at: number
  /**
   * The commit the reading describes. Empty for the working tree, which has
   * no sha and is stale the moment anything is typed — its row says when it
   * was written and leaves the judgement there.
   */
  sha: string
}

/** Where a host keeps them. Already scoped to one repository by the caller. */
export interface NoteStore {
  get(kind: NoteRecord['kind'], key: string): Promise<NoteRecord | null>
  set(record: NoteRecord): Promise<void>
  all(): Promise<NoteRecord[]>
  forget(kind: NoteRecord['kind'], key: string): Promise<void>
}

/** A kept reading, measured against the repository as it stands now. */
export interface NoteEntry extends NoteRecord {
  /** Its subject has moved since — for a branch, by this many commits. */
  newCommits: number
  /** Its subject is gone: a dropped stash, a deleted branch. */
  orphan: boolean
}

export interface ExplainOpts { guidance?: string; store?: NoteStore }

export async function explainBranch(raw: Raw, run: Run, branch: string, opts: ExplainOpts = {}):
Promise<{ explanation?: string; base?: string; error?: string }> {
  const m = await branchMaterial(raw, branch)
  if (!m) return { error: `No base to read ${branch} against — it has no upstream and the repository has no trunk` }
  if (!m.subjects.length && !m.diff.trim()) return { error: `${branch} carries nothing over ${m.base}` }
  const r = await run(explainBranchPrompt(branch, m.base, m.subjects, m.diffstat, m.diff, opts.guidance), PROSE_TOKENS, 'explain')
  if (r.error) return { error: r.error }
  await keep(raw, opts.store, { kind: 'branch', key: branch, title: branch, text: r.text ?? '' }, branch)
  return { explanation: r.text, base: m.base }
}

export async function explainStash(raw: Raw, run: Run, index: number | string, opts: ExplainOpts = {}):
Promise<{ explanation?: string; error?: string }> {
  const ref = typeof index === 'number' ? `stash@{${index}}` : index
  const m = await stashMaterial(raw, index)
  if (!m.diff.trim()) return { error: 'This stash has no changes to analyze' }
  const r = await run(explainStashPrompt(m.label, m.diff, opts.guidance), PROSE_TOKENS, 'explain')
  if (r.error) return { error: r.error }
  // Keyed by the stash's COMMIT, not by `stash@{0}`: that index shifts under
  // every push and pop, and a note keyed by it would follow the wrong stash.
  const sha = await sha1(raw, ref)
  await keep(raw, opts.store, { kind: 'stash', key: sha || ref, title: m.label || ref, text: r.text ?? '' }, sha || ref)
  return { explanation: r.text }
}

export async function explainWorking(raw: Raw, run: Run, opts: ExplainOpts = {}):
Promise<{ explanation?: string; error?: string }> {
  const m = await workingMaterial(raw)
  if (!m.staged.trim() && !m.unstaged.trim()) return { error: 'Nothing uncommitted to analyze' }
  const r = await run(explainWorkingPrompt(m.staged, m.unstaged, m.diffstat, opts.guidance), PROSE_TOKENS, 'explain')
  if (r.error) return { error: r.error }
  // No sha: the working tree is stale the moment anything is typed, and
  // pretending otherwise with the tip it happened to sit on would be worse.
  await keep(raw, opts.store, { kind: 'working', key: 'working', title: 'Uncommitted changes', text: r.text ?? '' }, '')
  return { explanation: r.text }
}

/** Store a reading, if the host gave us somewhere to put it. */
async function keep(
  raw: Raw, store: NoteStore | undefined,
  note: Omit<NoteRecord, 'at' | 'sha'>, ref: string,
): Promise<void> {
  if (!store || !note.text.trim()) return
  await store.set({ ...note, at: Date.now(), sha: ref ? await sha1(raw, ref) : '' })
}

const sha1 = async (raw: Raw, ref: string): Promise<string> => {
  try { return (await raw(['rev-parse', ref])).trim() } catch { return '' }
}

/**
 * Everything the model has read for this repository, newest first, each
 * measured against what it stands for now: a branch that has moved, a stash
 * that is gone. The panel's AI stack is this list.
 */
export async function noteList(raw: Raw, store: NoteStore): Promise<{ entries: NoteEntry[] }> {
  const out: NoteEntry[] = []
  for (const note of await store.all()) {
    let newCommits = 0
    let orphan = false
    if (note.sha) {
      const now = note.kind === 'branch' ? await sha1(raw, note.key) : await sha1(raw, note.sha)
      if (!now) orphan = true
      else if (now !== note.sha && note.kind === 'branch') {
        newCommits = await countCommits(raw, note.sha, note.key)
      }
    }
    out.push({ ...note, newCommits, orphan })
  }
  return { entries: out.sort((a, b) => b.at - a.at) }
}

/**
 * A changelog that was generated, and what it was generated from.
 *
 * Kept because a changelog is the one answer here people come back to: it is
 * written to be pasted, and closing the drawer used to mean paying for it
 * again. The two shas are what make the memory honest rather than merely
 * cheap — they say whether the text still describes the branch.
 */
export interface ChangelogRecord {
  text: string
  base: string
  /** The tip the text describes, and the base it was read against. */
  headSha: string
  baseSha: string
  commits: number
  /**
   * The directory it describes, when it describes one — a repository with a
   * changelog per package has one that is about that package. Empty for the
   * whole branch, which is what a single root changelog wants.
   */
  scope?: string
  /** When it was written, epoch ms — the drawer says how long ago. */
  at: number
  /**
   * What previous inserts of this changelog put in which files.
   *
   * It survives regeneration, which is the point: the model rewords
   * everything, so without this a second insert leaves two differently-worded
   * copies of one release and no verbatim check catches it. With it, the
   * lines we wrote come back out and the new ones take their place.
   *
   * A LIST, one entry per file, because a repository that ships several
   * products has a changelog per product and one change belongs in more than
   * one of them. Records written before that carried a single object; read
   * them through `insertedIn()` rather than assuming the shape.
   */
  inserted?: { path: string; lines: string[]; at: number }[] | { path: string; lines: string[]; at: number }
}

/** What we put in one file, whichever shape the record was written in. */
export function insertedIn(record: ChangelogRecord | null | undefined, path: string): string[] {
  const all = !record?.inserted ? []
    : Array.isArray(record.inserted) ? record.inserted : [record.inserted]
  return all.find(i => i.path === path)?.lines ?? []
}

/** The record with one file's lines replaced — the others left alone. */
export function withInserted(
  record: ChangelogRecord, path: string, lines: string[],
): ChangelogRecord {
  const all = !record.inserted ? []
    : Array.isArray(record.inserted) ? record.inserted : [record.inserted]
  return {
    ...record,
    inserted: [...all.filter(i => i.path !== path), { path, lines, at: Date.now() }],
  }
}

/** Where a host keeps them. Already scoped to one repository by the caller. */
export interface ChangelogStore {
  get(branch: string): Promise<ChangelogRecord | null>
  set(branch: string, record: ChangelogRecord): Promise<void>
  /** Every branch that has one — what the panel's AI view lists. */
  all(): Promise<Record<string, ChangelogRecord>>
  forget(branch: string): Promise<void>
}

/** A stored changelog, measured against the branch as it stands now. */
export interface ChangelogEntry extends ChangelogRecord {
  branch: string
  newCommits: number
  /** The branch is gone — merged and pruned, or deleted. */
  orphan: boolean
}

export interface ChangelogState {
  base?: string
  cached?: ChangelogRecord
  /** Commits the branch has gained since the cached text was written. */
  newCommits?: number
  /** The base moved under it — the range itself is different now. */
  baseMoved?: boolean
  error?: string
}

/**
 * What the drawer knows before it asks anything. No model call, no cost: it
 * is the difference between reopening a changelog and regenerating one.
 */
export async function changelogState(raw: Raw, store: ChangelogStore, branch: string, scope?: string):
Promise<ChangelogState> {
  const base = await resolveBase(raw, branch)
  if (!base) return { error: `No base to read ${branch} against — it has no upstream and the repository has no trunk` }
  const cached = await store.get(changelogKey(branch, scope))
  if (!cached) return { base }
  const headSha = await sha(raw, branch)
  const baseSha = await sha(raw, base)
  // Counted rather than inferred from the sha: "3 commits since" is what the
  // reader needs to decide, and a moved sha alone could be an amend.
  const since = cached.headSha && headSha !== cached.headSha
    ? (await countCommits(raw, cached.headSha, branch))
    : 0
  return { base, cached, newCommits: since, baseMoved: !!baseSha && baseSha !== cached.baseSha }
}

/**
 * Everything this repository has had written for it, newest first.
 *
 * The list is the answer to "where else does a generated changelog live" —
 * before it, the only way back to one was to ask for it again from the menu
 * of the branch it belonged to, which meant remembering that it existed.
 * Each row is measured against its branch as it stands now, because a list
 * of texts that quietly no longer apply is worse than no list.
 */
export async function changelogList(raw: Raw, store: ChangelogStore): Promise<{ entries: ChangelogEntry[] }> {
  const all = await store.all()
  const entries: ChangelogEntry[] = []
  for (const [key, record] of Object.entries(all)) {
    const { branch } = readChangelogKey(key)
    const head = await sha(raw, branch)
    // A branch that no longer exists keeps its text — deleting someone's
    // changelog because they deleted the branch would be a surprise. The row
    // says so instead, and the insert refuses without being asked twice.
    const newCommits = head && record.headSha && head !== record.headSha
      ? await countCommits(raw, record.headSha, branch)
      : 0
    entries.push({ ...record, branch, newCommits, orphan: !head })
  }
  return { entries: entries.sort((a, b) => b.at - a.at) }
}

const sha = async (raw: Raw, ref: string): Promise<string> => {
  try { return (await raw(['rev-parse', ref])).trim() } catch { return '' }
}

const countCommits = async (raw: Raw, from: string, to: string): Promise<number> => {
  try {
    const out = (await raw(['rev-list', '--count', `${from}..${to}`])).trim()
    return Number(out) || 0
  } catch { return 0 }
}

/**
 * Write the changelog, and remember it.
 *
 * `previous` extends rather than rewrites: a branch that gained three commits
 * should gain three bullets, not a differently-worded document its reviewer
 * has to read again from the top.
 */
export async function generateChangelog(
  raw: Raw, run: Run, branch: string, base?: string,
  opts: { previous?: string; store?: ChangelogStore; scope?: string } = {},
): Promise<{ changelog?: string; base?: string; commits?: number; scope?: string; error?: string }> {
  const scope = opts.scope || ''
  const m = await changelogMaterial(raw, branch, base, scope || undefined)
  if (!m) return { error: `No base to read ${branch} against — it has no upstream and the repository has no trunk` }
  if (!m.entries.length) {
    return {
      error: scope
        ? `${branch} changes nothing under ${scope}`
        : `${branch} carries no commit over ${m.base}`,
    }
  }
  const r = await run(
    changelogPrompt(branch, m.base, m.entries, m.diffstat, opts.previous), CHANGELOG_TOKENS, 'changelog')
  if (r.error) return { error: r.error }
  if (opts.store) {
    // The insert memory outlives the text it was written from: regenerating
    // is exactly when it is needed. Keyed by scope as well, or a changelog
    // written for one package would replace the branch's own in the store.
    const key = changelogKey(branch, scope)
    const before = await opts.store.get(key)
    await opts.store.set(key, {
      text: r.text ?? '', base: m.base, commits: m.entries.length, at: Date.now(), scope,
      headSha: await sha(raw, branch), baseSha: await sha(raw, m.base),
      inserted: before?.inserted,
    })
  }
  return { changelog: r.text, base: m.base, commits: m.entries.length, scope }
}

/**
 * How a changelog is filed: by the branch, and by what it describes.
 *
 * A branch can have a changelog of its own AND one per package it touches,
 * and they are different texts about the same commits. Git refuses `:` in a
 * ref name, so `::` cannot collide with a branch.
 */
export const changelogKey = (branch: string, scope?: string): string =>
  scope ? `${branch}::${scope}` : branch

/** The branch and the scope a key was made from. */
export function readChangelogKey(key: string): { branch: string; scope: string } {
  const at = key.indexOf('::')
  return at === -1 ? { branch: key, scope: '' } : { branch: key.slice(0, at), scope: key.slice(at + 2) }
}

/**
 * Whether a changelog living in `dir` has anything to say about this branch.
 *
 * The one thing no preference can override: a branch that changed nothing
 * under `cli/` has no entry to write in `cli/CHANGELOG.md`, whichever scope
 * the reader prefers. Checked before anything is asked.
 */
export async function scopeHasChanges(raw: Raw, branch: string, dir: string): Promise<boolean> {
  if (!dir) return true
  const base = await resolveBase(raw, branch)
  if (!base) return true          // nothing to measure against: do not block
  return touches(raw, branch, base, dir)
}

/**
 * The composer proposes; nothing here writes. The renderer stages and commits
 * one group at a time through the calls it already has, so the plan is
 * reviewed — and editable — before any of it becomes history.
 */
export async function proposeCommitSplit(raw: Raw, run: Run):
Promise<SplitProposal & { error?: string }> {
  const empty = { groups: [], unassigned: [], invented: [] }
  const m = await workingMaterial(raw)
  if (!m.files.length) return { ...empty, error: 'Nothing uncommitted to split' }
  if (m.files.length === 1) return { ...empty, error: 'One file is already one commit' }
  const diff = [m.staged, m.unstaged].filter(d => d.trim()).join('\n')
  const r = await run(splitPrompt(m.files, m.diffstat, diff), SPLIT_TOKENS, 'compose')
  if (r.error) return { ...empty, error: r.error }
  const proposal = parseSplit(r.text ?? '', m.files)
  if (!proposal.groups.length) return { ...proposal, error: 'The model proposed no usable commit' }
  return proposal
}
