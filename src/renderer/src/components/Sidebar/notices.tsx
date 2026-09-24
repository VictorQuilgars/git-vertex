// What a side bar view shows in place of its list when there is no list to
// show: a load that failed (#277). A sentence, what went wrong when there is
// something to quote, and what fixes it — never a blank view.
import { Icon } from '../Icon/Icon'
import type { SidebarState } from './useSidebar'

export interface NoticeAction { label: string; onClick: () => void }

export function SbNotice({ tone, text, detail, actions }: {
  tone: 'err' | 'info'
  text: string
  /** Quoted as it came — git's sentence, or the server's. */
  detail?: string
  actions: NoticeAction[]
}) {
  return (
    <div className={`sb-notice sb-notice--${tone}`} role={tone === 'err' ? 'alert' : 'status'}>
      <div className="sb-notice-text">
        <Icon name={tone === 'err' ? 'conflict' : 'info'} size={12} />
        <span>{text}</span>
      </div>
      {detail && <code className="sb-notice-detail">{detail}</code>}
      {actions.length > 0 && (
        <div className="sb-notice-actions">
          {actions.map(a => (
            <button key={a.label} type="button" className="sb-notice-btn" onClick={a.onClick}>{a.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

/** A list the side bar reads for itself, and its load refused (#277). */
export function LoadError({ error, onRetry, t }: {
  error: string
  onRetry: () => void
  t: SidebarState['t']
}) {
  return <SbNotice tone="err" text={t('sb.load.failed')} detail={error}
    actions={[{ label: t('sb.load.retry'), onClick: onRetry }]} />
}
