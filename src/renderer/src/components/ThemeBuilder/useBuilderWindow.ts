import { useEffect, useRef, useState } from 'react'

/** Keep the draft in the main React tree while its controls live in another window. */
export function useBuilderWindow() {
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const popup = useRef<Window | null>(null)
  const cleanup = useRef<(() => void) | null>(null)
  const attach = () => {
    cleanup.current?.()
    cleanup.current = null
    popup.current?.close()
    popup.current = null
    setContainer(null)
  }
  const detach = () => {
    if (popup.current && !popup.current.closed) { popup.current.focus(); return }
    const win = window.open('about:blank', 'git-vertex-theme-builder', 'popup,width=460,height=760')
    if (!win) return
    popup.current = win
    win.document.title = 'Theme Builder — Git Vertex'
    // The app's stylesheets, mirrored into the popup — and kept mirrored,
    // since the draft's rule and the installed themes' rules are <style>
    // elements the app rewrites. Mirrored INCREMENTALLY: every seed change
    // rewrites the draft's rule, and re-cloning every sheet on each of them
    // (the bundled CSS is 400 KB) is a reparse per keystroke.
    const clones = new Map<Element, HTMLElement>()
    const sync = () => {
      const sources = Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'))
      for (const [src, clone] of clones) {
        if (!sources.includes(src)) { clone.remove(); clones.delete(src) }
      }
      for (const src of sources) {
        const clone = clones.get(src)
        if (!clone) {
          const c = src.cloneNode(true) as HTMLElement
          c.setAttribute('data-builder-style', '')
          win.document.head.appendChild(c)
          clones.set(src, c)
        } else if (src instanceof HTMLStyleElement && clone.textContent !== src.textContent) {
          clone.textContent = src.textContent
        }
      }
      // The three attributes the stylesheet reads off <html>: the theme, the
      // density and the layout — the popup's controls are drawn like the app's.
      for (const key of ['data-theme', 'data-density', 'data-layout']) {
        const value = document.documentElement.getAttribute(key)
        if (value) win.document.documentElement.setAttribute(key, value)
        else win.document.documentElement.removeAttribute(key)
      }
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.head, { childList: true, subtree: true, characterData: true })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-density', 'data-layout'] })
    const closed = () => { observer.disconnect(); popup.current = null; setContainer(null) }
    win.addEventListener('beforeunload', closed)
    cleanup.current = () => { observer.disconnect(); win.removeEventListener('beforeunload', closed) }
    const mount = win.document.createElement('div')
    win.document.body.appendChild(mount)
    setContainer(mount)
  }
  useEffect(() => {
    const close = () => { cleanup.current?.(); popup.current?.close() }
    window.addEventListener('beforeunload', close)
    return () => { window.removeEventListener('beforeunload', close); close() }
  }, [])
  return { container, detach, attach }
}
