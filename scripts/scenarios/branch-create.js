// An action that WRITES: a branch made from the panel, found in the repository.
//
//   npm run ext:drive -- --demo --scenario scripts/scenarios/branch-create.js
//   npm run app:drive -- --demo --scenario scripts/scenarios/branch-create.js
//
// Every other check in this repository stops at the edge of git. jest asserts
// that a handler was called; `host-answers.js` asserts that a read answered.
// Neither would notice a host whose `createBranch` resolves `{ success: true }`
// and creates nothing — which is the failure CLAUDE.md warns about, a method
// that "succeeds while doing something else".
//
// So this one asks git afterwards. It writes into the throwaway repository the
// driver opened, never into anything of yours.
'use strict'
const { execFileSync } = require('child_process')
const { openView } = require('./lib/views')

const git = (repo, ...args) =>
  execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } }).trim()

module.exports = async function branchCreate(ctx) {
  const frame = ctx.panel ?? ctx.page
  const repo = ctx.repo
  if (!repo) throw new Error('this scenario needs the repository path')

  const name = `drive/made-${Date.now().toString(36)}`
  const before = git(repo, 'rev-parse', 'HEAD')
  const wasOn = git(repo, 'symbolic-ref', '--short', 'HEAD')

  // The rows this waits for are in the Branches view, which the panel does
  // not open on — and which a short panel keeps behind "More…".
  await openView(frame, 'Branches')
  await frame.until('document.querySelectorAll(".sb-branch-item").length > 0', { what: 'the branch rows' })

  // Through the host, the way the panel's own "Create a branch…" reaches it —
  // not through the UI: what is being checked is the host, and a prompt in the
  // way would make this a test of the dialog instead.
  const answer = await frame.eval(`(async () => {
    const r = await window.gitAPI.createBranch(${JSON.stringify(name)})
    return JSON.stringify(r ?? null)
  })()`)
  const result = JSON.parse(answer)

  if (!result || result.success !== true) {
    console.error(`✗ createBranch answered ${answer}`)
    process.exitCode = 1
    return
  }

  // git's own word for it, which is the only one that counts.
  const heads = git(repo, 'for-each-ref', '--format=%(refname:short)', 'refs/heads').split('\n')
  if (!heads.includes(name)) {
    console.error(`✗ createBranch said success and ${name} is not in the repository`)
    process.exitCode = 1
    return
  }
  const at = git(repo, 'rev-parse', name)
  if (at !== before) {
    console.error(`✗ ${name} is at ${at.slice(0, 7)}, not at the HEAD it was made from (${before.slice(0, 7)})`)
    process.exitCode = 1
    return
  }
  // `createBranch` is `checkout -b`: it makes the branch AND lands on it. The
  // scenario states that rather than discovering it each time — the first run
  // of this file failed on the cleanup, git refusing to delete a branch the
  // worktree was standing on.
  const now = git(repo, 'symbolic-ref', '--short', 'HEAD')
  if (now !== name) {
    console.error(`✗ createBranch left HEAD on ${now}, not on the branch it made`)
    process.exitCode = 1
  }

  // And the product knows about it: the watcher is what makes the side bar
  // agree with the repository, and a host that writes without telling anybody
  // leaves a panel that is quietly out of date.
  await frame.until(
    `[...document.querySelectorAll('.sb-branch-item')].some(r => (r.getAttribute('title') || '').includes(${JSON.stringify(name)}) || (r.textContent || '').includes('made-'))`,
    { what: `${name} on a row`, timeoutMs: 12000 })

  git(repo, 'checkout', '-q', wasOn)
  git(repo, 'branch', '-D', name)
  console.log(`✓ ${name} created from the panel, found by git at ${at.slice(0, 7)}, checked out, shown on a row — and cleaned up`)
}
