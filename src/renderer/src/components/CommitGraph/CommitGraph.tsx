import React, { useCallback, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LayoutCommit, computeGraphLayout, LANE_COLORS } from './graph-layout'
import { CommitNode } from '../../types'
import ContextMenu, { MenuItemDef } from '../ContextMenu/ContextMenu'
import { useLang } from '../../i18n/LanguageContext'
import './CommitGraph.css'

const ROW_HEIGHT  = 50
const LANE_WIDTH  = 22
const NODE_RADIUS = 11
const SVG_PAD_L   = 36
const SVG_PAD_R   = 8
const WIP_HASH    = '__WIP__'

function useColResize(key: string, defaultW: number, min = 60) {
  const [w, setW] = useState(() => parseInt(localStorage.getItem(key) || String(defaultW)))
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = w
    const onMove = (me: MouseEvent) => {
      const next = Math.max(min, startW + me.clientX - startX)
      setW(next)
      localStorage.setItem(key, String(next))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [w, key, min])
  return [w, startResize] as const
}

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
  display: string      // branch/tag name without "origin/" prefix
  cls: string          // rc-head | rc-local | rc-remote | rc-tag
  branchName?: string  // full ref name for checkout/drag
  tooltip?: string
  isHead?: boolean     // current HEAD branch
  hasLocal?: boolean   // has a local counterpart
  hasRemote?: boolean  // has a remote counterpart (origin/...)
}

function processRefs(refs: string[]): ProcessedRef[] {
  const filtered = refs.filter(r => !/^(origin\/HEAD|remotes\/[^/]+\/HEAD)$/.test(r))

  const headSet    = new Set<string>()   // branch names that are HEAD
  const localSet   = new Set<string>()   // all local branch names
  const remoteMap  = new Map<string, string>() // short name -> full ref
  const tags: string[] = []

  for (const ref of filtered) {
    if (ref.includes('HEAD -> ')) {
      const b = ref.replace('HEAD -> ', '')
      headSet.add(b)
      localSet.add(b)
    } else if (ref.startsWith('tag:')) {
      tags.push(ref.replace('tag: ', ''))
    } else if (ref.includes('origin/') || ref.includes('remotes/')) {
      const short = ref.replace(/^(origin\/|remotes\/[^/]+\/)/, '')
      remoteMap.set(short, ref)
    } else {
      localSet.add(ref)
    }
  }

  const result: ProcessedRef[] = []
  const usedRemotes = new Set<string>()

  // Local branches (HEAD first), merged with remote when names match
  const sortedLocals = [...localSet].sort((a, b) =>
    (headSet.has(b) ? 1 : 0) - (headSet.has(a) ? 1 : 0)
  )
  for (const name of sortedLocals) {
    const fullRemote = remoteMap.get(name)
    if (fullRemote) usedRemotes.add(name)
    const isHead = headSet.has(name)
    result.push({
      display: name,
      cls: isHead ? 'rc-head' : 'rc-local',
      branchName: name,
      tooltip: fullRemote ? `${name}  +  ${fullRemote}` : name,
      isHead,
      hasLocal: true,
      hasRemote: !!fullRemote,
    })
  }

  // Remote-only branches (no matching local)
  for (const [short, full] of remoteMap) {
    if (!usedRemotes.has(short)) {
      result.push({
        display: short,
        cls: 'rc-remote',
        branchName: full,
        tooltip: full,
        hasLocal: false,
        hasRemote: true,
      })
    }
  }

  // Tags
  for (const tag of tags) {
    result.push({ display: tag, cls: 'rc-tag', tooltip: tag })
  }

  return result
}

