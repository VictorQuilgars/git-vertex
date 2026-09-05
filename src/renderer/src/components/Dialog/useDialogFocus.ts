import { useEffect, useRef } from 'react'

/** Keep modal keyboard navigation local, and return focus to its trigger. */
export function useDialogFocus(onCancel: () => void, initialSelector = 'button') {
  const ref = useRef<HTMLDivElement>(null)
  const cancel = useRef(onCancel)
  cancel.current = onCancel
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const box = ref.current
    if (!box) return
    const controls = () => Array.from(box.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
    ))
    const initial = box.querySelector<HTMLElement>(initialSelector) ?? box
    initial.focus()
    if (initial instanceof HTMLInputElement || initial instanceof HTMLTextAreaElement) initial.select()
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        cancel.current()
      } else if (e.key === 'Tab') {
        const items = controls()
        const first = items[0] ?? box
        const last = items[items.length - 1] ?? box
        if (!box.contains(document.activeElement) || (e.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          e.preventDefault()
          ;(e.shiftKey ? last : first).focus()
        }
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => {
      document.removeEventListener('keydown', handler, true)
      if (previous?.isConnected) previous.focus()
    }
  }, [initialSelector])
  return ref
}
