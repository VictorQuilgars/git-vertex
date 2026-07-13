import React, { useState, useEffect } from 'react'
import './PRModal.css'
import { useLang } from '../../i18n/LanguageContext'

interface Props {
  owner: string
  repo: string
  currentBranch: string
  onClose: () => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
}

export default function PRModal({ owner, repo, currentBranch, onClose, showToast }: Props) {
  const { t } = useLang()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [base, setBase] = useState('main')
  const [branches, setBranches] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [createdUrl, setCreatedUrl] = useState<string | null>(null)
  const [createdNumber, setCreatedNumber] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Pre-fill title from last commit message
    window.gitAPI.getLastCommitMessage?.().then((r: any) => {
      if (r?.message) setTitle(r.message.split('\n')[0])
    })
    // Load remote branches for base selector
    ;(window.gitAPI as any).githubListBranches(owner, repo).then((r: any) => {
      const list: string[] = r.branches ?? []
      setBranches(list)
      const preferred = list.find(b => b === 'main') ?? list.find(b => b === 'master') ?? list[0]
      if (preferred) setBase(preferred)
    })
  }, [owner, repo])

  async function handleSubmit() {
    if (!title.trim()) return
    setSubmitting(true)
    setError(null)
    const r = await (window.gitAPI as any).githubCreatePR(owner, repo, title.trim(), body, currentBranch, base) as any
    setSubmitting(false)
    if (r.error) { setError(t('pr.error', r.error)); return }
    setCreatedUrl(r.url)
    setCreatedNumber(r.number)
    showToast(t('pr.success', r.number), 'ok')
  }

  return (
    <div className="pr-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pr-modal">
        <div className="pr-header">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354Z"/>
          </svg>
          <span className="pr-header-title">{t('pr.title')}</span>
          <div className="pr-repo-badge">{owner}/{repo}</div>
          <button className="pr-close" onClick={onClose}>×</button>
        </div>

        {createdUrl ? (
          <div className="pr-success">
            <svg width="32" height="32" viewBox="0 0 16 16" fill="#3fb950">
              <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/>
            </svg>
            <p className="pr-success-text">{t('pr.success', createdNumber!)}</p>
            <div className="pr-success-actions">
              <button className="pr-btn-primary" onClick={() => window.gitAPI.openExternal(createdUrl)}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
                </svg>
                {t('pr.openInBrowser')}
              </button>
              <button className="pr-btn-secondary" onClick={onClose}>Fermer</button>
            </div>
          </div>
        ) : (
          <div className="pr-body">
            {/* Branch row */}
            <div className="pr-branch-row">
              <div className="pr-branch-item">
                <span className="pr-branch-label">{t('pr.headLabel')}</span>
                <span className="pr-branch-value pr-branch-head">{currentBranch}</span>
              </div>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="#58a6ff">
                <path d="M8 9l3-3-3-3M5 6H2M14 6h-3"/>
                <path d="M2 6h12" strokeWidth="1.5" stroke="#58a6ff" fill="none"/>
              </svg>
              <div className="pr-branch-item">
                <span className="pr-branch-label">{t('pr.baseLabel')}</span>
                <select className="pr-branch-select" value={base} onChange={e => setBase(e.target.value)}>
                  {branches.length > 0
                    ? branches.filter(b => b !== currentBranch).map(b => <option key={b} value={b}>{b}</option>)
                    : <option value={base}>{base}</option>
                  }
                </select>
              </div>
            </div>

            {/* Title */}
            <div className="pr-field">
              <label className="pr-label">{t('pr.titleLabel')}</label>
              <input
                className="pr-input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={t('pr.titlePlaceholder')}
                autoFocus
              />
            </div>

            {/* Body */}
            <div className="pr-field">
              <label className="pr-label">{t('pr.bodyLabel')}</label>
              <textarea
                className="pr-textarea"
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder={t('pr.bodyPlaceholder')}
                rows={6}
              />
            </div>

            {error && <div className="pr-error">{error}</div>}

            <div className="pr-footer">
              <button className="pr-btn-secondary" onClick={onClose}>Annuler</button>
              <button
                className="pr-btn-primary"
                onClick={handleSubmit}
                disabled={submitting || !title.trim()}
              >
                {submitting ? t('pr.submitting') : t('pr.submit')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
