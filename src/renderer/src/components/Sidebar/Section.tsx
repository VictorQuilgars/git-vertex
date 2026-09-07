// A collapsible, resizable section of the sidebar, and the height it remembers.
import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Icon, type IconName } from '../Icon/Icon'
import ContextMenu, { MenuItemDef } from '../ContextMenu/ContextMenu'
import { useLang } from '../../i18n/LanguageContext'
import { Brand, type BrandName } from '../BrandMark/BrandMark'

// ── Section heights (#176) ────────────────────────────────────────
// A section's height is a property of the sidebar's layout, not of the
// repository, so it is one key per section for every repository — unlike the
// folded folders, which are a repository's own. Null means automatic: the
// section takes its content's height and yields its spare room.
export const SB_HEIGHT_KEY = 'gv-sb-height:'

/** A header plus two rows — the least a resized section can be. */
export const SB_MIN_SECTION = 30 + 48

export function useSectionHeight(id: string): [number | null, (h: number | null) => void] {
  const [height, setHeightState] = useState<number | null>(() => {
    try {
      const v = parseInt(localStorage.getItem(SB_HEIGHT_KEY + id) || '', 10)
      return v > 0 ? v : null
    } catch { return null }
  })
  const setHeight = useCallback((h: number | null) => {
    setHeightState(h)
    try {
      if (h === null) localStorage.removeItem(SB_HEIGHT_KEY + id)
      else localStorage.setItem(SB_HEIGHT_KEY + id, String(Math.round(h)))
    } catch { /* private mode */ }
  }, [id])
  return [height, setHeight]
}

/**
 * Drags a section's bottom edge. The height is written live and persisted on
 * release. The ceiling is what the column can give: its own height less the
 * least every other child needs — a section's header, plus two rows when it
 * is open; anything else its full height — so no sibling is ever pushed out
 * of the column. A column that has no measured height (jsdom) sets no ceiling.
 */
export function startSectionResize(e: React.MouseEvent, el: HTMLDivElement | null, setHeight: (h: number | null) => void): void {
  if (!el || e.button !== 0) return
  e.preventDefault()
  const column = el.parentElement
  const startY = e.clientY
  const startH = el.getBoundingClientRect().height
  let ceiling = Infinity
  if (column && column.clientHeight > 0) {
    let othersNeed = 0
    for (const sib of Array.from(column.children) as HTMLElement[]) {
      if (sib === el) continue
      if (!sib.classList.contains('sb-section')) { othersNeed += sib.offsetHeight; continue }
      // A sibling the user already pinned keeps its height — it does not
      // shrink, so it counts for all of it, not for its floor.
      const pinned = /^0 0 (\d+)px$/.exec(sib.style.flex)
      if (pinned) { othersNeed += Number(pinned[1]); continue }
      const header = sib.querySelector<HTMLElement>('.sb-section-header')
      othersNeed += (header?.offsetHeight ?? 30) + (sib.classList.contains('sb-section--open') ? SB_MIN_SECTION - 30 : 0)
    }
    ceiling = Math.max(SB_MIN_SECTION, column.clientHeight - othersNeed)
  }
  const clamp = (h: number) => Math.min(ceiling, Math.max(SB_MIN_SECTION, h))
  let last = startH
  const onMove = (ev: MouseEvent) => { last = clamp(startH + ev.clientY - startY); el.style.flex = `0 0 ${last}px` }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    el.style.flex = ''
    setHeight(last)
  }
  document.body.style.cursor = 'row-resize'
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// ── Reveal a section from elsewhere ──────────────────────────────
// A row in another pane — "Apply a stash", "Switch branch" — leads to the list
// where the action is. Which section is open is the section's own state, kept
// where it is used rather than lifted into the sidebar and drilled through
// six components for a signal that fires on a click and is then over. So the
// caller names the section and the section listens for its own name.

type RevealFn = () => void
const revealListeners = new Map<string, Set<RevealFn>>()

/** Open the sidebar section with this id and bring it into view. */
export function revealSection(id: string): void {
  for (const fn of revealListeners.get(id) ?? []) fn()
}

function useRevealed(id: string, onReveal: RevealFn): void {
  const latest = useRef(onReveal)
  latest.current = onReveal
  useEffect(() => {
    const fn: RevealFn = () => latest.current()
    const set = revealListeners.get(id) ?? new Set<RevealFn>()
    set.add(fn)
    revealListeners.set(id, set)
    return () => {
      set.delete(fn)
      if (set.size === 0) revealListeners.delete(id)
    }
  }, [id])
}

