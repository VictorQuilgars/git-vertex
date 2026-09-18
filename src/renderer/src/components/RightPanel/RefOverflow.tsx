// The refs of a commit, in the one-line header of its details. They used to
// share the line by SHRINKING: four refs in a narrow panel came out as
// "v…", "ext…", "ori…", "m…" — letters, not names. A name that cannot be read
// says nothing, so a chip is now drawn whole or not at all: as many as fit, in
// the order that matters (where HEAD is, the branches, their remotes, the
// tags), and the rest behind a "+N" that lists them, whole, when it is asked.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLang } from '../../i18n/LanguageContext'

export interface HeaderRef { text: string; cls: string; title: string }

/** Where HEAD is, then the branches, then their remotes, then the tags — git's own order within each. */
export function headerRefs(refs: readonly string[]): HeaderRef[] {
  const rank = (cls: string) => cls === 'rp-ref-head' ? 0 : cls === 'rp-ref-local' ? 1 : cls === 'rp-ref-remote' ? 2 : 3
  return refs
    .filter(r => !/^(origin\/HEAD|remotes\/[^/]+\/HEAD)$/.test(r))
    .map((r, i) => {
      const isHead = r.includes('HEAD'), isTag = r.startsWith('tag:')
      const isRemote = r.includes('origin/') || r.includes('remotes/')
      const name = r.replace('tag: ', '').replace('HEAD -> ', '')
      const cls = isHead ? 'rp-ref-head' : isTag ? 'rp-ref-tag' : isRemote ? 'rp-ref-remote' : 'rp-ref-local'
      return { ref: { text: isHead ? `★ ${name}` : name, cls, title: name }, i }
    })
    .sort((a, b) => rank(a.ref.cls) - rank(b.ref.cls) || a.i - b.i)
    .map(x => x.ref)
}

/**
 * How many chips are drawn whole. All of them when they fit; otherwise as many
 * as leave room for the "+N". Never none: the first one is the one that
 * matters most, and it is cut — alone, with its name in its tooltip — rather
 * than hidden behind a number.
 */
export function fitCount(widths: readonly number[], available: number, gap: number, moreWidth: number): number {
  const n = widths.length
  if (n === 0) return 0
  // Not laid out (a test DOM, a hidden pane): there is nothing to fit into.
  if (available <= 0) return n
  const total = widths.reduce((s, w) => s + w, 0) + gap * (n - 1)
  if (total <= available) return n
  let used = 0, count = 0
  for (const w of widths) {
    const next = used + w + gap
    if (next + moreWidth > available) break
    used = next; count++
  }
  return Math.max(1, count)
}

const GAP = 6, MORE_W = 34

export default function RefOverflow({ refs }: { refs: readonly HeaderRef[] }) {
  const { t } = useLang()
  const box = useRef<HTMLSpanElement>(null)
  const [count, setCount] = useState(refs.length)
  const [open, setOpen] = useState(false)

  const measure = useCallback(() => {
    const el = box.current
    if (!el) return
    // Every chip is in the row, once — the ones that do not fit are only taken
    // off stage — so each can be measured at its natural width where it stands.
    const widths = Array.from(el.querySelectorAll<HTMLElement>(':scope > .rp-ref')).map(c => c.offsetWidth)
    setCount(fitCount(widths, el.clientWidth, GAP, MORE_W))
  }, [])
  useLayoutEffect(() => { measure() }, [measure, refs])
  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  // The list closes on a press elsewhere and on Escape, and when the commit changes.
  useEffect(() => { setOpen(false) }, [refs])
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    document.addEventListener('pointerdown', away, true)
    document.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', key, true) }
  }, [open])

  if (refs.length === 0) return null
  const hidden = refs.slice(count)
  return (
    <span className={`rp-refs${count === 1 ? ' rp-refs--one' : ''}`} ref={box}>
      {refs.map((r, i) => (
        <span key={i} className={`rp-ref ${r.cls}${i >= count ? ' rp-ref--off' : ''}`} title={r.title}
          aria-hidden={i >= count ? true : undefined}>{r.text}</span>
      ))}
      {hidden.length > 0 && (
        <button type="button" className={`rp-refs-more${open ? ' rp-refs-more--open' : ''}`}
          aria-expanded={open} title={t('panel.moreRefs', hidden.length)} aria-label={t('panel.moreRefs', hidden.length)}
          onClick={() => setOpen(o => !o)}>+{hidden.length}</button>
      )}
      {open && hidden.length > 0 && (
        <span className="rp-refs-pop" role="list">
          {hidden.map((r, i) => <span key={i} role="listitem" className={`rp-ref ${r.cls}`} title={r.title}>{r.text}</span>)}
        </span>
      )}
    </span>
  )
}
