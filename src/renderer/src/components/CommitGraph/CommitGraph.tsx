import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LayoutCommit, computeGraphLayout } from './graph-layout'
import { CommitNode } from '../../types'
import ContextMenu, { MenuItemDef } from '../ContextMenu/ContextMenu'
import { useLang } from '../../i18n/LanguageContext'
import { aiAvatarDataUri } from '../../utils/aiAvatars'
import { useSettings } from '../../contexts/SettingsContext'
import { linkifyIssues } from '../IssueLink/IssueLink'
import './CommitGraph.css'

const ROW_HEIGHT  = 28
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

// Blend a hex color toward the graph background (#0d1117) by `factor` (0..1).
// Produces an opaque color so overlapping segments never add up in brightness.
function dimColor(hex: string, factor = 0.4): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return hex
  const [r, g, b] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
  const bg = [13, 17, 23] // #0d1117
  const mix = (c: number, bgc: number) => Math.round(bgc + (c - bgc) * factor)
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(mix(r, bg[0]))}${toHex(mix(g, bg[1]))}${toHex(mix(b, bg[2]))}`
}
function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}
// GPG signature badge from `%G?` status code. Returns null for unsigned commits.
function sigBadge(sig?: string) {
  if (!sig || sig === 'N') return null
  const good = sig === 'G' || sig === 'U'
  const bad = sig === 'B' || sig === 'E'
  const cls = good ? 'cg-sig--good' : bad ? 'cg-sig--bad' : 'cg-sig--warn'
  const titles: Record<string, string> = {
    G: 'Signature valide', U: 'Signature valide (validité inconnue)',
    X: 'Signature expirée', Y: 'Clé expirée', R: 'Clé révoquée',
    B: 'Signature invalide', E: 'Signature non vérifiable',
  }
  return <span className={`cg-sig ${cls}`} title={titles[sig] ?? 'Signé'}>🔏</span>
}
// Commit graph node showing the author's avatar (GitHub avatar resolved via the
// main process, Gravatar/initials fallback), clipped to a circle with a colored
// ring. Falls back to a colored initials circle if the image fails to load.
function NodeAvatar({ cx, cy, r, email, name, color, clipId, sha }: {
  cx: number; cy: number; r: number; email: string; name: string; color: string; clipId: string; sha?: string
}) {
  const aiLogo = aiAvatarDataUri(name, email)
  const [failed, setFailed] = useState(false)
  const [src, setSrc] = useState<string | null>(aiLogo)
  useEffect(() => {
    setFailed(false)
    if (aiLogo) { setSrc(aiLogo); return }
    if (!email) return
    ;(window.gitAPI as any).avatarResolve(email, sha).then(setSrc).catch(() => {})
  }, [email, sha, aiLogo])

  if (failed || !email || !src) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill={color} />
        <text x={cx} y={cy} dy=".35em" textAnchor="middle" fontSize={8} fontWeight="700"
          fontFamily="-apple-system, BlinkMacSystemFont, sans-serif" fill="#ffffff">
          {initials(name)}
        </text>
      </g>
    )
  }
  return (
    <g>
      <defs>
        <clipPath id={clipId}><circle cx={cx} cy={cy} r={r} /></clipPath>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="#161b22" />
      <image
        href={src}
        x={cx - r} y={cy - r} width={r * 2} height={r * 2}
        clipPath={`url(#${clipId})`}
        preserveAspectRatio="xMidYMid slice"
        onError={() => setFailed(true)}
      />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={1.5} />
    </g>
  )
}
function fmtDate(s: string, format: string = 'absolute') {
  try {
    const d = new Date(s)
    if (format === 'relative') return fmtRelative(d)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return s }
}
// Relative date like GitKraken ("il y a 3 j", "il y a 2 mois").
function fmtRelative(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (sec < 60) return "à l'instant"
  const min = Math.floor(sec / 60)
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const j = Math.floor(h / 24)
  if (j < 30) return `il y a ${j} j`
  const mo = Math.floor(j / 30)
  if (mo < 12) return `il y a ${mo} mois`
  return `il y a ${Math.floor(mo / 12)} an${mo >= 24 ? 's' : ''}`
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

function RefChip({ pref, laneColor, onDoubleClick, onDragStartBranch, onDragEndBranch }: {
  pref: ProcessedRef
  laneColor?: string
  onDoubleClick?: (name: string) => void
  onDragStartBranch?: (name: string) => void
  onDragEndBranch?: () => void
}) {
  const isDraggable = (pref.cls === 'rc-local' || pref.cls === 'rc-head') && !!pref.branchName
  const colorStyle = laneColor ? {
    color: laneColor,
    borderColor: laneColor + '99',
    background: laneColor + '22',
    cursor: pref.cls !== 'rc-tag' ? 'pointer' as const : undefined,
  } : (pref.cls !== 'rc-tag' ? { cursor: 'pointer' as const } : undefined)
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
      style={colorStyle}
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
  // Two-commit comparison
  onSelectForCompare?: (hash: string) => void
  onCompareWithSelected?: (hash: string) => void
  compareBaseHash?: string | null
  onDropCommit?: (hash: string) => void
  onMoveCommit?: (hash: string, direction: 'up' | 'down') => void
  onBranchDrop?: (branch: string, hash: string, action: 'reset' | 'rebase' | 'merge') => void
  wipCount?: number
  conflictMode?: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null
  githubRepo?: { owner: string; repo: string } | null
}

interface CtxState { x: number; y: number; commit: LayoutCommit }
interface DropState { x: number; y: number; hash: string; branch: string }

export default function CommitGraph({
  commits, selectedHash, onSelectCommit, searchQuery, currentBranch,
  onCherryPick, onRevert, onReset, onCreateTag, onCreateBranchAt,
  onCheckoutBranch, onInteractiveRebase, onCheckoutCommit, onEditMessage,
  onCompareWorking, onDropCommit, onMoveCommit, onBranchDrop, wipCount = 0,
  conflictMode = null, githubRepo = null,
}: CommitGraphProps) {
  const { t } = useLang()
  const { getBool, get } = useSettings()
  const showAvatars = getBool('graphShowAvatars', true)
  const showAuthor = getBool('graphShowAuthor', true)
  const showDate = getBool('graphShowDate', true)
  const showSha = getBool('graphShowSha', true)
  const dateFormat = get('dateFormat', 'relative')
  const bodyRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-hide secondary columns when the container is narrow (VS Code panel,
  // small windows) — the message column always keeps room to breathe.
  const [containerW, setContainerW] = useState(0)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => setContainerW(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const hasWipNode = wipCount > 0 || conflictMode !== null
  const headHash = useMemo(() => {
    const h = commits.find(c => c.refs.some(r => r.includes('HEAD ->') && r.includes(currentBranch)))
    return h?.hash ?? commits[0]?.hash
  }, [commits, currentBranch])

  // The working-tree (WIP) node is laid out as a virtual tip sitting on top of
  // HEAD, so the current branch is promoted to its proper lane as soon as there
  // are changes — e.g. main slides to the far left with a vertical dashed line
  // running up to the top, matching GitKraken — instead of waiting for a commit.
  const layout = useMemo(() => {
    if (!hasWipNode || !headHash) return computeGraphLayout(commits)
    const wipMessage = conflictMode
      ? `⚠️ A file conflict was found when attempting to ${conflictMode}`
      : `//WIP  ✏ ${wipCount} fichier${wipCount !== 1 ? 's' : ''} modifié${wipCount !== 1 ? 's' : ''}`
    const wip: CommitNode = {
      hash: WIP_HASH, shortHash: 'WIP', message: wipMessage,
      author: '', authorEmail: '', date: '', parents: [headHash], refs: [],
    }
    return computeGraphLayout([wip, ...commits])
  }, [commits, hasWipNode, headHash, conflictMode, wipCount])
  const [ctx, setCtx] = useState<CtxState | null>(null)
  const [dragBranch, setDragBranch] = useState<string | null>(null)
  const [dragOverRow, setDragOverRow] = useState<number | null>(null)
  const [drop, setDrop] = useState<DropState | null>(null)
  const [refExpand, setRefExpand] = useState<{ row: number; rect: DOMRect } | null>(null)
  const refExpandTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverDelayTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [refsColWRaw, startResizeRefs]  = useColResize('cg-refs-w',   164, 80)
  const [authorColW, startResizeAuthor] = useColResize('cg-author-w', 140, 80)
  const [dateColW,   startResizeDate]   = useColResize('cg-date-w',   100, 70)
  const [shaColW,    startResizeSha]    = useColResize('cg-sha-w',     62, 50)

  // Width breakpoints (0 = not yet measured → show everything)
  const measured = containerW > 0
  const effShowAuthor = showAuthor && (!measured || containerW >= 700)
  const effShowDate   = showDate   && (!measured || containerW >= 560)
  const effShowSha    = showSha    && (!measured || containerW >= 460)
  const refsColW = measured && containerW < 480 ? Math.min(refsColWRaw, 110) : refsColWRaw

  // The WIP node is already in `layout` (a virtual tip on HEAD). Here we only
  // give it its working-tree styling: a grey dashed line up to HEAD, plus — in
  // conflict mode — a dashed edge across to the incoming branch.
  const displayLayout = useMemo((): LayoutCommit[] => {
    if (!hasWipNode) return layout
    return layout.map(c => {
      if (c.hash !== WIP_HASH) return c
      const wipColor = conflictMode ? '#ffa657' : c.color
      const edges = c.edges.map(e => ({ ...e, color: '#484f58', dashed: true }))
      if (conflictMode) {
        const incoming = layout.find(x => x.hash !== WIP_HASH && x.hash !== headHash)
        if (incoming) {
          edges.push({
            fromLane: c.lane, toLane: incoming.lane, toRow: incoming.row,
            color: wipColor,
            type: incoming.lane < c.lane ? 'merge-left' : 'merge-right',
            dashed: true,
          })
        }
      }
      return { ...c, color: wipColor, edges }
    })
  }, [layout, hasWipNode, conflictMode, headHash])

  const maxLane = useMemo(() => displayLayout.reduce((m, c) => Math.max(m, c.lane), 0), [displayLayout])
  const svgW = Math.max(SVG_PAD_L + (maxLane + 1) * LANE_WIDTH + SVG_PAD_R, 48)
  const svgH = displayLayout.length * ROW_HEIGHT

  // Search filter — dims commits that don't match the query. Selection no longer
  // dims anything (that behavior was removed); lane dimming happens on ref hover.
  const filtered = useMemo(() => {
    if (searchQuery) {
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
    }
    return null
  }, [displayLayout, searchQuery])

  // Assign each commit to exactly one branch (its "owner"), GitKraken-style.
  // Process branch tips from the most-base to the most-derived and let each
  // claim its first-parent chain, stopping at the first already-claimed commit.
  // Using first-parent only makes back-merges (which enter via the 2nd parent)
  // belong to the branch they were merged INTO, not the merged branch — e.g.
  // "Merge release back into develop" stays develop's, while "Merge release" on
  // main stays main's.
  // Hovering a branch/tag chip highlights commits by walking first-parent from
  // the chip's commit downward, stopping just before any commit that is itself
  // the tip of another local branch. This is the exact divergence boundary:
  // feature/api-v2 walks until it hits develop_tip (which has "HEAD -> develop")
  // and stops there; develop walks its merge commits (which have no branch refs)
  // all the way down. Tags do not stop the walk.
  const [hoverHash, setHoverHash] = useState<string | null>(null)
  const hoverHighlight = useMemo(() => {
    if (!hoverHash) return null
    const byHash = new Map(displayLayout.map(c => [c.hash, c]))
    const hovered = byHash.get(hoverHash)
    if (!hovered || hovered.hash === WIP_HASH) return null
    const isLocalBranchRef = (r: string) =>
      !r.startsWith('tag:') && !r.includes('origin/') && !r.includes('remotes/')
    const rows = new Set<number>()
    let cur: typeof hovered | undefined = hovered
    const seen = new Set<string>()
    while (cur && !seen.has(cur.hash)) {
      seen.add(cur.hash)
      if (cur.hash !== WIP_HASH) rows.add(cur.row)
      const fp = cur.parents[0]
      const next = fp ? byHash.get(fp) : undefined
      if (!next) break
      // Stop before entering another branch's territory
      if (next.refs.some(isLocalBranchRef)) break
      cur = next
    }
    return rows.size ? rows : null
  }, [hoverHash, displayLayout])

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

    if (isWip) {
      // The WIP node is at row 0. We want the curve to happen immediately
      // below it, and then go straight down to the target node.
      const r = LANE_WIDTH * 0.6
      const dx = x2 > x1 ? r : -r
      const d = [
        `M${x1} ${y1}`,
        `Q${x1} ${y1 + r} ${x1 + dx} ${y1 + r}`,
        `L${x2 - dx} ${y1 + r}`,
        `Q${x2} ${y1 + r} ${x2} ${y1 + 2 * r}`,
        `L${x2} ${y2}`,
      ].join(' ')
      return (
        <path key={key}
          d={d}
          fill="none" stroke={edge.color} strokeWidth={2} strokeLinecap="round"
          strokeDasharray={dashArray} />
      )
    }

    // The elbow sits at the connection point, not the midpoint:
    //  - fork (a branch diverging from its base): the vertical stays in the
    //    branch's own lane (fromLane) and the horizontal jog happens at the
    //    BOTTOM, on the base commit's row.
    //  - merge (a merge commit reaching a 2nd parent): the horizontal jog
    //    happens at the TOP, on the merge commit's row, then the vertical runs
    //    down the parent's lane (toLane).
    const r = Math.min(LANE_WIDTH * 0.6, Math.abs(y2 - y1) / 2)
    const dx = x2 > x1 ? r : -r
    const isFork = edge.type === 'fork-left' || edge.type === 'fork-right'
    const d = isFork
      ? [
          `M${x1} ${y1}`,
          `L${x1} ${y2 - r}`,
          `Q${x1} ${y2} ${x1 + dx} ${y2}`,
          `L${x2} ${y2}`,
        ].join(' ')
      : [
          `M${x1} ${y1}`,
          `L${x2 - dx} ${y1}`,
          `Q${x2} ${y1} ${x2} ${y1 + r}`,
          `L${x2} ${y2}`,
        ].join(' ')
    return (
      <path key={key}
        d={d}
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
    <div className="cg-container" ref={containerRef}>
      {/* ── Header ── */}
      <div className="cg-header">
        <div className="cg-h-refs" style={{ width: refsColW }}>BRANCH / TAG</div>
        <div className="cg-col-handle" onMouseDown={startResizeRefs} />
        <div className="cg-h-graph" style={{ width: svgW }}>GRAPH</div>
        <div className="cg-h-msg">COMMIT MESSAGE</div>
        {effShowAuthor && <>
          <div className="cg-col-handle" onMouseDown={startResizeAuthor} />
          <div className="cg-h-author" style={{ width: authorColW }}>AUTHOR</div>
        </>}
        {effShowDate && <>
          <div className="cg-col-handle" onMouseDown={startResizeDate} />
          <div className="cg-h-date" style={{ width: dateColW }}>DATE</div>
        </>}
        {effShowSha && <>
          <div className="cg-col-handle" onMouseDown={startResizeSha} />
          <div className="cg-h-sha" style={{ width: shaColW }}>SHA</div>
        </>}
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
            {/* Lane bands — a soft colored strip from each commit's node to the
                right edge of the graph (just before the commit info), matching the
                node color. The right edge is a straight, more pronounced vertical
                bar. Improves row readability (GitKraken-style). */}
            {displayLayout.map(commit => {
              if (commit.hash === WIP_HASH) return null
              const cx = SVG_PAD_L + commit.lane * LANE_WIDTH
              const bandH = 24
              const y = commit.row * ROW_HEIGHT + (ROW_HEIGHT - bandH) / 2
              const right = svgW - SVG_PAD_R
              const w = Math.max(right - cx, 0)
              if (w <= 0) return null
              const edgeW = 2
              return (
                <g key={`band-${commit.hash}`}>
                  {/* soft fill, straight (square) edges */}
                  <rect x={cx} y={y} width={w} height={bandH} fill={commit.color} opacity={0.14} />
                  {/* pronounced vertical right edge */}
                  <rect x={right - edgeW} y={y} width={edgeW} height={bandH} fill={commit.color} opacity={0.7} />
                </g>
              )
            })}

            {/* Connector lines (chip → node): rendered before edges so branch lines appear on top */}
            {displayLayout.map(commit => {
              if (commit.hash === WIP_HASH || commit.refs.length === 0) return null
              const cx = SVG_PAD_L + commit.lane * LANE_WIDTH
              const cy = commit.row * ROW_HEIGHT + ROW_HEIGHT / 2
              if (cx - NODE_RADIUS <= 0) return null
              return (
                <line key={`conn-${commit.hash}`}
                  x1={0} y1={cy} x2={cx - NODE_RADIUS} y2={cy}
                  stroke={dimColor(commit.color)} strokeWidth={1.5}
                />
              )
            })}

            {/* Edges */}
            {displayLayout.flatMap(commit => commit.edges.map(edge => renderEdge(commit, edge)))}

            {/* Nodes */}
            {displayLayout.map(commit => {
              const cx = SVG_PAD_L + commit.lane * LANE_WIDTH
              const cy = commit.row * ROW_HEIGHT + ROW_HEIGHT / 2
              const isSelected = commit.hash === selectedHash
              const isWip = commit.hash === WIP_HASH

              if (isWip) {
                if (conflictMode) {
                  return (
                    <g key="wip">
                      <circle cx={cx} cy={cy} r={NODE_RADIUS + 2} fill="#161b22" />
                      <circle cx={cx} cy={cy} r={NODE_RADIUS}
                        fill="#ffa657"
                        stroke="#ffa657"
                        strokeWidth={1.5}
                      />
                      <text x={cx} y={cy} dy=".35em"
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight="900"
                        fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
                        fill="#161b22"
                      >!</text>
                    </g>
                  )
                }

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
              const isMerge = commit.parents.length >= 2

              return (
                <g key={commit.hash}>
                  {isSelected && (
                    <circle cx={cx} cy={cy} r={NODE_RADIUS + 3}
                      fill="none" stroke={commit.color} strokeWidth={1.5} opacity={0.5} />
                  )}
                  {isMerge ? (
                    /* Merge commit: small plain dot (de-emphasized, GitKraken-style) */
                    <circle cx={cx} cy={cy} r={5} fill={commit.color}
                      stroke="#161b22" strokeWidth={2} />
                  ) : showAvatars ? (
                    /* Normal commit: author avatar */
                    <NodeAvatar cx={cx} cy={cy} r={NODE_RADIUS}
                      email={commit.authorEmail} name={commit.author} sha={commit.hash}
                      color={commit.color} clipId={`node-clip-${commit.hash}`} />
                  ) : (
                    /* Avatars off: colored circle with initials */
                    <g>
                      <circle cx={cx} cy={cy} r={NODE_RADIUS} fill={commit.color} />
                      <text x={cx} y={cy} dy=".35em" textAnchor="middle" fontSize={8}
                        fontWeight="700" fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
                        fill="#ffffff">{init}</text>
                    </g>
                  )}
                </g>
              )
            })}

          </svg>

          {/* Rows */}
          {displayLayout.map(commit => {
            const isSelected = commit.hash === selectedHash
            const isWip = commit.hash === WIP_HASH
            // Active dim set: search takes precedence, otherwise ref-hover lane.
            const keep = filtered ?? hoverHighlight
            const isDimmed = !isWip && keep !== null && !keep.has(commit.row)
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
                          // Highlight after 2s delay — avoids accidental triggers while scrolling
                          if (hoverDelayTimer.current) clearTimeout(hoverDelayTimer.current)
                          hoverDelayTimer.current = setTimeout(() => setHoverHash(commit.hash), 1000)
                          if (stackCount < 1) return
                          if (refExpandTimer.current) clearTimeout(refExpandTimer.current)
                          if (refExpand?.row !== commit.row) {
                            setRefExpand({ row: commit.row, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() })
                          }
                        }}
                        onMouseLeave={() => {
                          if (hoverDelayTimer.current) { clearTimeout(hoverDelayTimer.current); hoverDelayTimer.current = null }
                          setHoverHash(null)
                          refExpandTimer.current = setTimeout(() => setRefExpand(null), 120)
                        }}
                      >
                        <RefChip pref={primary} laneColor={commit.color} onDoubleClick={onCheckoutBranch}
                          onDragStartBranch={setDragBranch}
                          onDragEndBranch={() => { setDragBranch(null); setDragOverRow(null) }} />
                        {stackCount > 0 && refExpand?.row !== commit.row && (
                          <span className="rc-stack-badge">+{stackCount}</span>
                        )}
                      </div>
                      {/* Flex stub: fills space from chip right edge to SVG boundary */}
                      <div className="cg-ref-line-stub" style={{ background: dimColor(commit.color) }} />
                    </>
                  ) : null}
                </div>

                {/* Spacer for SVG */}
                <div style={{ width: svgW, flexShrink: 0 }} />

                {/* Message */}
                <div className="cg-col-msg">
                  {!isWip && sigBadge(commit.signature)}
                  <span className={`cg-msg ${isWip ? 'cg-msg-wip' : ''}`}>{isWip ? commit.message : linkifyIssues(commit.message, githubRepo)}</span>
                </div>

                {/* Author */}
                {effShowAuthor && !isWip && (
                  <div className="cg-col-author" style={{ width: authorColW }}>
                    <span className="cg-author-name">{commit.author}</span>
                  </div>
                )}
                {effShowAuthor && isWip && <div className="cg-col-author" style={{ width: authorColW }} />}

                {effShowDate && (
                  <div className="cg-col-date" style={{ width: dateColW }}>{!isWip ? fmtDate(commit.date, dateFormat) : ''}</div>
                )}
                {effShowSha && (
                  <div className="cg-col-sha" style={{ width: shaColW }}>
                    {!isWip && <code>{commit.shortHash}</code>}
                  </div>
                )}
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
              <RefChip key={i} pref={p} laneColor={expandCommit.color} onDoubleClick={onCheckoutBranch}
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
