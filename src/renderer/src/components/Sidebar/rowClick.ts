/**
 * One click reveals, two clicks still do what two clicks did (#275).
 *
 * Every row in this panel already reads a double-click as "take me there",
 * detected by hand in a 400 ms window since the last press. Giving the single
 * click a meaning of its own means the first press of a double must not act:
 * so the single is armed on a timer as long as that window, and the second
 * press disarms it — the pattern the graph's chips already use for their card
 * (#258), with the delay raised from 250 ms to the window it has to outlive.
 */
import { useCallback, useEffect, useRef } from 'react'

/** The double-click window every side bar row is written against. */
export const ROW_DOUBLE_MS = 400

export interface RowClick {
  /** Put on the row's `onMouseDown`. */
  onMouseDown: (e: { preventDefault: () => void }) => void
  /** Drop a pending single click — a row that is going away, an action taken. */
  cancel: () => void
}

export function useRowClick(single: (() => void) | undefined, double: (() => void) | undefined): RowClick {
  const last = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef({ single, double })
  latest.current = { single, double }
  const cancel = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
  }, [])
  // A row unmounts while its click is armed — a filter typed, a repository
  // switched — and the act would land on a panel nobody is looking at.
  useEffect(() => cancel, [cancel])
  const onMouseDown = useCallback((e: { preventDefault: () => void }) => {
    const now = Date.now()
    if (now - last.current < ROW_DOUBLE_MS) {
      last.current = 0
      cancel()
      if (latest.current.double) { e.preventDefault(); latest.current.double() }
      return
    }
    last.current = now
    if (!latest.current.single) return
    cancel()
    timer.current = setTimeout(() => {
      timer.current = null
      latest.current.single?.()
    }, ROW_DOUBLE_MS)
  }, [cancel])
  return { onMouseDown, cancel }
}