// ── Collapse section ─────────────────────────────────────────────
export function Section({ id, title, icon, brand, count, children, defaultOpen = true, onAdd, addLabel, menuItems, hiddenCount, onShowAll, onRefresh, refreshing, onFold }: {
  /** Stable across repositories — the key the section's height is kept under. */
  id: string
  title: string
  /**
   * What the section IS, beside what it is called. Eleven headers in a column
   * of small capitals are told apart by reading them; a mark is found without
   * reading, which is what a panel you glance at needs.
   */
  icon?: IconName
  /**
   * A THIRD PARTY's mark, for a section that is about their product rather
   * than about git. Separate from `icon` on purpose, and not merged into it:
   * components/Icon holds drawings we own and may reweight, BrandMark holds
   * marks we only display and may never redraw. One prop for both would put a
   * trademark behind a type that promises we can restyle it.
   */
  brand?: BrandName
  count?: number
  children: React.ReactNode
  defaultOpen?: boolean
  /**
   * Re-read what this section lists. Omitted ⇒ no button, which is every
   * section whose contents come from the repository on disk and are already
   * reloaded by the watcher. The GitHub ones are the exception: they come from
   * a server that changes without us.
   */
  onRefresh?: () => void
  /** In flight — the button is out of action, so it cannot be hammered. */
  refreshing?: boolean
  /**
   * Folded shut. The GitHub sections use it to drop whatever was typed in
   * their search box: the box folds away with the rows, and a filter still
   * applied but no longer visible is how a section comes back looking empty
   * while its count says otherwise (#144).
   */
  onFold?: () => void
  // The event is handed over so a section can anchor a menu to the + button
  // (the stash one offers a scope) instead of acting straight away.
  onAdd?: (e: React.MouseEvent) => void
  addLabel?: string
  // Actions that act on everything the section lists — hide all, show all.
  // Right-click on the header, like every other menu here.
  menuItems?: MenuItemDef[]
  // How many of the rows are hidden from the graph. Above zero the header
  // carries a chip that says so and restores them: the group actions live in a
  // menu nobody thinks to open, and a section quietly filtering the graph with
  // nothing on screen to say so is how you end up mistrusting the graph.
  hiddenCount?: number
  onShowAll?: () => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const { t } = useLang()
  const [height, setHeight] = useSectionHeight(id)
  const root = useRef<HTMLDivElement>(null)
  // Sent here by a row in another pane. Opening a section that is already open
  // is not a no-op: the point is to put it where the eye is, which is why the
  // scroll happens either way.
  useRevealed(id, () => {
    setOpen(true)
    root.current?.scrollIntoView({ block: 'nearest' })
  })
  return (
    <div ref={root} className={`sb-section${open ? ' sb-section--open' : ''}`}
      style={open && height ? { flex: `0 0 ${height}px` } : undefined}>
      <div className="sb-section-header"
        onClick={() => setOpen(o => { if (o) onFold?.(); return !o })}
        onContextMenu={menuItems?.length
          ? e => { e.preventDefault(); e.stopPropagation(); setCtx({ x: e.clientX, y: e.clientY }) }
          : undefined}
      >
        <Icon name="play" size={10} />
        {icon && <Icon name={icon} size={13} className="sb-section-icon" />}
        {brand && <Brand name={brand} size={13} className="sb-section-icon" />}
        <span className="sb-section-title">{title}</span>
        {/* Outside the slot: what a section is hiding from the graph is not a
            control that comes and goes, it is a fact the header states. */}
        {!!hiddenCount && onShowAll && (
          <button className="sb-section-hidden" title={t('sb.hidden.chipTitle', hiddenCount)}
            onClick={e => { e.stopPropagation(); onShowAll() }}>
            <Icon name="eyeOff" size={11} />
            {hiddenCount}
          </button>
        )}
        {/* The count and the controls share ONE slot, stacked. Nothing changes
            width when the pointer arrives, so nothing slides: they cross-fade
            in place. */}
        <span className="sb-section-slot">
          {onRefresh && (
            <button className={`sb-add-btn sb-on-hover${refreshing ? ' sb-on-hover--pinned' : ''}`}
              title={t('sb.gh.refresh')} disabled={refreshing}
              onClick={e => { e.stopPropagation(); onRefresh() }}>
              <Icon name="refresh" size={12} />
            </button>
          )}
          {onAdd && (
            <button className="sb-add-btn sb-add-btn--create sb-on-hover" title={addLabel ?? t('sb.add')}
              onClick={e => { e.stopPropagation(); onAdd(e) }}>
              <Icon name="plus" size={12} />
            </button>
          )}
          {count !== undefined && <span className="sb-section-count">{count}</span>}
        </span>
      </div>
      {open && <div className="sb-section-body">{children}</div>}
      {/* The section's bottom edge, draggable (#176). Double-click: automatic. */}
      {open && (
        <div className="sb-section-resizer" title={t('sb.section.resize')}
          onMouseDown={e => startSectionResize(e, root.current, setHeight)}
          onDoubleClick={() => setHeight(null)} />
      )}
      {ctx && !!menuItems?.length && (
        <ContextMenu x={ctx.x} y={ctx.y} items={menuItems} onClose={() => setCtx(null)} />
      )}
    </div>
  )
}
