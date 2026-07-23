// RebaseProgress — the "rebase in progress" tool shown in a standalone
// editor tab (GitLens-style). Auto-opened by the VS Code extension whenever a
// rebase is detected, whether it was started from Git Vertex, the integrated
// terminal or an external CLI. Shows the step timeline (done / current /
// remaining), lets you re-plan the REMAINING steps (pick/reword/edit/squash/
// fixup/drop + reorder — same as GitLens' paused-rebase view), the conflicted
// files, and Continue / Skip / Abort controls.

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useToast } from '../Toast/Toast'
import { useLang } from '../../i18n/LanguageContext'
import { computeMessageGroups, MessageGroup } from '../../utils/rebaseMessageGroups'
import './RebaseProgress.css'

interface RebaseStep {
  action: string
  hash: string
  shortHash: string
  subject: string
  date?: string
}

interface RebaseState {
  inProgress: boolean
  interactive: boolean
  headName: string
  ontoHash: string
  ontoShort: string
  stepCurrent: number
  stepTotal: number
  done: RebaseStep[]
  todo: RebaseStep[]
  stoppedSha: string | null
  conflicts: string[]
}

// Lazy untyped view of window.gitAPI: the extension shim exposes methods
// (getRebaseState, openConflict, uiConfirm…) that the desktop preload's typed
// surface doesn't declare yet.
const api: any = new Proxy({}, { get: (_t, p) => (window as any).gitAPI?.[p as string] })

type EditableAction = 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'drop'
const EDITABLE_ACTIONS: EditableAction[] = ['pick', 'reword', 'edit', 'squash', 'fixup', 'drop']
const SHORTCUT_KEYS: Record<string, EditableAction> = {
  p: 'pick', r: 'reword', e: 'edit', s: 'squash', f: 'fixup', d: 'drop',
}

const ACTION_COLORS: Record<string, string> = {
  pick: '#3fb950',
  reword: '#58a6ff',
  edit: '#58a6ff',
  squash: '#d2a8ff',
  fixup: '#ffa657',
  drop: '#f85149',
  exec: '#8b949e',
  break: '#8b949e',
}

// Composite key embedding a group's exact composition — when the plan
// changes (action toggled, reordered) the key changes too, so a lookup
// naturally falls back to the fresh default instead of needing a sync effect.
const groupKey = (g: MessageGroup): string => `${g.leaderIndex}:${g.memberIndexes.join(',')}`

