// graph.ts — GitLens-style commit table renderer (SVG graph | message+chips | author | date | SHA | ±bar).

import type { CommitNode, GraphEdge } from '../types'
import { send, onMessage } from './ipc'

// ── Constants ──────────────────────────────────────────────────
export const LANE_WIDTH = 18
export const ROW_HEIGHT = 28
const SVG_PAD_L = 10
const SVG_PAD_R = 6
const NODE_RADIUS = 5

export const LANE_COLORS = [
  '#2dd4bf', '#4d9de0', '#9b59b6', '#e879f9',
  '#22d3ee', '#818cf8', '#a78bfa', '#34d399',
  '#60a5fa', '#f472b6',
]

// ── State ──────────────────────────────────────────────────────
interface LayoutCommit extends CommitNode {
  lane: number
  color: string
  edges: GraphEdge[]
  row: number
}

let _commits: LayoutCommit[] = []
let _selectedHash: string | null = null
let _onSelectCommit: ((c: LayoutCommit) => void) | undefined
let _tableScrollEl: HTMLElement | undefined

// ── Init ───────────────────────────────────────────────────────
export function initGraph(
  container: HTMLElement,
  onSelect: (c: LayoutCommit) => void
): void {
  _tableScrollEl = container
  _onSelectCommit = onSelect

  onMessage(msg => {
    if (msg.type === 'log') {
      _commits = msg.commits as LayoutCommit[]
      renderTable()
    }
  })
}

export function filterCommits(query: string): void {
  if (!query.trim()) {
    send({ type: 'getLog' })
    return
  }
  send({ type: 'search', query })
}

export function selectCommit(hash: string): void {
  _selectedHash = hash
  // Update highlight without full re-render for performance
  if (_tableScrollEl) {
    _tableScrollEl.querySelectorAll<HTMLElement>('.gv-commit-row').forEach(el => {
      const h = el.dataset.hash
      if (h === hash) el.classList.add('gv-commit-row--selected')
      else el.classList.remove('gv-commit-row--selected')
    })
  }
}

// ── Graph SVG width ────────────────────────────────────────────
function svgWidth(commits: LayoutCommit[]): number {
  const maxLane = commits.reduce((m, c) => Math.max(m, c.lane ?? 0), 0)
  return Math.max(SVG_PAD_L + (maxLane + 1) * LANE_WIDTH + SVG_PAD_R, 40)
}

// ── SVG for one row ────────────────────────────────────────────
function rowSvg(commit: LayoutCommit, svgW: number, rowIndex: number): string {
  const lane = commit.lane ?? 0
  const cx = SVG_PAD_L + lane * LANE_WIDTH
  const cy = ROW_HEIGHT / 2
  const color = commit.color ?? '#4d9de0'
  const isSelected = commit.hash === _selectedHash

  let paths = ''
  for (const edge of (commit.edges ?? [])) {
    const fCx = SVG_PAD_L + edge.fromLane * LANE_WIDTH
    const fCy = cy
    const tCx = SVG_PAD_L + edge.toLane * LANE_WIDTH
    // toRow is an absolute row index; we need relative to this row
    const relRows = edge.toRow - rowIndex
    const tCy = relRows * ROW_HEIGHT + ROW_HEIGHT / 2
    const ec = edge.color

    let d: string
    if (edge.type === 'straight') {
      d = `M${fCx},${fCy} L${tCx},${tCy}`
    } else if (edge.type === 'fork-left' || edge.type === 'fork-right') {
      const midY = fCy + ROW_HEIGHT * 0.6
      d = `M${fCx},${fCy} L${fCx},${midY} Q${fCx},${tCy} ${tCx},${tCy}`
    } else {
      // merge-left / merge-right
      const midY = fCy + ROW_HEIGHT * 0.4
      d = `M${tCx},${tCy} L${tCx},${midY} Q${tCx},${fCy} ${fCx},${fCy}`
    }
    paths += `<path d="${d}" stroke="${ec}" stroke-width="2" fill="none" opacity="0.85"${edge.dashed ? ' stroke-dasharray="4,3"' : ''}/>`
  }

  const nodeStroke = isSelected ? '#ffffff' : color
  const nodeStrokeW = isSelected ? 2.5 : 1.5
  const circle = `<circle cx="${cx}" cy="${cy}" r="${NODE_RADIUS}" fill="${color}" stroke="${nodeStroke}" stroke-width="${nodeStrokeW}"/>`

  return `<svg width="${svgW}" height="${ROW_HEIGHT}" style="flex-shrink:0;display:block;overflow:visible" xmlns="http://www.w3.org/2000/svg">${paths}${circle}</svg>`
}

