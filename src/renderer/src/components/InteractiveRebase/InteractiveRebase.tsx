import React, { useState, useEffect, useRef } from 'react'
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
}

const ACTIONS: RebaseAction[] = ['pick', 'reword', 'squash', 'fixup', 'drop']

const ACTION_COLORS: Record<RebaseAction, string> = {
  pick: '#3fb950',
  reword: '#58a6ff',
  squash: '#d2a8ff',
  fixup: '#ffa657',
  drop: '#f85149',
}

export default function InteractiveRebase({ baseHash, onClose, onSuccess, showToast }: InteractiveRebaseProps) {
  const [entries, setEntries] = useState<RebaseEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const dragIndex = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  useEffect(() => {
    window.gitAPI.getRebaseSequence(baseHash).then(r => {
      setEntries(r.commits.map(c => ({ ...c, action: 'pick' as RebaseAction })))
      setLoading(false)
    })
  }, [baseHash])

  const setAction = (i: number, action: RebaseAction) => {
    setEntries(prev => prev.map((e, idx) => idx === i ? { ...e, action } : e))
  }

  const handleDragStart = (i: number) => { dragIndex.current = i }

  const handleDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault()
    setDragOver(i)
  }

  const handleDrop = (targetIndex: number) => {
    const from = dragIndex.current
    if (from === null || from === targetIndex) { setDragOver(null); return }
    setEntries(prev => {
      const arr = [...prev]
      const [item] = arr.splice(from, 1)
      arr.splice(targetIndex, 0, item)
      return arr
    })
    dragIndex.current = null
    setDragOver(null)
  }

  const handleLaunch = async () => {
    // The first kept (non-drop) commit can't be squash/fixup — there's no
    // earlier commit in the range to fold it into ("cannot squash without a
    // previous commit"). Guard before launching to avoid a broken rebase todo.
    const firstKept = entries.find(e => e.action !== 'drop')
    if (firstKept && (firstKept.action === 'squash' || firstKept.action === 'fixup')) {
      showToast("Le premier commit conservé ne peut pas être « squash »/« fixup » — choisissez « pick » ou incluez un commit plus ancien.", 'err')
      return
    }
    setRunning(true)
    const sequence = entries.map(e => ({ action: e.action, hash: e.hash }))
    const r = await window.gitAPI.interactiveRebase(sequence)
    setRunning(false)
    if (r.success) {
      showToast('✓ Rebase interactif réussi')
      onSuccess()
      onClose()
    } else if ((r as { conflict?: boolean }).conflict) {
      // Rebase stopped on a conflict and is still in progress. Close the modal
      // and refresh so the conflict banner / resolver becomes visible.
      showToast(r.error ?? 'Conflit de rebase — résolvez puis continuez', 'err')
      onSuccess()
      onClose()
    } else {
      showToast(`Rebase échoué : ${r.error}`, 'err')
    }
  }

  return (
    <div className="ir-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="ir-panel">
        <div className="ir-header">
          <span className="ir-title">⚡ Interactive Rebase</span>
          <span className="ir-base">depuis <code>{baseHash.slice(0, 7)}</code></span>
          <button className="ir-close" onClick={onClose}>×</button>
        </div>

        <div className="ir-hint">
          Glissez pour réordonner · Changez l'action avec le menu déroulant
        </div>

        <div className="ir-list">
          {loading && <div className="ir-empty">Chargement…</div>}
          {!loading && entries.length === 0 && (
            <div className="ir-empty">Aucun commit à rebaser</div>
          )}
          {(() => { const firstKeptIndex = entries.findIndex(e => e.action !== 'drop'); return entries.map((entry, i) => (
            <div
              key={entry.hash}
              className={`ir-row ${dragOver === i ? 'drag-over' : ''}`}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={e => handleDragOver(e, i)}
              onDrop={() => handleDrop(i)}
              onDragEnd={() => setDragOver(null)}
            >
              <span className="ir-drag-handle" title="Glisser pour réordonner">⠿</span>
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
          )) })()}
        </div>

        <div className="ir-footer">
          <button className="ir-cancel" onClick={onClose}>Annuler</button>
          <button
            className="ir-launch"
            onClick={handleLaunch}
            disabled={running || entries.length === 0}
          >
            {running ? 'Rebase en cours…' : `⚡ Lancer le rebase (${entries.length} commits)`}
          </button>
        </div>
      </div>
    </div>
  )
}
