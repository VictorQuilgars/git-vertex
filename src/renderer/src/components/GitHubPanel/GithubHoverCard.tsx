import { useRef, useState, useCallback } from 'react'
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
 *   webview can be 400px tall, so the card takes what exists and scrolls
 *   inside itself rather than growing past the window;
 * - a portal to <body>: the sidebar scrolls, a fixed card must not.
 *
 * The card stays while the pointer is inside it — a description longer than
 * the card scrolls, and scrolling means entering it. Leaving both closes.
 * Rows with nothing beyond number/title (an old host's shape) get no card at
 * all rather than an empty frame.
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

export default function GithubHoverCard({ item, pos, inside, onClose, onOpen }: {
  item: GithubRowItem
  pos: { left: number; top: number; maxHeight: number }
  inside: React.MutableRefObject<boolean>
  onClose: () => void
  onOpen?: (url: string) => void
}) {
  const { t } = useLang()
  return createPortal(
    <div className="ghc" style={{ left: pos.left, top: pos.top, maxHeight: pos.maxHeight }}
      onMouseEnter={() => { inside.current = true }}
      onMouseLeave={() => { inside.current = false; onClose() }}
      onClick={e => e.stopPropagation()}>
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
          <div className={`ghc-status${item.draft ? ' ghc-status--draft' : ''}`}>
            {item.draft ? t('gh.panel.draft') : t('issue.open')}
          </div>
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
    </div>,
    document.body
  )
}