// ── Ref chips ─────────────────────────────────────────────────
function refChips(refs: string[]): string {
  return refs.map(r => {
    const isHead = r.startsWith('HEAD')
    const isTag = r.startsWith('tag:')
    const isRemote = r.includes('origin/') || r.startsWith('remotes/')
    let cls = 'gv-ref'
    if (isHead) cls += ' gv-ref--head'
    else if (isTag) cls += ' gv-ref--tag'
    else if (isRemote) cls += ' gv-ref--remote'
    else cls += ' gv-ref--local'
    const label = r.replace(/^HEAD -> /, '').replace(/^tag: /, '')
    return `<span class="${cls}">${esc(label)}</span>`
  }).join('')
}

// ── Author initials avatar ─────────────────────────────────────
function avatarHtml(author: string): string {
  const parts = author.trim().split(/\s+/)
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : author.substring(0, 2).toUpperCase()
  // Simple hash to pick a background color
  let h = 0
  for (let i = 0; i < author.length; i++) h = (h * 31 + author.charCodeAt(i)) & 0xffff
  const colors = ['#2dd4bf', '#4d9de0', '#9b59b6', '#22d3ee', '#3fb950', '#f472b6', '#e879f9', '#34d399']
  const bg = colors[h % colors.length]
  return `<span class="gv-avatar" style="background:${bg};color:#fff">${esc(initials)}</span>`
}

// ── Date ───────────────────────────────────────────────────────
function relativeDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'maintenant'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}j`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo`
  return `${Math.floor(months / 12)}a`
}

// ── Main render ────────────────────────────────────────────────
function renderTable(): void {
  if (!_tableScrollEl) return

  const commits = _commits
  if (!commits.length) {
    _tableScrollEl.innerHTML = '<div class="gv-placeholder"><span class="gv-placeholder-icon">⎔</span><span>Aucun commit à afficher</span></div>'
    return
  }

  const sw = svgWidth(commits)

  // Update table header graph column width
  const thGraph = document.getElementById('gv-th-graph')
  if (thGraph) thGraph.style.width = `${sw}px`

  const rows = commits.map((c, i) => {
    const isSelected = c.hash === _selectedHash
    const svg = rowSvg(c, sw, i)
    const chips = refChips(c.refs ?? [])
    const avatar = avatarHtml(c.author)
    const date = relativeDate(c.date)
    const sha = esc(c.shortHash)
    const bg = isSelected ? 'background:#1c2128' : ''

    return `<div class="gv-commit-row${isSelected ? ' gv-commit-row--selected' : ''}" data-hash="${esc(c.hash)}" style="${bg}">
  <div class="gv-td gv-td--graph">${svg}</div>
  <div class="gv-td gv-td--message">
    <span class="gv-msg-text" title="${esc(c.message)}">${esc(c.message)}</span>
    ${chips}
  </div>
  <div class="gv-td gv-td--author">${avatar}<span style="overflow:hidden;text-overflow:ellipsis">${esc(c.author)}</span></div>
  <div class="gv-td gv-td--date">${date}</div>
  <div class="gv-td gv-td--sha">${sha}</div>
  <div class="gv-td gv-td--bar"></div>
</div>`
  }).join('')

  _tableScrollEl.innerHTML = rows

  // Bind click handlers
  _tableScrollEl.querySelectorAll<HTMLElement>('.gv-commit-row').forEach(el => {
    el.addEventListener('click', () => {
      const hash = el.dataset.hash
      if (!hash) return
      _selectedHash = hash
      const commit = _commits.find(c => c.hash === hash)
      if (commit && _onSelectCommit) _onSelectCommit(commit)
      // Update selection highlight
      _tableScrollEl!.querySelectorAll<HTMLElement>('.gv-commit-row').forEach(r => {
        r.classList.toggle('gv-commit-row--selected', r.dataset.hash === hash)
        r.style.background = r.dataset.hash === hash ? '#1c2128' : ''
      })
    })
  })
}

// ── Helpers ────────────────────────────────────────────────────
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
