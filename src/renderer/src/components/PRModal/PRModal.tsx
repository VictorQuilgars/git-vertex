import React, { useState, useEffect } from 'react'
import { Icon } from '../Icon/Icon'
import './PRModal.css'
import { useLang } from '../../i18n/LanguageContext'
import type { PRIntent } from '../ContextMenu/prIntent'
import { Brand } from '../BrandMark/BrandMark'

interface Props {
  owner: string
  repo: string
  /** Head, base and push-need, decided by prIntentFor — not re-derived here. */
  intent: PRIntent
  onClose: () => void
  /** The composer pushes before creating — the host reloads its branch state. */
  onPushed?: () => void
  /**
   * The request exists. The host reloads the list that should now contain it —
   * without this the app had to be told about its OWN write by a refresh, or
   * wait out a poll, which is the one case where waiting is indefensible.
   */
  onCreated?: (number: number) => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
}

export default function PRModal({ owner, repo, intent, onClose, onPushed, onCreated, showToast }: Props) {
  const { t } = useLang()
  const head = intent.head
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [base, setBase] = useState(intent.base ?? 'main')
  const [branches, setBranches] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [createdUrl, setCreatedUrl] = useState<string | null>(null)
  const [createdNumber, setCreatedNumber] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Cleared once the push has happened, so a retry after a GitHub error does
  // not push a second time.
  const [needsPush, setNeedsPush] = useState(intent.needsPush)

  useEffect(() => {
    // Prefill the title from the head branch's last commit — which is not
    // always HEAD: on the default branch the request runs from the branch you
    // right-clicked.
    window.gitAPI.getLastCommitMessage?.(head).then((r: any) => {
      if (r?.message) setTitle(r.message.split('\n')[0])
    })
    // Load remote branches for base selector
    ;(window.gitAPI as any).githubListBranches(owner, repo).then((r: any) => {
      const list: string[] = r.branches ?? []
      setBranches(list)
      // A base decided by the rules wins; only guess when they had no answer.
      if (intent.base) return
      const preferred = list.find(b => b === 'main') ?? list.find(b => b === 'master') ?? list[0]
      if (preferred) setBase(preferred)
    })
  }, [owner, repo, head, intent.base])

  async function handleSubmit() {
    if (!title.trim() || base === head) return
    setSubmitting(true)
    setError(null)

    // GitHub can only open a request on a branch it already holds, which is
    // why the menu row promises a push before the request.
    if (needsPush) {
      setPushing(true)
      const p = await window.gitAPI.pushBranch(head) as any
      setPushing(false)
      if (!p?.success) {
        setSubmitting(false)
        setError(t('pr.pushError', p?.error ?? ''))
        return
      }
      setNeedsPush(false)
      onPushed?.()
    }

    const r = await (window.gitAPI as any).githubCreatePR(owner, repo, title.trim(), body, head, base) as any
    setSubmitting(false)
    if (r.error) {
      setError(r.error === 'not_authenticated' ? t('pr.noAuth') : t('pr.error', r.error))
      return
    }
    setCreatedUrl(r.url)
    setCreatedNumber(r.number)
    showToast(t('pr.success', r.number), 'ok')
    onCreated?.(r.number)
  }

  return (
    <div className="pr-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pr-modal">
        <div className="pr-header">
          <Icon name="pullRequest" />
          <span className="pr-header-title">{t('pr.title')}</span>
          <div className="pr-repo-badge">{owner}/{repo}</div>
          <button className="pr-close" title={t('common.close')} onClick={onClose}>×</button>
        </div>

        {createdUrl ? (
          <div className="pr-success">
            <Icon name="check" size={32} />
            <p className="pr-success-text">{t('pr.success', createdNumber!)}</p>
            <div className="pr-success-actions">
              <button className="pr-btn-primary" onClick={() => window.gitAPI.openExternal(createdUrl)}>
                <Brand name="github" size={13} />
                {t('pr.openInBrowser')}
              </button>
              <button className="pr-btn-secondary" onClick={onClose}>{t('pr.close')}</button>
            </div>
          </div>
        ) : (
          <div className="pr-body">
            {/* Branch row */}
            <div className="pr-branch-row">
              <div className="pr-branch-item">
                <span className="pr-branch-label">{t('pr.headLabel')}</span>
                <span className="pr-branch-value pr-branch-head">{head}</span>
              </div>
              <Icon name="arrowRight" />
              <div className="pr-branch-item">
                <span className="pr-branch-label">{t('pr.baseLabel')}</span>
                <select className="pr-branch-select" value={base} onChange={e => setBase(e.target.value)}>
                  {/* A caller-supplied base may not be in the fetched list yet
                      (fresh branch, or no token) — keep it selectable anyway. */}
                  {branches.length > 0
                    ? Array.from(new Set([...branches, base]))
                        .filter(b => b !== head)
                        .map(b => <option key={b} value={b}>{b}</option>)
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

            {/* Say up front that submitting also pushes — the branch has to
                exist on the remote for GitHub to accept the PR at all. */}
            {needsPush && !error && <div className="pr-hint">{t('pr.willPush', head)}</div>}
            {base === head && <div className="pr-error">{t('pr.sameBranch')}</div>}
            {error && <div className="pr-error">{error}</div>}

            <div className="pr-footer">
              <button className="pr-btn-secondary" onClick={onClose}>{t('dlg.cancel')}</button>
              <button
                className="pr-btn-primary"
                onClick={handleSubmit}
                disabled={submitting || !title.trim() || base === head}
              >
                {pushing ? t('pr.pushing') : submitting ? t('pr.submitting') : t('pr.submit')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
