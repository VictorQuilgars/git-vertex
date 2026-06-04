// rightPanel.ts — Right-side panel that shows either commit detail or staging.
// Imported by main.ts. Uses send/onMessage from ipc.ts.

import type { CommitNode, FileChange, WorkingChanges, WorkingFile } from '../types'
import { send, onMessage } from './ipc'

// ── Commit detail state ────────────────────────────────────────
let _detailContainer: HTMLElement | undefined
let _currentHash: string | null = null
let _currentDiff = ''
let _files: FileChange[] = []

// ── Styling ────────────────────────────────────────────────────
const PANEL_STYLES = `
<style>
/* ── Right panel shared ─────────────────────────────────── */
.rp-tabs { display:flex; border-bottom:1px solid #21262d; background:#161b22; flex-shrink:0; }
.rp-tab {
  padding: 6px 14px; font-size: 12px; color: #8b949e; cursor: pointer;
  border-bottom: 2px solid transparent; transition: color 0.1s;
  user-select: none;
}
.rp-tab:hover { color: #e6edf3; }
.rp-tab--active { color: #58a6ff; border-bottom-color: #58a6ff; }

/* ── Commit detail ───────────────────────────────────────── */
.cd-outer { display:flex; flex-direction:column; height:100%; overflow:hidden; }
.cd-header { padding: 10px 12px; border-bottom: 1px solid #21262d; flex-shrink:0; }
.cd-hash { font-family: monospace; font-size: 11px; color: #8b949e; margin-bottom: 3px; }
.cd-message { font-size: 13px; font-weight: 600; color: #e6edf3; margin-bottom: 5px; word-break:break-word; }
.cd-meta { font-size: 11px; color: #8b949e; display:flex; gap:10px; flex-wrap:wrap; }
.cd-refs { display:flex; gap:4px; flex-wrap:wrap; margin-top:5px; }
.cd-ref { font-size: 10px; padding: 1px 5px; border-radius: 3px; font-weight: 500; }
.cd-ref--local { background:#1b3a2d; color:#3fb950; border:1px solid #2ea043; }
.cd-ref--remote { background:#1c2a3a; color:#58a6ff; border:1px solid #388bfd; }
.cd-ref--head { background:#2d1f6e; color:#d2a8ff; border:1px solid #8957e5; }
.cd-ref--tag { background:#3d2b00; color:#e3b341; border:1px solid #9e6a03; }
.cd-actions { display:flex; gap:6px; padding: 6px 12px; border-bottom:1px solid #21262d; flex-shrink:0; }
.cd-btn {
  background: #21262d; border: 1px solid #30363d; color: #e6edf3;
  font-size: 11px; padding: 3px 9px; border-radius: 4px; cursor: pointer;
}
.cd-btn:hover { background: #30363d; }
.cd-body { flex:1; display:flex; min-height:0; overflow:hidden; }
.cd-files { width: 200px; flex-shrink:0; border-right:1px solid #21262d; overflow-y:auto; }
.cd-file {
  display:flex; align-items:center; gap:5px; padding: 4px 8px; cursor:pointer;
  font-size: 12px; color:#e6edf3; border-bottom:1px solid #161b22;
}
.cd-file:hover { background:#161b22; }
.cd-file--active { background:#1c2128 !important; }
.cd-file-status { font-size:11px; font-weight:700; width:13px; flex-shrink:0; }
.cd-file-status--A { color:#3fb950; }
.cd-file-status--M { color:#58a6ff; }
.cd-file-status--D { color:#f85149; }
.cd-file-status--R { color:#e3b341; }
.cd-file-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cd-diff { flex:1; overflow-y:auto; font-family:monospace; font-size:12px; line-height:1.5; }
.cd-diff-empty { padding:12px; color:#8b949e; }
.cd-files-loading { padding:10px; color:#8b949e; font-size:12px; }

/* ── Staging ─────────────────────────────────────────────── */
.st-outer { display:flex; flex-direction:column; height:100%; overflow:hidden; }
.st-section-hdr {
  display:flex; align-items:center; justify-content:space-between;
  padding: 5px 10px; background:#161b22; border-bottom:1px solid #21262d;
  font-size:11px; font-weight:600; color:#8b949e; text-transform:uppercase; letter-spacing:0.4px;
  flex-shrink:0;
}
.st-count { font-size:10px; background:#21262d; border-radius:8px; padding:1px 5px; color:#8b949e; }
.st-file-list { overflow-y:auto; flex-shrink:0; max-height: 130px; }
.st-file {
  display:flex; align-items:center; gap:5px; padding: 3px 10px; cursor:pointer;
  font-size:12px; border-bottom:1px solid #161b22;
}
.st-file:hover { background:#1c2128; }
.st-file-status { font-size:10px; font-weight:700; width:12px; flex-shrink:0; }
.st-file-status--A { color:#3fb950; }
.st-file-status--M { color:#58a6ff; }
.st-file-status--D { color:#f85149; }
.st-file-status--U { color:#f0883e; }
.st-file-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#e6edf3; }
.st-file-actions { display:flex; gap:3px; opacity:0; transition:opacity 0.1s; }
.st-file:hover .st-file-actions { opacity:1; }
.st-btn {
  background:#21262d; border:1px solid #30363d; color:#e6edf3;
  font-size:11px; padding:2px 6px; border-radius:4px; cursor:pointer;
}
.st-btn:hover { background:#30363d; }
.st-btn--green { background:#1b3a2d; border-color:#2ea043; color:#3fb950; }
.st-btn--green:hover { background:#2ea043; color:#fff; }
.st-btn--red { background:#2a0d0d; border-color:#f85149; color:#f85149; }
.st-btn--red:hover { background:#f85149; color:#fff; }
.st-empty { padding:5px 10px; font-size:11px; color:#8b949e; font-style:italic; }
.st-commit-area { flex-shrink:0; padding: 8px 10px; border-top:1px solid #21262d; }
.st-commit-input {
  width:100%; background:#0d1117; border:1px solid #30363d; color:#e6edf3;
  padding: 5px 8px; border-radius:4px; font-size:12px; resize:none;
  font-family: inherit;
}
.st-commit-input:focus { outline:none; border-color:#58a6ff; }
.st-commit-row { display:flex; gap:6px; margin-top:5px; align-items:center; }
.st-commit-btn {
  background:#1b3a2d; border:1px solid #2ea043; color:#3fb950;
  font-size:12px; padding:4px 14px; border-radius:4px; cursor:pointer; font-weight:600;
}
.st-commit-btn:hover { background:#2ea043; color:#fff; }
.st-commit-btn:disabled { opacity:0.4; cursor:not-allowed; }
.st-error { color:#f85149; font-size:11px; margin-top:3px; }
.st-diff-area { flex:1; min-height:0; overflow-y:auto; border-top:1px solid #21262d; font-family:monospace; font-size:12px; line-height:1.5; }

/* ── Diff rendering shared ───────────────────────────────── */
.diff-line { white-space:pre; padding:0 12px; display:block; min-width:max-content; }
.diff-line--add { background:#0d2a1a; color:#3fb950; }
.diff-line--del { background:#2a0d0d; color:#f85149; }
.diff-line--hunk { background:#161b22; color:#8b949e; }
.diff-line--meta { color:#8b949e; }
</style>`

