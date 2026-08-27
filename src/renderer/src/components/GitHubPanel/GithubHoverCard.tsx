import { useRef, useState, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import MdLite from './mdLite'
import { LabelChip, type GithubRowItem } from './GithubRow'
import { useLang } from '../../i18n/LanguageContext'
import './GithubHoverCard.css'

/**
 * The hover card of a sidebar row — the reference pane's gesture: rest on an
 * issue and the card opens OVER THE GRAPH, to the right of the sidebar, with
 * what the row has no room for. Description as rendered markdown on the left;
 * status, labels, assignees and reporter in a side column.
 *
 * Positioning is the part with rules:
 * - to the right of the row's own edge, so it reads as coming from it;
 * - clamped to the viewport on every side — in the VS Code panel the whole
 *   webview can be 400px tall, so the card takes what exists;
 * - a portal to <body>: the sidebar scrolls, a fixed card must not.
 *
 * The card is a PREVIEW, not a reader: it never scrolls. A description
 * longer than the card is cut under a fade, and clicking the card opens the
 * issue itself — seeing more is a click, not a scroll. It stays while the
 * pointer is inside it, so the click can happen. Rows with nothing beyond
 * number/title (an old host's shape) get no card at all rather than an
 * empty frame.
 */
export function useHoverCard(delayMs = 400) {
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inside = useRef(false)

  const enter = useCallback((e: React.MouseEvent) => {
    const row = (e.currentTarget as HTMLElement).getBoundingClientRect()
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const left = Math.min(row.right + 10, Math.max(0, window.innerWidth - 540))
      // Near the bottom of the window the card opens higher than its row so
      // it keeps at least ~380px; whatever the top ends up being, the card's
      // ceiling is measured from it — it ends above the window's edge and
      // scrolls inside, never under it.
      const top = Math.max(8, Math.min(row.top, window.innerHeight - 380))
      setPos({ left, top, maxHeight: window.innerHeight - top - 12 })
    }, delayMs)
  }, [delayMs])

  const close = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    setPos(null)
  }, [])

  // Leaving the row keeps the card if the pointer went INTO the card.
  const leaveRow = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    setTimeout(() => { if (!inside.current) setPos(null) }, 80)
  }, [])

  return { pos, enter, leaveRow, close, inside }
}

export default function GithubHoverCard({ item, pos, inside, onClose, onOpen, onActivate }: {
  item: GithubRowItem
  pos: { left: number; top: number; maxHeight: number }
  inside: React.MutableRefObject<boolean>
  onClose: () => void
  /** Markdown links inside the body — always external. */
  onOpen?: (url: string) => void
  /** Clicking the card itself: the row's own activation (detail or browser). */
  onActivate?: () => void
}) {
  const { t } = useLang()
  const ref = useRef<HTMLDivElement | null>(null)
  const [cut, setCut] = useState(false)
  // Overflow is a fact about the rendered card, so it is measured, not
  // guessed: the fade and the hint appear only when something is hidden.
  useLayoutEffect(() => {
    const el = ref.current
    if (el) setCut(el.scrollHeight > el.clientHeight + 1)
  }, [item])
  return createPortal(
    <div className="ghc" ref={ref}
      style={{ left: pos.left, top: pos.top, maxHeight: pos.maxHeight }}
      onMouseEnter={() => { inside.current = true }}
      onMouseLeave={() => { inside.current = false; onClose() }}
      onClick={e => { e.stopPropagation(); onClose(); onActivate?.() }}>
      <div className="ghc-head">
        <span className="ghc-num">#{item.number}</span>
        <span className="ghc-title">{item.title}</span>
      </div>
      <div className="ghc-cols">
        <div className="ghc-main">
          <div className="ghc-label">{t('gh.card.description')}</div>
          {item.body?.trim()
            ? <MdLite source={item.body} openLink={onOpen} />
            : <div className="ghc-none">{t('gh.card.noDescription')}</div>}
        </div>
        <div className="ghc-side">
          <div className="ghc-label">{t('gh.card.status')}</div>
          {/* Same reading as the old `#123` tooltip: merged wins, a closed
              pull request failed where a closed issue completed. */}
          {(() => {
            const s = item.merged
              ? { label: t('issue.merged'), mod: 'merged' }
              : item.state === 'closed'
                ? { label: t('issue.closed'), mod: item.kind === 'pr' ? 'closed-pr' : 'closed-issue' }
                : item.draft
                  ? { label: t('gh.panel.draft'), mod: 'draft' }
                  : { label: t('issue.open'), mod: 'open' }
            return <div className={`ghc-status ghc-status--${s.mod}`}>{s.label}</div>
          })()}
          {(item.labels?.length ?? 0) > 0 && (
            <>
              <div className="ghc-label">{t('gh.card.labels')}</div>
              <div className="ghc-labels">
                {item.labels!.map(l => <LabelChip key={l.name} label={l} />)}
              </div>
            </>
          )}
          <div className="ghc-label">{t('gh.card.assignees')}</div>
          <div className="ghc-people">
            {item.assignees?.length
              ? item.assignees.map(a => <span key={a}>@{a}</span>)
              : <span className="ghc-none">{t('gh.card.none')}</span>}
          </div>
          {item.author && (
            <>
              <div className="ghc-label">{t('gh.card.reporter')}</div>
              <div className="ghc-people"><span>@{item.author}</span></div>
            </>
          )}
        </div>
      </div>
      {cut && (
        <div className="ghc-fade">
          <span className="ghc-more">{t('gh.card.clickToOpen')}</span>
        </div>
      )}
    </div>,
    document.body
  )
}
