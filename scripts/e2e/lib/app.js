// Launch the built app on a throwaway profile, connected to the debugger.
'use strict'
const { spawn, spawnSync } = require('child_process')
const fs = require('fs')
const net = require('net')
const os = require('os')
const path = require('path')
const { findMainTarget, Page } = require('./cdp')

const ROOT = path.resolve(__dirname, '..', '..', '..')

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)) })
    srv.on('error', reject)
  })
}

/** `out/main/index.js` is what runs; build it when it is missing or asked for. */
function ensureBuilt({ build }) {
  const main = path.join(ROOT, 'out', 'main', 'index.js')
  if (!build && fs.existsSync(main)) return
  console.log(build ? '· building (--build)' : '· no build found, building')
  const r = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' })
  if (r.status !== 0) throw new Error('npm run build failed')
}

/**
 * A profile of its own: the single-instance lock is per userData, so the app
 * someone has open is neither reused nor disturbed, and nothing of theirs is
 * read or written. Seeded with the fixture repositories as recents.
 */
function makeProfile(recentRepos) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-e2e-'))
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ theme: 'aqua-dark' }))
  fs.writeFileSync(path.join(dir, 'recent-repos.json'), JSON.stringify(recentRepos))
  return dir
}

async function launch({ profile, logFile, append = false }) {
  const port = await freePort()
  const electron = require('electron')   // the path of the binary, when required from node
  const args = ['.', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`]
  // The harness, not the shipped app: on a Linux runner the setuid sandbox is not there.
  if (process.platform === 'linux') args.push('--no-sandbox')
  const log = fs.openSync(logFile, append ? 'a' : 'w')
  const child = spawn(electron, args, { cwd: ROOT, stdio: ['ignore', log, log], env: { ...process.env, GV_E2E: '1' } })
  const target = await findMainTarget(port).catch(e => { child.kill('SIGKILL'); throw e })
  const page = await Page.connect(target)
  return { child, page, port }
}

function stop(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  setTimeout(() => { try { child.kill('SIGKILL') } catch { /* gone */ } }, 3000).unref()
}

/** Stop, and return once the process is gone: a relaunch on the same profile needs its lock released. */
function stopAndWait(child) {
  return new Promise(resolve => {
    if (!child || child.exitCode !== null) return resolve()
    child.once('exit', () => resolve())
    stop(child)
  })
}

module.exports = { ROOT, ensureBuilt, makeProfile, launch, stop, stopAndWait }
