// git-vertex-mcp — local MCP server over your Git repositories.
// Exposes the same information the Git Vertex desktop app shows (status,
// commit graph, branches, diffs, blame) to MCP clients like Claude Code,
// Cursor or Copilot — plus structured CONFLICT tools: inspect an ongoing
// merge/rebase with both sides labelled (branch + subject), apply a
// surgical resolution to a conflicted file, and continue/abort the
// operation. Runs on stdio, entirely on your machine — no cloud.
// Besides tools, it serves the other MCP primitives most servers leave out:
// resources (status, log, staged diff — subscribable), prompts (review a
// branch, release notes, explain a commit), sampling and elicitation.
//
// Writes are limited to conflict resolution (a file already in conflict,
// staged after write; never history rewriting), are confirmed by the user
// through the client when it supports elicitation, and can be disabled
// entirely with --read-only or GV_MCP_READONLY=1.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ErrorCode, McpError, SubscribeRequestSchema, UnsubscribeRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { simpleGit, SimpleGit } from 'simple-git'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as os from 'node:os'

// Read from package.json rather than kept in step by hand: this constant said
// 0.4.0 while the package was 0.5.2, so every client — and the startup line on
// stderr — was told the wrong version for three releases. `dist/` sits one level
// under the package root, and package.json ships in `files`.
const VERSION: string = (() => {
  try {
    const here = path.dirname(new URL(import.meta.url).pathname)
    return JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version
  } catch {
    return '0.0.0'
  }
})()
const READ_ONLY = process.argv.includes('--read-only') || process.env.GV_MCP_READONLY === '1'
// For clients that already gate every tool call behind a permission prompt of
// their own, where a second question from the server would be the same one
// asked twice. See confirmWithUser below.
const NO_ELICITATION = process.argv.includes('--no-elicitation') || process.env.GV_MCP_NO_ELICITATION === '1'

// ── Repo resolution ────────────────────────────────────────────
// Every tool takes an optional `repo` path; default is $GV_REPO or cwd.
// simple-git instances are cached per resolved path.
const gitCache = new Map<string, SimpleGit>()

// Accented paths reach us in whichever Unicode normalization the caller used,
// while macOS filesystems hand back their own — "démo" as NFC from an agent
// prompt and as NFD from readdir are different strings that compare unequal
// even though they name the same directory. Both forms open the same file, so
// we settle on NFC at every boundary and let the desktop app do the same,
// keeping the paths we emit in deep links comparable on the other side.
const nfc = (p: string) => p.normalize('NFC')

// git localizes its output (errors, fsck's "dangling commit", status), and we
// parse that output by its English wording — under a French (or any non-C)
// locale, "dangling commit" becomes "objet commit fantôme" and the parse
// silently finds nothing. Force LC_ALL=C on every git invocation so the output
// we read is always the stable English form, whatever the user's locale.
// For the execFile calls only. This comment used to claim that simple-git's
// .env(name, value) "merges rather than replaces" — it does not: it REPLACES the
// child environment, so the instance below ran git without $HOME and could not
// read ~/.gitconfig (a plain "fatal: $HOME not set" on anything needing the
// global config: identity, credential helper, safe.directory). Handing it a full
// environment object instead is no better — @simple-git/argv-parser screens
// EDITOR, PAGER, GIT_ASKPASS and ~19 other variables and refuses the call. So
// simple-git gets no environment, and the wording-sensitive commands (fsck) go
// through execFile with this.
const C_LOCALE_ENV = { ...process.env, LC_ALL: 'C' }

// simple-git gets an allow-list rather than the object above: it screens the
// environment it is handed and refuses the call on sight of EDITOR, PAGER,
// GIT_ASKPASS and ~19 others (@simple-git/argv-parser). Without a pinned locale
// here, checkIsRepo() on a non-repository rejects with git's *translated* error
// and the clean "Not a git repository" below never gets a chance to be thrown.
const SIMPLE_GIT_ENV_KEYS = [
  'HOME', 'PATH', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'SSH_AUTH_SOCK', 'XDG_CONFIG_HOME',
  'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM',
  'SystemRoot', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'ProgramData', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP',
]

function simpleGitEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of SIMPLE_GIT_ENV_KEYS) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  env.LC_ALL = 'C'
  // `git status` refreshes the index's stat cache when it can, which means
  // taking index.lock for a moment. A subscribed resource re-reads the status
  // every couple of seconds in the background (see Resources below), and a
  // lock held by us at the instant the user runs `git add` fails their command
  // with "index.lock exists". Every write this server makes takes its lock
  // regardless — only the opportunistic ones are given up.
  env.GIT_OPTIONAL_LOCKS = '0'
  return env
}

async function openRepo(repo?: string): Promise<{ git: SimpleGit; root: string }> {
  const base = nfc(path.resolve(repo || process.env.GV_REPO || process.cwd()))
  const cached = gitCache.get(base)
  const git: SimpleGit = cached ?? simpleGit(base).env(simpleGitEnv())
  if (!cached) gitCache.set(base, git)
  const isRepo = await git.checkIsRepo()
  if (!isRepo) throw new Error(`Not a git repository: ${base}`)
  const root = nfc((await git.revparse(['--show-toplevel'])).trim())
  return { git, root }
}

// Values interpolated into git argv (refs, paths, authors) must never be able
// to smuggle options in — reject anything that looks like a flag.
function safeArg(value: string, what: string): string {
  if (value.startsWith('-')) throw new Error(`Invalid ${what}: must not start with "-"`)
  return value
}

