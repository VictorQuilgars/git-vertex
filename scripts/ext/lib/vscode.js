// Drive the EXTENSION, in a real VS Code, the way scripts/e2e drives the app.
//
// ── Why this exists ────────────────────────────────────────────────────────
//
// Three things could be checked before it, and none of them was the product:
//
//   · `npm test` (jest) runs the shared renderer under jsdom — no VS Code.
//   · `npm run test:nodisplay` runs the extension's own suites with `vscode`
//     stubbed out, so everything that touches the real API is skipped. That is
//     most of GitVertexHost.
//   · `scripts/e2e/compact-panel.cjs` loads the webview BUNDLE in plain
//     Electron behind a fixture host: the layout is real, the host is a fake,
//     and nothing behind `window.gitAPI` runs at all.
//
// So the half of the product that only exists inside VS Code — the host's
// `case` arms, the commands, the panel's own webview, the editor decorations —
// was checked by hand or not at all. This launches the real editor with the
// extension loaded from source, opens the panel, and hands back something to
// read the DOM with and click on.
//
// ── The shape of a webview ─────────────────────────────────────────────────
//
// A VS Code webview is TWO iframes: the editor's own `vscode-webview://…`
// container, which is what the debugger lists as a target, and inside it the
// frame holding the extension's HTML. The container's document is empty —
// reading it is how you conclude, wrongly, that the panel did not load. The
// content lives one frame down, reached through an isolated world, which
// shares the DOM without sharing the page's variables.
'use strict'
const { spawn } = require('child_process')
const fs = require('fs')
const http = require('http')
const net = require('net')
const os = require('os')
const path = require('path')
const { Page, sleep } = require('../../e2e/lib/cdp')

const ROOT = path.resolve(__dirname, '..', '..', '..')
const EXTENSION = path.join(ROOT, 'vscode-extension')

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)) })
    srv.on('error', reject)
  })
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      let body = ''
      res.on('data', c => { body += c })
      res.on('end', () => { try { resolve(JSON.parse(body)) } catch (e) { reject(e) } })
    })
    req.on('error', reject)
    req.setTimeout(2000, () => req.destroy(new Error('timed out')))
  })
}

/** Where VS Code is, on this machine. Insiders counts; a `code` on PATH is a shim, not the binary. */
function findVSCode() {
  const candidates = process.platform === 'darwin'
    ? ['/Applications/Visual Studio Code.app/Contents/MacOS/Code',
       '/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Code - Insiders']
    : ['/usr/share/code/code', '/usr/bin/code', '/snap/bin/code']
  const found = candidates.find(p => fs.existsSync(p))
  if (!found) {
    throw new Error(`no VS Code found. Looked in:\n  ${candidates.join('\n  ')}\nSet GV_VSCODE to the binary.`)
  }
  return process.env.GV_VSCODE || found
}

/**
 * A profile of its own, and a SHORT path for it.
 *
 * VS Code opens a Unix socket inside the user-data dir, and a Unix socket path
 * is capped at 103 characters. A profile under this session's scratchpad —
 * which is nested six levels deep — blows that cap, and the editor exits at
 * startup with `EINVAL` on a listen() nobody was watching. `os.tmpdir()` is
 * short enough on both platforms; the check is here so the failure, if it ever
 * comes back, says what it is.
 */
function makeProfile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-vs-'))
  const socket = path.join(dir, '1.99-main.sock')
  if (socket.length > 103) throw new Error(`profile path too long for a Unix socket (${socket.length} > 103): ${dir}`)
  return dir
}

/** Every webview container the debugger lists, newest last. */
async function webviewTargets(port) {
  const targets = await getJson(`http://127.0.0.1:${port}/json/list`)
  return targets.filter(t => t.type === 'iframe' && /^vscode-webview:/.test(t.url))
}

/**
 * The extension's own frame inside a webview container: an isolated world in
 * the child frame, wrapped in the few calls a scenario actually makes.
 */
