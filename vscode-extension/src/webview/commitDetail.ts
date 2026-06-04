// commitDetail.ts — Commit detail panel (files changed, diff viewer).

import type { CommitNode, FileChange } from '../types'
import { send, onMessage } from './ipc'

let _container: HTMLElement | undefined
let _currentHash: string | null = null
let _files: FileChange[] = []
let _currentDiff: string = ''

export function initCommitDetail(container: HTMLElement): void {
  _container = container

  onMessage(msg => {
    if (msg.type === 'commitFiles' && msg.hash === _currentHash) {
      _files = msg.files
      renderFiles()
    }
    if (msg.type === 'diff' && msg.hash === _currentHash) {
      _currentDiff = msg.diff
      renderDiff()
    }
  })
}

export function showCommit(commit: CommitNode): void {
  _currentHash = commit.hash
  _files = []
  _currentDiff = ''
  renderHeader(commit)
  send({ type: 'getCommitFiles', hash: commit.hash })
  send({ type: 'getDiff', hash: commit.hash })
}

export function clearDetail(): void {
  _currentHash = null
  if (_container) _container.innerHTML = ''
}

function renderHeader(commit: CommitNode): void {
  if (!_container) return
  const refs = (commit.refs ?? []).map(r => {
    const isTag = r.startsWith('tag:')
    const isRemote = r.includes('origin/')
    const cls = isTag ? 'cd-ref cd-ref--tag' : isRemote ? 'cd-ref cd-ref--remote' : 'cd-ref cd-ref--local'
    const label = r.replace(/^HEAD -> /, '').replace(/^tag: /, '')
    return `<span class="${cls}">${esc(label)}</span>`
  }).join('')

  _container.innerHTML = `
<style>
.cd-wrap { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.cd-header { padding: 12px 16px; border-bottom: 1px solid #21262d; flex-shrink: 0; }
.cd-hash { font-family: monospace; font-size: 12px; color: #8b949e; margin-bottom: 4px; }
.cd-message { font-size: 14px; font-weight: 600; color: #e6edf3; margin-bottom: 6px; word-break: break-word; }
.cd-meta { font-size: 12px; color: #8b949e; display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.cd-refs { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.cd-ref { font-size: 11px; padding: 1px 5px; border-radius: 3px; font-weight: 500; }
.cd-ref--local { background: #1b3a2d; color: #3fb950; border: 1px solid #2ea043; }
.cd-ref--remote { background: #1c2a3a; color: #58a6ff; border: 1px solid #388bfd; }
.cd-ref--tag { background: #3d2b00; color: #e3b341; border: 1px solid #9e6a03; }
.cd-body { flex: 1; display: flex; min-height: 0; overflow: hidden; }
.cd-files { width: 220px; flex-shrink: 0; border-right: 1px solid #21262d; overflow-y: auto; }
.cd-file { display: flex; align-items: center; gap: 6px; padding: 5px 10px; cursor: pointer; font-size: 12px; color: #e6edf3; border-bottom: 1px solid #161b22; }
.cd-file:hover { background: #161b22; }
.cd-file-status { font-size: 11px; font-weight: 700; width: 14px; flex-shrink: 0; }
.cd-file-status--A { color: #3fb950; }
.cd-file-status--M { color: #58a6ff; }
.cd-file-status--D { color: #f85149; }
.cd-file-status--R { color: #e3b341; }
.cd-file-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cd-diff { flex: 1; overflow-y: auto; padding: 0; font-family: monospace; font-size: 12px; line-height: 1.5; }
.cd-diff-empty { padding: 16px; color: #8b949e; }
.diff-line { white-space: pre; padding: 0 12px; display: block; min-width: max-content; }
.diff-line--add { background: #0d2a1a; color: #3fb950; }
.diff-line--del { background: #2a0d0d; color: #f85149; }
.diff-line--hunk { background: #161b22; color: #8b949e; }
.diff-line--meta { color: #8b949e; }
.cd-files-loading { padding: 12px; color: #8b949e; font-size: 12px; }
</style>
<div class="cd-wrap">
  <div class="cd-header">
    <div class="cd-hash">${esc(commit.shortHash)}</div>
    <div class="cd-message">${esc(commit.message)}</div>
    <div class="cd-meta">
      <span>${esc(commit.author)}</span>
      <span>${formatDate(commit.date)}</span>
    </div>
    <div class="cd-refs">${refs}</div>
  </div>
  <div class="cd-body">
    <div class="cd-files" id="cd-files-list"><div class="cd-files-loading">Loading...</div></div>
    <div class="cd-diff" id="cd-diff-content"><div class="cd-diff-empty">Select a file to view diff</div></div>
  </div>
</div>`
}

function renderFiles(): void {
  const listEl = _container?.querySelector('#cd-files-list') as HTMLElement | null
  if (!listEl) return

  if (!_files.length) {
    listEl.innerHTML = '<div class="cd-files-loading">No files changed</div>'
    return
  }

  listEl.innerHTML = _files.map((f, i) => `
<div class="cd-file" data-idx="${i}">
  <span class="cd-file-status cd-file-status--${f.status}">${esc(f.status)}</span>
  <span class="cd-file-name" title="${esc(f.path)}">${esc(f.path)}</span>
</div>`).join('')

  listEl.querySelectorAll('.cd-file').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.getAttribute('data-idx') ?? '0')
      showFileDiffInView(_files[idx])
    })
  })
}

function showFileDiffInView(file: FileChange): void {
  // Filter the cached diff to just this file's section
  if (!_currentDiff) {
    renderDiff()
    return
  }
  const sections = splitDiffByFile(_currentDiff)
  const section = sections.find(s => s.includes(file.path)) ?? ''
  renderDiffContent(section)
}

function renderDiff(): void {
  renderDiffContent(_currentDiff)
}

function renderDiffContent(diff: string): void {
  const el = _container?.querySelector('#cd-diff-content') as HTMLElement | null
  if (!el) return

  if (!diff.trim()) {
    el.innerHTML = '<div class="cd-diff-empty">No diff available</div>'
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

  el.innerHTML = `<code>${lines}</code>`
}

function splitDiffByFile(diff: string): string[] {
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
  return sections
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleString()
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
