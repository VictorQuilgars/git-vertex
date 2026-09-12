// Which working-tree changes are worth a refresh — and which are a build.
//
// The working-tree watcher is recursive over the whole repository, so it sees
// `node_modules`, `dist`, `out`, coverage reports, a bundler's temporary files:
// everything the repository was told to ignore. Every one of those used to
// reach `git:working-changed`, and the window answers that with a full
// refresh. A `npm run build` in a window left open is therefore a refresh
// every 1.5 seconds, for changes that cannot appear anywhere in the UI —
// which on Windows is most of what the app is doing.
//
// So the batch collected during the debounce is asked about first, with the
// only authority on the question: `git check-ignore`. Not a list of directory
// names — `dist` is ignored in one repository and committed in the next, and
// guessing would eventually hide a real change, which is the one failure this
// must not have.
//
// Three things keep it cheap:
//
//   - One process for the whole batch, not one per path.
//   - An answer per path is remembered. Whether a path is ignored almost never
//     changes, so a build touching the same files pays once, and an edit to a
//     tracked file pays once ever — after that the short-circuit below returns
//     without a process at all.
//   - As soon as ONE path in the batch is known to be watched, the rest of the
//     question is pointless: the refresh is happening.
//
// `check-ignore` consults the index, so a TRACKED file is never reported
// ignored even when a pattern matches it — which is exactly the rule we want,
// and another reason not to match patterns ourselves.

/** Given repository-relative paths, the subset git considers ignored. */
export type IgnoreProbe = (paths: string[]) => Promise<string[]>

/**
 * Beyond this many distinct undecided paths in one window, stop asking and
 * refresh. A batch that large is a checkout or an install, and both end in a
 * refresh anyway.
 */
export const MAX_BATCH = 512

/** How many decisions to keep. A repository has far fewer live paths than this. */
const MAX_REMEMBERED = 5000

export interface WatchFilter {
  /** True when the batch contains anything the repository tracks or would track. */
  worthRefreshing(paths: string[]): Promise<boolean>
  /** Forget every decision — the rules themselves changed. */
  forget(): void
}

/** The basename of a repository-relative path, on either separator. */
function basename(p: string): string {
  const cut = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return cut === -1 ? p : p.slice(cut + 1)
}

export function makeWatchFilter(probe: IgnoreProbe): WatchFilter {
  // path → ignored. Absent means undecided.
  let known = new Map<string, boolean>()

  const forget = (): void => { known = new Map() }

  return {
    forget,
    async worthRefreshing(paths: string[]): Promise<boolean> {
      if (!paths.length) return false
      // The rules changed: every decision is suspect, and the change itself is
      // one the user can see (a file appearing in, or leaving, the staging
      // area). Refresh, and start again from nothing.
      if (paths.some(p => basename(p) === '.gitignore' || basename(p) === '.gitattributes')) {
        forget()
        return true
      }
      const undecided: string[] = []
      for (const p of paths) {
        const seen = known.get(p)
        if (seen === false) return true   // known to be watched — nothing else matters
        if (seen === undefined) undecided.push(p)
      }
      if (!undecided.length) return false
      if (undecided.length > MAX_BATCH) return true

      let ignored: Set<string>
      try {
        ignored = new Set(await probe(undecided))
      } catch {
        // git could not answer. A change we cannot classify is a change: the
        // cost of a needless refresh is a few processes, the cost of a missed
        // one is a graph that lies.
        return true
      }
      if (known.size + undecided.length > MAX_REMEMBERED) forget()
      let watched = false
      for (const p of undecided) {
        const isIgnored = ignored.has(p)
        known.set(p, isIgnored)
        if (!isIgnored) watched = true
      }
      return watched
    },
  }
}

// ── The other watcher: inside .git ─────────────────────────────
//
// That one has no ignore file to consult, and most of what it sees cannot
// change anything the window draws. A fetch writes thousands of loose objects
// and a pack; every git command that writes takes and drops a `.lock`. The
// debounce is trailing, so a long stream of object writes does not merely
// cost events — it HOLDS THE REFRESH BACK until the stream stops, which on a
// slow Windows fetch is the whole fetch.
//
// What is ignored is only what cannot be the story on its own: objects are
// always followed by the ref update that makes them reachable, and a lock
// file is a lock file. Everything else — HEAD, refs, packed-refs, the index,
// MERGE_HEAD, the rebase directories, FETCH_HEAD — still fires.
const GIT_NOISE = [
  // Object writes: a fetch, a commit, a gc. The ref that follows is the news.
  /^objects[/\\]/,
  // Taken and dropped by every writing git command, ours included.
  /\.lock$/,
]

/** True when a change inside `.git` could alter what the window shows. */
export function gitDirChangeMatters(relPath: string): boolean {
  if (!relPath) return false
  return !GIT_NOISE.some(re => re.test(relPath))
}
