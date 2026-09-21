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
  /** When the tip was committed, as git counts it (seconds since the epoch). */
  date?: number
  /** The branch a local one tracks, as `%D` decorates it: `origin/main`. */
  upstream?: string
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
 * belongs to it. (`%(upstream:short)` is a ref name, and `|` is not allowed in
 * one: check-ref-format refuses it, so the sixth field cannot hold the separator.)
 */
export const BRANCH_FORMAT = '%(HEAD)|%(refname)|%(objectname:short)|%(upstream:track)|%(committerdate:unix)|%(upstream:short)|%(contents:subject)'

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
    if (parts.length < 7) continue
    const [head, refname, commit, track, date, upstream] = parts
    const subject = parts.slice(6).join('|')
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
    const when = parseInt(date, 10)
    if (Number.isFinite(when) && when > 0) row.date = when
    // Named even when it is gone: "tracks origin/x, which no longer exists" is a fact worth showing.
    if (!remote && upstream.trim()) row.upstream = upstream.trim()
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

// ── The graph's page ────────────────────────────────────────────

/** One commit of the graph's page, as both products' CommitNode. */
export interface LogCommit {
  hash: string
  shortHash: string
  /** The subject line. */
  message: string
  /**
   * The rest of the message, on one line: whitespace folded, cut at
   * LOG_BODY_MAX. The graph draws it after the subject, muted, and a row has
   * one line for both. Absent when the commit has no body.
   */
  body?: string
  author: string
  authorEmail: string
  date: string
  parents: string[]
  refs: string[]
  /** Lines added and removed, when the page was asked with `numstat`. */
  additions?: number
  deletions?: number
}

export interface LogOptions {
  maxCount: number
  all?: boolean
  refs?: string[]
  excludes?: string[]
  /** Count each commit's added and removed lines — the desktop's stats column. */
  numstat?: boolean
}

/**
 * The page's format: a unit separator between the fields and a record
 * separator after the body. A printable separator was a bet on the subject —
 * `a | b` moved every field after it one place along, and the author became
 * half a subject — and a body is several lines, which a line-per-commit
 * reading cannot hold. %D is before the body so that nothing after the hash
 * can hold the separators but the body itself.
 *
 * ⚠️ NOT %G?: it makes git verify every signed commit on the page, one gpg
 * process each, for a value the graph does not draw (see `signature` in the
 * renderer's types.ts). 580 ms against 150 ms on a 200-commit page.
 */
export const LOG_FORMAT = '%H%x1f%P%x1f%s%x1f%an%x1f%ae%x1f%ai%x1f%D%x1f%b%x1e'

/** How much of a body the page carries: the graph draws one line of it. */
export const LOG_BODY_MAX = 240

export function logArgs(o: LogOptions): string[] {
  const args = [
    // "added\tdeleted\tpath" lines after each record (none for a merge, whose
    // diff git log skips) — still one process for the whole page.
    ...(o.numstat ? ['--numstat'] : []),
    `--pretty=format:${LOG_FORMAT}`,
    `--max-count=${o.maxCount}`,
    // Children before parents, like --topo-order, but siblings by commit date.
    '--date-order',
  ]
  // Explicit refs (a branch shown alone) take precedence over --all. Hidden
  // refs are taken away from --all rather than replaced by a list of the
  // visible ones: git keeps deciding what is reachable, so a commit a visible
  // ref still reaches stays. --exclude only applies to the next ref-collecting
  // option, hence immediately before --all and nowhere else.
  if (o.refs && o.refs.length) args.push(...o.refs)
  else if (o.all) {
    if (o.excludes) args.push(...o.excludes.map(g => `--exclude=${g}`))
    args.push('--all')
  }
  return args
}

/** A record's first field: the full hash, at the start of a line. */
const LOG_RECORD_START = /(?:^|\n)[0-9a-f]{40}\x1f/

function addNumstat(commit: LogCommit, text: string): void {
  for (const line of text.split('\n')) {
    const parts = line.split('\t')
    if (parts.length < 2) continue
    // A binary file counts `-`: nothing to add.
    const a = parseInt(parts[0], 10), d = parseInt(parts[1], 10)
    if (!isNaN(a)) commit.additions = (commit.additions ?? 0) + a
    if (!isNaN(d)) commit.deletions = (commit.deletions ?? 0) + d
  }
}

/**
 * The page, out of `git log --pretty=format:LOG_FORMAT`. Each chunk between
 * two record separators holds what git printed after the previous record — its
 * numstat lines — and then the next record's fields.
 */
export function parseLog(raw: string, numstat = false): LogCommit[] {
  const commits: LogCommit[] = []
  let last: LogCommit | undefined
  for (const chunk of raw.split('\x1e')) {
    const m = LOG_RECORD_START.exec(chunk)
    const start = m ? m.index + (chunk[m.index] === '\n' ? 1 : 0) : chunk.length
    if (last && numstat) addNumstat(last, chunk.slice(0, start))
    if (!m) continue
    const [hash, parentStr, subject, author, authorEmail, date, refsStr, rawBody = ''] = chunk.slice(start).split('\x1f')
    const commit: LogCommit = {
      hash,
      shortHash: hash.slice(0, 7),
      message: subject || '(no message)',
      author: author || '',
      authorEmail: authorEmail || '',
      date: date || '',
      parents: parentStr ? parentStr.trim().split(' ').filter(Boolean) : [],
      refs: refsStr ? refsStr.split(',').map(r => r.trim()).filter(Boolean) : [],
    }
    const body = rawBody.replace(/\s+/g, ' ').trim().slice(0, LOG_BODY_MAX)
    if (body) commit.body = body
    if (numstat) { commit.additions = 0; commit.deletions = 0 }
    commits.push(commit)
    last = commit
  }
  return commits
}

