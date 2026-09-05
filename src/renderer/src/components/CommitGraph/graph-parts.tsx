// What a row of the graph is drawn with: the geometry constants, the column widths,
// the avatars, the date formats, the ref chips and their expansion, the stats bar.
// Split out of CommitGraph.tsx, which held them with the graph itself and its menus.
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon/Icon'
import { canvasRgb } from './graph-layout'
import { type ChipSegment } from './MessageChip'
import { aiAvatarDataUri } from '../../utils/aiAvatars'

export const ROW_HEIGHT  = 28

/** The row's second line in the stacked layout. Must match .cg-row-meta. */
export const REF_LINE_H  = 22

/** The coloured stripe at the very left of a row (.cg-color-bar). */
export const COLOR_BAR_W = 3

/**
 * How far the stripe steps in from the panel edge in the stacked layout — flush
 * against it, it merged with the sidebar/graph junction and could not be seen.
 * Must match the margin-left on .cg-row--stacked .cg-color-bar.
 */
export const STRIPE_INSET = 4

export const LANE_WIDTH  = 22

export const NODE_RADIUS = 11

export const SVG_PAD_L   = 36

export const SVG_PAD_R   = 8

export const WIP_HASH    = '__WIP__'

// Just a persisted number — the actual drag math lives in startColumnResize
// below, since different handles need different resize strategies.
export function useStoredWidth(key: string, defaultW: number) {
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

export interface ResizeNeighbor { w: number; setW: (n: number) => void; key: string; min: number }

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
export function startColumnResize(opts: {
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

// Blend a hex color toward the graph background (var(--bg-canvas)) by `factor` (0..1).
// Produces an opaque color so overlapping segments never add up in brightness.
export function dimColor(hex: string, factor = 0.4): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return hex
  const [r, g, b] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
  const bg = canvasRgb()
  const mix = (c: number, bgc: number) => Math.round(bgc + (c - bgc) * factor)
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(mix(r, bg[0]))}${toHex(mix(g, bg[1]))}${toHex(mix(b, bg[2]))}`
}

export function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

/**
 * The signature badge, from `%G?` — and it is drawn only when there is
 * something WRONG with the signature (#146).
 *
 * It used to mark every signed commit, which on a repository that signs is a
 * mark on every row saying the same thing: no information, a mark's worth of
 * attention each, and the only strongly coloured thing in a row nobody scans
 * for signatures. Silence is the right answer for a normal commit.
 *
 * But silence for ALL of them would drop the only place the app has ever said
 * a signature is bad. So the line is drawn at what the STATUS says about the
 * COMMIT: nothing for good (`G`), good-but-unknown-validity (`U`) or unsigned
 * (`N`); a badge for bad (`B`), expired (`X`), expired key (`Y`) and revoked
 * (`R`).
 *
 * ⚠️ `E` — "cannot be checked" — is deliberately NOT marked, and that was
 * wrong here first. It does not mean something is amiss with the commit; it
 * means the local keyring has no public key for whoever signed it. Every merge
 * GitHub makes is signed with its own web-flow key, which almost nobody
 * imports, so marking `E` put a warning on every merge commit in the graph —
 * 33 of 300 on this repository — over a fact about the reader's keyring rather
 * than about the history. That is the same "a mark on every row saying the
 * same thing" this badge was narrowed to escape.
 *
 * `signature` stays on CommitNode either way: this is about what the LIST
 * draws, not about the app forgetting.
 */
/**
 * The `%G?` codes that say something about the COMMIT. Everything else — good,
 * unknown validity, unsigned, and `E` for "no public key here" — is silence.
 */

export type TFn = (key: any, ...args: any[]) => string

// Resolves an author's avatar (AI-bot logo, else GitHub/Gravatar via the main
// process), shared by the SVG graph node and the compact-layout HTML bullet.
export function useAvatarSrc(email: string, sha: string | undefined, aiLogo: string | null) {
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
export function NodeAvatar({ cx, cy, r, email, name, color, clipId, sha }: {
  cx: number; cy: number; r: number; email: string; name: string; color: string; clipId: string; sha?: string
}) {
  const aiLogo = aiAvatarDataUri(name, email)
  const { src, failed, setFailed } = useAvatarSrc(email, sha, aiLogo)

  if (failed || !email || !src) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill={color} />
        <text x={cx} y={cy} dy=".35em" textAnchor="middle" fontSize={8} fontWeight="700"
          fontFamily="-apple-system, BlinkMacSystemFont, sans-serif" fill="var(--text-on-emphasis)">
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
      <circle cx={cx} cy={cy} r={r} fill="var(--surface)" />
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
export function AuthorBullet({ email, name, sha, color }: { email: string; name: string; sha?: string; color: string }) {
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

/**
 * The short form the stacked row uses at its right edge: `-6 h`, `-1 j`,
 * `-2 sem.`, `-3 m.`. A relative date is a count with a unit; the words around
 * it ("il y a", "ago") are what a right-aligned column cannot afford and does
 * not need — the minus sign says "ago" in three pixels.
 */
export function fmtDateShort(s: string, t: TFn): string {
  try {
    const d = new Date(s)
    const sec = Math.floor((Date.now() - d.getTime()) / 1000)
    if (!Number.isFinite(sec)) return ''
    const min = Math.floor(sec / 60)
    if (min < 1) return t('graph.timeShort.now')
    if (min < 60) return t('graph.timeShort.min', min)
    const h = Math.floor(min / 60)
    if (h < 24) return t('graph.timeShort.hours', h)
    const j = Math.floor(h / 24)
    if (j < 7) return t('graph.timeShort.days', j)
    if (j < 30) return t('graph.timeShort.weeks', Math.floor(j / 7))
    const mo = Math.floor(j / 30)
    if (mo < 12) return t('graph.timeShort.months', mo)
    return t('graph.timeShort.years', Math.floor(mo / 12))
  } catch { return '' }
}

export function fmtDate(s: string, format: string, t: TFn) {
  try {
    const d = new Date(s)
    if (format === 'relative') return fmtRelative(d, t)
    return d.toLocaleDateString(t('graph.dateLocale'), { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return s }
}

// Relative date ("3 d ago", "2 mo ago").
export function fmtRelative(d: Date, t: TFn): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (sec < 60) return t('graph.time.now')
  const min = Math.floor(sec / 60)
  if (min < 60) return t('graph.time.min', min)
  const h = Math.floor(min / 60)
  if (h < 24) return t('graph.time.hours', h)
  const j = Math.floor(h / 24)
  if (j < 30) return t('graph.time.days', j)
  const mo = Math.floor(j / 30)
  if (mo < 12) return t('graph.time.months', mo)
  return t('graph.time.years', Math.floor(mo / 12))
}

export interface ProcessedRef {
  display: string      // branch/tag name without "origin/" prefix
  cls: string          // rc-head | rc-local | rc-remote | rc-tag
  branchName?: string  // full ref name for checkout/drag
  tooltip?: string
  isHead?: boolean     // current HEAD branch
  hasLocal?: boolean   // has a local counterpart
  hasRemote?: boolean  // has a remote counterpart (origin/...)
}

/**
 * The segments of the pill under a commit message.
 *
 * ⚠️ The issue hangs off the **branch**, not the commit: an issue is what a
 * branch is working on, and it follows the branch as it moves. A commit does
 * not have an issue — the branch pointing at it does.
 *
 * The pull request hangs off the branch the same way the issue does — by
 * MAPPING, not by searching: the open-PR list the sidebar already loaded
 * knows every head ref, so "which request carries this branch" is a lookup.
 * A search per row is what the panel-parity issue warned would be a
 * rate-limit incident, and this is how it stays not one. The cost of the
 * mapping's honesty: only a branch that IS a request's head gets the chip —
 * a commit buried under the head carries no branch ref, so no chip, which
 * matches where the reference draws it too.
 */
export function messageChipSegments(
  pref: ProcessedRef,
  issueForBranch?: (branch: string) => { key: string; provider: string } | null,
  handlers?: { onCheckout?: (b: string) => void; onMenu?: (e: React.MouseEvent) => void; onOpenPR?: (number: number) => void },
  trackingFor?: (branch: string) => { ahead?: number; behind?: number } | null,
  prForBranch?: (branch: string) => { number: number; title?: string } | null,
): ChipSegment[] {
  const segments: ChipSegment[] = []
  const isTag = pref.cls === 'rc-tag'

  segments.push({
    kind: isTag ? 'tag' : 'branch',
    label: pref.display,
    title: pref.tooltip ?? pref.display,
    onDoubleClick: pref.branchName && handlers?.onCheckout
      ? () => handlers.onCheckout!(pref.branchName!) : undefined,
    onContextMenu: handlers?.onMenu,
  })

  // Published, and where. The remote's name is what the collapsed icon stands
  // for — "this exists somewhere else too" is the fact, the name is the detail.
  if (pref.hasRemote) {
    // ⚠️ Read the remote ref, not the tooltip's first slash. The tooltip is
    // `feat/x  +  origin/feat/x` for a branch that exists on both sides, and a
    // pattern that takes the first `x/` finds the branch's own folder — which
    // is how this said "feat" instead of "origin" the first time.
    const full = pref.tooltip?.split('+').pop()?.trim() ?? ''
    const remote = /^(?:remotes\/)?([^/]+)\//.exec(full)?.[1] ?? 'origin'
    // ↓N ↑M next to the remote: behind, then ahead. They are the reason a
    // branch chip is looked at, so they are NOT collapsed — the remote's name
    // is the detail, the numbers are the point. Nothing is drawn for 0/0: a
    // branch level with its upstream has nothing to say.
    const tr = pref.branchName ? trackingFor?.(pref.branchName) : null
    const behind = tr?.behind ?? 0, ahead = tr?.ahead ?? 0
    const counts = [behind ? `↓${behind}` : '', ahead ? `↑${ahead}` : ''].filter(Boolean).join(' ')
    segments.push({
      kind: 'remote', label: remote, title: pref.tooltip, collapsible: true,
      detail: counts || undefined,
    })
  }

  // The request, before the issue: the chip that opens the PR detail (#110).
  const pr = pref.branchName ? prForBranch?.(pref.branchName) : null
  if (pr) {
    segments.push({
      kind: 'pr',
      label: `#${pr.number}`,
      title: pr.title ? `PR #${pr.number} — ${pr.title}` : `PR #${pr.number}`,
      collapsible: true,
      onClick: handlers?.onOpenPR ? () => handlers.onOpenPR!(pr.number) : undefined,
    })
  }

  const issue = pref.branchName ? issueForBranch?.(pref.branchName) : null
  if (issue) {
    segments.push({
      kind: 'issue',
      label: issue.provider === 'github' ? `#${issue.key}` : issue.key,
      title: issue.provider === 'github' ? `Issue #${issue.key}` : issue.key,
      collapsible: true,
    })
  }

  return segments
}

