import { useCallback, useEffect, useState } from 'react'

// A pane the user can drag, whose size outlives the session.
//
// The graph has had this since it had columns (useStoredWidth in
// CommitGraph.tsx); everything else was left with a hardcoded number — the
// diff's file list was 120px whatever it held, so five files did not fit and a
// comparison of twenty was read through a slot. This is the same idea, shared,
// so a pane that deserves dragging can have it in one line.

export function useStoredSize(key: string, fallback: number, min: number, max: number) {
  const [size, setSize] = useState(() => {
    const saved = parseInt(localStorage.getItem(key) ?? '', 10)
    return Number.isFinite(saved) ? Math.min(max, Math.max(min, saved)) : fallback
  })

  useEffect(() => { localStorage.setItem(key, String(size)) }, [key, size])

  /**
   * Start a drag. `axis` says which coordinate moves the size, `dir` whether
   * dragging that way grows it (1) or shrinks it (-1) — a handle on the left of
   * a pane grows it by moving left.
   */
  const startResize = useCallback((
    e: React.MouseEvent,
    opts: { axis: 'x' | 'y'; dir?: 1 | -1 } = { axis: 'x' },
  ) => {
    e.preventDefault()
    const dir = opts.dir ?? 1
    const start = opts.axis === 'x' ? e.clientX : e.clientY
    const from = size
    const onMove = (ev: MouseEvent) => {
      const now = opts.axis === 'x' ? ev.clientX : ev.clientY
      setSize(Math.min(max, Math.max(min, from + (now - start) * dir)))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      // The cursor is owned for the whole drag, not just over the handle:
      // a fast drag leaves the 4px strip long before the mouse comes up.
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = opts.axis === 'x' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [size, min, max])

  return [size, startResize, setSize] as const
}
