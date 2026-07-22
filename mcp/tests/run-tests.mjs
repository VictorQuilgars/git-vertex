// Automated test harness for git-vertex-mcp (stdio JSON-RPC via the official SDK client).
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { CreateMessageRequestSchema } from '@modelcontextprotocol/sdk/types.js'
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

async function connect({ readOnly = false, env = {}, cwd = NOTAREPO, sampling = false } = {}) {
  const transport = new StdioClientTransport({
    command: 'node',
    args: readOnly ? [SERVER, '--read-only'] : [SERVER],
    cwd,
    // LC_ALL=C by default: the server's message parsing assumes English git
    // output (see the dedicated locale tests at the end).
    env: { ...process.env, LC_ALL: 'C', LANG: 'C', ...env },
    stderr: 'ignore',
  })
  const client = new Client(
    { name: 'gv-mcp-test', version: '1.0.0' },
    { capabilities: sampling ? { sampling: {} } : {} }
  )
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

// ── tools/list ──
{
  const { tools } = await c1.listTools()
  const names = tools.map((t) => t.name).sort()
  const expected = ['abort_operation', 'continue_operation', 'find_lost_work', 'generate_commit_message', 'git_bisect', 'git_blame', 'git_branches', 'git_conflicts', 'git_diff', 'git_log', 'git_pickaxe', 'git_show', 'git_status', 'open_in_git_vertex', 'predict_conflicts', 'propose_commit', 'propose_rebase_plan', 'resolve_conflict']
  const missing = expected.filter((n) => !names.includes(n))
  const extra = names.filter((n) => !expected.includes(n))
  record('tools/list exposes the 18 expected tools', 'tools/list', missing.length === 0 && extra.length === 0,
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
  let culprit = ''
  let steps = 0
  for (; steps < 10; steps++) {
    const bad = fs.existsSync(path.join(bi, 'bug.txt'))
    const res = await c1.callTool({ name: 'git_bisect', arguments: { repo: bi, action: bad ? 'bad' : 'good' } })
    const txt = (res.content ?? []).map((c) => c.text).join('\n')
    if (/first bad commit/.test(txt)) { culprit = txt; break }
    if (res.isError) { culprit = 'ERROR: ' + txt; break }
  }
  record('git_bisect: loop converges on "commit 10"', 'git_bisect',
    /first bad commit/.test(culprit) && /commit 10/.test(culprit),
    /commit 10/.test(culprit) ? [] : ['culprit not commit 10'], culprit)
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

// ── summary ──
const pass = results.filter((r) => r.ok).length
const fail = results.length - pass
console.log(`\n══ ${results.length} tests — ${pass} pass, ${fail} fail ══`)
fs.writeFileSync(path.join(HERE, 'results.json'), JSON.stringify(results, null, 2))
fs.rmSync(NOTAREPO, { recursive: true, force: true })
process.exit(fail ? 1 : 0)
