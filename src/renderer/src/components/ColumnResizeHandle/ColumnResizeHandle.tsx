import { useEffect, useRef } from 'react'
import './ColumnResizeHandle.css'

/**
 * Sizes the pane after it — to its right, or below it when `horizontal` —
 * including when the pointer leaves the handle.
 */
export default function ColumnResizeHandle({ value, min, max, label, onChange, onCommit, orientation = 'vertical' }: {
  value: number; min: number; max: number; label: string
  onChange: (size: number) => void
  onCommit?: (size: number) => void
  /** The separator's own direction: a vertical bar sizes widths, a horizontal one heights. */
  orientation?: 'vertical' | 'horizontal'
}) {
  const horizontal = orientation === 'horizontal'
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])
  const clamp = (size: number) => Math.round(Math.max(min, Math.min(max, size)))
  return <div className={`column-resize-handle${horizontal ? ' column-resize-handle--horizontal' : ''}`}
    role="separator" tabIndex={0}
    aria-label={label} aria-orientation={orientation}
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value)}
    onPointerDown={e => {
      if (e.button !== 0) return
      e.preventDefault()
      e.currentTarget.focus()
      cleanup.current?.()
      const start = horizontal ? e.clientY : e.clientX
      const pointerId = e.pointerId
      let latest = value
      const move = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) return
        latest = clamp(value + start - (horizontal ? event.clientY : event.clientX))
        onChange(latest)
      }
      const finish = () => {
        cleanup.current?.()
        onCommit?.(latest)
      }
      const up = (event: PointerEvent) => { if (event.pointerId === pointerId) finish() }
      cleanup.current = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        window.removeEventListener('blur', finish)
        cleanup.current = null
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
      window.addEventListener('blur', finish)
    }}
    onKeyDown={e => {
      const step = e.shiftKey ? 50 : 10
      const grow = horizontal ? 'ArrowUp' : 'ArrowLeft'
      const shrink = horizontal ? 'ArrowDown' : 'ArrowRight'
      const next = e.key === grow ? value + step : e.key === shrink ? value - step
        : e.key === 'Home' ? min : e.key === 'End' ? max : null
      if (next === null) return
      e.preventDefault()
      e.stopPropagation()
      const size = clamp(next)
      onChange(size)
      onCommit?.(size)
    }} />
}