async function contentFrame(target) {
  const page = await Page.connect(target)
  await page.send('Page.enable')
  const { frameTree } = await page.send('Page.getFrameTree')
  const child = (frameTree.childFrames ?? [])[0]
  if (!child) return null
  const { executionContextId } = await page.send('Page.createIsolatedWorld', {
    frameId: child.frame.id, grantUniveralAccess: true,
  })
  const evaluate = async expression => {
    const r = await page.send('Runtime.evaluate', { expression, contextId: executionContextId, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'evaluate failed')
    return r.result.value
  }
  return {
    page,
    /** Evaluate in the extension's frame. Returns JSON-able values. */
    eval: evaluate,
    /** Wait for an expression to be true — the same contract as the desktop harness. */
    async until(expression, { timeoutMs = 15000, every = 150, what = expression } = {}) {
      const deadline = Date.now() + timeoutMs
      for (;;) {
        if (await evaluate(`!!(${expression})`)) return
        if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
        await sleep(every)
      }
    },
    /**
     * Click through the DOM rather than through synthesised mouse events: a
     * click dispatched at a point would have to cross two nested frames and
     * the editor's own layout, and React listens at the document either way.
     */
    async click(selector) {
      const ok = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true })()`)
      if (!ok) throw new Error(`no element for ${selector}`)
      await sleep(120)
    },
    /** The text of the frame, for saying what is on screen. */
    text: () => evaluate('(document.body.innerText || "").trim()'),
  }
}

/** The webview that IS the panel — the one with the app's root in it. */
async function findPanel(port, { timeoutMs = 30000 } = {}) {
  const deadline = Date.now() + timeoutMs
  let welcome = null
  while (Date.now() < deadline) {
    for (const target of await webviewTargets(port)) {
      const frame = await contentFrame(target).catch(() => null)
      if (!frame) continue
      if (await frame.eval('!!document.querySelector(".gv-app")')) return frame
      // The first run opens the extension's Welcome instead; it has the way in.
      if (await frame.eval('!!document.querySelector("button")') && !welcome) welcome = frame
    }
    if (welcome) {
      const opened = await welcome.eval(
        '(() => { const b = [...document.querySelectorAll("button")].find(x => /show the panel/i.test(x.textContent || "")); if (!b) return false; b.click(); return true })()')
      welcome = null
      if (opened) await sleep(1200)
    }
    await sleep(400)
  }
  throw new Error('no Git Vertex panel webview appeared')
}

/**
 * Launch VS Code on a repository, with the extension loaded from source, and
 * open the panel.
 *
 * The profile and the extensions directory are its own, so the editor the user
 * has open is neither reused nor touched — and no extension of theirs runs
 * beside ours.
 */
/**
 * What the editor has in the way of the panel: the chat pane VS Code now ships
 * with, the "extensions are disabled" notice the harness itself provokes, and
 * a panel sized for a terminal. None of it is ours, all of it is in the shot.
 *
 * ⚠️ Done BEFORE the panel is opened, and that is not tidiness. The palette is
 * reached with a keystroke sent to the workbench target; once the panel has
 * the focus, the focus is inside the webview's iframe and the keystroke never
 * reaches the workbench at all. Every command this harness runs goes first.
 */
async function clearTheView(workbench) {
  for (const command of ['View: Close Auxiliary Bar', 'Notifications: Clear All Notifications']) {
    await runCommand(workbench, command, { settle: 400 })
  }
}

/**
 * Give the panel the whole window, through the button the editor puts in the
 * panel's own title bar.
 *
 * Not through the palette: by now the focus is inside the webview's iframe,
 * where a keystroke meant for the workbench never arrives. A click on the
 * editor's own button needs no focus and hands it back at the same time. The
 * label is VS Code's, so this is kept tolerant — a harness must not fail over
 * a button that was renamed between two releases.
 */
async function maximizePanel(workbench) {
  const clicked = await workbench.eval(`(() => {
    const button = document.querySelector('.part.panel a[aria-label*="Maximize" i], .part.panel .codicon-chevron-up')
    if (!button) return false
    button.click()
    return true
  })()`)
  if (clicked) await sleep(600)
  return clicked
}

async function openPanel({ repo, keepProfile = false, maximize = false } = {}) {
  if (!repo || !fs.existsSync(repo)) throw new Error(`no repository at ${repo}`)
  const port = await freePort()
  const profile = makeProfile()
  const extensions = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-vsx-'))
  const logFile = path.join(profile, 'vscode.log')
  const log = fs.openSync(logFile, 'w')
  const child = spawn(findVSCode(), [
    `--user-data-dir=${profile}`,
    `--extensions-dir=${extensions}`,
    `--extensionDevelopmentPath=${EXTENSION}`,
    `--remote-debugging-port=${port}`,
    '--disable-workspace-trust', '--skip-release-notes', '--skip-welcome',
    // No `--disable-extensions`: the extensions directory above is a fresh
    // empty one, so ours is already the only extension that runs — and the
    // flag puts a standing "all installed extensions are temporarily
    // disabled" notification over the bottom-right of every screenshot.
    repo,
  ], { stdio: ['ignore', log, log], env: { ...process.env, GV_EXT_DRIVE: '1' } })

  const stop = async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM')
      await new Promise(r => { child.once('exit', r); setTimeout(r, 4000) })
      if (child.exitCode === null) { try { child.kill('SIGKILL') } catch { /* gone */ } }
    }
    if (!keepProfile) {
      for (const dir of [profile, extensions]) { try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* gone */ } }
    }
  }

  try {
    // The workbench first: the webviews only exist once it has drawn.
    const deadline = Date.now() + 60000
    let workbench = null
    while (!workbench && Date.now() < deadline) {
      try {
        const page = (await getJson(`http://127.0.0.1:${port}/json/list`)).find(t => t.type === 'page')
        if (page) {
          const connected = await Page.connect(page)
          await connected.until('!!document.querySelector(".monaco-workbench")', { what: 'the workbench' })
          workbench = connected
        }
      } catch { /* not listening yet */ }
      if (!workbench) await sleep(400)
    }
    if (!workbench) throw new Error(`VS Code did not come up — see ${logFile}`)
    await clearTheView(workbench)
    await runCommand(workbench, 'Git Vertex: Show Graph')
    const panel = await findPanel(port)
    if (maximize) await maximizePanel(workbench)
    await panel.until('document.querySelectorAll(".cg-row").length > 0 || !!document.querySelector(".gv-app")',
      { what: 'the graph', timeoutMs: 20000 })
    return { workbench, panel, port, profile, logFile, stop }
  } catch (e) {
    await stop()
    throw e
  }
}

