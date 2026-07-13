import React, { useState, useEffect, useRef } from 'react'
import './PushModal.css'
import { BranchInfo } from '../../types'
import { useLang } from '../../i18n/LanguageContext'

interface PushModalProps {
  currentBranch: string
  branches: BranchInfo[]
  onClose: () => void
  onSuccess: () => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
}

export default function PushModal({ currentBranch, branches, onClose, onSuccess, showToast }: PushModalProps) {
  const { t } = useLang()
  const [remotes, setRemotes] = useState<string[] | null>(null)
  const [remote, setRemote] = useState('')
  const [targetBranch, setTargetBranch] = useState(currentBranch)
  const [setUpstream, setSetUpstream] = useState(false)
  const [force, setForce] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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

  const branchesForRemote = remoteBranches.filter(b => b.remote === remote).map(b => b.branch)

  const handlePush = async () => {
    if (!targetBranch.trim() || !remote) return
    setPushing(true)
    setPushError(null)
    const r = await window.gitAPI.pushTo(remote, targetBranch.trim(), setUpstream, force)
    setPushing(false)
    if (r.success) {
      showToast(t('toast.pushOk', `${remote}/${targetBranch.trim()}`))
      onSuccess()
      onClose()
    } else {
      const firstLine = (r.error ?? '').split('\n').find(l => l.trim()) ?? r.error ?? 'Error'
      setPushError(firstLine)
    }
  }

  return (
    <div className="pm-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="pm-panel">
        <div className="pm-header">
          <span className="pm-title">{t('push.title')}</span>
          <button className="pm-close" onClick={onClose}>×</button>
        </div>

        <div className="pm-body">
          <div className="pm-row">
            <label className="pm-label">{t('push.localBranch')}</label>
            <span className="pm-branch-badge">{currentBranch}</span>
          </div>

          {remotes !== null && remotes.length === 0 ? (
            <div className="pm-no-remote">{t('push.noRemote')}</div>
          ) : (
            <>
              <div className="pm-row">
                <label className="pm-label">{t('push.remote')}</label>
                <select className="pm-select" value={remote} onChange={e => setRemote(e.target.value)}>
                  {(remotes ?? []).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div className="pm-row">
                <label className="pm-label">{t('push.targetBranch')}</label>
                <div className="pm-input-wrap">
                  <input ref={inputRef} className="pm-input" list="pm-branch-list"
                    value={targetBranch} onChange={e => setTargetBranch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handlePush(); if (e.key === 'Escape') onClose() }}
                    placeholder={t('push.targetBranch.placeholder')} />
                  <datalist id="pm-branch-list">
                    {branchesForRemote.map(b => <option key={b} value={b} />)}
                  </datalist>
                </div>
              </div>

              <label className="pm-checkbox-row">
                <input type="checkbox" checked={setUpstream} onChange={e => setSetUpstream(e.target.checked)} />
                <span>{t('push.setUpstream')}</span>
              </label>

              <label className="pm-checkbox-row">
                <input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} />
                <span>{t('push.force')}</span>
              </label>
              {force && <div className="pm-force-warn">{t('push.forceWarn')}</div>}

              {pushError && <div className="pm-error">{pushError}</div>}
            </>
          )}
        </div>

        <div className="pm-footer">
          <button className="pm-cancel" onClick={onClose}>{t('push.cancel')}</button>
          {(remotes === null || remotes.length > 0) && (
            <button className="pm-push" onClick={handlePush}
              disabled={pushing || !targetBranch.trim() || !remote}>
              {pushing ? t('push.pushing') : t('push.button', remote || '…', targetBranch || '…')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
