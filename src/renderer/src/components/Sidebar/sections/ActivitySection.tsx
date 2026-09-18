// Sidebar › activity: when work happened here, and whose — the commits as
// bars in time, stacked by author. A bar's commits are handed to the graph,
// which shows them and dims the rest; the same bar again shows everything.
// Reads its slice of the sidebar's state; the state itself lives in useSidebar.
import { useState } from 'react'
import { Icon } from '../../Icon/Icon'
import ActivityChart from '../../Activity/ActivityChart'
import type { ActivityPeriod, ActivityBucket } from '../../Activity/activity'
import { Section } from '../Section'
import type { SidebarState } from '../useSidebar'

const PERIOD_KEY = 'gv-sb-activity-period'
const PERIODS: ActivityPeriod[] = ['day', 'week', 'month']

export function ActivitySection({ s }: { s: SidebarState }) {
  const { activity, onShowCommits, onOpenActivityTab, single, t } = s
  const [period, setPeriod] = useState<ActivityPeriod>(() => {
    const saved = localStorage.getItem(PERIOD_KEY) as ActivityPeriod | null
    return saved && PERIODS.includes(saved) ? saved : 'week'
  })
  const [picked, setPicked] = useState<{ start: number; count: number } | null>(null)
  const clear = () => { setPicked(null); onShowCommits?.([]) }
  const choose = (p: ActivityPeriod) => { setPeriod(p); if (picked) clear(); try { localStorage.setItem(PERIOD_KEY, p) } catch { /* private window */ } }
  const pick = (b: ActivityBucket) => {
    if (!onShowCommits) return
    if (picked?.start === b.start) { clear(); return }
    setPicked({ start: b.start, count: b.hashes.length })
    onShowCommits(b.hashes)
  }
  const points = activity?.points ?? []
  return (
    <Section id="activity" title={t('sb.activity')} icon="activity" defaultOpen={single}>
      <div className="sb-act">
        <div className="sb-act-bar">
          <div className="sb-act-periods" role="radiogroup" aria-label={t('sb.activity')}>
            {PERIODS.map(p => (
              <button key={p} role="radio" aria-checked={period === p}
                className={`sb-act-period${period === p ? ' sb-act-period--on' : ''}`} onClick={() => choose(p)}>
                {t(`activity.period.${p}` as 'activity.period.day')}
              </button>
            ))}
          </div>
          {onOpenActivityTab && (
            <button className="sb-act-open" title={t('activity.openTab')} aria-label={t('activity.openTab')} onClick={onOpenActivityTab}>
              <Icon name="externalLink" size={12} />
            </button>
          )}
        </div>
        <ActivityChart points={points} period={period} height={104} onPick={onShowCommits ? pick : undefined} picked={picked?.start ?? null} />
        {picked && <div className="sb-act-note">{t('activity.picked', picked.count)}</div>}
        {activity?.truncated && <div className="sb-act-note">{t('activity.truncated')}</div>}
      </div>
    </Section>
  )
}
