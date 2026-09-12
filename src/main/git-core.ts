// git-core.ts — the git operations both products share, and nothing else.
//
// The renderer is compiled into the desktop app AND the VS Code panel; the git
// operations behind it were not. `src/main/git-service.ts` and
// `vscode-extension/src/gitService.ts` were two implementations of the same
// contract, and they drifted: `getBlame` formatted its dates with `fr-FR` on
// the desktop and `en-US` in the panel — same method, same shared view, two
// different dates, in a UI that is English-only. Nothing could catch that: the
// parity tests see a method that is MISSING or takes fewer arguments, never one
// that quietly behaves differently.
//
// So the behaviour lives here once, and both services call it.
//
// ── The shape ──────────────────────────────────────────────────
//
// Everything below is either a pure function over git's output, or a function
// over a RUNNER — `(args) => Promise<string>`, one line of adapter on each
// host. What is host-specific stays on the host: the desktop resolves the git
// binary through a login shell (git-binary.ts) because an app launched from the
// Finder would otherwise run Apple's git 2.39; the panel takes VS Code's. The
// runner hides that difference and nothing here needs to know it.
//
// This file must stay free of `electron` and of `vscode` — it is imported by
// the desktop main process and bundled into the extension host, like
// theme-validate.ts. Adding an import from either breaks one of the two builds.
//
// ── Adding to it ───────────────────────────────────────────────
//
// One family at a time, with both services switched over in the same commit.
// `git-core-parity.test.ts` holds the list of what has moved and fails if
// either service grows its own copy back.

/** The one thing a host has to provide: run git, give me stdout. */
export type GitRunner = (args: string[]) => Promise<string>

export interface FileChange {
  path: string
  status: string  // A, M, D, R, C
  additions: number
  deletions: number
}

export interface BlameLine {
  hash: string
  shortHash: string
  author: string
  date: string
  lineNum: number
  content: string
}

/** A diff that could not be read is not an empty diff — see `commitDiff`. */
export interface DiffResult { diff: string; error?: string }

/** Which question a comparison answers — see `diffBetweenCommits`. */
export type CompareAxis = 'diverged' | 'endpoints'

/** What git wrote when it failed, or a last resort that is never empty. */
function reason(e: unknown): string {
  const message = (e as { message?: unknown })?.message
  return typeof message === 'string' && message.trim() ? message : String(e)
}

// ── Guards ──────────────────────────────────────────────────────

/**
 * A ref that is safe to put on a command line, or the reason it is not.
 *
 * An argument starting with `-` is read by git as an OPTION, whatever the
 * caller meant it as: a ref of `--exec=…` reaching a raw command is the whole
 * problem. Empty is refused for its own sake — `git diff ''` is not the diff
 * the caller asked for.
 */
/** One row of the branch list, as both products' BranchInfo. */
export interface BranchRow {
  name: string
  current: boolean
  remote: boolean
  commit: string
  label: string
  ahead?: number
  behind?: number
  gone?: boolean
  detached?: boolean
}

/**
 * The branch list, in ONE process and out of plumbing.
 *
 * It used to be two — `git branch -a --verbose` for the list, then
 * `for-each-ref` for ahead/behind — and the first of those is porcelain,
 * parsed by simple-git with a regex over text git writes for humans. That
 * parse is where `(HEAD detached at 1a2b3c4)` came out of the sidebar as a
 * branch called `(HEAD`, and where `remotes/origin/HEAD -> origin/main` still
 * comes out with `->` where its hash belongs. for-each-ref answers both
 * questions at once, in fields, with no sentence to misread.
 *
 * `%(contents:subject)` is LAST on purpose: a commit subject may contain the
 * separator and nothing else here can, so everything past the fourth `|`
 * belongs to it.
 */
export const BRANCH_FORMAT = '%(HEAD)|%(refname)|%(objectname:short)|%(upstream:track)|%(contents:subject)'

