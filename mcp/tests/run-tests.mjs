// Automated test harness for git-vertex-mcp (stdio JSON-RPC via the official SDK client).
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { CreateMessageRequestSchema, ElicitRequestSchema, ResourceUpdatedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIX = path.join(HERE, 'fixtures')
const SERVER = path.resolve(HERE, '..', 'bin', 'gv-mcp.mjs')
const R = (name) => path.join(FIX, name)
// Fixtures live inside the git-vertex repo, so a plain directory there still
// resolves to the enclosing repo (git walks up). Non-repo tests need a
// directory outside any repository.
const NOTAREPO = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-notarepo-'))

const results = []
let samplingRequestSeen = null

function record(name, tool, ok, fails, excerpt) {
  results.push({ name, tool, ok, fails, excerpt: excerpt.slice(0, 500) })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${fails.length ? '  → ' + fails.join(' | ') : ''}`)
}

async function t(client, name, tool, args, { expect = [], reject = [], isError = false, expectThrow = false } = {}) {
  try {
    const res = await client.callTool({ name: tool, arguments: args })
    if (expectThrow) return record(name, tool, false, ['expected protocol error, got a result'], '')
    const txt = (res.content ?? []).map((c) => c.text ?? '').join('\n')
    const gotErr = !!res.isError
    const fails = []
    if (gotErr !== isError) fails.push(`isError=${gotErr} (expected ${isError})`)
    for (const e of expect) {
      const hit = e instanceof RegExp ? e.test(txt) : txt.includes(e)
      if (!hit) fails.push(`missing: ${e}`)
    }
    for (const r of reject) {
      const hit = r instanceof RegExp ? r.test(txt) : txt.includes(r)
      if (hit) fails.push(`unexpected: ${r}`)
    }
    record(name, tool, fails.length === 0, fails, txt)
    return txt
  } catch (err) {
    if (expectThrow) return record(name, tool, true, [], String(err.message ?? err))
    record(name, tool, false, [`threw: ${err.message}`], '')
    return ''
  }
}

// `elicit`, when given, is the simulated user: it receives each elicitation
// request's params and returns the client's answer ({ action, content }).
async function connect({ readOnly = false, env = {}, cwd = NOTAREPO, sampling = false, elicit = null, args = [] } = {}) {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [SERVER, ...(readOnly ? ['--read-only'] : []), ...args],
    cwd,
    // LC_ALL=C by default: the server's message parsing assumes English git
    // output (see the dedicated locale tests at the end).
    env: { ...process.env, LC_ALL: 'C', LANG: 'C', ...env },
    stderr: 'ignore',
  })
  const client = new Client(
    { name: 'gv-mcp-test', version: '1.0.0' },
    { capabilities: { ...(sampling ? { sampling: {} } : {}), ...(elicit ? { elicitation: {} } : {}) } }
  )
  if (elicit) client.setRequestHandler(ElicitRequestSchema, async (req) => elicit(req.params))
  if (sampling) {
    client.setRequestHandler(CreateMessageRequestSchema, async (req) => {
      samplingRequestSeen = req.params.messages?.[0]?.content?.text ?? ''
      return {
        model: 'test-model',
        role: 'assistant',
        content: { type: 'text', text: 'feat(core): add staged test files' },
      }
    })
  }
  await client.connect(transport)
  return client
}

// ════════════════════════════════════════════════════════════════
const main = R('main')
const c1 = await connect()

// ── serverInfo ──
// The version the server announces to every client was a hand-kept constant and
// it drifted: it said 0.4.0 while the package was 0.5.2, for three releases.
// It now comes from package.json, and this test is what keeps it honest.
{
  const pkg = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'package.json'), 'utf8'))
  const info = c1.getServerVersion()
  record('serverInfo advertises the package version', 'initialize',
    info?.version === pkg.version,
    info?.version === pkg.version ? [] : [`advertised ${info?.version}, package is ${pkg.version}`],
    JSON.stringify(info))
}

// ── tools/list ──
{
  const { tools } = await c1.listTools()
  const names = tools.map((t) => t.name).sort()
  const expected = ['abort_operation', 'continue_operation', 'find_lost_work', 'generate_commit_message', 'git_bisect', 'git_blame', 'git_branches', 'git_conflicts', 'git_diff', 'git_log', 'git_pickaxe', 'git_show', 'git_status', 'open_in_git_vertex', 'predict_conflicts', 'propose_commit', 'propose_rebase_plan', 'propose_split', 'resolve_conflict']
  const missing = expected.filter((n) => !names.includes(n))
  const extra = names.filter((n) => !expected.includes(n))
  record('tools/list exposes the 19 expected tools', 'tools/list', missing.length === 0 && extra.length === 0,
    [...missing.map((m) => `missing ${m}`), ...extra.map((e) => `extra ${e}`)], names.join(', '))
}

// ── git_status ──
await t(c1, 'git_status: full working-tree state', 'git_status', { repo: main }, {
  expect: ['branch: main', 'staged (2)', 'staged-file.txt', 'big.txt', 'untracked (1): untracked.txt', /modified \(1\): README.md/, 'conflicted (0)'],
})
await t(c1, 'git_status: non-repo path → error', 'git_status', { repo: NOTAREPO }, {
  isError: true, expect: ['Not a git repository'],
})
await t(c1, 'git_status: no repo arg, cwd not a repo → error', 'git_status', {}, {
  isError: true, expect: ['Not a git repository'],
})

// ── git_log ──
await t(c1, 'git_log: default returns history with refs', 'git_log', { repo: main }, {
  expect: ['Initial commit', 'feat: add computeTotal', 'tag: v1.0', 'feature-conflict', 'Alice Dev', 'Bob Reviewer'],
})
await t(c1, 'git_log: maxCount=2 limits output', 'git_log', { repo: main, maxCount: 2, all: false }, {
  expect: ['chore: change shared (main)'], reject: ['Initial commit'],
})
await t(c1, 'git_log: author filter', 'git_log', { repo: main, author: 'Bob' }, {
  expect: ['docs: update README'], reject: ['Initial commit'],
})
await t(c1, 'git_log: path filter', 'git_log', { repo: main, path: 'src/app.js' }, {
  expect: ['feat: add computeTotal', 'refactor: drop computeTotal'], reject: ['docs: update README'],
})
await t(c1, 'git_log: since filter', 'git_log', { repo: main, since: '2026-06-15' }, {
  expect: ['refactor: drop computeTotal'], reject: ['Initial commit'],
})
await t(c1, 'git_log: author starting with "-" rejected (safeArg)', 'git_log', { repo: main, author: '--all' }, {
  isError: true, expect: ['must not start with "-"'],
})
await t(c1, 'git_log: maxCount=0 rejected by schema', 'git_log', { repo: main, maxCount: 0 }, {
  isError: true, expect: ['Input validation error'],
})

// ── git_branches ──
await t(c1, 'git_branches: lists branches, marks current', 'git_branches', { repo: main }, {
  expect: ['* main', 'feature-clean', 'feature-conflict'],
})

// ── git_diff ──
await t(c1, 'git_diff: unstaged (default)', 'git_diff', { repo: main }, {
  expect: ['README.md', 'unstaged edit'],
})
await t(c1, 'git_diff: staged + truncation at 24k', 'git_diff', { repo: main, target: 'staged' }, {
  expect: ['big.txt', 'truncated at 24000 chars'],
})
await t(c1, 'git_diff: ref range a..b', 'git_diff', { repo: main, target: 'main..feature-conflict' }, {
  expect: ['shared.txt', 'shared FEATURE'],
})
await t(c1, 'git_diff: statOnly', 'git_diff', { repo: main, target: 'v1.0..main', statOnly: true }, {
  expect: [/README.md\s*\|/], reject: ['@@'],
})
await t(c1, 'git_diff: path limit', 'git_diff', { repo: main, target: 'v1.0..main', path: 'shared.txt' }, {
  expect: ['shared.txt'], reject: ['README.md'],
})
await t(c1, 'git_diff: target starting with "-" rejected', 'git_diff', { repo: main, target: '--help' }, {
  isError: true, expect: ['must not start with "-"'],
})

// ── git_show ──
await t(c1, 'git_show: stats only by default', 'git_show', { repo: main, ref: 'v1.0' }, {
  expect: ['feat: add computeTotal', 'author: Alice Dev <alice@test.local>', 'files (+/-)', 'src/app.js'], reject: ['diff --git'],
})
await t(c1, 'git_show: with patch', 'git_show', { repo: main, ref: 'HEAD', patch: true }, {
  expect: ['chore: change shared (main)', 'diff --git', 'shared MAIN'],
})
await t(c1, 'git_show: unknown ref → error', 'git_show', { repo: main, ref: 'nope-branch' }, { isError: true })
await t(c1, 'git_show: ref starting with "-" rejected', 'git_show', { repo: main, ref: '--help' }, {
  isError: true, expect: ['must not start with "-"'],
})

// ── git_blame ──
await t(c1, 'git_blame: whole file, both authors', 'git_blame', { repo: main, path: 'README.md' }, {
  expect: ['Alice Dev', 'Bob Reviewer'],
})
await t(c1, 'git_blame: line range 2-2 → Bob only', 'git_blame', { repo: main, path: 'README.md', startLine: 2, endLine: 2 }, {
  expect: ['Bob Reviewer'], reject: ['Alice Dev'],
})
await t(c1, 'git_blame: missing file → error', 'git_blame', { repo: main, path: 'ghost.txt' }, { isError: true })
await t(c1, 'git_blame: path starting with "-" rejected', 'git_blame', { repo: main, path: '--help' }, {
  isError: true, expect: ['must not start with "-"'],
})

// ── predict_conflicts ──
await t(c1, 'predict_conflicts: clean branch → no conflicts', 'predict_conflicts', { repo: main, theirs: 'feature-clean' }, {
  expect: ['No conflicts predicted'],
})
await t(c1, 'predict_conflicts: conflicting branch → files listed, dry-run', 'predict_conflicts', { repo: main, theirs: 'feature-conflict' }, {
  expect: ['CONFLICTS predicted', 'shared.txt', 'dry run'],
})
await t(c1, 'predict_conflicts: explicit ours (only one side touched shared.txt → clean)', 'predict_conflicts', { repo: main, theirs: 'feature-conflict', ours: 'feature-clean' }, {
  expect: ['No conflicts predicted: merging feature-conflict into feature-clean'],
})
await t(c1, 'predict_conflicts: bad ref → clear error', 'predict_conflicts', { repo: main, theirs: 'ghost' }, { isError: true })

// ── git_pickaxe ──
await t(c1, 'git_pickaxe: literal finds add+remove commits', 'git_pickaxe', { repo: main, term: 'computeTotal' }, {
  expect: ['feat: add computeTotal', 'refactor: drop computeTotal'], reject: ['docs: update README'],
})
await t(c1, 'git_pickaxe: regex mode', 'git_pickaxe', { repo: main, term: 'compute.*items', mode: 'regex' }, {
  expect: ['feat: add computeTotal'],
})
await t(c1, 'git_pickaxe: path limit', 'git_pickaxe', { repo: main, term: 'computeTotal', path: 'src' }, {
  expect: ['feat: add computeTotal'],
})
await t(c1, 'git_pickaxe: no match → friendly message', 'git_pickaxe', { repo: main, term: 'zzz_not_here' }, {
  expect: ['no commit adds or removes'],
})

// ── find_lost_work ──
await t(c1, 'find_lost_work: reflog + dangling WIP commit', 'find_lost_work', { repo: main }, {
  expect: ['HEAD reflog', 'dangling commit', 'WIP: lost work', 'git branch <name> <hash>'],
})
await t(c1, 'find_lost_work: clean repo → no dangling', 'find_lost_work', { repo: R('bisect') }, {
  expect: ['No dangling commits'],
})

// ── git_conflicts / resolve_conflict / continue_operation (merge) ──
const mc = R('merge-conflict')
await t(c1, 'git_conflicts: no operation → friendly message', 'git_conflicts', { repo: main }, {
  expect: ['No merge/rebase/cherry-pick/revert in progress'],
})
await t(c1, 'git_conflicts: merge detected, both sides labelled', 'git_conflicts', { repo: mc }, {
  expect: ['operation: merge', 'main: edit a and b', 'feature: edit a and b', 'conflicted files (2)', 'a.txt', 'b.txt'],
})
await t(c1, 'git_conflicts: file content with markers', 'git_conflicts', { repo: mc, file: 'a.txt' }, {
  expect: ['<<<<<<<', '>>>>>>>', 'alpha MAIN', 'alpha FEATURE'],
})
await t(c1, 'git_conflicts: non-conflicted file → NOTE', 'git_conflicts', { repo: mc, file: 'c.txt' }, {
  expect: ['not in the conflicted list'],
})
await t(c1, 'git_conflicts: path traversal rejected', 'git_conflicts', { repo: mc, file: '../main/README.md' }, {
  isError: true, expect: ['escapes the repository'],
})
await t(c1, 'resolve_conflict: non-conflicted file refused', 'resolve_conflict', { repo: mc, file: 'c.txt', content: 'gamma\n' }, {
  isError: true, expect: ['not currently conflicted'],
})
await t(c1, 'resolve_conflict: leftover markers refused', 'resolve_conflict', { repo: mc, file: 'a.txt', content: '<<<<<<< HEAD\nalpha MAIN\n=======\nalpha FEATURE\n>>>>>>> feature\n' }, {
  isError: true, expect: ['still contains conflict markers'],
})
await t(c1, 'continue_operation: refused while conflicts remain', 'continue_operation', { repo: mc }, {
  isError: true, expect: ['Still conflicted'],
})
await t(c1, 'resolve_conflict: a.txt resolved and staged', 'resolve_conflict', { repo: mc, file: 'a.txt', content: 'alpha MERGED\n' }, {
  expect: ['Resolved and staged a.txt', 'Remaining conflicted files: b.txt'],
})
await t(c1, 'resolve_conflict: b.txt resolved → ready to continue', 'resolve_conflict', { repo: mc, file: 'b.txt', content: 'beta MERGED\n' }, {
  expect: ['Resolved and staged b.txt', 'ready to continue'],
})
await t(c1, 'continue_operation: merge completes', 'continue_operation', { repo: mc }, {
  expect: ['merge continued'],
})
await t(c1, 'git_status: clean after merge continue', 'git_status', { repo: mc }, {
  expect: ['conflicted (0)', 'staged (0)'],
})
await t(c1, 'continue_operation: nothing in progress → error', 'continue_operation', { repo: mc }, {
  isError: true, expect: ['No operation in progress'],
})
await t(c1, 'abort_operation: nothing in progress → error', 'abort_operation', { repo: mc }, {
  isError: true, expect: ['No operation in progress'],
})

// ── rebase conflict + abort ──
const rc = R('rebase-conflict')
await t(c1, 'git_conflicts: rebase detected, topic replayed onto main', 'git_conflicts', { repo: rc }, {
  expect: ['operation: rebase', 'main: edit f', 'topic', 'f.txt'],
})
await t(c1, 'abort_operation: rebase aborted', 'abort_operation', { repo: rc }, {
  expect: ['rebase aborted'],
})
await t(c1, 'git_status: back on topic, clean after abort', 'git_status', { repo: rc }, {
  expect: ['branch: topic', 'conflicted (0)'],
})

// ── cherry-pick conflict + abort ──
const cc = R('cherry-conflict')
await t(c1, 'git_conflicts: cherry-pick detected', 'git_conflicts', { repo: cc }, {
  expect: ['operation: cherry-pick', 'side: edit f', 'f.txt'],
})
await t(c1, 'abort_operation: cherry-pick aborted', 'abort_operation', { repo: cc }, {
  expect: ['cherry-pick aborted'],
})

// ── git_bisect: full automated session ──
const bi = R('bisect')
await t(c1, 'git_bisect: start requires good', 'git_bisect', { repo: bi, action: 'start' }, {
  isError: true, expect: ['requires `good`'],
})
{
  const first = (await c1.callTool({ name: 'git_bisect', arguments: { repo: bi, action: 'start', good: (await import('node:child_process')).execSync('git -C ' + bi + ' rev-list --max-parents=0 HEAD').toString().trim() } }))
  const firstTxt = (first.content ?? []).map((c) => c.text).join('\n')
  record('git_bisect: start checks out midpoint', 'git_bisect', !first.isError && /currently checked out/.test(firstTxt), first.isError ? ['start failed'] : [], firstTxt)
  // Break on the tool's OWN line, not on git's. git says
  // `<sha> is the first 'bad' commit` — quoted, because the term is
  // configurable — so the /first bad commit/ this test used to look for never
  // matched: the loop ran all 10 iterations, `culprit` stayed empty and the
  // failure reported an empty excerpt. The tool now emits a stable
  // `first bad commit: <sha> — <subject>` line, which is what a client should
  // key on. See bisectCulprit() in src/index.ts.
  let culprit = ''
  let steps = 0
  for (; steps < 10; steps++) {
    const bad = fs.existsSync(path.join(bi, 'bug.txt'))
    const res = await c1.callTool({ name: 'git_bisect', arguments: { repo: bi, action: bad ? 'bad' : 'good' } })
    const txt = (res.content ?? []).map((c) => c.text).join('\n')
    if (/^first bad commit: /m.test(txt)) { culprit = txt; break }
    if (res.isError) { culprit = 'ERROR: ' + txt; break }
  }
  const announced = /^first bad commit: .*commit 10$/m.test(culprit)
  record('git_bisect: loop converges on "commit 10"', 'git_bisect',
    announced && steps < 10,
    announced ? [] : [culprit ? 'wrong culprit announced' : `never converged in ${steps} steps`], culprit)
  // A converged session must not also claim a "currently checked out" commit:
  // HEAD is still on the last commit TESTED (commit 9 here), and printing both
  // is how a caller blames the wrong one.
  record('git_bisect: converged output does not also point at HEAD', 'git_bisect',
    !/currently checked out/.test(culprit),
    /currently checked out/.test(culprit) ? ['announces the culprit AND a checked-out commit'] : [], culprit)
  await t(c1, 'git_bisect: log during session', 'git_bisect', { repo: bi, action: 'log' }, { expect: ['git bisect'] })
  await t(c1, 'git_bisect: reset restores HEAD', 'git_bisect', { repo: bi, action: 'reset' }, {})
  await t(c1, 'git_status: bisect repo back on main', 'git_status', { repo: bi }, { expect: ['branch: main'] })
}

// ── desktop-handoff tools: validation paths only (no app launch) ──
await t(c1, 'open_in_git_vertex: view=resolve without file → error', 'open_in_git_vertex', { repo: main, view: 'resolve' }, {
  isError: true, expect: ['requires `file`'],
})
await t(c1, 'open_in_git_vertex: view=commit without hash → error', 'open_in_git_vertex', { repo: main, view: 'commit' }, {
  isError: true, expect: ['requires `hash`'],
})
await t(c1, 'open_in_git_vertex: non-repo → error', 'open_in_git_vertex', { repo: NOTAREPO }, {
  isError: true, expect: ['Not a git repository'],
})
// The app matches the deep-link hash against SHAs, so an unresolvable revision
// has to fail here rather than open a view that silently selects nothing.
await t(c1, 'open_in_git_vertex: view=commit with unknown revision → error', 'open_in_git_vertex', { repo: main, view: 'commit', hash: 'v9.9-nope' }, {
  isError: true, expect: ['Unknown revision'],
})
await t(c1, 'propose_commit: file path traversal rejected', 'propose_commit', { repo: main, message: 'feat: x', files: ['../merge-conflict/a.txt'] }, {
  isError: true, expect: ['escapes the repository'],
})
await t(c1, 'propose_commit: empty message rejected by schema', 'propose_commit', { repo: main, message: '' }, {
  isError: true, expect: ['Input validation error'],
})
await t(c1, 'propose_rebase_plan: bad base ref → error', 'propose_rebase_plan', { repo: main, base: 'ghost', steps: [{ hash: 'abc1234', action: 'drop' }] }, { isError: true })
await t(c1, 'propose_rebase_plan: base=HEAD → empty range error', 'propose_rebase_plan', { repo: main, base: 'HEAD', steps: [{ hash: 'abc1234', action: 'drop' }] }, {
  isError: true, expect: ['No commits in HEAD..HEAD'],
})
await t(c1, 'propose_rebase_plan: step hash outside range → error', 'propose_rebase_plan', { repo: main, base: 'HEAD~2', steps: [{ hash: 'deadbeef', action: 'squash' }] }, {
  isError: true, expect: ['not in HEAD~2..HEAD'],
})
// propose_split refuses before it opens anything: a path it cannot place is
// something the agent can still fix, and the review screen should not have to.
await t(c1, 'propose_split: no commits rejected by schema', 'propose_split', { repo: main, commits: [] }, {
  isError: true, expect: ['Input validation error'],
})
await t(c1, 'propose_split: blank message rejected by schema', 'propose_split', { repo: main, commits: [{ message: '   ', files: ['README.md'] }] }, {
  isError: true, expect: ['Input validation error'],
})
await t(c1, 'propose_split: a commit with no file rejected by schema', 'propose_split', { repo: main, commits: [{ message: 'docs: x', files: [] }] }, {
  isError: true, expect: ['Input validation error'],
})
await t(c1, 'propose_split: path traversal rejected', 'propose_split', { repo: main, commits: [{ message: 'feat: x', files: ['../merge-conflict/a.txt'] }] }, {
  isError: true, expect: ['escapes the repository'],
})
await t(c1, 'propose_split: a file with no uncommitted change → error naming it and the changed files', 'propose_split', { repo: main, commits: [{ message: 'chore: x', files: ['shared.txt', 'README.md'] }] }, {
  isError: true, expect: ['No uncommitted changes in: shared.txt', 'untracked.txt', 'staged-file.txt'],
})
await t(c1, 'propose_split: a file in two commits → error', 'propose_split', { repo: main, commits: [{ message: 'docs: a', files: ['README.md'] }, { message: 'docs: b', files: ['./README.md'] }] }, {
  isError: true, expect: ['only one commit', 'README.md (commits 1 and 2)'],
})
await t(c1, 'propose_split: clean working tree → error', 'propose_split', { repo: bi, commits: [{ message: 'chore: x', files: ['log.txt'] }] }, {
  isError: true, expect: ['Nothing uncommitted to split'],
})

// ── generate_commit_message ──
await t(c1, 'generate_commit_message: no sampling → diff fallback', 'generate_commit_message', { repo: main }, {
  expect: ['does not support sampling', 'staged-file.txt', 'diff --git'],
})
await t(c1, 'generate_commit_message: nothing staged → error', 'generate_commit_message', { repo: bi }, {
  isError: true, expect: ['Nothing staged'],
})
await c1.close()

// ── sampling-capable client ──
const c2 = await connect({ sampling: true })
await t(c2, 'generate_commit_message: sampling path returns model message', 'generate_commit_message', { repo: main }, {
  expect: ['feat(core): add staged test files'], reject: ['does not support sampling'],
})
record('generate_commit_message: sampling prompt contains rules + diff', 'sampling',
  !!samplingRequestSeen && samplingRequestSeen.includes('Write a git commit message') && samplingRequestSeen.includes('big.txt'),
  [], (samplingRequestSeen ?? '(no request seen)').slice(0, 300))
await c2.close()

// ── GV_REPO default ──
const c3 = await connect({ env: { GV_REPO: main }, cwd: HERE })
await t(c3, 'GV_REPO: tools default to $GV_REPO when no repo arg', 'git_status', {}, {
  expect: ['branch: main', 'fixtures/main'],
})
await c3.close()

// ── read-only mode ──
const c4 = await connect({ readOnly: true })
{
  const { tools } = await c4.listTools()
  const desc = Object.fromEntries(tools.map((t) => [t.name, t.description]))
  record('read-only: mutating tool descriptions say DISABLED', 'tools/list',
    ['resolve_conflict', 'continue_operation', 'abort_operation', 'git_bisect'].every((n) => desc[n]?.startsWith('DISABLED')),
    [], desc.resolve_conflict ?? '')
}
await t(c4, 'read-only: git_status still works', 'git_status', { repo: main }, { expect: ['branch: main'] })
await t(c4, 'read-only: resolve_conflict blocked', 'resolve_conflict', { repo: main, file: 'x', content: 'y' }, {
  isError: true, expect: ['--read-only'],
})
await t(c4, 'read-only: continue_operation blocked', 'continue_operation', { repo: main }, {
  isError: true, expect: ['--read-only'],
})
await t(c4, 'read-only: abort_operation blocked', 'abort_operation', { repo: main }, {
  isError: true, expect: ['--read-only'],
})
await t(c4, 'read-only: git_bisect start blocked, log allowed', 'git_bisect', { repo: main, action: 'start', good: 'HEAD~1' }, {
  isError: true, expect: ['--read-only'],
})
await c4.close()

// ── locale independence (server started under a French git locale) ──
// The server forces LC_ALL=C internally, so its output stays English even when
// the ambient locale is French — the environment where the bug used to bite.
// These are regression guards for that fix: run them under fr, expect English.
const c5 = await connect({ env: { LC_ALL: 'fr_FR.UTF-8', LANG: 'fr_FR.UTF-8' } })
await t(c5, 'locale fr: non-repo error is the clean English "Not a git repository"', 'git_status', { repo: NOTAREPO }, {
  isError: true, expect: ['Not a git repository'],
})
await t(c5, 'locale fr: find_lost_work still finds dangling commits (fsck output forced to English)', 'find_lost_work', { repo: main }, {
  expect: [/dangling commits \(\d/, 'WIP: lost work'], reject: ['No dangling commits'],
})
await c5.close()

// ── propose_split: what actually reaches the app ──
// The handoff is a gitgui:// URL given to the OS opener. A stand-in `open` /
// `xdg-open` first on the server's PATH records the URL instead of launching
// anything, so the test reads the very deep link and proposal file the app
// would — and can check that nothing in the repository moved.
{
  const openerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-opener-'))
  const opened = path.join(openerDir, 'opened.log')
  for (const name of ['open', 'xdg-open']) {
    fs.writeFileSync(path.join(openerDir, name), `#!/bin/sh\nprintf '%s\\n' "$1" >> "${opened}"\n`, { mode: 0o755 })
  }
  const c6 = await connect({ env: { PATH: `${openerDir}${path.delimiter}${process.env.PATH}` } })
  const { execFileSync } = await import('node:child_process')
  const state = () => execFileSync('git', ['-C', main, 'status', '--porcelain'], { encoding: 'utf8' })
  const before = state()

  const out = await t(c6, 'propose_split: opens the composer and reports the files left out', 'propose_split', {
    // A subdirectory as `repo`: paths are still the repository's, from its root.
    repo: path.join(main, 'src'),
    commits: [
      { message: 'feat: add the staged file and its data', files: ['staged-file.txt', 'big.txt', 'big.txt'] },
      { message: 'docs: extend the README', files: ['./README.md'] },
    ],
  }, {
    expect: ['2-commit split preloaded (3 file(s))', '1 changed file(s) are in no commit', 'untracked.txt', 'Nothing was staged or committed'],
  })

  const urls = fs.existsSync(opened) ? fs.readFileSync(opened, 'utf8').trim().split('\n').filter(Boolean) : []
  const url = urls.length === 1 ? new URL(urls[0]) : null
  const q = url?.searchParams
  record('propose_split: one gitgui://open deep link, view=propose-split, on the repository root', 'propose_split',
    !!url && url.protocol === 'gitgui:' && q.get('view') === 'propose-split' && q.get('repo') === fs.realpathSync(main) && !!q.get('proposal'),
    url ? [] : [`opener saw ${urls.length} URL(s)`], urls.join('\n') || out)

  const proposalPath = q?.get('proposal') ?? ''
  let payload = null
  try { payload = JSON.parse(fs.readFileSync(proposalPath, 'utf8')) } catch { /* reported below */ }
  const expectedPayload = {
    kind: 'split',
    commits: [
      // Duplicates collapse, and "./README.md" is the README git reports.
      { message: 'feat: add the staged file and its data', files: ['staged-file.txt', 'big.txt'] },
      { message: 'docs: extend the README', files: ['README.md'] },
    ],
  }
  record('propose_split: the proposal file is the app\'s payload, in the proposals directory', 'propose_split',
    JSON.stringify(payload) === JSON.stringify(expectedPayload)
      && path.dirname(proposalPath) === path.join(os.tmpdir(), 'git-vertex-mcp-proposals'),
    [], JSON.stringify(payload) + ' @ ' + proposalPath)

  const after = state()
  record('propose_split: nothing staged, unstaged or committed by the call', 'propose_split',
    before === after, before === after ? [] : ['git status changed'], after)

  if (proposalPath) fs.rmSync(proposalPath, { force: true })
  fs.rmSync(openerDir, { recursive: true, force: true })
  await c6.close()
}

