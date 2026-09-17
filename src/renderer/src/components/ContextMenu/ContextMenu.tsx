import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from '../Icon/Icon'
import './ContextMenu.css'

export interface MenuAction {
  label: string
  action?: () => void          // optional when the row only opens a submenu
  danger?: boolean
  disabled?: boolean
  // When set, renders a checkmark slot before the label (checked or empty) —
  // for toggle items like column visibility, instead of a plain action.
  checked?: boolean
  // Nested items shown to the side when the row is hovered ~0.2s.
  submenu?: MenuItemDef[]
  /**
   * A mark before the label, for a row whose kind matters more than its
   * position. Today that is the AI rows, and it is why they are legible:
   * "AI" as a bare word in a list of twenty verbs is not a section, it is
   * another verb.
   */
  icon?: IconName
  /**
   * What the row IS, rather than what it looks like. `ai` puts it in the ink
   * this app reserves for what a model proposes and draws the submenu it
   * opens in the dashed outline that goes with it — the ghost chip's rule,
   * applied to a menu.
   */
  tone?: 'ai'
}

export interface MenuSeparator {
  separator: true
}

export type MenuItemDef = MenuAction | MenuSeparator

interface ContextMenuProps {
  x: number
  y: number
  items: MenuItemDef[]
  onClose: () => void
}

const OPEN_DELAY = 200   // hover dwell before a submenu opens
const CLOSE_DELAY = 220  // grace period to move the cursor into the submenu

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const subRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const [sub, setSub] = useState<{ i: number; x: number; y: number } | null>(null)
  // Set when a submenu was opened from the keyboard: its first row takes the
  // focus once it has rendered, which a hover-opened one must never do.
  const focusSubOnOpen = useRef(false)

  // The menu takes the focus while it is up, and gives it back on close. That
  // is what stops the graph's own arrow keys from moving the selection under
  // an open menu, and what lets a keyboard user land where they were.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])

  useEffect(() => {
    if (sub && focusSubOnOpen.current) {
      focusSubOnOpen.current = false
      subRef.current?.querySelector<HTMLButtonElement>('.ctx-item:not(.ctx-disabled)')?.focus()
    }
  }, [sub])

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || subRef.current?.contains(t)) return
      onClose()
    }
    // The keyboard model of a menu: arrows walk the enabled rows of whichever
    // menu is open (the submenu while it is), Right opens a row's submenu on
    // its first entry, Left closes it and returns to the row, Enter and Space
    // are the button's own activation, Escape closes everything.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      const container = sub ? subRef.current : ref.current
      if (!container) return
      const rows = Array.from(container.querySelectorAll<HTMLButtonElement>('.ctx-item:not(.ctx-disabled)'))
      if (rows.length === 0) return
      const current = rows.indexOf(document.activeElement as HTMLButtonElement)
      const focusAt = (i: number) => rows[((i % rows.length) + rows.length) % rows.length].focus()
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); focusAt(current < 0 ? 0 : current + 1); break
        case 'ArrowUp': e.preventDefault(); focusAt(current < 0 ? rows.length - 1 : current - 1); break
        case 'Home': e.preventDefault(); focusAt(0); break
        case 'End': e.preventDefault(); focusAt(rows.length - 1); break
        case 'ArrowRight': {
          if (sub || current < 0) return
          const i = Number(rows[current].dataset.index)
          const item = items[i]
          if (!item || 'separator' in item || !item.submenu?.length) return
          e.preventDefault()
          clearTimeout(timer.current)
          const r = rows[current].getBoundingClientRect()
          focusSubOnOpen.current = true
          setSub({ i, x: r.right - 3, y: r.top - 4 })
          break
        }
        case 'ArrowLeft': {
          if (!sub) return
          e.preventDefault()
          const parentRow = ref.current?.querySelector<HTMLButtonElement>(`.ctx-item[data-index="${sub.i}"]`)
          setSub(null)
          parentRow?.focus()
          break
        }
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose, sub, items])

  // Clamp to viewport — keep the menu fully on-screen even in a short panel.
  useEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const vw = window.innerWidth, vh = window.innerHeight, M = 4
    let left = x
    if (x + rect.width > vw) left = vw - rect.width - M
    left = Math.max(M, left)
    let top = y
    if (y + rect.height > vh) top = vh - rect.height - M
    top = Math.max(M, top)
    ref.current.style.left = `${left}px`
    ref.current.style.top = `${top}px`
  }, [x, y])

  const openSub = (i: number, el: HTMLElement) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const r = el.getBoundingClientRect()
      setSub({ i, x: r.right - 3, y: r.top - 4 })
    }, OPEN_DELAY)
  }
  const closeSubSoon = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setSub(null), CLOSE_DELAY)
  }

  /**
   * `inSub` is load-bearing: this same function renders the rows of the parent
   * menu AND the rows of the open submenu. Without it, hovering an entry inside
   * the submenu ran the "close the open submenu" branch — the submenu closing
   * itself under the cursor, which is exactly what it looked like. The
   * container's own onMouseEnter cleared the timer, then the row's re-armed it.
   */
  const row = (item: MenuAction, i: number, close: () => void, inSub = false) => (
    <button
      key={i}
      role="menuitem"
      data-index={i}
      aria-haspopup={item.submenu?.length ? 'menu' : undefined}
      aria-expanded={item.submenu?.length ? (!inSub && sub?.i === i) : undefined}
      className={`ctx-item${item.danger ? ' ctx-danger' : ''}${item.disabled ? ' ctx-disabled' : ''}${item.tone ? ` ctx-item--${item.tone}` : ''}`}
      disabled={item.disabled}
      // Inside the submenu, hovering only keeps it alive. In the parent menu, a
      // row without a submenu closes the open one on the same grace period as
      // leaving it — never instantly, because reaching the second or third
      // entry means moving right and down, which clips the row below on the way.
      onMouseEnter={e => {
        if (inSub) { clearTimeout(timer.current); return }
        item.submenu?.length ? openSub(i, e.currentTarget) : closeSubSoon()
      }}
      onClick={() => { if (item.disabled || item.submenu?.length) return; item.action?.(); close() }}
    >
      {item.checked !== undefined && <span className="ctx-check">{item.checked ? '✓' : ''}</span>}
      {item.icon && <Icon name={item.icon} size={12} className="ctx-icon" />}
      <span className="ctx-label">{item.label}</span>
      {!!item.submenu?.length && <span className="ctx-chevron">›</span>}
    </button>
  )

  const openItem = sub != null ? items[sub.i] : null
  const subItems = openItem && !('separator' in openItem) ? openItem.submenu : undefined

  const menu = (
    <>
      <div ref={ref} role="menu" tabIndex={-1} className="ctx-menu" style={{ position: 'fixed', left: x, top: y, zIndex: 9999 }}>
        {items.map((item, i) => 'separator' in item ? <div key={i} className="ctx-sep" /> : row(item, i, onClose))}
      </div>
      {subItems && sub && (
        <div
          ref={subRef}
          role="menu"
          className={`ctx-menu${openItem && !('separator' in openItem) && openItem.tone ? ` ctx-menu--${openItem.tone}` : ''}`}
          style={{ position: 'fixed', left: sub.x, top: sub.y, zIndex: 10000 }}
          onMouseEnter={() => clearTimeout(timer.current)}
          onMouseLeave={closeSubSoon}
        >
          {subItems.map((item, i) => 'separator' in item ? <div key={i} className="ctx-sep" /> : row(item, i, onClose, true))}
        </div>
      )}
    </>
  )

  return createPortal(menu, document.body)
}
