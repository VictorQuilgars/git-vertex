// ai-material.ts — what the repository has to say before a prompt can be
// written: which base a branch is read against, what a stash holds, what is
// uncommitted.
//
// It takes a `raw` runner rather than a GitService, so the desktop main
// process and the extension host feed it their own git and get the SAME
// answer — the material is where the two products drifted before (the
// extension's PR description resolved refs one way, the desktop another), and
// CLAUDE.md's worse case is a method that exists on both sides with a poorer
// signature. Free of `electron`, `vscode`, and simple-git.

/** One git invocation, as both products already expose it. */
export type Raw = (args: string[]) => Promise<string>

const quiet = async (raw: Raw, args: string[]): Promise<string> => {
  try { return await raw(args) } catch { return '' }
}

/** Does this ref resolve? `--verify --quiet` exits 1 rather than printing. */
const exists = async (raw: Raw, ref: string): Promise<boolean> =>
  !!(await quiet(raw, ['rev-parse', '--verify', '--quiet', ref])).trim()

/**
 * The branch a comparison should read against — worked out, never assumed.
 *
 * A branch is read against the trunk it would land on; the trunk itself is
 * read against its own upstream, which is what "what have I not pushed" means
 * and the only base that leaves the question answerable at all. The remote's
 * copy wins over the local one, so a stale local `main` does not make a branch
 * look like it carries the trunk's last week as well as its own work.
 */