// ── resources ──
// Read from the default repository ($GV_REPO), since a resource URI carries
// no arguments. The same text as the matching tools.
const RESOURCE_URIS = ['git://diff/staged', 'git://log', 'git://status']
const c6 = await connect({ env: { GV_REPO: main } })
{
  const caps = c6.getServerCapabilities()
  record('resources: server advertises resources with subscribe', 'initialize',
    !!caps?.resources?.subscribe, caps?.resources?.subscribe ? [] : ['resources.subscribe missing'], JSON.stringify(caps?.resources))
  const { resources } = await c6.listResources()
  const uris = resources.map((r) => r.uri).sort()
  record('resources/list exposes git://status, git://log, git://diff/staged', 'resources/list',
    JSON.stringify(uris) === JSON.stringify(RESOURCE_URIS), [], uris.join(', '))
  record('resources/list: each resource has a mime type and a description', 'resources/list',
    resources.every((r) => r.mimeType && r.description), [], JSON.stringify(resources).slice(0, 300))
}
async function readRes(client, name, uri, { expect = [], reject = [], throws = false } = {}) {
  try {
    const res = await client.readResource({ uri })
    if (throws) return record(name, 'resources/read', false, ['expected an error, got contents'], '')
    const txt = res.contents.map((c) => c.text ?? '').join('\n')
    const fails = []
    if (res.contents[0]?.uri !== uri) fails.push(`contents uri ${res.contents[0]?.uri}`)
    for (const e of expect) if (!(e instanceof RegExp ? e.test(txt) : txt.includes(e))) fails.push(`missing: ${e}`)
    for (const r of reject) if (r instanceof RegExp ? r.test(txt) : txt.includes(r)) fails.push(`unexpected: ${r}`)
    record(name, 'resources/read', fails.length === 0, fails, txt)
  } catch (err) {
    record(name, 'resources/read', throws, throws ? [] : [`threw: ${err.message}`], String(err.message ?? err))
  }
}
await readRes(c6, 'resources/read git://status: same text as git_status', 'git://status', {
  expect: ['branch: main', 'staged (2)', 'staged-file.txt', 'untracked (1): untracked.txt', 'fixtures/main'],
})
await readRes(c6, 'resources/read git://log: history with refs', 'git://log', {
  expect: ['Initial commit', 'tag: v1.0', 'feature-conflict', 'Bob Reviewer'],
})
await readRes(c6, 'resources/read git://diff/staged: the staged patch, truncated', 'git://diff/staged', {
  expect: ['diff --git a/big.txt', 'truncated at 24000 chars'], reject: ['unstaged edit'],
})
await readRes(c6, 'resources/read: unknown URI → error', 'git://nope', { throws: true })
await c6.close()
{
  // No $GV_REPO and a working directory outside any repository: the read
  // fails with the tools' clean message rather than an empty status.
  const c7 = await connect()
  await readRes(c7, 'resources/read: default repo not a repository → error', 'git://status', { throws: true })
  await c7.close()
}

