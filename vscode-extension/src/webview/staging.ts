// staging.ts — Staging area panel (stage/unstage files, commit).

import type { WorkingChanges, WorkingFile } from '../types'
import { send, onMessage } from './ipc'

let _container: HTMLElement | undefined
let _changes: WorkingChanges = { staged: [], unstaged: [], untracked: [] }
let _onOpResult: ((op: string, success: boolean, error?: string) => void) | undefined
let _diffContainer: HTMLElement | undefined

export function initStaging(
  container: HTMLElement,
  diffContainer: HTMLElement,
  onOpResult?: (op: string, success: boolean, error?: string) => void
): void {
  _container = container
  _diffContainer = diffContainer
  _onOpResult = onOpResult

  onMessage(msg => {
    if (msg.type === 'workingChanges') {
      _changes = msg.changes
      renderStaging()
    }
    if (msg.type === 'workingFileDiff') {
      renderFileDiff(msg.diff, msg.filepath, msg.staged)
    }
    if (msg.type === 'opResult') {
      if (_onOpResult) _onOpResult(msg.op, msg.success, msg.error)
    }
  })
}

export function refreshChanges(): void {
  send({ type: 'getWorkingChanges' })
}

function renderStaging(): void {
  if (!_container) return

  const { staged, unstaged, untracked } = _changes
  const totalUnstaged = unstaged.length + untracked.length

  _container.innerHTML = `
<style>
.st-wrap { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.st-section { flex-shrink: 0; }
.st-section-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 10px; background: #161b22; border-bottom: 1px solid #21262d;
  font-size: 11px; font-weight: 600; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px;
}
.st-section-actions { display: flex; gap: 4px; }
.st-btn {
  background: #21262d; border: 1px solid #30363d; color: #e6edf3;
  font-size: 11px; padding: 2px 7px; border-radius: 4px; cursor: pointer;
}
.st-btn:hover { background: #30363d; }
.st-btn--green { background: #1b3a2d; border-color: #2ea043; color: #3fb950; }
.st-btn--green:hover { background: #2ea043; color: #fff; }
.st-btn--red { background: #2a0d0d; border-color: #f85149; color: #f85149; }
.st-btn--red:hover { background: #f85149; color: #fff; }
.st-file-list { max-height: 120px; overflow-y: auto; }
.st-file { display: flex; align-items: center; gap: 6px; padding: 3px 10px; cursor: pointer; font-size: 12px; border-bottom: 1px solid #161b22; }
.st-file:hover { background: #1c2128; }
.st-file-status { font-size: 10px; font-weight: 700; width: 12px; flex-shrink: 0; }
.st-file-status--A { color: #3fb950; }
.st-file-status--M { color: #58a6ff; }
.st-file-status--D { color: #f85149; }
.st-file-status--U { color: #f0883e; }
.st-file-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #e6edf3; }
.st-file-actions { display: flex; gap: 3px; opacity: 0; transition: opacity 0.1s; }
.st-file:hover .st-file-actions { opacity: 1; }
.st-commit-area { flex-shrink: 0; padding: 8px 10px; border-top: 1px solid #21262d; }
.st-commit-input {
  width: 100%; background: #0d1117; border: 1px solid #30363d; color: #e6edf3;
  padding: 6px 8px; border-radius: 4px; font-size: 12px; resize: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.st-commit-input:focus { outline: none; border-color: #58a6ff; }
.st-commit-row { display: flex; gap: 6px; margin-top: 6px; align-items: center; }
.st-commit-btn {
  background: #1b3a2d; border: 1px solid #2ea043; color: #3fb950;
  font-size: 12px; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-weight: 600;
}
.st-commit-btn:hover { background: #2ea043; color: #fff; }
.st-commit-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.st-error { color: #f85149; font-size: 11px; margin-top: 4px; }
.st-count { font-size: 10px; background: #21262d; border-radius: 10px; padding: 1px 5px; color: #8b949e; }
.st-empty { padding: 6px 10px; font-size: 11px; color: #8b949e; font-style: italic; }
</style>
<div class="st-wrap">
  <div class="st-section">
    <div class="st-section-header">
      <span>Staged <span class="st-count">${staged.length}</span></span>
      <div class="st-section-actions">
        ${staged.length > 0 ? '<button class="st-btn st-btn--red" id="unstage-all-btn">Unstage All</button>' : ''}
      </div>
    </div>
    <div class="st-file-list" id="staged-list">
      ${staged.length === 0
        ? '<div class="st-empty">No staged files</div>'
        : staged.map(f => renderFileRow(f, true)).join('')
      }
    </div>
  </div>

  <div class="st-section">
    <div class="st-section-header">
      <span>Unstaged <span class="st-count">${totalUnstaged}</span></span>
      <div class="st-section-actions">
        ${totalUnstaged > 0 ? '<button class="st-btn st-btn--green" id="stage-all-btn">Stage All</button>' : ''}
      </div>
    </div>
    <div class="st-file-list" id="unstaged-list">
      ${totalUnstaged === 0
        ? '<div class="st-empty">No changed files</div>'
        : [
            ...unstaged.map(f => renderFileRow(f, false)),
            ...untracked.map(p => renderFileRow({ path: p, status: 'U' }, false, true))
          ].join('')
      }
    </div>
  </div>

  <div class="st-commit-area">
    <textarea class="st-commit-input" id="commit-msg" rows="3" placeholder="Commit message…"></textarea>
    <div class="st-commit-row">
      <button class="st-commit-btn" id="commit-btn" ${staged.length === 0 ? 'disabled' : ''}>Commit</button>
      <div class="st-error" id="commit-error"></div>
    </div>
  </div>
</div>`

  // Bind events
  const stageAllBtn = _container.querySelector('#stage-all-btn')
  stageAllBtn?.addEventListener('click', () => send({ type: 'stageAll' }))

  const unstageAllBtn = _container.querySelector('#unstage-all-btn')
  unstageAllBtn?.addEventListener('click', () => {
    const paths = staged.map(f => f.path)
    send({ type: 'unstage', files: paths })
  })

  const commitBtn = _container.querySelector('#commit-btn') as HTMLButtonElement | null
  commitBtn?.addEventListener('click', () => {
    const msg = (_container?.querySelector('#commit-msg') as HTMLTextAreaElement)?.value?.trim()
    if (!msg) {
      const err = _container?.querySelector('#commit-error')
      if (err) err.textContent = 'Commit message required'
      return
    }
    send({ type: 'commit', message: msg })
    const err = _container?.querySelector('#commit-error')
    if (err) err.textContent = ''
  })

  // Stage/unstage individual files
  _container.querySelectorAll('.st-file[data-path]').forEach(el => {
    const path = el.getAttribute('data-path')!
    const isStagedFile = el.getAttribute('data-staged') === 'true'

    // Click row = show diff
    el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement
      if (target.closest('.st-file-actions')) return
      send({ type: 'getWorkingFileDiff', filepath: path, staged: isStagedFile })
    })

    // Stage/unstage button
    const actionBtn = el.querySelector('.st-file-action-btn') as HTMLElement | null
    actionBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      if (isStagedFile) {
        send({ type: 'unstage', files: [path] })
      } else {
        send({ type: 'stage', files: [path] })
      }
    })

    // Discard button (only on unstaged)
    const discardBtn = el.querySelector('.st-file-discard-btn') as HTMLElement | null
    discardBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      send({ type: 'discardFile', file: path })
    })
  })
}

