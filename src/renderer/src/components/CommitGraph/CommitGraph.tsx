import React, { useCallback, useMemo, useRef, useState } from 'react'
import { LayoutCommit, computeGraphLayout, LANE_COLORS } from './graph-layout'
import { CommitNode } from '../../types'
import ContextMenu, { MenuItemDef } from '../ContextMenu/ContextMenu'
import './CommitGraph.css'

const ROW_HEIGHT = 34
const LANE_WIDTH = 18
const NODE_RADIUS = 5
const SVG_PAD_L = 8
const SVG_PAD_R = 6

function getAvatarColor(email: string) {
  let h = 0
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return LANE_COLORS[Math.abs(h) % LANE_COLORS.length]
}
function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}
function fmtDate(s: string) {
  try {
    return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return s }
}

interface ProcessedRef {
  display: string
  cls: string
  branchName?: string
  synced?: boolean
  tooltip?: string
}

function processRefs(refs: string[]): ProcessedRef[] {
  // Filter remote HEAD pointers (always redundant)
  const filtered = refs.filter(r => !/^(origin\/HEAD|remotes\/[^/]+\/HEAD)$/.test(r))

  const consumed = new Set<string>()
  const result: ProcessedRef[] = []

  // HEAD -> branch (current branch)
  for (const ref of filtered) {
    if (ref.includes('HEAD -> ')) {
      const branch = ref.replace('HEAD -> ', '')
      result.push({
        display: branch,
        cls: 'rc-head',
        branchName: branch,
        tooltip: branch,
      })
    }
  }

  // Tags
  for (const ref of filtered) {
    if (ref.startsWith('tag:')) {
      const name = ref.replace('tag: ', '')
      result.push({ display: name, cls: 'rc-tag', tooltip: name })
    }
  }

  // Remaining local branches
  for (const ref of filtered) {
    if (!ref.includes('HEAD -> ') && !ref.startsWith('tag:') &&
        !consumed.has(ref) && !ref.includes('origin/') && !ref.includes('remotes/')) {
      result.push({ display: ref, cls: 'rc-local', branchName: ref, tooltip: ref })
    }
  }

  // Remaining remote refs not merged
  for (const ref of filtered) {
    if (!ref.includes('HEAD -> ') && !ref.startsWith('tag:') &&
        !consumed.has(ref) && (ref.includes('origin/') || ref.includes('remotes/'))) {
      result.push({ display: ref, cls: 'rc-remote', branchName: ref, tooltip: ref })
    }
  }

  return result
}

function RefChip({ pref, onDoubleClick }: { pref: ProcessedRef; onDoubleClick?: (branchName: string) => void }) {
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (pref.cls === 'rc-tag' || !onDoubleClick || !pref.branchName) return
    onDoubleClick(pref.branchName)
  }

  return (
    <span
      className={`ref-chip ${pref.cls}${pref.synced ? ' rc-synced' : ''}`}
      onDoubleClick={handleDoubleClick}
      title={pref.tooltip}
      style={pref.cls !== 'rc-tag' ? { cursor: 'pointer' } : undefined}
    >
      {pref.cls === 'rc-head' && <span className="rc-star">★</span>}
      {pref.cls === 'rc-tag' && <span className="rc-icon">🏷</span>}
      {pref.cls === 'rc-remote' && <span className="rc-icon rc-cloud">↑</span>}
      {pref.display}
      {pref.synced && <span className="rc-sync-dot" title={`synced with origin/${pref.branchName}`} />}
    </span>
  )
}

interface CommitGraphProps {
  commits: CommitNode[]
  selectedHash: string | null
  onSelectCommit: (c: CommitNode) => void
  searchQuery: string
  currentBranch: string
  onCherryPick: (hash: string) => void
  onRevert: (hash: string) => void
  onReset: (hash: string, mode: 'soft' | 'mixed' | 'hard') => void
  onCreateTag: (hash: string) => void
  onCreateBranchAt: (hash: string) => void
  onCheckoutBranch?: (name: string) => void
  onInteractiveRebase?: (hash: string) => void
}

