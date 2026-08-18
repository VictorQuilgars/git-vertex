// graphVisibility.ts — what the graph is allowed to draw, and how git is told.
//
// Hiding used to mean one thing: a set of branch names that App.tsx turned into
// an explicit list of *visible* branches, passed to `getLog` as `refs`. That had
// two faults. It could only ever hide a branch — a tag, a whole remote or the
// stash had no way in — and because an explicit ref list replaces `--all`,
// hiding a single branch silently dropped every commit that only a tag or the
// stash reached. You hid one branch and lost your stashes.
//
// So visibility is now stated as what is *hidden*, and git is told the same way:
// `--exclude=<refname>` before `--all`. Git keeps deciding what is reachable, we
// only take tips away from it. A commit reachable from something still visible
// stays visible — which is what "hide this tag" should mean, and what a list of
// visible refs cannot express.

/**
 * A family of refs that can be hidden wholesale — the "Hide all …" actions.
 *
 * `stashes` appears here and nowhere else: the entries of `git stash list` are
 * the reflog of one ref, `refs/stash`, so git can exclude all of them or none.
 * There is no `--exclude` that drops `stash@{2}` alone, and pretending otherwise
 * in the UI would offer an action that cannot be honoured.
 */
export type RefFamily = 'branches' | 'remotes' | 'tags' | 'stashes'

/**
 * Everything currently hidden from the graph.
 *
 * `branches` holds names as `getBranches` reports them — `main` for a local
 * branch, `remotes/origin/topic` for a remote-tracking one. `remotes` holds
 * remote *names* (`origin`), which hides all of that remote's branches at once.
 * `families` is the wholesale layer and wins over the per-item sets.
 */
export interface GraphVisibility {
  branches: Set<string>
  remotes: Set<string>
  tags: Set<string>
  families: Set<RefFamily>
}

export function emptyVisibility(): GraphVisibility {
  return { branches: new Set(), remotes: new Set(), tags: new Set(), families: new Set() }
}

/** Is anything hidden at all? Drives the "N hidden" affordances. */
export function isAnythingHidden(v: GraphVisibility): boolean {
  return v.branches.size > 0 || v.remotes.size > 0 || v.tags.size > 0 || v.families.size > 0
}

/**
 * The `--exclude=<glob>` arguments for a `git log … --all`.
 *
 * Full refnames, because that is what `--all` matches against — the shorthand
 * accepted by `--branches`/`--tags` (`--exclude=topic --branches`) does not
 * apply here. `--exclude` only affects the *next* ref-collecting option, so the
 * caller must keep them immediately before `--all`.
 */
export function excludeGlobs(v: GraphVisibility): string[] {
  const globs: string[] = []

  if (v.families.has('branches')) globs.push('refs/heads/*')
  if (v.families.has('remotes')) globs.push('refs/remotes/*')
  if (v.families.has('tags')) globs.push('refs/tags/*')
  if (v.families.has('stashes')) globs.push('refs/stash')

  // Per-item exclusions are redundant once the family is gone, and a redundant
  // --exclude is not free: it is another argument on a command line that
  // already carries one per hidden ref.
  if (!v.families.has('branches') || !v.families.has('remotes')) {
    for (const name of v.branches) {
      const remote = name.startsWith('remotes/')
      if (remote ? v.families.has('remotes') : v.families.has('branches')) continue
      globs.push(remote ? `refs/${name}` : `refs/heads/${name}`)
    }
  }
  if (!v.families.has('remotes')) {
    for (const name of v.remotes) globs.push(`refs/remotes/${name}/*`)
  }
  if (!v.families.has('tags')) {
    for (const name of v.tags) globs.push(`refs/tags/${name}`)
  }

  return globs
}

/**
 * The `getLog` options for the graph as it is currently filtered.
 *
 * Both hosts had this inline and identical, down to the `refs/` strip — the
 * desktop App.tsx and the panel's app.tsx. It is one function now for the same
 * reason the URL builder became one: the second copy is the one that does not
 * get the fix.
 *
 * Solo still wins and still passes an explicit ref, because "show only this
 * branch" *is* a single tip. Everything else is `--all` minus what is hidden.
 */
export function logOptionsFor(opts: {
  maxCount: number
  all: boolean
  solo: string | null
  visibility: GraphVisibility
}): { maxCount: number; all?: boolean; refs?: string[]; excludes?: string[] } {
  if (opts.solo) {
    return { maxCount: opts.maxCount, refs: [opts.solo.replace(/^remotes\//, '')] }
  }
  const excludes = excludeGlobs(opts.visibility)
  return { maxCount: opts.maxCount, all: opts.all, ...(excludes.length ? { excludes } : {}) }
}

/**
 * Should this decoration be drawn on a commit?
 *
 * `%D` gives us `HEAD -> main`, `main`, `origin/main`, `tag: v1.2.0` and
 * `refs/stash`. Excluding a ref from the log only removes the commits nothing
 * else reaches; a tag on `main` keeps its commit *and* its chip. So the chips
 * are filtered here too, or "hide all tags" would visibly do nothing in the one
 * repository shape where tags always sit on a branch — which is most of them.
 *
 * `HEAD -> x` is never hidden. You can hide the branch you are on, and the log
 * still shows its commits because `--all` carries HEAD regardless; dropping the
 * chip as well would leave the graph with no mark of where you are standing.
 */
export function isRefHidden(
  decoration: string,
  v: GraphVisibility,
  remotes: readonly string[] = [],
): boolean {
  const ref = decoration.trim()
  if (!ref) return false
  if (ref.startsWith('HEAD ->') || ref === 'HEAD') return false

  if (ref === 'refs/stash') return v.families.has('stashes')

  if (ref.startsWith('tag:')) {
    const name = ref.slice('tag:'.length).trim()
    return v.families.has('tags') || v.tags.has(name)
  }

  const remote = remoteOf(ref, remotes)
  if (remote) {
    const listName = ref.startsWith('remotes/') ? ref : `remotes/${ref}`
    return v.families.has('remotes') || v.remotes.has(remote) || v.branches.has(listName)
  }

  return v.families.has('branches') || v.branches.has(ref)
}

/**
 * The remote a decoration belongs to, or null when it is a local branch.
 *
 * A decoration for a remote branch reads `origin/topic` and carries no marker
 * saying so — `feature/login` has a slash too. It is a remote branch when its
 * first segment names a remote, which only the caller knows, so the list is
 * passed in. When it is empty we fall back to `origin`, which is the assumption
 * the graph's own `processRefs` has always made: wrong for a repository whose
 * remote is named anything else, and no more wrong here than there.
 */
function remoteOf(ref: string, remotes: readonly string[]): string | null {
  if (ref.startsWith('remotes/')) {
    const rest = ref.slice('remotes/'.length)
    const slash = rest.indexOf('/')
    return slash > 0 ? rest.slice(0, slash) : null
  }
  const slash = ref.indexOf('/')
  if (slash <= 0) return null
  const head = ref.slice(0, slash)
  if (remotes.length) return remotes.includes(head) ? head : null
  return head === 'origin' ? head : null
}
