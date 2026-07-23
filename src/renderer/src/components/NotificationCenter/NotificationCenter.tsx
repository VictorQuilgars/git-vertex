import { useLang } from '../../i18n/LanguageContext'
import './NotificationCenter.css'

// A single notification. Text is rendered from `kind` + `data` so it always
// follows the current language (rather than freezing the string at creation).
export interface AppNotification {
  id: string
  kind: 'update'
  data?: { version?: string }
  ts: number
  read: boolean
}

interface Props {
  notifications: AppNotification[]
  onClose: () => void
  onToggleRead: (id: string) => void
  onDelete: (id: string) => void
  onMarkAllRead: () => void
  onClearAll: () => void
  onActivate: (n: AppNotification) => void
}

function useRelativeTime() {
  const { t } = useLang()
  return (ts: number): string => {
    const diff = Math.max(0, Date.now() - ts)
    const min = Math.floor(diff / 60000)
    if (min < 1) return t('notifs.time.now')
    if (min < 60) return t('notifs.time.minutes', min)
    const hours = Math.floor(min / 60)
    if (hours < 24) return t('notifs.time.hours', hours)
    return t('notifs.time.days', Math.floor(hours / 24))
  }
}

export default function NotificationCenter({
  notifications, onClose, onToggleRead, onDelete, onMarkAllRead, onClearAll, onActivate,
}: Props) {
  const { t } = useLang()
  const relTime = useRelativeTime()
  const hasAny = notifications.length > 0
  const hasUnread = notifications.some(n => !n.read)

  const titleFor = (n: AppNotification) =>
    n.kind === 'update' ? t('notifs.update.title', n.data?.version ?? '') : ''
  const bodyFor = (n: AppNotification) =>
    n.kind === 'update' ? t('notifs.update.body') : ''

  return (
    <>
      <div className="notifs-backdrop" onClick={onClose} />
      <div className="notifs-panel" role="dialog" aria-label={t('notifs.title')}>
        <div className="notifs-head">
          <span className="notifs-head-title">{t('notifs.title')}</span>
          <div className="notifs-head-actions">
            <button className="notifs-head-btn" disabled={!hasUnread}
              onClick={onMarkAllRead}>{t('notifs.markAllRead')}</button>
            <button className="notifs-head-btn" disabled={!hasAny}
              onClick={onClearAll}>{t('notifs.clearAll')}</button>
          </div>
        </div>

        <div className="notifs-list">
          {!hasAny && <div className="notifs-empty">{t('notifs.empty')}</div>}
          {notifications.map(n => (
            <div key={n.id} className={`notifs-item ${n.read ? 'notifs-item--read' : ''}`}
              onClick={() => onActivate(n)}>
              {!n.read && <span className="notifs-item-unread" aria-hidden />}
              <div className="notifs-item-icon" aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <div className="notifs-item-body">
                <div className="notifs-item-meta">
                  <span className="notifs-item-app">{t('notifs.appName')}</span>
                  <span className="notifs-item-time">{relTime(n.ts)}</span>
                </div>
                <div className="notifs-item-title">{titleFor(n)}</div>
                {bodyFor(n) && <div className="notifs-item-text">{bodyFor(n)}</div>}
              </div>
              <div className="notifs-item-tools">
                <button className="notifs-item-tool"
                  title={n.read ? t('notifs.markUnread') : t('notifs.markRead')}
                  onClick={e => { e.stopPropagation(); onToggleRead(n.id) }}>
                  {n.read ? (
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                      <path d="m10.79 12.912-1.614-1.615a3.5 3.5 0 0 1-4.474-4.474l-2.06-2.06C.938 6.278 0 8 0 8s3 5.5 8 5.5a7.03 7.03 0 0 0 2.79-.588M5.21 3.088A7.03 7.03 0 0 1 8 2.5c5 0 8 5.5 8 5.5s-.939 1.721-2.641 3.238l-2.062-2.062a3.5 3.5 0 0 0-4.474-4.474z"/>
                      <path d="M5.525 7.646a2.5 2.5 0 0 0 2.829 2.829zm4.95.708-2.829-2.83a2.5 2.5 0 0 1 2.829 2.829zm3.171 6-12-12 .708-.708 12 12z"/>
                    </svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8M1.173 8a13 13 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5s3.879 1.168 5.168 2.457A13 13 0 0 1 14.828 8q-.086.13-.195.288c-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5s-3.879-1.168-5.168-2.457A13 13 0 0 1 1.172 8z"/>
                      <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0"/>
                    </svg>
                  )}
                </button>
                <button className="notifs-item-tool" title={t('notifs.delete')}
                  onClick={e => { e.stopPropagation(); onDelete(n.id) }}>
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/>
                    <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/>
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
