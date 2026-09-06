import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Icon } from '../Icon/Icon'
import { computeMessageGroups, MessageGroup } from '../../utils/rebaseMessageGroups'
import { useLang } from '../../i18n/LanguageContext'
import './InteractiveRebase.css'

type RebaseAction = 'pick' | 'reword' | 'squash' | 'fixup' | 'drop'

interface RebaseEntry {
  action: RebaseAction
  hash: string
  shortHash: string
  message: string
}

interface InteractiveRebaseProps {
  baseHash: string
  onClose: () => void
  onSuccess: () => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
  // Renders as a full-size tab/page (no dark backdrop, no centered card) —
  // used when this is opened as a tab (desktop "tool tab", VS Code editor
  // tab) instead of a modal overlay.
  embedded?: boolean
  // Agent-proposed plan (MCP propose_rebase_plan): per-commit actions and
  // squash/reword messages preloaded for the user to review — the rebase is
  // only launched when the user clicks the button, like any manual plan.
  // Hashes may be short prefixes; commits not listed keep "pick".
  initialPlan?: { hash: string; action: string; message?: string }[]
  /**
   * How many commits of the branch its upstream does not have. When the plan
   * rewrites more than that, some of what it rewrites is already published
   * and the branch will need a force push — said before the rebase, not
   * discovered at the push. Undefined = no upstream, or the host cannot tell.
   */
  unpushedCount?: number
}

const ACTIONS: RebaseAction[] = ['pick', 'reword', 'squash', 'fixup', 'drop']

const ACTION_COLORS: Record<RebaseAction, string> = {
  pick: 'var(--success)',
  reword: 'var(--accent)',
  squash: 'var(--purple-text)',
  fixup: 'var(--attention)',
  drop: 'var(--danger)',
}

// Composite key embedding a group's exact composition — when the plan
// changes (action toggled, drag-reordered) the key changes too, so a lookup
// naturally falls back to the fresh default instead of needing a sync effect.
const groupKey = (g: MessageGroup): string => `${g.leaderIndex}:${g.memberIndexes.join(',')}`

