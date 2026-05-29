import React, { useCallback, useMemo, useRef, useState } from 'react'
import { LayoutCommit, computeGraphLayout, LANE_COLORS } from './graph-layout'
import { CommitNode } from '../../types'
import ContextMenu, { MenuItemDef } from '../ContextMenu/ContextMenu'
import { useLang } from '../../i18n/LanguageContext'
import './CommitGraph.css'

const ROW_HEIGHT  = 40
const LANE_WIDTH  = 22
const NODE_RADIUS = 11
const REFS_COL_W  = 164
const SVG_PAD_L   = 10
const SVG_PAD_R   = 8
const WIP_HASH    = '__WIP__'

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
  tooltip?: string
}

function processRefs(refs: string[]): ProcessedRef[] {
  const filtered = refs.filter(r => !/^(origin\/HEAD|remotes\/[^/]+\/HEAD)$/.test(r))
  const result: ProcessedRef[] = []
  const consumed = new Set<string>()

  for (const ref of filtered) {
    if (ref.includes('HEAD -> ')) {
      const branch = ref.replace('HEAD -> ', '')
      result.push({ display: branch, cls: 'rc-head', branchName: branch, tooltip: branch })
      consumed.add(branch)
    }
  }
  for (const ref of filtered) {
    if (ref.startsWith('tag:')) {
      const name = ref.replace('tag: ', '')
      result.push({ display: name, cls: 'rc-tag', tooltip: name })
    }
  }
  for (const ref of filtered) {
    if (!ref.includes('HEAD -> ') && !ref.startsWith('tag:') &&
        !consumed.has(ref) && !ref.includes('origin/') && !ref.includes('remotes/')) {
      result.push({ display: ref, cls: 'rc-local', branchName: ref, tooltip: ref })
    }
  }
  for (const ref of filtered) {
    if (!ref.includes('HEAD -> ') && !ref.startsWith('tag:') &&
        !consumed.has(ref) && (ref.includes('origin/') || ref.includes('remotes/'))) {
      result.push({ display: ref, cls: 'rc-remote', branchName: ref, tooltip: ref })
    }
  }
  return result
}

