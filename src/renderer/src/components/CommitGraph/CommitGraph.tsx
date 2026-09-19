// The commit graph: lanes, rows, refs, selection, drag and drop, and what each row shows.
// Its parts are in ./graph-parts, its menus in ./graph-menus, its geometry in ./graph-layout.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../Icon/Icon'
import { createPortal } from 'react-dom'
import { LayoutCommit, computeGraphLayout, rowOffsets, rowHeight as densityRowHeight, refLineHeight as densityRefLine } from './graph-layout'
import MessageChip from './MessageChip'
import Minimap from './Minimap'
import { dayOf } from './minimap-model'
import { BranchInfo, CommitNode } from '../../types'
import ContextMenu, { MenuItemDef } from '../ContextMenu/ContextMenu'
import { Mark } from '../Mark/Mark'
import type { PRIntent } from '../ContextMenu/prIntent'
import type { BranchMenuExtras } from '../ContextMenu/branchMenu'
import { useLang } from '../../i18n/LanguageContext'
import { isRefHidden, type GraphVisibility } from '../../utils/graphVisibility'
import { useSettings } from '../../contexts/SettingsContext'
import { periodOf, periodLabel, periodBoundaries, periodAt } from './timeline'
import { UNMEASURED_ROWS, edgesInWindow, inWindow, rowWindow, rowsToDraw } from './graph-window'
import RefFinder from './RefFinder'
import GraphShortcuts from './GraphShortcuts'
import { refFindCandidates, type RefFindKind, type RefFindMatch } from './ref-find'
import type { RefTarget } from '../RefCard/ref-card-model'
import { commitMatches, parseSearchQuery, textMatches } from '../../utils/searchQuery'
import { linkifyIssues } from '../IssueLink/IssueLink'
import { inlineMarkup } from './message-markup'
import { parseAutolinks } from '../../utils/autolinks'
import { LANE_WIDTH, NODE_RADIUS, DOT_RADIUS, STACKED_LANE_W, STACKED_PAD_L, STACKED_GUTTER_END, SVG_PAD_L, SVG_PAD_R, WIP_HASH, useStoredWidth, startColumnResize, dimColor, initials, NodeAvatar, AuthorBullet, fmtDateShort, fmtDate, type ProcessedRef, messageChipSegments, processRefs, IconPerson, IconClock, StatsBar, RefExpansionPopup, RefChip } from './graph-parts'
import { useGraphMenus } from './graph-menus'
import './CommitGraph.css'

// Kept on this module for the test that reads it from here.
export { messageChipSegments } from './graph-parts'

export interface CommitGraphProps {
  /**
   * The issue a branch is working on — the pill under the message shows it.
   * A branch, not a commit: the link follows the branch as it moves.
   */
  issueForBranch?: (branch: string) => { key: string; provider: string } | null
  /** The open PR whose head is this branch — a lookup into the loaded list,
      never a search. Omitted ⇒ no PR chips. */
  prForBranch?: (branch: string) => { number: number; title?: string } | null
  /** Open the PR detail. Without it the chip is a fact, not a button. */
  onOpenPR?: (number: number) => void
  /**
   * Refs under the message instead of in a column of their own.
   *
   * ⚠️ The **panel** passes this; the desktop does not, and keeps its column.
   * That is deliberate rather than a default: the column is 164px that every row
   * pays whether or not it carries a ref, which is a sixth of a bottom panel and
   * nothing at all in a desktop window. Two shapes, decided by the host that
   * knows how much width it has — not a setting the user has to find.
   */
  refsBelow?: boolean
  /**
   * How far a local branch is from its upstream. Read by the chip under the
   * message: `↓1 ↑1` is the reason someone looks at a branch chip at all.
   * A resolver rather than the list, because the graph wants one answer per
   * chip and has no business holding every branch.
   */
  trackingFor?: (branch: string) => { ahead?: number; behind?: number } | null
  /**
   * The current branch's upstream, as `%D` decorates it (`origin/main`): the
   * row the `u` key jumps to. Absent when there is none, or the host does not
   * know it — the key then does nothing.
   */
  upstreamRef?: string | null
  /**
   * The branch the current one will merge into, as `%D` decorates it (`main`,
   * `origin/main`): the row `t` jumps to and the one that wears the target's
   * mark. Absent when there is none — on the default branch, or detached.
   */
  mergeTargetRef?: string | null
  /**
   * Every branch and tag of the repository, loaded or not — what `/` finds.
   * The host's lists, not the rows: a tip three pages down is still a name.
   */
  branches?: readonly BranchInfo[]
  tags?: readonly { name: string }[]
  /**
   * Select the tip of a reference whose row the page does not hold: the host
   * grows the page to reach it, the way it reaches a search hit, and says how
   * far back it is when that is too far. Without it, a jump to an unloaded
   * row does nothing.
   */
  onRevealRef?: (ref: string) => void
  /**
   * A click on a branch or tag chip: its card, which the host opens over the
   * details panel (#258). The same chip again closes it — the host toggles.
   * Absent ⇒ a click on a chip does nothing, as before. The double-click
   * still switches either way.
   */
  onOpenRef?: (ref: RefTarget) => void
  /** The reference whose card is open: its chip reads as pressed. */
  openRef?: { kind: RefTarget['kind']; name: string } | null
  /**
   * The Working Changes row is always there, clean tree or not. It is the way
   * into the staging pane, and a pane nobody can reach is a pane that does not
   * exist. The panel passes this; the desktop keeps its row only when there is
   * something to show.
   */
  alwaysShowWip?: boolean
  /** Stage everything — the ✓ on the Working Changes row. Absent ⇒ no button. */
  onStageAll?: () => void
  commits: CommitNode[]
  selectedHash: string | null
  onSelectCommit: (c: CommitNode) => void
  searchQuery: string
  // Extra matching hashes from host-side searches (diff "extended search",
  // AI natural-language search) — OR-ed with the local text filter.
  searchHashes?: Set<string> | null
  /**
   * What git answered for the query's `file:` operators: a row has to be among
   * these — AND-ed, where `searchHashes` is OR-ed. Null while there is no such
   * operator, or while the answer is on its way.
   */
  requiredHashes?: ReadonlySet<string> | null
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
  // The pull request a branch chip should offer, or null for none — the rules
  // live in prIntentFor. Omitted when the repo has no GitHub remote.
  prIntentFor?: (branchRef: string) => PRIntent | null
  onCreatePR?: (intent: PRIntent) => void
  // What the user has hidden from the graph, and the remote names needed to
  // read `origin/x` as a remote branch rather than a local `feature/x`.
  // Omitted ⇒ every decoration is drawn, which is what a host that does not
  // offer hiding wants.
  visibility?: GraphVisibility
  remoteNames?: string[]
  // The whole branch menu, built by a host that holds the branch state this
  // component does not. Supplied ⇒ chips and branch-tip commits use it instead
  // of the reduced menu assembled from the individual handlers above.
  branchMenuItems?: (
    target: { name: string; display: string; current: boolean; remote: boolean },
    extras?: BranchMenuExtras,
  ) => MenuItemDef[]
  onCopyCommitLink?: (hash: string) => void
  onCreateAnnotatedTag?: (hash: string) => void
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
  /** Batch actions over the multi-selection (#69) — hashes arrive OLDEST
   *  first, the order a cherry-pick applies and a drop sequence reads. */
  onCherryPickMany?: (hashes: string[]) => void
  onDropCommits?: (hashes: string[]) => void
  onMoveCommit?: (hash: string, direction: 'up' | 'down') => void
  onBranchDrop?: (branch: string, hash: string, action: 'reset' | 'rebase' | 'merge', targetBranch?: string) => void
  // Commit-menu actions added for competitive parity (all optional — only
  // provided actions show, same convention as the branch-chip menu above)
  onRebaseCurrentOntoCommit?: (hash: string) => void
  onPushToCommit?: (hash: string) => void
  onCreatePatch?: (hash: string) => void
  onCopyPatch?: (hash: string) => void
  onSharePatch?: (hash: string) => void
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
  /**
   * The block the minimap is drawn in, when the host gives it one of its own —
   * above every pane, as wide as they are together. The strip is portalled
   * there and its data stays here, next to the rows it is made of. `null`:
   * the host has a block that is not mounted yet, so nothing is drawn;
   * omitted: the strip sits at the top of the graph.
   */
  minimapSlot?: HTMLElement | null
}

/** `node` in `slot` when there is one, where it stands otherwise. */
function portalTo(slot: HTMLElement | undefined, node: React.ReactElement) {
  return slot ? createPortal(node, slot) : node
}

/** What a row can be, to the branch that is checked out. */
type MarkerRole = 'head' | 'upstream' | 'target'
/** The bar's width; the band starts where it ends. */
const MARKER_BAR_W = 3
/** The lane band's height — and so the role band's and the bar's, which continue it. */
const LANE_BAND_H = 24
const MARKER_ICON: Record<MarkerRole, 'check' | 'cloud' | 'merge'> = { head: 'check', upstream: 'cloud', target: 'merge' }

export interface CtxState { x: number; y: number; commit: LayoutCommit; branchName?: string; batch?: boolean }

export interface DropState { x: number; y: number; hash: string; branch: string }

