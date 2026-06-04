// main.ts — Webview entry point. GitLens-style Git Vertex UI.
// Bundled by esbuild → media/main.js

import { send, initMessageListener, onMessage } from './ipc'
import { initGraph, filterCommits, selectCommit } from './graph'
import { initRightPanel, showCommitInPanel, showStagingInPanel } from './rightPanel'
import type { CommitNode, HostToWebview, WorkingChanges } from '../types'

// ── Styles ─────────────────────────────────────────────────────
const STYLES = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #app { width: 100%; height: 100%; overflow: hidden; }
body {
  background: var(--vscode-editor-background, #0d1117);
  color: var(--vscode-editor-foreground, #e6edf3);
  font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  font-size: 13px;
}

/* ── Toolbar ─────────────────────────────────────────────── */
#gv-toolbar {
  height: 36px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  background: var(--vscode-sideBar-background, #161b22);
  border-bottom: 1px solid var(--vscode-panel-border, #21262d);
  flex-shrink: 0;
  overflow: hidden;
}
.tb-repo {
  font-size: 12px;
  font-weight: 600;
  color: var(--vscode-editor-foreground, #e6edf3);
  white-space: nowrap;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}
.tb-branch-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #1c2a3a;
  border: 1px solid #388bfd;
  color: #58a6ff;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 7px;
  border-radius: 10px;
  white-space: nowrap;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}
.tb-branch-icon { font-style: normal; flex-shrink: 0; }
.tb-spacer { flex: 1; }
#gv-search {
  width: 160px;
  flex-shrink: 1;
  min-width: 80px;
  background: var(--vscode-input-background, #0d1117);
  border: 1px solid var(--vscode-input-border, #30363d);
  color: var(--vscode-input-foreground, #e6edf3);
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
}
#gv-search:focus { border-color: #58a6ff; }
.tb-sep { width: 1px; height: 18px; background: #30363d; flex-shrink: 0; margin: 0 2px; }
.tb-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--vscode-editor-foreground, #e6edf3);
  font-size: 11px;
  padding: 3px 7px;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.tb-btn:hover { background: #21262d; border-color: #30363d; }
.tb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.tb-btn--changes {
  position: relative;
  color: #e6edf3;
}
.tb-btn--changes .tb-badge {
  position: absolute;
  top: -3px;
  right: -3px;
  background: #f85149;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  border-radius: 8px;
  min-width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 2px;
  line-height: 1;
}
.tb-icon { font-style: normal; font-size: 14px; line-height: 1; }

/* ── Main area ────────────────────────────────────────────── */
#gv-main {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
#gv-app { display: flex; flex-direction: column; width: 100%; height: 100%; overflow: hidden; }

/* ── Commit table ─────────────────────────────────────────── */
#gv-table-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Table header */
#gv-table-header {
  display: flex;
  align-items: center;
  height: 26px;
  padding: 0;
  background: var(--vscode-sideBar-background, #161b22);
  border-bottom: 1px solid #21262d;
  flex-shrink: 0;
  font-size: 11px;
  color: #8b949e;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  user-select: none;
}
.gv-th { padding: 0 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; }
.gv-th--graph { flex-shrink: 0; } /* width set by JS */
.gv-th--message { flex: 1; min-width: 0; }
.gv-th--author { width: 120px; }
.gv-th--date { width: 90px; }
.gv-th--sha { width: 72px; }
.gv-th--bar { width: 80px; }

/* Table scroll */
#gv-table-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; }

/* Table rows */
.gv-commit-row {
  display: flex;
  align-items: center;
  height: 28px;
  cursor: pointer;
  border-bottom: 1px solid #21262d;
  transition: background 0.05s;
}
.gv-commit-row:hover { background: #161b22 !important; }
.gv-commit-row--selected { background: #1c2128 !important; }

.gv-td { padding: 0 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; flex-shrink: 0; }
.gv-td--graph { padding: 0; flex-shrink: 0; }
.gv-td--message { flex: 1; min-width: 0; display: flex; align-items: center; gap: 5px; overflow: hidden; }
.gv-td--author { width: 120px; color: #8b949e; font-size: 11px; display: flex; align-items: center; gap: 5px; overflow: hidden; }
.gv-td--date { width: 90px; color: #8b949e; font-size: 11px; }
.gv-td--sha { width: 72px; color: #6e7681; font-family: monospace; font-size: 11px; }
.gv-td--bar { width: 80px; }

.gv-msg-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--vscode-editor-foreground, #e6edf3); }
.gv-ref { font-size: 10px; padding: 1px 4px; border-radius: 3px; white-space: nowrap; flex-shrink: 0; font-weight: 500; }
.gv-ref--local { background: #1b3a2d; color: #3fb950; border: 1px solid #2ea043; }
.gv-ref--remote { background: #1c2a3a; color: #58a6ff; border: 1px solid #388bfd; }
.gv-ref--head { background: #2d1f6e; color: #d2a8ff; border: 1px solid #8957e5; }
.gv-ref--tag { background: #3d2b00; color: #e3b341; border: 1px solid #9e6a03; }

.gv-avatar {
  width: 16px; height: 16px;
  border-radius: 50%;
  background: #21262d;
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; color: #8b949e;
  overflow: hidden;
}

/* Change bar */
.gv-bar { display: flex; align-items: center; gap: 3px; }
.gv-bar-add { height: 8px; background: #3fb950; border-radius: 2px; }
.gv-bar-del { height: 8px; background: #f85149; border-radius: 2px; }
.gv-bar-label { font-size: 10px; color: #8b949e; white-space: nowrap; }

/* ── Resizable divider ─────────────────────────────────────── */
#gv-divider {
  width: 4px;
  flex-shrink: 0;
  background: #21262d;
  cursor: col-resize;
  transition: background 0.1s;
  position: relative;
  z-index: 10;
}
#gv-divider:hover, #gv-divider.dragging { background: #388bfd; }

/* ── Right panel ───────────────────────────────────────────── */
#gv-right-pane {
  width: 340px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-left: 1px solid #21262d;
}

/* ── Toast ─────────────────────────────────────────────────── */
#gv-toast-layer {
  position: fixed;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 999;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}
.gv-toast {
  background: #21262d;
  border: 1px solid #30363d;
  color: #e6edf3;
  font-size: 12px;
  padding: 6px 14px;
  border-radius: 6px;
  pointer-events: auto;
  animation: gv-toast-in 0.2s ease;
}
.gv-toast--error { background: #2a0d0d; border-color: #f85149; color: #f85149; }
@keyframes gv-toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

/* ── Placeholder ───────────────────────────────────────────── */
.gv-placeholder {
  display: flex; align-items: center; justify-content: center; height: 100%;
  color: #8b949e; font-size: 12px; flex-direction: column; gap: 8px;
}
.gv-placeholder-icon { font-size: 28px; opacity: 0.25; }

/* ── Scrollbars ────────────────────────────────────────────── */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #484f58; border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: #6e7681; }
`

// ── State ──────────────────────────────────────────────────────
let _currentBranch = ''
let _repoName = ''
let _workingChanges: WorkingChanges = { staged: [], unstaged: [], untracked: [] }
let _panelMode: 'commit' | 'staging' = 'staging'

// ── Layout builder ─────────────────────────────────────────────
function buildLayout(): void {
  const app = document.getElementById('app')!
  app.innerHTML = `
<style>${STYLES}</style>

<div id="gv-app">
  <!-- Toolbar -->
  <div id="gv-toolbar">
    <span class="tb-repo" id="tb-repo-name">—</span>
    <span class="tb-branch-chip" id="tb-branch-chip">
      <i class="tb-icon">⎇</i>
      <span id="tb-branch-name">…</span>
    </span>
    <span class="tb-spacer"></span>
    <input id="gv-search" type="search" placeholder="Rechercher…" aria-label="Search commits" />
    <button class="tb-btn" id="tb-fetch-btn" title="Fetch"><i class="tb-icon">↓</i> Fetch</button>
    <button class="tb-btn" id="tb-pull-btn" title="Pull"><i class="tb-icon">⇩</i> Pull</button>
    <button class="tb-btn" id="tb-push-btn" title="Push"><i class="tb-icon">⇧</i> Push</button>
    <span class="tb-sep"></span>
    <button class="tb-btn tb-btn--changes" id="tb-changes-btn" title="Working changes">
      <i class="tb-icon">◈</i> Changes
      <span class="tb-badge" id="tb-changes-badge" style="display:none">0</span>
    </button>
  </div>

  <!-- Main: table + divider + right panel -->
  <div id="gv-main">
    <!-- Commit table -->
    <div id="gv-table-pane">
      <div id="gv-table-header">
        <span class="gv-th gv-th--graph" id="gv-th-graph"></span>
        <span class="gv-th gv-th--message">Message</span>
        <span class="gv-th gv-th--author">Auteur</span>
        <span class="gv-th gv-th--date">Date</span>
        <span class="gv-th gv-th--sha">SHA</span>
        <span class="gv-th gv-th--bar">±</span>
      </div>
      <div id="gv-table-scroll">
        <div class="gv-placeholder">
          <span class="gv-placeholder-icon">⎔</span>
          <span>Chargement…</span>
        </div>
      </div>
    </div>

    <!-- Resizable divider -->
    <div id="gv-divider"></div>

    <!-- Right panel -->
    <div id="gv-right-pane">
      <div class="gv-placeholder" style="height:100%">
        <span class="gv-placeholder-icon">◎</span>
        <span>Sélectionnez un commit</span>
      </div>
    </div>
  </div>
</div>

<!-- Toast layer -->
<div id="gv-toast-layer"></div>`
}

// ── Toast ──────────────────────────────────────────────────────
function showToast(msg: string, isError = false, durationMs = 3000): void {
  const layer = document.getElementById('gv-toast-layer')
  if (!layer) return
  const el = document.createElement('div')
  el.className = 'gv-toast' + (isError ? ' gv-toast--error' : '')
  el.textContent = msg
  layer.appendChild(el)
  setTimeout(() => el.remove(), durationMs)
}

// ── Toolbar state helpers ──────────────────────────────────────
function setRepoName(name: string): void {
  const el = document.getElementById('tb-repo-name')
  if (el) el.textContent = name
  _repoName = name
}

function setBranch(branch: string): void {
  const el = document.getElementById('tb-branch-name')
  if (el) el.textContent = branch
  _currentBranch = branch
}

function updateChangesBadge(): void {
  const total = _workingChanges.staged.length + _workingChanges.unstaged.length + _workingChanges.untracked.length
  const badge = document.getElementById('tb-changes-badge')
  if (!badge) return
  if (total > 0) {
    badge.style.display = 'flex'
    badge.textContent = String(total)
  } else {
    badge.style.display = 'none'
  }
}

function setButtonLoading(id: string, loading: boolean, label: string): void {
  const btn = document.getElementById(id) as HTMLButtonElement | null
  if (!btn) return
  btn.disabled = loading
  btn.querySelector('span.tb-lbl')
  btn.textContent = loading ? `${label}…` : label
  // Re-add icon since textContent clobbered it
  if (!loading) {
    const icons: Record<string, string> = {
      'tb-fetch-btn': '↓',
      'tb-pull-btn': '⇩',
      'tb-push-btn': '⇧',
    }
    const ic = icons[id]
    if (ic) btn.innerHTML = `<i class="tb-icon">${ic}</i> ${label}`
  }
}

// ── Resizable panel ────────────────────────────────────────────
function initResizer(): void {
  const divider = document.getElementById('gv-divider')!
  const rightPane = document.getElementById('gv-right-pane')!
  let dragging = false
  let startX = 0
  let startW = 0

  divider.addEventListener('mousedown', (e) => {
    dragging = true
    startX = e.clientX
    startW = rightPane.offsetWidth
    divider.classList.add('dragging')
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  })

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return
    const delta = startX - e.clientX
    const newW = Math.min(600, Math.max(240, startW + delta))
    rightPane.style.width = `${newW}px`
  })

  document.addEventListener('mouseup', () => {
    if (!dragging) return
    dragging = false
    divider.classList.remove('dragging')
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  })
}

// ── Boot ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initMessageListener()
  buildLayout()

  const tableScrollEl = document.getElementById('gv-table-scroll')!
  const rightPaneEl = document.getElementById('gv-right-pane')!

  // Init graph (commit table)
  initGraph(tableScrollEl, (commit: CommitNode) => {
    _panelMode = 'commit'
    showCommitInPanel(rightPaneEl, commit)
    selectCommit(commit.hash)
  })

  // Init right panel (detail + staging)
  initRightPanel(rightPaneEl)

  // Init resizer
  initResizer()

  // Listen to all host messages
  onMessage((msg: HostToWebview) => {
    switch (msg.type) {
      case 'log':
        setRepoName(msg.repoName)
        break

      case 'branches': {
        const current = msg.branches.find(b => b.current)
        if (current) setBranch(current.label || current.name)
        break
      }

      case 'workingChanges':
        _workingChanges = msg.changes
        updateChangesBadge()
        // If staging panel is open, refresh it
        if (_panelMode === 'staging') {
          showStagingInPanel(rightPaneEl, msg.changes)
        }
        break

      case 'error':
        showToast(msg.message, true)
        break

      case 'opResult':
        if (msg.op === 'fetch' || msg.op === 'pull' || msg.op === 'push') {
          const labels: Record<string, string> = { fetch: 'Fetch', pull: 'Pull', push: 'Push' }
          setButtonLoading(`tb-${msg.op}-btn`, false, labels[msg.op])
          if (!msg.success) showToast(`${msg.op} failed: ${msg.error ?? 'erreur inconnue'}`, true)
          else showToast(`${labels[msg.op]} réussi`)
        }
        if (msg.op === 'commit' && msg.success) {
          _panelMode = 'staging'
          showStagingInPanel(rightPaneEl, _workingChanges)
        }
        break

      case 'repoChanged':
        rightPaneEl.innerHTML = `<div class="gv-placeholder" style="height:100%">
          <span class="gv-placeholder-icon">⎔</span>
          <span>Dépôt changé</span>
        </div>`
        break
    }
  })

  // Toolbar — fetch / pull / push
  document.getElementById('tb-fetch-btn')?.addEventListener('click', () => {
    setButtonLoading('tb-fetch-btn', true, 'Fetch')
    send({ type: 'fetch' })
  })
  document.getElementById('tb-pull-btn')?.addEventListener('click', () => {
    setButtonLoading('tb-pull-btn', true, 'Pull')
    send({ type: 'pull' })
  })
  document.getElementById('tb-push-btn')?.addEventListener('click', () => {
    setButtonLoading('tb-push-btn', true, 'Push')
    send({ type: 'push' })
  })

  // Changes button — toggle staging panel
  document.getElementById('tb-changes-btn')?.addEventListener('click', () => {
    _panelMode = 'staging'
    showStagingInPanel(rightPaneEl, _workingChanges)
  })

  // Search
  const searchEl = document.getElementById('gv-search') as HTMLInputElement
  let searchTimer: ReturnType<typeof setTimeout> | undefined
  searchEl?.addEventListener('input', () => {
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => filterCommits(searchEl.value), 300)
  })

  // Signal ready to host
  send({ type: 'ready' })
})
