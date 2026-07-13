import React, { useEffect, useState, useCallback } from 'react'
import { useLang } from '../../i18n/LanguageContext'
import './GitflowModal.css'

interface GitflowStatus {
  initialized: boolean
  mainBranch: string
  features: string[]
  releases: string[]
  hotfixes: string[]
}

type FlowType = 'feature' | 'release' | 'hotfix'

interface GitflowModalProps {
  onClose: () => void
  onSuccess: () => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
  showPrompt: (msg: string, defaultValue?: string) => Promise<string | null>
  showConfirm: (msg: string, danger?: boolean) => Promise<boolean>
}

const COLORS: Record<FlowType, string> = {
  feature: '#58a6ff',
  release: '#3fb950',
  hotfix: '#f85149',
}

export default function GitflowModal({ onClose, onSuccess, showToast, showPrompt, showConfirm }: GitflowModalProps) {
  const { t } = useLang()
  const [status, setStatus] = useState<GitflowStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    const s = await window.gitAPI.gitflowStatus()
    setStatus(s)
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  const handleInit = async () => {
    setBusy(true)
    const r = await window.gitAPI.gitflowInit()
    setBusy(false)
    if (r.success) { showToast(t('gitflow.toast.init')); await reload(); onSuccess() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }

  const handleStart = async (type: FlowType) => {
    const name = await showPrompt(t('gitflow.prompt.startName', type))
    if (!name) return
    setBusy(true)
    const r = await window.gitAPI.gitflowStart(type, name.trim())
    setBusy(false)
    if (r.success) { showToast(t('gitflow.toast.started', type, name.trim())); await reload(); onSuccess() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }

  const handleFinish = async (type: FlowType, name: string) => {
    const ok = await showConfirm(t('gitflow.prompt.finish', type, name))
    if (!ok) return
    let tagName: string | undefined
    if (type === 'release' || type === 'hotfix') {
      const tag = await showPrompt(t('gitflow.prompt.tag'), name)
      tagName = tag && tag.trim() ? tag.trim() : undefined
    }
    setBusy(true)
    const r = await window.gitAPI.gitflowFinish(type, name, tagName)
    setBusy(false)
    if (r.success) { showToast(t('gitflow.toast.finished', type, name)); await reload(); onSuccess() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }

  const column = (type: FlowType, items: string[]) => (
    <div className="gf-col">
      <div className="gf-col-header" style={{ color: COLORS[type] }}>
        {t(`gitflow.col.${type}`)}
      </div>
      <div className="gf-list">
        {items.length === 0 && <div className="gf-empty">{t('gitflow.none')}</div>}
        {items.map(name => (
          <div key={name} className="gf-row">
            <span className="gf-branch" style={{ borderColor: COLORS[type] }}>{type}/{name}</span>
            <button className="gf-finish-btn" disabled={busy} onClick={() => handleFinish(type, name)}>
              {t('gitflow.finish')}
            </button>
          </div>
        ))}
      </div>
      <button className="gf-start-btn" disabled={busy} onClick={() => handleStart(type)}
        style={{ borderColor: COLORS[type], color: COLORS[type] }}>
        + {t('gitflow.start')}
      </button>
    </div>
  )

  return (
    <div className="gf-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="gf-modal">
        <div className="gf-head">
          <span className="gf-title">⑂ Gitflow</span>
          <button className="gf-close" onClick={onClose}>×</button>
        </div>

        {loading ? (
          <div className="gf-loading">{t('gitflow.loading')}</div>
        ) : !status?.initialized ? (
          <div className="gf-init">
            <p>{t('gitflow.notInit')}</p>
            <button className="gf-init-btn" disabled={busy} onClick={handleInit}>
              {t('gitflow.initBtn')}
            </button>
          </div>
        ) : (
          <>
            <div className="gf-sub">
              {t('gitflow.mainBranch')} <code>{status.mainBranch}</code> · <code>develop</code>
            </div>
            <div className="gf-grid">
              {column('feature', status.features)}
              {column('release', status.releases)}
              {column('hotfix', status.hotfixes)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