export default function CommitGraph(props: CommitGraphProps) {
  const {
  issueForBranch,
  prForBranch,
  onOpenPR,
  refsBelow = false,
  trackingFor,
  upstreamRef = null,
  mergeTargetRef = null,
  branches, tags, onRevealRef, onOpenRef, openRef = null,
  alwaysShowWip = false,
  onStageAll,
  commits, selectedHash, onSelectCommit, searchQuery, searchHashes, requiredHashes = null, currentBranch,
  
  onCheckoutBranch, 
  compareBaseHash,
  wipCount = 0,
  
  conflictMode = null, githubRepo = null, loading = false, onSearchMatches,
  
  
  
  
  nativeContextMenu = false,
  visibility, remoteNames, minimapSlot,
} = props
  const { t } = useLang()
  const { getBool, get, set, appliedTheme } = useSettings()
  // The graph's two heights come from the stylesheet, because a density moves
  // them (#195) and this file does arithmetic on them. Re-read when the density
  // changes: SettingsContext writes data-density and drops the cache inside the
  // state updater, so by the time this render runs the values are the new ones.
  const density = get('density', 'comfortable')
  const rowH = useMemo(() => densityRowHeight(), [density])
  const refH = useMemo(() => densityRefLine(), [density])
  // Configured reference patterns (Jira, Linear…). Parsed once per render pass
  // rather than per row: a graph is hundreds of messages.
  const autolinks = React.useMemo(() => parseAutolinks(get('autolinks', '')), [get])
  // Applied to what is DRAWN and nothing else. `buildMenuItems` and
  // `localBranchAt` below answer "which branch is at this commit" for actions —
  // a menu, a drop target — and hiding is a view filter: it must not change
  // what an action does to the repository.
  const hiddenChip = useCallback(
    (ref: string) => !!visibility && isRefHidden(ref, visibility, remoteNames),
    [visibility, remoteNames],
  )
  const showAvatars = getBool('graphShowAvatars', true)
  const showAuthor = getBool('graphShowAuthor', true)
  const showDate = getBool('graphShowDate', true)
  const showSha = getBool('graphShowSha', true)
  const showStats = getBool('graphShowStats', true)
  const showTimeline = getBool('graphTimeline', true)
  const showMinimap = getBool('graphMinimap', true)
  const compactColumns = getBool('graphCompactColumns', false)
  const dateFormat = get('dateFormat', 'relative')
  const bodyRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Auto-hide secondary columns when the container is narrow (VS Code panel,
  // small windows) — the message column always keeps room to breathe.
  // Measure the *body* rather than the container: the body's client width
  // already excludes a classic vertical scrollbar (Windows/Linux, ~17px). The
  // rows live inside the body, so budgeting columns against this width is what
  // keeps every column — the trailing +/− stats especially — inside the window
  // instead of being clipped by the scrollbar on the right. `scrollbarW` is the
  // gutter we then reserve on the (non-scrolling) header so it stays aligned.
  const [containerW, setContainerW] = useState(0)
  const [bodyH, setBodyH] = useState(0)
  const [scrollbarW, setScrollbarW] = useState(0)
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const measure = () => {
      const body = bodyRef.current
      if (!body) return
      setContainerW(body.clientWidth)
      setBodyH(body.clientHeight)
      setScrollbarW(body.offsetWidth - body.clientWidth)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])
  const hasWipNode = alwaysShowWip || wipCount > 0 || conflictMode !== null
  const headHash = useMemo(() => {
    const h = commits.find(c => c.refs.some(r => r.includes('HEAD ->') && r.includes(currentBranch)))
    return h?.hash ?? commits[0]?.hash
  }, [commits, currentBranch])
  const upstreamHash = useMemo(
    () => upstreamRef ? commits.find(c => c.refs.some(r => r === upstreamRef || r.endsWith(' ' + upstreamRef)))?.hash : undefined,
    [commits, upstreamRef])
  // The working-tree (WIP) node is laid out as a virtual tip sitting on top of
  // HEAD, so the current branch is promoted to its proper lane as soon as there
  // are changes — e.g. main slides to the far left with a vertical dashed line
  // running up to the top — instead of waiting for a commit.
  const layout = useMemo(() => {
    if (!hasWipNode) return computeGraphLayout(commits)
    const wipMessage = conflictMode
      ? `⚠️ A file conflict was found when attempting to ${conflictMode}`
      : wipCount > 0 ? t('graph.wip', wipCount) : t('graph.wipClean')
    // No headHash = empty repo (no commit yet): the WIP node stands alone as
    // a root so the user can stage files and create the very first commit.
    const wip: CommitNode = {
      hash: WIP_HASH, shortHash: 'WIP', message: wipMessage,
      author: '', authorEmail: '', date: '', parents: headHash ? [headHash] : [], refs: [],
    }
    return computeGraphLayout([wip, ...commits])
  // `appliedTheme` is a real dependency, not defensive (#160): computeGraphLayout
  // resolves the ten lane colours ONCE and bakes one into every commit it
  // returns, so without it a theme change repainted everything the CSS owns and
  // left the graph's branches on the old palette until a fetch or a reload moved
  // the layout for another reason.
  }, [commits, hasWipNode, headHash, conflictMode, wipCount, appliedTheme])
  // Which row a decorated name sits on — what `/` and `t` go to. Branches and
  // tags are two namespaces: a tag and a branch may share a name.
  const refRows = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of layout) {
      for (const raw of c.refs) {
        if (raw.startsWith('tag: ')) m.set(`t:${raw.slice(5)}`, c.row)
        else m.set(`b:${raw.replace(/^HEAD -> /, '').replace(/^remotes\//, '')}`, c.row)
      }
    }
    return m
  }, [layout])
  const rowOfRef = useCallback(
    (name: string, kind: RefFindKind) => refRows.get(`${kind === 'tag' ? 't' : 'b'}:${name}`),
    [refRows])
  // The merge target's row: the name as given, or the same branch on a remote
  // when there is no local one — a clone that never checked `main` out.
  const targetHash = useMemo(() => {
    if (!mergeTargetRef) return undefined
    const names = [mergeTargetRef, ...(remoteNames ?? ['origin']).map(r => `${r}/${mergeTargetRef}`)]
    for (const name of names) {
      const row = refRows.get(`b:${name}`)
      if (row !== undefined) return layout[row]?.hash
    }
    return undefined
  }, [mergeTargetRef, remoteNames, refRows, layout])
  const [ctx, setCtx] = useState<CtxState | null>(null)
  const [headerCtx, setHeaderCtx] = useState<{ x: number; y: number } | null>(null)
  const [branchCtx, setBranchCtx] = useState<{ x: number; y: number; pref: ProcessedRef } | null>(null)
  const [dragBranch, setDragBranch] = useState<string | null>(null)
  // The row the drag left from. It stays drawn while the drag lasts, wherever
  // the graph is scrolled to: an element removed mid-drag never gets its
  // `dragend`, and the graph would be left believing a branch is in the air.
  const [dragSource, setDragSource] = useState<string | null>(null)
  const [dragOverRow, setDragOverRow] = useState<number | null>(null)
  const [drop, setDrop] = useState<DropState | null>(null)
  // Which chip the "+N" panel hangs from — by hash, so a filter or a refresh
  // that moves rows cannot hand the panel to a stranger under a stale anchor.
  // `peek`: the chip's name did not fit (or the compact layout hid it) — the
  // chip is drawn whole over the graph while the pointer rests on it.
  const [refExpand, setRefExpand] = useState<{ hash: string; row: number; rect: DOMRect; peek: boolean } | null>(null)
  // A panel opens on a REST, not on an entry: the pointer has to stay on the
  // chip a moment. Crossing the refs column — every row has a hittable chip
  // now, ghosts included — used to open a panel on each row it passed.
  const refOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // When the graph last scrolled. After a scroll the browser re-hovers
  // whatever landed under the STILL pointer and fires mouseenter for it —
  // a hover the scroll made, not the hand. Nothing opens inside this window.
  const lastScrollAt = useRef(0)
  useEffect(() => {
    const on = () => {
      lastScrollAt.current = Date.now()
      // An opening in flight was asked for by a chip that has just moved.
      if (refOpenTimer.current) { clearTimeout(refOpenTimer.current); refOpenTimer.current = null }
    }
    window.addEventListener('scroll', on, true)
    return () => window.removeEventListener('scroll', on, true)
  }, [])
  // The panel lives exactly as long as the pointer is on its chip or on it.
  // Not by mouseleave — which never comes when the thing under the pointer
  // is re-rendered, removed or scrolled away, and that is how the panel used
  // to outlive the pointer — but by POSITION: every move of the pointer
  // outside the box that holds the chip and the panel closes it. A scroll,
  // a resize, a selection (the details panel reflows the columns) and a
  // layout that moved or lost the chip's row close it too, pointer still.
  useEffect(() => {
    if (!refExpand) return
    const off = () => setRefExpand(null)
    const onMove = (e: MouseEvent) => {
      // The column's chip, or the stacked row's pill — and the copy of the
      // pill a hover lays over the row, which is wider than the pill itself.
      const chip = document.querySelector('.cg-refs-chips--open, .cg-meta-refs--open')
      const copy = document.querySelector('.cg-meta-refs--open .mchip-expand')
      const panel = document.querySelector('.ref-expansion-popup')
      const peek = document.querySelector('.ref-peek')
      const rects = [chip, panel, peek].filter((el): el is Element => !!el).map(el => el.getBoundingClientRect())
      if (rects.length === 0) { off(); return }
      // The copy is only drawn while the pill is hovered: undrawn, it has no
      // box, and its 0,0 would stretch this one to the corner of the window.
      const copyRect = copy?.getBoundingClientRect()
      if (copyRect && (copyRect.width > 0 || copyRect.height > 0)) rects.push(copyRect)
      const pad = 8
      const box = {
        left: Math.min(...rects.map(r => r.left)) - pad, right: Math.max(...rects.map(r => r.right)) + pad,
        top: Math.min(...rects.map(r => r.top)) - pad, bottom: Math.max(...rects.map(r => r.bottom)) + pad,
      }
      if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) off()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('scroll', off, true)
    window.addEventListener('resize', off)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('scroll', off, true)
      window.removeEventListener('resize', off)
    }
  }, [refExpand])
  useEffect(() => { setRefExpand(null) }, [selectedHash])
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
      const wipColor = conflictMode ? 'var(--attention)' : c.color
      const edges = c.edges.map(e => ({ ...e, color: 'var(--text-disabled)', dashed: true }))
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
  /**
   * Where each row starts, and how tall it is.
   *
   * Rows used to be `index * ROW_HEIGHT` everywhere — the node, the edges, the
   * bands, the scroll maths and the absolute `top` of the row itself. That only
   * holds while every row is the same height, which stops being true the moment
   * refs are drawn under the subject: a row with a ref is taller, and a row
   * without one must not be.
   *
   * ⚠️ The **node stays centred on the subject line**, not on the middle of a
   * taller row. Centring it on the row would make the graph drift away from the
   * text it describes, one half-line at a time, wherever a ref appears.
   */
  const rowTops = useMemo(
    // Every row carries a second line in the stacked layout, whether or not it
    // has a ref: the sha, the author and the date live there now, so a row
    // without a branch is not a shorter row — it is the same row with one fewer
    // thing on its second line.
    () => rowOffsets(displayLayout.map(() => refsBelow), rowH, refH),
    [displayLayout, refsBelow, rowH, refH])
  const rowTop = useCallback((row: number) => rowTops[row] ?? row * rowH, [rowTops, rowH])

  // ── Stretches of time (timeline.ts) ──
  // Which stretch each row is in; where a new one begins (a hairline); and
  // which one the first visible row is in (the band at the top). The band
  // only appears once the page spans more than one stretch — a repository
  // of one afternoon has nothing to name.
  const periods = useMemo(() => {
    if (!showTimeline) return []
    const now = new Date()
    return displayLayout.map(c => c.hash === WIP_HASH ? null : periodOf(c.date, now))
  }, [displayLayout, showTimeline])
  const periodSeps = useMemo(() => periodBoundaries(periods), [periods])
  const manyPeriods = useMemo(() => new Set(periods.filter(Boolean)).size > 1, [periods])
  const [firstRow, setFirstRow] = useState(0)
  // The last row on screen too — the minimap draws the stretch between them.
  const [lastRow, setLastRow] = useState(0)
  const scrollRaf = useRef(0)
  const measureRows = useCallback(() => {
    const body = bodyRef.current
    if (!body || rowTops.length === 0) return
    // The window of drawn rows asks whether the body has a height at all; the
    // resize observer says so too, but a scroll must not wait for it.
    setBodyH(body.clientHeight)
    const top = body.scrollTop
    // The first row whose bottom edge is still below the top of the viewport…
    let lo = 0, hi = rowTops.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if ((rowTops[mid + 1] ?? Infinity) > top) hi = mid
      else lo = mid + 1
    }
    setFirstRow(lo)
    // …and the last one whose top edge is above its bottom.
    const bottom = top + body.clientHeight
    let a = lo, b = rowTops.length - 1
    while (a < b) {
      const mid = (a + b + 1) >> 1
      if ((rowTops[mid] ?? Infinity) < bottom) a = mid
      else b = mid - 1
    }
    setLastRow(a)
  }, [rowTops])
  const onBodyScroll = useCallback(() => {
    if (scrollRaf.current) return
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = 0
      measureRows()
    })
  }, [measureRows])
  // A reload or a resize moves what is on screen without a scroll.
  useEffect(() => { measureRows() }, [measureRows, containerW, bodyH])
  useEffect(() => () => { if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current) }, [])
  // ── The rows that are drawn (graph-window.ts) ──
  // Everything above works on `displayLayout`, every commit loaded; only what
  // is near the viewport becomes elements. Before the body has a height there
  // is no last row to speak of, so a tall viewport is assumed.
  const drawWindow = useMemo(
    () => rowWindow(firstRow, bodyH > 0 ? lastRow : firstRow + UNMEASURED_ROWS, displayLayout.length),
    [firstRow, lastRow, bodyH, displayLayout.length])
  const windowRows = useMemo(
    () => rowsToDraw(displayLayout, drawWindow), [displayLayout, drawWindow])
  const drawnRows = useMemo(
    () => rowsToDraw(displayLayout, drawWindow, [selectedHash, dragSource]),
    [displayLayout, drawWindow, selectedHash, dragSource])
  const drawnEdges = useMemo(() => edgesInWindow(displayLayout, drawWindow), [displayLayout, drawWindow])
  // ── Role marks (#253) ── The rows a branch is read against: HEAD, its
  // upstream, the branch it merges into. One mark per row, split when a row is
  // several of them — and no target's mark on HEAD's own row, where there is no
  // merge to speak of. Worked out for the rows that are drawn, not per render
  // of each row: they are three rows at most.
  const markedRows = useMemo(() => {
    const out: { commit: LayoutCommit; roles: MarkerRole[] }[] = []
    for (const commit of windowRows) {
      if (commit.hash === WIP_HASH) continue
      const isHead = commit.refs.some(r => r.includes('HEAD ->') && r.includes(currentBranch))
      const roles: MarkerRole[] = []
      if (isHead) roles.push('head')
      if (commit.hash === upstreamHash) roles.push('upstream')
      if (commit.hash === targetHash && !isHead) roles.push('target')
      if (roles.length) out.push({ commit, roles })
    }
    return out
  }, [windowRows, currentBranch, upstreamHash, targetHash])
  const bandKey = showTimeline && manyPeriods ? periodAt(periods, firstRow) : null
  const bandLabel = bandKey ? periodLabel(bandKey, t, t('graph.dateLocale')) : null
  /** The middle of a row's first line — where the node and every edge meet it. */
  const rowHeight = useCallback(
    (row: number) => (rowTops[row + 1] ?? 0) - (rowTops[row] ?? 0) || rowH, [rowTops, rowH])
  // The CELL's middle, not the first line's: a stacked row is two lines tall
  // and its bullet sits at its centre, the way the reference centres its
  // avatar on the block. Classic single-line rows: the same number as before.
  const rowMid = useCallback((row: number) => rowTop(row) + rowHeight(row) / 2, [rowTop, rowHeight])
  /** Where a role mark sits in its row: the lane band's own box in the column layout, the whole row in the stacked one. */
  const markerBox = useCallback((row: number) => refsBelow
    ? { top: rowTop(row), height: rowHeight(row) }
    : { top: rowTop(row) + (rowH - LANE_BAND_H) / 2, height: LANE_BAND_H },
  [refsBelow, rowTop, rowHeight, rowH])
  // keyboard …), make sure the selected row is visible.
  useEffect(() => {
    if (!selectedHash) return
    const row = displayLayout.find(c => c.hash === selectedHash)?.row
    const body = bodyRef.current
    if (row == null || !body) return
    const top = rowTop(row)
    if (top < body.scrollTop || top + rowHeight(row) > body.scrollTop + body.clientHeight) {
      body.scrollTo({ top: Math.max(0, top - body.clientHeight / 2), behavior: 'smooth' })
    }
  }, [selectedHash, rowTop, rowHeight])
  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Multiple selection (#69) ──────────────────────────────────
  // Graph-local: `selectedHash` stays the panel's single subject, the SET is
  // what batch actions read. Shift-click takes the range from the anchor,
  // ctrl/cmd-click toggles one row (seeding the set with the single selection,
  // so growing FROM what is selected does what it looks like). A plain click,
  // the arrows and Escape all collapse it — the set exists while it is being
  // used and never lingers as invisible state.
  const [multiSel, setMultiSel] = useState<Set<string>>(() => new Set())
  const [selAnchor, setSelAnchor] = useState<string | null>(null)
  // ── `/`, `?`, and what a jump says when it has nowhere to go ──
  const [finderOpen, setFinderOpen] = useState(false)
  const [keysOpen, setKeysOpen] = useState(false)
  /** The row the finder is standing on: emphasised, never selected until Enter. */
  const [findHit, setFindHit] = useState<string | null>(null)
  /** Read out, not shown: a key that found nothing to go to says so to a screen reader. */
  const [said, setSaid] = useState('')
  /** A row brought a third of the way down the viewport — where a jump lands. */
  const bringToView = useCallback((row: number) => {
    const body = bodyRef.current
    if (!body) return
    const top = rowTop(row)
    // Already comfortably on screen: a row that does not move is easier to follow.
    if (top >= body.scrollTop && top + rowHeight(row) <= body.scrollTop + body.clientHeight * (2 / 3)) return
    body.scrollTo({ top: Math.max(0, top - body.clientHeight / 3), behavior: 'smooth' })
  }, [rowTop, rowHeight])
  /** Go to a row as the selection — or only back into view when it already is. */
  const goToRow = useCallback((commit: LayoutCommit) => {
    setMultiSel(prev => prev.size ? new Set() : prev)
    if (commit.hash === selectedHash) bringToView(commit.row)
    else onSelectCommit(commit)
  }, [selectedHash, onSelectCommit, bringToView])
  // What `/` can find: the host's branches and tags, each with the row it is
  // on when the page holds it. Worktrees are read when the finder opens.
  const [worktrees, setWorktrees] = useState<{ path: string; branch: string; isMain?: boolean }[]>([])
  useEffect(() => {
    if (!finderOpen) return
    let stale = false
    const api = (window as unknown as { gitAPI?: { listWorktrees?: () => Promise<{ worktrees?: typeof worktrees }> } }).gitAPI
    api?.listWorktrees?.().then(r => { if (!stale) setWorktrees(r?.worktrees ?? []) }).catch(() => {})
    return () => { stale = true }
  }, [finderOpen])
  const findCandidates = useMemo(() => finderOpen ? refFindCandidates({
    branches: branches ?? [], tags: tags ?? [], worktrees, rowOf: rowOfRef,
    hidden: (name, kind) => hiddenChip(kind === 'tag' ? `tag: ${name}` : name),
  }) : [], [finderOpen, branches, tags, worktrees, rowOfRef, hiddenChip])
  const landOnMatch = useCallback((match: RefFindMatch | null) => {
    const commit = match?.row !== undefined ? displayLayout[match.row] : undefined
    setFindHit(commit?.hash ?? null)
    if (commit) bringToView(commit.row)
  }, [displayLayout, bringToView])
  const commitMatch = useCallback((match: RefFindMatch) => {
    const commit = match.row !== undefined ? displayLayout[match.row] : undefined
    if (commit) { goToRow(commit); setFinderOpen(false); return }
    // Not on the page: the host loads down to it and selects it; the finder
    // stays open until the row arrives (RefFinder closes itself then).
    onRevealRef?.(match.ref)
  }, [displayLayout, goToRow, onRevealRef])
  const closeFinder = useCallback(() => setFinderOpen(false), [])
  // ── A chip's card (#258) ── A click selects the reference's tip at once and
  // opens its card a moment later: long enough for a double-click — which
  // switches, as it always has — to take the gesture back.
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelOpenRef = useCallback(() => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null }
  }, [])
  useEffect(() => cancelOpenRef, [cancelOpenRef])
  const refTargetOf = useCallback((pref: ProcessedRef, hash: string): RefTarget =>
    pref.cls === 'rc-tag' ? { kind: 'tag', name: pref.display, hash }
    : pref.cls === 'rc-remote' ? { kind: 'remote', name: (pref.branchName ?? pref.display).replace(/^remotes\//, ''), hash }
    : { kind: 'head', name: pref.branchName ?? pref.display, hash }, [])
  const isOpenRef = useCallback((pref: ProcessedRef) => {
    if (!openRef) return false
    const mine = refTargetOf(pref, '')
    return mine.kind === openRef.kind && mine.name === openRef.name
  }, [openRef, refTargetOf])
  const openFinder = useCallback(() => setFinderOpen(true), [])
  const openShortcuts = useCallback(() => setKeysOpen(true), [])
  useEffect(() => { if (!finderOpen) setFindHit(null) }, [finderOpen])
  const handleRowClick = (e: React.MouseEvent, commit: LayoutCommit) => {
    if (commit.hash !== WIP_HASH) {
      if (e.shiftKey && selAnchor) {
        const a = displayLayout.find(c => c.hash === selAnchor)?.row
        if (a !== undefined) {
          const [lo, hi] = a < commit.row ? [a, commit.row] : [commit.row, a]
          setMultiSel(new Set(
            displayLayout.filter(c => c.row >= lo && c.row <= hi && c.hash !== WIP_HASH).map(c => c.hash)
          ))
          return
        }
      }
      if (e.metaKey || e.ctrlKey) {
        setMultiSel(prev => {
          const next = new Set(prev)
          if (next.size === 0 && selectedHash && selectedHash !== commit.hash) next.add(selectedHash)
          if (next.has(commit.hash)) next.delete(commit.hash)
          else next.add(commit.hash)
          return next
        })
        setSelAnchor(commit.hash)
        return
      }
    }
    setMultiSel(new Set())
    setSelAnchor(commit.hash)
    onSelectCommit(commit)
  }
  // Keyboard navigation — ↑/↓ move the selection, Escape closes the panel,
  // and a plain letter jumps: `h` to HEAD, `u` to its upstream, `w` to the
  // working changes, Home/End to the ends of the page. Skipped while an
  // input/textarea has focus.
  useEffect(() => {
    const JUMPS = new Set(['h', 'u', 't', 'w', 'Home', 'End'])
    const onKey = (e: KeyboardEvent) => {
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey
      const jump = JUMPS.has(e.key) && plain && !e.shiftKey
      // `/` and `?` are shifted keys on some layouts: the character decides, not the modifier.
      const opens = (e.key === '/' || e.key === '?') && plain
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Escape' && !jump && !opens) return
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      // Let open modals/menus own the keyboard — this graph's, and anyone
      // else's: one Escape closes one thing, and a menu the staging pane
      // opened is a thing.
      if (ctx || drop) return
      if (document.querySelector('[class$="-overlay"], [class*="-overlay "], .ctx-menu, [role="menu"], [role="dialog"], .pdrawer')) return
      // The finder, open but not holding the focus: one Escape closes one
      // thing, and it is the thing on top. Stopped here so the host's own
      // Escape — which clears the selection — does not hear the same key.
      if (finderOpen && e.key === 'Escape') {
        e.preventDefault(); e.stopImmediatePropagation()
        setFinderOpen(false)
        return
      }
      if (opens) {
        e.preventDefault()
        if (e.key === '/') setFinderOpen(true)
        else setKeysOpen(true)
        return
      }
      if (displayLayout.length === 0) return
      const idx = displayLayout.findIndex(c => c.hash === selectedHash)
      if (jump) {
        const target = e.key === 'h' ? headHash
          : e.key === 'u' ? upstreamHash
          : e.key === 't' ? targetHash
          : e.key === 'w' ? (hasWipNode ? '__WIP__' : headHash)
          : e.key === 'Home' ? displayLayout[0]?.hash
          : displayLayout[displayLayout.length - 1]?.hash
        const commit = target ? displayLayout.find(c => c.hash === target) : undefined
        if (!commit) {
          // A named row the page does not hold is asked of the host, which
          // grows the page to it; one that does not exist is said, not shown.
          const named = e.key === 'u' ? upstreamRef : e.key === 't' ? mergeTargetRef : null
          if (e.key !== 'u' && e.key !== 't') return
          e.preventDefault()
          if (named && onRevealRef) onRevealRef(named)
          else setSaid(t(e.key === 't' ? 'graph.jump.noTarget' : 'graph.jump.noUpstream'))
          return
        }
        e.preventDefault()
        goToRow(commit)
        return
      }
      if (e.key === 'Escape') {
        // The set goes first; the panel only closes once there is no set.
        if (multiSel.size) { setMultiSel(new Set()); return }
        if (idx !== -1) onSelectCommit(displayLayout[idx]) // toggles the selection off
        return
      }
      if (multiSel.size) setMultiSel(new Set())  // arrow nav is single-minded
      const next = idx === -1 ? 0 : idx + (e.key === 'ArrowDown' ? 1 : -1)
      if (next < 0 || next >= displayLayout.length) return
      e.preventDefault()
      onSelectCommit(displayLayout[next])
      const body = bodyRef.current
      if (body) {
        const top = rowTop(next)
        if (top < body.scrollTop) body.scrollTop = top
        else if (top + rowHeight(next) > body.scrollTop + body.clientHeight) {
          body.scrollTop = top + rowHeight(next) - body.clientHeight
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [displayLayout, selectedHash, onSelectCommit, ctx, drop, rowTop, rowHeight, multiSel, headHash, upstreamHash, targetHash, upstreamRef, mergeTargetRef, onRevealRef, hasWipNode, finderOpen, goToRow, t])
  const maxLane = useMemo(() => displayLayout.reduce((m, c) => Math.max(m, c.lane), 0), [displayLayout])
  // The stacked layout is the reference's list row: its lanes start at the
  // row's own edge and sit 15 apart (graph-parts, STACKED_*) — big avatars on
  // tight rails. The classic columns keep their constants.
  const svgPadL = refsBelow ? STACKED_PAD_L : SVG_PAD_L
  const laneW = refsBelow ? STACKED_LANE_W : LANE_WIDTH
  /** How big a row's node is drawn — a mark reaching toward it stops at its edge. */
  const nodeRadius = useCallback((c: LayoutCommit) =>
    c.hash !== WIP_HASH && (c.parents.length >= 2 || compactColumns) ? DOT_RADIUS : NODE_RADIUS,
  [compactColumns])
  const svgW = Math.max(svgPadL + (maxLane + 1) * laneW + SVG_PAD_R, 48)
  const svgH = rowTops[displayLayout.length] ?? displayLayout.length * rowH
  // The stacked text is RAGGED on purpose (at Victor's call): each row's text
  // starts just past its own graph — its node, or the rightmost rail passing
  // through that row, whichever reaches further. A shared column reserved the
  // history's deepest lane on every row, and most rows sat two empty lanes
  // from their own bullet. A pass-through edge occupies its target lane for
  // the rows it crosses, and up to both of its lanes where it bends.
  const rowEdgeLane = useMemo(() => {
    if (!refsBelow) return null
    const m = new Map<number, number>()
    const bump = (row: number, lane: number) => {
      const cur = m.get(row)
      if (cur === undefined || lane > cur) m.set(row, lane)
    }
    for (const c of displayLayout) {
      bump(c.row, c.lane)
      for (const e of c.edges) {
        bump(c.row, Math.max(e.fromLane, e.toLane))
        const lo = Math.min(c.row, e.toRow), hi = Math.max(c.row, e.toRow)
        for (let r = lo + 1; r < hi; r++) bump(r, e.toLane)
        bump(e.toRow, e.toLane)
      }
    }
    return m
  }, [refsBelow, displayLayout])
  // Availability-based column visibility. The message column must always keep
  // MSG_MIN px; the optional columns are granted space in priority order
  // (sha kept longest, author dropped first) only if it remains after the
  // branch/tag + graph columns. This prevents fixed-width columns from
  // overflowing — and being clipped to invisibility — when the graph is deep
  // or the panel is narrow (the VS Code panel case). (MSG_MIN is declared
  // above, next to the resize handles that also need it.)
  //
  // ⚠️ In the stacked layout there are **no optional columns at all**. The sha,
  // the author and the date are not narrower there — they are somewhere else:
  // on the row's second line, where a panel can afford them. Leaving them as
  // columns and hoping the budget fits is what made the panel show a date and
  // hide an author depending on how deep the graph happened to be.
  let colBudget = measured ? containerW - refsColW - svgW - MSG_MIN : Infinity
  const effShowSha = !refsBelow && showSha && colBudget >= shaColW
  if (effShowSha) colBudget -= shaColW
  const effShowStats = !refsBelow && showStats && colBudget >= statsColW
  if (effShowStats) colBudget -= statsColW
  const effShowDate = !refsBelow && showDate && colBudget >= dateColW
  if (effShowDate) colBudget -= dateColW
  const effShowAuthor = !refsBelow && showAuthor && colBudget >= authorColW
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
    if (!searchQuery && !hasHostHashes) return null
    // The query, read (utils/searchQuery): free text, and operators that narrow
    // — `author:`, `after:`, `before:` against the rows held here, `file:`
    // against what git answered (`requiredHashes`). Every operator has to hold.
    const parsed = parseSearchQuery(searchQuery)
    const now = Date.now()
    return new Set(
      displayLayout
        .filter(c => c.hash !== WIP_HASH && commitMatches(parsed, c, {
          now, required: requiredHashes,
          // Host-provided matches (diff search, AI search) OR the local text —
          // and with no query at all, the host's matches alone.
          textMatch: (hasHostHashes && searchHashes!.has(c.hash)) || (searchQuery !== '' && textMatches(parsed, c)),
        }))
        .map(c => c.row)
    )
  }, [displayLayout, searchQuery, searchHashes, requiredHashes])
  // The same matches by hash, for the minimap's days.
  const matchHashes = useMemo(() => {
    if (!filtered || !showMinimap) return null
    return new Set(displayLayout.filter(c => filtered.has(c.row)).map(c => c.hash))
  }, [filtered, displayLayout, showMinimap])
  // What the graph has on screen, as days, for the minimap's band.
  const visibleDays = useMemo(() => {
    if (!showMinimap || displayLayout.length === 0) return null
    const dayAt = (row: number) => {
      const c = displayLayout[Math.min(row, displayLayout.length - 1)]
      const at = c && c.hash !== WIP_HASH ? new Date(c.date).getTime() : Date.now()
      return dayOf(isNaN(at) ? Date.now() : at)
    }
    const a = dayAt(firstRow), b = dayAt(Math.max(firstRow, lastRow))
    return { newest: Math.max(a, b), oldest: Math.min(a, b) }
  }, [showMinimap, displayLayout, firstRow, lastRow])
  // A day picked on the minimap: its commit becomes the selection, or — when
  // it already is — is only brought back into view.
  const pickFromMinimap = useCallback((hash: string) => {
    const commit = displayLayout.find(c => c.hash === hash)
    if (!commit) return
    if (multiSel.size) setMultiSel(new Set())
    if (commit.hash === selectedHash) {
      const body = bodyRef.current
      if (body) body.scrollTo({ top: Math.max(0, rowTop(commit.row) - body.clientHeight / 2), behavior: 'smooth' })
    } else onSelectCommit(commit)
  }, [displayLayout, multiSel, selectedHash, onSelectCommit, rowTop])
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
  // Every commit by hash, and the branch each row is NAMED after (#173).
  const byHash = useMemo(() => new Map(displayLayout.map(c => [c.hash, c])), [displayLayout])
  /**
   * The tip whose branch names a row that has no ref of its own — the ghost.
   * Two passes, nearest tip first (rows are topological, so a tip that holds
   * a commit is always above it, and the nearest is the lowest):
   *   A. along the row's own LINE (graph-layout's ownerTip, the rule that
   *      colours the lane): a tip on the same line beats any other, so name
   *      and colour agree wherever they can — the commits under main's tip
   *      say main, not the branch three rows higher that holds them too;
   *   B. by CONTAINMENT over every parent, for what pass A left: the commits
   *      of a merged branch whose ref is gone are named after the nearest
   *      branch that reaches them, which is what they are on.
   * A tag is not a tip — it names a release, not a line — nor is the
   * working-changes node: HEAD's own commit is the tip of its line.
   */
  const ghostLead = useMemo(() => {
    const isTip = (c: LayoutCommit) => c.hash !== WIP_HASH && processRefs(c.refs, hiddenChip).some(p => p.cls !== 'rc-tag')
    const tips = displayLayout.filter(isTip).sort((a, b) => b.row - a.row)
    const lead = new Map<string, string>()
    const onLine = new Set<string>()
    for (const tip of tips) {
      let h: string | undefined = tip.hash
      while (h && !lead.has(h)) {
        const c = byHash.get(h)
        if (!c || c.ownerTip !== tip.ownerTip) break
        lead.set(h, tip.hash)
        onLine.add(h)
        h = c.parents[0]
      }
    }
    for (const tip of tips) {
      const stack = [tip.hash]
      const seen = new Set<string>()
      while (stack.length) {
        const h = stack.pop()!
        if (seen.has(h)) continue
        seen.add(h)
        const c = byHash.get(h)
        if (!c) continue
        // A nearer tip's ground by containment: everything under it is that
        // tip's too. A line's own labels are crossed, never taken.
        if (lead.has(h)) { if (!onLine.has(h)) continue }
        else lead.set(h, tip.hash)
        for (const p of c.parents) stack.push(p)
      }
    }
    return lead
  }, [displayLayout, byHash, hiddenChip])
  /**
   * The refs a row SHOWS: its own — or, for a row that has none, the refs of
   * the tip that names it, that tip's branch first, worn as a GHOST (#173).
   */
  const shownRefs = useCallback((c: LayoutCommit): { prefs: ProcessedRef[]; ghost: boolean } => {
    const own = processRefs(c.refs, hiddenChip)
    if (own.length > 0 || c.hash === WIP_HASH) return { prefs: own, ghost: false }
    const tipHash = ghostLead.get(c.hash)
    const tip = tipHash ? byHash.get(tipHash) : undefined
    if (!tip) return { prefs: own, ghost: false }
    const all = processRefs(tip.refs, hiddenChip)
    const lead = all.findIndex(p => p.cls !== 'rc-tag')
    if (lead < 0) return { prefs: own, ghost: false }
    return { prefs: [all[lead], ...all.filter((_, i) => i !== lead)], ghost: true }
  }, [byHash, ghostLead, hiddenChip])
  // The commits on screen NOW, for what runs later than the render that armed it.
  const liveHashes = useRef(byHash)
  liveHashes.current = byHash
  /**
   * A click on a chip. A ghost — a name worn by a row further down its line —
   * stands for the branch, not for that row: what is selected is the TIP.
   */
  const openChip = useCallback((pref: ProcessedRef, commit: LayoutCommit, ghost: boolean) => {
    if (!onOpenRef) return
    const tip = (ghost ? byHash.get(ghostLead.get(commit.hash) ?? '') : undefined) ?? commit
    cancelOpenRef()
    if (multiSel.size) setMultiSel(new Set())
    if (tip.hash !== selectedHash) onSelectCommit(tip)
    openTimer.current = setTimeout(() => {
      openTimer.current = null
      // A quarter of a second is long enough for the graph to have become
      // another one — a tab closed, a repository switched: the card of a
      // commit that is no longer on screen is not opened.
      if (!liveHashes.current.has(tip.hash)) return
      onOpenRef(refTargetOf(pref, tip.hash))
    }, 250)
  }, [onOpenRef, byHash, ghostLead, cancelOpenRef, multiSel, selectedHash, onSelectCommit, refTargetOf])
  /** The double-click switches, and takes back the card the first click was about to open. */
  const switchFromChip = useCallback((name: string) => {
    cancelOpenRef()
    onCheckoutBranch?.(name)
  }, [cancelOpenRef, onCheckoutBranch])
  // The chip's row moved, or is gone (a filter, a refresh): the anchor is
  // stale, and a panel shown again when the row comes back would be a panel
  // the pointer never asked for.
  useEffect(() => {
    if (!refExpand) return
    const c = byHash.get(refExpand.hash)
    if (!c || c.row !== refExpand.row) setRefExpand(null)
  }, [refExpand, byHash])
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
      const fp: string | undefined = cur.parents[0]
      // Annotated because `cur` is reassigned from it below: without this the
      // inference is circular and both land on `any`, which is how a whole
      // walk over the graph went unchecked.
      const next: typeof hovered | undefined = fp ? byHash.get(fp) : undefined
      if (!next) break
      // Stop before entering another branch's territory
      if (next.refs.some(isLocalBranchRef)) break
      cur = next
    }
    return rows.size ? rows : null
  }, [hoverHash, displayLayout])
  // ⚠️ `rowMid` is read inside. With `[]` as the dependency list this captured
  // the offsets of the first render and never let go: rows became variable in
  // height, the offsets changed, and every edge kept pointing at where its
  // target row *used* to be — a line ending in the gap between two commits.
  // That was the "line pointing at no commit" in the third screenshot.
  const renderEdge = useCallback((commit: LayoutCommit, edge: typeof commit.edges[0]) => {
    const isWip = commit.hash === WIP_HASH
    const x1 = svgPadL + edge.fromLane * laneW
    const y1 = rowMid(commit.row)
    const x2 = svgPadL + edge.toLane * laneW
    const y2 = rowMid(edge.toRow)
    const key = `${commit.hash}-${edge.fromLane}-${edge.toLane}-${edge.toRow}`
    const dashArray = isWip || edge.dashed ? '4 3' : undefined

    if (x1 === x2) {
      return (
        <line key={key} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={edge.color} strokeWidth={2} strokeLinecap="round"
          strokeDasharray={dashArray} />
      )
    }

    // The WIP node's fork edge is drawn by the shared fork/merge logic below
    // (just dashed): its vertical must stay in the WIP's own lane and only elbow
    // into the target at the BOTTOM. Curving onto the target lane right away —
    // as it used to — made the dashed line run straight down that lane and cut
    // through any commit sitting on it between the WIP and its parent (e.g. the
    // master tip when HEAD is a branch one commit behind master).

    // The elbow sits at the connection point, not the midpoint:
    //  - fork (a branch diverging from its base): the vertical stays in the
    //    branch's own lane (fromLane) and the horizontal jog happens at the
    //    BOTTOM, on the base commit's row.
    //  - merge (a merge commit reaching a 2nd parent): the horizontal jog
    //    happens at the TOP, on the merge commit's row, then the vertical runs
    //    down the parent's lane (toLane).
    const r = Math.min(laneW * 0.6, Math.abs(y2 - y1) / 2)
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
  }, [rowMid, svgPadL, laneW])
  // Right-click on a ref chip. A LOCAL branch opens the same menu as its tip
  // commit (branch actions + commit actions); tags and remote
  // branches keep their own dedicated menu.
  const openRefMenu = useCallback((e: React.MouseEvent, pref: ProcessedRef, commit: LayoutCommit) => {
    if ((pref.cls === 'rc-local' || pref.cls === 'rc-head') && pref.branchName) {
      setCtx({ x: e.clientX, y: e.clientY, commit, branchName: pref.branchName })
    } else {
      setBranchCtx({ x: e.clientX, y: e.clientY, pref })
    }
  }, [])
  /** A stacked row's pill for one ref — the row's own, or one its "+N" lists. */
  const pillSegments = useCallback((pref: ProcessedRef, commit: LayoutCommit, ghost: boolean) =>
    messageChipSegments(pref, issueForBranch, {
      onCheckout: onCheckoutBranch ? switchFromChip : undefined,
      onMenu: e => openRefMenu(e, pref, commit),
      onOpenPR,
      onOpen: onOpenRef ? () => openChip(pref, commit, ghost) : undefined,
    }, trackingFor, prForBranch),
  [issueForBranch, onCheckoutBranch, switchFromChip, openRefMenu, onOpenPR, onOpenRef, openChip, trackingFor, prForBranch])
  const handleRowDrop = useCallback((e: React.DragEvent, commit: LayoutCommit) => {
    e.preventDefault()
    setDragOverRow(null)
    const branch = dragBranch ?? e.dataTransfer.getData('text/plain')
    setDragBranch(null)
    setDragSource(null)
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

  // Every menu the graph opens, from ./graph-menus.
  const { buildMenuItems, batchMenuItems, buildDropItems, buildBranchMenu, buildHeaderMenuItems, handleRowContextMenu } = useGraphMenus(props, { t, set, showAvatars, showAuthor, showDate, showSha, showStats, showTimeline, showMinimap, compactColumns, drop, displayLayout, multiSel, setMultiSel, setCtx, localBranchAt, openFinder, openShortcuts })

  return (
    <div className="cg-container" ref={containerRef}>
      {/* ── Minimap ── The loaded history as a strip: a way around the graph,
           and one the user can put away (Minimap.tsx). In the host's block
           when it has one, at the top of the graph otherwise. */}
      {showMinimap && minimapSlot !== null && portalTo(minimapSlot,
        <Minimap
          commits={commits}
          headHash={headHash}
          upstreamHash={upstreamHash}
          targetHash={targetHash}
          matches={matchHashes}
          visible={visibleDays}
          selectedHash={selectedHash}
          remoteNames={remoteNames}
          onPick={pickFromMinimap}
          onWheel={dy => bodyRef.current?.scrollBy({ top: dy })}
          onHide={() => set('graphMinimap', 'false')}
        />)}
      {/* ── Header ── The column headers only mean something when there are
           columns. In the stacked layout the row carries its own labels by
           position, so a header would name a grid that is not there. */}
      {!refsBelow && <div
        className="cg-header"
        style={{ paddingRight: scrollbarW }}
        onContextMenu={e => { e.preventDefault(); setHeaderCtx({ x: e.clientX, y: e.clientY }) }}
        title={t('graph.header.title')}
      >
        {/* The header has to disappear with the column, or the rows shift left
            by its width while the header does not — which is what the first cut
            of this layout did, and it put the graph on top of the message. */}
        {!refsBelow && <>
          <div className="cg-h-refs" style={{ width: refsColW }}>{compactColumns ? 'B/T' : 'BRANCH / TAG'}</div>
          <div className="cg-col-handle" onMouseDown={onDragRefs} />
        </>}
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
      </div>}

      {/* `/`: over the header and the first rows, top right (RefFinder.tsx). */}
      <RefFinder open={finderOpen} candidates={findCandidates}
        onLand={landOnMatch} onCommit={commitMatch} onClose={closeFinder} />
      {keysOpen && <GraphShortcuts onClose={() => setKeysOpen(false)} />}
      <span className="cg-sr-live" role="status" aria-live="polite">{said}</span>

      {/* ── Body ── */}
      <div className="cg-body" ref={bodyRef} onScroll={onBodyScroll}>
        {bandLabel && (
          <div className="cg-period-band" aria-hidden="true"><span className="cg-period-pill">{bandLabel}</span></div>
        )}
        {/* As tall as every row loaded, holding only the rows near the viewport
            (graph-window.ts). `data-rows` is the count a script can wait on now
            that the number of row elements no longer says it. */}
        <div className="cg-scroll-content" data-rows={displayLayout.length} style={{ height: svgH, position: 'relative' }}>
          {/* Where one stretch of time ends and the next begins. */}
          {[...periodSeps].filter(row => inWindow(drawWindow, row)).map(row => (
            <div key={`sep-${row}`} className="cg-period-sep" style={{ top: rowTop(row) }} />
          ))}

          {/* Graph SVG — offset by the refs column, which is why it has to be
              zero when there is no column: with refs under the message the
              graph is the leftmost thing on the row, and leaving the old offset
              drew every node on top of the commit message. */}
          <svg
            className="cg-graph-svg"
            width={svgW}
            height={svgH}
            style={{
              position: 'absolute',
              left: refsBelow ? 0 : refsColW,
              top: 0,
              pointerEvents: 'none',
              zIndex: 2,
              overflow: 'visible',
            }}
          >
            {/* Role bands — from the mark at the graph's left edge to the node's
                centre, in the role's colour. FIRST in the SVG, so everything the
                graph draws is over it; and cut to the lane band's own height and
                place, so the two read as one strip through the row that changes
                colour at the node, not as a block laid beside it. */}
            {markedRows.map(({ commit, roles }) => {
              const cx = svgPadL + commit.lane * laneW
              const { top, height } = markerBox(commit.row)
              return (
                <rect key={`role-${commit.hash}`} className={`cg-marker-band cg-marker-band--${roles[0]}`}
                  x={MARKER_BAR_W} y={top} width={Math.max(0, cx - MARKER_BAR_W)} height={height} />
              )
            })}

            {/* Lane bands — a soft colored strip from each commit's node to the
                right edge of the graph (just before the commit info), matching the
                node color. The right edge is a straight, more pronounced vertical
                bar. Improves row readability.

                ⚠️ Column layout only. In the stacked rows the stripe at the left
                edge already colours the commit, and the band's right-edge bar
                reads as a stray mark beside the bullet. */}
            {!refsBelow && windowRows.map(commit => {
              if (commit.hash === WIP_HASH) return null
              const cx = svgPadL + commit.lane * laneW
              const bandH = LANE_BAND_H
              const y = rowTop(commit.row) + (rowH - bandH) / 2
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

            {/* Connector lines (chip → node): rendered before edges so branch lines appear on top.
                ⚠️ Column layout only — the chip it points at is under the message
                now, so the line ran left of the bullet toward nothing. */}
            {!refsBelow && windowRows.map(commit => {
              if (commit.hash === WIP_HASH || commit.refs.length === 0) return null
              const cx = svgPadL + commit.lane * laneW
              const cy = rowMid(commit.row)
              if (cx - NODE_RADIUS <= 0) return null
              return (
                <line key={`conn-${commit.hash}`}
                  x1={0} y1={cy} x2={cx - NODE_RADIUS} y2={cy}
                  stroke={dimColor(commit.color)} strokeWidth={1.5}
                />
              )
            })}

            {/* Edges — the window's own, and the ones that only pass through it. */}
            {drawnEdges.map(({ commit, edge }) => renderEdge(commit, edge))}

            {/* Nodes */}
            {windowRows.map(commit => {
              const cx = svgPadL + commit.lane * laneW
              const cy = rowMid(commit.row)
              const isSelected = commit.hash === selectedHash
              const isWip = commit.hash === WIP_HASH

              if (isWip) {
                if (conflictMode) {
                  return (
                    <g key="wip">
                      <circle cx={cx} cy={cy} r={NODE_RADIUS + 2} fill="var(--surface)" />
                      <circle cx={cx} cy={cy} r={NODE_RADIUS}
                        fill="var(--attention)"
                        stroke="var(--attention)"
                        strokeWidth={1.5}
                      />
                      <text x={cx} y={cy} dy=".35em"
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight="900"
                        fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
                        fill="var(--surface)"
                      >!</text>
                    </g>
                  )
                }

                return (
                  <g key="wip">
                    <circle cx={cx} cy={cy} r={NODE_RADIUS}
                      fill="var(--surface)"
                      stroke="var(--text-tertiary)"
                      strokeWidth={1.5}
                      strokeDasharray="3 2"
                    />
                    <text x={cx} y={cy} dy=".35em"
                      textAnchor="middle"
                      fontSize={6}
                      fontWeight="700"
                      fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
                      fill="var(--text-tertiary)"
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
                    <circle cx={cx} cy={cy} r={DOT_RADIUS} fill={commit.color}
                      stroke="var(--surface)" strokeWidth={2} />
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
                        fill="var(--text-on-emphasis)">{init}</text>
                    </g>
                  )}
                </g>
              )
            })}

          </svg>

          {/* Role marks: the bar, and the names it opens into under the pointer.
              Siblings of the SVG and above it — a row is a stacking context UNDER
              the graph, so a mark inside a row opened beneath the node's avatar
              with its label cut. The hit zone comes first in the document so the
              pill paints over it and keeps its own hover as it slides out. It
              covers the whole band, from the edge to the node as it is DRAWN —
              a merge's dot is a third of an avatar, and a zone that stopped an
              avatar's width short left most of that band dead — and stops there:
              the node stays the node's. */}
          {markedRows.map(({ commit, roles }) => {
            const left = refsBelow ? 0 : refsColW
            const { top, height } = markerBox(commit.row)
            const reach = Math.max(0, svgPadL + commit.lane * laneW - nodeRadius(commit) - 3)
            const tip = roles.map(r => r === 'head' ? t('graph.marker.headTip')
              : r === 'upstream' ? t('graph.marker.upstreamTip')
              : t('graph.marker.targetTip', mergeTargetRef ?? '')).join(', ')
            const select = (e: React.MouseEvent) => handleRowClick(e, commit)
            return (
              <React.Fragment key={`mark-${commit.hash}`}>
                <div className="cg-marker-hit" style={{ left, top, height, width: reach }} title={tip} onClick={select} />
                <div className="cg-marker-rail" data-roles={roles.join(' ')} data-hash={commit.hash} title={tip} onClick={select}
                  style={{ left, top, height, minWidth: Math.min(14, Math.max(MARKER_BAR_W, reach)) }}>
                  <span className="cg-marker-bar">
                    {roles.map(r => <i key={r} className={`cg-marker-swatch cg-marker--${r}`} />)}
                  </span>
                  <span className="cg-marker-pill">
                    <span className="cg-marker-pill-inner">
                      {roles.map(r => (
                        <span key={r} className={`cg-marker-seg cg-marker--${r}`}>
                          <Icon name={MARKER_ICON[r]} size={11} />
                          <span className="cg-marker-label">{t(`graph.marker.${r}`)}</span>
                        </span>
                      ))}
                    </span>
                  </span>
                </div>
              </React.Fragment>
            )
          })}

          {/* Rows */}
          {drawnRows.map(commit => {
            const isSelected = commit.hash === selectedHash
            const isWip = commit.hash === WIP_HASH
            // Active dim set: search takes precedence, otherwise ref-hover lane.
            const keep = filtered ?? hoverHighlight
            const isDimmed = !isWip && keep !== null && !keep.has(commit.row)
            const isDropTarget = dragOverRow === commit.row && !isWip
            const { prefs, ghost } = shownRefs(commit)
            // A ghost's face says whose line this is; the rows behind it keep
            // their own tooltips — and no checkmark: ✓ reads "checked out", which
            // is a fact about the tip, not about this commit.
            const primary: ProcessedRef | undefined = prefs[0] && ghost
              ? { ...prefs[0], isHead: false, tooltip: t('graph.ghostTip', prefs[0].display) }
              : prefs[0]
            const stackCount = prefs.length - 1
            // What a rest on the chip opens: the "+N" panel when there is one,
            // and the chip itself, whole, when the column cut its name or the
            // compact layout hid it. Measured on the name, at the rest. The
            // stacked row's pill reads its own names whole on a hover already
            // (MessageChip), so there it is only ever the panel.
            const armOpen = (el: HTMLElement) => {
              const chip = (el.querySelector('.ref-chip, .mchip') ?? el) as HTMLElement
              const name = chip.querySelector('.rc-name')
              const cut = !refsBelow && (compactColumns || (!!name && name.scrollWidth > name.clientWidth + 1))
              if (stackCount < 1 && !cut) return
              if (refOpenTimer.current) clearTimeout(refOpenTimer.current)
              refOpenTimer.current = setTimeout(() => {
                refOpenTimer.current = null
                // Asked before a scroll, firing after it: the chip moved.
                if (Date.now() - lastScrollAt.current < 300) return
                setRefExpand({ hash: commit.hash, row: commit.row, rect: chip.getBoundingClientRect(), peek: cut })
              }, 150)
            }
            // The pointer on a row's refs, wherever they are drawn — the column's
            // chip or the stacked row's pill: the lane lights after a rest, and
            // what the chip hides opens after a shorter one.
            const refsHover = {
              onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
                // A hover the scroll made, not the hand: nothing starts.
                if (Date.now() - lastScrollAt.current < 300) return
                // Highlight after a delay — a rest, not a crossing
                if (hoverDelayTimer.current) clearTimeout(hoverDelayTimer.current)
                hoverDelayTimer.current = setTimeout(() => setHoverHash(commit.hash), 1000)
                // Anchor on the CHIP, not on this wrapper: the wrapper
                // also holds the "+N" badge, so using it made the panel
                // wider than the name it sits under for no reason.
                if (refExpand?.hash !== commit.hash) armOpen(e.currentTarget)
              },
              // After a scroll the pointer may already sit on a chip it
              // never entered: a real move on it counts as the entry.
              onMouseMove: (e: React.MouseEvent<HTMLElement>) => {
                if (refOpenTimer.current || refExpand?.hash === commit.hash) return
                if (Date.now() - lastScrollAt.current < 300) return
                armOpen(e.currentTarget)
              },
              // Leaving cancels what was about to open; what IS open
              // lives by the pointer's position, not by this event.
              onMouseLeave: () => {
                if (hoverDelayTimer.current) { clearTimeout(hoverDelayTimer.current); hoverDelayTimer.current = null }
                if (refOpenTimer.current) { clearTimeout(refOpenTimer.current); refOpenTimer.current = null }
                setHoverHash(null)
              },
            }
            const rowIsHead = !isWip && commit.refs.some(r => r.includes('HEAD ->') && r.includes(currentBranch))
            const rowCanReword = rowIsHead || commit.parents.length > 0
            // Stacked: where THIS row's lanes end — its rightmost lane's
            // centre, then half a lane and the padding. The text column starts
            // there, ragged and meant to be, and the band's colour peaks there.
            const gutterEnd = svgPadL + (rowEdgeLane?.get(commit.row) ?? commit.lane) * laneW + STACKED_GUTTER_END
            return (
              <div
                key={commit.hash}
                className={`cg-row ${refsBelow ? "cg-row--stacked" : ""} ${isSelected ? 'cg-selected' : ''} ${multiSel.has(commit.hash) ? 'cg-multisel' : ''} ${isDimmed ? 'cg-dimmed' : ''} ${isWip ? 'cg-row-wip' : ''} ${isDropTarget ? 'cg-drop-target' : ''} ${findHit === commit.hash ? 'cg-row--find-hit' : ''}`}
                style={{
                  top: rowTop(commit.row), height: rowHeight(commit.row),
                  // The branch's colour, for anything the row draws in it —
                  // the stripe, and the stacked row's band.
                  '--cg-row-color': isWip ? 'var(--text-disabled)' : commit.color,
                  // The stacked band runs from the node to the lanes' end.
                  ...(refsBelow ? {
                    '--cg-node-x': `${svgPadL + commit.lane * laneW}px`,
                    '--cg-band-edge': `${gutterEnd}px`,
                  } : {}),
                } as React.CSSProperties}
                onClick={e => handleRowClick(e, commit)}
                // Shift-click means "take the range", never "select the text".
                onMouseDown={e => { if (e.shiftKey) e.preventDefault() }}
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
                {/* Colored left stripe based on branch — the columns' only. A
                    stacked row's colour is its band, from the node (CSS). */}
                {!refsBelow && <div className="cg-color-bar" style={{ background: isWip ? 'var(--text-disabled)' : commit.color }} />}

                {/* The refs column: the chip, its "+N", and the stub that ties
                    it to the node. The stacked row carries its refs under the
                    message instead (the pill, below). */}
                {!refsBelow && (
                  <div className="cg-refs-col" style={{ width: refsColW }}>
                    {primary ? (
                      <>
                        <div
                          className={`cg-refs-chips${ghost ? ' cg-refs-chips--ghost' : ''}${refExpand?.hash === commit.hash ? ' cg-refs-chips--open' : ''}`}
                          {...refsHover}
                        >
                          <RefChip pref={primary} ghost={ghost} laneColor={commit.color} compact={compactColumns}
                            open={isOpenRef(primary)} onOpen={onOpenRef ? p => openChip(p, commit, ghost) : undefined}
                            onDoubleClick={onCheckoutBranch ? switchFromChip : undefined}
                            onDragStartBranch={b => { setDragBranch(b); setDragSource(commit.hash) }}
                            onDragEndBranch={() => { setDragBranch(null); setDragSource(null); setDragOverRow(null) }}
                            onContextMenu={(e, pref) => openRefMenu(e, pref, commit)} />
                          {stackCount > 0 && (
                            <span className="rc-stack-badge">+{stackCount}</span>
                          )}
                        </div>
                        {/* Flex stub: fills space from chip right edge to SVG boundary.
                            A ghost is not tied to the graph — no stub. */}
                        {!ghost && <div className="cg-ref-line-stub" style={{ background: dimColor(commit.color) }} />}
                      </>
                    ) : null}
                  </div>
                )}

                {/* Spacer for SVG. Classic columns: the shared width. Stacked:
                    THIS row's lanes, to `gutterEnd`. */}
                <div style={{ width: refsBelow ? gutterEnd : svgW, flexShrink: 0 }} />

                {/* Message */}
                <div className={`cg-col-msg ${refsBelow ? 'cg-col-msg--stacked' : ''}`}>
                  <div className="cg-msg-line">
                    <span className={`cg-msg ${isWip ? 'cg-msg-wip' : ''}`} title={isWip ? undefined : commit.message}>{
                      isWip ? commit.message
                      // Stacked: the subject in its markup, then — muted, after a
                      // bullet — the body on the same line. One ellipsis for
                      // both, at the end: the body is cut before the subject is.
                      : refsBelow ? <>
                        <span>{inlineMarkup(commit.message, s => linkifyIssues(s, githubRepo, autolinks))}</span>
                        {commit.body && <>
                          <span className="cg-msg-sep" aria-hidden="true">•</span>
                          <span className="cg-msg-body">{inlineMarkup(commit.body)}</span>
                        </>}
                      </>
                      : linkifyIssues(commit.message, githubRepo, autolinks)
                    }</span>
                  </div>
                  {/* The second line. What the columns used to say, said by
                      position instead: the chip and the identity on the left,
                      the date pushed to the right edge. A panel does not have
                      the width for a grid, but every row has a second line. */}
                  {refsBelow && (
                    <div className="cg-row-meta">
                      {/* The pill says its names whole on a hover (MessageChip);
                          a rest on it lists the refs its "+N" stands for, the
                          way the column's chip does. A row's own refs lead the
                          line. A ghost (#173) takes no room at rest — a hole
                          before the sha on every row without a ref is what cut
                          the author short — and shows in the free space before
                          the date while the row is hovered or selected. */}
                      {prefs.length > 0 && !ghost && (
                        <span className={`cg-meta-refs${refExpand?.hash === commit.hash ? ' cg-meta-refs--open' : ''}`} {...refsHover}>
                          <MessageChip
                            tone={commit.color}
                            emphasis={!ghost && !!prefs[0].isHead}
                            refsHidden={stackCount}
                            segments={pillSegments(prefs[0], commit, false)}
                          />
                        </span>
                      )}
                      {!isWip && <>
                        <code className="cg-meta-sha">{commit.shortHash}</code>
                        <span className="cg-meta-author">{commit.author}</span>
                      </>}
                      {prefs.length > 0 && ghost && (
                        <span className={`cg-meta-refs cg-meta-refs--ghost${refExpand?.hash === commit.hash ? ' cg-meta-refs--open' : ''}`} {...refsHover}>
                          <MessageChip tone={commit.color} ghost refsHidden={stackCount}
                            segments={pillSegments(prefs[0], commit, true)} />
                        </span>
                      )}
                      {!isWip && <span className="cg-meta-date">{fmtDateShort(commit.date, t)}</span>}
                      {/* The Working Changes row: ✎N when there is something, and
                          the ✓ that stages all of it. Nothing when the tree is
                          clean — a button that can do nothing is not shown. */}
                      {isWip && wipCount > 0 && (
                        <span className="cg-wip-meta">
                          <span className="cg-wip-count" title={t('graph.wip', wipCount)}>
                            <Icon name="pencil" size={11} />{wipCount}
                          </span>
                          {onStageAll && (
                            <button className="cg-wip-stage-all" title={t('graph.stageAll')}
                              onClick={e => { e.stopPropagation(); onStageAll() }}>
                              <Icon name="check" size={12} />
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                  )}
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
                  <div className="cg-col-date" style={{ width: dateColW }}>{!isWip ? fmtDate(commit.date, dateFormat, t) : ''}</div>
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
            <div className="cg-empty">
              {/* The watermark cut: the mark at 35%, as a backdrop rather than a
                  subject. It is the one declination made for an empty state. */}
              <Mark size={96} cut="lite" mono className="cg-empty-mark" />
              {commits.length === 0 ? t('graph.emptyRepo') : t('graph.empty')}
            </div>
          )
        )}
      </div>

      {ctx && (
        <ContextMenu
          x={ctx.x} y={ctx.y}
          items={ctx.batch ? batchMenuItems() : buildMenuItems(ctx.commit, ctx.branchName)}
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
        const expandCommit = byHash.get(refExpand.hash)
        if (!expandCommit) return null
        const shown = shownRefs(expandCommit)
        const primary = shown.prefs[0]
        const hiddenPrefs = shown.prefs.slice(1)
        // The chip, whole, over the graph: the column cut its name (or the
        // compact layout hid it), and a rest on it is the ask to read it —
        // even over the commit's bullet. Display only: the pointer keeps
        // talking to the chip underneath.
        const peek = refExpand.peek && primary ? createPortal(
          <div className="ref-peek" style={{ position: 'fixed', left: refExpand.rect.left, top: refExpand.rect.top, height: refExpand.rect.height, zIndex: 9998 }}>
            <RefChip pref={primary} ghost={shown.ghost} laneColor={expandCommit.color} />
            {hiddenPrefs.length > 0 && <span className="rc-stack-badge">+{hiddenPrefs.length}</span>}
          </div>,
          document.body,
        ) : null
        if (hiddenPrefs.length === 0) return peek
        return <>{peek}{createPortal(
          <RefExpansionPopup
            anchor={refExpand.rect}
            ghost={shown.ghost}
          >
            {/* Each in the shape the row gave the one in front of them: the
                column's chips, or the stacked row's pills — every name said. */}
            {hiddenPrefs.map((p, i) => refsBelow ? (
              <MessageChip key={i} expanded tone={expandCommit.color} ghost={shown.ghost}
                segments={pillSegments(p, expandCommit, shown.ghost)} />
            ) : (
              <RefChip key={i} pref={p} ghost={shown.ghost} laneColor={expandCommit.color}
                open={isOpenRef(p)} onOpen={onOpenRef ? pr => openChip(pr, expandCommit, shown.ghost) : undefined}
                onDoubleClick={onCheckoutBranch ? switchFromChip : undefined}
                onDragStartBranch={setDragBranch}
                onDragEndBranch={() => { setDragBranch(null); setDragOverRow(null) }}
                onContextMenu={(e, pref) => openRefMenu(e, pref, expandCommit)} />
            ))}
          </RefExpansionPopup>,
          document.body
        )}</>
      })()}
    </div>
  )
}