export default function RebaseProgress() {
  const toast = useToast()
  const { t } = useLang()
  const [state, setState] = useState<RebaseState | null>(null)
  const [busy, setBusy] = useState(false)
  // Editable plan for the REMAINING steps only — already-applied ones (`done`)
  // are baked into history and can't be replanned. Synced from state.todo
  // whenever the underlying set of hashes changes (new rebase state), but
  // preserved across incidental polls so in-flight edits/reordering survive
  // file-watcher refreshes.
  const [todoEdits, setTodoEdits] = useState<RebaseStep[]>([])
  // User-edited final message per squash/reword group among the remaining
  // steps, keyed by groupKey().
  const [groupMessages, setGroupMessages] = useState<Record<string, string>>({})
  const [conflictFilter, setConflictFilter] = useState('')
  const dragIndex = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const conflictsRef = useRef<HTMLDivElement>(null)
  // Distinguishes "no rebase ever seen" from "the rebase we were showing just
  // finished" so the tab can celebrate completion instead of looking empty.
  const sawRebase = useRef(false)

  const load = useCallback(async () => {
    try {
      const s: RebaseState = await api.getRebaseState()
      if (s?.inProgress) sawRebase.current = true
      setState(s)
      setTodoEdits(prev => {
        const newSet = [...s.todo].map(x => x.hash).sort().join(',')
        const curSet = [...prev].map(x => x.hash).sort().join(',')
        return newSet !== curSet ? s.todo : prev
      })
    } catch { /* repo not ready yet */ }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    api.onRepoChanged(load)
    api.onWorkingChanged(load)
    return () => {
      api.offRepoChanged(load)
      api.offWorkingChanged(load)
    }
  }, [load])

  // Groups over the remaining (editable) steps only. A group whose leader
  // was already applied (mid-squash-chain paused on a conflict) shows up as
  // a needsMessage=false singleton here — its message isn't customizable
  // from this tab, and git's default combination is used for it, same as
  // before this feature existed.
  const groups = useMemo(() => computeMessageGroups(
    todoEdits.map(s => ({ action: s.action, hash: s.hash, message: s.subject }))
  ), [todoEdits])

  const messageGroupByLastIndex = useMemo(() => {
    const map = new Map<number, MessageGroup>()
    for (const g of groups) if (g.needsMessage) map.set(g.lastMemberIndex, g)
    return map
  }, [groups])

  const run = useCallback(async (label: string, op: () => Promise<{ success?: boolean; error?: string }>) => {
    setBusy(true)
    try {
      const r = await op()
      if (r && r.success === false) toast.error(r.error ?? t('rp.opFailed', label))
      else toast.success(`✓ ${label}`)
    } finally {
      setBusy(false)
      await load()
    }
  }, [toast, load])

  const handleContinue = useCallback(() => run(t('rp.continued'), async () => {
    const needsMessageGroups = groups.filter(g => g.needsMessage)
    for (const g of needsMessageGroups) {
      const msg = groupMessages[groupKey(g)] ?? g.defaultMessage
      if (!msg.trim()) {
        return { success: false, error: t('rebase.emptyMsg') }
      }
    }
    // Persist any replanning of the remaining steps before resuming.
    if (todoEdits.length > 0) {
      const r = await api.updateRebaseTodo(todoEdits.map((s: RebaseStep) => ({ action: s.action, hash: s.hash })))
      if (r && r.success === false) return r
    }
    const messages = needsMessageGroups.map(g => groupMessages[groupKey(g)] ?? g.defaultMessage)
    return api.continueRebase(messages)
  }), [run, todoEdits, groups, groupMessages])
  const handleSkip = useCallback(() =>
    run(t('rp.stepSkipped'), () => api.skipRebase()), [run])
  const handleAbort = useCallback(async () => {
    const confirmFn = api.uiConfirm ?? (async (m: string) => window.confirm(m))
    if (!(await confirmFn(t('rp.abortConfirm')))) return
    await run(t('rp.aborted'), () => api.abortRebase())
  }, [run])

  // Ctrl/Cmd+Enter → Continue, matching the footer button's hint.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (!busy && state?.inProgress && state.conflicts.length === 0) handleContinue()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, state, handleContinue])

  const handleOpenConflict = useCallback((file: string) => {
    // Rich 3-way resolver tab when the host supports it; native editor otherwise.
    if (api.openConflictResolver) api.openConflictResolver(file)
    else api.openConflict?.(file)
  }, [])

  const scrollToConflicts = useCallback(() => {
    conflictsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const setTodoAction = (i: number, action: EditableAction) => {
    setTodoEdits(prev => prev.map((s, idx) => idx === i ? { ...s, action } : s))
  }

  const moveTodo = (from: number, to: number) => {
    if (to < 0 || to >= todoEdits.length || from === to) return
    setTodoEdits(prev => {
      const arr = [...prev]
      const [item] = arr.splice(from, 1)
      arr.splice(to, 0, item)
      return arr
    })
  }

  const handleRowKeyDown = (e: React.KeyboardEvent, i: number) => {
    const key = e.key.toLowerCase()
    if (e.altKey && (key === 'arrowup' || key === 'arrowdown')) {
      e.preventDefault()
      moveTodo(i, key === 'arrowup' ? i - 1 : i + 1)
      return
    }
    if (SHORTCUT_KEYS[key]) {
      e.preventDefault()
      setTodoAction(i, SHORTCUT_KEYS[key])
    }
  }

  const handleDragStart = (i: number) => { dragIndex.current = i }
  const handleDragOver = (e: React.DragEvent, i: number) => { e.preventDefault(); setDragOver(i) }
  const handleDrop = (i: number) => {
    if (dragIndex.current !== null) moveTodo(dragIndex.current, i)
    dragIndex.current = null
    setDragOver(null)
  }

  if (!state) return <div className="rp-page"><div className="rp-empty">{t('common.loading')}</div></div>

  if (!state.inProgress) {
    return (
      <div className="rp-page">
        <div className="rp-finished">
          {sawRebase.current ? (
            <>
              <div className="rp-finished-icon rp-ok">✓</div>
              <div className="rp-finished-title">{t('rp.finishedTitle')}</div>
              <div className="rp-finished-sub">{t('rp.finishedSub')}</div>
            </>
          ) : (
            <>
              <div className="rp-finished-icon">⚡</div>
              <div className="rp-finished-title">{t('rp.noneTitle')}</div>
              <div className="rp-finished-sub">
                {t('rp.noneSub')}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // In rebase-merge the last line of `done` is the step git is stopped on.
  const doneSettled = state.done.slice(0, -1)
  const current = state.done[state.done.length - 1] ?? null
  const hasConflicts = state.conflicts.length > 0
  const pauseReason = current?.action === 'edit' ? t('rp.pauseEdit')
    : current?.action === 'break' ? t('rp.pauseBreak')
    : t('rp.waiting')
  const filteredConflicts = state.conflicts.filter(f => f.toLowerCase().includes(conflictFilter.toLowerCase()))

  const renderReadOnlyStep = (s: RebaseStep, key: string, status: 'done' | 'current') => {
    // The commit git is actually stuck on gets a red highlight instead of the
    // neutral "current" blue — same convention as GitLens' rebase view.
    const isConflicted = status === 'current' && hasConflicts
    const variant = isConflicted ? 'conflict' : status
    return (
      <div key={key} className={`rp-step rp-step--${status} rp-step--${variant}`}>
        <span className={`rp-step-dot rp-step-dot--${variant}`} />
        <span className="rp-step-action" style={{ color: ACTION_COLORS[s.action] ?? '#8b949e' }}>
          {s.action}
        </span>
        <span className="rp-step-subject">{s.subject}</span>
        <span className="rp-step-spring" />
        {s.date && <span className="rp-step-date">{s.date}</span>}
        {s.shortHash && <code className="rp-step-hash">◈ {s.shortHash}</code>}
      </div>
    )
  }

  return (
    <div className="rp-page">
      <div className="rp-header">
        <div className="rp-header-top">
          <span className="rp-title">{t('rp.title')}</span>
        </div>
        <div className="rp-header-refs">
          <span className="rp-ref-chip">
            <span className="rp-ref-icon">⑂</span>{state.headName || t('rp.detachedHead')}
          </span>
          <span className="rp-ref-onto">onto</span>
          <span className="rp-ref-chip rp-ref-chip--commit">
            <span className="rp-ref-icon">◈</span>{state.ontoShort}
          </span>
          <span className="rp-header-spring" />
          <span className="rp-counter">{state.stepCurrent}/{state.stepTotal} commits</span>
        </div>
      </div>

      <div className="rp-progressbar">
        <div
          className="rp-progressbar-fill"
          style={{ width: `${state.stepTotal ? Math.round((state.stepCurrent / state.stepTotal) * 100) : 0}%` }}
        />
      </div>

      {current && (
        <div className={`rp-banner ${hasConflicts ? 'rp-banner--conflict' : ''}`}>
          <span className="rp-banner-icon">{hasConflicts ? '⚠️' : '⏸'}</span>
          <span className="rp-banner-text">
            {hasConflicts
              ? <>{t('rp.bannerConflictPre')}<code>{current.shortHash || state.stoppedSha?.slice(0, 7)}</code></>
              : <>{t('rp.bannerStoppedPre')}<code>{current.shortHash || state.stoppedSha?.slice(0, 7)}</code> — {pauseReason}</>}
          </span>
          {hasConflicts && (
            <button className="rp-banner-link" onClick={scrollToConflicts}>{t('rp.showConflicts')}</button>
          )}
          <span className="rp-banner-spring" />
          <span className="rp-banner-count">
            ({state.stepCurrent}/{state.stepTotal}) {t('rp.remaining', state.conflicts.length)}
          </span>
        </div>
      )}

      <div className="rp-steps">
        {doneSettled.map((s, i) => renderReadOnlyStep(s, `d${i}`, 'done'))}
        {current && renderReadOnlyStep(current, 'current', 'current')}
        {todoEdits.map((s, i) => {
          const msgGroup = messageGroupByLastIndex.get(i)
          const key = msgGroup ? groupKey(msgGroup) : ''
          return (
          <React.Fragment key={s.hash || `t${i}`}>
            <div
              className={`rp-step rp-step--editable ${dragOver === i ? 'drag-over' : ''}`}
              tabIndex={0}
              draggable={!!s.hash}
              onDragStart={() => handleDragStart(i)}
              onDragOver={e => handleDragOver(e, i)}
              onDrop={() => handleDrop(i)}
              onDragEnd={() => setDragOver(null)}
              onKeyDown={e => handleRowKeyDown(e, i)}
            >
              <span className="rp-step-drag" title={t('rp.dragTitle')}>⠿</span>
              {s.hash ? (
                <>
                  <select
                    className="rp-step-select"
                    value={EDITABLE_ACTIONS.includes(s.action as EditableAction) ? s.action : 'pick'}
                    onChange={e => setTodoAction(i, e.target.value as EditableAction)}
                    style={{ color: ACTION_COLORS[s.action] ?? '#e6edf3' }}
                  >
                    {EDITABLE_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <span className="rp-step-subject">{s.subject}</span>
                  <span className="rp-step-spring" />
                  {s.date && <span className="rp-step-date">{s.date}</span>}
                  <code className="rp-step-hash">◈ {s.shortHash}</code>
                </>
              ) : (
                <code className="rp-step-directive">{s.action}{s.subject ? ` ${s.subject}` : ''}</code>
              )}
            </div>
            {msgGroup && (
              <div className="rp-msg-editor">
                <span className="rp-msg-editor-label">
                  {t('rp.finalMessage', msgGroup.memberIndexes.length)}
                </span>
                <textarea
                  className="rp-msg-textarea"
                  value={groupMessages[key] ?? msgGroup.defaultMessage}
                  onChange={e => setGroupMessages(prev => ({ ...prev, [key]: e.target.value }))}
                  rows={3}
                  spellCheck={false}
                />
              </div>
            )}
          </React.Fragment>
          )
        })}
        {state.done.length === 0 && state.todo.length === 0 && (
          <div className="rp-empty">{t('rp.nonInteractive', state.stepCurrent, state.stepTotal)}</div>
        )}
      </div>

      {hasConflicts && (
        <div className="rp-conflicts-section" ref={conflictsRef}>
          <div className="rp-conflicts-header">
            <span className="rp-conflicts-title">
              {t('rp.conflictCount', state.conflicts.length)}
            </span>
          </div>
          <input
            className="rp-conflicts-filter"
            placeholder={t('rp.filterConflicts')}
            value={conflictFilter}
            onChange={e => setConflictFilter(e.target.value)}
          />
          <div className="rp-conflicts-list">
            {filteredConflicts.map(f => (
              <button key={f} className="rp-conflict-file" title={t('rp.openToResolve')} onClick={() => handleOpenConflict(f)}>
                <span className="rp-conflict-badge">!</span>
                <span className="rp-conflict-path">{f}</span>
                <span className="rp-conflict-spring" />
                <span className="rp-conflict-status">UU</span>
              </button>
            ))}
            {filteredConflicts.length === 0 && (
              <div className="rp-empty" style={{ padding: '12px 18px' }}>{t('rp.noMatch')}</div>
            )}
          </div>
        </div>
      )}

      {todoEdits.some(s => s.hash) && (
        <div className="rp-legend">
          <kbd>p</kbd>ick · <kbd>r</kbd>eword · <kbd>e</kbd>dit · <kbd>s</kbd>quash · <kbd>f</kbd>ixup · <kbd>d</kbd>rop · <kbd>alt</kbd>+<kbd>↑↓</kbd> {t('rp.legendMove')}
        </div>
      )}

      <div className="rp-footer">
        <button className="rp-btn rp-btn--abort" disabled={busy} onClick={handleAbort}>
          {t('rp.abort')}
        </button>
        <span className="rp-footer-spring" />
        <button className="rp-btn" disabled={busy} onClick={handleSkip} title={t('rp.skipTitle')}>
          {t('rp.skip')}
        </button>
        <button
          className="rp-btn rp-btn--continue"
          disabled={busy || hasConflicts}
          title={hasConflicts ? t('rp.continueTitleConflict') : 'git rebase --continue (Ctrl+Enter)'}
          onClick={handleContinue}
        >
          {busy ? '…' : t('rp.continue')}
        </button>
      </div>
    </div>
  )
}