export function branchArgs(): string[] {
  return ['for-each-ref', 'refs/heads', 'refs/remotes', `--format=${BRANCH_FORMAT}`]
}

/** `[ahead 1, behind 2]`, `[gone]`, or nothing at all when a branch is level. */
function tracking(raw: string): Pick<BranchRow, 'ahead' | 'behind' | 'gone'> | null {
  if (!raw) return null
  return {
    ahead: parseInt(/ahead (\d+)/.exec(raw)?.[1] ?? '0', 10),
    behind: parseInt(/behind (\d+)/.exec(raw)?.[1] ?? '0', 10),
    gone: raw.includes('gone'),
  }
}

export function parseBranchRows(raw: string): BranchRow[] {
  const rows: BranchRow[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    const parts = line.split('|')
    if (parts.length < 5) continue
    const [head, refname, commit, track] = parts
    const subject = parts.slice(4).join('|')
    const remote = refname.startsWith('refs/remotes/')
    // `remotes/origin/main` and `main` — the names the UI has always used,
    // which are what `git branch -a` printed and what every caller compares
    // against. NOT `%(refname:short)`, which shortens
    // `refs/remotes/origin/HEAD` to `origin` and would collide with a branch.
    const name = remote
      ? `remotes/${refname.slice('refs/remotes/'.length)}`
      : refname.replace(/^refs\/heads\//, '')
    const row: BranchRow = {
      name,
      current: head.trim() === '*',
      remote,
      commit: commit.trim(),
      label: subject || name,
    }
    // Upstreams belong to local branches; a remote-tracking ref has none.
    const t = !remote ? tracking(track) : null
    if (t) Object.assign(row, t)
    rows.push(row)
  }
  return rows
}

/** Where HEAD is, when no ref in the list is marked current. */
export interface BranchList {
  rows: BranchRow[]
  /** HEAD is not on a branch: detached, or mid-rebase. The host names the state. */
  detached: boolean
}

/**
 * The branch list, and what to make of a HEAD that is on none of them.
 *
 * Two states hide behind "no row is current", and the UI needs a current row
 * for both, because that row is where the sidebar and the status bar read the
 * name. An UNBORN branch — HEAD points at a branch with no commit yet — has a
 * real name and `symbolic-ref` gives it. A DETACHED HEAD has no name at all,
 * and what to call it is the host's business: the label comes out of
 * `.git/rebase-merge/head-name` and a file read has no place in here.
 */
export async function branchRows(run: GitRunner): Promise<BranchList> {
  const rows = parseBranchRows(await run(branchArgs()))
  if (rows.some(r => r.current)) return { rows, detached: false }
  let unborn = ''
  try {
    // Succeeds only while HEAD is a symbolic ref, which is exactly the unborn
    // case once no ref carries the marker.
    unborn = (await run(['symbolic-ref', '--short', 'HEAD'])).trim()
  } catch { /* not a symbolic ref — detached */ }
  if (unborn) {
    rows.push({ name: unborn, current: true, remote: false, commit: '', label: unborn })
    return { rows, detached: false }
  }
  return { rows, detached: true }
}

export function assertRef(ref: string, label = 'reference'): string | null {
  if (typeof ref !== 'string' || !ref.trim()) return `Empty git ${label}`
  if (ref.trim().startsWith('-')) return `Invalid git ${label}: "${ref}"`
  return null
}

// ── Pure parsing ────────────────────────────────────────────────

/**
 * `git diff --numstat` names a rename as "old => new" or "dir/{old => new}/f";
 * both resolve to the NEW path, which is the one the status list keys on.
 */
export function numstatPath(raw: string): string {
  if (!raw.includes('=>')) return raw
  const braced = /^(.*)\{(.*) => (.*)\}(.*)$/.exec(raw)
  if (braced) return `${braced[1]}${braced[3]}${braced[4]}`.replace(/\/{2,}/g, '/')
  return raw.split('=>').pop()!.trim()
}

/** Per-path added/removed counts from `--numstat`. Binaries are omitted (git prints "-"). */
export function parseNumstat(raw: string): Map<string, { additions: number; deletions: number }> {
  const out = new Map<string, { additions: number; deletions: number }>()
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    const [a, d, ...rest] = line.split('\t')
    const path = rest.join('\t').trim()
    if (!path || a === '-' || d === '-') continue
    out.set(numstatPath(path), { additions: Number(a) || 0, deletions: Number(d) || 0 })
  }
  return out
}

