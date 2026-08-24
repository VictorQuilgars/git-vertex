import { useEffect, useState, useCallback, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from '../Icon/Icon'
import './PanelDrawer.css'

/**
 * A drawer that comes out of the left panel (#145, and #130 next).
 *
 * It is NOT a modal over the graph and not a centred sheet: it opens along the
 * panel's right edge, takes the panel's full height, and pushes into the
 * graph's space while the panel itself stays where it is. At full height it
 * reads as the panel having grown; with a margin at either end it reads as a
 * card laid on top, whatever its width.
 *
 * ⚠️ It renders through a PORTAL, because `.sidebar` is `overflow: hidden` — a
 * drawer positioned inside it would simply be clipped at the panel's edge. So
 * it measures the panel instead and places itself against it, which also means
 * a host does not have to wire anything: the component that owns the state
 * renders the drawer, wherever in the tree it happens to live.
 *
 * Built once on purpose. Two drawers written separately would disagree about
 * width, height, how they open and what closes them — the panel already
 * learned that with its indent scale, where two families were positioned by
 * two systems (#138).
 */
export default function PanelDrawer({ anchor, title, icon, closeLabel, onClose, children }: {
  /** The panel this comes out of — its right edge, top and height are taken. */
  anchor: RefObject<HTMLElement | null>
  title: string
  /** What the drawer is about, beside its name. */
  icon?: IconName
  closeLabel: string
  /**
   * Escape, the close button, or a click outside. The caller decides what that
   * means: a form with something half-written in it may keep its draft rather
   * than lose it.
   */
  onClose: () => void
  children: ReactNode
}) {
  const [box, setBox] = useState<{ left: number; top: number; height: number; width: number } | null>(null)

  const measure = useCallback(() => {
    const el = anchor.current
    if (!el) return
    const r = el.getBoundingClientRect()
    // Wide enough for the form, and never wider than what is left of the
    // window — a VS Code panel is far narrower than a desktop window, and the
    // drawer has to hold there too.
    const width = Math.max(240, Math.min(DRAWER_WIDTH, window.innerWidth - r.right - 24))
    setBox({ left: r.right, top: r.top, height: r.height, width })
  }, [anchor])

  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!box) return null
  return createPortal(
    <>
      {/* Catches a click anywhere else. Transparent: the graph stays readable,
          which is the point of a drawer rather than a modal. */}
      <div className="pdrawer-away" onMouseDown={onClose} />
      <div className="pdrawer" role="dialog" aria-label={title}
        style={{ left: box.left, top: box.top, height: box.height, width: box.width }}>
        <div className="pdrawer-head">
          {icon && <Icon name={icon} size={15} className="pdrawer-icon" />}
          <span className="pdrawer-title">{title}</span>
          {/* Close on the right, where a pane's close lives everywhere else in
              this app — the drawer is a surface, not a step to go back from. */}
          <button className="pdrawer-close" onClick={onClose} title={closeLabel}>×</button>
        </div>
        <div className="pdrawer-body">{children}</div>
      </div>
    </>,
    document.body,
  )
}

/** What the form wants when there is room for it. */
const DRAWER_WIDTH = 420