function renderFileRow(f: WorkingFile, isStaged: boolean, isUntracked = false): string {
  const statusCls = `st-file-status--${isUntracked ? 'U' : f.status === 'D' ? 'D' : f.status === 'A' ? 'A' : 'M'}`
  const statusLabel = isUntracked ? '?' : f.status
  const actionLabel = isStaged ? '−' : '+'
  const actions = `
<div class="st-file-actions">
  <button class="st-btn st-file-action-btn" title="${isStaged ? 'Unstage' : 'Stage'}">${actionLabel}</button>
  ${!isStaged && !isUntracked ? '<button class="st-btn st-btn--red st-file-discard-btn" title="Discard">↩</button>' : ''}
</div>`

  return `<div class="st-file" data-path="${esc(f.path)}" data-staged="${isStaged}">
  <span class="st-file-status ${statusCls}">${esc(statusLabel)}</span>
  <span class="st-file-name" title="${esc(f.path)}">${esc(f.path)}</span>
  ${actions}
</div>`
}

function renderFileDiff(diff: string, filepath: string, staged: boolean): void {
  if (!_diffContainer) return
  if (!diff.trim()) {
    _diffContainer.innerHTML = `<div style="padding:12px;color:#8b949e;font-size:12px">No diff for ${esc(filepath)}</div>`
    return
  }

  const lines = diff.split('\n').map(line => {
    let cls = 'diff-line'
    if (line.startsWith('+') && !line.startsWith('+++')) cls += ' diff-line--add'
    else if (line.startsWith('-') && !line.startsWith('---')) cls += ' diff-line--del'
    else if (line.startsWith('@@')) cls += ' diff-line--hunk'
    else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) cls += ' diff-line--meta'
    return `<span class="${cls}">${esc(line)}</span>`
  }).join('\n')

  _diffContainer.innerHTML = `
<style>
.diff-line { white-space: pre; padding: 0 12px; display: block; min-width: max-content; font-family: monospace; font-size: 12px; line-height: 1.5; }
.diff-line--add { background: #0d2a1a; color: #3fb950; }
.diff-line--del { background: #2a0d0d; color: #f85149; }
.diff-line--hunk { background: #161b22; color: #8b949e; }
.diff-line--meta { color: #8b949e; }
</style>
<div style="font-size:11px;color:#8b949e;padding:6px 12px;border-bottom:1px solid #21262d">${esc(filepath)}${staged ? ' (staged)' : ''}</div>
<code style="display:block;overflow-x:auto">${lines}</code>`
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