/** `--name-status` joined with `--numstat`, as the file list the views draw. */
export function parseNameAndNumStat(nameStatus: string, numStat: string): FileChange[] {
  const stats: Record<string, { additions: number; deletions: number }> = {}
  for (const line of numStat.trim().split('\n')) {
    const parts = line.split('\t')
    if (parts.length >= 3) {
      stats[parts[2]] = { additions: parseInt(parts[0]) || 0, deletions: parseInt(parts[1]) || 0 }
    }
  }
  const files: FileChange[] = []
  for (const line of nameStatus.trim().split('\n')) {
    if (!line.trim()) continue
    const parts = line.split('\t')
    const rawStatus = parts[0]?.[0] ?? 'M'
    const status = rawStatus === 'A' ? 'A' : rawStatus === 'D' ? 'D' : rawStatus === 'R' ? 'R' : 'M'
    const path = parts[status === 'R' ? 2 : 1] ?? ''
    if (!path) continue
    files.push({ path, status, ...(stats[path] ?? { additions: 0, deletions: 0 }) })
  }
  return files
}

/**
 * The locale blame dates are written in.
 *
 * Hard-coded, and that is the point: the shipped UI is English-only, and this
 * used to be `fr-FR` on the desktop and `en-US` in the panel — the same file,
 * blamed in the same shared view, dated `11/09/2026` in one product and
 * `9/11/2026` in the other. A host's system locale is not a display decision.
 */
export const BLAME_DATE_LOCALE = 'en-US'

/**
 * `git blame --porcelain` into one entry per line.
 *
 * `--porcelain` (not `--line-porcelain`) emits a commit's author and date ONCE,
 * on its first line, and only the header afterwards — so the metadata of a
 * commit already seen has to be remembered, which is what `meta` is for. It is
 * also why this is not `--line-porcelain` with a simpler loop: on a long file
 * blamed to a handful of commits, repeating every field per line is most of the
 * output.
 */
export function parseBlamePorcelain(out: string): BlameLine[] {
  const lines: BlameLine[] = []
  const raw = out.split('\n')
  const meta: Record<string, { author: string; date: string }> = {}
  let i = 0
  while (i < raw.length) {
    const header = raw[i]
    if (!header) { i++; continue }
    const headerMatch = header.match(/^([0-9a-f]{40}) \d+ (\d+)/)
    if (!headerMatch) { i++; continue }
    const commitHash = headerMatch[1]
    const lineNum = parseInt(headerMatch[2])
    i++
    // Metadata lines until the content line, which is the one starting with a tab.
    let author = meta[commitHash]?.author ?? ''
    let date = meta[commitHash]?.date ?? ''
    while (i < raw.length && !raw[i].startsWith('\t')) {
      const metaLine = raw[i]
      if (metaLine.startsWith('author ') && !meta[commitHash]) author = metaLine.slice(7)
      if (metaLine.startsWith('author-time ') && !meta[commitHash]) {
        date = new Date(parseInt(metaLine.slice(12)) * 1000).toLocaleDateString(BLAME_DATE_LOCALE)
      }
      i++
    }
    if (!meta[commitHash]) meta[commitHash] = { author, date }
    else ({ author, date } = meta[commitHash])
    const content = raw[i] ? raw[i].slice(1) : ''
    i++
    lines.push({ hash: commitHash, shortHash: commitHash.slice(0, 7), author, date, lineNum, content })
  }
  return lines
}