// ── resource subscriptions ──
{
  const watch = R('watch')
  const updates = []
  const c8 = await connect({ env: { GV_REPO: watch, GV_MCP_RESOURCE_POLL_MS: '100' } })
  c8.setNotificationHandler(ResourceUpdatedNotificationSchema, (n) => { updates.push(n.params.uri) })
  const waitFor = async (pred, ms) => {
    const end = Date.now() + ms
    while (Date.now() < end) { if (pred()) return true; await new Promise((r) => setTimeout(r, 50)) }
    return pred()
  }
  await c8.subscribeResource({ uri: 'git://status' })
  // The baseline is taken at subscribe time: nothing has changed yet, so
  // nothing may be announced.
  await new Promise((r) => setTimeout(r, 400))
  record('subscribe: no notification while nothing changes', 'resources/subscribe', updates.length === 0, updates.length ? [`got ${updates.join(', ')}`] : [], '')
  fs.writeFileSync(path.join(watch, 'new-file.txt'), 'appeared\n')
  const got = await waitFor(() => updates.includes('git://status'), 5000)
  record('subscribe: git://status notified when the working tree changes', 'resources/subscribe', got, got ? [] : ['no resources/updated within 5 s'], updates.join(', '))
  const txt = (await c8.readResource({ uri: 'git://status' })).contents[0].text
  record('subscribe: the re-read status shows the change', 'resources/read', txt.includes('new-file.txt'), [], txt)
  record('subscribe: an unsubscribed resource is not notified', 'resources/subscribe', !updates.includes('git://log'), [], updates.join(', '))
  await c8.unsubscribeResource({ uri: 'git://status' })
  const before = updates.length
  fs.writeFileSync(path.join(watch, 'another.txt'), 'again\n')
  await new Promise((r) => setTimeout(r, 600))
  record('unsubscribe: no more notifications', 'resources/unsubscribe', updates.length === before, updates.length === before ? [] : ['notified after unsubscribe'], '')
  let threw = ''
  try { await c8.subscribeResource({ uri: 'git://nope' }) } catch (err) { threw = String(err.message ?? err) }
  record('subscribe: unknown URI → error', 'resources/subscribe', /Unknown resource/.test(threw), [], threw)
  await c8.close()
}