// ── Public: show commit detail ─────────────────────────────────
export function initRightPanel(container: HTMLElement): void {
  _detailContainer = container

  onMessage(msg => {
    if (msg.type === 'commitFiles' && msg.hash === _currentHash) {
      _files = msg.files
      renderFileList()
    }
    if (msg.type === 'diff' && msg.hash === _currentHash) {
      _currentDiff = msg.diff
      // Render full diff by default (no file selected)
      renderDiffInContainer(null)
    }
    if (msg.type === 'workingFileDiff') {
      renderStagingDiff(msg.diff, msg.filepath, msg.staged)
    }
  })
}

export function showCommitInPanel(container: HTMLElement, commit: CommitNode): void {
  _detailContainer = container
  _currentHash = commit.hash
  _files = []
  _currentDiff = ''

  const refs = (commit.refs ?? []).map(r => {
    const isTag = r.startsWith('tag:')
    const isRemote = r.includes('origin/')
    const isHead = r.startsWith('HEAD')
    const cls = isHead ? 'cd-ref cd-ref--head' : isTag ? 'cd-ref cd-ref--tag' : isRemote ? 'cd-ref cd-ref--remote' : 'cd-ref cd-ref--local'
    const label = r.replace(/^HEAD -> /, '').replace(/^tag: /, '')
    return `<span class="${cls}">${esc(label)}</span>`
  }).join('')

  container.innerHTML = PANEL_STYLES + `
<div class="cd-outer">
  <div class="cd-header">
    <div class="cd-hash">${esc(commit.shortHash)}</div>
    <div class="cd-message">${esc(commit.message)}</div>
    <div class="cd-meta">
      <span>${esc(commit.author)}</span>
      <span>${formatDateFull(commit.date)}</span>
    </div>
    ${refs ? `<div class="cd-refs">${refs}</div>` : ''}
  </div>
  <div class="cd-actions">
    <button class="cd-btn" id="cd-checkout-btn">Checkout</button>
    <button class="cd-btn" id="cd-copy-sha-btn">Copier SHA</button>
  </div>
  <div class="cd-body">
    <div class="cd-files" id="cd-file-list"><div class="cd-files-loading">Chargement…</div></div>
    <div class="cd-diff" id="cd-diff-content"><div class="cd-diff-empty">Sélectionnez un fichier</div></div>
  </div>
</div>`

  // Checkout
  container.querySelector('#cd-checkout-btn')?.addEventListener('click', () => {
    send({ type: 'checkout', ref: commit.hash })
  })
  // Copy SHA
  container.querySelector('#cd-copy-sha-btn')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(commit.hash).catch(() => {})
  })

  // Request data
  send({ type: 'getCommitFiles', hash: commit.hash })
  send({ type: 'getDiff', hash: commit.hash })
}

