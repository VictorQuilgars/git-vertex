import { useEffect, useRef } from 'react'
import './ColumnResizeHandle.css'

/** Sizes the column to the right, including when the pointer leaves the handle. */
export default function ColumnResizeHandle({ value, min, max, label, onChange, onCommit }: {
  value: number; min: number; max: number; label: string
  onChange: (width: number) => void
  onCommit?: (width: number) => void
}) {
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])
  const clamp = (width: number) => Math.round(Math.max(min, Math.min(max, width)))
  return <div className="column-resize-handle" role="separator" tabIndex={0}
    aria-label={label} aria-orientation="vertical"
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value)}
    onPointerDown={e => {
      if (e.button !== 0) return
      e.preventDefault()
      e.currentTarget.focus()
      cleanup.current?.()
      const startX = e.clientX
      const pointerId = e.pointerId
      let latest = value
      const move = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) return
        latest = clamp(value + startX - event.clientX)
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
      const next = e.key === 'ArrowLeft' ? value + step : e.key === 'ArrowRight' ? value - step
        : e.key === 'Home' ? min : e.key === 'End' ? max : null
      if (next === null) return
      e.preventDefault()
      e.stopPropagation()
      const width = clamp(next)
      onChange(width)
      onCommit?.(width)
    }} />
}
