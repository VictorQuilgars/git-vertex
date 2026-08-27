import { useState } from 'react'
import { Icon } from '../Icon/Icon'
import ContextMenu from '../ContextMenu/ContextMenu'
import GithubHoverCard, { useHoverCard } from './GithubHoverCard'
import { useLang } from '../../i18n/LanguageContext'
import './GithubRow.css'

/**
 * ONE row for a pull request or an issue, wherever the list is shown — today
 * that is the sidebar sections, on both products. Two lines: state icon,
 * number and title, then author · age · comments. The labels live in the
 * hover card and the detail, not on the row — width is the scarce resource
 * here, and the kebab of actions has the right edge.
 *
 * It once carried a second, three-line rendering for the GitHub tab; the tab
 * is gone on both products (#95 §1) and the `compact` switch went with it —
 * a prop with one caller's value is not a prop.
 *
 * Fields beyond number/title/url are optional: a host that still sends the
 * old narrow shape gets the old narrow row, not a row of empty separators.
 */
export interface GithubLabel { name: string; color: string }

export interface GithubRowItem {
  kind: 'pr' | 'issue'
  number: number
  title: string
  url: string
  author?: string
  draft?: boolean
  createdAt?: string
  comments?: number
  labels?: GithubLabel[]
  headRef?: string
  baseRef?: string
  /** The description, as GitHub markdown — the hover card renders it. */
  body?: string
  assignees?: string[]
  /** Set in cross-repo mode: which repository this item belongs to. */
  repoLabel?: string
  /**
   * Absent on the sidebar lists, which are open items by construction. The
   * `#123` card resolves closed and merged things too (#95 §3), and the card
   * says which rather than calling everything open.
   */
  state?: 'open' | 'closed'
  merged?: boolean
}

export function timeAgo(dateStr: string, t: (key: any, ...args: any[]) => string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return t('github.justNow')
  if (diff < 3600) return t('time.min', Math.floor(diff / 60))
  if (diff < 86400) return t('time.hour', Math.floor(diff / 3600))
  if (diff < 2592000) return t('time.day', Math.floor(diff / 86400))
  if (diff < 31536000) return t('time.month', Math.floor(diff / 2592000))
  return t('time.year', Math.floor(diff / 31536000))
}

/* The colours are GitHub's own, carried with each label — data, not theme. */
export function LabelChip({ label }: { label: GithubLabel }) {
  const bg = `#${label.color}22`
  const border = `#${label.color}66`
  const color = `#${label.color}`
  return (
    <span className="ghp-label" style={{ background: bg, borderColor: border, color }}>
      {label.name}
    </span>
  )
}

export default function GithubRow({ item, onOpen, onDetail, onCreateBranch, hoverCard = true }: {
  item: GithubRowItem
  onOpen?: (url: string) => void
  /** Open the in-app detail (§3 bis). Present ⇒ a click goes here, not to a
      browser; the browser stays one click away inside the detail. */
  onDetail?: () => void
  /** False while a detail is open: the card is a peek at what a click will
      show, and the answer is already on screen. */
  hoverCard?: boolean
  /**
   * Start work on this issue: create the branch it suggests and link the two.
   * Omitted ⇒ the row's menu disappears, so a host that cannot create a branch
   * does not offer to. Never offered on a pull request.
   */
  onCreateBranch?: () => void
}) {
  const { t } = useLang()
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const menued = item.kind === 'issue' && !!onCreateBranch
  // The row's actions, one list for its two openings: the kebab that appears
  // on hover, and the right-click. Every entry has a real handler behind it.
  const menuItems = [
    ...(onDetail ? [{ label: t(item.kind === 'pr' ? 'gh.pr.view' : 'gh.issue.view'), action: onDetail }] : []),
    ...(menued ? [{ label: t('gh.issue.createBranch'), action: onCreateBranch! }] : []),
    { label: t('gh.panel.copyLink'), action: () => navigator.clipboard.writeText(item.url) },
    ...(onOpen ? [{ label: t('gh.panel.openIn'), action: () => onOpen(item.url) }] : []),
  ]
  const onContextMenu = (e: React.MouseEvent) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }
  const hasMeta = !!(item.author || item.createdAt || (item.comments ?? 0) > 0)
  // The hover card exists only where there is something beyond the row —
  // a narrow-shape item gets no card rather than an empty frame.
  const carded = hoverCard && !!(item.body !== undefined || item.labels || item.author)
  const hover = useHoverCard()
  const activate = onDetail ?? (onOpen ? () => onOpen(item.url) : undefined)

  return (
      <>
      <div className="sb-item sb-gh-row" title={carded ? undefined : item.title}
        onClick={() => activate?.()} onContextMenu={onContextMenu}
        onMouseEnter={carded ? hover.enter : undefined}
        onMouseLeave={carded ? hover.leaveRow : undefined}>
        <span className={`sb-gh-state${item.draft ? ' sb-gh-state--draft' : ''}`}>
          <Icon name={item.kind === 'pr' ? 'pullRequest' : 'issue'} size={13} />
        </span>
        <span className="sb-gh-body">
          <span className="sb-gh-line1">
            <span className="sb-gh-num">#{item.number}</span>
            <span className="sb-gh-title">{item.title}</span>
            {item.draft && <span className="sb-gh-draft">{t('sb.github.draft')}</span>}
            {menuItems.length > 0 && (
              <button className="sb-gh-kebab" title={t('gh.row.actions')}
                onClick={e => {
                  e.stopPropagation()
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setCtx({ x: r.left, y: r.bottom + 4 })
                }}>
                <Icon name="kebab" size={13} />
              </button>
            )}
          </span>
          {hasMeta && (
            <span className="sb-gh-meta">
              {item.author && <span className="sb-gh-author">@{item.author}</span>}
              {item.createdAt && <span className="sb-gh-time">{timeAgo(item.createdAt, t)}</span>}
              {(item.comments ?? 0) > 0 && (
                <span className="sb-gh-comments"><Icon name="comment" size={10} />{item.comments}</span>
              )}
            </span>
          )}
        </span>
      </div>
      {ctx && menuItems.length > 0 && (
        <ContextMenu x={ctx.x} y={ctx.y} onClose={() => setCtx(null)} items={menuItems} />
      )}
      {carded && hover.pos && (
        <GithubHoverCard item={item} pos={hover.pos} inside={hover.inside}
          onClose={hover.close} onOpen={onOpen} onActivate={activate} />
      )}
      </>
  )
}