const truncate = (s: string, max = 24000) =>
  s.length > max ? s.slice(0, max) + `\n... [truncated at ${max} chars]` : s

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] })
const errText = (e: unknown) => ({
  content: [{ type: 'text' as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
  isError: true as const,
})

const repoParam = z.string().optional().describe('Absolute path to the git repository (default: $GV_REPO or current working directory)')

// ── Shared readers ─────────────────────────────────────────────
// The status, the log and the staged diff are each reachable two ways — as a
// tool the agent calls, and as a resource a client pins to its context (see
// Resources below). Both go through these, so the two can never disagree on
// what "the status" looks like.

async function statusText(git: SimpleGit, root: string): Promise<string> {
  const s = await git.status()
  return [
    `repo: ${root}`,
    `branch: ${s.current ?? '(detached)'}${s.tracking ? ` → ${s.tracking}` : ''}`,
    `ahead/behind: +${s.ahead} / -${s.behind}`,
    '',
    `staged (${s.staged.length}): ${s.staged.join(', ') || '—'}`,
    `modified (${s.modified.length}): ${s.modified.join(', ') || '—'}`,
    `untracked (${s.not_added.length}): ${s.not_added.join(', ') || '—'}`,
    `deleted (${s.deleted.length}): ${s.deleted.join(', ') || '—'}`,
    `conflicted (${s.conflicted.length}): ${s.conflicted.join(', ') || '—'}`,
  ].join('\n')
}

async function logText(git: SimpleGit, opts: { maxCount?: number; all?: boolean; author?: string; since?: string; path?: string } = {}): Promise<string> {
  const args = [
    'log',
    '--pretty=format:%h|%p|%an|%ad|%D|%s',
    '--date=short',
    `--max-count=${opts.maxCount ?? 50}`,
    '--date-order',
  ]
  if (opts.all !== false) args.push('--all')
  if (opts.author) args.push(`--author=${safeArg(opts.author, 'author')}`)
  if (opts.since) args.push(`--since=${safeArg(opts.since, 'since')}`)
  if (opts.path) args.push('--', safeArg(opts.path, 'path'))
  const out = await git.raw(args)
  return truncate(out.trim() || '(no commits)')
}

async function stagedDiffText(git: SimpleGit): Promise<string> {
  const out = await git.raw(['diff', '--cached'])
  return truncate(out.trim() || '(no differences)')
}

// ── Server & tools ─────────────────────────────────────────────
const server = new McpServer({ name: 'git-vertex', version: VERSION })

// ── Human confirmation via MCP elicitation ─────────────────────
// The review step for a write is the desktop app: the agent proposes, the user
// saves in the real 3-way editor. Without the app installed, that step used to
// be a request in the chat — which the agent could skip, word loosely, or ask
// after the fact. Elicitation puts the question to the user through the client
// itself, from this server, before anything is written: the agent cannot answer
// it on the user's behalf.
//
// It degrades exactly like sampling does: a client that did not declare the
// capability (or declared only URL-mode elicitation) is never sent the request,
// and the tool behaves as it always has, relying on the confirmation in chat
// that its description asks for. A client that did declare it and then fails to
// answer is a different case — the write does NOT go ahead on a question nobody
// saw, so that path throws.
type Confirmation = 'confirmed' | 'declined' | 'unsupported'

// A human reads the question; the SDK's default 60 s request timeout is sized
// for machines, and would turn a user reading a long resolution into an error.
const CONFIRM_TIMEOUT_MS = 10 * 60 * 1000

async function confirmWithUser(message: string): Promise<Confirmation> {
  if (NO_ELICITATION || !server.server.getClientCapabilities()?.elicitation?.form) return 'unsupported'
  let res
  try {
    res = await server.server.elicitInput({
      message,
      requestedSchema: {
        type: 'object',
        // An explicit tick rather than the accept button alone: some clients
        // submit a form on Enter, and a write should take a deliberate act.
        properties: {
          confirm: { type: 'boolean', title: 'Go ahead', description: 'Tick to let the change be made. Nothing has been written yet.', default: false },
        },
        required: ['confirm'],
      },
    }, { timeout: CONFIRM_TIMEOUT_MS })
  } catch (e) {
    throw new Error(`Could not ask the user to confirm (${e instanceof Error ? e.message : String(e)}) — nothing was changed`)
  }
  return res.action === 'accept' && res.content?.confirm === true ? 'confirmed' : 'declined'
}

const notConfirmed = (what: string) =>
  text(`The user did not confirm: ${what}. Nothing was changed. Ask them what they want instead — do not retry the same call unprompted.`)

// The first lines of a proposed file, for a confirmation question: enough to
// recognise the resolution, short enough for a dialog.
function preview(content: string, maxLines = 40, maxChars = 2000): string {
  const lines = content.split('\n')
  let out = lines.slice(0, maxLines).join('\n')
  if (out.length > maxChars) out = out.slice(0, maxChars)
  const cut = out.length < content.length
  return cut ? `${out}\n… (${lines.length} lines in all)` : out
}

server.tool(
  'git_status',
  'Working-tree status: current branch, upstream ahead/behind, staged, unstaged, untracked and conflicted files.',
  { repo: repoParam },
  async ({ repo }) => {
    try {
      const { git, root } = await openRepo(repo)
      return text(await statusText(git, root))
    } catch (e) { return errText(e) }
  }
)

server.tool(
  'git_log',
  'Commit history, most recent first. One line per commit: hash | parents | author | date | refs | subject. Supports filtering by author, date and path.',
  {
    repo: repoParam,
    maxCount: z.number().int().min(1).max(500).optional().describe('Max commits to return (default 50)'),
    all: z.boolean().optional().describe('Include all branches, not just HEAD (default true)'),
    author: z.string().optional().describe('Filter: only commits whose author matches this string'),
    since: z.string().optional().describe('Filter: only commits after this date (e.g. "2 weeks ago", "2026-06-01")'),
    path: z.string().optional().describe('Filter: only commits touching this file or directory'),
  },
  async ({ repo, maxCount, all, author, since, path: filePath }) => {
    try {
      const { git } = await openRepo(repo)
      return text(await logText(git, { maxCount, all, author, since, path: filePath }))
    } catch (e) { return errText(e) }
  }
)

server.tool(
  'git_branches',
  'Local and remote branches with their tip commit; marks the current branch and upstream tracking (ahead/behind).',
  { repo: repoParam },
  async ({ repo }) => {
    try {
      const { git } = await openRepo(repo)
      const out = await git.raw([
        'for-each-ref',
        '--sort=-committerdate',
        '--format=%(if)%(HEAD)%(then)* %(else)  %(end)%(refname:short) | %(objectname:short) | %(committerdate:short) | %(upstream:short) %(upstream:track)',
        'refs/heads', 'refs/remotes',
      ])
      return text(truncate(out.trim() || '(no branches)'))
    } catch (e) { return errText(e) }
  }
)

server.tool(
  'git_diff',
  'Show a diff: staged changes ("staged"), working-tree changes ("unstaged"), or between two refs ("<a>..<b>"). Optionally limited to one path.',
  {
    repo: repoParam,
    target: z.string().optional().describe('"staged", "unstaged" (default), a ref, or a "<a>..<b>" range'),
    path: z.string().optional().describe('Limit the diff to this file or directory'),
    statOnly: z.boolean().optional().describe('Only the per-file summary (--stat), not the full patch'),
  },
  async ({ repo, target, path: filePath, statOnly }) => {
    try {
      const { git } = await openRepo(repo)
      const args = ['diff']
      const t = target ?? 'unstaged'
      if (t === 'staged') args.push('--cached')
      else if (t !== 'unstaged') args.push(safeArg(t, 'target'))
      if (statOnly) args.push('--stat')
      if (filePath) args.push('--', safeArg(filePath, 'path'))
      const out = await git.raw(args)
      return text(truncate(out.trim() || '(no differences)'))
    } catch (e) { return errText(e) }
  }
)

server.tool(
  'git_show',
  'Details of one commit: metadata, full message, per-file +/- stats, and (optionally) the patch itself.',
  {
    repo: repoParam,
    ref: z.string().describe('Commit hash, branch, tag, or any ref (e.g. HEAD~2)'),
    patch: z.boolean().optional().describe('Include the full patch (default false: stats only)'),
  },
  async ({ repo, ref, patch }) => {
    try {
      const { git } = await openRepo(repo)
      const r = safeArg(ref, 'ref')
      const meta = await git.raw(['show', '--no-patch', '--pretty=format:commit %H%nauthor: %an <%ae>%ndate: %ad%nrefs: %D%n%n%B', '--date=iso', r])
      const stat = await git.raw(['show', '--numstat', '--pretty=format:', r])
      let out = `${meta.trim()}\n\nfiles (+/-):\n${stat.trim() || '(none)'}`
      if (patch) {
        const p = await git.raw(['show', '--pretty=format:', '--patch', r])
        out += `\n\npatch:\n${p.trim()}`
      }
      return text(truncate(out))
    } catch (e) { return errText(e) }
  }
)

server.tool(
  'git_blame',
  'Who last changed each line of a file (optionally a line range): hash, author, date per line.',
  {
    repo: repoParam,
    path: z.string().describe('File path, relative to the repository root'),
    startLine: z.number().int().min(1).optional().describe('First line of the range'),
    endLine: z.number().int().min(1).optional().describe('Last line of the range'),
  },
  async ({ repo, path: filePath, startLine, endLine }) => {
    try {
      const { git } = await openRepo(repo)
      const args = ['blame', '--date=short']
      if (startLine) args.push('-L', `${startLine},${endLine ?? startLine + 50}`)
      args.push('--', safeArg(filePath, 'path'))
      const out = await git.raw(args)
      return text(truncate(out.trim() || '(empty)'))
    } catch (e) { return errText(e) }
  }
)

// ── History archaeology & merge prediction ─────────────────────
// Read-only power tools that plain `git log`/`diff` don't surface easily:
// dry-run merge conflict prediction (merge-tree, never touches the working
// tree), pickaxe search ("when did this string appear/disappear?"), and
// lost-work recovery (reflog + dangling commits).

async function execGit(root: string, args: string[]): Promise<{ code: number; out: string }> {
  const { execFile } = await import('node:child_process')
  return await new Promise((resolve, reject) => {
    execFile('git', ['-C', root, ...args], { maxBuffer: 16 * 1024 * 1024, env: C_LOCALE_ENV }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === 'number' ? (err as unknown as { code: number }).code : 1) : 0
      // exit codes we want to interpret (e.g. merge-tree's 1 = conflicts)
      // come back as "errors" from execFile — surface them, not reject,
      // unless git itself failed to produce output (real error).
      if (err && !stdout && stderr) reject(new Error(stderr.trim()))
      else resolve({ code, out: (stdout + (stderr ? '\n' + stderr : '')).trim() })
    })
  })
}