// ── Render file list in detail panel ──────────────────────────
function renderFileList(): void {
  const listEl = _detailContainer?.querySelector('#cd-file-list') as HTMLElement | null
  if (!listEl) return

  if (!_files.length) {
    listEl.innerHTML = '<div class="cd-files-loading">Aucun fichier modifié</div>'
    return
  }

  listEl.innerHTML = _files.map((f, i) => `
<div class="cd-file" data-idx="${i}">
  <span class="cd-file-status cd-file-status--${esc(f.status)}">${esc(f.status)}</span>
  <span class="cd-file-name" title="${esc(f.path)}">${esc(basename(f.path))}</span>
</div>`).join('')

  listEl.querySelectorAll('.cd-file').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt((el as HTMLElement).dataset.idx ?? '0')
      const file = _files[idx]
      if (!file) return
      listEl.querySelectorAll('.cd-file').forEach(e => e.classList.remove('cd-file--active'))
      el.classList.add('cd-file--active')
      renderDiffInContainer(file)
    })
  })
}

function renderDiffInContainer(file: FileChange | null): void {
  const diffEl = _detailContainer?.querySelector('#cd-diff-content') as HTMLElement | null
  if (!diffEl) return

  const diff = file ? extractFileDiff(_currentDiff, file.path) : _currentDiff

  if (!diff.trim()) {
    diffEl.innerHTML = '<div class="cd-diff-empty">Aucun diff disponible</div>'
    return
  }

  diffEl.innerHTML = `<code>${renderDiffLines(diff)}</code>`
}

// ── Public: show staging panel ─────────────────────────────────
let _stagingContainer: HTMLElement | undefined

export function showStagingInPanel(container: HTMLElement, changes: WorkingChanges): void {
  _stagingContainer = container

  const { staged, unstaged, untracked } = changes
  const totalUnstaged = unstaged.length + untracked.length

  container.innerHTML = PANEL_STYLES + `
<div class="st-outer">
  <!-- Staged section -->
  <div class="st-section-hdr">
    <span>Staged <span class="st-count">${staged.length}</span></span>
    <div style="display:flex;gap:4px">
      ${staged.length > 0 ? '<button class="st-btn st-btn--red" id="st-unstage-all">Tout désindexer</button>' : ''}
    </div>
  </div>
  <div class="st-file-list" id="st-staged-list">
    ${staged.length === 0
      ? '<div class="st-empty">Aucun fichier indexé</div>'
      : staged.map(f => fileRow(f, true)).join('')}
  </div>

  <!-- Unstaged section -->
  <div class="st-section-hdr">
    <span>Modifications <span class="st-count">${totalUnstaged}</span></span>
    <div style="display:flex;gap:4px">
      ${totalUnstaged > 0 ? '<button class="st-btn st-btn--green" id="st-stage-all">Tout indexer</button>' : ''}
    </div>
  </div>
  <div class="st-file-list" id="st-unstaged-list">
    ${totalUnstaged === 0
      ? '<div class="st-empty">Aucune modification</div>'
      : [
          ...unstaged.map(f => fileRow(f, false)),
          ...untracked.map(p => fileRow({ path: p, status: 'U' }, false, true)),
        ].join('')}
  </div>

  <!-- Commit area -->
  <div class="st-commit-area">
    <textarea class="st-commit-input" id="st-commit-msg" rows="3" placeholder="Message de commit…"></textarea>
    <div class="st-commit-row">
      <button class="st-commit-btn" id="st-commit-btn" ${staged.length === 0 ? 'disabled' : ''}>Committer</button>
    </div>
    <div class="st-error" id="st-commit-error"></div>
  </div>

  <!-- Diff area -->
  <div class="st-diff-area" id="st-diff-area"></div>
</div>`

  // Stage all
  container.querySelector('#st-stage-all')?.addEventListener('click', () => {
    send({ type: 'stageAll' })
  })
  // Unstage all
  container.querySelector('#st-unstage-all')?.addEventListener('click', () => {
    send({ type: 'unstage', files: staged.map(f => f.path) })
  })
  // Commit
  container.querySelector('#st-commit-btn')?.addEventListener('click', () => {
    const msg = (container.querySelector('#st-commit-msg') as HTMLTextAreaElement)?.value?.trim()
    const errEl = container.querySelector('#st-commit-error')
    if (!msg) {
      if (errEl) errEl.textContent = 'Message requis'
      return
    }
    if (errEl) errEl.textContent = ''
    send({ type: 'commit', message: msg })
  })

  // Individual file actions
  container.querySelectorAll<HTMLElement>('.st-file[data-path]').forEach(el => {
    const path = el.dataset.path!
    const isStaged = el.dataset.staged === 'true'
    const isUntracked = el.dataset.untracked === 'true'

    // Click row = show diff
    el.addEventListener('click', e => {
      const target = e.target as HTMLElement
      if (target.closest('.st-file-actions')) return
      send({ type: 'getWorkingFileDiff', filepath: path, staged: isStaged })
    })
    // Stage/unstage btn
    el.querySelector('.st-action-btn')?.addEventListener('click', e => {
      e.stopPropagation()
      if (isStaged) send({ type: 'unstage', files: [path] })
      else send({ type: 'stage', files: [path] })
    })
    // Discard btn
    el.querySelector('.st-discard-btn')?.addEventListener('click', e => {
      e.stopPropagation()
      send({ type: 'discardFile', file: path })
    })
  })
}