// ── prompts ──
const c9 = await connect()
{
  const { prompts } = await c9.listPrompts()
  const names = prompts.map((p) => p.name).sort()
  record('prompts/list exposes review-branch, release-notes, explain-commit', 'prompts/list',
    JSON.stringify(names) === JSON.stringify(['explain-commit', 'release-notes', 'review-branch']), [], names.join(', '))
  const explain = prompts.find((p) => p.name === 'explain-commit')
  const refArg = explain?.arguments?.find((a) => a.name === 'ref')
  record('prompts/list: explain-commit requires `ref`, repo optional', 'prompts/list',
    refArg?.required === true && explain.arguments.some((a) => a.name === 'repo' && !a.required), [], JSON.stringify(explain?.arguments))
}
async function prompt(client, name, promptName, args, { expect = [], reject = [], throws = false } = {}) {
  try {
    const res = await client.getPrompt({ name: promptName, arguments: args })
    if (throws) return record(name, 'prompts/get', false, ['expected an error, got a prompt'], '')
    const txt = res.messages.map((m) => m.content?.text ?? '').join('\n')
    const fails = []
    if (res.messages[0]?.role !== 'user') fails.push(`role ${res.messages[0]?.role}`)
    for (const e of expect) if (!(e instanceof RegExp ? e.test(txt) : txt.includes(e))) fails.push(`missing: ${e}`)
    for (const r of reject) if (r instanceof RegExp ? r.test(txt) : txt.includes(r)) fails.push(`unexpected: ${r}`)
    record(name, 'prompts/get', fails.length === 0, fails, txt)
  } catch (err) {
    record(name, 'prompts/get', throws, throws ? [] : [`threw: ${err.message}`], String(err.message ?? err))
  }
}
await prompt(c9, 'prompts/get explain-commit: message, stats and patch of the commit', 'explain-commit', { repo: main, ref: 'v1.0' }, {
  expect: ['Explain the commit `v1.0`', 'feat: add computeTotal', 'author: Alice Dev', 'src/app.js', 'diff --git', '+function computeTotal'],
})
await prompt(c9, 'prompts/get explain-commit: unknown ref → error', 'explain-commit', { repo: main, ref: 'ghost-ref' }, { throws: true })
await prompt(c9, 'prompts/get explain-commit: ref starting with "-" rejected', 'explain-commit', { repo: main, ref: '--help' }, { throws: true })
await prompt(c9, 'prompts/get explain-commit: missing ref → error', 'explain-commit', { repo: main }, { throws: true })
// No origin in the fixture: the base falls back to main. Three dots: main's own
// later commit ("chore: change shared (main)") is not part of the review.
await prompt(c9, 'prompts/get review-branch: commits and diff of the branch against main', 'review-branch', { repo: main, branch: 'feature-conflict' }, {
  expect: ['`feature-conflict` against `main`', 'feat: change shared (feature)', 'shared.txt', '+shared FEATURE'],
  reject: ['chore: change shared (main)', '+shared MAIN'],
})
await prompt(c9, 'prompts/get review-branch: explicit base', 'review-branch', { repo: main, branch: 'feature-clean', base: 'v1.0' }, {
  expect: ['against `v1.0`', 'feat: clean feature file', 'docs: update README'],
})
await prompt(c9, 'prompts/get review-branch: current branch vs itself → nothing to review', 'review-branch', { repo: main }, { throws: true })
await prompt(c9, 'prompts/get release-notes: defaults to the range since the latest tag', 'release-notes', { repo: main }, {
  expect: ['`v1.0..HEAD`', 'docs: update README', 'refactor: drop computeTotal', 'chore: change shared (main)'],
  reject: ['Initial commit', 'feat: add computeTotal'],
})
await prompt(c9, 'prompts/get release-notes: at the tag itself, the notes lead up to it', 'release-notes', { repo: main, to: 'v1.0' }, {
  expect: ['no earlier tag', 'feat: add computeTotal', 'Initial commit'],
})
await prompt(c9, 'prompts/get release-notes: explicit from/to', 'release-notes', { repo: main, from: 'v1.0', to: 'HEAD~1' }, {
  expect: ['`v1.0..HEAD~1`', 'refactor: drop computeTotal'], reject: ['chore: change shared (main)'],
})
await c9.close()

