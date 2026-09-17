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
    const sync = () => {
      win.document.head.querySelectorAll('[data-builder-style]').forEach(el => el.remove())
      document.head.querySelectorAll('style, link[rel="stylesheet"]').forEach(el => {
        const clone = el.cloneNode(true) as HTMLElement
        clone.setAttribute('data-builder-style', '')
        win.document.head.appendChild(clone)
      })
      for (const key of ['data-theme', 'data-density']) {
        const value = document.documentElement.getAttribute(key)
        if (value) win.document.documentElement.setAttribute(key, value)
        else win.document.documentElement.removeAttribute(key)
      }
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.head, { childList: true, subtree: true, characterData: true })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-density'] })
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
