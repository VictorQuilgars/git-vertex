// MessageChip.tsx — the pill that sits under a commit message.
//
// Not the branch chip moved down. A branch chip says one thing: this branch is
// here. What belongs under a message is everything that is *about* this commit,
// and those are different kinds — the branch, the remote it lives on, the
// branch it is going to merge into, the pull request that carries it, the issue
// its branch is working on. One pill, several segments, each with its own icon.
//
// ⚠️ The collapsing is the point, not decoration. Four names side by side is
// wider than the message they sit under, so only the **first** segment shows
// its name, and it is cut when the line is short; the rest are an icon.
//
// A hover reads all of it: a filled copy of the pill, every name whole, laid
// OVER the row from the pill's own corner (`.mchip-expand`). The pill in the
// line does not move — a hover that grew it would push the sha and the author
// along under the pointer, which is the one thing a hover must never do. The
// copy's text is generated content (`data-label`), so each name is in the
// document once: a find, a screen reader and a test each meet it one time.
//
// The issue segment hangs off the **branch**, not the commit: an issue is what
// a branch is working on, and it stays attached as the branch moves.

import { Icon } from '../Icon/Icon'
import './MessageChip.css'

export type ChipKind = 'branch' | 'remote' | 'upstream' | 'tag' | 'pr' | 'issue'

export interface ChipSegment {
  kind: ChipKind
  /** What the segment says when it is open — `feat/x`, `origin`, `#111`. */
  label: string
  title?: string
  /**
   * Collapsed to its icon at rest. The first segment is never collapsed: a
   * pill that says nothing at rest is a pill nobody reads.
   */
  collapsible?: boolean
  /**
   * Always shown, even when the label is collapsed — `↓1 ↑1` beside a remote
   * icon. The label is the detail; this is the point.
   */
  detail?: string
  onClick?: () => void
  onDoubleClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

/**
 * One glyph per kind, from the shared icon set rather than inlined here — the
 * token-discipline test refuses a component that draws its own, and it is right
 * to: an icon that lives in one file cannot follow a change of mark.
 */
const KIND_ICON: Record<ChipKind, string> = {
  branch: 'branch',
  remote: 'cloud',
  upstream: 'arrowRight',
  tag: 'tag',
  pr: 'pullRequest',
  issue: 'issue',
}

/**
 * `refsHidden` is the count of the refs this pill stands in front of — the
 * `+N`. The host shows them on a rest, in a list under the pill.
 */
export default function MessageChip({ segments, refsHidden = 0, tone, emphasis = false, ghost = false, expanded = false }: {
  segments: ChipSegment[]
  refsHidden?: number
  /** Inherited from the line's tip, not a ref on this commit (#173): faded, dashed. */
  ghost?: boolean
  /** The lane colour, so the pill belongs to the line it hangs from. */
  tone?: string
  /**
   * Filled rather than tinted — the chip for the branch that is checked out.
   * One per graph at most: an emphasis everywhere is an emphasis nowhere.
   */
  emphasis?: boolean
  /**
   * Every name said, nothing collapsed, nothing laid over it — the pill as it
   * stands in the list of refs a `+N` hides, which has the room.
   */
  expanded?: boolean
}) {
  if (segments.length === 0) return null
  // `copy`: the segment inside the hover copy. Same handlers — the copy covers
  // the pill while it is shown, so a segment only the pill had could never be
  // clicked — and its words as generated content.
  const segment = (seg: ChipSegment, i: number, copy: boolean) => (
    <span
      key={`${seg.kind}-${seg.label}-${i}`}
      className={`mchip-seg mchip-${seg.kind}${!copy && !expanded && seg.collapsible && i > 0 ? ' mchip-collapsible' : ''}`}
      title={seg.title ?? seg.label}
      onClick={seg.onClick ? e => { e.stopPropagation(); seg.onClick!() } : undefined}
      onDoubleClick={seg.onDoubleClick ? e => { e.stopPropagation(); seg.onDoubleClick!() } : undefined}
      // Answered here means answered here: left to bubble, the row
      // underneath opens the commit's menu on the same right-click — and in
      // VS Code that one is native, so a branch name got two menus (#233).
      onContextMenu={seg.onContextMenu ? e => { e.preventDefault(); e.stopPropagation(); seg.onContextMenu!(e) } : undefined}
    >
      <Icon name={KIND_ICON[seg.kind] as never} size={12} className="mchip-ico" />
      {copy
        ? <span className="mchip-label" data-label={seg.label} />
        : <span className="mchip-label">{seg.label}</span>}
      {seg.detail && (copy
        ? <span className="mchip-detail" data-label={seg.detail} />
        : <span className="mchip-detail">{seg.detail}</span>)}
    </span>
  )
  return (
    <span
      className={`mchip${emphasis ? ' mchip--emphasis' : ''}${ghost ? ' mchip--ghost' : ''}${expanded ? ' mchip--expanded' : ''}`}
      style={tone ? { ['--mchip-tone' as string]: tone } : undefined}
    >
      {segments.map((seg, i) => segment(seg, i, false))}
      {refsHidden > 0 && <span className="mchip-more">+{refsHidden}</span>}
      {!expanded && (
        <span className="mchip-expand" aria-hidden="true">
          {segments.map((seg, i) => segment(seg, i, true))}
          {refsHidden > 0 && <span className="mchip-more" data-label={`+${refsHidden}`} />}
        </span>
      )}
    </span>
  )
}