// SVG icons
const ICON_SIZE = 13
const IconMonitor = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 16 16" fill="currentColor">
    <path d="M0 4s0-2 2-2h12s2 0 2 2v6s0 2-2 2h-4c0 .667.083 1.167.25 1.5H11a.5.5 0 0 1 0 1H5a.5.5 0 0 1 0-1h.75c.167-.333.25-.833.25-1.5H2s-2 0-2-2V4zm1.398-.855a.758.758 0 0 0-.254.302A1.46 1.46 0 0 0 1 4v6c0 .325.078.502.145.602.07.105.17.188.302.254a1.464 1.464 0 0 0 .538.143L2.5 11h11l.515-.001a1.464 1.464 0 0 0 .538-.143.758.758 0 0 0 .302-.254A.858.858 0 0 0 15 10V4a.857.857 0 0 0-.145-.598.758.758 0 0 0-.302-.254A1.464 1.464 0 0 0 14.013 3H1.987a1.464 1.464 0 0 0-.589.145z"/>
  </svg>
)
const IconCloud = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 16 16" fill="currentColor">
    <path d="M4.406 3.342A5.53 5.53 0 0 1 8 2c2.69 0 4.923 2 5.166 4.579C14.758 6.804 16 8.137 16 9.773 16 11.569 14.502 13 12.687 13H3.781C1.708 13 0 11.366 0 9.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.878 1.464-2.383z"/>
  </svg>
)
const IconTag = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 16 16" fill="currentColor">
    <path d="M6 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm-1 0a.5.5 0 1 0-1 0 .5.5 0 0 0 1 0z"/>
    <path d="M2 1h4.586a1 1 0 0 1 .707.293l7 7a1 1 0 0 1 0 1.414l-4.586 4.586a1 1 0 0 1-1.414 0l-7-7A1 1 0 0 1 1 6.586V2a1 1 0 0 1 1-1zm0 5.586 7 7 4.586-4.586-7-7H2v4.586z"/>
  </svg>
)

