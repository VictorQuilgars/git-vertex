import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import './ContextMenu.css'

export interface MenuAction {
  label: string
  action: () => void
  danger?: boolean
  disabled?: boolean
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

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
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
    const vw = window.innerWidth
    const vh = window.innerHeight
    const M = 4 // margin from edges

    let left = x
    if (x + rect.width > vw) left = vw - rect.width - M     // prefer opening leftwards
    left = Math.max(M, left)

    let top = y
    if (y + rect.height > vh) top = vh - rect.height - M    // flip / shift up to fit
    top = Math.max(M, top)                                  // never above the top edge

    ref.current.style.left = `${left}px`
    ref.current.style.top = `${top}px`
  }, [x, y])

  const menu = (
    <div
      ref={ref}
      className="ctx-menu"
      style={{ position: 'fixed', left: x, top: y, zIndex: 9999 }}
    >
      {items.map((item, i) => {
        if ('separator' in item) {
          return <div key={i} className="ctx-sep" />
        }
        return (
          <button
            key={i}
            className={`ctx-item${item.danger ? ' ctx-danger' : ''}${item.disabled ? ' ctx-disabled' : ''}`}
            disabled={item.disabled}
            onClick={() => { if (!item.disabled) { item.action(); onClose() } }}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )

  return createPortal(menu, document.body)
}
