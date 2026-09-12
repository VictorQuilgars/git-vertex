// What the app costs to start, and to open a large repository.
//
// The audit is explicit that nothing should be optimised before it is measured
// (#198): a 2.9 MB bundle is a file size, not a slowness. This measures the
// four things that decide whether it matters — the time to first paint, the
// time from clicking a repository to a graph of 500 commits, the renderer's
// heap once it has settled, and what the build actually ships — on a
// repository with more history than anyone's laptop wants to draw.
//
//   node scripts/measure.js                 # 50,000 commits, three runs
//   node scripts/measure.js --commits 5000 --runs 1
//   node scripts/measure.js --build         # rebuild first
//
// It prints a markdown table, made to be pasted into the issue.
'use strict'
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { ROOT, ensureBuilt, makeProfile, launch, stopAndWait } = require('./e2e/lib/app.js')

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback
}
const COMMITS = flag('--commits', 50000)
const RUNS = flag('--runs', 3)

/**
 * A repository of N commits, written by fast-import in one process: fifty
 * thousand `git commit` calls would take an hour, one stream takes seconds.
 * Kept out of the e2e fixture on purpose — that one is about behaviour and its
 * hashes are pinned; this one is about size.
 */
function makeDeepRepo(commits) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-measure-'))
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, LC_ALL: 'C' } })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'measure@example.com')
  git('config', 'user.name', 'Measure')
  const data = s => `data ${Buffer.byteLength(s)}\n${s}\n`
  const chunks = []
  for (let i = 1; i <= commits; i++) {
    const when = Math.floor(Date.UTC(2020, 0, 1) / 1000) + i * 600
    chunks.push(`commit refs/heads/main\ncommitter Measure <measure@example.com> ${when} +0000\n${data(`commit ${i}`)}M 100644 inline notes.txt\n${data(`line ${i}`)}\n`)
  }
  execFileSync('git', ['fast-import', '--quiet'], { cwd: dir, input: chunks.join(''), stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1 << 28, env: { ...process.env, LC_ALL: 'C' } })
  git('reset', '-q', '--hard')
  return dir
}

const ms = n => `${Math.round(n)} ms`
const mb = n => `${(n / 1024 / 1024).toFixed(1)} MB`
const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

/** What the build ships, as the browser has to parse it. */
function bundle() {
  const dir = path.join(ROOT, 'out', 'renderer', 'assets')
  const out = { js: 0, css: 0 }
  for (const f of fs.readdirSync(dir)) {
    const size = fs.statSync(path.join(dir, f)).size
    if (f.endsWith('.js')) out.js += size
    else if (f.endsWith('.css')) out.css += size
  }
  return out
}

async function once(repo, profile, logFile) {
  const spawnedAt = Date.now()
  const { child, page } = await launch({ profile, logFile })
  try {
    // The welcome is the first thing the window draws with content in it.
    await page.until(`!!document.querySelector('.welcome-recent-item')`, { what: 'the welcome', timeoutMs: 60000 })
    const welcome = Date.now() - spawnedAt
    // The renderer's own timeline, which starts when the window loads the page
    // — the difference between this and the number above is Electron itself.
    const paint = await page.eval(`(() => { const e = performance.getEntriesByType('paint'); const fcp = e.find(x => x.name === 'first-contentful-paint') ?? e[e.length - 1]; return fcp ? Math.round(fcp.startTime) : -1 })()`)

    // Click to graph, stamped INSIDE the page.
    //
    // It used to be two Date.now() here with `page.until` between them, and
    // `until` polls every 150 ms: the answer was the next poll after the
    // truth, so a number that is really 168 ms reports as 181 or as 224
    // depending on where the polls fell. That is not noise around a value,
    // it is a quantum wider than most of what is worth measuring, and it
    // cost an afternoon chasing a regression that was the ruler.
    //
    // A MutationObserver in the renderer stamps performance.now() at the DOM
    // mutation that brings the 500th row, against a t0 taken just before the
    // click. Polling still decides when we ASK, and no longer what we get.
    await page.eval(`(() => {
      window.__graphAt = null
      const obs = new MutationObserver(() => {
        if (window.__graphAt === null && document.querySelectorAll('.cg-row').length >= 500) window.__graphAt = performance.now()
      })
      obs.observe(document.body, { childList: true, subtree: true })
      window.__t0 = performance.now()
    })()`)
    await page.eval(`document.querySelector('.welcome-recent-item').click()`)
    await page.until(`window.__graphAt !== null`, { what: 'a graph of 500 commits', timeoutMs: 120000 })
    const graph = await page.eval(`Math.round(window.__graphAt - window.__t0)`)

    // Once it has stopped moving: the counts, the branches and the working
    // tree all arrive after the graph, and a heap read in the middle of that
    // is a number about a moment rather than about the repository.
    await new Promise(r => setTimeout(r, 3000))
    const heap = await page.eval(`performance.memory ? performance.memory.usedJSHeapSize : null`)
    const rows = await page.eval(`document.querySelectorAll('.cg-row').length`)
    return { welcome, paint, graph, heap, rows }
  } finally {
    page.close()
    await stopAndWait(child)
  }
}

