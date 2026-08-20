import { useState } from 'react'
import { Icon } from '../Icon/Icon'
import ContextMenu from '../ContextMenu/ContextMenu'
import GithubHoverCard, { useHoverCard } from './GithubHoverCard'
import { useLang } from '../../i18n/LanguageContext'

/**
 * ONE row for a pull request or an issue, wherever the list is shown.
 *
 * The GitHub tab and the sidebar sections display the same lists, and for a
 * while they did it with two renderings: the tab's card carried the author,
 * the age, the comment count and the labels, while the sidebar drew a bare
 * grey `#number title` — the data was fetched and then thrown away at the
 * mapper. Two renderings of one list drift; this is the one component both
 * mount, with `compact` deciding how much room it takes:
 *
 * - full (the tab): the three-line card — title line, meta line, label chips.
 * - compact (the sidebar): two lines — state icon, number and title, then
 *   author · age · comments — with the labels reduced to coloured dots, the
 *   names a tooltip away. Width is the scarce resource there.
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

/** The compact cut of the same information: a dot per label, names in the tooltip. */
function LabelDots({ labels }: { labels: GithubLabel[] }) {
  return (
    <span className="sb-gh-dots" title={labels.map(l => l.name).join(', ')}>
      {labels.slice(0, 5).map(l => (
        <span key={l.name} className="sb-gh-dot" style={{ background: `#${l.color}` }} />
      ))}
    </span>
  )
}

/**
 * Copy the forge's own URL for a row. GitHub hands us `html_url` with every
 * item, so this copies what the forge said rather than rebuilding it — the
 * builder is for the cases where nobody handed us one.
 */
export function CopyLinkButton({ url }: { url: string }) {
  const { t } = useLang()
  const [done, setDone] = useState(false)
  return (
    <button
      className="ghp-copy-link"
      title={t('gh.panel.copyLink')}
      onClick={e => {
        e.stopPropagation()
        navigator.clipboard.writeText(url)
        setDone(true)
        setTimeout(() => setDone(false), 1500)
      }}
    >{done ? '✓' : <Icon name="link" size={12} />}</button>
  )
}

export default function GithubRow({ item, compact = false, onOpen, onDetail, onCreateBranch, hoverCard = true }: {
  item: GithubRowItem
  compact?: boolean
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
  const menuItems = compact ? [
    ...(onDetail ? [{ label: t('gh.issue.view'), action: onDetail }] : []),
    ...(menued ? [{ label: t('gh.issue.createBranch'), action: onCreateBranch! }] : []),
    { label: t('gh.panel.copyLink'), action: () => navigator.clipboard.writeText(item.url) },
    ...(onOpen ? [{ label: t('gh.panel.openIn'), action: () => onOpen(item.url) }] : []),
  ] : (menued ? [{ label: t('gh.issue.createBranch'), action: onCreateBranch! }] : [])
  const onContextMenu = menuItems.length
    ? (e: React.MouseEvent) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }
    : undefined
  const hasMeta = !!(item.author || item.createdAt || (item.comments ?? 0) > 0)
  // The hover card exists only where there is something beyond the row —
  // a narrow-shape item gets no card rather than an empty frame.
  const carded = compact && hoverCard && !!(item.body !== undefined || item.labels || item.author)
  const hover = useHoverCard()
  const activate = onDetail ?? (onOpen ? () => onOpen(item.url) : undefined)

  if (compact) {
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
            {(item.labels?.length ?? 0) > 0 && <LabelDots labels={item.labels!} />}
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

  return (
    <>
    <div className="ghp-item" onClick={() => onOpen?.(item.url)}
      onContextMenu={onContextMenu} title={t('gh.panel.openIn')}>
      <div className="ghp-item-top">
        {item.repoLabel && <span className="ghp-repo-badge">{item.repoLabel}</span>}
        <span className="ghp-number">#{item.number}</span>
        {item.draft && <span className="ghp-badge ghp-draft">{t('gh.panel.draft')}</span>}
        <span className="ghp-title">{item.title}</span>
        <CopyLinkButton url={item.url} />
      </div>
      {(hasMeta || (item.kind === 'pr' && item.headRef)) && (
        <div className="ghp-item-meta">
          {item.kind === 'pr' && item.headRef && (
            <>
              <span className="ghp-refs">
                <code>{item.headRef}</code>
                <Icon name="arrowSwitch" size={10} />
                <code>{item.baseRef}</code>
              </span>
              <span className="ghp-dot">·</span>
            </>
          )}
          {item.author && <span className="ghp-author">@{item.author}</span>}
          {item.createdAt && (
            <>
              <span className="ghp-dot">·</span>
              <span className="ghp-time">{timeAgo(item.createdAt, t)}</span>
            </>
          )}
          {(item.comments ?? 0) > 0 && (
            <>
              <span className="ghp-dot">·</span>
              <span className="ghp-comments">
                <Icon name="comment" size={11} />
                {item.comments}
              </span>
            </>
          )}
        </div>
      )}
      {(item.labels?.length ?? 0) > 0 && (
        <div className="ghp-labels">
          {item.labels!.slice(0, 4).map(l => <LabelChip key={l.name} label={l} />)}
        </div>
      )}
    </div>
    {ctx && menuItems.length > 0 && (
      <ContextMenu x={ctx.x} y={ctx.y} onClose={() => setCtx(null)} items={menuItems} />
    )}
    </>
  )
}
