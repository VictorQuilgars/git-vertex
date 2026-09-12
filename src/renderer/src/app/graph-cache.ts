// The graph a repository had last time, kept so that opening it draws
// something before git has said a word.
//
// Everything else here made the refresh cheaper. This one makes it invisible:
// the work still happens, but not in front of the user. Opening a repository
// meant an empty window until ten git processes had answered — on Windows,
// where starting git.exe costs an order of magnitude more than running it,
// long enough to watch. The graph of the previous visit is on screen in the
// first frame instead, and the real one replaces it when it lands. Nothing is
// skipped and no answer is taken from here: the refresh runs exactly as it
// would have, silently, because something correct-looking is already drawn.
//
// ── Where it lives ─────────────────────────────────────────────
//
// localStorage, not a file through the preload — which is not a shortcut but
// the reason it works in BOTH products. The renderer is compiled into the
// desktop app and into the VS Code panel, and a new preload method would be a
// desktop-only cache plus an entry in the parity lists. A browser API is the
// one storage both hosts already have. It is also synchronous, so the restore
// happens in the same tick as the switch rather than a frame later.
//
// Every access is wrapped: localStorage throws outright in some contexts, and
// comes back empty in others. A cache that is not there is not an error — it
// is the state every first visit is in.
//
// ── What is NOT kept ───────────────────────────────────────────
//
// The working tree: conflicts, the conflict mode, the WIP count. Those are
// about the files on disk right now, they change while the app is closed, and
// a stale one is not a slightly-old graph but a wrong statement — a phantom
// WIP row, or a conflict banner over a repository that has none. They cost one
// `git status` that the refresh is making anyway.
import type { BranchInfo, CommitNode } from '../types'
import type { StashEntry, TagEntry } from './shared'

/** The subset of the Storage interface used here, so tests can pass their own. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface CachedGraph {
  commits: CommitNode[]
  branches: BranchInfo[]
  currentBranch: string
  stashes: StashEntry[]
  tags: TagEntry[]
  tracking: { ahead: number; behind: number }
  logLimit: number
}

/** Bumped when the shape changes: an entry written by an older app is dropped, not read. */
export const CACHE_VERSION = 1
const KEY = 'gv:graph:'
const INDEX_KEY = `${KEY}index`
/** How many repositories keep a graph. Past this the least recently written goes. */
export const MAX_REPOS = 6
/** A page, and no more — the user may have scrolled to five thousand commits. */
export const MAX_COMMITS = 500
/**
 * Past this, draw nothing rather than a month-old graph. The refresh would
 * correct it either way, but a restore this old is more likely to be a
 * repository that moved on entirely than a quick return to yesterday's work.
 */
export const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

interface Entry { path: string; savedAt: number }
interface Stored extends CachedGraph { version: number; savedAt: number }

/** The default store, or null wherever localStorage is refused. */
export function defaultStore(): StorageLike | null {
  try { return globalThis.localStorage ?? null } catch { return null }
}

function readIndex(store: StorageLike): Entry[] {
  try {
    const raw = store.getItem(INDEX_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter((e): e is Entry =>
      !!e && typeof (e as Entry).path === 'string' && typeof (e as Entry).savedAt === 'number')
  } catch { return [] }
}

function writeIndex(store: StorageLike, entries: Entry[]): void {
  try { store.setItem(INDEX_KEY, JSON.stringify(entries)) } catch { /* full, or refused */ }
}

function drop(store: StorageLike, path: string): void {
  try { store.removeItem(KEY + path) } catch { /* refused */ }
}

/** Is there a graph to draw for this repository? Reads the index only — no payload is parsed. */
export function hasGraph(path: string, store = defaultStore()): boolean {
  if (!store) return false
  const entry = readIndex(store).find(e => e.path === path)
  return !!entry && Date.now() - entry.savedAt <= MAX_AGE_MS
}

/**
 * The graph this repository had, or null. A malformed or outdated entry is
 * removed rather than repaired: it was written by this app, so anything we
 * cannot read is a bug or a version we no longer speak, and both are worth
 * forgetting.
 */
export function readGraph(path: string, store = defaultStore()): CachedGraph | null {
  if (!store) return null
  let raw: string | null
  try { raw = store.getItem(KEY + path) } catch { return null }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Stored
    const ok = parsed
      && parsed.version === CACHE_VERSION
      && typeof parsed.savedAt === 'number'
      && Date.now() - parsed.savedAt <= MAX_AGE_MS
      && Array.isArray(parsed.commits)
      && parsed.commits.every(c => !!c && typeof c.hash === 'string')
      && Array.isArray(parsed.branches)
    if (!ok) { forgetGraph(path, store); return null }
    return {
      commits: parsed.commits,
      branches: parsed.branches,
      currentBranch: typeof parsed.currentBranch === 'string' ? parsed.currentBranch : '',
      stashes: Array.isArray(parsed.stashes) ? parsed.stashes : [],
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      tracking: {
        ahead: parsed.tracking?.ahead ?? 0,
        behind: parsed.tracking?.behind ?? 0,
      },
      logLimit: typeof parsed.logLimit === 'number' ? parsed.logLimit : MAX_COMMITS,
    }
  } catch { forgetGraph(path, store); return null }
}

/** Keep this repository's graph. Silent on every failure — a cache is never worth an error. */
export function writeGraph(path: string, graph: CachedGraph, store = defaultStore()): void {
  if (!store || !path) return
  const commits = graph.commits.slice(0, MAX_COMMITS)
  const payload: Stored = {
    ...graph,
    commits,
    // The page that is actually kept, so a restore does not claim to hold
    // five thousand commits and draw five hundred.
    logLimit: Math.min(graph.logLimit, MAX_COMMITS),
    version: CACHE_VERSION,
    savedAt: Date.now(),
  }
  const index = [{ path, savedAt: payload.savedAt }, ...readIndex(store).filter(e => e.path !== path)]
  for (const stale of index.splice(MAX_REPOS)) drop(store, stale.path)
  try {
    store.setItem(KEY + path, JSON.stringify(payload))
  } catch {
    // Out of room: the oldest goes and we try once more — never our own
    // entry, which is the one at the head and the one being written. If that
    // fails too, this repository simply has no cache, which is the state it
    // was already in.
    const oldest = index.length > 1 ? index.pop() : undefined
    if (oldest) drop(store, oldest.path)
    try { store.setItem(KEY + path, JSON.stringify(payload)) } catch { return }
  }
  writeIndex(store, index)
}

/** Forget one repository — it was closed, or what it held could not be read. */
export function forgetGraph(path: string, store = defaultStore()): void {
  if (!store) return
  drop(store, path)
  writeIndex(store, readIndex(store).filter(e => e.path !== path))
}
