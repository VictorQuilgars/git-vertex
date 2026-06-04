// graph.ts — SVG commit graph renderer for the webview.

import type { CommitNode, GraphEdge } from '../types'
import { send, onMessage } from './ipc'

export const LANE_WIDTH = 18
export const ROW_HEIGHT = 34
const SVG_PAD_L = 10
const SVG_PAD_R = 6
const NODE_RADIUS = 5

interface LayoutCommit extends CommitNode {
  lane: number
  color: string
  edges: GraphEdge[]
  row: number
}

let _commits: LayoutCommit[] = []
let _selectedHash: string | null = null
let _onSelectCommit: ((c: LayoutCommit) => void) | undefined
let _graphEl: HTMLElement | undefined

export function initGraph(container: HTMLElement, onSelect: (c: LayoutCommit) => void): void {
  _graphEl = container
  _onSelectCommit = onSelect

  onMessage(msg => {
    if (msg.type === 'log') {
      _commits = msg.commits as LayoutCommit[]
      renderGraph()
    }
  })
}

export function filterCommits(query: string): void {
  if (!query.trim()) {
    // Reset — request full log
    send({ type: 'getLog' })
    return
  }
  send({ type: 'search', query })
}

export function getCommits(): LayoutCommit[] {
  return _commits
}

export function selectCommit(hash: string): void {
  _selectedHash = hash
  renderGraph()
}

