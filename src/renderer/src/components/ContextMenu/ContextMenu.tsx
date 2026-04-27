import React, { useEffect, useRef } from 'react'
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

  // Clamp to viewport
  useEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (rect.right > vw) ref.current.style.left = `${x - rect.width}px`
    if (rect.bottom > vh) ref.current.style.top = `${y - rect.height}px`
  }, [x, y])

  return (
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
}