/**
 * A letter with modifiers, built so the editor recognises it.
 *
 * `Page.press` in the desktop harness sends `windowsVirtualKeyCode: 0` for
 * anything that is not in its small table of named keys — fine for the app,
 * whose own handlers read `event.key`, and useless here: VS Code resolves a
 * keybinding from the key CODE, so Cmd+Shift+P with a code of 0 is not a
 * chord at all and the palette never opens. It fails silently, which is worse:
 * the panel still came up, opened by the Welcome page's button instead, and
 * every command after it did nothing.
 */
async function shortcut(page, letter, { shift = false } = {}) {
  const mac = process.platform === 'darwin'
  const modifiers = (mac ? 4 : 2) | (shift ? 8 : 0)   // meta or ctrl, plus shift
  const base = {
    key: letter.toUpperCase(), code: `Key${letter.toUpperCase()}`,
    windowsVirtualKeyCode: letter.toUpperCase().charCodeAt(0),
    nativeVirtualKeyCode: letter.toUpperCase().charCodeAt(0),
    modifiers,
  }
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base })
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
}

/**
 * Run a VS Code command the way a person does: the palette, typed into.
 *
 * Not through the extension host — the point of this harness is that a command
 * is reached the way the product offers it, so one that is registered but
 * unreachable fails here. It waits for the palette to actually list something
 * rather than pressing Enter into the void.
 */
async function runCommand(workbench, command, { settle = 1500 } = {}) {
  await shortcut(workbench, 'p', { shift: true })
  await sleep(400)
  await workbench.type(command)
  const listed = await workbench.eval(
    '(() => { const rows = document.querySelectorAll(".quick-input-list .monaco-list-row"); return rows.length })()')
  if (!listed) {
    await sleep(600)   // a slow first paint of the list
    const again = await workbench.eval('document.querySelectorAll(".quick-input-list .monaco-list-row").length')
    if (!again) throw new Error(`the palette listed nothing for "${command}"`)
  }
  await workbench.press('Enter')
  await sleep(settle)
}

module.exports = { openPanel, runCommand, shortcut, maximizePanel, findPanel, contentFrame, webviewTargets, ROOT, EXTENSION }
