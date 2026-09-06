import { useEffect, useState } from 'react'
import { Icon } from '../Icon/Icon'
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
  /** How many commits the graph holds — a page of history, not the repository. */
  commitCount?: number
  /** The page was full, so there is very likely more. */
  historyTruncated?: boolean
  onLoadMore?: () => void
}

const IcoBranch = () => (
  <Icon name="branch" size={12} />
)
const IcoSync = ({ spinning }: { spinning?: boolean }) => (
  <Icon name="refresh" size={12} className={spinning ? 'sb-spin' : ''} />
)

export default function StatusBar({ repoName, branch, ahead, behind, lastFetchTime, loading, onFetch, commitCount, historyTruncated, onLoadMore }: StatusBarProps) {
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
        {/* The graph's scope, said where the eye goes to check it: a search
            that finds nothing found nothing in THESE commits. */}
        {commitCount !== undefined && commitCount > 0 && (
          <span className="sb-history" title={t('statusbar.historyScope')}>
            <span>{t('statusbar.commitsLoaded', commitCount)}</span>
            {historyTruncated && onLoadMore && (
              <button className="sb-history-more" onClick={onLoadMore} disabled={loading}>
                {t('statusbar.loadMore', 500)}
              </button>
            )}
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
