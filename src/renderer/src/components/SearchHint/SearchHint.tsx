// What opens under the graph's search field when it takes the focus (#255).
// The query stays text in the field — typed, pasted, corrected like text — and
// this panel is where its operators are SEEN: the ones in force, each one
// removable on its own, then the ones there are, each with an example; a click
// on one writes it at the end of the query and leaves the caret after it.
//
// Both toolbars mount it (the desktop's and the panel's): `useSearchHint` is
// the focus bookkeeping they would otherwise each write.
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLang } from '../../i18n/LanguageContext'
import { appendOperator, parseDateBound, parseSearchQuery, removeTerm, type SearchOperator } from '../../utils/searchQuery'
import './SearchHint.css'

const ROWS: { op: SearchOperator; label: 'search.op.author' | 'search.op.file' | 'search.op.after' | 'search.op.before'; example: string }[] = [
  { op: 'author', label: 'search.op.author', example: 'author:ana' },
  { op: 'file', label: 'search.op.file', example: 'file:src/main' },
  { op: 'after', label: 'search.op.after', example: 'after:2w' },
  { op: 'before', label: 'search.op.before', example: 'before:2026-09-01' },
]

/** Open while the focus is inside the field's box; Escape puts it away until the next focus. */
export function useSearchHint() {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const onFocus = useCallback(() => setOpen(true), [])
  const onBlur = useCallback((e: React.FocusEvent) => {
    if (!box.current?.contains(e.relatedTarget as Node | null)) setOpen(false)
  }, [])
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false) }
  }, [open])
  return { open, boxProps: { ref: box, onFocus, onBlur, onKeyDown } }
}

export default function SearchHint({ open, query, onChange, loading = false }: {
  open: boolean
  query: string
  onChange: (query: string) => void
  /** git is being asked about a `file:`. */
  loading?: boolean
}) {
  const { t } = useLang()
  const parsed = useMemo(() => parseSearchQuery(query), [query])
  // A field at the right end of its toolbar — the panel's is — would push the
  // panel past the window's edge: it then hangs from the field's right side.
  const panel = useRef<HTMLDivElement>(null)
  const [fromEnd, setFromEnd] = useState(false)
  useLayoutEffect(() => {
    if (!open) { setFromEnd(false); return }
    const el = panel.current
    if (!el || fromEnd) return
    if (el.offsetLeft + (el.offsetParent as HTMLElement | null ?? el).getBoundingClientRect().left + el.offsetWidth > window.innerWidth - 4) setFromEnd(true)
  }, [open, fromEnd])
  if (!open) return null
  // A press in here must not take the focus out of the field it belongs to.
  const keep = (e: React.MouseEvent) => e.preventDefault()
  return (
    <div ref={panel} className={`shint${fromEnd ? ' shint--end' : ''}`} role="group" aria-label={t('search.hint.label')} onMouseDown={keep}>
      {parsed.terms.length > 0 && (
        <div className="shint-active">
          {parsed.terms.map((term, i) => {
            const unread = (term.op === 'after' || term.op === 'before') && parseDateBound(term.value, term.op) === null
            return (
              <span key={`${term.start}-${i}`} className={`shint-chip${unread ? ' shint-chip--unread' : ''}`}
                title={unread ? t('search.hint.unreadDate', term.value) : undefined}>
                <span className="shint-chip-op">{term.op}:</span>{term.value}
                <button type="button" className="shint-chip-x" tabIndex={-1}
                  title={t('search.hint.remove', `${term.op}:${term.value}`)} aria-label={t('search.hint.remove', `${term.op}:${term.value}`)}
                  onClick={() => onChange(removeTerm(query, term))}>×</button>
              </span>
            )
          })}
          {loading && <span className="shint-loading">{t('search.hint.asking')}</span>}
        </div>
      )}
      <div className="shint-head">{t('search.hint.title')}</div>
      {ROWS.map(row => (
        <button key={row.op} type="button" className="shint-row" tabIndex={-1}
          onClick={() => onChange(appendOperator(query, row.op))}>
          <code className="shint-op">{row.op}:</code>
          <span className="shint-label">{t(row.label)}</span>
          <code className="shint-example">{row.example}</code>
        </button>
      ))}
      <div className="shint-foot">{t('search.hint.foot')}</div>
    </div>
  )
}
