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
// its name; the rest are an icon until the pill is hovered, and then they open.
// It is done in CSS — a hover that measures and re-lays-out would move the row
// under the pointer, which is the one thing a hover must never do.
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
   * Collapsed to its icon until the pill is hovered. The first segment is never
   * collapsed: a pill that says nothing at rest is a pill nobody reads.
   */
  collapsible?: boolean
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
 * `refsHidden` is the count the `+N` badge used to carry in the column layout.
 * It stays a count rather than more segments: the pill is already the widest
 * thing on the line when it opens.
 */
export default function MessageChip({ segments, refsHidden = 0, tone }: {
  segments: ChipSegment[]
  refsHidden?: number
  /** The lane colour, so the pill belongs to the line it hangs from. */
  tone?: string
}) {
  if (segments.length === 0) return null
  return (
    <span className="mchip" style={tone ? { ['--mchip-tone' as string]: tone } : undefined}>
      {segments.map((seg, i) => (
        <span
          key={`${seg.kind}-${seg.label}-${i}`}
          className={`mchip-seg mchip-${seg.kind}${seg.collapsible && i > 0 ? ' mchip-collapsible' : ''}`}
          title={seg.title ?? seg.label}
          onClick={seg.onClick ? e => { e.stopPropagation(); seg.onClick!() } : undefined}
          onDoubleClick={seg.onDoubleClick ? e => { e.stopPropagation(); seg.onDoubleClick!() } : undefined}
          onContextMenu={seg.onContextMenu}
        >
          <Icon name={KIND_ICON[seg.kind] as never} size={10} className="mchip-ico" />
          <span className="mchip-label">{seg.label}</span>
        </span>
      ))}
      {refsHidden > 0 && <span className="mchip-more">+{refsHidden}</span>}
    </span>
  )
}