server.tool(
  'predict_conflicts',
  'DRY-RUN merge: predict whether merging `theirs` into `ours` (default HEAD) would conflict, and on which files — WITHOUT touching the working tree, the index, or any ref (uses `git merge-tree`). Use this BEFORE merging/rebasing to warn the user, or to pick the least conflicting integration order. Requires git ≥ 2.38.',
  {
    repo: repoParam,
    theirs: z.string().describe('The branch/ref that would be merged in'),
    ours: z.string().optional().describe('The branch/ref merged into (default: HEAD)'),
  },
  async ({ repo, theirs, ours }) => {
    try {
      const { git, root } = await openRepo(repo)
      const a = safeArg(ours ?? 'HEAD', 'ours')
      const b = safeArg(theirs, 'theirs')
      // Resolve first for clear errors on bad refs (merge-tree's own message is terse)
      await git.revparse([a]); await git.revparse([b])
      const r = await execGit(root, ['merge-tree', '--write-tree', '--name-only', a, b])
      if (r.code === 0) {
        return text(`No conflicts predicted: merging ${b} into ${a} would be clean.`)
      }
      // Exit 1 = conflicts. Output: merged tree OID, conflicted file names,
      // blank line, then informational CONFLICT messages.
      const [head, ...rest] = r.out.split('\n\n')
      const files = head.split('\n').slice(1).filter(Boolean)
      const lines = [
        `CONFLICTS predicted when merging ${b} into ${a} — ${files.length} file(s):`,
        ...files.map(f => `  ${f}`),
      ]
      if (rest.length) lines.push('', 'details:', truncate(rest.join('\n\n'), 4000))
      lines.push('', 'Nothing was merged — this was a dry run.')
      return text(lines.join('\n'))
    } catch (e) { return errText(e) }
  }
)

server.tool(
  'git_pickaxe',
  'Find the commits that ADDED or REMOVED a given string (or regex) anywhere in the code — "when was this function introduced / deleted / renamed?". Wraps git log -S/-G. One line per commit: hash | parents | author | date | refs | subject.',
  {
    repo: repoParam,
    term: z.string().min(1).describe('The string (or regex, with mode "regex") to search the history for'),
    mode: z.enum(['literal', 'regex']).optional().describe('"literal" (default, -S: commits changing the COUNT of occurrences) or "regex" (-G: commits whose diff matches)'),
    path: z.string().optional().describe('Limit the search to this file or directory'),
    maxCount: z.number().int().min(1).max(200).optional().describe('Max commits to return (default 30)'),
    all: z.boolean().optional().describe('Search all branches, not just HEAD (default true)'),
  },
  async ({ repo, term, mode, path: filePath, maxCount, all }) => {
    try {
      const { git } = await openRepo(repo)
      const args = [
        'log',
        '--pretty=format:%h|%p|%an|%ad|%D|%s',
        '--date=short',
        `--max-count=${maxCount ?? 30}`,
        mode === 'regex' ? `-G${term}` : `-S${term}`,
      ]
      if (all !== false) args.push('--all')
      if (filePath) args.push('--', safeArg(filePath, 'path'))
      const out = await git.raw(args)
      return text(truncate(out.trim() || `(no commit adds or removes "${term}")`))
    } catch (e) { return errText(e) }
  }
)

server.tool(
  'find_lost_work',
  'Recover "lost" work: recent HEAD reflog entries (where HEAD has been — survives resets, rebases, deleted branches) plus dangling commits no ref points to anymore. Use when the user thinks they lost a commit, a branch, or work after a bad reset/rebase — then cherry-pick or branch from the found hash.',
  {
    repo: repoParam,
    limit: z.number().int().min(1).max(100).optional().describe('Max reflog entries and dangling commits to list (default 30)'),
  },
  async ({ repo, limit }) => {
    try {
      const { git, root } = await openRepo(repo)
      const n = limit ?? 30
      const reflog = (await git.raw(['reflog', '--date=short', `--format=%h | %ad | %gs`, `-n`, String(n)])).trim()
      const lines = [`HEAD reflog (last ${n} moves):`, reflog || '(empty)']
      const fsck = await execGit(root, ['fsck', '--no-progress', '--no-reflogs'])
      const dangling = fsck.out.split('\n')
        .filter(l => l.startsWith('dangling commit '))
        .map(l => l.slice('dangling commit '.length).trim())
        .slice(0, n)
      if (dangling.length) {
        lines.push('', `dangling commits (${dangling.length}, unreachable from any ref — orphaned amends, resets, deleted branches):`)
        for (const sha of dangling) {
          const info = (await git.raw(['log', '-1', '--pretty=format:%h | %an | %ad | %s', '--date=short', sha]).catch(() => sha)).trim()
          lines.push(`  ${info}`)
        }
        lines.push('', 'Recover one with: git branch <name> <hash> or git cherry-pick <hash>.')
      } else {
        lines.push('', 'No dangling commits.')
      }
      return text(truncate(lines.join('\n')))
    } catch (e) { return errText(e) }
  }
)

// ── Conflict tools ─────────────────────────────────────────────
// The differentiator vs generic git MCP servers: a structured view of an
// ongoing merge/rebase/cherry-pick/revert with both sides properly labelled
// (branch + commit subject — during a rebase HEAD is the NEW BASE, which
// these labels make explicit), plus surgical resolution.

type ConflictMode = 'rebase' | 'merge' | 'cherry-pick' | 'revert' | null

async function detectConflictState(git: SimpleGit, root: string): Promise<{
  mode: ConflictMode
  files: string[]
  ours: string
  theirs: string
}> {
  let mode: ConflictMode = null
  let theirsRef: string | null = null
  for (const [ref, m] of [['REBASE_HEAD', 'rebase'], ['MERGE_HEAD', 'merge'], ['CHERRY_PICK_HEAD', 'cherry-pick'], ['REVERT_HEAD', 'revert']] as const) {
    // NOTE: --quiet makes git exit 1 with EMPTY stderr on a missing ref,
    // which simple-git treats as success — test the output instead.
    const out = await git.raw(['rev-parse', '--verify', '--quiet', ref]).catch(() => '')
    if (out.trim()) { theirsRef = ref; mode = m; break }
  }
  const filesOut = await git.raw(['diff', '--name-only', '--diff-filter=U']).catch(() => '')
  const files = filesOut.split('\n').map(f => f.trim()).filter(Boolean)

  const subj = async (ref: string): Promise<string> => {
    try { return (await git.raw(['log', '-1', '--pretty=format:%h — %s', ref])).trim() } catch { return '' }
  }
  let oursName = ''
  try { oursName = (await git.raw(['symbolic-ref', '--short', 'HEAD'])).trim() } catch { oursName = 'HEAD (detached)' }
  const ours = `${oursName} · ${await subj('HEAD')}`

  let theirs = ''
  if (theirsRef) {
    let theirsName = ''
    if (mode === 'rebase') {
      try {
        const gitDir = (await git.revparse(['--git-dir'])).trim()
        const absGitDir = path.isAbsolute(gitDir) ? gitDir : path.join(root, gitDir)
        for (const d of ['rebase-merge', 'rebase-apply']) {
          const p = path.join(absGitDir, d, 'head-name')
          if (fs.existsSync(p)) { theirsName = fs.readFileSync(p, 'utf-8').trim().replace('refs/heads/', ''); break }
        }
      } catch { /* label stays hash-only */ }
    } else {
      try {
        const n = (await git.raw(['name-rev', '--name-only', '--exclude', 'tags/*', theirsRef])).trim()
        if (n && n !== 'undefined') theirsName = n.replace(/^remotes\//, '')
      } catch { /* label stays hash-only */ }
    }
    theirs = `${theirsName ? theirsName + ' · ' : ''}${await subj(theirsRef)}`
  }
  return { mode, files, ours, theirs }
}

// A conflicted file path must stay inside the repo — no traversal, no flags.
function safeRepoFile(root: string, file: string): string {
  safeArg(file, 'file path')
  const abs = path.resolve(root, file)
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`File path escapes the repository: ${file}`)
  }
  return abs
}