export default function InteractiveRebase({ baseHash, onClose, onSuccess, showToast, embedded, initialPlan, unpushedCount }: InteractiveRebaseProps) {
  const { t } = useLang()
  const [entries, setEntries] = useState<RebaseEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [fromPlan, setFromPlan] = useState(false)
  const dragIndex = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  // User-edited final message per squash/reword group, keyed by groupKey().
  const [groupMessages, setGroupMessages] = useState<Record<string, string>>({})

  useEffect(() => {
    window.gitAPI.getRebaseSequence(baseHash).then(r => {
      let list = r.commits.map(c => ({ ...c, action: 'pick' as RebaseAction }))
      if (initialPlan?.length) {
        // Match plan steps to commits by hash prefix (either side may be short).
        const stepFor = (hash: string) =>
          initialPlan.find(s => hash.startsWith(s.hash) || s.hash.startsWith(hash))
        list = list.map(e => {
          const step = stepFor(e.hash)
          return step && (ACTIONS as string[]).includes(step.action)
            ? { ...e, action: step.action as RebaseAction }
            : e
        })
        // Preload proposed messages onto the groups that will prompt for one,
        // keyed the same way the editor keys user edits.
        const gs = computeMessageGroups(list.map(e => ({ action: e.action, hash: e.hash, message: e.message })))
        const gm: Record<string, string> = {}
        for (const g of gs) {
          if (!g.needsMessage) continue
          const step = stepFor(list[g.leaderIndex].hash)
          if (step?.message) gm[groupKey(g)] = step.message
        }
        if (Object.keys(gm).length) setGroupMessages(gm)
        setFromPlan(true)
      }
      setEntries(list)
      setLoading(false)
    })
  }, [baseHash, initialPlan])

  const groups = useMemo(() =>
    computeMessageGroups(entries.map(e => ({ action: e.action, hash: e.hash, message: e.message }))),
    [entries])

  // Only groups needing a message actually prompt git's editor — index by
  // their last member row so the textarea renders right below that row.
  const messageGroupByLastIndex = useMemo(() => {
    const map = new Map<number, MessageGroup>()
    for (const g of groups) if (g.needsMessage) map.set(g.lastMemberIndex, g)
    return map
  }, [groups])

  const setAction = (i: number, action: RebaseAction) => {
    setEntries(prev => prev.map((e, idx) => idx === i ? { ...e, action } : e))
  }

  // The one reorder, for the mouse and the keyboard alike: the drop handler
  // and the arrow buttons both come here.
  const moveEntry = (from: number, to: number) => {
    setEntries(prev => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev
      const arr = [...prev]
      const [item] = arr.splice(from, 1)
      arr.splice(to, 0, item)
      return arr
    })
  }

  const handleDragStart = (i: number) => { dragIndex.current = i }

  const handleDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault()
    setDragOver(i)
  }

  const handleDrop = (targetIndex: number) => {
    const from = dragIndex.current
    if (from !== null && from !== targetIndex) moveEntry(from, targetIndex)
    dragIndex.current = null
    setDragOver(null)
  }

  // What the plan comes to, before it is launched: how many commits go in,
  // how many come out, and whether any of them is already on the upstream.
  const summary = useMemo(() => {
    const kept = entries.filter(e => e.action !== 'drop').length
    const folded = entries.filter(e => e.action === 'squash' || e.action === 'fixup').length
    const reworded = entries.filter(e => e.action === 'reword').length
    const published = unpushedCount === undefined ? 0 : Math.max(0, entries.length - unpushedCount)
    return { total: entries.length, resulting: kept - folded, folded, dropped: entries.length - kept, reworded, published }
  }, [entries, unpushedCount])

  const handleLaunch = async () => {
    // The first kept (non-drop) commit can't be squash/fixup — there's no
    // earlier commit in the range to fold it into ("cannot squash without a
    // previous commit"). Guard before launching to avoid a broken rebase todo.
    const firstKept = entries.find(e => e.action !== 'drop')
    if (firstKept && (firstKept.action === 'squash' || firstKept.action === 'fixup')) {
      showToast(t('ir.firstKept'), 'err')
      return
    }
    const needsMessageGroups = groups.filter(g => g.needsMessage)
    for (const g of needsMessageGroups) {
      const msg = groupMessages[groupKey(g)] ?? g.defaultMessage
      if (!msg.trim()) {
        showToast(t('rebase.emptyMsg'), 'err')
        return
      }
    }
    setRunning(true)
    const sequence = entries.map(e => ({ action: e.action, hash: e.hash }))
    const messages = needsMessageGroups.map(g => groupMessages[groupKey(g)] ?? g.defaultMessage)
    const r = await window.gitAPI.interactiveRebase(sequence, messages)
    setRunning(false)
    if (r.success) {
      showToast(t('ir.success'))
      onSuccess()
      onClose()
    } else if ((r as { conflict?: boolean }).conflict) {
      // Rebase stopped on a conflict and is still in progress. Close the modal
      // and refresh so the conflict banner / resolver becomes visible.
      showToast(r.error ?? t('ir.conflict'), 'err')
      onSuccess()
      onClose()
    } else {
      showToast(t('ir.failed', r.error ?? ''), 'err')
    }
  }

  return (
    <div
      className={embedded ? 'ir-page' : 'ir-overlay'}
      onMouseDown={embedded ? undefined : (e => e.target === e.currentTarget && onClose())}
    >
      <div className={embedded ? 'ir-panel ir-panel--embedded' : 'ir-panel'}>
        <div className="ir-header">
          <span className="ir-title"><Icon name="rebase" size={16} /> Interactive Rebase</span>
          <span className="ir-base">{t('ir.from')} <code>{baseHash.slice(0, 7)}</code></span>
          <button className="ir-close" title={t('common.close')} onClick={onClose}>×</button>
        </div>

        <div className="ir-hint">
          {t('ir.hint')}
        </div>

        {fromPlan && (
          <div className="ir-plan-banner">
            {t('ir.planBanner')}
          </div>
        )}

        <div className="ir-list">
          {loading && <div className="ir-empty">{t('common.loading')}</div>}
          {!loading && entries.length === 0 && (
            <div className="ir-empty">{t('ir.noCommits')}</div>
          )}
          {(() => { const firstKeptIndex = entries.findIndex(e => e.action !== 'drop'); return entries.map((entry, i) => {
            const msgGroup = messageGroupByLastIndex.get(i)
            const key = msgGroup ? groupKey(msgGroup) : ''
            return (
            <React.Fragment key={entry.hash}>
              <div
                className={`ir-row ${dragOver === i ? 'drag-over' : ''}`}
                draggable
                tabIndex={0}
                onDragStart={() => handleDragStart(i)}
                onDragOver={e => handleDragOver(e, i)}
                onDrop={() => handleDrop(i)}
                onDragEnd={() => setDragOver(null)}
                // Alt+arrows move the row itself; only when the row has the
                // focus, so the select inside keeps its own Alt+Down.
                onKeyDown={e => {
                  if (e.target !== e.currentTarget || !e.altKey) return
                  if (e.key === 'ArrowUp') { e.preventDefault(); moveEntry(i, i - 1) }
                  if (e.key === 'ArrowDown') { e.preventDefault(); moveEntry(i, i + 1) }
                }}
              >
                <span className="ir-drag-handle" title={t('ir.dragHandle')}>⠿</span>
                <span className="ir-move">
                  <button className="ir-move-btn ir-move-btn--up" title={t('ir.moveUp')} aria-label={t('ir.moveUp')}
                    disabled={i === 0} onClick={() => moveEntry(i, i - 1)}>
                    <Icon name="chevronDown" size={10} />
                  </button>
                  <button className="ir-move-btn" title={t('ir.moveDown')} aria-label={t('ir.moveDown')}
                    disabled={i === entries.length - 1} onClick={() => moveEntry(i, i + 1)}>
                    <Icon name="chevronDown" size={10} />
                  </button>
                </span>
                <select
                  className="ir-action-select"
                  value={entry.action}
                  onChange={e => setAction(i, e.target.value as RebaseAction)}
                  style={{ color: ACTION_COLORS[entry.action] }}
                >
                  {ACTIONS.map(a => (
                    // squash/fixup need an earlier kept commit to fold into —
                    // disable them on the first kept row.
                    <option key={a} value={a}
                      disabled={i === firstKeptIndex && (a === 'squash' || a === 'fixup')}>
                      {a}
                    </option>
                  ))}
                </select>
                <code className="ir-hash">{entry.shortHash}</code>
                <span className="ir-msg">{entry.message}</span>
              </div>
              {msgGroup && (
                <div className="ir-msg-editor">
                  <span className="ir-msg-editor-label">
                    {t('ir.finalMessage', msgGroup.memberIndexes.length)}
                  </span>
                  <textarea
                    className="ir-msg-textarea"
                    value={groupMessages[key] ?? msgGroup.defaultMessage}
                    onChange={e => setGroupMessages(prev => ({ ...prev, [key]: e.target.value }))}
                    rows={3}
                    spellCheck={false}
                  />
                </div>
              )}
            </React.Fragment>
            )
          }) })()}
        </div>

        {!loading && entries.length > 0 && (
          <div className="ir-summary" role="status">
            <span>{t('ir.summary', summary.total, summary.resulting, summary.folded, summary.dropped, summary.reworded)}</span>
            {summary.published > 0 && (
              <span className="ir-summary-warn">{t('ir.published', summary.published)}</span>
            )}
          </div>
        )}

        <div className="ir-footer">
          <button className="ir-cancel" onClick={onClose}>{t('ir.cancel')}</button>
          <button
            className="ir-launch"
            onClick={handleLaunch}
            disabled={running || entries.length === 0}
          >
            {running ? t('ir.running') : t('ir.start', entries.length)}
          </button>
        </div>
      </div>
    </div>
  )
}