// ── Render staging diff ────────────────────────────────────────
function renderStagingDiff(diff: string, filepath: string, staged: boolean): void {
  const area = _stagingContainer?.querySelector('#st-diff-area') as HTMLElement | null
  if (!area) return
  if (!diff.trim()) {
    area.innerHTML = `<div style="padding:8px 12px;color:#8b949e;font-size:12px">Aucun diff pour ${esc(filepath)}</div>`
    return
  }
  area.innerHTML = `
<div style="font-size:11px;color:#8b949e;padding:5px 12px;border-bottom:1px solid #21262d">${esc(filepath)}${staged ? ' (indexé)' : ''}</div>
<code>${renderDiffLines(diff)}</code>`
}

// ── File row HTML ──────────────────────────────────────────────
function fileRow(f: WorkingFile, isStaged: boolean, isUntracked = false): string {
  const status = isUntracked ? 'U' : f.status
  const statusCls = `st-file-status--${status === 'D' ? 'D' : status === 'A' ? 'A' : status === 'U' ? 'U' : 'M'}`
  const actionIcon = isStaged ? '−' : '+'
  const actions = `<div class="st-file-actions">
  <button class="st-btn st-action-btn" title="${isStaged ? 'Désindexer' : 'Indexer'}">${actionIcon}</button>
  ${!isStaged && !isUntracked ? '<button class="st-btn st-btn--red st-discard-btn" title="Annuler">↩</button>' : ''}
</div>`

  return `<div class="st-file" data-path="${esc(f.path)}" data-staged="${isStaged}" data-untracked="${isUntracked}">
  <span class="st-file-status ${statusCls}">${esc(status)}</span>
  <span class="st-file-name" title="${esc(f.path)}">${esc(basename(f.path))}</span>
  ${actions}
</div>`
}

// ── Diff helpers ───────────────────────────────────────────────
function renderDiffLines(diff: string): string {
  return diff.split('\n').map(line => {
    let cls = 'diff-line'
    if (line.startsWith('+') && !line.startsWith('+++')) cls += ' diff-line--add'
    else if (line.startsWith('-') && !line.startsWith('---')) cls += ' diff-line--del'
    else if (line.startsWith('@@')) cls += ' diff-line--hunk'
    else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) cls += ' diff-line--meta'
    return `<span class="${cls}">${esc(line)}</span>`
  }).join('\n')
}

function extractFileDiff(diff: string, filePath: string): string {
  const sections: string[] = []
  const lines = diff.split('\n')
  let current: string[] = []
  for (const line of lines) {
    if (line.startsWith('diff --git') && current.length) {
      sections.push(current.join('\n'))
      current = []
    }
    current.push(line)
  }
  if (current.length) sections.push(current.join('\n'))
  return sections.find(s => s.includes(filePath)) ?? diff
}

// ── Utility ────────────────────────────────────────────────────
function formatDateFull(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

function basename(p: string): string {
  return p.split(/[/\\]/).pop() ?? p
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
