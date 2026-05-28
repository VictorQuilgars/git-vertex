import React, { useState, useEffect, useRef } from 'react'
import './PushModal.css'
import { BranchInfo } from '../../types'

interface PushModalProps {
  currentBranch: string
  branches: BranchInfo[]
  onClose: () => void
  onSuccess: () => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
}

export default function PushModal({ currentBranch, branches, onClose, onSuccess, showToast }: PushModalProps) {
  const [remotes, setRemotes] = useState<string[] | null>(null) // null = loading
  const [remote, setRemote] = useState('')
  const [targetBranch, setTargetBranch] = useState(currentBranch)
  const [setUpstream, setSetUpstream] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Extract unique remote names from branch list
  const remoteBranches = branches
    .filter(b => b.remote)
    .map(b => {
      const parts = b.name.replace(/^remotes\//, '').split('/')
      return { remote: parts[0], branch: parts.slice(1).join('/') }
    })
    .filter(b => b.branch && b.branch !== 'HEAD')

  useEffect(() => {
    window.gitAPI.getRemotes().then(r => {
      const names = (r.remotes ?? []).map((rem: { name: string }) => rem.name)
      setRemotes(names)
      if (names.length > 0) {
        const defaultRemote = names.includes('origin') ? 'origin' : names[0]
        setRemote(defaultRemote)
      }
    })
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const branchesForRemote = remoteBranches
    .filter(b => b.remote === remote)
    .map(b => b.branch)

  const handlePush = async () => {
    if (!targetBranch.trim() || !remote) return
    setPushing(true)
    setPushError(null)
    const r = await window.gitAPI.pushTo(remote, targetBranch.trim(), setUpstream)
    setPushing(false)
    if (r.success) {
      showToast(`Push réussi → ${remote}/${targetBranch.trim()} ✓`)
      onSuccess()
      onClose()
    } else {
      const firstLine = (r.error ?? '').split('\n').find(l => l.trim()) ?? r.error ?? 'Erreur inconnue'
      setPushError(firstLine)
    }
  }

  return (
    <div className="pm-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="pm-panel">
        <div className="pm-header">
          <span className="pm-title">⬆ Push</span>
          <button className="pm-close" onClick={onClose}>×</button>
        </div>

        <div className="pm-body">
          <div className="pm-row">
            <label className="pm-label">Branche locale</label>
            <span className="pm-branch-badge">{currentBranch}</span>
          </div>

          {remotes !== null && remotes.length === 0 ? (
            <div className="pm-no-remote">
              Aucun remote configuré dans ce dépôt.
            </div>
          ) : (
            <>
              <div className="pm-row">
                <label className="pm-label">Remote</label>
                <select
                  className="pm-select"
                  value={remote}
                  onChange={e => setRemote(e.target.value)}
                >
                  {(remotes ?? []).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div className="pm-row">
                <label className="pm-label">Branche cible</label>
                <div className="pm-input-wrap">
                  <input
                    ref={inputRef}
                    className="pm-input"
                    list="pm-branch-list"
                    value={targetBranch}
                    onChange={e => setTargetBranch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handlePush()
                      if (e.key === 'Escape') onClose()
                    }}
                    placeholder="nom de la branche distante"
                  />
                  <datalist id="pm-branch-list">
                    {branchesForRemote.map(b => <option key={b} value={b} />)}
                  </datalist>
                </div>
              </div>

              <label className="pm-checkbox-row">
                <input
                  type="checkbox"
                  checked={setUpstream}
                  onChange={e => setSetUpstream(e.target.checked)}
                />
                <span>Définir comme upstream (<code>--set-upstream</code>)</span>
              </label>

              {pushError && (
                <div className="pm-error">{pushError}</div>
              )}
            </>
          )}
        </div>

        <div className="pm-footer">
          <button className="pm-cancel" onClick={onClose}>Annuler</button>
          {(remotes === null || remotes.length > 0) && (
            <button
              className="pm-push"
              onClick={handlePush}
              disabled={pushing || !targetBranch.trim() || !remote}
            >
              {pushing ? 'Push en cours…' : `⬆ Push vers ${remote || '…'}/${targetBranch || '…'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
