import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || subRef.current?.contains(t)) return
      onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

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

  const row = (item: MenuAction, i: number, close: () => void) => (
    <button
      key={i}
      className={`ctx-item${item.danger ? ' ctx-danger' : ''}${item.disabled ? ' ctx-disabled' : ''}`}
      disabled={item.disabled}
      onMouseEnter={e => { item.submenu?.length ? openSub(i, e.currentTarget) : (clearTimeout(timer.current), setSub(null)) }}
      onClick={() => { if (item.disabled || item.submenu?.length) return; item.action?.(); close() }}
    >
      {item.checked !== undefined && <span className="ctx-check">{item.checked ? '✓' : ''}</span>}
      <span className="ctx-label">{item.label}</span>
      {!!item.submenu?.length && <span className="ctx-chevron">›</span>}
    </button>
  )

  const openItem = sub != null ? items[sub.i] : null
  const subItems = openItem && !('separator' in openItem) ? openItem.submenu : undefined

  const menu = (
    <>
      <div ref={ref} className="ctx-menu" style={{ position: 'fixed', left: x, top: y, zIndex: 9999 }}>
        {items.map((item, i) => 'separator' in item ? <div key={i} className="ctx-sep" /> : row(item, i, onClose))}
      </div>
      {subItems && sub && (
        <div
          ref={subRef}
          className="ctx-menu"
          style={{ position: 'fixed', left: sub.x, top: sub.y, zIndex: 10000 }}
          onMouseEnter={() => clearTimeout(timer.current)}
          onMouseLeave={closeSubSoon}
        >
          {subItems.map((item, i) => 'separator' in item ? <div key={i} className="ctx-sep" /> : row(item, i, onClose))}
        </div>
      )}
    </>
  )

  return createPortal(menu, document.body)
}
