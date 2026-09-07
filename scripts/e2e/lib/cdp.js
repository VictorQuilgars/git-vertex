// A small Chrome DevTools Protocol client: enough to find the app's window,
// evaluate in its page, press keys, type, resize the viewport and take a
// screenshot. Node 22 has WebSocket; Node 20 (the CI) takes the `ws` package.
'use strict'
const http = require('http')
const WS = globalThis.WebSocket ?? require('ws')

/**
 * ⚠️ The timeout is load-bearing. Without it a request that is accepted and
 * never answered hangs for ever, and the deadline below — which is only checked
 * between attempts — never comes round again: the runner then dies with no
 * message at all rather than saying it could not find the window. Electron's
 * debugger endpoint can take several seconds to answer the first time a freshly
 * downloaded binary is launched, which is exactly when this bit.
 */
function getJson(url, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      let body = ''
      res.on('data', c => { body += c })
      res.on('end', () => { try { resolve(JSON.parse(body)) } catch (e) { reject(e) } })
    })
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`GET ${url} timed out after ${timeoutMs}ms`)))
  })
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

/** The app's main window, once it is listed by the debugger. */
async function findMainTarget(port, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const targets = await getJson(`http://127.0.0.1:${port}/json/list`)
      const t = targets.find(x => x.type === 'page' && /renderer\/index\.html/.test(x.url))
      if (t) return t
    } catch { /* not listening yet */ }
    await sleep(250)
  }
  throw new Error(`no main window target on port ${port} after ${timeoutMs}ms`)
}

class Page {
  constructor(ws) {
    this.ws = ws
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Map()
    this.consoleErrors = []
    this.exceptions = []
    ws.onmessage ??= null
    const onMessage = raw => {
      const msg = JSON.parse(typeof raw === 'string' ? raw : raw.data ?? raw.toString())
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        msg.error ? reject(new Error(`${msg.error.message} (${msg.error.code})`)) : resolve(msg.result)
        return
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.consoleErrors.push(msg.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 1200))
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails
        this.exceptions.push((d.exception?.description ?? d.text ?? 'exception').slice(0, 300))
      }
      for (const cb of this.listeners.get(msg.method) ?? []) cb(msg.params)
    }
    if (typeof ws.addEventListener === 'function') ws.addEventListener('message', e => onMessage(e.data))
    else ws.on('message', onMessage)
  }

  static async connect(target) {
    const ws = new WS(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      const ok = () => resolve()
      if (typeof ws.addEventListener === 'function') { ws.addEventListener('open', ok); ws.addEventListener('error', e => reject(new Error('websocket: ' + (e.message ?? 'error')))) }
      else { ws.on('open', ok); ws.on('error', reject) }
    })
    const page = new Page(ws)
    await page.send('Runtime.enable')
    await page.send('Page.enable')
    return page
  }

  send(method, params = {}, timeoutMs = 20000) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`${method} timed out after ${timeoutMs}ms`)) }
      }, timeoutMs)
    })
  }

  on(method, cb) { (this.listeners.get(method) ?? this.listeners.set(method, []).get(method)).push(cb) }

  /** Evaluate in the page; a rejected promise or a throw becomes an Error here. */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text))
    return r.result?.value
  }

  /** Poll an expression until it is truthy. */
  async until(expression, { timeoutMs = 15000, every = 150, what = expression } = {}) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await this.eval(expression)) return
      await sleep(every)
    }
    throw new Error(`timed out waiting for: ${what}`)
  }

  /** Click, or say why not: a disabled button swallows a click without a word. */
  async click(selector) {
    const hit = await this.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return 'absent'; if (el.disabled) return 'disabled'; el.click(); return 'ok' })()`)
    if (hit !== 'ok') throw new Error(`nothing to click at ${selector}: ${hit}`)
  }

  /** A right click, the way React sees it: a contextmenu event at the element's centre. */
  async contextMenu(selector) {
    const hit = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false
      const r = el.getBoundingClientRect()
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
      return true
    })()`)
    if (!hit) throw new Error(`nothing to right-click at ${selector}`)
  }

  /** Click the menu row whose label is exactly `label` (or matches the RegExp). */
  async clickMenuItem(label) {
    const test = label instanceof RegExp ? `${label.toString()}.test(t)` : `t === ${JSON.stringify(label)}`
    await this.until(`Array.from(document.querySelectorAll('.ctx-item')).some(b => { const t = b.querySelector('.ctx-label')?.textContent?.trim() ?? b.textContent.trim(); return ${test} })`, { what: `menu row ${label}` })
    await this.eval(`Array.from(document.querySelectorAll('.ctx-item')).find(b => { const t = b.querySelector('.ctx-label')?.textContent?.trim() ?? b.textContent.trim(); return ${test} }).click()`)
  }

  /** Open the submenu of the row labelled `parent` — from the keyboard, as a user would — and click `label` in it. */
  async clickSubmenuItem(parent, label) {
    const test = (l) => l instanceof RegExp ? `${l.toString()}.test(t)` : `t === ${JSON.stringify(l)}`
    await this.until(`Array.from(document.querySelectorAll('.ctx-item')).some(b => { const t = b.querySelector('.ctx-label')?.textContent?.trim() ?? b.textContent.trim(); return ${test(parent)} })`, { what: `menu row ${parent}` })
    await this.eval(`Array.from(document.querySelectorAll('.ctx-item')).find(b => { const t = b.querySelector('.ctx-label')?.textContent?.trim() ?? b.textContent.trim(); return ${test(parent)} }).focus()`)
    await this.press('ArrowRight')
    await this.clickMenuItem(label)
  }

  async focus(selector) {
    const hit = await this.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.focus(); return document.activeElement === el })()`)
    if (!hit) throw new Error(`could not focus ${selector}`)
  }

  /** Type into whatever has the focus, as keystrokes would. */
  async type(text) { await this.send('Input.insertText', { text }) }

  /**
   * A key, with modifiers when asked: `{ ctrl, shift, alt, meta }`. The app's
   * shortcuts take Ctrl where macOS would take Cmd, so Ctrl does on every platform.
   */
  async press(key, mods = {}) {
    const codes = { Enter: 13, Escape: 27, Tab: 9, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Home: 36, End: 35, Delete: 46, Backspace: 8, ',': 188 }
    const names = { ',': 'Comma' }
    const modifiers = (mods.alt ? 1 : 0) | (mods.ctrl ? 2 : 0) | (mods.meta ? 4 : 0) | (mods.shift ? 8 : 0)
    const base = { key, code: names[key] ?? key, windowsVirtualKeyCode: codes[key] ?? 0, nativeVirtualKeyCode: codes[key] ?? 0, modifiers }
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...(key === 'Enter' ? { text: '\r' } : {}) })
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
  }

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await sleep(300)
  }

  async clearViewport() { await this.send('Emulation.clearDeviceMetricsOverride'); await sleep(300) }

  /** A PNG of the page, or null when the window cannot be painted (hidden on a desktop). */
  async screenshot() {
    try {
      await this.send('Page.bringToFront', {}, 3000).catch(() => {})
      const r = await this.send('Page.captureScreenshot', { format: 'png' }, 10000)
      return Buffer.from(r.data, 'base64')
    } catch (e) {
      return null
    }
  }

  close() { try { this.ws.close() } catch { /* gone */ } }
}

module.exports = { Page, findMainTarget, sleep }
