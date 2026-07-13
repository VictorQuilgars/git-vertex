import { useEffect, useState } from 'react'
import { useLang } from '../../i18n/LanguageContext'
import './StatusBar.css'

interface StatusBarProps {
  repoName: string
  branch: string
  ahead: number
  behind: number
  lastFetchTime?: Date | null
  loading?: boolean
  onFetch: () => void
}

const IcoBranch = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/>
  </svg>
)
const IcoSync = ({ spinning }: { spinning?: boolean }) => (
  <svg className={spinning ? 'sb-spin' : ''} width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z"/>
  </svg>
)

export default function StatusBar({ repoName, branch, ahead, behind, lastFetchTime, loading, onFetch }: StatusBarProps) {
  const { t } = useLang()
  const [zoom, setZoom] = useState(100)

  useEffect(() => {
    try {
      const z = (window.gitAPI as any).zoomGet?.()
      if (typeof z === 'number') setZoom(Math.round(z * 100))
    } catch { /* zoom unavailable */ }
  }, [])

  const applyZoom = (pct: number) => {
    const clamped = Math.min(200, Math.max(50, pct))
    try { (window.gitAPI as any).zoomSet?.(clamped / 100) } catch { /* ignore */ }
    setZoom(clamped)
  }

  const fetchLabel = (() => {
    if (!lastFetchTime) return null
    const diff = (Date.now() - lastFetchTime.getTime()) / 1000
    return diff < 60 ? t('toolbar.fetchedNow') : t('toolbar.fetchedAgo', Math.floor(diff / 60))
  })()

  if (!repoName) return null

  return (
    <div className="status-bar">
      <div className="sb-left">
        <span className="sb-repo">{repoName}</span>
        {branch && (
          <span className="sb-branch" title={branch}>
            <IcoBranch /> {branch}
          </span>
        )}
        {(ahead > 0 || behind > 0) && (
          <span className="sb-tracking">
            {ahead > 0 && <span className="sb-ahead" title={t('statusbar.ahead', ahead)}>↑{ahead}</span>}
            {behind > 0 && <span className="sb-behind" title={t('statusbar.behind', behind)}>↓{behind}</span>}
          </span>
        )}
      </div>

      <div className="sb-right">
        <button className="sb-fetch" onClick={onFetch} disabled={loading} title={t('toolbar.fetch.tooltip')}>
          <IcoSync spinning={loading} />
          {fetchLabel && <span className="sb-fetch-label">{fetchLabel}</span>}
        </button>
        <div className="sb-zoom">
          <button className="sb-zoom-btn" onClick={() => applyZoom(zoom - 10)} title="−">−</button>
          <button className="sb-zoom-val" onClick={() => applyZoom(100)} title={t('statusbar.zoomReset')}>{zoom}%</button>
          <button className="sb-zoom-btn" onClick={() => applyZoom(zoom + 10)} title="+">+</button>
        </div>
      </div>
    </div>
  )
}