function RefChip({ pref, onDoubleClick, onDragStartBranch, onDragEndBranch }: {
  pref: ProcessedRef
  onDoubleClick?: (name: string) => void
  onDragStartBranch?: (name: string) => void
  onDragEndBranch?: () => void
}) {
  const isDraggable = (pref.cls === 'rc-local' || pref.cls === 'rc-head') && !!pref.branchName
  return (
    <span
      className={`ref-chip ${pref.cls}`}
      title={pref.tooltip}
      draggable={isDraggable}
      onDragStart={e => {
        if (!isDraggable) return
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', pref.branchName!)
        onDragStartBranch?.(pref.branchName!)
      }}
      onDragEnd={() => onDragEndBranch?.()}
      onDoubleClick={e => {
        e.stopPropagation()
        if (pref.cls !== 'rc-tag' && onDoubleClick && pref.branchName) {
          onDoubleClick(pref.branchName)
        }
      }}
      style={pref.cls !== 'rc-tag' ? { cursor: 'pointer' } : undefined}
    >
      {pref.isHead && <span className="rc-check">✓</span>}
      <span className="rc-name">{pref.display}</span>
      {pref.cls !== 'rc-tag' && (
        <span className="rc-icons" style={{ width: pref.hasLocal && pref.hasRemote ? ICON_SIZE * 2 + 2 : ICON_SIZE }}>
          {pref.hasLocal  && <IconMonitor />}
          {pref.hasRemote && <IconCloud />}
        </span>
      )}
      {pref.cls === 'rc-tag' && <IconTag />}
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
  onCheckoutCommit?: (hash: string) => void
  onEditMessage?: (hash: string) => void
  onCompareWorking?: (hash: string) => void
  onDropCommit?: (hash: string) => void
  onMoveCommit?: (hash: string, direction: 'up' | 'down') => void
  onBranchDrop?: (branch: string, hash: string, action: 'reset' | 'rebase' | 'merge') => void
  wipCount?: number
}

interface CtxState { x: number; y: number; commit: LayoutCommit }
interface DropState { x: number; y: number; hash: string; branch: string }

export default function CommitGraph({
  commits, selectedHash, onSelectCommit, searchQuery, currentBranch,
  onCherryPick, onRevert, onReset, onCreateTag, onCreateBranchAt,
  onCheckoutBranch, onInteractiveRebase, onCheckoutCommit, onEditMessage,
  onCompareWorking, onDropCommit, onMoveCommit, onBranchDrop, wipCount = 0,
}: CommitGraphProps) {
  const { t } = useLang()
  const bodyRef = useRef<HTMLDivElement>(null)
  const layout = useMemo(() => computeGraphLayout(commits), [commits])
  const [ctx, setCtx] = useState<CtxState | null>(null)
  const [dragBranch, setDragBranch] = useState<string | null>(null)
  const [dragOverRow, setDragOverRow] = useState<number | null>(null)
  const [drop, setDrop] = useState<DropState | null>(null)
  const [refExpand, setRefExpand] = useState<{ row: number; rect: DOMRect } | null>(null)
  const refExpandTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [refsColW,   startResizeRefs]   = useColResize('cg-refs-w',   164, 80)
  const [authorColW, startResizeAuthor] = useColResize('cg-author-w', 140, 80)
  const [dateColW,   startResizeDate]   = useColResize('cg-date-w',   100, 70)
  const [shaColW,    startResizeSha]    = useColResize('cg-sha-w',     62, 50)

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

    // WIP connects to HEAD commit (local branch), not necessarily the first row
    const headCommit = shifted.find(c =>
      c.refs.some(r => r.includes('HEAD ->') && r.includes(currentBranch))
    ) ?? shifted[0]
    const first = shifted[0]
    const headLane = headCommit?.lane ?? first?.lane ?? 0
    const headRow = headCommit?.row ?? 1
    const wipColor = headCommit?.color ?? first?.color ?? '#6e7681'

    // When HEAD is not the first commit, put WIP on a new lane so the dashed
    // line stays vertical (in its own lane) and only curves into HEAD at the last row
    const maxExistingLane = shifted.reduce((m, c) => Math.max(m, c.lane), -1)
    const wipLane = headRow > 1 ? maxExistingLane + 1 : headLane

    const wipNode: LayoutCommit = {
      hash: WIP_HASH,
      shortHash: 'WIP',
      message: `//WIP  ✏ ${wipCount} fichier${wipCount !== 1 ? 's' : ''} modifié${wipCount !== 1 ? 's' : ''}`,
      author: '',
      authorEmail: '',
      date: '',
      parents: headCommit ? [headCommit.hash] : [],
      refs: [],
      lane: wipLane,
      row: 0,
      color: wipColor,
      // Straight down to just above HEAD, then curve in at the last row
      edges: headCommit ? [{ fromLane: wipLane, toLane: wipLane, toRow: 1, color: '#484f58', type: 'straight' as const }] : [],
    }

    // For intermediate rows, add dashed passthrough edges in wipLane
    // At headRow-1, curve into headLane to arrive cleanly on HEAD
    const shiftedWithPassthrough = shifted.map(c => {
      if (headRow <= 1 || c.row < 1 || c.row >= headRow) return c
      const toLane = c.row === headRow - 1 ? headLane : wipLane
      const toRow = c.row + 1
      return {
        ...c,
        edges: [...c.edges, {
          fromLane: wipLane, toLane, toRow,
          color: '#484f58', type: 'straight' as const, dashed: true,
        }],
      }
    })

    return [wipNode, ...shiftedWithPassthrough]
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
    const dashArray = isWip || edge.dashed ? '4 3' : undefined

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
      { label: t('graph.menu.checkout'), action: () => onCheckoutCommit?.(commit.hash) },
      { separator: true },
      { label: t('graph.menu.createBranch'), action: () => onCreateBranchAt(commit.hash) },
      { label: t('graph.menu.createTag'), action: () => onCreateTag(commit.hash) },
      { separator: true },
      { label: t('graph.menu.interactiveRebase'), action: () => onInteractiveRebase?.(commit.hash) },
      ...(isHead ? [{ label: t('graph.menu.editMessage'), action: () => onEditMessage?.(commit.hash) }] : []),
      { label: t('graph.menu.cherryPick'), action: () => onCherryPick(commit.hash), disabled: isHead },
      { label: t('graph.menu.revert'), action: () => onRevert(commit.hash) },
      { label: t('graph.menu.dropCommit'), action: () => onDropCommit?.(commit.hash), danger: true },
      { label: t('graph.menu.moveUp'), action: () => onMoveCommit?.(commit.hash, 'up') },
      { label: t('graph.menu.moveDown'), action: () => onMoveCommit?.(commit.hash, 'down') },
      { separator: true },
      { label: t('graph.menu.resetSoft'), action: () => onReset(commit.hash, 'soft') },
      { label: t('graph.menu.resetMixed'), action: () => onReset(commit.hash, 'mixed') },
      { label: t('graph.menu.resetHard'), action: () => onReset(commit.hash, 'hard'), danger: true },
      { separator: true },
      { label: t('graph.menu.copyShortHash'), action: () => navigator.clipboard.writeText(commit.shortHash) },
      { label: t('graph.menu.copyFullHash'), action: () => navigator.clipboard.writeText(commit.hash) },
      { label: t('graph.menu.copyMessage'), action: () => navigator.clipboard.writeText(commit.message) },
      { separator: true },
      { label: t('graph.menu.compareWorking'), action: () => onCompareWorking?.(commit.hash) },
    ]
  }, [currentBranch, onCherryPick, onRevert, onReset, onCreateTag, onCreateBranchAt, onInteractiveRebase,
      onCheckoutCommit, onEditMessage, onCompareWorking, onDropCommit, onMoveCommit, t])

  const handleRowContextMenu = useCallback((e: React.MouseEvent, commit: LayoutCommit) => {
    if (commit.hash === WIP_HASH) return
    e.preventDefault()
    e.stopPropagation()
    setCtx({ x: e.clientX, y: e.clientY, commit })
  }, [])

  const handleRowDrop = useCallback((e: React.DragEvent, commit: LayoutCommit) => {
    e.preventDefault()
    setDragOverRow(null)
    const branch = dragBranch ?? e.dataTransfer.getData('text/plain')
    setDragBranch(null)
    if (!branch || commit.hash === WIP_HASH) return
    setDrop({ x: e.clientX, y: e.clientY, hash: commit.hash, branch })
  }, [dragBranch])

  const buildDropItems = useCallback((d: DropState): MenuItemDef[] => {
    const short = d.hash.slice(0, 7)
    return [
      { label: t('graph.drop.reset', d.branch, short), action: () => onBranchDrop?.(d.branch, d.hash, 'reset'), danger: true },
      { label: t('graph.drop.rebase', d.branch, short), action: () => onBranchDrop?.(d.branch, d.hash, 'rebase') },
      { label: t('graph.drop.merge', d.branch, short), action: () => onBranchDrop?.(d.branch, d.hash, 'merge') },
    ]
  }, [onBranchDrop, t])

  return (
    <div className="cg-container">
      {/* ── Header ── */}
      <div className="cg-header">
        <div className="cg-h-refs" style={{ width: refsColW }}>BRANCH / TAG</div>
        <div className="cg-col-handle" onMouseDown={startResizeRefs} />
        <div className="cg-h-graph" style={{ width: svgW }}>GRAPH</div>
        <div className="cg-h-msg">COMMIT MESSAGE</div>
        <div className="cg-col-handle" onMouseDown={startResizeAuthor} />
        <div className="cg-h-author" style={{ width: authorColW }}>AUTHOR</div>
        <div className="cg-col-handle" onMouseDown={startResizeDate} />
        <div className="cg-h-date" style={{ width: dateColW }}>DATE</div>
        <div className="cg-col-handle" onMouseDown={startResizeSha} />
        <div className="cg-h-sha" style={{ width: shaColW }}>SHA</div>
      </div>

      {/* ── Body ── */}
      <div className="cg-body" ref={bodyRef}>
        <div className="cg-scroll-content" style={{ height: svgH, position: 'relative' }}>

          {/* Graph SVG — offset by refsColW */}
          <svg
            className="cg-graph-svg"
            width={svgW}
            height={svgH}
            style={{
              position: 'absolute',
              left: refsColW,
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

              const init = initials(commit.author)

              return (
                <g key={commit.hash}>
                  {isSelected && (
                    <circle cx={cx} cy={cy} r={NODE_RADIUS + 3}
                      fill="none" stroke={commit.color} strokeWidth={1.5} opacity={0.5} />
                  )}
                  {/* Solid colored avatar circle */}
                  <circle cx={cx} cy={cy} r={NODE_RADIUS} fill={commit.color} />
                  {/* White initials */}
                  <text x={cx} y={cy} dy=".35em"
                    textAnchor="middle"
                    fontSize={8}
                    fontWeight="700"
                    fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
                    fill="#ffffff"
                  >{init}</text>
                </g>
              )
            })}

            {/* Connector lines drawn last (on top of nodes) so they don't blend with edge colors */}
            {displayLayout.map(commit => {
              if (commit.hash === WIP_HASH || commit.refs.length === 0) return null
              const cx = SVG_PAD_L + commit.lane * LANE_WIDTH
              const cy = commit.row * ROW_HEIGHT + ROW_HEIGHT / 2
              if (cx - NODE_RADIUS <= 0) return null
              return (
                <line key={`conn-${commit.hash}`}
                  x1={0} y1={cy} x2={cx - NODE_RADIUS} y2={cy}
                  stroke={commit.color} strokeWidth={1} opacity={0.4}
                />
              )
            })}
          </svg>

          {/* Rows */}
          {displayLayout.map(commit => {
            const isSelected = commit.hash === selectedHash
            const isWip = commit.hash === WIP_HASH
            const isDimmed = !isWip && filtered !== null && !filtered.has(commit.row)
            const isDropTarget = dragOverRow === commit.row && !isWip
            const prefs = processRefs(commit.refs)
            const primary = prefs[0]
            const stackCount = prefs.length - 1

            return (
              <div
                key={commit.hash}
                className={`cg-row ${isSelected ? 'cg-selected' : ''} ${isDimmed ? 'cg-dimmed' : ''} ${isWip ? 'cg-row-wip' : ''} ${isDropTarget ? 'cg-drop-target' : ''}`}
                style={{ top: commit.row * ROW_HEIGHT }}
                onClick={() => onSelectCommit(commit)}
                onContextMenu={e => handleRowContextMenu(e, commit)}
                onDragOver={e => {
                  if (!dragBranch || isWip) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (dragOverRow !== commit.row) setDragOverRow(commit.row)
                }}
                onDrop={e => handleRowDrop(e, commit)}
              >
                {/* Colored left stripe based on branch */}
                <div className="cg-color-bar" style={{ background: isWip ? '#484f58' : commit.color }} />

                {/* BRANCH / TAG column */}
                <div className="cg-refs-col" style={{ width: refsColW }}>
                  {primary ? (
                    <>
                      <div
                        className="cg-refs-chips"
                        onMouseEnter={e => {
                          if (stackCount < 1) return
                          if (refExpandTimer.current) clearTimeout(refExpandTimer.current)
                          // Only capture rect on first open — badge may have disappeared on re-entry
                          if (refExpand?.row !== commit.row) {
                            setRefExpand({ row: commit.row, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() })
                          }
                        }}
                        onMouseLeave={() => {
                          refExpandTimer.current = setTimeout(() => setRefExpand(null), 120)
                        }}
                      >
                        <RefChip pref={primary} onDoubleClick={onCheckoutBranch}
                          onDragStartBranch={setDragBranch}
                          onDragEndBranch={() => { setDragBranch(null); setDragOverRow(null) }} />
                        {stackCount > 0 && refExpand?.row !== commit.row && (
                          <span className="rc-stack-badge">+{stackCount}</span>
                        )}
                      </div>
                      {/* Flex stub: fills space from chip right edge to SVG boundary */}
                      <div className="cg-ref-line-stub" style={{ background: commit.color }} />
                    </>
                  ) : null}
                </div>

                {/* Spacer for SVG */}
                <div style={{ width: svgW, flexShrink: 0 }} />

                {/* Message — two lines */}
                <div className="cg-col-msg">
                  <div className="cg-msg-stack">
                    <span className={`cg-msg ${isWip ? 'cg-msg-wip' : ''}`}>{commit.message}</span>
                    {!isWip && (
                      <span className="cg-msg-sub">{commit.author} · {fmtDate(commit.date)}</span>
                    )}
                  </div>
                </div>

                {/* Author */}
                {!isWip && (
                  <div className="cg-col-author" style={{ width: authorColW }}>
                    <div className="cg-avatar" style={{ background: getAvatarColor(commit.authorEmail) }}>
                      {initials(commit.author)}
                    </div>
                    <span className="cg-author-name">{commit.author}</span>
                  </div>
                )}
                {isWip && <div className="cg-col-author" style={{ width: authorColW }} />}

                <div className="cg-col-date" style={{ width: dateColW }}>{!isWip ? fmtDate(commit.date) : ''}</div>
                <div className="cg-col-sha" style={{ width: shaColW }}>
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

      {drop && (
        <ContextMenu
          x={drop.x} y={drop.y}
          items={buildDropItems(drop)}
          onClose={() => setDrop(null)}
        />
      )}

      {refExpand && (() => {
        const expandCommit = displayLayout.find(c => c.row === refExpand.row)
        if (!expandCommit) return null
        const allPrefs = processRefs(expandCommit.refs)
        const hiddenPrefs = allPrefs.slice(1)
        if (hiddenPrefs.length === 0) return null
        const { rect } = refExpand
        const top = rect.bottom + 4
        const left = rect.left
        return createPortal(
          <div
            className="ref-expansion-popup"
            style={{ position: 'fixed', left, top, zIndex: 9998, minWidth: rect.width, width: 'max-content' }}
            onMouseEnter={() => { if (refExpandTimer.current) clearTimeout(refExpandTimer.current) }}
            onMouseLeave={() => { refExpandTimer.current = setTimeout(() => setRefExpand(null), 120) }}
          >
            {hiddenPrefs.map((p, i) => (
              <RefChip key={i} pref={p} onDoubleClick={onCheckoutBranch}
                onDragStartBranch={setDragBranch}
                onDragEndBranch={() => { setDragBranch(null); setDragOverRow(null) }} />
            ))}
          </div>,
          document.body
        )
      })()}
    </div>
  )
}