export async function resolveBase(raw: Raw, branch: string): Promise<string | null> {
  const remote = (await quiet(raw, ['remote'])).split('\n').map(r => r.trim()).filter(Boolean)
  const origin = remote.includes('origin') ? 'origin' : remote[0]

  // The caller may hand over a branch as the graph names it — `origin/main`,
  // or `remotes/origin/main` from the branch list. Both are the trunk, and
  // comparing the decorated form against a bare trunk name would read
  // `origin/main` as an ordinary branch and hand it itself as its own base.
  // Only a REAL remote's prefix is stripped, or `feat/x` would become `x`.
  let bare = branch.replace(/^remotes\//, '')
  for (const r of remote) if (bare.startsWith(`${r}/`)) { bare = bare.slice(r.length + 1); break }

  let trunk: string | null = null
  if (origin) {
    const head = (await quiet(raw, ['symbolic-ref', '--short', `refs/remotes/${origin}/HEAD`])).trim()
    const prefix = `${origin}/`
    if (head.startsWith(prefix)) trunk = head.slice(prefix.length)
    if (!trunk) {
      for (const candidate of ['main', 'master']) {
        if (await exists(raw, `refs/remotes/${origin}/${candidate}`)) { trunk = candidate; break }
      }
    }
  }
  if (!trunk) {
    for (const candidate of ['main', 'master']) {
      if (await exists(raw, `refs/heads/${candidate}`)) { trunk = candidate; break }
    }
  }

  if (trunk && trunk !== bare) {
    if (origin && await exists(raw, `refs/remotes/${origin}/${trunk}`)) return `${origin}/${trunk}`
    if (await exists(raw, `refs/heads/${trunk}`)) return trunk
  }
  // The trunk itself, or a branch in a repo that has no trunk: its upstream is
  // the only honest base left.
  const upstream = (await quiet(raw, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', `${branch}@{upstream}`])).trim()
  return upstream || null
}

export interface BranchMaterial {
  base: string
  /** Subjects, oldest first — a branch is a story told in order. */
  subjects: string[]
  diffstat: string
  diff: string
}

/** What `branch` carries that its base does not. Three dots, the app's axis. */
export async function branchMaterial(raw: Raw, branch: string, base?: string): Promise<BranchMaterial | null> {
  const b = base ?? await resolveBase(raw, branch)
  if (!b) return null
  const range = `${b}...${branch}`
  const subjects = (await quiet(raw, ['log', '--reverse', '--format=%s', `${b}..${branch}`]))
    .split('\n').map(s => s.trim()).filter(Boolean)
  return {
    base: b,
    subjects,
    diffstat: await quiet(raw, ['diff', '--stat', range]),
    diff: await quiet(raw, ['diff', range]),
  }
}

/** Subject + body per commit, for a changelog that can say why. */
export async function changelogMaterial(raw: Raw, branch: string, base?: string): Promise<{ base: string; entries: string[]; diffstat: string } | null> {
  const b = base ?? await resolveBase(raw, branch)
  if (!b) return null
  // A record separator rather than a blank line: a commit body contains blank
  // lines, and splitting on those would cut messages in half.
  const log = await quiet(raw, ['log', '--reverse', `--format=%s%n%b%x1e`, `${b}..${branch}`])
  const entries = log.split('\x1e').map(e => e.trim()).filter(Boolean)
  return { base: b, entries, diffstat: await quiet(raw, ['diff', '--stat', `${b}...${branch}`]) }
}

/**
 * A stash's own label, and what it holds. Untracked files included.
 *
 * Takes an index OR a ref: `stash@{0}` moves under every push and pop, so a
 * reading kept about a stash is keyed by its commit and asks again by that.
 * `git stash show` accepts any stash-like commit, which a stash commit is.
 */
export async function stashMaterial(raw: Raw, index: number | string): Promise<{ label: string; diff: string }> {
  const ref = typeof index === 'number' ? `stash@{${index}}` : index
  const label = (await quiet(raw, ['log', '-1', '--format=%s', ref])).trim()
  // --include-untracked needs git ≥ 2.32; without it a stash taken with `-u`
  // reads as smaller than it is, which is worth a retry rather than an error.
  let diff = await quiet(raw, ['stash', 'show', '--include-untracked', '-p', ref])
  if (!diff.trim()) diff = await quiet(raw, ['stash', 'show', '-p', ref])
  return { label, diff }
}

export interface WorkingMaterial {
  staged: string
  unstaged: string
  diffstat: string
  /** Every path with uncommitted work — tracked or not, deduplicated. */
  files: string[]
}

/**
 * How much untracked content is worth reading. A new file's PATH places it in
 * a split; its content is what lets a message say more than "add file". Both
 * are capped, because a first commit of a vendored tree is thousands of files
 * and the prompt has a budget.
 */
const UNTRACKED_FILE_LIMIT = 25
const UNTRACKED_CHAR_BUDGET = 20000

export async function workingMaterial(raw: Raw): Promise<WorkingMaterial> {
  const staged = await quiet(raw, ['diff', '--cached'])
  const tracked = await quiet(raw, ['diff'])
  const untracked = (await quiet(raw, ['ls-files', '--others', '--exclude-standard']))
    .split('\n').map(f => f.trim()).filter(Boolean)

  // Untracked content has no diff of its own — git has nothing to compare it
  // to. `--no-index` against /dev/null produces the same "new file" hunk an
  // added file would show, and reads nothing that is not already on disk.
  // Where that idiom yields nothing (a binary, or a platform whose git does
  // not take /dev/null), the file still reaches the model by path through
  // `files` and the diffstat — quieter, never missing.
  let budget = UNTRACKED_CHAR_BUDGET
  const extras: string[] = []
  for (const file of untracked.slice(0, UNTRACKED_FILE_LIMIT)) {
    if (budget <= 0) break
    // Exits 1 when the files differ, which is always — quiet() keeps the text.
    const d = await quiet(raw, ['diff', '--no-index', '--', '/dev/null', file])
    if (!d.trim()) continue
    extras.push(d.length > budget ? d.slice(0, budget) + '\n... [diff truncated]' : d)
    budget -= d.length
  }

  const names = (out: string): string[] => out.split('\n').map(f => f.trim()).filter(Boolean)
  const files = [...new Set([
    ...names(await quiet(raw, ['diff', '--cached', '--name-only'])),
    ...names(await quiet(raw, ['diff', '--name-only'])),
    ...untracked,
  ])].sort()

  // `--stat HEAD` covers the tracked half only: an untracked file is not in
  // HEAD and not in the index, so git counts it nowhere. Listed after, or the
  // stat would say the work is smaller than it is.
  const stat = await quiet(raw, ['diff', '--stat', 'HEAD'])
  const news = untracked.map(f => ` ${f} (new file)`).join('\n')
  return {
    staged,
    unstaged: [tracked, ...extras].filter(t => t.trim()).join('\n'),
    diffstat: [stat.trim(), news].filter(Boolean).join('\n'),
    files,
  }
}