// ── Argument builders ───────────────────────────────────────────

/** The arguments `git diff` needs for one comparison, in one place. */
export function compareRange(from: string, to: string | null, axis: CompareAxis): string[] {
  if (to === null) return [from]
  return [axis === 'diverged' ? `${from}...${to}` : `${from}..${to}`]
}

/** `git diff` for one path of the working tree, with an optional context size. */
export function workingFileDiffArgs(filepath: string, staged: boolean, context?: number): string[] {
  const ctx = typeof context === 'number' && Number.isFinite(context)
    ? [`-U${Math.max(0, Math.floor(context))}`]
    : []
  return staged
    ? ['diff', '--cached', ...ctx, '--', filepath]
    : ['diff', ...ctx, '--', filepath]
}

// ── Operations ──────────────────────────────────────────────────

/**
 * The patch of one commit.
 *
 * A diff that could not be read is NOT an empty diff. Every method here used to
 * answer `{ diff: '' }` to both, and the views said "No changes" over a commit
 * git had refused to show. The error travels; the view says it.
 */
export async function commitDiff(run: GitRunner, commitHash: string): Promise<DiffResult> {
  try {
    const parents = await run(['log', '--pretty=format:%P', '-n', '1', commitHash])
    const parentList = parents.trim().split(' ').filter(Boolean)
    const diff = parentList.length > 0
      ? await run(['diff', `${parentList[0]}..${commitHash}`])
      // Root commit: there is no parent to diff against.
      : await run(['show', commitHash, '--pretty=format:', '--no-color'])
    return { diff }
  } catch (e) {
    return { diff: '', error: reason(e) }
  }
}

/** The files one commit touched. `--root` so the initial commit reports its own. */
export async function commitFiles(run: GitRunner, commitHash: string): Promise<{ files: FileChange[] }> {
  try {
    const [nameStatus, numStat] = await Promise.all([
      run(['diff-tree', '--no-commit-id', '-r', '--root', '--name-status', commitHash]),
      run(['diff-tree', '--no-commit-id', '-r', '--root', '--numstat', commitHash]),
    ])
    return { files: parseNameAndNumStat(nameStatus, numStat) }
  } catch {
    return { files: [] }
  }
}

/**
 * The diff between two refs — along the axis the caller asks for.
 *
 * `endpoints` is two-dot, `A..B`: the difference between the two trees as they
 * stand. `diverged` is three-dot, `A...B`: what B did since the two parted,
 * which is what a pull request shows and what `git log A..B` — the commit list
 * beside it — has always answered.
 *
 * The distinction is not cosmetic. On `main..feature`, two-dot reports every
 * file main gained since the split as *deleted*, because they are absent from
 * feature's tree; the comparison then claims a branch deleted files it never
 * touched.
 *
 * ⚠️ `diverged` is empty when `to` is an ANCESTOR of `from`: the merge base is
 * `to` itself, so there is nothing between them. That is correct and useless,
 * which is why the default at the call sites stays `endpoints` — a caller
 * comparing two commits the user picked by hand, in the order they picked them,
 * must not silently show nothing.
 *
 * `to: null` compares against the working tree.
 */
export async function diffBetweenCommits(
  run: GitRunner, fromHash: string, toHash: string | null, axis: CompareAxis = 'endpoints',
): Promise<DiffResult> {
  const bad = assertRef(fromHash, 'commit') || (toHash !== null && assertRef(toHash, 'commit'))
  if (bad) return { diff: '', error: bad }
  try {
    return { diff: await run(['diff', ...compareRange(fromHash, toHash, axis)]) }
  } catch (e) {
    return { diff: '', error: reason(e) }
  }
}