;(async () => {
  ensureBuilt({ build: args.includes('--build') })
  process.stdout.write(`· writing a repository of ${COMMITS.toLocaleString('en-US')} commits… `)
  const repo = makeDeepRepo(COMMITS)
  console.log(`${repo}`)
  const out = path.join(ROOT, 'scripts', 'e2e', 'out')
  fs.mkdirSync(out, { recursive: true })

  const runs = []
  for (let i = 0; i < RUNS; i++) {
    // A profile per run: the second start of an app that has already opened
    // this repository is not a cold start.
    const profile = makeProfile([repo])
    const r = await once(repo, profile, path.join(out, `measure-${i}.log`))
    console.log(`· run ${i + 1}: welcome ${ms(r.welcome)} · graph ${ms(r.graph)} · heap ${r.heap ? mb(r.heap) : 'n/a'} (${r.rows} rows)`)
    runs.push(r)
    fs.rmSync(profile, { recursive: true, force: true })
  }

  // And the open that is not the first one.
  //
  // Every run above is a repository this installation has never seen, which
  // is the honest worst case and also the rarer one: people reopen the same
  // few repositories all day. The graph cache only exists for that second
  // visit, so a measurement that throws the profile away every time cannot see it
  // at all — the same profile is kept here, and the second launch is what a
  // normal morning looks like.
  const kept = makeProfile([repo])
  const warm = []
  for (let i = 0; i < 2; i++) {
    const r = await once(repo, kept, path.join(out, `measure-warm-${i}.log`))
    warm.push(r)
    console.log(`· ${i === 0 ? 'first visit ' : 'second visit'}: graph ${ms(r.graph)}`)
  }
  fs.rmSync(kept, { recursive: true, force: true })

  const b = bundle()
  const git = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim()
  const electron = require(path.join(ROOT, 'node_modules', 'electron', 'package.json')).version
  console.log(`
| Measured on ${os.platform()} ${os.arch()}, ${os.cpus()[0].model}, Electron ${electron}, at ${git} | |
|---|---|
| Repository | ${COMMITS.toLocaleString('en-US')} commits |
| Cold start to the welcome (median of ${RUNS}) | ${ms(median(runs.map(r => r.welcome)))} |
| — of which the renderer's first contentful paint | ${median(runs.map(r => r.paint)) < 0 ? 'n/a' : ms(median(runs.map(r => r.paint)))} |
| Click to a graph of 500 commits | ${ms(median(runs.map(r => r.graph)))} |
| — opening it again, same profile | ${ms(warm[1].graph)} |
| Renderer heap, settled | ${runs[0].heap == null ? 'n/a' : mb(median(runs.map(r => r.heap)))} |
| Renderer bundle (unzipped) | ${mb(b.js)} of JavaScript, ${mb(b.css)} of CSS |
`)
  fs.rmSync(repo, { recursive: true, force: true })
})().catch(e => { console.error(e); process.exit(1) })