function RefChip({ pref, onDoubleClick }: {
  pref: ProcessedRef
  onDoubleClick?: (name: string) => void
}) {
  return (
    <span
      className={`ref-chip ${pref.cls}`}
      title={pref.tooltip}
      onDoubleClick={e => {
        e.stopPropagation()
        if (pref.cls !== 'rc-tag' && onDoubleClick && pref.branchName) {
          onDoubleClick(pref.branchName)
        }
      }}
      style={pref.cls !== 'rc-tag' ? { cursor: 'pointer' } : undefined}
    >
      {pref.cls === 'rc-head'   && <span className="rc-star">★</span>}
      {pref.cls === 'rc-tag'    && <span className="rc-icon">🏷</span>}
      {pref.cls === 'rc-remote' && <span className="rc-icon rc-cloud">↑</span>}
      {pref.display}
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
  wipCount?: number
}

interface CtxState { x: number; y: number; commit: LayoutCommit }

export default function CommitGraph({
  commits, selectedHash, onSelectCommit, searchQuery, currentBranch,
  onCherryPick, onRevert, onReset, onCreateTag, onCreateBranchAt,
  onCheckoutBranch, onInteractiveRebase, wipCount = 0,
}: CommitGraphProps) {
  const { t } = useLang()
  const bodyRef = useRef<HTMLDivElement>(null)
  const layout = useMemo(() => computeGraphLayout(commits), [commits])
  const [ctx, setCtx] = useState<CtxState | null>(null)

  // Prepend WIP virtual commit when working directory has changes
  const displayLayout = useMemo((): LayoutCommit[] => {
    const shifted = layout.map(c => ({
      ...c,
      row: c.row + (wipCount > 0 ? 1 : 0),
      edges: c.edges.map(e => ({
        ...e,
        toRow: e.toRow + (wipCount > 0 ? 1 : 0),
      })),
    }))

    if (!wipCount) return shifted

    const first = shifted[0]
    const wipLane = first?.lane ?? 0
    const wipColor = first?.color ?? '#6e7681'

    const wipNode: LayoutCommit = {
      hash: WIP_HASH,
      shortHash: 'WIP',
      message: `//WIP  ✏ ${wipCount} fichier${wipCount !== 1 ? 's' : ''} modifié${wipCount !== 1 ? 's' : ''}`,
      author: '',
      authorEmail: '',
      date: '',
      parents: first ? [first.hash] : [],
      refs: [],
      lane: wipLane,
      row: 0,
      color: wipColor,
      edges: first ? [{ fromLane: wipLane, toLane: wipLane, toRow: 1, color: '#484f58', type: 'straight' as const }] : [],
    }
    return [wipNode, ...shifted]
  }, [layout, wipCount])

  const maxLane = useMemo(() => displayLayout.reduce((m, c) => Math.max(m, c.lane), 0), [displayLayout])
  const svgW = Math.max(SVG_PAD_L + (maxLane + 1) * LANE_WIDTH + SVG_PAD_R, 48)
  const svgH = displayLayout.length * ROW_HEIGHT

  const filtered = useMemo(() => {
    if (!searchQuery) return null
    const q = searchQuery.toLowerCase()
    return new Set(
      displayLayout
        .filter(c => c.hash !== WIP_HASH && (
          c.message.toLowerCase().includes(q) ||
          c.author.toLowerCase().includes(q) ||
          c.shortHash.includes(q)
        ))
        .map(c => c.row)
    )
  }, [displayLayout, searchQuery])

  const renderEdge = useCallback((commit: LayoutCommit, edge: typeof commit.edges[0]) => {
    const isWip = commit.hash === WIP_HASH
    const x1 = SVG_PAD_L + edge.fromLane * LANE_WIDTH
    const y1 = commit.row * ROW_HEIGHT + ROW_HEIGHT / 2
    const x2 = SVG_PAD_L + edge.toLane * LANE_WIDTH
    const y2 = edge.toRow * ROW_HEIGHT + ROW_HEIGHT / 2
    const key = `${commit.hash}-${edge.fromLane}-${edge.toLane}-${edge.toRow}`
    const dashArray = isWip ? '4 3' : undefined

    if (x1 === x2) {
      return (
        <line key={key} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={edge.color} strokeWidth={2} strokeLinecap="round"
          strokeDasharray={dashArray} />
      )
    }
    const offset = Math.min(ROW_HEIGHT * 0.7, Math.abs(y2 - y1) * 0.5)
    return (
      <path key={key}
        d={`M${x1} ${y1} C${x1} ${y1 + offset},${x2} ${y2 - offset},${x2} ${y2}`}
        fill="none" stroke={edge.color} strokeWidth={2} strokeLinecap="round"
        strokeDasharray={dashArray} />
    )
  }, [])

  const buildMenuItems = useCallback((commit: LayoutCommit): MenuItemDef[] => {
    const isHead = commit.refs.some(r => r.includes('HEAD ->') && r.includes(currentBranch))
    return [
      { label: t('graph.menu.createBranch'), action: () => onCreateBranchAt(commit.hash) },
      { label: t('graph.menu.interactiveRebase'), action: () => onInteractiveRebase?.(commit.hash) },
      { separator: true },
      { label: t('graph.menu.cherryPick'), action: () => onCherryPick(commit.hash), disabled: isHead },
      { label: t('graph.menu.revert'), action: () => onRevert(commit.hash) },
      { separator: true },
      { label: t('graph.menu.resetSoft'), action: () => onReset(commit.hash, 'soft') },
      { label: t('graph.menu.resetMixed'), action: () => onReset(commit.hash, 'mixed') },
      { label: t('graph.menu.resetHard'), action: () => onReset(commit.hash, 'hard'), danger: true },
      { separator: true },
      { label: t('graph.menu.createTag'), action: () => onCreateTag(commit.hash) },
      { separator: true },
      { label: t('graph.menu.copyShortHash'), action: () => navigator.clipboard.writeText(commit.shortHash) },
      { label: t('graph.menu.copyFullHash'), action: () => navigator.clipboard.writeText(commit.hash) },
    ]
  }, [currentBranch, onCherryPick, onRevert, onReset, onCreateTag, onCreateBranchAt, onInteractiveRebase, t])

  const handleRowContextMenu = useCallback((e: React.MouseEvent, commit: LayoutCommit) => {
    if (commit.hash === WIP_HASH) return
    e.preventDefault()
    e.stopPropagation()
    setCtx({ x: e.clientX, y: e.clientY, commit })
  }, [])

  return (
    <div className="cg-container">
      {/* ── Header ── */}
      <div className="cg-header">
        <div className="cg-h-refs" style={{ width: REFS_COL_W }}>BRANCH / TAG</div>
        <div className="cg-h-graph" style={{ width: svgW }}>GRAPH</div>
        <div className="cg-h-msg">COMMIT MESSAGE</div>
        <div className="cg-h-author">AUTHOR</div>
        <div className="cg-h-date">DATE</div>
        <div className="cg-h-sha">SHA</div>
      </div>

      {/* ── Body ── */}
      <div className="cg-body" ref={bodyRef}>
        <div className="cg-scroll-content" style={{ height: svgH, position: 'relative' }}>

          {/* Graph SVG — offset by REFS_COL_W */}
          <svg
            className="cg-graph-svg"
            width={svgW}
            height={svgH}
            style={{
              position: 'absolute',
              left: REFS_COL_W,
              top: 0,
              pointerEvents: 'none',
              zIndex: 2,
              overflow: 'visible',
            }}
          >
            {/* Edges */}
            {displayLayout.flatMap(commit => commit.edges.map(edge => renderEdge(commit, edge)))}

            {/* Nodes */}
            {displayLayout.map(commit => {
              const cx = SVG_PAD_L + commit.lane * LANE_WIDTH
              const cy = commit.row * ROW_HEIGHT + ROW_HEIGHT / 2
              const isSelected = commit.hash === selectedHash
              const isWip = commit.hash === WIP_HASH

              if (isWip) {
                return (
                  <g key="wip">
                    <circle cx={cx} cy={cy} r={NODE_RADIUS}
                      fill="#161b22"
                      stroke="#6e7681"
                      strokeWidth={1.5}
                      strokeDasharray="3 2"
                    />
                    <text x={cx} y={cy} dy=".35em"
                      textAnchor="middle"
                      fontSize={6}
                      fontWeight="700"
                      fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
                      fill="#6e7681"
                    >WIP</text>
                  </g>
                )
              }

              const ring = commit.color
              const bg = isSelected ? '#1a3a5c' : '#161b22'
              const avatarColor = getAvatarColor(commit.authorEmail)
              const init = initials(commit.author)

              return (
                <g key={commit.hash}>
                  {/* Outer ring */}
                  <circle cx={cx} cy={cy} r={NODE_RADIUS} fill={ring} />
                  {/* Inner dark bg */}
                  <circle cx={cx} cy={cy} r={NODE_RADIUS - 2} fill={bg} />
                  {/* Initials */}
                  <text x={cx} y={cy} dy=".35em"
                    textAnchor="middle"
                    fontSize={7}
                    fontWeight="700"
                    fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
                    fill={avatarColor}
                  >{init}</text>
                  {isSelected && (
                    <circle cx={cx} cy={cy} r={NODE_RADIUS + 2}
                      fill="none" stroke="#58a6ff" strokeWidth={1.5} opacity={0.7} />
                  )}
                </g>
              )
            })}
          </svg>

          {/* Rows */}
          {displayLayout.map(commit => {
            const isSelected = commit.hash === selectedHash
            const isWip = commit.hash === WIP_HASH
            const isDimmed = !isWip && filtered !== null && !filtered.has(commit.row)
            const prefs = processRefs(commit.refs)
            const MAX_CHIPS = 3
            const visible = prefs.slice(0, MAX_CHIPS)
            const overflow = prefs.length - MAX_CHIPS

            return (
              <div
                key={commit.hash}
                className={`cg-row ${isSelected ? 'cg-selected' : ''} ${isDimmed ? 'cg-dimmed' : ''} ${isWip ? 'cg-row-wip' : ''}`}
                style={{ top: commit.row * ROW_HEIGHT }}
                onClick={() => !isWip && onSelectCommit(commit)}
                onContextMenu={e => handleRowContextMenu(e, commit)}
              >
                {/* BRANCH / TAG column */}
                <div className="cg-refs-col" style={{ width: REFS_COL_W }}>
                  {visible.map((p, i) => (
                    <RefChip key={i} pref={p} onDoubleClick={onCheckoutBranch} />
                  ))}
                  {overflow > 0 && (
                    <span className="ref-chip rc-overflow"
                      title={prefs.slice(MAX_CHIPS).map(p => p.tooltip || p.display).join(', ')}>
                      +{overflow}
                    </span>
                  )}
                </div>

                {/* Spacer for SVG */}
                <div style={{ width: svgW, flexShrink: 0 }} />

                {/* Message */}
                <div className="cg-col-msg">
                  <span className={`cg-msg ${isWip ? 'cg-msg-wip' : ''}`}>{commit.message}</span>
                </div>

                {/* Author */}
                {!isWip && (
                  <div className="cg-col-author">
                    <div className="cg-avatar" style={{ background: getAvatarColor(commit.authorEmail) }}>
                      {initials(commit.author)}
                    </div>
                    <span className="cg-author-name">{commit.author}</span>
                  </div>
                )}
                {isWip && <div className="cg-col-author" />}

                <div className="cg-col-date">{!isWip ? fmtDate(commit.date) : ''}</div>
                <div className="cg-col-sha">
                  {!isWip && <code>{commit.shortHash}</code>}
                </div>
              </div>
            )
          })}
        </div>

        {displayLayout.length === 0 && (
          <div className="cg-empty">{t('graph.empty')}</div>
        )}
      </div>

      {ctx && (
        <ContextMenu
          x={ctx.x} y={ctx.y}
          items={buildMenuItems(ctx.commit)}
          onClose={() => setCtx(null)}
        />
      )}
    </div>
  )
}
