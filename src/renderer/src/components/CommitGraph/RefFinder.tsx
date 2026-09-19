// The `/` finder (#252): a type-ahead over the graph. One field, and under it
// the one match the graph is standing on — no list, no count to read, no
// buttons to step with. The graph does the answering: it goes to the best
// match on every keystroke, ↑ and ↓ walk the others in the graph's own order,
// and Enter takes the match as the selection, loading the history down to it
// when its tip is not on the page yet. The rules are in ./ref-find.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../Icon/Icon'
import { useLang } from '../../i18n/LanguageContext'
import { elideRefName, matchRefs, pickLanding, stepIndex, type RefFindCandidate, type RefFindMatch } from './ref-find'
import './RefFinder.css'

export interface RefFinderProps {
  open: boolean
  candidates: readonly RefFindCandidate[]
  /** The graph goes to a loaded match without taking it as the selection. */
  onLand: (match: RefFindMatch | null) => void
  /** Enter: the match becomes the selection — or is asked of the host when its tip is not loaded. */
  onCommit: (match: RefFindMatch) => void
  onClose: () => void
}

const keyOf = (m: RefFindCandidate) => `${m.kind}:${m.label}`

export default function RefFinder({ open, candidates, onLand, onCommit, onClose }: RefFinderProps) {
  const { t } = useLang()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [activeKey, setActiveKey] = useState<string | null>(null)
  /** The match whose history is being loaded: Enter again does nothing, anything typed gives up on it. */
  const [pending, setPending] = useState<string | null>(null)

  const matches = useMemo(() => matchRefs(candidates, query), [candidates, query])
  // The cursor stays on the same reference when the lists behind it refresh.
  const index = useMemo(() => {
    if (matches.length === 0) return -1
    const kept = activeKey ? matches.findIndex(m => keyOf(m) === activeKey) : -1
    return kept >= 0 ? kept : pickLanding(matches)
  }, [matches, activeKey])
  const active = index >= 0 ? matches[index] : null

  // Opening selects what was typed last time: kept to be corrected, or typed over.
  useEffect(() => {
    if (!open) { setPending(null); return }
    const input = inputRef.current
    if (input) { input.focus(); input.select() }
  }, [open])

  // The graph follows the active match — when its row is there to go to.
  const landed = useRef<string | null>(null)
  useEffect(() => {
    if (!open) { landed.current = null; return }
    const key = active ? `${keyOf(active)}@${active.row ?? ''}` : null
    if (key === landed.current) return
    landed.current = key
    onLand(active && active.row !== undefined ? active : null)
  }, [open, active, onLand])

  // The history asked for has arrived: the host has selected the commit, the finder is done.
  useEffect(() => {
    if (!pending || !open) return
    const arrived = candidates.find(c => keyOf(c) === pending)
    if (arrived && arrived.row !== undefined) { setPending(null); onClose() }
  }, [pending, candidates, open, onClose])

  const step = (delta: number) => {
    if (matches.length === 0) return
    setPending(null)
    setActiveKey(keyOf(matches[stepIndex(index, delta, matches.length)]))
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) {
      e.preventDefault(); e.stopPropagation()
      step(e.key === 'ArrowDown' ? 1 : -1)
    } else if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation()
      if (!active || pending === keyOf(active)) return
      if (active.row === undefined) setPending(keyOf(active))
      onCommit(active)
    } else if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation()
      onClose()
    }
  }

  const many = matches.length > 1
  const shown = active ? elideRefName(active.label, many ? 36 : 47) : ''
  const unloaded = !!active && active.row === undefined
  const hitTitle = !active ? undefined
    : unloaded ? t('graph.find.notLoaded', active.label)
    : shown !== active.label ? active.label : undefined

  // Kept in the DOM while closed, so the query survives until the next `/`.
  return (
    <div className={`cg-reffind${open ? '' : ' cg-reffind--closed'}`}
      role="search" aria-label={t('graph.find.label')}
      // A press in here is not a press on the graph under it.
      onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      <div className="cg-reffind-row">
        <label className="cg-reffind-field">
          <Icon name="search" size={13} className="cg-reffind-icon" />
          <input
            ref={inputRef}
            className={`cg-reffind-input${query.trim() && matches.length === 0 ? ' cg-reffind-input--empty' : ''}`}
            type="text" spellCheck={false} autoComplete="off"
            placeholder={t('graph.find.placeholder')}
            aria-label={t('graph.find.label')}
            aria-keyshortcuts="ArrowDown ArrowUp"
            value={query}
            tabIndex={open ? 0 : -1}
            onChange={e => { setQuery(e.target.value); setActiveKey(null); setPending(null) }}
            onKeyDown={onKeyDown}
          />
        </label>
        <button type="button" className="cg-reffind-close" tabIndex={open ? 0 : -1}
          title={t('common.close')} aria-label={t('common.close')} onClick={onClose}>×</button>
      </div>
      {active && (
        <div className="cg-reffind-result">
          <span className={`cg-reffind-hit${unloaded ? ' cg-reffind-hit--unloaded' : ''}`} title={hitTitle}>
            {unloaded && <Icon name="download" size={12} />}
            {shown}
          </span>
          {many && <span className="cg-reffind-nav" aria-hidden="true">↑↓ {t('graph.find.step', index + 1, matches.length)}</span>}
        </div>
      )}
    </div>
  )
}
