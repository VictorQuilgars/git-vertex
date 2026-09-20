// Every read the panel makes, actually made — against a running host.
//
//   npm run ext:drive -- --demo --scenario scripts/scenarios/host-answers.js
//   npm run app:drive -- --demo --scenario scripts/scenarios/host-answers.js
//
// `hostParity.test.ts` reads the preload and the extension's sources and says
// which `window.gitAPI` methods the panel could not answer. It is a static
// check, and it can only see a method that is MISSING. CLAUDE.md names the
// worse case out loud: "A method that exists on both sides with a poorer
// signature is the worse case — it succeeds while doing something else." A
// host that answers `not-implemented: x` at runtime passes that test too,
// because the method is there to be found.
//
// So this calls them. Reads only — nothing here writes to the repository —
// and the answer is checked for the two shapes of failure the host can give:
// the `not-implemented` envelope, and a throw.
'use strict'

/**
 * The reads the panel makes on any ordinary screen, with arguments that are
 * safe on any repository. Each is `[method, ...args]`.
 *
 * Deliberately hand-written rather than scraped from the preload: a scraper
 * would have to invent arguments, and inventing them for `deleteBranch` is
 * how a harness deletes somebody's branch.
 */
const READS = [
  ['getBranches'],
  ['getLog', { maxCount: 20 }],
  ['getStatus'],
  ['getWorkingChanges'],
  ['getStashes'],
  ['getTags'],
  ['getRemotes'],
  ['getDefaultRemote'],
  ['getSubmodules'],
  ['listWorktrees'],
  ['listWorktrees', { facts: true }],
  ['getReflog'],
  ['getContributors', 5],
  ['getTracking'],
  ['getConflictMode'],
  ['getConflictedFiles'],
  ['resolveCommit', 'HEAD'],
  ['getCommitFiles', 'HEAD'],
  ['getDiff', 'HEAD'],
  ['getDefaultBranch'],
  ['getGoneBranches'],
  ['listRemoteBranches'],
  ['listFixups', 'HEAD'],
  ['settingsGetAll'],
]

module.exports = async function hostAnswers(ctx) {
  const frame = ctx.panel ?? ctx.page

  const results = await frame.eval(`(async () => {
    const reads = ${JSON.stringify(READS)}
    const out = []
    for (const [method, ...args] of reads) {
      if (typeof window.gitAPI?.[method] !== 'function') { out.push({ method, verdict: 'absent' }); continue }
      try {
        const r = await window.gitAPI[method](...args)
        const error = r && typeof r === 'object' ? String(r.error ?? '') : ''
        out.push({
          method,
          verdict: /not-implemented/.test(error) ? 'not-implemented' : 'ok',
          shape: r === undefined ? 'undefined' : Array.isArray(r) ? 'array' : typeof r,
          error: error || undefined,
        })
      } catch (e) {
        out.push({ method, verdict: 'threw', error: String(e && e.message || e) })
      }
    }
    return JSON.stringify(out)
  })()`)

  const parsed = JSON.parse(results)
  const width = Math.max(...parsed.map(r => r.method.length))
  const bad = parsed.filter(r => r.verdict !== 'ok')
  console.log('')
  for (const r of parsed) {
    const mark = r.verdict === 'ok' ? '·' : '✗'
    console.log(`  ${mark} ${r.method.padEnd(width)}  ${r.verdict}${r.error ? `  — ${r.error.slice(0, 70)}` : ''}`)
  }
  console.log('')

  if (bad.length) {
    console.error(`✗ ${bad.length} of ${parsed.length} reads did not answer: ${bad.map(r => r.method).join(', ')}`)
    process.exitCode = 1
  } else {
    console.log(`✓ ${parsed.length} reads, every one answered by the host`)
  }
}
