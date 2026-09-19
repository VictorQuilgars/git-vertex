import { useEffect, useState, useCallback, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from '../Icon/Icon'
import { Brand, type BrandName } from '../BrandMark/BrandMark'
import './PanelDrawer.css'

/**
 * A drawer that comes out of the left panel (#145, and #130 next).
 *
 * It is NOT a modal over the graph and not a centred sheet: it opens beside the
 * panel, as tall as the panel's card, and lies over the graph's space while the
 * panel itself stays where it is.
 *
 * It is a CARD of the frame, like the panes: one `--pane-gap` right of the card
 * it comes out of, its top and bottom on that card's, its corners
 * `--pane-radius`. It used to be glued to the panel's edge with square corners
 * — neither an extension of a card that is rounded and set apart by a gap, nor
 * a card of its own. Under the flush layout the three tokens are 0, 0 and 1px,
 * and it is the flush extension it always was there.
 *
 * The tokens are read from the ANCHOR and carried onto the drawer: it renders
 * in `document.body`, outside the panel's root, and a short VS Code panel
 * turns the frame flush on that root alone.
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
export default function PanelDrawer({ anchor, title, icon, brand, closeLabel, onClose, children }: {
  /** The panel this comes out of — its right edge, top and height are taken. */
  anchor: RefObject<HTMLElement | null>
  title: string
  /** What the drawer is about, beside its name. */
  icon?: IconName
  /** ...or a third party's mark, when the drawer is about their product. */
  brand?: BrandName
  closeLabel: string
  /**
   * Escape, the close button, or a click outside. The caller decides what that
   * means: a form with something half-written in it may keep its draft rather
   * than lose it.
   */
  onClose: () => void
  children: ReactNode
}) {
  const [box, setBox] = useState<{ left: number; top: number; height: number; width: number; frame: FrameTokens } | null>(null)
  /** Pulling shut: the drawer stays mounted until its exit animation ends. */
  const [closing, setClosing] = useState(false)

  // ⚠️ `animationend` is the normal way out, but it is not a guarantee: an
  // animation that never starts — reduced motion, a hidden ancestor, a test
  // environment that does not run them — would leave the drawer open for ever.
  // So the close is also on a timer, and whichever arrives first wins.
  useEffect(() => {
    if (!closing) return
    const id = setTimeout(onClose, CLOSE_FALLBACK_MS)
    return () => clearTimeout(id)
  }, [closing, onClose])

  const measure = useCallback(() => {
    const el = anchor.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const frame = frameOf(el)
    const beside = r.right + frame.gap
    // Wide enough for the form, and never wider than what is left of the
    // window — a VS Code panel is far narrower than a desktop window, and the
    // drawer has to hold there too.
    const room = window.innerWidth - beside - Math.max(frame.gap, RIGHT_MARGIN)
    if (room >= MIN_WIDTH) {
      setBox({ left: beside, top: r.top, height: r.height, width: Math.min(DRAWER_WIDTH, room), frame })
      return
    }
    // No room beside the card: a narrow VS Code panel, whose side view is
    // already a layer across the graph. The drawer takes the card's own place
    // rather than running off the window, as it did at 240px from the edge.
    const width = Math.max(r.width, Math.min(DRAWER_WIDTH, window.innerWidth - r.left - frame.gap))
    setBox({ left: r.left, top: r.top, height: r.height, width, frame })
  }, [anchor])

  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  // Escape closes it too. It is not a stray click — nobody presses it by
  // accident — and without it the drawer is a trap for anyone not using a
  // mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setClosing(true) } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  if (!box) return null
  return createPortal(
    <>
      {/* No click-away. A drawer is not a modal: the list behind it stays
          readable BECAUSE you are meant to read it while writing, and closing
          on a stray click there took a half-written query with it. It closes
          from its own control. */}
      <div className={`pdrawer${closing ? ' pdrawer--closing' : ''}`}
        role="dialog" aria-label={title}
        // The exit animation has to finish before the drawer is unmounted, so
        // the parent is told only when it ends.
        onAnimationEnd={() => { if (closing) onClose() }}
        style={{
          left: box.left, top: box.top, height: box.height, width: box.width,
          '--pane-radius': box.frame.radius, '--pane-edge': box.frame.edge,
        } as CSSProperties}>
        <div className="pdrawer-head">
          {icon && <Icon name={icon} size={15} className="pdrawer-icon" />}
          {brand && <Brand name={brand} size={15} className="pdrawer-icon" />}
          <span className="pdrawer-title">{title}</span>
          {/* Close on the right, where a pane's close lives everywhere else in
              this app — the drawer is a surface, not a step to go back from. */}
          <button className="pdrawer-close" onClick={() => setClosing(true)} title={closeLabel}>×</button>
        </div>
        <div className="pdrawer-body">{children}</div>
      </div>
    </>,
    document.body,
  )
}

/**
 * What the form wants when there is room for it. Wide enough that a query and
 * its reference are read rather than wrapped — the drawer exists because the
 * panel's column was too narrow, so being merely less narrow would miss.
 */
const DRAWER_WIDTH = 600

/** Comfortably past the exit animation, and short enough not to be noticed. */
const CLOSE_FALLBACK_MS = 400

/** What is kept between the drawer and the window's right edge, at the least. */
const RIGHT_MARGIN = 24

/** Narrower than this beside its card, the drawer takes the card's place instead. */
const MIN_WIDTH = 240

interface FrameTokens { gap: number; radius: string; edge: string }

/**
 * The frame where the drawer comes from — the layout's three tokens as that
 * element resolves them. The defaults are the flush layout's, which is what
 * :root carries, for an anchor that resolves nothing.
 */
function frameOf(el: HTMLElement): FrameTokens {
  const css = getComputedStyle(el)
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  return {
    gap: parseFloat(read('--pane-gap', '0px')) || 0,
    radius: read('--pane-radius', '0px'),
    edge: read('--pane-edge', '1px'),
  }
}