server.tool(
  'git_conflicts',
  'Structured state of the ongoing merge/rebase/cherry-pick/revert: operation kind, both sides labelled with branch and commit subject (during a rebase, HEAD is the NEW BASE and "theirs" is the branch being replayed), conflicted files — and, when `file` is given, that file\'s full content with conflict markers. RECOMMENDED WORKFLOW: once you have a proposed resolution for a file, call open_in_git_vertex with view "resolve" and your proposed `resolution` — it preloads your proposal into the real 3-way editor for the user to review/edit/save themselves, without writing anything to disk. Only call resolve_conflict directly (which writes and stages immediately, no review) if open_in_git_vertex errors (desktop app not installed) or the user asked you to just apply it.',
  {
    repo: repoParam,
    file: z.string().optional().describe('Conflicted file path (relative to the repo root) whose marker-annotated content to include'),
  },
  async ({ repo, file }) => {
    try {
      const { git, root } = await openRepo(repo)
      const st = await detectConflictState(git, root)
      if (!st.mode && st.files.length === 0) return text('No merge/rebase/cherry-pick/revert in progress, no conflicted files.')
      const lines = [
        `operation: ${st.mode ?? 'none'}`,
        `side A (ours = current HEAD): ${st.ours}`,
        `side B (theirs = incoming): ${st.theirs || '(unknown)'}`,
        '',
        `conflicted files (${st.files.length}):`,
        ...st.files.map(f => `  ${f}`),
      ]
      if (file) {
        const abs = safeRepoFile(root, file)
        if (!st.files.includes(file)) {
          lines.push('', `NOTE: "${file}" is not in the conflicted list.`)
        } else {
          const content = fs.readFileSync(abs, 'utf-8')
          lines.push('', `content of ${file} (<<<<<<< = side A/ours, >>>>>>> = side B/theirs):`, '```', truncate(content), '```')
        }
      }
      return text(lines.join('\n'))
    } catch (e) { return errText(e) }
  }
)

server.tool(
  'resolve_conflict',
  READ_ONLY
    ? 'DISABLED (--read-only): would write the resolved content of ONE conflicted file and stage it.'
    : 'DIRECT-APPLY, no review step: write the fully-resolved content of ONE conflicted file and stage it (git add) immediately. Guard-rails: the file must currently be in conflict, and the content must not contain any conflict markers. Never touches history. PREFER open_in_git_vertex with a `resolution` instead — it lets the user review/edit before anything is written. Only use this tool directly when the desktop app isn\'t installed, or the user explicitly said to just apply the fix without reviewing it. When the MCP client supports elicitation, the server itself asks the user to confirm (with a preview of the content) before writing; if they do not, nothing is written and the result says so.',
  {
    repo: repoParam,
    file: z.string().describe('Conflicted file path, relative to the repo root'),
    content: z.string().describe('The complete resolved file content — every line, no conflict markers'),
  },
  async ({ repo, file, content }) => {
    if (READ_ONLY) return errText(new Error('This server runs with --read-only: resolve_conflict is disabled'))
    try {
      const { git, root } = await openRepo(repo)
      const st = await detectConflictState(git, root)
      if (!st.files.includes(file)) throw new Error(`"${file}" is not currently conflicted (conflicted: ${st.files.join(', ') || 'none'})`)
      if (/^[<=>]{7}/m.test(content)) throw new Error('Content still contains conflict markers (<<<<<<< / ======= / >>>>>>>)')
      const abs = safeRepoFile(root, file)
      const answer = await confirmWithUser(
        `Write this resolution to ${file} and stage it? (${st.mode ?? 'conflict'} in ${root})\n\n${preview(content)}`
      )
      if (answer === 'declined') return notConfirmed(`${file} was not written or staged`)
      fs.writeFileSync(abs, content, 'utf-8')
      await git.raw(['add', '--', file])
      const remaining = st.files.filter(f => f !== file)
      return text(`Resolved and staged ${file}. Remaining conflicted files: ${remaining.length ? remaining.join(', ') : 'none — ready to continue the operation'}.`)
    } catch (e) { return errText(e) }
  }
)

const OP_CMD: Record<Exclude<ConflictMode, null>, string> = {
  rebase: 'rebase', merge: 'merge', 'cherry-pick': 'cherry-pick', revert: 'revert',
}

server.tool(
  'continue_operation',
  READ_ONLY
    ? 'DISABLED (--read-only): would run git rebase/merge/cherry-pick/revert --continue.'
    : 'Continue the ongoing rebase/merge/cherry-pick/revert once every conflicted file is resolved and staged (equivalent of `git <op> --continue`, editor suppressed). Before calling this, the user should have had a chance to review each resolution — via open_in_git_vertex if the desktop app is installed, otherwise a quick confirmation in chat. Don\'t call this right after resolve_conflict without that step unless the user explicitly told you to just proceed. When the MCP client supports elicitation, the server also asks the user to confirm before continuing.',
  { repo: repoParam },
  async ({ repo }) => {
    if (READ_ONLY) return errText(new Error('This server runs with --read-only: continue_operation is disabled'))
    try {
      const { git, root } = await openRepo(repo)
      const st = await detectConflictState(git, root)
      if (!st.mode) throw new Error('No operation in progress')
      if (st.files.length > 0) throw new Error(`Still conflicted: ${st.files.join(', ')} — resolve them first`)
      const answer = await confirmWithUser(
        `Continue the ${st.mode} in ${root}? Every conflicted file is resolved and staged; continuing records the result as commit(s).`
      )
      if (answer === 'declined') return notConfirmed(`the ${st.mode} was not continued and is still in progress`)
      // Plain execFile: simple-git forbids GIT_EDITOR overrides, and we need
      // core.editor=true (a no-op editor) so --continue never blocks on one.
      const { execFile } = await import('node:child_process')
      const { promisify } = await import('node:util')
      const exec = promisify(execFile)
      const r = await exec('git', ['-C', root, '-c', 'core.editor=true', OP_CMD[st.mode], '--continue'], { env: C_LOCALE_ENV })
      return text(`${st.mode} continued.\n${truncate((r.stdout + r.stderr).trim(), 2000)}`)
    } catch (e) { return errText(e) }
  }
)

server.tool(
  'abort_operation',
  READ_ONLY
    ? 'DISABLED (--read-only): would run git rebase/merge/cherry-pick/revert --abort.'
    : 'Abort the ongoing rebase/merge/cherry-pick/revert and restore the pre-operation state (equivalent of `git <op> --abort`). Every resolution made so far in the operation is lost. When the MCP client supports elicitation, the server asks the user to confirm first.',
  { repo: repoParam },
  async ({ repo }) => {
    if (READ_ONLY) return errText(new Error('This server runs with --read-only: abort_operation is disabled'))
    try {
      const { git, root } = await openRepo(repo)
      const st = await detectConflictState(git, root)
      if (!st.mode) throw new Error('No operation in progress')
      const answer = await confirmWithUser(
        `Abort the ${st.mode} in ${root}? Every resolution made so far in it is thrown away, and the repository goes back to where it was before the ${st.mode} started.`
      )
      if (answer === 'declined') return notConfirmed(`the ${st.mode} was not aborted and is still in progress`)
      await git.raw([OP_CMD[st.mode], '--abort'])
      return text(`${st.mode} aborted — repository restored to its pre-operation state.`)
    } catch (e) { return errText(e) }
  }
)

// ── Bisect ─────────────────────────────────────────────────────
// Agents are excellent bisect drivers: they can build/test at each step,
// judge the result, and iterate. One tool, one `action` per call.

/**
 * Has the session converged, and on which commit? Returns `null` while there is
 * still something to test.
 *
 * git announces the answer in prose, and the wording depends on the git you run:
 * 2.39 says `<sha> is the first bad commit`, 2.55 says
 * `<sha> is the first 'bad' commit` — quoted, because bisect terms are
 * configurable (`git bisect terms`). Measured on both binaries, same repo. So a
 * client keying on either form works until git is upgraded under it, which is
 * exactly how this project's own test for this tool went from green to red
 * without a line of code changing. Same trap as matching a translated message.
 *
 * `rev-list --bisect-vars` emits shell assignments, which are never translated
 * and never quoted: `bisect_all` is the number of candidates still in play, so
 * `bisect_all=1` means the only one left is `refs/bisect/bad` itself. Verified
 * over a full session: 14 → 7 → 3 → 2 → 1, and 1 appears exactly on the step
 * where git prints its announcement (`bisect_nr=0` fires one step early, which
 * is why it is not the signal used here).
 */