export async function log(run: GitRunner, options: LogOptions): Promise<LogCommit[]> {
  return parseLog(await run(['log', ...logArgs(options)]), !!options.numstat)
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

/**
 * The commit a name stands for — a branch, a tag, a SHA, `HEAD~2`, anything
 * rev-parse takes — as a full hash, or null when it names no commit.
 *
 * The graph reaches a reference beyond its page by position (locateInHistory),
 * and a position is looked up by hash: a branch row only carries the short one.
 */
export async function resolveCommit(
  run: GitRunner, ref: string,
): Promise<{ hash: string | null; error?: string }> {
  const bad = assertRef(ref)
  if (bad) return { hash: null, error: bad }
  try {
    const out = (await run(['rev-parse', '--verify', '--quiet', `${ref.trim()}^{commit}`])).trim()
    return { hash: /^[0-9a-f]{40,64}$/.test(out) ? out : null }
  } catch {
    // `--quiet` makes an unknown name a silent failure: it is not a commit.
    return { hash: null }
  }
}

/**
 * The pathspecs a `file:` term becomes. A bare word — no slash, no wildcard —
 * finds any path that CONTAINS it, as a file's name or as a folder's
 * (`file:cache` is not a file called `cache`); anything shaped like a path is
 * taken as one, a folder included. Never case sensitive: nobody remembers
 * whether it was `README` or `Readme`.
 */
export function filePathspecs(value: string): string[] {
  const v = value.trim().replace(/^\.\//, '')
  if (!/[\/*?[]/.test(v)) return [`:(icase,glob)**/*${v}*`, `:(icase,glob)**/*${v}*/**`]
  // `:(glob)` for a pattern; a plain path keeps git's own reading, where a folder matches what is under it.
  return [/[*?[]/.test(v) ? `:(icase,glob)${v}` : `:(icase)${v}`]
}

/** The commits that touched any of these paths or folders, on any ref. */
export async function commitsTouching(
  run: GitRunner, paths: string[],
): Promise<{ hashes: string[]; error?: string }> {
  const wanted = paths.map(p => p.trim()).filter(Boolean)
  if (wanted.length === 0) return { hashes: [] }
  // A pathspec comes after `--`, where git reads no option: a leading dash is a file name there.
  if (wanted.some(p => /[\u0000-\u001f]/.test(p))) return { hashes: [], error: 'Invalid path' }
  try {
    const out = await run(['log', '--all', '--format=%H', '--', ...wanted.flatMap(filePathspecs)])
    return { hashes: out.split('\n').map(l => l.trim()).filter(Boolean) }
  } catch (e) {
    return { hashes: [], error: reason(e) }
  }
}

/** What a tag is: where it points, and — for an annotated one — who made it, when, and what they wrote. */
export interface TagDetails {
  name: string
  /** The COMMIT it points at: an annotated tag is an object of its own, and this is past it. */
  commit: string
  annotated: boolean
  message?: string
  tagger?: string
  taggerEmail?: string
  /** When it was tagged, seconds since the epoch. */
  date?: number
}

// Fields are NUL-separated: an annotation is free text, and the last field.
const TAG_FORMAT = ['%(objecttype)', '%(objectname)', '%(*objectname)', '%(taggername)', '%(taggeremail)', '%(taggerdate:unix)', '%(contents)'].join('%00')

export function parseTagDetails(name: string, raw: string): TagDetails | null {
  const parts = raw.replace(/\n$/, '').split('\0')
  if (parts.length < 7) return null
  const [type, object, peeled, tagger, email, date] = parts
  const annotated = type === 'tag'
  const commit = (annotated ? peeled : object).trim()
  if (!commit) return null
  const details: TagDetails = { name, commit, annotated }
  if (!annotated) return details
  // `%(contents)` of a signed tag carries its signature: what was WRITTEN stops there.
  const message = parts.slice(6).join('\0').split(/^-----BEGIN [A-Z ]*SIGNATURE-----$/m)[0].trim()
  if (message) details.message = message
  if (tagger.trim()) details.tagger = tagger.trim()
  const mail = email.trim().replace(/^<|>$/g, '')
  if (mail) details.taggerEmail = mail
  const when = parseInt(date, 10)
  if (Number.isFinite(when) && when > 0) details.date = when
  return details
}

export async function tagDetails(
  run: GitRunner, name: string,
): Promise<{ tag: TagDetails | null; error?: string }> {
  const bad = assertRef(name, 'tag')
  if (bad) return { tag: null, error: bad }
  try {
    const raw = await run(['for-each-ref', `--format=${TAG_FORMAT}`, `refs/tags/${name.trim()}`])
    return { tag: parseTagDetails(name.trim(), raw) }
  } catch (e) {
    return { tag: null, error: reason(e) }
  }
}

/**
 * Whether a remote has the tag. It ASKS the remote — a tag has no tracking ref
 * to read — so it can be slow, or fail offline: `null` is "could not tell",
 * which is not "no".
 */
export async function tagOnRemote(
  run: GitRunner, name: string, remote: string,
): Promise<{ pushed: boolean | null }> {
  if (assertRef(name, 'tag') || assertRef(remote, 'remote')) return { pushed: null }
  try {
    const out = await run(['ls-remote', '--tags', remote.trim(), `refs/tags/${name.trim()}`])
    return { pushed: out.trim().length > 0 }
  } catch {
    return { pushed: null }
  }
}

/** The pseudo-refs git keeps while an operation is stopped on its conflicts. */
const OPERATION_HEADS = ['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD']

async function operationInProgress(run: GitRunner): Promise<boolean> {
  for (const head of OPERATION_HEADS) {
    try {
      if ((await run(['rev-parse', '--verify', '--quiet', head])).trim()) return true
    } catch { /* --quiet: absent is a silent failure */ }
  }
  return false
}

/**
 * Put a resolved path back in conflict: the markers in the working tree, the
 * path unmerged in the index — as git left it when the operation stopped. It is
 * the undo of a resolution nobody has committed yet (#269), the model's first:
 * `git add` records what it replaced (the index's resolve-undo), and
 * `checkout --merge` rebuilds the three stages from that record.
 *
 * Every check before it is there because `checkout --merge` is not careful on
 * its own: on a path that was never in conflict it SUCCEEDS, silently, by
 * checking the path out of the index — an edit on disk is gone. And the record
 * outlives the commit, so after one it would put a finished merge's file back
 * in conflict. Hence: a record for this path, no edit since the resolution,
 * and an operation still stopped.
 */
export async function restoreConflict(
  run: GitRunner, filepath: string,
): Promise<{ success: boolean; error?: string }> {
  const bad = assertRef(filepath, 'file path')
  if (bad) return { success: false, error: bad }
  try {
    if (!(await run(['ls-files', '--resolve-undo', '--', filepath])).trim()) {
      return { success: false, error: `${filepath} was not resolved from a conflict — there is nothing to restore` }
    }
    if ((await run(['diff', '--name-only', '--', filepath])).trim()) {
      return { success: false, error: `${filepath} has changed since it was resolved — stage or discard that change first` }
    }
    if (!(await operationInProgress(run))) {
      return { success: false, error: 'No merge, rebase, cherry-pick or revert is in progress' }
    }
    await run(['checkout', '--merge', '--', filepath])
    return { success: true }
  } catch (e: any) {
    return { success: false, error: String(e?.message ?? e).trim() }
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

// ── Contributors ──────────────────────────────────────────────────
export interface Contributor { name: string; email: string; commits: number }

/** `git shortlog -sne` lines: a count, a tab, a name, an address in angle brackets. */
export function parseShortlog(raw: string): Contributor[] {
  const out: Contributor[] = []
  for (const line of raw.split('\n')) {
    const m = /^\s*(\d+)\t(.*?)\s*<([^>]*)>\s*$/.exec(line)
    if (!m) continue
    out.push({ commits: Number(m[1]), name: m[2].trim(), email: m[3].trim() })
  }
  return out
}

/**
 * Who has committed here, most commits first, merges left out — the
 * identities git's own `shortlog` reports, mailmap applied. `--all` rather
 * than HEAD: the question is who works on this repository, not on this
 * branch.
 */
export async function contributors(
  run: GitRunner, opts: { limit?: number } = {},
): Promise<{ contributors: Contributor[] }> {
  const limit = opts.limit ?? 20
  try {
    const raw = await run(['shortlog', '-sne', '--no-merges', '--all'])
    return { contributors: parseShortlog(raw).slice(0, limit) }
  } catch {
    return { contributors: [] }
  }
}

// ── Keeping a branch up to date, without standing on it ─────────
//
// The panel could only pull the branch it was standing on, and only ever set
// an upstream of `<default remote>/<same name>`: bringing a second branch
// forward meant switching to it, pulling, and switching back (#280). These
// are the operations that answer "what does this branch need", and they are
// here because both products offer them from the same shared rows.

/** What `git rev-list --left-right --count a...b` says, read as a pair. */
export function parseAheadBehind(raw: string): { ahead: number; behind: number } {
  const [ahead, behind] = raw.trim().split(/\s+/).map(Number)
  return { ahead: Number.isFinite(ahead) ? ahead : 0, behind: Number.isFinite(behind) ? behind : 0 }
}

/** The branch a local branch tracks, or null when it tracks nothing. */
export async function upstreamOf(run: GitRunner, branch: string): Promise<string | null> {
  const bad = assertRef(branch, 'branch')
  if (bad) return null
  try {
    const out = (await run(['rev-parse', '--abbrev-ref', '--symbolic-full-name', `${branch}@{upstream}`])).trim()
    return out || null
  } catch { return null }
}

/**
 * How far a branch is from its upstream — ahead is what the branch has that
 * the upstream lacks, which is the way round every other count in this app
 * reads.
 */
export async function aheadBehindUpstream(
  run: GitRunner, branch: string, upstream: string,
): Promise<{ ahead: number; behind: number }> {
  try {
    return parseAheadBehind(await run(['rev-list', '--left-right', '--count', `${branch}...${upstream}`]))
  } catch { return { ahead: 0, behind: 0 } }
}

export interface FastForwardResult {
  success: boolean
  /** Nothing to do — it was already level with its upstream. */
  upToDate?: boolean
  /** How many commits it moved. */
  moved?: number
  upstream?: string
  error?: string
}

/**
 * Bring a branch up to its upstream without switching to it — and refuse,
 * with the reason, when that cannot be done as a fast-forward.
 *
 * Three refusals, each its own sentence, because they call for different
 * things: no upstream at all (publish it, or pick one), diverged (rebase or
 * merge — a decision, not a button), and already level (nothing to do, which
 * is a success and says so rather than reporting an error).
 *
 * The move itself is `git fetch . <upstream>:<branch>`, which updates a ref
 * git is not standing on and refuses on its own if the update would not be a
 * fast-forward — belt and braces with the check above. The branch the caller
 * IS standing on cannot be moved that way, so it is merged `--ff-only`
 * instead, which touches the working tree and therefore stays git's decision
 * to refuse when the tree is dirty.
 */
export async function fastForwardBranch(run: GitRunner, branch: string): Promise<FastForwardResult> {
  const bad = assertRef(branch, 'branch')
  if (bad) return { success: false, error: bad }
  const upstream = await upstreamOf(run, branch)
  if (!upstream) return { success: false, error: `${branch} tracks no branch` }
  const { ahead, behind } = await aheadBehindUpstream(run, branch, upstream)
  if (behind === 0 && ahead === 0) return { success: true, upToDate: true, upstream, moved: 0 }
  if (ahead > 0) {
    return {
      success: false, upstream,
      error: behind > 0
        ? `${branch} has diverged from ${upstream} (${ahead} ahead, ${behind} behind) — rebase or merge it`
        : `${branch} is ${ahead} ahead of ${upstream}, with nothing to pull`,
    }
  }
  let current = ''
  try { current = (await run(['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim() } catch { /* detached */ }
  try {
    if (current === branch) await run(['merge', '--ff-only', upstream])
    else await run(['fetch', '.', `${upstream}:${branch}`])
    return { success: true, moved: behind, upstream }
  } catch (e) {
    return { success: false, upstream, error: reason(e) }
  }
}

/** Every remote-tracking branch, as `origin/main` — what an upstream is picked from. */
export async function remoteBranchNames(run: GitRunner): Promise<string[]> {
  try {
    // `origin/HEAD` is a symbolic ref to the remote's default branch, not a
    // branch anybody tracks: offering it as an upstream sets a moving target.
    //
    // ⚠️ It is dropped by `%(symref)` — empty on every ordinary ref — and NOT
    // by its name. `%(refname:short)` prints `refs/remotes/origin/HEAD` as
    // plain **`origin`**, so a filter on `/HEAD$` matches nothing and the
    // remote's own name was offered in a list of branches (#308).
    const raw = await run(['for-each-ref', '--format=%(refname:short)%09%(symref)', 'refs/remotes'])
    return raw.split('\n')
      .map(line => line.split('\t'))
      .filter(([name, symref]) => name?.trim() && !symref?.trim())
      .map(([name]) => name.trim())
  } catch { return [] }
}

/** The `fixup!` / `squash!` commits over a base, newest first — what squashing would fold. */
export async function fixupCommits(run: GitRunner, base: string): Promise<{ hash: string; subject: string }[]> {
  const bad = assertRef(base, 'base')
  if (bad) return []
  try {
    const raw = await run(['log', '--format=%H%x1f%s', `${base}..HEAD`])
    return raw.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
      const [hash, subject] = line.split('\x1f')
      return { hash, subject: subject ?? '' }
    }).filter(c => /^(fixup|squash)!/.test(c.subject))
  } catch { return [] }
}

export interface SquashFixupsResult {
  success: boolean
  /** How many fixup/squash commits were folded in. */
  squashed?: number
  error?: string
}

/**
 * Fold every `fixup!` / `squash!` commit into the commit it names.
 *
 * `against` is the branch the work is measured from — its upstream, or the
 * branch it will merge into — and what is rebased onto is the **fork point**
 * with it, never the branch itself: `rebase -i --autosquash origin/main`
 * would tidy the fixups AND drag the branch onto whatever origin/main has
 * grown since, which is a second, unasked-for operation with its own
 * conflicts. The merge base leaves every commit where it is and only folds.
 *
 * It refuses when there are no fixups, and that matters: a rebase rewrites
 * every hash it walks over, so "tidy nothing" would still cost the branch its
 * identity, break anybody who had fetched it, and leave the user wondering
 * what the button did.
 *
 * `sequence.editor=:` is what makes an interactive rebase non-interactive —
 * passed as `-c` rather than through the environment, because the one thing a
 * host gives this file is a runner that takes arguments.
 */
export async function squashFixups(run: GitRunner, against: string): Promise<SquashFixupsResult> {
  const bad = assertRef(against, 'base')
  if (bad) return { success: false, error: bad }
  let base = ''
  try { base = (await run(['merge-base', 'HEAD', against])).trim() } catch { /* unrelated, or no such ref */ }
  if (!/^[0-9a-f]{7,40}$/.test(base)) return { success: false, error: `Nothing in common with ${against}` }
  const fixups = await fixupCommits(run, base)
  if (!fixups.length) return { success: false, error: `No fixup! or squash! commits since ${against}` }
  try {
    await run(['-c', 'sequence.editor=:', 'rebase', '-i', '--autosquash', '--autostash', base])
    return { success: true, squashed: fixups.length }
  } catch (e) {
    return { success: false, error: reason(e) }
  }
}

// ── The worktrees, and where each one stands ────────────────────
//
// The list was parsed identically in both services, word for word, and both
// threw away everything but the path, the branch, the head and whether it was
// the main one: `locked` was read and never used, and nothing said whether a
// worktree was dirty or how far its branch had drifted (#285). The parse is
// here now, and the facts it could not know — the ones that need a second
// command per worktree — are asked for beside it.

export interface WorktreeRow {
  path: string
  /** The branch it holds, or `(detached)`. */
  branch: string
  /** Its HEAD, short. */
  head: string
  isMain: boolean
  locked: boolean
  /** Why it is locked, when git was given a reason. */
  lockReason?: string
  /** Its directory is gone — git will drop it on the next prune. */
  prunable?: boolean
}

/**
 * `git worktree list --porcelain`.
 *
 * The first entry is the main working tree: git prints them in that order and
 * says nothing else about it, so position is the only thing to read it from.
 */
export function parseWorktrees(raw: string): WorktreeRow[] {
  const out: WorktreeRow[] = []
  let cur: WorktreeRow | null = null
  const push = () => { if (cur) out.push(cur) }
  for (const line of raw.split('\n')) {
    if (line.startsWith('worktree ')) {
      push()
      cur = { path: line.slice(9).trim(), branch: '', head: '', isMain: false, locked: false }
    } else if (!cur) {
      continue
    } else if (line.startsWith('HEAD ')) {
      cur.head = line.slice(5).trim().slice(0, 7)
    } else if (line.startsWith('branch ')) {
      cur.branch = line.slice(7).trim().replace('refs/heads/', '')
    } else if (line.trim() === 'detached') {
      cur.branch = '(detached)'
    } else if (line.startsWith('locked')) {
      cur.locked = true
      // `locked` alone, or `locked <reason>` — the reason is what a row can say.
      const reason = line.slice(6).trim()
      if (reason) cur.lockReason = reason
    } else if (line.trim() === 'prunable' || line.startsWith('prunable ')) {
      cur.prunable = true
    }
  }
  push()
  if (out.length) out[0].isMain = true
  return out
}

/** A worktree with what only a second command can say about it. */
export interface WorktreeState extends WorktreeRow {
  /** It has changes — staged, unstaged or untracked. */
  dirty?: boolean
  /** Where its branch stands against its upstream. */
  ahead?: number
  behind?: number
}

/**
 * The worktrees, each with the facts its row shows (#285).
 *
 * `git status` and `rev-list` are run **inside** each worktree — `-C <path>`
 * — because a worktree's changes are its own and the repository this service
 * points at cannot see them. That is two commands per worktree, so `facts`
 * exists: the list alone is one command, and a caller that only needs names
 * does not pay for the rest.
 */
export async function worktrees(
  run: GitRunner, opts: { facts?: boolean } = {},
): Promise<{ worktrees: WorktreeState[] }> {
  let rows: WorktreeRow[] = []
  try { rows = parseWorktrees(await run(['worktree', 'list', '--porcelain'])) } catch { return { worktrees: [] } }
  if (!opts.facts) return { worktrees: rows }
  const out: WorktreeState[] = []
  for (const row of rows) {
    const state: WorktreeState = { ...row }
    // A worktree whose directory is gone answers nothing, and asking twice
    // for every refresh is two failures per row.
    if (!row.prunable) {
      try {
        state.dirty = (await run(['-C', row.path, 'status', '--porcelain'])).trim().length > 0
      } catch { /* unreadable — say nothing rather than "clean" */ }
      if (row.branch && row.branch !== '(detached)') {
        try {
          const counts = parseAheadBehind(
            await run(['-C', row.path, 'rev-list', '--left-right', '--count', `${row.branch}...${row.branch}@{upstream}`]))
          state.ahead = counts.ahead
          state.behind = counts.behind
        } catch { /* tracks nothing: no counts, which is not zero */ }
      }
    }
    out.push(state)
  }
  return { worktrees: out }
}

/** Which worktree holds a branch, if any — what *Open its worktree* resolves. */
export function worktreeOfBranch(rows: readonly WorktreeRow[], branch: string): WorktreeRow | null {
  const name = branch.replace(/^refs\/heads\//, '')
  return rows.find(w => w.branch === name) ?? null
}

export interface CopyChangesResult {
  success: boolean
  /** The work is in the stash list and was NOT applied — it is not lost. */
  leftInStash?: boolean
  error?: string
}

/**
 * Carry what is uncommitted in one worktree into another (#285).
 *
 * git's own tool for this is the stash, and the stash is the repository's,
 * not a worktree's: taken in `from`, it can be applied in `to`. What matters
 * is what happens when the apply fails — a conflict, a file in the way — and
 * the answer is that **the stash is kept**. Dropping the only copy of
 * somebody's uncommitted work because the second half of a two-step operation
 * went wrong is not a risk to take on their behalf, so the refusal says the
 * work is waiting in the stash rather than pretending nothing happened.
 *
 * `apply`, never `pop`, for the same reason.
 */
export async function copyChangesToWorktree(
  run: GitRunner, from: string, to: string, label: string,
): Promise<CopyChangesResult> {
  if (from === to) return { success: false, error: 'That is the same worktree' }
  try {
    const status = (await run(['-C', from, 'status', '--porcelain'])).trim()
    if (!status) return { success: false, error: 'Nothing to copy — that worktree is clean' }
  } catch (e) { return { success: false, error: reason(e) } }
  try {
    // --include-untracked: a new file is part of the work being carried over,
    // and leaving it behind would copy half of it.
    await run(['-C', from, 'stash', 'push', '--include-untracked', '-m', label])
  } catch (e) { return { success: false, error: reason(e) } }
  try {
    await run(['-C', to, 'stash', 'apply', 'stash@{0}'])
    return { success: true, leftInStash: true }
  } catch (e) {
    return { success: false, leftInStash: true, error: reason(e) }
  }
}

// ── A pull request, as refs ─────────────────────────────────────
//
// A request whose head is a branch of this repository could be checked out
// from Branches › REMOTE, once somebody worked out which remote branch it
// was; one from a FORK could not be checked out at all, because its head is
// in a repository this clone has no remote for (#290).
//
// GitHub publishes every request's head under the repository's own refs —
// `refs/pull/<n>/head` — fork or not, which is the one refspec that answers
// both cases. It is read-only: pushing back to it is not a thing, and a
// branch made from it is an ordinary local branch with no upstream.

/** The local branch a request is fetched into. Predictable, and never a name a person picked. */
export function pullRequestBranch(number: number): string {
  return `pr/${number}`
}

/**
 * `refs/pull/<n>/head:<local>` — what `git fetch <remote> …` is given.
 *
 * `+` is deliberately absent: a forced update would rewrite a local branch
 * somebody may have committed on. A request that was force-pushed therefore
 * fails to fetch rather than silently taking the work with it, and the
 * caller says so.
 */
export function pullRequestRefspec(number: number, local = pullRequestBranch(number)): string {
  return `refs/pull/${number}/head:${local}`
}

export interface FetchPullRequestResult {
  success: boolean
  /** The local branch it landed on. */
  branch?: string
  /** It was already there and could not be moved — see the refspec above. */
  diverged?: boolean
  error?: string
}

/**
 * Fetch a request's head into a local branch, fork or not.
 *
 * Fetching is separated from checking out on purpose: reviewing a request —
 * its files, a comparison — needs the objects and not the working tree, and
 * asking somebody to switch branches to read a diff is how a review costs a
 * stash.
 */
export async function fetchPullRequestHead(
  run: GitRunner, remote: string, number: number,
  opts: { checkout?: boolean; local?: string } = {},
): Promise<FetchPullRequestResult> {
  const local = opts.local ?? pullRequestBranch(number)
  if (!Number.isInteger(number) || number <= 0) return { success: false, error: `${number} is not a pull request number` }
  const bad = assertRef(remote, 'remote') ?? assertRef(local, 'branch')
  if (bad) return { success: false, error: bad }
  try {
    await run(['fetch', remote, pullRequestRefspec(number, local)])
  } catch (e) {
    const why = reason(e)
    // git's own words for "that would not be a fast-forward" — the branch is
    // there and holds something else, which is a decision, not a retry.
    if (/non-fast-forward|rejected/i.test(why)) {
      return { success: false, branch: local, diverged: true, error: `${local} already exists and has moved — delete it, or rename it, first` }
    }
    return { success: false, error: why }
  }
  if (!opts.checkout) return { success: true, branch: local }
  try {
    await run(['checkout', local])
    return { success: true, branch: local }
  } catch (e) {
    // The head IS fetched and waiting on its branch — name it, rather than
    // reporting the whole thing as a failure with nothing to show for it.
    return { success: false, branch: local, error: reason(e) }
  }
}

// ── Conflicts, predicted ────────────────────────────────────────
//
// `git merge-tree --write-tree` answers "would this conflict, and where"
// without touching the working tree, the index or any ref. It answers by its
// EXIT CODE — 1 means "would conflict", and the conflicted paths are on
// stdout — which a runner that throws on a non-zero exit cannot pass on.
//
// Hence the second runner below. Both services already had it privately, as
// `execRaw`, which is how this family came to be written out twice: the
// prediction could not be expressed over the ordinary runner, so it stayed on
// the hosts and drifted there. One more line of adapter per host buys the
// same single implementation everything else in this file has.
//
// Nothing here blocks on its own failure. A prediction that could not run is
// UNKNOWN — a bad ref, a git too old, a remote that will not answer — and a
// caller must never read it as "will conflict": refusing an operation because
// a check could not be made is worse than the conflict it was guarding.

export interface GitExit { code: number; stdout: string; stderr: string }

/** Run git and report its exit code rather than throwing on it. */
export type GitRawRunner = (args: string[]) => Promise<GitExit>

export interface ConflictPrediction {
  /**
   * The paths that would clash. Empty is CLEAN **or** "could not tell" — read
   * `error` before concluding anything from an empty list.
   */
  files: string[]
  error?: string
}

/**
 * The paths off a `merge-tree --name-only` answer, or `null` when what came
 * back is not one.
 *
 * Its stdout is the merged tree's OID, then one conflicted path per line, then
 * a blank line and messages for people. Only the first block is ours, and only
 * from its second line — the machine format, so nothing here depends on git's
 * language.
 *
 * ⚠️ The OID is CHECKED, and that is not ceremony. `merge-tree` exits **1**
 * both for "these conflict" and for "I could not merge those at all" — an
 * unknown ref, a commit that is not one — and the second prints a sentence
 * where the tree should be. Read as a conflict list it yields no paths, which
 * every caller then reads as A CLEAN MERGE: a typo in a ref name answered
 * "nothing will conflict". Both services shipped that for as long as they had
 * this code. An answer with no tree is a failure, and says so.
 */
function conflictedPaths(stdout: string): string[] | null {
  const [head] = stdout.split('\n\n')
  const lines = head.split('\n')
  if (!/^[0-9a-f]{40,64}$/.test((lines[0] ?? '').trim())) return null
  return lines.slice(1).map(s => s.trim()).filter(Boolean)
}

/** git's own words for a failure, or the output it left instead. */
function exitReason(r: GitExit, fallback: string): string {
  return (r.stderr || r.stdout || fallback).trim()
}

/**
 * Would reconciling `theirs` into `ours` conflict, and on which files — a DRY
 * RUN that writes no ref and touches no file. Pass `mergeBase` to pin the
 * 3-way base: a cherry-pick uses the commit's parent, a revert the commit
 * itself; omit it for a plain merge and git finds the base.
 *
 * For a REBASE this is only a heuristic — it models one merge of the two tips,
 * not the replay — so `predictRebaseConflicts` exists beside it. Needs git 2.38.
 */
export async function predictConflicts(
  runRaw: GitRawRunner, theirs: string, ours = 'HEAD', mergeBase?: string,
): Promise<ConflictPrediction> {
  const refs: [string, string][] = [[theirs, 'theirs'], [ours, 'ours']]
  if (mergeBase) refs.push([mergeBase, 'merge-base'])
  for (const [ref, label] of refs) {
    const bad = assertRef(ref, label)
    if (bad) return { files: [], error: bad }
  }
  try {
    const args = ['merge-tree', '--write-tree', '--name-only']
    if (mergeBase) args.push(`--merge-base=${mergeBase}`)
    args.push(ours, theirs)
    const r = await runRaw(args)
    if (r.code === 0) return { files: [] }                       // clean
    if (r.code === 1) {
      const files = conflictedPaths(r.stdout)                    // …or no merge at all
      if (files) return { files }
    }
    return { files: [], error: exitReason(r, 'merge-tree failed') }
  } catch (e) {
    return { files: [], error: reason(e) }
  }
}

/** Past this many commits a replay is not simulated — see `predictRebaseConflicts`. */
export const REBASE_SIMULATION_CAP = 100

export interface RebasePrediction extends ConflictPrediction {
  /** The short hash of the first commit whose replay conflicts. */
  atCommit?: string
}

/**
 * Would rebasing `branch` onto `upstream` conflict — answered by SIMULATING the
 * replay, commit by commit, with no working tree involved. Each
 * `merge-tree --write-tree` writes its merged tree to the object database and
 * prints the OID, which becomes the base of the next step: exactly what a real
 * rebase does.
 *
 * That is why it is not `predictConflicts(branch, upstream)`. A change made in
 * one commit and undone in a later one nets to nothing for a merge of the two
 * tips, and still conflicts on the way through. The answer is the conflicted
 * files of the FIRST commit that fails, with its hash — the one a person would
 * land on.
 */
export async function predictRebaseConflicts(
  runRaw: GitRawRunner, upstream: string, branch = 'HEAD',
): Promise<RebasePrediction> {
  const bad = assertRef(upstream, 'upstream') ?? assertRef(branch, 'branch')
  if (bad) return { files: [], error: bad }
  try {
    // What a default `git rebase` would replay, oldest first: the non-merge
    // commits of upstream..branch, parents before children.
    const listed = await runRaw(['rev-list', '--reverse', '--topo-order', '--no-merges', `${upstream}..${branch}`])
    if (listed.code !== 0) return { files: [], error: exitReason(listed, 'rev-list failed') }
    const commits = listed.stdout.split('\n').map(s => s.trim()).filter(Boolean)
    if (commits.length === 0) return { files: [] }                       // nothing to replay
    // Hundreds of merge-tree calls is not a pre-flight check any more: past the
    // cap, fall back to the cheap tip-merge and its heuristic.
    if (commits.length > REBASE_SIMULATION_CAP) return predictConflicts(runRaw, branch, upstream)
    const start = await runRaw(['rev-parse', `${upstream}^{commit}`])
    let current = start.stdout.trim()
    if (!current) return { files: [], error: `Unknown upstream: ${upstream}` }
    for (const c of commits) {
      const r = await runRaw(['merge-tree', '--write-tree', '--name-only', `--merge-base=${c}^`, current, c])
      if (r.code === 0) { current = r.stdout.trim().split('\n')[0]; continue }  // clean → the next base
      if (r.code === 1) {
        const files = conflictedPaths(r.stdout)
        if (files) return { files, atCommit: c.slice(0, 7) }
      }
      return { files: [], error: exitReason(r, 'merge-tree failed') }           // bail out, never block
    }
    return { files: [] }                                                        // the whole replay is clean
  } catch (e) {
    return { files: [], error: reason(e) }
  }
}

export interface PullRequestConflicts extends ConflictPrediction {
  /** The head the prediction ran on — what the remote publishes for the request now. */
  head?: string
  /** The base's tip on the REMOTE, which is what the forge would merge into. */
  base?: string
  /** The request's head moved since the forge last answered: `head` is the newer one. */
  moved?: boolean
}

/**
 * Which files a pull request would conflict on — the question the forge answers
 * with a boolean.
 *
 * A forge says *mergeable: false* and stops there. The names are one
 * `merge-tree` away, and this is the one that gets them, for a request whose
 * head is in a FORK as much as one whose head is a branch here: GitHub
 * publishes every request's head under `refs/pull/<n>/head` (#290).
 *
 * Both sides are read from the REMOTE, and neither is written to a ref:
 * `git fetch <remote> <ref>` leaves its answer in `FETCH_HEAD`, which is read
 * before the next fetch overwrites it — base first, head second, because that
 * is the order they are needed in. A local branch of the base's name is not
 * consulted at all: it may be behind, and a prediction against a stale base is
 * a prediction about nothing.
 *
 * `headSha` — what the forge said the head was — is compared with what came
 * back. When they differ the request moved between the two answers, and the
 * caller is told rather than left to present a prediction about one commit as
 * a statement about another.
 */
export async function pullRequestConflicts(
  run: GitRunner, runRaw: GitRawRunner,
  opts: { remote: string; number: number; baseRef: string; headSha?: string },
): Promise<PullRequestConflicts> {
  const { remote, number, baseRef, headSha } = opts
  if (!Number.isInteger(number) || number <= 0) return { files: [], error: `${number} is not a pull request number` }
  const bad = assertRef(remote, 'remote') ?? assertRef(baseRef, 'base')
  if (bad) return { files: [], error: bad }
  let base: string
  let head: string
  try {
    await run(['fetch', remote, baseRef])
    base = (await run(['rev-parse', 'FETCH_HEAD'])).trim()
  } catch (e) {
    return { files: [], error: `could not read ${remote}/${baseRef}: ${reason(e)}` }
  }
  try {
    await run(['fetch', remote, `refs/pull/${number}/head`])
    head = (await run(['rev-parse', 'FETCH_HEAD'])).trim()
  } catch (e) {
    return { files: [], error: `could not read the head of #${number} from ${remote}: ${reason(e)}` }
  }
  if (!base || !head) return { files: [], error: `${remote} answered with no commit` }
  const moved = !!headSha && headSha !== head
  const r = await predictConflicts(runRaw, head, base)
  return { ...r, head, base, ...(moved ? { moved } : {}) }
}

// ── The same patch, under another hash ──────────────────────────
//
// A branch merged with REBASE or SQUASH does not put its commits on the
// target: it puts COPIES there, same patch, new hash, the merge's own date. A
// branch that was stacked on that one still carries the originals. Both sides
// then add the same lines in the same place, and every changelog-shaped file
// conflicts — over a change that is already in, twice.
//
// `git cherry` is the answer to it, and it is patch-id underneath: `-` marks a
// commit whose change the upstream already has, `+` one it does not. It is not
// a guess from subjects or dates, and it is the same test `git rebase` uses to
// drop those commits — so what this reports is exactly what a rebase would
// remove.

export interface DuplicateCommit {
  hash: string
  shortHash: string
  subject: string
}

export interface DuplicateCommits {
  /** The branch's commits whose change the target already has, oldest first. */
  duplicates: DuplicateCommit[]
  /** How many commits the branch has that the target lacks, duplicates included. */
  total: number
  error?: string
}

/**
 * The commits `branch` carries that `target` already holds under another hash.
 *
 * Empty is the normal answer and says nothing is wrong. An `error` means the
 * question could not be put — never that there are none.
 */
export async function duplicateCommits(
  run: GitRunner, branch: string, target: string,
): Promise<DuplicateCommits> {
  const bad = assertRef(branch, 'branch') ?? assertRef(target, 'target')
  if (bad) return { duplicates: [], total: 0, error: bad }
  try {
    // `-v` puts the subject after the hash. A merge commit has no patch to
    // compare, and `git cherry` leaves them out of its own accord.
    const out = await run(['cherry', '-v', target, branch])
    const rows = out.split('\n').map(s => s.trimEnd()).filter(Boolean)
    const duplicates: DuplicateCommit[] = []
    for (const row of rows) {
      const m = /^([+-])\s+([0-9a-f]{7,40})\s*(.*)$/.exec(row)
      if (!m) continue
      if (m[1] !== '-') continue
      duplicates.push({ hash: m[2], shortHash: m[2].slice(0, 7), subject: m[3] })
    }
    return { duplicates, total: rows.length }
  } catch (e) {
    return { duplicates: [], total: 0, error: reason(e) }
  }
}

// ── Pointing a branch at a remote branch ────────────────────────

/**
 * Set a branch's upstream, and say the one refusal that matters in our own
 * words.
 *
 * `git branch --set-upstream-to` answers a remote branch that is not there
 * with eight lines of hint, ending in two suggestions — fetch it, or
 * `git push -u`. The second is almost always the answer: the branch has never
 * been published, which is exactly the state git puts you in when it points a
 * new branch at whatever it was created from (`git checkout -b x origin/main`
 * tracks `origin/main`, and `origin/x` does not exist). One sentence, naming
 * the act that fixes it, instead of a page of advice about both.
 */
export async function setBranchUpstream(
  run: GitRunner, branch: string, upstream: string,
): Promise<{ success: boolean; error?: string }> {
  const bad = assertRef(branch, 'branch') ?? assertRef(upstream, 'upstream')
  if (bad) return { success: false, error: bad }
  // `--verify --quiet` exits 1 rather than printing when the ref is unknown,
  // which the runner turns into a rejection: absent, not an error to report.
  const known = await run(['rev-parse', '--verify', '--quiet', `refs/remotes/${upstream}`]).catch(() => '')
  if (!known.trim()) {
    return { success: false, error: `${upstream} is not on the remote — publish ${branch} to create it` }
  }
  try {
    await run(['branch', `--set-upstream-to=${upstream}`, branch])
    return { success: true }
  } catch (e) {
    return { success: false, error: reason(e) }
  }
}
