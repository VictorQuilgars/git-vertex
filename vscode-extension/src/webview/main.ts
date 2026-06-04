// main.ts — Webview entry point. Wires up the entire Git Vertex UI.
// Bundled by esbuild → media/main.js (loaded by GitVertexPanel HTML).

import { send, initMessageListener, onMessage } from './ipc'
import { initGraph, filterCommits, selectCommit } from './graph'
import { initCommitDetail, showCommit, clearDetail } from './commitDetail'
import { initStaging, refreshChanges } from './staging'
import type { CommitNode, HostToWebview } from '../types'

// ── Layout ─────────────────────────────────────────────────────
// Three-pane layout:
//   LEFT:  commit graph (scrollable)
//   CENTER: commit detail or diff when commit selected
//   RIGHT: staging area + diff

function buildLayout(): void {
  const app = document.getElementById('app')!
  app.innerHTML = `
<style>
*, *::before, *::after { box-sizing: border-box; }
html, body, #app { width: 100%; height: 100%; overflow: hidden; margin: 0; }
body { background: #0d1117; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; }

#gv-toolbar {
  height: 38px; display: flex; align-items: center; gap: 6px; padding: 0 12px;
  background: #161b22; border-bottom: 1px solid #21262d; flex-shrink: 0;
}
#gv-toolbar .tb-title { font-weight: 600; color: #e6edf3; font-size: 13px; flex-shrink: 0; }
#gv-toolbar .tb-repo { font-size: 12px; color: #8b949e; }
#gv-search {
  flex: 1; max-width: 280px; background: #0d1117; border: 1px solid #30363d;
  color: #e6edf3; padding: 3px 8px; border-radius: 4px; font-size: 12px;
}
#gv-search:focus { outline: none; border-color: #58a6ff; }
.tb-btn {
  background: #21262d; border: 1px solid #30363d; color: #e6edf3;
  font-size: 12px; padding: 3px 10px; border-radius: 4px; cursor: pointer;
}
.tb-btn:hover { background: #30363d; }
.tb-btn--primary { background: #1b3a2d; border-color: #2ea043; color: #3fb950; }
.tb-btn--primary:hover { background: #2ea043; color: #fff; }

#gv-main { display: flex; flex: 1; min-height: 0; overflow: hidden; }
#gv-app { display: flex; flex-direction: column; width: 100%; height: 100%; }

/* Graph pane */
#gv-graph-pane {
  width: 380px; flex-shrink: 0; display: flex; flex-direction: column;
  border-right: 1px solid #21262d; overflow: hidden;
}
#gv-graph-header {
  padding: 5px 10px; font-size: 11px; color: #8b949e; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #21262d;
  background: #161b22; flex-shrink: 0;
}
#gv-graph-scroll { flex: 1; overflow-y: auto; overflow-x: auto; }

/* Center pane (commit detail) */
#gv-center-pane {
  flex: 1; min-width: 0; display: flex; flex-direction: column;
  border-right: 1px solid #21262d; overflow: hidden;
}
#gv-detail-container { flex: 1; overflow-y: auto; }

/* Right pane (staging) */
#gv-right-pane {
  width: 320px; flex-shrink: 0; display: flex; flex-direction: column; overflow: hidden;
}
#gv-staging-container { flex: 1; overflow-y: auto; min-height: 0; border-bottom: 1px solid #21262d; }
#gv-staging-diff { flex: 1; overflow-y: auto; min-height: 0; min-height: 80px; max-height: 220px; }

.gv-placeholder {
  display: flex; align-items: center; justify-content: center; height: 100%;
  color: #8b949e; font-size: 13px; flex-direction: column; gap: 8px;
}
.gv-placeholder-icon { font-size: 32px; opacity: 0.3; }

.gv-status-bar {
  height: 24px; display: flex; align-items: center; padding: 0 12px; gap: 12px;
  background: #161b22; border-top: 1px solid #21262d; flex-shrink: 0;
  font-size: 11px; color: #8b949e;
}
#gv-status-msg { flex: 1; }
</style>

<div id="gv-app">
  <div id="gv-toolbar">
    <span class="tb-title">Git Vertex</span>
    <span class="tb-repo" id="tb-repo-name"></span>
    <input id="gv-search" type="search" placeholder="Search commits…" />
    <button class="tb-btn" id="tb-fetch-btn">Fetch</button>
    <button class="tb-btn" id="tb-pull-btn">Pull</button>
    <button class="tb-btn tb-btn--primary" id="tb-push-btn">Push</button>
  </div>

  <div id="gv-main">
    <div id="gv-graph-pane">
      <div id="gv-graph-header">Commits</div>
      <div id="gv-graph-scroll"></div>
    </div>

    <div id="gv-center-pane">
      <div id="gv-detail-container">
        <div class="gv-placeholder">
          <span class="gv-placeholder-icon">◎</span>
          <span>Select a commit to view details</span>
        </div>
      </div>
    </div>

    <div id="gv-right-pane">
      <div id="gv-staging-container"></div>
      <div id="gv-staging-diff"></div>
    </div>
  </div>

  <div class="gv-status-bar">
    <span id="gv-status-msg">Ready</span>
  </div>
</div>`
}

