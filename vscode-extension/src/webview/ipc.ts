// ipc.ts — Helpers for postMessage communication between webview and VS Code host.

import type { WebviewToHost, HostToWebview } from '../types'

// VS Code API acquired once
declare function acquireVsCodeApi(): {
  postMessage(msg: WebviewToHost): void
  getState(): unknown
  setState(state: unknown): void
}

let _vscode: ReturnType<typeof acquireVsCodeApi> | undefined

export function getVSCode(): ReturnType<typeof acquireVsCodeApi> {
  if (!_vscode) _vscode = acquireVsCodeApi()
  return _vscode
}

export function send(msg: WebviewToHost): void {
  getVSCode().postMessage(msg)
}

type Handler = (msg: HostToWebview) => void
const _handlers: Handler[] = []

export function onMessage(handler: Handler): () => void {
  _handlers.push(handler)
  return () => {
    const idx = _handlers.indexOf(handler)
    if (idx >= 0) _handlers.splice(idx, 1)
  }
}

// Called once from main.ts to wire up the global listener
export function initMessageListener(): void {
  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data as HostToWebview
    for (const h of _handlers) {
      try { h(msg) } catch (e) { console.error('Handler error:', e) }
    }
  })
}