async function bisectCulprit(root: string, git: SimpleGit): Promise<string | null> {
  // --quiet + --verify: a missing ref exits 1 with no output at all, so this
  // stays silent when no session is running.
  const bad = await execGit(root, ['rev-parse', '--verify', '--quiet', 'refs/bisect/bad'])
  if (bad.code !== 0 || !bad.out) return null
  const goods = await execGit(root, ['for-each-ref', '--format=%(refname)', 'refs/bisect/good-*'])
  const goodRefs = goods.out.split('\n').map((s) => s.trim()).filter(Boolean)
  // A session started with custom terms names its refs after those terms, so
  // refs/bisect/bad or the good-* refs may be absent. Say nothing rather than
  // guess: git's own output is still there.
  if (goodRefs.length === 0) return null
  const vars = await execGit(root, ['rev-list', '--bisect-vars', 'refs/bisect/bad', '--not', ...goodRefs])
  if (!/^bisect_all=1$/m.test(vars.out)) return null
  const desc = await git.raw(['log', '-1', '--pretty=format:%h — %s', 'refs/bisect/bad']).catch(() => '')
  return desc.trim() || bad.out.trim()
}

server.tool(
  'git_bisect',
  READ_ONLY
    ? 'DISABLED (--read-only, except action "log"): would drive git bisect (checks out commits).'
    : 'Drive a git bisect session to find the commit that introduced a bug. Actions: "start" (requires `good`; `bad` defaults to HEAD) checks out the midpoint; "good"/"bad"/"skip" mark the CURRENTLY checked-out commit and move to the next midpoint; "reset" ends the session and restores the original HEAD; "log" shows the session so far. While the search continues the output ends with `currently checked out: <sha> — <subject>` (the commit to test next); when it converges it ends with `first bad commit: <sha> — <subject>` instead — match that line rather than git\'s own prose, which quotes the configurable bisect term. Typical loop: start → [build/test → good|bad]… → culprit → reset. NOTE: start/good/bad/skip check out commits, so the working tree must be clean.',
  {
    repo: repoParam,
    action: z.enum(['start', 'good', 'bad', 'skip', 'reset', 'log']).describe('Bisect step to perform'),
    bad: z.string().optional().describe('For action=start: a commit known to be BAD (default: HEAD)'),
    good: z.string().optional().describe('For action=start: a commit known to be GOOD (required)'),
  },
  async ({ repo, action, bad, good }) => {
    if (READ_ONLY && action !== 'log') return errText(new Error('This server runs with --read-only: only git_bisect action "log" is allowed'))
    try {
      const { git, root } = await openRepo(repo)
      let args: string[]
      if (action === 'start') {
        if (!good) throw new Error('action=start requires `good` (a commit known to be good)')
        args = ['bisect', 'start', safeArg(bad ?? 'HEAD', 'bad'), safeArg(good, 'good')]
      } else {
        args = ['bisect', action]
      }
      const r = await execGit(root, args)
      if (r.code !== 0 && action !== 'log') throw new Error(r.out || `git bisect ${action} failed`)
      let out = r.out
      if (action === 'good' || action === 'bad' || action === 'skip' || action === 'start') {
        // Once converged, HEAD is still on the last commit *tested*, not on the
        // culprit — reporting it as "currently checked out" next to the answer
        // is how a caller ends up blaming the wrong commit. So it is one or the
        // other: the answer, or where to test next.
        const culprit = await bisectCulprit(root, git)
        if (culprit) {
          out += `\n\nfirst bad commit: ${culprit}\n(run action "reset" to end the session and restore the original HEAD)`
        } else {
          const cur = (await git.raw(['log', '-1', '--pretty=format:%h — %s']).catch(() => '')).trim()
          if (cur) out += `\n\ncurrently checked out: ${cur}`
        }
      }
      return text(truncate(out || `(bisect ${action}: done)`, 4000))
    } catch (e) { return errText(e) }
  }
)

// ── App handoff ────────────────────────────────────────────────
// The unique bit: hand the human a real GUI for review. Builds a
// gitgui://open deep link and opens it with the OS opener — the Git Vertex
// desktop app (must be installed) focuses the repo, and can jump straight
// to the 3-way conflict resolver on a file or to a commit's details.
//
// For view=resolve with a proposed `resolution`: the content is written to
// a throwaway file (NOT the working tree — the conflicted file on disk is
// untouched) and referenced from the deep link. The app reads it and
// preloads it into the resolver's manual-edit box, exactly like clicking
// "Résoudre avec l'IA" there — the user reviews/edits and clicks
// "Enregistrer & Résoudre" themselves. Nothing is written or staged by
// this tool.
const PROPOSAL_DIR = path.join(os.tmpdir(), 'git-vertex-mcp-proposals')

function writeProposal(content: string): string {
  fs.mkdirSync(PROPOSAL_DIR, { recursive: true })
  const p = path.join(PROPOSAL_DIR, `${Date.now()}-${Math.random().toString(36).slice(2)}.txt`)
  fs.writeFileSync(p, content, 'utf-8')
  return p
}

async function openDeepLink(params: URLSearchParams): Promise<void> {
  const url = `gitgui://open?${params.toString()}`
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const exec = promisify(execFile)
  if (process.platform === 'darwin') await exec('open', [url])
  else if (process.platform === 'win32') await exec('cmd', ['/c', 'start', '', url])
  else await exec('xdg-open', [url])
}

server.tool(
  'open_in_git_vertex',
  'Open the Git Vertex desktop app on this repository for human review: the commit graph ("graph"), the 3-way conflict resolver on a conflicted file ("resolve" + file, optionally with a proposed `resolution` preloaded into the editor for the user to review/edit/save themselves — nothing is written to disk by this call), or a commit\'s details ("commit" + hash). PREFER this — with `resolution` set — over calling resolve_conflict directly, so the user reviews the change in the real editor instead of a text diff; only call resolve_conflict directly if this tool errors (app not installed) or the user asked you to just apply it. Requires the desktop app to be installed — if this errors, call resolve_conflict: when the MCP client supports elicitation the server asks the user for a go/no-go itself, and otherwise tell the user your proposed resolution in chat and ask for a go/no-go there instead of skipping review.',
  {
    repo: repoParam,
    view: z.enum(['graph', 'resolve', 'commit']).optional().describe('Surface to open (default "graph")'),
    file: z.string().optional().describe('For view=resolve: the conflicted file path, relative to the repo root'),
    hash: z.string().optional().describe('For view=commit: the commit to select — a full or short hash, or any revision that names one (tag like "v1.0", branch, "HEAD~2"); it is resolved to a SHA for you'),
    resolution: z.string().optional().describe('For view=resolve: a proposed resolved-file content to preload into the resolver\'s editor for review — NOT written to disk or staged until the user saves it themselves'),
  },
  async ({ repo, view, file, hash, resolution }) => {
    try {
      const { git, root } = await openRepo(repo)
      const v = view ?? 'graph'
      if (v === 'resolve' && !file) throw new Error('view=resolve requires `file`')
      if (v === 'commit' && !hash) throw new Error('view=commit requires `hash`')
      const params = new URLSearchParams({ repo: root, view: v })
      if (file) params.set('file', safeArg(file, 'file'))
      // The app matches the deep-link hash against commit SHAs, so a tag or
      // branch name ("v1.0", "main") would never select anything — resolve any
      // revision to its SHA here, like propose_rebase_plan does for `base`.
      if (hash) {
        let resolved: string
        try {
          resolved = (await git.revparse([`${safeArg(hash, 'hash')}^{commit}`])).trim()
        } catch {
          throw new Error(`Unknown revision: ${hash} — pass a commit hash, tag or branch that exists in this repository`)
        }
        params.set('hash', resolved)
      }
      let proposalPath: string | null = null
      if (v === 'resolve' && resolution != null) {
        proposalPath = writeProposal(resolution)
        params.set('proposal', proposalPath)
      }
      await openDeepLink(params)
      // Only the resolver has a save button — don't tell the user to click it
      // when all we did was open the graph or a commit's details.
      const nextStep = v === 'resolve'
        ? 'The user still needs to review and click "Enregistrer & Résoudre" in the app — this call did not write or stage anything.'
        : 'This call only opened a view — nothing was written, staged or modified.'
      return text(`Opened Git Vertex: ${v}${file ? ` on ${file}` : ''}${hash ? ` at ${hash}` : ''}${proposalPath ? ' with your proposed resolution preloaded for review' : ''} (${root}).\n${nextStep}\nIf nothing happened, the Git Vertex desktop app may not be installed — the gitgui:// scheme is registered by the app.`)
    } catch (e) { return errText(e) }
  }
)

