import { useLang } from '../../i18n/LanguageContext'
import { Icon } from '../Icon/Icon'
import type { JournalEntry } from '../../contexts/JournalContext'
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
  /** What happened to the repository on screen — #193. Errors first. */
  journal: JournalEntry[]
  /** Which repository that journal is of, for its heading. */
  repoName: string
  onClose: () => void
  onToggleRead: (id: string) => void
  onDelete: (id: string) => void
  onMarkAllRead: () => void
  onClearAll: () => void
  onActivate: (n: AppNotification) => void
  onDropEntry: (id: number) => void
  onClearJournal: () => void
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

const JOURNAL_ICON = { err: 'conflict', ok: 'check', info: 'info' } as const

/**
 * The bell, which is now two things rather than one.
 *
 * **Notifications** are about the app — an update is available. They are read
 * or unread, they survive a restart, and you delete them when you are done.
 *
 * **The journal** is about the repository on screen: every operation the app
 * reported on, with what it said, for the session (#193). It is not a list of
 * things to dismiss — it is what you go back to when the chip that said the
 * push failed has been pushed off the stack by four fetches. So it has no
 * read/unread per line: opening the bell marks its errors seen, which is what
 * the badge counts, and the only per-line control is removing one you are done
 * with.
 */
export default function NotificationCenter({
  notifications, journal, repoName, onClose, onToggleRead, onDelete,
  onMarkAllRead, onClearAll, onActivate, onDropEntry, onClearJournal,
}: Props) {
  const { t } = useLang()
  const relTime = useRelativeTime()
  const hasAny = notifications.length > 0
  const hasUnread = notifications.some(n => !n.read)
  const hasJournal = journal.length > 0

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
          {!hasAny && !hasJournal && <div className="notifs-empty">{t('notifs.empty')}</div>}
          {notifications.map(n => (
            <div key={n.id} className={`notifs-item ${n.read ? 'notifs-item--read' : ''}`}
              onClick={() => onActivate(n)}>
              {!n.read && <span className="notifs-item-unread" aria-hidden />}
              <div className="notifs-item-icon" aria-hidden>
                <Icon name="download" />
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
                    <Icon name="eyeOff" size={15} />
                  ) : (
                    <Icon name="eye" size={15} />
                  )}
                </button>
                <button className="notifs-item-tool" title={t('notifs.delete')}
                  onClick={e => { e.stopPropagation(); onDelete(n.id) }}>
                  <Icon name="trash" size={15} />
                </button>
              </div>
            </div>
          ))}

          {hasJournal && (
            <div className="notifs-group">
              <span className="notifs-group-title">
                {t('notifs.journal.title', repoName || t('notifs.journal.noRepo'))}
              </span>
              <button className="notifs-head-btn" onClick={onClearJournal}>
                {t('notifs.clearAll')}
              </button>
            </div>
          )}
          {journal.map(e => (
            <div key={e.id} className={`notifs-item notifs-item--journal notifs-item--${e.type}`}>
              <div className="notifs-item-icon" aria-hidden>
                <Icon name={JOURNAL_ICON[e.type]} size={16} />
              </div>
              <div className="notifs-item-body">
                <div className="notifs-item-meta">
                  {/* The repository is named on every line, not only in the
                      heading: with sessions an entry can have been written
                      while another tab was on screen. */}
                  <span className="notifs-item-app">
                    {e.repoPath ? e.repoPath.split('/').pop() : t('notifs.journal.noRepo')}
                  </span>
                  <span className="notifs-item-time">{relTime(e.ts)}</span>
                </div>
                <div className="notifs-item-title">
                  {e.message}
                  {e.count > 1 && <span className="notifs-item-count">×{e.count}</span>}
                </div>
              </div>
              <div className="notifs-item-tools">
                <button className="notifs-item-tool" title={t('notifs.delete')}
                  onClick={() => onDropEntry(e.id)}>
                  <Icon name="trash" size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
