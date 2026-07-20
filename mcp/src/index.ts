// git-vertex-mcp — local MCP server over your Git repositories.
// Exposes the same information the Git Vertex desktop app shows (status,
// commit graph, branches, diffs, blame) to MCP clients like Claude Code,
// Cursor or Copilot — plus structured CONFLICT tools: inspect an ongoing
// merge/rebase with both sides labelled (branch + subject), apply a
// surgical resolution to a conflicted file, and continue/abort the
// operation. Runs on stdio, entirely on your machine — no cloud.
//
// Writes are limited to conflict resolution (a file already in conflict,
// staged after write; never history rewriting) and can be disabled
// entirely with --read-only or GV_MCP_READONLY=1.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { simpleGit, SimpleGit } from 'simple-git'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as os from 'node:os'

const VERSION = '0.4.0'
const READ_ONLY = process.argv.includes('--read-only') || process.env.GV_MCP_READONLY === '1'

// ── Repo resolution ────────────────────────────────────────────
// Every tool takes an optional `repo` path; default is $GV_REPO or cwd.
// simple-git instances are cached per resolved path.
const gitCache = new Map<string, SimpleGit>()

async function openRepo(repo?: string): Promise<{ git: SimpleGit; root: string }> {
  const base = path.resolve(repo || process.env.GV_REPO || process.cwd())
  const cached = gitCache.get(base)
  const git: SimpleGit = cached ?? simpleGit(base)
  if (!cached) gitCache.set(base, git)
  const isRepo = await git.checkIsRepo()
  if (!isRepo) throw new Error(`Not a git repository: ${base}`)
  const root = (await git.revparse(['--show-toplevel'])).trim()
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

// ── Server & tools ─────────────────────────────────────────────
const server = new McpServer({ name: 'git-vertex', version: VERSION })

server.tool(
  'git_status',
  'Working-tree status: current branch, upstream ahead/behind, staged, unstaged, untracked and conflicted files.',
  { repo: repoParam },
  async ({ repo }) => {
    try {
      const { git, root } = await openRepo(repo)
      const s = await git.status()
      const lines = [
        `repo: ${root}`,
        `branch: ${s.current ?? '(detached)'}${s.tracking ? ` → ${s.tracking}` : ''}`,
        `ahead/behind: +${s.ahead} / -${s.behind}`,
        '',
        `staged (${s.staged.length}): ${s.staged.join(', ') || '—'}`,
        `modified (${s.modified.length}): ${s.modified.join(', ') || '—'}`,
        `untracked (${s.not_added.length}): ${s.not_added.join(', ') || '—'}`,
        `deleted (${s.deleted.length}): ${s.deleted.join(', ') || '—'}`,
        `conflicted (${s.conflicted.length}): ${s.conflicted.join(', ') || '—'}`,
      ]
      return text(lines.join('\n'))
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
      const args = [
        'log',
        '--pretty=format:%h|%p|%an|%ad|%D|%s',
        '--date=short',
        `--max-count=${maxCount ?? 50}`,
        '--date-order',
      ]
      if (all !== false) args.push('--all')
      if (author) args.push(`--author=${safeArg(author, 'author')}`)
      if (since) args.push(`--since=${safeArg(since, 'since')}`)
      if (filePath) args.push('--', safeArg(filePath, 'path'))
      const out = await git.raw(args)
      return text(truncate(out.trim() || '(no commits)'))
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
    execFile('git', ['-C', root, ...args], { maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
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
    : 'DIRECT-APPLY, no review step: write the fully-resolved content of ONE conflicted file and stage it (git add) immediately. Guard-rails: the file must currently be in conflict, and the content must not contain any conflict markers. Never touches history. PREFER open_in_git_vertex with a `resolution` instead — it lets the user review/edit before anything is written. Only use this tool directly when the desktop app isn\'t installed, or the user explicitly said to just apply the fix without reviewing it.',
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
    : 'Continue the ongoing rebase/merge/cherry-pick/revert once every conflicted file is resolved and staged (equivalent of `git <op> --continue`, editor suppressed). Before calling this, the user should have had a chance to review each resolution — via open_in_git_vertex if the desktop app is installed, otherwise a quick confirmation in chat. Don\'t call this right after resolve_conflict without that step unless the user explicitly told you to just proceed.',
  { repo: repoParam },
  async ({ repo }) => {
    if (READ_ONLY) return errText(new Error('This server runs with --read-only: continue_operation is disabled'))
    try {
      const { git, root } = await openRepo(repo)
      const st = await detectConflictState(git, root)
      if (!st.mode) throw new Error('No operation in progress')
      if (st.files.length > 0) throw new Error(`Still conflicted: ${st.files.join(', ')} — resolve them first`)
      // Plain execFile: simple-git forbids GIT_EDITOR overrides, and we need
      // core.editor=true (a no-op editor) so --continue never blocks on one.
      const { execFile } = await import('node:child_process')
      const { promisify } = await import('node:util')
      const exec = promisify(execFile)
      const r = await exec('git', ['-C', root, '-c', 'core.editor=true', OP_CMD[st.mode], '--continue'])
      return text(`${st.mode} continued.\n${truncate((r.stdout + r.stderr).trim(), 2000)}`)
    } catch (e) { return errText(e) }
  }
)

server.tool(
  'abort_operation',
  READ_ONLY
    ? 'DISABLED (--read-only): would run git rebase/merge/cherry-pick/revert --abort.'
    : 'Abort the ongoing rebase/merge/cherry-pick/revert and restore the pre-operation state (equivalent of `git <op> --abort`).',
  { repo: repoParam },
  async ({ repo }) => {
    if (READ_ONLY) return errText(new Error('This server runs with --read-only: abort_operation is disabled'))
    try {
      const { git, root } = await openRepo(repo)
      const st = await detectConflictState(git, root)
      if (!st.mode) throw new Error('No operation in progress')
      await git.raw([OP_CMD[st.mode], '--abort'])
      return text(`${st.mode} aborted — repository restored to its pre-operation state.`)
    } catch (e) { return errText(e) }
  }
)

// ── Bisect ─────────────────────────────────────────────────────
// Agents are excellent bisect drivers: they can build/test at each step,
// judge the result, and iterate. One tool, one `action` per call.

server.tool(
  'git_bisect',
  READ_ONLY
    ? 'DISABLED (--read-only, except action "log"): would drive git bisect (checks out commits).'
    : 'Drive a git bisect session to find the commit that introduced a bug. Actions: "start" (requires `good`; `bad` defaults to HEAD) checks out the midpoint; "good"/"bad"/"skip" mark the CURRENTLY checked-out commit and move to the next midpoint (output announces the culprit when found); "reset" ends the session and restores the original HEAD; "log" shows the session so far. Typical loop: start → [build/test → good|bad]… → culprit → reset. NOTE: start/good/bad/skip check out commits, so the working tree must be clean.',
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
        const cur = (await git.raw(['log', '-1', '--pretty=format:%h — %s']).catch(() => '')).trim()
        if (cur) out += `\n\ncurrently checked out: ${cur}`
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
  'Open the Git Vertex desktop app on this repository for human review: the commit graph ("graph"), the 3-way conflict resolver on a conflicted file ("resolve" + file, optionally with a proposed `resolution` preloaded into the editor for the user to review/edit/save themselves — nothing is written to disk by this call), or a commit\'s details ("commit" + hash). PREFER this — with `resolution` set — over calling resolve_conflict directly, so the user reviews the change in the real editor instead of a text diff; only call resolve_conflict directly if this tool errors (app not installed) or the user asked you to just apply it. Requires the desktop app to be installed — if this errors, tell the user your proposed resolution in chat and ask for a go/no-go there instead of skipping review.',
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

// ── Agent proposals: commit & rebase plan ──────────────────────
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

// ── AI via MCP sampling ────────────────────────────────────────
// Provider-agnostic commit-message generation: the LLM used is the MCP
// CLIENT's own model (sampling/createMessage) — no API key configured on
// this server, works identically with Claude, GPT, Gemini or a local model.

server.tool(
  'generate_commit_message',
  'Draft a commit message from the STAGED changes using the MCP client\'s own LLM (MCP sampling) — no API key needed on this server, works with any provider. Returns the proposed message; nothing is committed. If the client does not support sampling, returns the staged diff with instructions so the calling agent writes the message itself. Pair with propose_commit to hand the result to the user for review in the app.',
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
      return text(msg)
    } catch (e) { return errText(e) }
  }
)

// ── Start ──────────────────────────────────────────────────────
const transport = new StdioServerTransport()
await server.connect(transport)
console.error(`git-vertex-mcp v${VERSION} ready (stdio)`)