// ── Agent proposals: commit, rebase plan & split ───────────────
// Same philosophy as view=resolve above: the agent PROPOSES, the human
// reviews in the real UI, nothing is written/staged/rewritten by the tool.
// The proposal travels as a single-use JSON file in PROPOSAL_DIR, consumed
// by the app's main process and inlined for the renderer.

server.tool(
  'propose_commit',
  'Propose a commit for HUMAN REVIEW in the Git Vertex desktop app: opens the staging view with your commit `message` preloaded into the message box and, when `files` are given, shown as the agent-proposed selection with a one-click "stage these files" action. NOTHING is staged or committed by this call — the user reviews, adjusts and commits themselves. PREFER this over pasting a message in chat for the user to copy. Requires the desktop app to be installed; if this errors, share the proposed message in chat instead.',
  {
    repo: repoParam,
    message: z.string().min(1).describe('Full proposed commit message: first line = summary (English, imperative, ≤72 chars), optional body after a blank line'),
    files: z.array(z.string()).optional().describe('Paths (relative to the repo root) this commit should include — shown to the user as the proposed selection to stage'),
  },
  async ({ repo, message, files }) => {
    try {
      const { root } = await openRepo(repo)
      if (files) for (const f of files) safeRepoFile(root, f)
      const proposalPath = writeProposal(JSON.stringify({ kind: 'commit', message, files: files ?? [] }))
      const params = new URLSearchParams({ repo: root, view: 'propose-commit', proposal: proposalPath })
      await openDeepLink(params)
      return text(`Opened Git Vertex with the proposed commit message preloaded${files?.length ? ` and ${files.length} proposed file(s) listed` : ''} (${root}).\nNothing was staged or committed — the user reviews and commits in the app.\nIf nothing happened, the desktop app may not be installed — share the proposed message in chat instead.`)
    } catch (e) { return errText(e) }
  }
)

server.tool(
  'propose_rebase_plan',
  'Propose an interactive-rebase plan (squash/fixup/reword/drop) for HUMAN REVIEW in the Git Vertex desktop app: opens the visual rebase editor on `base` with your per-commit actions — and new messages for reword/squash groups — preloaded. NOTHING is rewritten by this call: the user reviews, adjusts and launches the rebase themselves. Steps apply to commits in base..HEAD; commits not listed keep "pick"; step order does not reorder commits. Requires the desktop app to be installed; if this errors, describe the plan in chat instead.',
  {
    repo: repoParam,
    base: z.string().describe('The commit the rebase replays onto — commits AFTER it (base..HEAD) become editable. E.g. "HEAD~5", a branch, or a hash.'),
    steps: z.array(z.object({
      hash: z.string().describe('Commit hash (short or full) within base..HEAD'),
      action: z.enum(['pick', 'reword', 'squash', 'fixup', 'drop']),
      message: z.string().optional().describe('New commit message — applies when action is "reword", or on the first commit of a squash group'),
    })).min(1).describe('Per-commit actions; unlisted commits stay "pick"'),
  },
  async ({ repo, base, steps }) => {
    try {
      const { git, root } = await openRepo(repo)
      const baseHash = (await git.revparse([safeArg(base, 'base')])).trim()
      const range = (await git.raw(['rev-list', `${baseHash}..HEAD`]))
        .split('\n').map(s => s.trim()).filter(Boolean)
      if (range.length === 0) throw new Error(`No commits in ${base}..HEAD — nothing to rebase`)
      for (const s of steps) {
        safeArg(s.hash, 'step hash')
        if (!range.some(h => h.startsWith(s.hash) || s.hash.startsWith(h))) {
          throw new Error(`Commit ${s.hash} is not in ${base}..HEAD`)
        }
      }
      const proposalPath = writeProposal(JSON.stringify({ kind: 'rebase', steps }))
      const params = new URLSearchParams({ repo: root, view: 'propose-rebase', hash: baseHash, proposal: proposalPath })
      await openDeepLink(params)
      return text(`Opened the Git Vertex rebase editor on ${base} (${range.length} commit(s) in range) with your ${steps.length}-step plan preloaded (${root}).\nNothing was rewritten — the user reviews and launches the rebase in the app.\nIf nothing happened, the desktop app may not be installed — describe the plan in chat instead.`)
    } catch (e) { return errText(e) }
  }
)

// Every path with uncommitted work — staged, unstaged or untracked — in the
// same three reads the app's composer measures a split against, so what this
// tool accepts is what the review screen will show. `-z` because without it
// git quotes a path with a non-ASCII byte ("d\303\251mo.txt"), which would
// then match nothing the agent sent. Through simple-git rather than execGit,
// whose output carries stderr after stdout: a warning would have been read as
// one more changed path.
async function uncommittedFiles(git: SimpleGit): Promise<string[]> {
  const names = async (args: string[]) =>
    (await git.raw(args)).split('\0').filter(Boolean).map(nfc)
  const all = [
    ...await names(['diff', '--cached', '--name-only', '-z']),
    ...await names(['diff', '--name-only', '-z']),
    // `repo` may name a subdirectory, and ls-files, unlike diff, answers for
    // the directory it runs in: `:/` and --full-name make it the whole tree,
    // spelled from the root like the two diffs above.
    ...await names(['ls-files', '--others', '--exclude-standard', '--full-name', '-z', '--', ':/']),
  ]
  return [...new Set(all)].sort()
}

// The paths an agent sends are checked here AND measured again by the app
// when the review screen opens: here so the agent hears about a path it got
// wrong while it can still fix it, there because the working tree may move
// between the two. Refusing is kinder than repairing: a split that quietly
// lost a file is a split the agent then describes wrongly to the user.
server.tool(
  'propose_split',
  'Propose cutting the UNCOMMITTED work (staged, unstaged and untracked) into a sequence of logical commits, for HUMAN REVIEW in the Git Vertex desktop app: opens the commit composer with your commits — a message and whole files each — preloaded, where the user edits messages, moves files between commits, reorders or drops commits, and creates them with one button. NOTHING is staged or committed by this call. Each commit takes WHOLE files (every hunk, staged or not): a file cannot be split across two commits, so group by file. Every path must have uncommitted changes and appear in at most one commit; changed files you leave out are shown to the user as "in no commit" and stay uncommitted. Order the commits as they should be applied. For a single commit, use propose_commit instead. Requires the desktop app to be installed; if this errors, describe the split in chat instead.',
  {
    repo: repoParam,
    commits: z.array(z.object({
      message: z.string().trim().min(1).describe('Full commit message: first line = summary (English, imperative, ≤72 chars), optional body after a blank line'),
      files: z.array(z.string().min(1)).min(1).describe('Paths relative to the repo root, each with uncommitted changes — the whole file goes into this commit'),
    })).min(1).describe('The commits in the order they should be made'),
  },
  async ({ repo, commits }) => {
    try {
      const { git, root } = await openRepo(repo)
      const changed = await uncommittedFiles(git)
      if (changed.length === 0) throw new Error('Nothing uncommitted to split')
      const known = new Set(changed)

      const owner = new Map<string, number>()
      const unknown: string[] = []
      const twice: string[] = []
      const plan = commits.map((c, i) => {
        const files: string[] = []
        for (const f of c.files) {
          // Normalized to the repo-relative, forward-slash spelling git
          // prints, so "./src/a.ts" and "src/a.ts" are the same file.
          const rel = nfc(path.relative(root, safeRepoFile(root, f)).split(path.sep).join('/'))
          if (!known.has(rel)) { unknown.push(f); continue }
          const first = owner.get(rel)
          if (first === undefined) { owner.set(rel, i); files.push(rel) }
          else if (first !== i) twice.push(`${rel} (commits ${first + 1} and ${i + 1})`)
        }
        return { message: c.message, files }
      })
      if (unknown.length) {
        throw new Error(`No uncommitted changes in: ${unknown.join(', ')}. Files with uncommitted changes: ${truncate(changed.join(', '), 2000)}`)
      }
      if (twice.length) {
        throw new Error(`A file can go in only one commit — the composer commits whole files: ${twice.join(', ')}`)
      }

      const proposalPath = writeProposal(JSON.stringify({ kind: 'split', commits: plan }))
      const params = new URLSearchParams({ repo: root, view: 'propose-split', proposal: proposalPath })
      await openDeepLink(params)
      const loose = changed.filter(f => !owner.has(f))
      return text(`Opened the Git Vertex commit composer with your ${plan.length}-commit split preloaded (${owner.size} file(s)) (${root}).`
        + (loose.length ? `\n${loose.length} changed file(s) are in no commit and are listed to the user as such: ${truncate(loose.join(', '), 2000)}` : '')
        + '\nNothing was staged or committed — the user reviews, edits and creates the commits in the app.'
        + '\nIf nothing happened, the desktop app may not be installed — describe the split in chat instead.')
    } catch (e) { return errText(e) }
  }
)