interface CtxState {
  x: number
  y: number
  commit: LayoutCommit
}

export default function CommitGraph({
  commits, selectedHash, onSelectCommit, searchQuery, currentBranch,
  onCherryPick, onRevert, onReset, onCreateTag, onCreateBranchAt, onCheckoutBranch, onInteractiveRebase
}: CommitGraphProps) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const layout = useMemo(() => computeGraphLayout(commits), [commits])
  const [ctx, setCtx] = useState<CtxState | null>(null)

  const maxLane = useMemo(() => layout.reduce((m, c) => Math.max(m, c.lane), 0), [layout])
  const svgW = Math.max(SVG_PAD_L + (maxLane + 1) * LANE_WIDTH + SVG_PAD_R, 62)
  const svgH = layout.length * ROW_HEIGHT

  const filtered = useMemo(() => {
    if (!searchQuery) return null
    const q = searchQuery.toLowerCase()
    return new Set(
      layout
        .filter(c =>
          c.message.toLowerCase().includes(q) ||
          c.author.toLowerCase().includes(q) ||
          c.shortHash.includes(q)
        )
        .map(c => c.row)
    )
  }, [layout, searchQuery])

  // ── Render edges in absolute coords ──────────────────────
  const renderEdge = useCallback(
    (commit: LayoutCommit, edge: typeof commit.edges[0]) => {
      const x1 = SVG_PAD_L + edge.fromLane * LANE_WIDTH
      const y1 = commit.row * ROW_HEIGHT + ROW_HEIGHT / 2
      const x2 = SVG_PAD_L + edge.toLane * LANE_WIDTH
      const y2 = edge.toRow * ROW_HEIGHT + ROW_HEIGHT / 2
      const key = `${commit.hash}-${edge.fromLane}-${edge.toLane}-${edge.toRow}`

      if (x1 === x2) {
        return (
          <line key={key} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={edge.color} strokeWidth={2} strokeLinecap="round" />
        )
      }
      const offset = Math.min(ROW_HEIGHT * 0.7, Math.abs(y2 - y1) * 0.5)
      return (
        <path key={key}
          d={`M${x1} ${y1} C${x1} ${y1 + offset},${x2} ${y2 - offset},${x2} ${y2}`}
          fill="none" stroke={edge.color} strokeWidth={2} strokeLinecap="round" />
      )
    },
    []
  )

  // ── Context menu items for a commit ───────────────────────
  const buildMenuItems = useCallback((commit: LayoutCommit): MenuItemDef[] => {
    const isHead = commit.refs.some(r => r.includes('HEAD ->') && r.includes(currentBranch))
    return [
      {
        label: '🌿 Créer une branche ici',
        action: () => onCreateBranchAt(commit.hash),
      },
      {
        label: '⚡ Interactive Rebase depuis ici',
        action: () => onInteractiveRebase?.(commit.hash),
      },
      { separator: true },
      {
        label: '🍒 Cherry-pick',
        action: () => onCherryPick(commit.hash),
        disabled: isHead,
      },
      {
        label: '↩ Revert',
        action: () => onRevert(commit.hash),
      },
      { separator: true },
      {
        label: '⏪ Reset (soft) — garde les changements indexés',
        action: () => onReset(commit.hash, 'soft'),
      },
      {
        label: '⏪ Reset (mixed) — garde les changements non-indexés',
        action: () => onReset(commit.hash, 'mixed'),
      },
      {
        label: '⏪ Reset (hard) — supprime tous les changements',
        action: () => onReset(commit.hash, 'hard'),
        danger: true,
      },
      { separator: true },
      {
        label: '🏷 Créer un tag ici',
        action: () => onCreateTag(commit.hash),
      },
      { separator: true },
      {
        label: '📋 Copier le hash court',
        action: () => navigator.clipboard.writeText(commit.shortHash),
      },
      {
        label: '📋 Copier le hash complet',
        action: () => navigator.clipboard.writeText(commit.hash),
      },
    ]
  }, [currentBranch, onCherryPick, onRevert, onReset, onCreateTag, onCreateBranchAt, onInteractiveRebase])

  const handleRowContextMenu = useCallback((e: React.MouseEvent, commit: LayoutCommit) => {
    e.preventDefault()
    e.stopPropagation()
    setCtx({ x: e.clientX, y: e.clientY, commit })
  }, [])

  return (
    <div className="cg-container">
      {/* ── Header ── */}
      <div className="cg-header">
        <div className="cg-h-graph" style={{ width: svgW }}>GRAPH</div>
        <div className="cg-h-msg">COMMIT MESSAGE</div>
        <div className="cg-h-author">AUTHOR</div>
        <div className="cg-h-date">DATE</div>
        <div className="cg-h-sha">SHA</div>
      </div>

      {/* ── Body ── */}
      <div className="cg-body" ref={bodyRef}>
        <div className="cg-scroll-content" style={{ height: svgH, position: 'relative' }}>

          {/* Single SVG overlay */}
          <svg
            className="cg-graph-svg"
            width={svgW}
            height={svgH}
            style={{
              position: 'absolute', left: 0, top: 0,
              pointerEvents: 'none', zIndex: 2, overflow: 'visible'
            }}
          >
            {layout.flatMap(commit =>
              commit.edges.map(edge => renderEdge(commit, edge))
            )}
            {layout.map(commit => {
              const cx = SVG_PAD_L + commit.lane * LANE_WIDTH
              const cy = commit.row * ROW_HEIGHT + ROW_HEIGHT / 2
              const isSelected = commit.hash === selectedHash
              return (
                <g key={commit.hash}>
                  <circle cx={cx} cy={cy} r={NODE_RADIUS} fill={commit.color} />
                  <circle cx={cx} cy={cy} r={NODE_RADIUS - 2.5}
                    fill={isSelected ? '#ffffff55' : '#0d1117'} />
                </g>
              )
            })}
          </svg>

          {/* Rows */}
          {layout.map(commit => {
            const isSelected = commit.hash === selectedHash
            const isDimmed = filtered !== null && !filtered.has(commit.row)

            return (
              <div
                key={commit.hash}
                className={`cg-row ${isSelected ? 'cg-selected' : ''} ${isDimmed ? 'cg-dimmed' : ''}`}
                style={{ top: commit.row * ROW_HEIGHT }}
                onClick={() => onSelectCommit(commit)}
                onContextMenu={e => handleRowContextMenu(e, commit)}
              >
                <div style={{ width: svgW, flexShrink: 0, height: ROW_HEIGHT }} />

                <div className="cg-col-msg">
                  {commit.refs.length > 0 && (() => {
                    const prefs = processRefs(commit.refs)
                    const MAX_CHIPS = 3
                    const visible = prefs.slice(0, MAX_CHIPS)
                    const overflow = prefs.length - MAX_CHIPS
                    return (
                      <div className="cg-refs">
                        {visible.map((p, i) => <RefChip key={i} pref={p} onDoubleClick={onCheckoutBranch} />)}
                        {overflow > 0 && (
                          <span
                            className="ref-chip rc-overflow"
                            title={prefs.slice(MAX_CHIPS).map(p => p.tooltip || p.display).join(', ')}
                          >
                            +{overflow}
                          </span>
                        )}
                      </div>
                    )
                  })()}
                  <span className="cg-msg">{commit.message}</span>
                </div>

                <div className="cg-col-author">
                  <div className="cg-avatar" style={{ background: getAvatarColor(commit.authorEmail) }}>
                    {initials(commit.author)}
                  </div>
                  <span className="cg-author-name">{commit.author}</span>
                </div>

                <div className="cg-col-date">{fmtDate(commit.date)}</div>
                <div className="cg-col-sha"><code>{commit.shortHash}</code></div>
              </div>
            )
          })}
        </div>

        {layout.length === 0 && (
          <div className="cg-empty">Aucun commit à afficher</div>
        )}
      </div>

      {/* Context menu */}
      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          items={buildMenuItems(ctx.commit)}
          onClose={() => setCtx(null)}
        />
      )}
    </div>
  )
}