/**
 * The chips a commit's decorations turn into.
 *
 * `hidden` drops the refs the user has hidden from the graph. Excluding a ref
 * from the log only removes the commits nothing else reaches, so a tag sitting
 * on `main` keeps its commit *and* its chip — filtering here is what makes
 * "hide all tags" visible in the repositories where tags always sit on a
 * branch, which is most of them.
 */
export function processRefs(refs: string[], hidden?: (ref: string) => boolean): ProcessedRef[] {
  const filtered = refs
    .filter(r => !/^(origin\/HEAD|remotes\/[^/]+\/HEAD)$/.test(r))
    .filter(r => !hidden?.(r))

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
export const ICON_SIZE = 13

export const IconMonitor = () => (
  <Icon name="device" />
)

export const IconCloud = () => (
  <Icon name="cloud" />
)

export const IconTag = () => (
  <Icon name="tag" />
)

// Compact-column header icons — replace text labels ("AUTHOR", "DATE") when
// the compact layout setting is on, to save horizontal space.
export const IconPerson = () => (
  <Icon name="person" />
)

export const IconClock = () => (
  <Icon name="clock" />
)

// Small ratio bar of a commit's added/removed lines (green/red).
// Returns null when the commit carries no stats (merge commits, or the WIP row).
export function StatsBar({ additions = 0, deletions = 0, compact }: { additions?: number; deletions?: number; compact: boolean }) {
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

/**
 * The refs a "+N" chip was hiding, shown while the pointer is on it.
 *
 * Opens below the chip, and flips above it when there is not enough room —
 * without that, hovering a "+N" on one of the last rows pushed the panel past
 * the bottom of the window and the names were simply unreachable. Measured
 * after mount rather than estimated: chip heights depend on the ref names.
 */
export function RefExpansionPopup({ anchor, ghost, children }: {
  anchor: DOMRect
  /** Behind a ghost: the refs are the line's tip's, not this commit's — the
      panel and its chips wear the ghost's own tenue, dashed and faded. */
  ghost?: boolean
  children: React.ReactNode
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [above, setAbove] = React.useState(false)

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const h = el.getBoundingClientRect().height
    // 8px of breathing room, so it never sits flush against the edge.
    setAbove(anchor.bottom + 4 + h > window.innerHeight - 8 && anchor.top - 4 - h > 8)
  }, [anchor, children])

  return (
    <div
      ref={ref}
      className={`ref-expansion-popup${ghost ? ' ref-expansion-popup--ghost' : ''}`}
      style={{
        position: 'fixed',
        left: anchor.left,
        top: above ? undefined : anchor.bottom + 4,
        bottom: above ? window.innerHeight - anchor.top + 4 : undefined,
        zIndex: 9998,
        // As wide as the chip it belongs to — and wider only when a name does
        // not fit, which is the one case where growing is better than truncating.
        minWidth: anchor.width,
        width: 'max-content',
        maxWidth: 'min(300px, 90vw)',
      }}
    >
      {children}
    </div>
  )
}

export function RefChip({ pref, laneColor, compact, ghost, onDoubleClick, onDragStartBranch, onDragEndBranch, onContextMenu }: {
  pref: ProcessedRef
  laneColor?: string
  /** Inherited from the line's tip, not a ref on this commit (#173): dashed, faded. */
  ghost?: boolean
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
      className={`ref-chip ${pref.cls} ${compact ? 'ref-chip--compact' : ''}${ghost ? ' ref-chip--ghost' : ''}`}
      title={pref.tooltip}
      draggable={isDraggable}
      onDragStart={e => {
        if (!isDraggable) return
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', pref.branchName!)
        onDragStartBranch?.(pref.branchName!)
      }}
      onDragEnd={() => onDragEndBranch?.()}
      // A chip is about the BRANCH, so a click on it must not reach the commit
      // row underneath. Without this, double-clicking a chip fired the row's
      // onClick first and the detail panel flashed open on the way to the
      // checkout — the browser sends click, click, dblclick, and only the last
      // one was being stopped.
      onClick={e => e.stopPropagation()}
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