// ── elicitation: the user confirms writes through the client ──
// The tests without elicitation above (c1 resolving, continuing and aborting
// directly) are the fallback: a client that does not declare the capability is
// never asked, and the tools behave as they always have.
{
  const em = R('elicit-merge')
  const asked = []
  let answer = { action: 'decline' }
  const c10 = await connect({ elicit: (params) => { asked.push(params); return answer } })
  const markers = () => fs.readFileSync(path.join(em, 'a.txt'), 'utf8').includes('<<<<<<<')

  await t(c10, 'elicitation: resolve_conflict declined → nothing written', 'resolve_conflict', { repo: em, file: 'a.txt', content: 'alpha MERGED\n' }, {
    expect: ['did not confirm', 'a.txt was not written or staged'], reject: ['Resolved and staged'],
  })
  record('elicitation: the question names the file and previews the content', 'elicitation/create',
    asked.length === 1 && asked[0].message.includes('a.txt') && asked[0].message.includes('alpha MERGED') && !!asked[0].requestedSchema?.properties?.confirm,
    [], JSON.stringify(asked[0] ?? null).slice(0, 300))
  record('elicitation: declined leaves the conflict markers on disk', 'resolve_conflict', markers(), [], '')

  answer = { action: 'accept', content: { confirm: false } }
  await t(c10, 'elicitation: accepted without the tick → still not written', 'resolve_conflict', { repo: em, file: 'a.txt', content: 'alpha MERGED\n' }, {
    expect: ['did not confirm'],
  })
  record('elicitation: unticked accept leaves the conflict markers on disk', 'resolve_conflict', markers(), [], '')

  answer = { action: 'cancel' }
  await t(c10, 'elicitation: dismissed → not written', 'resolve_conflict', { repo: em, file: 'a.txt', content: 'alpha MERGED\n' }, {
    expect: ['did not confirm'],
  })

  answer = { action: 'accept', content: { confirm: true } }
  await t(c10, 'elicitation: confirmed → a.txt resolved and staged', 'resolve_conflict', { repo: em, file: 'a.txt', content: 'alpha MERGED\n' }, {
    expect: ['Resolved and staged a.txt'],
  })
  await t(c10, 'elicitation: confirmed → b.txt resolved and staged', 'resolve_conflict', { repo: em, file: 'b.txt', content: 'beta MERGED\n' }, {
    expect: ['Resolved and staged b.txt', 'ready to continue'],
  })
  // The guard-rails run BEFORE the question: a refused call never asks.
  const n = asked.length
  await t(c10, 'elicitation: a call the guard-rails refuse asks nothing', 'resolve_conflict', { repo: em, file: 'a.txt', content: 'x\n' }, {
    isError: true, expect: ['not currently conflicted'],
  })
  record('elicitation: no question for a refused call', 'elicitation/create', asked.length === n, [], '')

  answer = { action: 'decline' }
  await t(c10, 'elicitation: continue_operation declined → merge still in progress', 'continue_operation', { repo: em }, {
    expect: ['did not confirm', 'still in progress'], reject: ['merge continued'],
  })
  await t(c10, 'elicitation: after a declined continue, the merge is still there', 'git_conflicts', { repo: em }, {
    expect: ['operation: merge'],
  })
  answer = { action: 'accept', content: { confirm: true } }
  await t(c10, 'elicitation: continue_operation confirmed → merge completes', 'continue_operation', { repo: em }, {
    expect: ['merge continued'],
  })

  const ea = R('elicit-abort')
  answer = { action: 'decline' }
  await t(c10, 'elicitation: abort_operation declined → cherry-pick still in progress', 'abort_operation', { repo: ea }, {
    expect: ['did not confirm'], reject: ['aborted —'],
  })
  await t(c10, 'elicitation: after a declined abort, the conflict is still there', 'git_conflicts', { repo: ea }, {
    expect: ['operation: cherry-pick', 'f.txt'],
  })
  record('elicitation: the abort question says what is lost', 'elicitation/create',
    /thrown away/.test(asked.at(-1)?.message ?? ''), [], asked.at(-1)?.message ?? '')
  await c10.close()

  // A client that declares the capability and then fails to answer: the write
  // does not go ahead on a question nobody saw.
  const c11 = await connect({ elicit: () => { throw new Error('dialog crashed') } })
  await t(c11, 'elicitation: client fails to answer → error, nothing changed', 'abort_operation', { repo: ea }, {
    isError: true, expect: ['Could not ask the user to confirm', 'nothing was changed'],
  })
  await t(c11, 'elicitation: after a failed question, the conflict is still there', 'git_conflicts', { repo: ea }, {
    expect: ['operation: cherry-pick'],
  })
  await c11.close()

  // --no-elicitation: the client supports it, the user opted out — no question,
  // the tool acts as it does for a client without the capability.
  let askedWhenOff = 0
  const c12 = await connect({ args: ['--no-elicitation'], elicit: () => { askedWhenOff++; return { action: 'decline' } } })
  await t(c12, '--no-elicitation: abort_operation acts without asking', 'abort_operation', { repo: ea }, {
    expect: ['cherry-pick aborted'],
  })
  record('--no-elicitation: no question was sent', 'elicitation/create', askedWhenOff === 0, [], String(askedWhenOff))
  await c12.close()
}

// ── summary ──
const pass = results.filter((r) => r.ok).length
const fail = results.length - pass
console.log(`\n══ ${results.length} tests — ${pass} pass, ${fail} fail ══`)
fs.writeFileSync(path.join(HERE, 'results.json'), JSON.stringify(results, null, 2))
fs.rmSync(NOTAREPO, { recursive: true, force: true })
process.exit(fail ? 1 : 0)