/** The file list of the same comparison — same axis, same rules. */
export async function filesBetweenCommits(
  run: GitRunner, fromHash: string, toHash: string | null, axis: CompareAxis = 'endpoints',
): Promise<{ files: FileChange[]; error?: string }> {
  const bad = assertRef(fromHash, 'commit') || (toHash !== null && assertRef(toHash, 'commit'))
  if (bad) return { files: [], error: bad }
  try {
    const range = compareRange(fromHash, toHash, axis)
    const [nameStatus, numStat] = await Promise.all([
      run(['diff', '--name-status', ...range]),
      run(['diff', '--numstat', ...range]),
    ])
    return { files: parseNameAndNumStat(nameStatus, numStat) }
  } catch (e) {
    return { files: [], error: reason(e) }
  }
}

/** The commit two refs last had in common, or null when they share none. */
export async function mergeBase(
  run: GitRunner, a: string, b: string,
): Promise<{ base: string | null; error?: string }> {
  const bad = assertRef(a, 'ref') || assertRef(b, 'ref')
  if (bad) return { base: null, error: bad }
  try {
    return { base: (await run(['merge-base', a, b])).trim() || null }
  } catch {
    // Unrelated histories: git fails loudly and there is no base to name.
    return { base: null }
  }
}

/** The patch of one path in the working tree, staged or not. */
export async function workingFileDiff(
  run: GitRunner, filepath: string, staged: boolean, context?: number,
): Promise<DiffResult> {
  try {
    return { diff: await run(workingFileDiffArgs(filepath, staged, context)) }
  } catch (e) {
    return { diff: '', error: reason(e) }
  }
}

/** Per-path line counts for a section of the working tree (`[]` or `['--cached']`). */
export async function workingNumstat(
  run: GitRunner, args: string[],
): Promise<Map<string, { additions: number; deletions: number }>> {
  try {
    return parseNumstat(await run(['diff', '--numstat', ...args]))
  } catch {
    // No stats is a degraded display, never a reason to fail the whole status.
    return new Map()
  }
}

/** What the working tree has that this commit did not. */
export async function diffCommitToWorking(run: GitRunner, hash: string): Promise<DiffResult> {
  try {
    return { diff: await run(['diff', hash]) }
  } catch (e) {
    return { diff: '', error: reason(e) }
  }
}

/** Unified diff of one file within one commit — what the file-history tab draws. */
export async function fileDiffAtCommit(
  run: GitRunner, commitHash: string, filepath: string,
): Promise<DiffResult> {
  const bad = assertRef(commitHash, 'commit')
  if (bad) return { diff: '', error: bad }
  try {
    return { diff: await run(['show', commitHash, '--format=', '--follow', '--', filepath]) }
  } catch (e) {
    return { diff: '', error: reason(e) }
  }
}

/** The full patch of a stash, untracked files included where git can. */
export async function stashDiff(run: GitRunner, index: number): Promise<DiffResult> {
  const ref = `stash@{${index}}`
  try {
    return { diff: await run(['stash', 'show', '-p', '--include-untracked', ref]) }
  } catch {
    // `--include-untracked` on `stash show` needs git ≥ 2.32 — retry without it
    // rather than report a failure on a machine with an older git (macOS still
    // ships 2.39, and Apple's is what an app launched from the Finder finds).
    try {
      return { diff: await run(['stash', 'show', '-p', ref]) }
    } catch (e) {
      return { diff: '', error: reason(e) }
    }
  }
}

/** Blame one file at one revision. */
export async function blame(
  run: GitRunner, rev: string, filepath: string,
): Promise<{ lines: BlameLine[] }> {
  try {
    return { lines: parseBlamePorcelain(await run(['blame', '--porcelain', rev, '--', filepath])) }
  } catch {
    return { lines: [] }
  }
}

/** Commits whose diff adds or removes `query` — `git log -S`, capped. */
export async function searchInDiffs(run: GitRunner, query: string): Promise<{ hashes: string[] }> {
  try {
    const out = await run(['log', '--all', '--pretty=format:%H', '-S', query, '--max-count=100'])
    return { hashes: out.trim().split('\n').filter(Boolean) }
  } catch {
    return { hashes: [] }
  }
}