function setStatus(msg: string, isError = false): void {
  const el = document.getElementById('gv-status-msg')
  if (el) {
    el.textContent = msg
    el.style.color = isError ? '#f85149' : '#8b949e'
  }
}

function setRepoName(name: string): void {
  const el = document.getElementById('tb-repo-name')
  if (el) el.textContent = name
}

// ── Boot ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initMessageListener()
  buildLayout()

  const graphEl = document.getElementById('gv-graph-scroll')!
  const detailEl = document.getElementById('gv-detail-container')!
  const stagingEl = document.getElementById('gv-staging-container')!
  const stagingDiffEl = document.getElementById('gv-staging-diff')!

  // Init modules
  initGraph(graphEl, (commit: CommitNode) => {
    showCommit(commit)
    clearStagingDiff()
    selectCommit(commit.hash)
  })

  initCommitDetail(detailEl)

  initStaging(stagingEl, stagingDiffEl, (op, success, error) => {
    if (success) {
      setStatus(`${op} successful`)
      if (op === 'commit') {
        // Clear commit message
        const msgEl = stagingEl.querySelector('#commit-msg') as HTMLTextAreaElement | null
        if (msgEl) msgEl.value = ''
      }
    } else {
      setStatus(`${op} failed: ${error ?? 'unknown error'}`, true)
    }
  })

  // Listen for top-level messages
  onMessage((msg: HostToWebview) => {
    if (msg.type === 'log') {
      setRepoName(msg.repoName)
      const count = msg.commits.length
      setStatus(`${count} commit${count !== 1 ? 's' : ''} loaded`)
    }
    if (msg.type === 'error') {
      setStatus(msg.message, true)
    }
    if (msg.type === 'opResult') {
      if (msg.op === 'fetch' || msg.op === 'pull' || msg.op === 'push') {
        const btn = document.getElementById(`tb-${msg.op}-btn`)
        if (btn) {
          (btn as HTMLButtonElement).disabled = false
          btn.textContent = capitalize(msg.op)
        }
        if (!msg.success) {
          setStatus(`${msg.op} failed: ${msg.error ?? 'unknown error'}`, true)
        }
      }
    }
    if (msg.type === 'repoChanged') {
      clearDetail()
      clearStagingDiff()
      setStatus('Repository changed')
    }
  })

  // Toolbar buttons
  document.getElementById('tb-fetch-btn')?.addEventListener('click', () => {
    setStatus('Fetching…')
    const btn = document.getElementById('tb-fetch-btn') as HTMLButtonElement
    btn.disabled = true
    btn.textContent = 'Fetching…'
    send({ type: 'fetch' })
  })

  document.getElementById('tb-pull-btn')?.addEventListener('click', () => {
    setStatus('Pulling…')
    const btn = document.getElementById('tb-pull-btn') as HTMLButtonElement
    btn.disabled = true
    btn.textContent = 'Pulling…'
    send({ type: 'pull' })
  })

  document.getElementById('tb-push-btn')?.addEventListener('click', () => {
    setStatus('Pushing…')
    const btn = document.getElementById('tb-push-btn') as HTMLButtonElement
    btn.disabled = true
    btn.textContent = 'Pushing…'
    send({ type: 'push' })
  })

  // Search
  const searchEl = document.getElementById('gv-search') as HTMLInputElement
  let searchTimer: ReturnType<typeof setTimeout> | undefined
  searchEl?.addEventListener('input', () => {
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      filterCommits(searchEl.value)
    }, 300)
  })

  // Signal ready to host
  send({ type: 'ready' })
})

function clearStagingDiff(): void {
  const el = document.getElementById('gv-staging-diff')
  if (el) el.innerHTML = ''
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