function renderGraph(): void {
  if (!_graphEl) return

  const commits = _commits
  if (!commits.length) {
    _graphEl.innerHTML = '<div style="padding:16px;color:#8b949e">No commits to display.</div>'
    return
  }

  const maxLane = commits.reduce((m, c) => Math.max(m, (c.lane ?? 0)), 0)
  const svgW = Math.max(SVG_PAD_L + (maxLane + 1) * LANE_WIDTH + SVG_PAD_R, 62)
  const svgH = commits.length * ROW_HEIGHT

  // Build SVG for graph lanes/edges
  let edgePaths = ''
  let nodes = ''

  for (const commit of commits) {
    const lane = commit.lane ?? 0
    const row = commit.row ?? 0
    const cx = SVG_PAD_L + lane * LANE_WIDTH
    const cy = row * ROW_HEIGHT + ROW_HEIGHT / 2
    const color = commit.color ?? '#4d9de0'

    // Draw edges from this commit to each parent
    for (const edge of (commit.edges ?? [])) {
      const fromCx = SVG_PAD_L + edge.fromLane * LANE_WIDTH
      const fromCy = cy
      const toRow = edge.toRow
      const toCx = SVG_PAD_L + edge.toLane * LANE_WIDTH
      const toCy = toRow * ROW_HEIGHT + ROW_HEIGHT / 2
      const ec = edge.color

      let d: string
      if (edge.type === 'straight') {
        d = `M${fromCx},${fromCy} L${toCx},${toCy}`
      } else if (edge.type === 'fork-left' || edge.type === 'fork-right') {
        // Elbow at the bottom (this commit's row): go straight down then curve
        const midY = fromCy + ROW_HEIGHT * 0.6
        d = `M${fromCx},${fromCy} L${fromCx},${midY} Q${fromCx},${toCy} ${toCx},${toCy}`
      } else {
        // merge-left / merge-right: elbow at the top (this commit's row)
        const midY = fromCy + ROW_HEIGHT * 0.4
        d = `M${toCx},${toCy} L${toCx},${midY} Q${toCx},${fromCy} ${fromCx},${fromCy}`
      }
      edgePaths += `<path d="${d}" stroke="${ec}" stroke-width="2" fill="none" opacity="0.85"${edge.dashed ? ' stroke-dasharray="4,3"' : ''}/>`
    }

    // Draw commit node
    const isSelected = commit.hash === _selectedHash
    nodes += `<circle cx="${cx}" cy="${cy}" r="${NODE_RADIUS}" fill="${color}" stroke="${isSelected ? '#ffffff' : color}" stroke-width="${isSelected ? 2.5 : 1.5}" data-hash="${commit.hash}" style="cursor:pointer"/>`
  }

  const svgMarkup = `<svg width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg">${edgePaths}${nodes}</svg>`

  // Build rows HTML
  let rowsHtml = ''
  for (const commit of commits) {
    const isSelected = commit.hash === _selectedHash
    const refs = (commit.refs ?? []).map(r => {
      const isHead = r.startsWith('HEAD')
      const isRemote = r.includes('origin/') || r.startsWith('remotes/')
      const isTag = r.startsWith('tag:')
      let cls = 'gv-ref'
      if (isHead) cls += ' gv-ref--head'
      else if (isTag) cls += ' gv-ref--tag'
      else if (isRemote) cls += ' gv-ref--remote'
      else cls += ' gv-ref--local'
      const label = r.replace(/^HEAD -> /, '').replace(/^tag: /, '')
      return `<span class="${cls}">${escHtml(label)}</span>`
    }).join('')

    const date = formatDate(commit.date)
    const bg = isSelected ? '#1c2128' : 'transparent'
    rowsHtml += `<div class="gv-row${isSelected ? ' gv-row--selected' : ''}" data-hash="${commit.hash}" style="background:${bg}">
  <div class="gv-row-graph" style="width:${svgW}px"></div>
  <div class="gv-row-info">
    <span class="gv-message">${escHtml(commit.message)}</span>
    ${refs}
    <span class="gv-meta">${escHtml(commit.author)} · ${date}</span>
  </div>
</div>`
  }

  _graphEl.innerHTML = `
<style>
.gv-graph-wrap { display: flex; flex-direction: column; width: 100%; }
.gv-graph-svg-col { position: relative; flex-shrink: 0; }
.gv-graph-svg-col svg { position: sticky; left: 0; display: block; }
.gv-rows { flex: 1; min-width: 0; }
.gv-row {
  display: flex; align-items: center; height: ${ROW_HEIGHT}px;
  padding: 0 8px 0 0; cursor: pointer; border-bottom: 1px solid #21262d;
  gap: 0;
}
.gv-row:hover { background: #161b22 !important; }
.gv-row--selected { background: #1c2128 !important; }
.gv-row-graph { flex-shrink: 0; height: ${ROW_HEIGHT}px; }
.gv-row-info { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; overflow: hidden; padding-left: 6px; }
.gv-message { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #e6edf3; }
.gv-meta { font-size: 11px; color: #8b949e; white-space: nowrap; flex-shrink: 0; }
.gv-ref { font-size: 11px; padding: 1px 5px; border-radius: 3px; white-space: nowrap; flex-shrink: 0; font-weight: 500; }
.gv-ref--local { background: #1b3a2d; color: #3fb950; border: 1px solid #2ea043; }
.gv-ref--remote { background: #1c2a3a; color: #58a6ff; border: 1px solid #388bfd; }
.gv-ref--head { background: #2d1f6e; color: #d2a8ff; border: 1px solid #8957e5; }
.gv-ref--tag { background: #3d2b00; color: #e3b341; border: 1px solid #9e6a03; }
</style>
<div class="gv-graph-wrap" style="position:relative">
  <div style="display:flex;flex-direction:column">
    ${commits.map((c, i) => {
      const isSelected = c.hash === _selectedHash
      const refs = (c.refs ?? []).map(r => {
        const isHead = r.startsWith('HEAD')
        const isTag = r.startsWith('tag:')
        const isRemote = r.includes('origin/') || r.startsWith('remotes/')
        let cls = 'gv-ref'
        if (isHead) cls += ' gv-ref--head'
        else if (isTag) cls += ' gv-ref--tag'
        else if (isRemote) cls += ' gv-ref--remote'
        else cls += ' gv-ref--local'
        const label = r.replace(/^HEAD -> /, '').replace(/^tag: /, '')
        return `<span class="${cls}">${escHtml(label)}</span>`
      }).join('')
      const date = formatDate(c.date)
      const lane = c.lane ?? 0
      const cy = ROW_HEIGHT / 2
      const cx = SVG_PAD_L + lane * LANE_WIDTH
      const color = c.color ?? '#4d9de0'

      // Edge paths for this row only (so SVG is per-row inline)
      let rowEdges = ''
      for (const edge of (c.edges ?? [])) {
        const fCx = SVG_PAD_L + edge.fromLane * LANE_WIDTH
        const fCy = cy
        const toRow = edge.toRow
        const tCx = SVG_PAD_L + edge.toLane * LANE_WIDTH
        const tCy = (toRow - i) * ROW_HEIGHT + ROW_HEIGHT / 2
        const ec = edge.color
        let d: string
        if (edge.type === 'straight') {
          d = `M${fCx},${fCy} L${tCx},${tCy}`
        } else if (edge.type === 'fork-left' || edge.type === 'fork-right') {
          const midY = fCy + ROW_HEIGHT * 0.6
          d = `M${fCx},${fCy} L${fCx},${midY} Q${fCx},${tCy} ${tCx},${tCy}`
        } else {
          const midY = fCy + ROW_HEIGHT * 0.4
          d = `M${tCx},${tCy} L${tCx},${midY} Q${tCx},${fCy} ${fCx},${fCy}`
        }
        rowEdges += `<path d="${d}" stroke="${ec}" stroke-width="2" fill="none" opacity="0.85"${edge.dashed ? ' stroke-dasharray="4,3"' : ''}/>`
      }

      return `<div class="gv-row${isSelected ? ' gv-row--selected' : ''}" data-hash="${c.hash}" style="background:${isSelected ? '#1c2128' : 'transparent'}">
  <svg width="${svgW}" height="${ROW_HEIGHT}" style="flex-shrink:0;display:block" xmlns="http://www.w3.org/2000/svg" overflow="visible">
    ${rowEdges}
    <circle cx="${cx}" cy="${cy}" r="${NODE_RADIUS}" fill="${color}" stroke="${isSelected ? '#ffffff' : color}" stroke-width="${isSelected ? 2.5 : 1.5}"/>
  </svg>
  <div class="gv-row-info">
    <span class="gv-message">${escHtml(c.message)}</span>
    ${refs}
    <span class="gv-meta">${escHtml(c.author)} · ${date}</span>
  </div>
</div>`
    }).join('')}
  </div>
</div>`

  // Attach click handlers
  _graphEl.querySelectorAll('.gv-row').forEach(el => {
    el.addEventListener('click', () => {
      const hash = el.getAttribute('data-hash')
      if (!hash) return
      _selectedHash = hash
      const commit = _commits.find(c => c.hash === hash)
      if (commit && _onSelectCommit) _onSelectCommit(commit)
      // Re-render to update selection highlight
      renderGraph()
    })
  })
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const now = Date.now()
  const diff = now - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString()
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