// ── AI via MCP sampling ────────────────────────────────────────
// Provider-agnostic commit-message generation: the LLM used is the MCP
// CLIENT's own model (sampling/createMessage) — no API key configured on
// this server, works identically with Claude, GPT, Gemini or a local model.

server.tool(
  'generate_commit_message',
  'Draft a commit message from the STAGED changes using the MCP client\'s own LLM (MCP sampling) — no API key needed on this server, works with any provider. Returns the proposed message to YOU, the calling agent — it does NOT open the app and does NOT put anything in the app\'s commit box. Nothing is committed. If the client does not support sampling, returns the staged diff with instructions so you write the message yourself. ALWAYS call propose_commit with the resulting message afterwards if the user expects to see it in Git Vertex — this tool alone leaves the app untouched, so never tell the user the message is waiting in the app unless you called propose_commit.',
  { repo: repoParam },
  async ({ repo }) => {
    try {
      const { git } = await openRepo(repo)
      const diff = (await git.raw(['diff', '--cached'])).trim()
      if (!diff) throw new Error('Nothing staged — stage changes first (git add)')
      const stat = (await git.raw(['diff', '--cached', '--stat'])).trim()
      if (!server.server.getClientCapabilities()?.sampling) {
        return text(`This MCP client does not support sampling — write the commit message yourself (English, imperative, summary ≤72 chars, optional body) from this staged diff:\n\n${stat}\n\n${truncate(diff, 16000)}`)
      }
      const res = await server.server.createMessage({
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Write a git commit message for the staged changes below.\nRules: English only; imperative mood; first line ≤ 72 chars (conventional-commit style like "feat(scope): …" when it fits); optionally a short body after a blank line explaining the why. Reply with the commit message ONLY — no code fences, no commentary.\n\n${truncate(diff, 16000)}`,
          },
        }],
        maxTokens: 400,
      })
      const msg = res.content.type === 'text' ? res.content.text.trim() : ''
      if (!msg) throw new Error('Sampling returned an empty message — write it yourself from git_diff staged')
      // The message and the next-step reminder travel as separate blocks so
      // the reminder can't leak into a message the agent copies verbatim.
      return {
        content: [
          { type: 'text' as const, text: msg },
          { type: 'text' as const, text: 'Note for the agent, not part of the message: this call did not open Git Vertex and did not fill its commit box. Call propose_commit with this message to put it in front of the user in the app.' },
        ],
      }
    } catch (e) { return errText(e) }
  }
)

// ── Resources ──────────────────────────────────────────────────
// What an agent would otherwise have to ask for with a tool call, offered as
// context a client can pin: open-source clients (Cline, Continue, Zed…) attach a
// resource to the conversation directly, and keep it fresh through a
// subscription. They read the DEFAULT repository — $GV_REPO, or the directory the
// client started the server in — since a resource URI carries no arguments.

type GitResource = {
  name: string
  title: string
  description: string
  mimeType: string
  read: (git: SimpleGit, root: string) => Promise<string>
}

const RESOURCES: Record<string, GitResource> = {
  'git://status': {
    name: 'status',
    title: 'Working-tree status',
    description: 'Current branch, upstream ahead/behind, staged, modified, untracked, deleted and conflicted files — the same text as the git_status tool.',
    mimeType: 'text/plain',
    read: statusText,
  },
  'git://log': {
    name: 'log',
    title: 'Recent history',
    description: 'The last 50 commits across all branches, most recent first: hash | parents | author | date | refs | subject — the same text as the git_log tool with its defaults.',
    mimeType: 'text/plain',
    read: (git) => logText(git),
  },
  'git://diff/staged': {
    name: 'diff-staged',
    title: 'Staged changes',
    description: 'The patch that the next commit would record (git diff --cached), truncated at 24k characters.',
    mimeType: 'text/x-diff',
    read: (git) => stagedDiffText(git),
  },
}

async function readResourceText(uri: string): Promise<string> {
  const r = RESOURCES[uri]
  if (!r) throw new McpError(ErrorCode.InvalidParams, `Unknown resource: ${uri}`)
  const { git, root } = await openRepo()
  return r.read(git, root)
}

for (const [uri, r] of Object.entries(RESOURCES)) {
  server.registerResource(r.name, uri, { title: r.title, description: r.description, mimeType: r.mimeType }, async () => ({
    contents: [{ uri, mimeType: r.mimeType, text: await readResourceText(uri) }],
  }))
}

// Subscriptions. git has no change feed, and watching the working tree for
// events is not portable (recursive fs.watch needs Node 20 on Linux, and the
// events fire on every editor save whether or not git's answer changed). So a
// subscribed resource is re-read on an interval and compared with the last text
// the client could have seen: a notification means the CONTENT changed, never
// merely that a file was touched. Nothing is polled while nothing is subscribed.
// The status is read without optional locks (see simpleGitEnv), so the polling
// cannot collide with the user's own git commands.
const POLL_MS = Math.max(50, Number(process.env.GV_MCP_RESOURCE_POLL_MS) || 2000)
const subscriptions = new Map<string, string>() // uri → fingerprint of the last text
let pollTimer: NodeJS.Timeout | null = null
let polling = false

// A failing read (the directory stopped being a repository, say) is a state
// too: its message is what the client would read, so it is fingerprinted like
// any other text rather than dropped.
async function fingerprint(uri: string): Promise<string> {
  let body: string
  try { body = await readResourceText(uri) } catch (e) { body = `error: ${e instanceof Error ? e.message : String(e)}` }
  return createHash('sha1').update(body).digest('hex')
}

async function pollSubscriptions(): Promise<void> {
  // A slow git (a large repository, a cold cache) must not stack reads.
  if (polling) return
  polling = true
  try {
    for (const [uri, last] of subscriptions) {
      const now = await fingerprint(uri)
      // Unsubscribed while the read was in flight: say nothing.
      if (!subscriptions.has(uri) || now === last) continue
      subscriptions.set(uri, now)
      await server.server.sendResourceUpdated({ uri }).catch(() => { /* client gone */ })
    }
  } finally {
    polling = false
  }
}

function syncPolling(): void {
  if (subscriptions.size > 0 && !pollTimer) {
    pollTimer = setInterval(() => { void pollSubscriptions() }, POLL_MS)
    // The stdio transport is what keeps the process alive; a subscription left
    // behind by a client that went away must not.
    pollTimer.unref()
  } else if (subscriptions.size === 0 && pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// McpServer handles list and read, but not subscribe: the capability and its
// two handlers are declared on the underlying server, before connecting.
server.server.registerCapabilities({ resources: { subscribe: true, listChanged: true } })
server.server.setRequestHandler(SubscribeRequestSchema, async (req) => {
  const { uri } = req.params
  if (!RESOURCES[uri]) throw new McpError(ErrorCode.InvalidParams, `Unknown resource: ${uri}`)
  // The baseline is taken now, so the first notification is for a change made
  // after the subscription — not for the state the client just read.
  subscriptions.set(uri, await fingerprint(uri))
  syncPolling()
  return {}
})
server.server.setRequestHandler(UnsubscribeRequestSchema, async (req) => {
  subscriptions.delete(req.params.uri)
  syncPolling()
  return {}
})

// ── Prompts ────────────────────────────────────────────────────
// Slash commands any MCP client lists natively (/review-branch, /release-notes,
// /explain-commit). Each one gathers the git material itself and hands it over
// inside the prompt, so it works in a client that never calls a tool — and the
// model's answer comes from the client's own LLM, whichever provider that is.
// Arguments of a prompt are strings by protocol, all of them optional but one.

const promptRepoArg = z.string().optional().describe('Absolute path to the git repository (default: $GV_REPO or the server\'s working directory)')

const userPrompt = (description: string, body: string) => ({
  description,
  messages: [{ role: 'user' as const, content: { type: 'text' as const, text: body } }],
})

// Where a branch is to be reviewed against when the caller does not say: the
// remote's default branch if the clone recorded one, else the usual local names.
// Both probes use --quiet, whose miss is an exit 1 with empty stderr — simple-git
// reports that as success with empty output, so the OUTPUT is what is tested.
async function defaultBase(git: SimpleGit): Promise<string> {
  const originHead = (await git.raw(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']).catch(() => '')).trim()
  if (originHead) return originHead
  for (const name of ['main', 'master', 'trunk', 'develop']) {
    const hit = (await git.raw(['rev-parse', '--verify', '--quiet', `refs/heads/${name}`]).catch(() => '')).trim()
    if (hit) return name
  }
  throw new Error('Could not guess the base branch (no origin/HEAD, main, master, trunk or develop) — pass `base`')
}

server.registerPrompt(
  'review-branch',
  {
    title: 'Review a branch',
    description: 'Code review of a branch against its base: the commits it adds and their combined diff, with instructions to look for bugs, risks and missing tests.',
    argsSchema: {
      repo: promptRepoArg,
      branch: z.string().optional().describe('The branch to review (default: the current branch)'),
      base: z.string().optional().describe('The branch it would merge into (default: origin\'s default branch, else main/master)'),
    },
  },
  async ({ repo, branch, base }) => {
    const { git, root } = await openRepo(repo)
    let head = branch ? safeArg(branch, 'branch') : ''
    if (!head) head = (await git.raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
    const target = base ? safeArg(base, 'base') : await defaultBase(git)
    // Resolve both first, for a clear error on a typo rather than git's own.
    await git.revparse([head]); await git.revparse([target])
    const commits = (await git.raw(['log', '--pretty=format:%h %s (%an, %ad)', '--date=short', `${target}..${head}`])).trim()
    if (!commits) throw new Error(`${head} has no commits that ${target} does not already have — nothing to review`)
    // Three dots: the changes since the branch left its base, not whatever the
    // base has gained since — that is what a merge would bring in.
    const stat = (await git.raw(['diff', '--stat', `${target}...${head}`])).replace(/^\n+/, '').trimEnd()
    const patch = (await git.raw(['diff', `${target}...${head}`])).trim()
    return userPrompt(`Review of ${head} against ${target}`, [
      `Review the branch \`${head}\` against \`${target}\` in ${root}, as a careful senior reviewer would before it is merged.`,
      '',
      'Look for, in this order: bugs and behaviour changes the commit messages do not own up to; edge cases and error paths; security and data-loss risks; missing or weakened tests; then readability. Cite the file and the hunk for each point, say how sure you are, and separate what must change from what is a suggestion. If the branch looks right, say so plainly rather than inventing findings.',
      '',
      `Commits on ${head} not on ${target}:`,
      commits,
      '',
      'Files changed:',
      stat,
      '',
      'Combined diff:',
      '```diff',
      truncate(patch, 20000),
      '```',
    ].join('\n'))
  }
)

server.registerPrompt(
  'release-notes',
  {
    title: 'Draft release notes',
    description: 'Release notes for a range of history — by default, everything since the latest tag — written for users from the commit subjects and bodies.',
    argsSchema: {
      repo: promptRepoArg,
      from: z.string().optional().describe('Start of the range, exclusive (default: the latest tag before `to`)'),
      to: z.string().optional().describe('End of the range, inclusive (default: HEAD)'),
    },
  },
  async ({ repo, from, to }) => {
    const { git, root } = await openRepo(repo)
    const end = to ? safeArg(to, 'to') : 'HEAD'
    await git.revparse([end])
    let start = from ? safeArg(from, 'from') : ''
    if (!start) {
      // Described from the PARENT of `end`: when `end` is itself the tag being
      // released, the notes are for what led up to it, not an empty range.
      // No tag at all (git exits 128) means the whole history.
      start = (await git.raw(['describe', '--tags', '--abbrev=0', `${end}^`]).catch(() => '')).trim()
    } else {
      await git.revparse([start])
    }
    const range = start ? `${start}..${end}` : end
    const log = (await git.raw(['log', '--no-merges', '--max-count=300', '--pretty=format:- %h %s (%an)%n%w(0,4,4)%b', range])).trim()
    if (!log) throw new Error(`No commits in ${range} — nothing to write notes for`)
    return userPrompt(`Release notes for ${range}`, [
      `Draft release notes for the changes in \`${range}\` of ${root}${start ? '' : ' (no earlier tag: the whole history)'}.`,
      '',
      'Write for the people who USE the software, not for its developers: group the changes under Added, Changed, Fixed and Removed (leave out empty groups), lead each entry with what a user notices, and say why it matters when the commit explains it. Fold together commits that are one change, and leave out what a user cannot see (refactors, CI, tests, typo fixes) unless it changes behaviour. Do not invent anything the commits do not say. Markdown, English.',
      '',
      'Commits (subject, then body, merges left out):',
      truncate(log, 20000),
    ].join('\n'))
  }
)

server.registerPrompt(
  'explain-commit',
  {
    title: 'Explain a commit',
    description: 'Plain-language explanation of one commit — what it changes, why, and what to watch out for — from its message, its stats and its patch.',
    argsSchema: {
      repo: promptRepoArg,
      ref: z.string().describe('The commit: a hash, a tag, a branch or any revision (e.g. HEAD~2)'),
    },
  },
  async ({ repo, ref }) => {
    const { git, root } = await openRepo(repo)
    const r = safeArg(ref, 'ref')
    const meta = (await git.raw(['show', '--no-patch', '--pretty=format:commit %H%nauthor: %an <%ae>%ndate: %ad%nrefs: %D%n%n%B', '--date=iso', r])).trim()
    const stat = (await git.raw(['show', '--stat', '--pretty=format:', r])).replace(/^\n+/, '').trimEnd()
    const patch = (await git.raw(['show', '--pretty=format:', '--patch', r])).trim()
    return userPrompt(`Explanation of ${ref}`, [
      `Explain the commit \`${ref}\` of ${root} to someone who knows the project but has not seen this change.`,
      '',
      'Say what it changes and why (from the message where it says so — and say so when it does not), how it does it, anything surprising or risky, and what someone building on top of it should know. Refer to files and functions by name. Keep it proportionate: a one-line fix needs a paragraph, not a report.',
      '',
      meta,
      '',
      'Files changed:',
      stat || '(none)',
      '',
      'Patch:',
      '```diff',
      truncate(patch || '(empty — a merge or an empty commit)', 20000),
      '```',
    ].join('\n'))
  }
)

// ── Start ──────────────────────────────────────────────────────
const transport = new StdioServerTransport()
await server.connect(transport)
console.error(`git-vertex-mcp v${VERSION} ready (stdio)`)
