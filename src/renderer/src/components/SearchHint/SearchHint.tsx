// What opens under the graph's search field when it takes the focus (#255).
// The query stays text in the field — typed, pasted, corrected like text — and
// this panel is where everything the field can do is SEEN.
//
// TWO ways to ask, and the panel shows both because it opens before either is
// typed. Plain language comes first: it is the one that needs no vocabulary,
// and it used to be reachable only by finding a small button at the field's
// right end — so the panel, opening on the very first focus, taught that
// operators were all there was. Then the operators: the ones in force, each
// removable on its own, then the ones there are, each with an example; a click
// on one writes it at the end of the query and leaves the caret after it.
//
// The plain-language block appears only where a host answers for it (`onAsk`):
// both products do, and a row that does nothing is worse than no row.
//
// Both toolbars mount it (the desktop's and the panel's): `useSearchHint` is
// the focus bookkeeping they would otherwise each write.
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLang } from '../../i18n/LanguageContext'
import { Icon } from '../Icon/Icon'
import { appendOperator, parseDateBound, parseSearchQuery, removeTerm, type SearchOperator } from '../../utils/searchQuery'
import { useKept, type KeptEntry } from '../../hooks/useKept'
import './SearchHint.css'

/** How many kept searches the panel lists before sending the rest to the page. */
const KEPT_ROWS = 6

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

export default function SearchHint({ open, query, onChange, loading = false, onAsk, asking = false, answered = false, repo, onOpenKept, onOpenMemory }: {
  open: boolean
  query: string
  onChange: (query: string) => void
  /** git is being asked about a `file:`. */
  loading?: boolean
  /**
   * Ask the model what the query says, in words. Absent ⇒ this host has no
   * such search and the block is not drawn at all.
   */
  onAsk?: () => void
  /** The model is being asked right now. */
  asking?: boolean
  /** What the graph is showing IS the model's answer to this query. */
  answered?: boolean
  /**
   * The repository whose kept searches belong under the field. A search one
   * kept is a search one means to run again, and the field is where searches
   * are run: leaving them to a page of their own meant going to fetch them.
   * Absent (or without `onOpenKept`) ⇒ the block is not drawn at all.
   */
  repo?: string | null
  onOpenKept?: (entry: KeptEntry) => void
  /** The Memory page — all of them, with what they hold. */
  onOpenMemory?: () => void
}) {
  const { t } = useLang()
  const kept = useKept(onOpenKept ? repo ?? null : null)
  const parsed = useMemo(() => parseSearchQuery(query), [query])
  // Searches only: a kept COMPARISON is not something this field can run.
  const keptSearches = useMemo(() => kept.entries.filter(entry => entry.kind === 'search'), [kept.entries])
  // What would be asked: the words, without the operators — which is also what
  // decides whether there is anything to ask at all.
  const words = parsed.text.trim()
  // A field at the right end of its toolbar — the panel's is, and the desktop's
  // too — would push the panel past the window's edge: it then hangs from the
  // field's right side.
  //
  // Measured after EVERY render, not once on opening: the panel is as wide as
  // what is in it, up to its max, and what is in it changes while it is open.
  // Measuring only on the way up saw the narrow panel of an empty field, fit
  // it, and never looked again — so a typed sentence, which is the whole point
  // of the first row, widened it to the cap and off the screen, taking the
  // operators' examples and the `↵` with it. Flipping is one-way until it
  // closes, which is what keeps it from oscillating between the two sides.
  const panel = useRef<HTMLDivElement>(null)
  const [fromEnd, setFromEnd] = useState(false)
  useLayoutEffect(() => {
    if (!open) { setFromEnd(false); return }
    const el = panel.current
    if (!el || fromEnd) return
    if (el.offsetLeft + (el.offsetParent as HTMLElement | null ?? el).getBoundingClientRect().left + el.offsetWidth > window.innerWidth - 4) setFromEnd(true)
  })
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
      {onAsk && (
        <>
          <div className="shint-head">{t('search.ask.title')}</div>
          <button type="button" className={`shint-row shint-ask${answered ? ' shint-ask--on' : ''}`} tabIndex={-1}
            disabled={!words || asking} onClick={onAsk}>
            <Icon name="ai" size={13} />
            <span className="shint-label">
              {asking ? t('search.ask.asking')
                : !words ? t('search.ask.empty')
                : answered ? t('search.ask.again') : t('search.ask.go', words)}
            </span>
            {words && !asking && <kbd className="shint-key">↵</kbd>}
          </button>
          {!words && <div className="shint-foot">{t('search.ask.example')}</div>}
          <div className="shint-split" />
        </>
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
      {onOpenKept && keptSearches.length > 0 && (
        <>
          <div className="shint-split" />
          <div className="shint-head">{t('search.hint.kept')}</div>
          {keptSearches.slice(0, KEPT_ROWS).map(entry => (
            <button key={entry.id} type="button" className="shint-row shint-kept" tabIndex={-1}
              title={entry.query} onClick={() => onOpenKept(entry)}>
              <Icon name="bookmark" size={12} />
              <span className="shint-label">{entry.name}</span>
              {/* A search keeps its query as its name until it is renamed, and
                  the same word twice on one row says nothing. */}
              {entry.name !== entry.query && <code className="shint-example">{entry.query}</code>}
            </button>
          ))}
          {onOpenMemory && (
            <button type="button" className="shint-row shint-kept-all" tabIndex={-1} onClick={onOpenMemory}>
              <span className="shint-label">{t('search.hint.keptAll')}</span>
              <Icon name="arrowRight" size={12} />
            </button>
          )}
        </>
      )}
    </div>
  )
}
