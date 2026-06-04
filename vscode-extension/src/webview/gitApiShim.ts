// gitApiShim.ts — installs window.gitAPI + window.appInfo inside the webview.
// Every method call is proxied to the extension host over postMessage and
// resolved when the host posts back the matching gitApiResult. Event
// subscriptions (onRepoChanged etc.) are dispatched locally from host broadcasts.

interface VsCodeApi { postMessage(msg: unknown): void }
declare function acquireVsCodeApi(): VsCodeApi

const vscode = acquireVsCodeApi()

let nextId = 1
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>()

// Event listeners keyed by event name
const listeners: Record<string, Array<() => void>> = {
  repoChanged: [],
  workingChanged: [],
}

window.addEventListener('message', (e: MessageEvent) => {
  const msg = e.data
  if (!msg || typeof msg !== 'object') return

  if (msg.type === 'gitApiResult') {
    const entry = pending.get(msg.id)
    if (!entry) return
    pending.delete(msg.id)
    if (msg.ok) entry.resolve(msg.value)
    else entry.reject(new Error(msg.error ?? 'gitApi error'))
    return
  }

  if (msg.type === 'event') {
    const cbs = listeners[msg.name]
    if (cbs) cbs.slice().forEach(cb => { try { cb() } catch { /* ignore */ } })
  }
})

function call(method: string, args: any[]): Promise<any> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    vscode.postMessage({ type: 'gitApi', id, method, args })
  })
}

// Special-cased members that aren't simple async proxies
const overrides: Record<string, (...a: any[]) => any> = {
  // Synchronous zoom no-ops (desktop returns a number synchronously)
  zoomGet: () => 1,
  zoomSet: () => 1,
  // Event subscription helpers
  onRepoChanged: (cb: () => void) => { listeners.repoChanged.push(cb) },
  onWorkingChanged: (cb: () => void) => { listeners.workingChanged.push(cb) },
  offRepoChanged: (cb: () => void) => {
    listeners.repoChanged = listeners.repoChanged.filter(f => f !== cb)
  },
  offWorkingChanged: (cb: () => void) => {
    listeners.workingChanged = listeners.workingChanged.filter(f => f !== cb)
  },
}

// Proxy: any unknown property becomes an async host call; on*/off* event-style
// helpers we don't know become harmless no-ops.
const gitAPI = new Proxy({} as Record<string, any>, {
  get(_target, prop: string) {
    if (prop in overrides) return overrides[prop]
    if (typeof prop !== 'string') return undefined
    // Unknown event subscription helpers → no-op so App-style callers don't crash
    if (/^(on|off)[A-Z]/.test(prop)) return (_cb?: unknown) => {}
    return (...args: any[]) => call(prop, args)
  },
})

;(window as any).gitAPI = gitAPI
;(window as any).appInfo = { platform: 'vscode' }

export {}
