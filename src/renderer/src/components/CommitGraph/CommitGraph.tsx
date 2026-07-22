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

// Just a persisted number — the actual drag math lives in startColumnResize
// below, since different handles need different resize strategies.
function useStoredWidth(key: string, defaultW: number) {
  const [w, setW] = useState(() => parseInt(localStorage.getItem(key) || String(defaultW)))
  // Re-read from storage whenever the key itself changes — used to switch
  // between independently-remembered normal/compact widths for the same column.
  useEffect(() => {
    setW(parseInt(localStorage.getItem(key) || String(defaultW)))
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const setPersisted = useCallback((n: number) => {
    setW(n)
    localStorage.setItem(key, String(n))
  }, [key])
  return [w, setPersisted] as const
}

interface ResizeNeighbor { w: number; setW: (n: number) => void; key: string; min: number }

// Drags one column border. `dir` says which edge of the DRAGGED column the
// handle is: 1 = the column's own right edge (dragging right grows it — only
// `refs` is shaped this way), -1 = its left edge (dragging right shrinks it —
// every trailing optional column, since their handle is drawn just before
// them). Getting this backwards is exactly "the edge doesn't follow the cursor".
//
// If `pairWith` is given, the dragged column trades width directly with that
// ONE neighbor (their sum stays constant) — nothing else in the row is ever
// affected, not the flexible message column, not any column further away.
// This is used whenever there's a real fixed-width column immediately next
// to the one being dragged (e.g. dragging SHA's border pairs with DATE, or
// with AUTHOR if DATE happens to be hidden).
//
// If `pairWith` is omitted (the handle sits right next to the message
// column, or every other optional column is currently hidden), the dragged
// column instead grows/shrinks against the flexible message column, clamped
// by `getMax` so it can never shrink message past its floor or force another
// already-visible column to auto-hide.
function startColumnResize(opts: {
  e: React.MouseEvent
  w: number; setW: (n: number) => void; key: string; min: number; dir: 1 | -1
  getMax?: () => number
  pairWith?: ResizeNeighbor
}) {
  const { e, w, setW, key, min, dir, getMax, pairWith } = opts
  e.preventDefault()
  const startX = e.clientX
  const startW = w
  const pairStartW = pairWith?.w
  const onMove = (me: MouseEvent) => {
    const delta = dir * (me.clientX - startX)
    if (pairWith && pairStartW != null) {
      const total = startW + pairStartW
      const nextW = Math.min(Math.max(startW + delta, min), total - pairWith.min)
      const nextPair = total - nextW
      setW(nextW)
      pairWith.setW(nextPair)
      localStorage.setItem(key, String(nextW))
      localStorage.setItem(pairWith.key, String(nextPair))
    } else {
      let nextW = Math.max(min, startW + delta)
      const max = getMax?.()
      if (max != null) nextW = Math.min(nextW, Math.max(min, max))
      setW(nextW)
      localStorage.setItem(key, String(nextW))
    }
  }
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
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
// Resolves an author's avatar (AI-bot logo, else GitHub/Gravatar via the main
// process), shared by the SVG graph node and the compact-layout HTML bullet.
function useAvatarSrc(email: string, sha: string | undefined, aiLogo: string | null) {
  const [failed, setFailed] = useState(false)
  const [src, setSrc] = useState<string | null>(aiLogo)
  useEffect(() => {
    setFailed(false)
    if (aiLogo) { setSrc(aiLogo); return }
    if (!email) return
    ;(window.gitAPI as any).avatarResolve(email, sha).then(setSrc).catch(() => {})
  }, [email, sha, aiLogo])
  return { src, failed, setFailed }
}
// Commit graph node showing the author's avatar (GitHub avatar resolved via the
// main process, Gravatar/initials fallback), clipped to a circle with a colored
// ring. Falls back to a colored initials circle if the image fails to load.
function NodeAvatar({ cx, cy, r, email, name, color, clipId, sha }: {
  cx: number; cy: number; r: number; email: string; name: string; color: string; clipId: string; sha?: string
}) {
  const aiLogo = aiAvatarDataUri(name, email)
  const { src, failed, setFailed } = useAvatarSrc(email, sha, aiLogo)

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
// Compact layout: the graph node becomes a plain dot (see the row renderer),
// so the avatar moves here instead — a small HTML bullet sitting in the
// author column, right next to the graph. Hidden entirely when "Avatars des
// auteurs" is off, independently of whether the Author column itself shows.
function AuthorBullet({ email, name, sha, color }: { email: string; name: string; sha?: string; color: string }) {
  const aiLogo = aiAvatarDataUri(name, email)
  const { src, failed, setFailed } = useAvatarSrc(email, sha, aiLogo)
  if (failed || !email || !src) {
    return (
      <span className="cg-author-bullet" style={{ background: color }} title={name}>
        <span className="cg-author-bullet-initials">{initials(name)}</span>
      </span>
    )
  }
  return (
    <span className="cg-author-bullet" style={{ borderColor: color }} title={name}>
      <img src={src} alt="" onError={() => setFailed(true)} />
    </span>
  )
}
function fmtDate(s: string, format: string = 'absolute') {
  try {
    const d = new Date(s)
    if (format === 'relative') return fmtRelative(d)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return s }
}
// Relative date ("il y a 3 j", "il y a 2 mois").
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
// Compact-column header icons — replace text labels ("AUTHOR", "DATE") when
// the compact layout setting is on, to save horizontal space.
const IconPerson = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 16 16" fill="currentColor">
    <path d="M3 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1H3Zm5-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>
  </svg>
)
const IconClock = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/>
    <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16Zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z"/>
  </svg>
)
// Small ratio bar of a commit's added/removed lines (green/red).
// Returns null when the commit carries no stats (merge commits, or the WIP row).
function StatsBar({ additions = 0, deletions = 0, compact }: { additions?: number; deletions?: number; compact: boolean }) {
  const total = additions + deletions
  if (total === 0) return null
  const addPct = (additions / total) * 100
  return (
    <span className="cg-stats" title={`+${additions} / −${deletions}`}>
      <span className={`cg-stats-bar ${compact ? 'cg-stats-bar--compact' : ''}`}>
        {additions > 0 && <span className="cg-stats-add" style={{ width: `${addPct}%` }} />}
        {deletions > 0 && <span className="cg-stats-del" style={{ width: `${100 - addPct}%` }} />}
      </span>
      {!compact && (
        <span className="cg-stats-nums">
          {additions > 0 && <span className="cg-stats-add-n">+{additions}</span>}
          {deletions > 0 && <span className="cg-stats-del-n">−{deletions}</span>}
        </span>
      )}
    </span>
  )
}

function RefChip({ pref, laneColor, compact, onDoubleClick, onDragStartBranch, onDragEndBranch, onContextMenu }: {
  pref: ProcessedRef
  laneColor?: string
  // Icons + checkmark only, no branch/tag name text — used for the main-row
  // chip when the compact layout is on. The expansion popup always shows the
  // full name since it has room to breathe.
  compact?: boolean
  onDoubleClick?: (name: string) => void
  onDragStartBranch?: (name: string) => void
  onDragEndBranch?: () => void
  onContextMenu?: (e: React.MouseEvent, pref: ProcessedRef) => void
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
      className={`ref-chip ${pref.cls} ${compact ? 'ref-chip--compact' : ''}`}
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
      onContextMenu={e => { if (onContextMenu) { e.preventDefault(); e.stopPropagation(); onContextMenu(e, pref) } }}
      style={colorStyle}
    >
      {pref.isHead && <span className="rc-check">✓</span>}
      {!compact && <span className="rc-name">{pref.display}</span>}
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
  // Extra matching hashes from host-side searches (diff "extended search",
  // AI natural-language search) — OR-ed with the local text filter.
  searchHashes?: Set<string> | null
  currentBranch: string
  onCherryPick: (hash: string) => void
  onRevert: (hash: string) => void
  onReset: (hash: string, mode: 'soft' | 'mixed' | 'hard') => void
  onCreateTag: (hash: string) => void
  onCreateBranchAt: (hash: string) => void
  onCheckoutBranch?: (name: string) => void
  // Branch chip context-menu actions (all optional — only provided actions show)
  onMergeBranch?: (name: string) => void
  onRebaseCurrentOnto?: (name: string) => void
  onRenameBranch?: (name: string) => void
  onDeleteBranch?: (name: string) => void
  onPushBranch?: (name: string) => void
  onSetUpstream?: (name: string) => void
  onDeleteRemoteBranch?: (ref: string) => void
  onPushTag?: (name: string) => void
  onDeleteTag?: (name: string) => void
  onDeleteRemoteTag?: (name: string) => void
  onInteractiveRebase?: (hash: string) => void
  onCheckoutCommit?: (hash: string) => void
  // Reword — the host decides internally whether this needs a plain amend
  // (HEAD) or a targeted mini-rebase (any other commit).
  onRewordCommit?: (hash: string) => void
  onCompareWorking?: (hash: string) => void
  // Two-commit comparison ("Select for Compare" / "Compare with Selected")
  onSelectForCompare?: (hash: string) => void
  onCompareWithSelected?: (hash: string) => void
  compareBaseHash?: string | null
  onDropCommit?: (hash: string) => void
  onMoveCommit?: (hash: string, direction: 'up' | 'down') => void
  onBranchDrop?: (branch: string, hash: string, action: 'reset' | 'rebase' | 'merge', targetBranch?: string) => void
  // Commit-menu actions added for GitLens parity (all optional — only
  // provided actions show, same convention as the branch-chip menu above)
  onRebaseCurrentOntoCommit?: (hash: string) => void
  onPushToCommit?: (hash: string) => void
  onCreatePatch?: (hash: string) => void
  onCopyPatch?: (hash: string) => void
  onCreateWorktreeAt?: (hash: string) => void
  onOpenCommitOnRemote?: (hash: string) => void
  wipCount?: number
  conflictMode?: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null
  githubRepo?: { owner: string; repo: string } | null
  loading?: boolean
  onSearchMatches?: (count: number) => void
  // VS Code only: skip our own HTML popup for the commit row (a webview is an
  // iframe clipped to its own rectangle, so a ~24-item menu can't render past
  // it there) — a native `contributes.menus["webview/context"]` menu, wired
  // via the row's data-vscode-context below, handles it instead.
  nativeContextMenu?: boolean
  // Safety net for nativeContextMenu: reports the right-clicked hash
  // independently of whatever argument VS Code passes to the native menu's
  // commands, in case that ever comes back empty.
  onNativeMenuTarget?: (hash: string) => void
}

interface CtxState { x: number; y: number; commit: LayoutCommit }
interface DropState { x: number; y: number; hash: string; branch: string }

export default function CommitGraph({
  commits, selectedHash, onSelectCommit, searchQuery, searchHashes, currentBranch,
  onCherryPick, onRevert, onReset, onCreateTag, onCreateBranchAt,
  onCheckoutBranch, onInteractiveRebase, onCheckoutCommit, onRewordCommit,
  onCompareWorking, onSelectForCompare, onCompareWithSelected, compareBaseHash,
  onDropCommit, onMoveCommit, onBranchDrop, wipCount = 0,
  conflictMode = null, githubRepo = null, loading = false, onSearchMatches,
  onMergeBranch, onRebaseCurrentOnto, onRenameBranch, onDeleteBranch,
  onPushBranch, onSetUpstream, onDeleteRemoteBranch, onPushTag, onDeleteTag,
  onDeleteRemoteTag, onRebaseCurrentOntoCommit, onPushToCommit, onCreatePatch,
  onCopyPatch, onCreateWorktreeAt, onOpenCommitOnRemote, nativeContextMenu = false,
  onNativeMenuTarget,
}: CommitGraphProps) {
  const { t } = useLang()
  const { getBool, get, set } = useSettings()
  const showAvatars = getBool('graphShowAvatars', true)
  const showAuthor = getBool('graphShowAuthor', true)
  const showDate = getBool('graphShowDate', true)
  const showSha = getBool('graphShowSha', true)
  const showStats = getBool('graphShowStats', true)
  const compactColumns = getBool('graphCompactColumns', false)
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
  // running up to the top — instead of waiting for a commit.
  const layout = useMemo(() => {
    if (!hasWipNode) return computeGraphLayout(commits)
    const wipMessage = conflictMode
      ? `⚠️ A file conflict was found when attempting to ${conflictMode}`
      : `//WIP  ✏ ${wipCount} fichier${wipCount !== 1 ? 's' : ''} modifié${wipCount !== 1 ? 's' : ''}`
    // No headHash = empty repo (no commit yet): the WIP node stands alone as
    // a root so the user can stage files and create the very first commit.
    const wip: CommitNode = {
      hash: WIP_HASH, shortHash: 'WIP', message: wipMessage,
      author: '', authorEmail: '', date: '', parents: headHash ? [headHash] : [], refs: [],
    }
    return computeGraphLayout([wip, ...commits])
  }, [commits, hasWipNode, headHash, conflictMode, wipCount])
  const [ctx, setCtx] = useState<CtxState | null>(null)
  const [headerCtx, setHeaderCtx] = useState<{ x: number; y: number } | null>(null)
  const [branchCtx, setBranchCtx] = useState<{ x: number; y: number; pref: ProcessedRef } | null>(null)
  const [dragBranch, setDragBranch] = useState<string | null>(null)
  const [dragOverRow, setDragOverRow] = useState<number | null>(null)
  const [drop, setDrop] = useState<DropState | null>(null)
  const [refExpand, setRefExpand] = useState<{ row: number; rect: DOMRect } | null>(null)
  const refExpandTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverDelayTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Latest layout numbers, mirrored into a ref so the resize-drag handlers
  // (which run from a mousemove listener, not a render) always read
  // up-to-date values without needing to be recreated every render.
  const liveLayout = useRef({
    measured: false, containerW: 0, svgW: 0,
    refsColW: 0, authorColW: 0, dateColW: 0, shaColW: 0, statsColW: 0,
    effShowAuthor: false, effShowDate: false, effShowSha: false, effShowStats: false,
  })
  const MSG_MIN = 170
  // Max width a column can grow to without forcing another already-visible
  // column to auto-hide: the flexible message column absorbs growth first
  // (down to MSG_MIN), then growth simply stops — so resizing one column
  // never makes a sibling disappear or shift.
  const maxWidthFor = useCallback((dragged: 'refs' | 'author' | 'date' | 'sha' | 'stats') => {
    const li = liveLayout.current
    if (!li.measured) return Infinity
    let reserved = li.svgW + MSG_MIN
    if (dragged !== 'refs') reserved += li.refsColW
    if (dragged !== 'author' && li.effShowAuthor) reserved += li.authorColW
    if (dragged !== 'date'   && li.effShowDate)   reserved += li.dateColW
    if (dragged !== 'sha'    && li.effShowSha)    reserved += li.shaColW
    if (dragged !== 'stats'  && li.effShowStats)  reserved += li.statsColW
    return li.containerW - reserved
  }, [])

  // Compact mode remembers its own widths, separately from the normal layout —
  // switching modes re-syncs from storage (see useStoredWidth) instead of the
  // two layouts fighting over one persisted number.
  const refsKey = compactColumns ? 'cg-refs-w-compact' : 'cg-refs-w'
  const refsMin = compactColumns ? 40 : 80
  const [refsColWRaw, setRefsColWRaw] = useStoredWidth(refsKey, compactColumns ? 74 : 164)
  const authorKey = compactColumns ? 'cg-author-w-compact' : 'cg-author-w'
  const authorMin = compactColumns ? 24 : 80
  const [authorColW, setAuthorColW] = useStoredWidth(authorKey, compactColumns ? 30 : 140)
  const dateKey = compactColumns ? 'cg-date-w-compact' : 'cg-date-w'
  const dateMin = compactColumns ? 60 : 70
  const [dateColW, setDateColW] = useStoredWidth(dateKey, compactColumns ? 72 : 100)
  const shaKey = 'cg-sha-w'
  const shaMin = 50
  const [shaColW, setShaColW] = useStoredWidth(shaKey, 62)
  const statsKey = compactColumns ? 'cg-stats-w-compact' : 'cg-stats-w'
  const statsMin = compactColumns ? 26 : 40
  const [statsColW, setStatsColW] = useStoredWidth(statsKey, compactColumns ? 40 : 78)

  // 0 = not yet measured → show everything. The branch/tag column is capped in
  // narrow panels so it can't crowd out the message.
  const measured = containerW > 0
  const refsColW = measured && containerW < 480 ? Math.min(refsColWRaw, 110) : refsColWRaw
  // effShowAuthor/Date/Sha are computed below, once svgW (the graph column
  // width, which grows with branch depth) is known — they must hide based on
  // the space actually left for the columns, not just the viewport width.

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

  // When the selection changes from outside the graph (parent-commit link,
  // keyboard …), make sure the selected row is visible.
  useEffect(() => {
    if (!selectedHash) return
    const row = displayLayout.find(c => c.hash === selectedHash)?.row
    const body = bodyRef.current
    if (row == null || !body) return
    const top = row * ROW_HEIGHT
    if (top < body.scrollTop || top + ROW_HEIGHT > body.scrollTop + body.clientHeight) {
      body.scrollTo({ top: Math.max(0, top - body.clientHeight / 2), behavior: 'smooth' })
    }
  }, [selectedHash])  // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard navigation — ↑/↓ move the selection, Escape closes the panel.
  // Skipped while an input/textarea has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Escape') return
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      // Let open modals/menus own the keyboard
      if (ctx || drop) return
      if (document.querySelector('[class$="-overlay"], [class*="-overlay "]')) return
      if (displayLayout.length === 0) return
      const idx = displayLayout.findIndex(c => c.hash === selectedHash)
      if (e.key === 'Escape') {
        if (idx !== -1) onSelectCommit(displayLayout[idx]) // toggles the selection off
        return
      }
      const next = idx === -1 ? 0 : idx + (e.key === 'ArrowDown' ? 1 : -1)
      if (next < 0 || next >= displayLayout.length) return
      e.preventDefault()
      onSelectCommit(displayLayout[next])
      const body = bodyRef.current
      if (body) {
        const top = next * ROW_HEIGHT
        if (top < body.scrollTop) body.scrollTop = top
        else if (top + ROW_HEIGHT > body.scrollTop + body.clientHeight) {
          body.scrollTop = top + ROW_HEIGHT - body.clientHeight
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [displayLayout, selectedHash, onSelectCommit, ctx, drop])

  const maxLane = useMemo(() => displayLayout.reduce((m, c) => Math.max(m, c.lane), 0), [displayLayout])
  const svgW = Math.max(SVG_PAD_L + (maxLane + 1) * LANE_WIDTH + SVG_PAD_R, 48)
  const svgH = displayLayout.length * ROW_HEIGHT

  // Availability-based column visibility. The message column must always keep
  // MSG_MIN px; the optional columns are granted space in priority order
  // (sha kept longest, author dropped first) only if it remains after the
  // branch/tag + graph columns. This prevents fixed-width columns from
  // overflowing — and being clipped to invisibility — when the graph is deep
  // or the panel is narrow (the VS Code panel case). (MSG_MIN is declared
  // above, next to the resize handles that also need it.)
  let colBudget = measured ? containerW - refsColW - svgW - MSG_MIN : Infinity
  const effShowSha = showSha && colBudget >= shaColW
  if (effShowSha) colBudget -= shaColW
  const effShowStats = showStats && colBudget >= statsColW
  if (effShowStats) colBudget -= statsColW
  const effShowDate = showDate && colBudget >= dateColW
  if (effShowDate) colBudget -= dateColW
  const effShowAuthor = showAuthor && colBudget >= authorColW

  // Keep the resize-drag handlers' view of the world current (see maxWidthFor).
  liveLayout.current = {
    measured, containerW, svgW,
    refsColW, authorColW, dateColW, shaColW, statsColW,
    effShowAuthor, effShowDate, effShowSha, effShowStats,
  }

  // Resize handlers. refs and author sit right next to the flexible message
  // column, so they grow/shrink against it (clamped by maxWidthFor). Every
  // other handle pairs directly with the nearest currently-VISIBLE column to
  // its left instead — so dragging, say, the SHA border only ever trades
  // width with DATE (or AUTHOR if DATE happens to be hidden), and never
  // touches the message column or shifts anything further away.
  const onDragRefs = useCallback((e: React.MouseEvent) => startColumnResize({
    e, w: refsColWRaw, setW: setRefsColWRaw, key: refsKey, min: refsMin, dir: 1,
    getMax: () => maxWidthFor('refs'),
  }), [refsColWRaw, setRefsColWRaw, refsKey, refsMin, maxWidthFor])

  const onDragAuthor = useCallback((e: React.MouseEvent) => startColumnResize({
    e, w: authorColW, setW: setAuthorColW, key: authorKey, min: authorMin, dir: -1,
    getMax: () => maxWidthFor('author'),
  }), [authorColW, setAuthorColW, authorKey, authorMin, maxWidthFor])

  const onDragDate = useCallback((e: React.MouseEvent) => {
    if (effShowAuthor) {
      startColumnResize({ e, w: dateColW, setW: setDateColW, key: dateKey, min: dateMin, dir: -1,
        pairWith: { w: authorColW, setW: setAuthorColW, key: authorKey, min: authorMin } })
    } else {
      startColumnResize({ e, w: dateColW, setW: setDateColW, key: dateKey, min: dateMin, dir: -1,
        getMax: () => maxWidthFor('date') })
    }
  }, [effShowAuthor, dateColW, setDateColW, dateKey, dateMin, authorColW, setAuthorColW, authorKey, authorMin, maxWidthFor])

  const onDragSha = useCallback((e: React.MouseEvent) => {
    if (effShowDate) {
      startColumnResize({ e, w: shaColW, setW: setShaColW, key: shaKey, min: shaMin, dir: -1,
        pairWith: { w: dateColW, setW: setDateColW, key: dateKey, min: dateMin } })
    } else if (effShowAuthor) {
      startColumnResize({ e, w: shaColW, setW: setShaColW, key: shaKey, min: shaMin, dir: -1,
        pairWith: { w: authorColW, setW: setAuthorColW, key: authorKey, min: authorMin } })
    } else {
      startColumnResize({ e, w: shaColW, setW: setShaColW, key: shaKey, min: shaMin, dir: -1,
        getMax: () => maxWidthFor('sha') })
    }
  }, [effShowDate, effShowAuthor, shaColW, setShaColW, shaKey, shaMin,
      dateColW, setDateColW, dateKey, dateMin, authorColW, setAuthorColW, authorKey, authorMin, maxWidthFor])

  const onDragStats = useCallback((e: React.MouseEvent) => {
    if (effShowSha) {
      startColumnResize({ e, w: statsColW, setW: setStatsColW, key: statsKey, min: statsMin, dir: -1,
        pairWith: { w: shaColW, setW: setShaColW, key: shaKey, min: shaMin } })
    } else if (effShowDate) {
      startColumnResize({ e, w: statsColW, setW: setStatsColW, key: statsKey, min: statsMin, dir: -1,
        pairWith: { w: dateColW, setW: setDateColW, key: dateKey, min: dateMin } })
    } else if (effShowAuthor) {
      startColumnResize({ e, w: statsColW, setW: setStatsColW, key: statsKey, min: statsMin, dir: -1,
        pairWith: { w: authorColW, setW: setAuthorColW, key: authorKey, min: authorMin } })
    } else {
      startColumnResize({ e, w: statsColW, setW: setStatsColW, key: statsKey, min: statsMin, dir: -1,
        getMax: () => maxWidthFor('stats') })
    }
  }, [effShowSha, effShowDate, effShowAuthor, statsColW, setStatsColW, statsKey, statsMin,
      shaColW, setShaColW, shaKey, shaMin, dateColW, setDateColW, dateKey, dateMin,
      authorColW, setAuthorColW, authorKey, authorMin, maxWidthFor])

  // Search filter — dims commits that don't match the query. Selection no longer
  // dims anything (that behavior was removed); lane dimming happens on ref hover.
  const filtered = useMemo(() => {
    const hasHostHashes = searchHashes != null
    if (searchQuery || hasHostHashes) {
      const q = searchQuery.toLowerCase()
      return new Set(
        displayLayout
          .filter(c => c.hash !== WIP_HASH && (
            // Host-provided matches (diff search, AI search) OR local text match
            (hasHostHashes && searchHashes!.has(c.hash)) ||
            (searchQuery !== '' && (
              c.message.toLowerCase().includes(q) ||
              c.author.toLowerCase().includes(q) ||
              c.shortHash.includes(q)
            ))
          ))
          .map(c => c.row)
      )
    }
    return null
  }, [displayLayout, searchQuery, searchHashes])

  // Report the match count to the toolbar (-1 = no active search)
  useEffect(() => {
    onSearchMatches?.(searchQuery || searchHashes != null ? (filtered?.size ?? 0) : -1)
  }, [filtered, searchQuery, searchHashes, onSearchMatches])

  // Assign each commit to exactly one branch (its "owner").
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
    // A root commit (no parents) can only be reworded when it's HEAD (plain
    // amend) — rewording it elsewhere in history would need `rebase --root`,
    // which isn't supported by the targeted mini-rebase this menu uses.
    const canReword = isHead || commit.parents.length > 0
    const items: MenuItemDef[] = [
      { label: t('graph.menu.checkout'), action: () => onCheckoutCommit?.(commit.hash) },
      { separator: true },
      { label: t('graph.menu.createBranch'), action: () => onCreateBranchAt(commit.hash) },
      { label: t('graph.menu.createTag'), action: () => onCreateTag(commit.hash) },
    ]
    if (onCreateWorktreeAt) items.push({ label: t('graph.menu.createWorktree'), action: () => onCreateWorktreeAt(commit.hash) })
    // Rebase family together — both start a rebase (one replans this
    // branch's own history, the other moves it onto a different base).
    items.push(
      { separator: true },
      { label: t('graph.menu.interactiveRebase'), action: () => onInteractiveRebase?.(commit.hash) },
    )
    if (onRebaseCurrentOntoCommit && !isHead) {
      items.push({ label: t('graph.menu.rebaseOntoCommit'), action: () => onRebaseCurrentOntoCommit(commit.hash) })
    }
    items.push(
      { separator: true },
      { label: t('graph.menu.reword'), action: () => onRewordCommit?.(commit.hash), disabled: !canReword },
      { label: t('graph.menu.cherryPick'), action: () => onCherryPick(commit.hash), disabled: isHead },
      { label: t('graph.menu.revert'), action: () => onRevert(commit.hash) },
      { label: t('graph.menu.dropCommit'), action: () => onDropCommit?.(commit.hash), danger: true },
      { label: t('graph.menu.moveUp'), action: () => onMoveCommit?.(commit.hash, 'up') },
      { label: t('graph.menu.moveDown'), action: () => onMoveCommit?.(commit.hash, 'down') },
      { separator: true },
      { label: t('graph.menu.resetSoft'), action: () => onReset(commit.hash, 'soft') },
      { label: t('graph.menu.resetMixed'), action: () => onReset(commit.hash, 'mixed') },
      { label: t('graph.menu.resetHard'), action: () => onReset(commit.hash, 'hard'), danger: true },
    )
    if (onPushToCommit) items.push({ separator: true }, { label: t('graph.menu.pushToCommit'), action: () => onPushToCommit(commit.hash) })
    items.push(
      { separator: true },
      { label: t('graph.menu.copyShortHash'), action: () => navigator.clipboard.writeText(commit.shortHash) },
      { label: t('graph.menu.copyFullHash'), action: () => navigator.clipboard.writeText(commit.hash) },
      { label: t('graph.menu.copyMessage'), action: () => navigator.clipboard.writeText(commit.message) },
    )
    if (onCreatePatch) items.push({ label: t('graph.menu.createPatch'), action: () => onCreatePatch(commit.hash) })
    if (onCopyPatch) items.push({ label: t('graph.menu.copyPatch'), action: () => onCopyPatch(commit.hash) })
    if (onOpenCommitOnRemote) items.push({ label: t('graph.menu.openOnRemote'), action: () => onOpenCommitOnRemote(commit.hash) })
    if (onCompareWorking || onSelectForCompare || (onCompareWithSelected && compareBaseHash)) {
      items.push({ separator: true })
      if (onCompareWorking) items.push({ label: t('graph.menu.compareWorking'), action: () => onCompareWorking(commit.hash) })
      if (onSelectForCompare) items.push({ label: t('graph.menu.selectForCompare'), action: () => onSelectForCompare(commit.hash) })
      if (onCompareWithSelected && compareBaseHash) {
        items.push({ label: t('graph.menu.compareWithSelected'), action: () => onCompareWithSelected(commit.hash), disabled: compareBaseHash === commit.hash })
      }
    }
    return items
  }, [currentBranch, onCherryPick, onRevert, onReset, onCreateTag, onCreateBranchAt, onInteractiveRebase,
      onCheckoutCommit, onRewordCommit, onCompareWorking, onSelectForCompare, onCompareWithSelected,
      compareBaseHash, onDropCommit, onMoveCommit, onRebaseCurrentOntoCommit, onPushToCommit,
      onCreatePatch, onCopyPatch, onCreateWorktreeAt, onOpenCommitOnRemote, t])

  const handleRowContextMenu = useCallback((e: React.MouseEvent, commit: LayoutCommit) => {
    if (commit.hash === WIP_HASH) return
    if (nativeContextMenu) { onNativeMenuTarget?.(commit.hash); return }
    e.preventDefault()
    e.stopPropagation()
    setCtx({ x: e.clientX, y: e.clientY, commit })
  }, [nativeContextMenu, onNativeMenuTarget])

  const handleRowDrop = useCallback((e: React.DragEvent, commit: LayoutCommit) => {
    e.preventDefault()
    setDragOverRow(null)
    const branch = dragBranch ?? e.dataTransfer.getData('text/plain')
    setDragBranch(null)
    if (!branch || commit.hash === WIP_HASH) return
    // Don't offer to move the checked-out branch elsewhere — you drag OTHER
    // branches onto your position, not your current branch away from it.
    if (branch === currentBranch) return
    setDrop({ x: e.clientX, y: e.clientY, hash: commit.hash, branch })
  }, [dragBranch, currentBranch])

  // A local branch tip sitting on this commit, other than the dragged one —
  // makes the drop a branch-to-branch operation (named both sides) instead of
  // "onto a bare SHA".
  const localBranchAt = useCallback((hash: string, exclude: string): string | null => {
    const c = commits.find(cc => cc.hash === hash)
    if (!c) return null
    const pick = processRefs(c.refs).find(r => (r.cls === 'rc-local' || r.cls === 'rc-head') && r.branchName && r.branchName !== exclude)
    return pick?.branchName ?? null
  }, [commits])

  const buildDropItems = useCallback((d: DropState): MenuItemDef[] => {
    const target = localBranchAt(d.hash, d.branch)
    if (target) {
      // Dropped on a branch tip → merge/rebase the dragged branch INTO/ONTO it.
      return [
        { label: t('graph.drop.mergeBranch', d.branch, target), action: () => onBranchDrop?.(d.branch, d.hash, 'merge', target) },
        { label: t('graph.drop.rebaseBranch', d.branch, target), action: () => onBranchDrop?.(d.branch, d.hash, 'rebase', target) },
        { label: t('graph.drop.resetBranch', d.branch, target), action: () => onBranchDrop?.(d.branch, d.hash, 'reset', target), danger: true },
      ]
    }
    // Dropped on a bare commit — no branch to merge into.
    const short = d.hash.slice(0, 7)
    return [
      { label: t('graph.drop.rebase', d.branch, short), action: () => onBranchDrop?.(d.branch, d.hash, 'rebase') },
      { label: t('graph.drop.reset', d.branch, short), action: () => onBranchDrop?.(d.branch, d.hash, 'reset'), danger: true },
    ]
  }, [onBranchDrop, t, localBranchAt])

  // Right-click menu on a branch/tag chip. Only actions whose handler was
  // provided are shown, so each host (desktop / VS Code) opts in independently.
  const buildBranchMenu = useCallback((pref: ProcessedRef): MenuItemDef[] => {
    const items: MenuItemDef[] = []
    const name = pref.branchName

    if (pref.cls === 'rc-tag') {
      const tag = pref.display
      items.push({ label: '📋 Copier le nom', action: () => navigator.clipboard.writeText(tag) })
      if (onPushTag) items.push({ label: '⬆ Pousser le tag', action: () => onPushTag(tag) })
      if (onDeleteTag || onDeleteRemoteTag) items.push({ separator: true })
      if (onDeleteTag) items.push({ label: '🗑 Supprimer (local)', action: () => onDeleteTag(tag), danger: true })
      if (onDeleteRemoteTag) items.push({ label: '🗑 Supprimer (distant)', action: () => onDeleteRemoteTag(tag), danger: true })
      return items
    }

    if (pref.cls === 'rc-remote' && name) {
      if (onCheckoutBranch) items.push({ label: '✓ Checkout', action: () => onCheckoutBranch(name) })
      if (onDeleteRemoteBranch) items.push({ label: '🗑 Supprimer la branche distante', action: () => onDeleteRemoteBranch(name), danger: true })
      items.push({ label: '📋 Copier le nom', action: () => navigator.clipboard.writeText(pref.display) })
      return items
    }

    // Local or current (head) branch
    if (!name) return items
    if (!pref.isHead && onCheckoutBranch) items.push({ label: '✓ Checkout', action: () => onCheckoutBranch(name) })
    if (!pref.isHead && onMergeBranch && currentBranch) items.push({ label: `⛙ Merger dans ${currentBranch}`, action: () => onMergeBranch(name) })
    if (!pref.isHead && onRebaseCurrentOnto && currentBranch) items.push({ label: `⤵ Rebaser ${currentBranch} sur ${pref.display}`, action: () => onRebaseCurrentOnto(name) })
    if (items.length) items.push({ separator: true })
    if (onPushBranch) items.push({ label: '⬆ Push', action: () => onPushBranch(name) })
    if (onSetUpstream) items.push({ label: '🔗 Définir l\'upstream', action: () => onSetUpstream(name) })
    if (onRenameBranch) items.push({ label: '✏️ Renommer', action: () => onRenameBranch(name) })
    items.push({ label: '📋 Copier le nom', action: () => navigator.clipboard.writeText(name) })
    if (!pref.isHead && onDeleteBranch) {
      items.push({ separator: true })
      items.push({ label: '🗑 Supprimer', action: () => onDeleteBranch(name), danger: true })
    }
    return items
  }, [currentBranch, onCheckoutBranch, onMergeBranch, onRebaseCurrentOnto, onPushBranch,
      onSetUpstream, onRenameBranch, onDeleteBranch, onDeleteRemoteBranch,
      onPushTag, onDeleteTag, onDeleteRemoteTag])

  // Right-click on the header bar — choose which columns show.
  const buildHeaderMenuItems = useCallback((): MenuItemDef[] => [
    { label: 'Avatars des auteurs', checked: showAvatars, action: () => set('graphShowAvatars', showAvatars ? 'false' : 'true') },
    { label: 'Auteur', checked: showAuthor, action: () => set('graphShowAuthor', showAuthor ? 'false' : 'true') },
    { label: 'Date', checked: showDate, action: () => set('graphShowDate', showDate ? 'false' : 'true') },
    { label: 'SHA', checked: showSha, action: () => set('graphShowSha', showSha ? 'false' : 'true') },
    { label: 'Ajouts / suppressions', checked: showStats, action: () => set('graphShowStats', showStats ? 'false' : 'true') },
    { separator: true },
    { label: 'Colonnes compactes (icônes)', checked: compactColumns, action: () => set('graphCompactColumns', compactColumns ? 'false' : 'true') },
    { separator: true },
    { label: 'Réinitialiser les colonnes', action: () => {
      set('graphShowAvatars', 'true')
      set('graphShowAuthor', 'true')
      set('graphShowDate', 'true')
      set('graphShowSha', 'true')
      set('graphShowStats', 'true')
      set('graphCompactColumns', 'false')
    } },
  ], [showAvatars, showAuthor, showDate, showSha, showStats, compactColumns, set])

  return (
    <div className="cg-container" ref={containerRef}>
      {/* ── Header ── */}
      <div
        className="cg-header"
        onContextMenu={e => { e.preventDefault(); setHeaderCtx({ x: e.clientX, y: e.clientY }) }}
        title="Clic droit : choisir les colonnes"
      >
        <div className="cg-h-refs" style={{ width: refsColW }}>{compactColumns ? 'B/T' : 'BRANCH / TAG'}</div>
        <div className="cg-col-handle" onMouseDown={onDragRefs} />
        <div className="cg-h-graph" style={{ width: svgW }}>GRAPH</div>
        <div className="cg-h-msg">COMMIT MESSAGE</div>
        {effShowAuthor && <>
          <div className="cg-col-handle" onMouseDown={onDragAuthor} />
          <div className="cg-h-author" style={{ width: authorColW }}>{compactColumns ? <IconPerson /> : 'AUTHOR'}</div>
        </>}
        {effShowDate && <>
          <div className="cg-col-handle" onMouseDown={onDragDate} />
          <div className="cg-h-date" style={{ width: dateColW }}>{compactColumns ? <IconClock /> : 'DATE'}</div>
        </>}
        {effShowSha && <>
          <div className="cg-col-handle" onMouseDown={onDragSha} />
          <div className="cg-h-sha" style={{ width: shaColW }}>SHA</div>
        </>}
        {effShowStats && <>
          <div className="cg-col-handle" onMouseDown={onDragStats} />
          <div className="cg-h-stats" style={{ width: statsColW }}>{compactColumns ? '±' : '+ / −'}</div>
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
                bar. Improves row readability. */}
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
                  {isMerge || compactColumns ? (
                    /* Merge commit, or compact layout: small plain dot
                       (de-emphasized) — in compact mode the
                       avatar moves beside the graph instead (see AuthorBullet). */
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
            const rowIsHead = !isWip && commit.refs.some(r => r.includes('HEAD ->') && r.includes(currentBranch))
            const rowCanReword = rowIsHead || commit.parents.length > 0

            return (
              <div
                key={commit.hash}
                className={`cg-row ${isSelected ? 'cg-selected' : ''} ${isDimmed ? 'cg-dimmed' : ''} ${isWip ? 'cg-row-wip' : ''} ${isDropTarget ? 'cg-drop-target' : ''}`}
                style={{ top: commit.row * ROW_HEIGHT }}
                onClick={() => onSelectCommit(commit)}
                onContextMenu={e => handleRowContextMenu(e, commit)}
                data-vscode-context={nativeContextMenu && !isWip ? JSON.stringify({
                  webviewSection: 'gitVertexCommit',
                  preventDefaultContextMenuItems: true,
                  commitHash: commit.hash,
                  isHead: rowIsHead,
                  canReword: rowCanReword,
                  hasCompareBase: !!compareBaseHash,
                }) : undefined}
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
                        <RefChip pref={primary} laneColor={commit.color} compact={compactColumns} onDoubleClick={onCheckoutBranch}
                          onDragStartBranch={setDragBranch}
                          onDragEndBranch={() => { setDragBranch(null); setDragOverRow(null) }}
                          onContextMenu={(e, pref) => setBranchCtx({ x: e.clientX, y: e.clientY, pref })} />
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
                  <span className={`cg-msg ${isWip ? 'cg-msg-wip' : ''}`} title={isWip ? undefined : commit.message}>{isWip ? commit.message : linkifyIssues(commit.message, githubRepo)}</span>
                </div>

                {/* Author */}
                {effShowAuthor && !isWip && (
                  <div className="cg-col-author" style={{ width: authorColW }}>
                    {compactColumns
                      // Compact layout: the graph node is a plain dot (see the SVG
                      // above) — the avatar moves here as a small bullet instead,
                      // still hideable independently via "Avatars des auteurs".
                      ? (showAvatars && <AuthorBullet email={commit.authorEmail} name={commit.author} sha={commit.hash} color={commit.color} />)
                      : <span className="cg-author-name">{commit.author}</span>}
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
                {effShowStats && (
                  <div className="cg-col-stats" style={{ width: statsColW }}>
                    {!isWip && <StatsBar additions={commit.additions} deletions={commit.deletions} compact={compactColumns} />}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {displayLayout.length === 0 && (
          loading ? (
            <div className="cg-skeleton">
              {Array.from({ length: 14 }).map((_, i) => (
                <div className="cg-skel-row" key={i} style={{ animationDelay: `${i * 60}ms` }}>
                  <span className="cg-skel-chip" style={{ width: i % 4 === 0 ? 70 : 0 }} />
                  <span className="cg-skel-dot" style={{ marginLeft: 12 + (i % 3) * 18 }} />
                  <span className="cg-skel-bar" style={{ width: `${38 + ((i * 23) % 42)}%` }} />
                </div>
              ))}
            </div>
          ) : (
            <div className="cg-empty">{commits.length === 0 ? t('graph.emptyRepo') : t('graph.empty')}</div>
          )
        )}
      </div>

      {ctx && (
        <ContextMenu
          x={ctx.x} y={ctx.y}
          items={buildMenuItems(ctx.commit)}
          onClose={() => setCtx(null)}
        />
      )}

      {headerCtx && (
        <ContextMenu
          x={headerCtx.x} y={headerCtx.y}
          items={buildHeaderMenuItems()}
          onClose={() => setHeaderCtx(null)}
        />
      )}

      {drop && (
        <ContextMenu
          x={drop.x} y={drop.y}
          items={buildDropItems(drop)}
          onClose={() => setDrop(null)}
        />
      )}

      {branchCtx && (() => {
        const items = buildBranchMenu(branchCtx.pref)
        if (items.length === 0) { return null }
        return (
          <ContextMenu
            x={branchCtx.x} y={branchCtx.y}
            items={items}
            onClose={() => setBranchCtx(null)}
          />
        )
      })()}

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
                onDragEndBranch={() => { setDragBranch(null); setDragOverRow(null) }}
                onContextMenu={(e, pref) => setBranchCtx({ x: e.clientX, y: e.clientY, pref })} />
            ))}
          </div>,
          document.body
        )
      })()}
    </div>
  )
}
