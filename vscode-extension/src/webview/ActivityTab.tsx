// ActivityTab.tsx — the activity chart, large: when work happened in this
// repository, and whose. A click on a bar shows the bar's newest commit in
// the panel's graph; the panel's own chart does the highlighting.
import React, { useEffect, useState } from 'react'
import ActivityChart from '../../../src/renderer/src/components/Activity/ActivityChart'
import type { ActivityPeriod, ActivityBucket } from '../../../src/renderer/src/components/Activity/activity'
import { useLang } from '../../../src/renderer/src/i18n/LanguageContext'

const PERIODS: ActivityPeriod[] = ['day', 'week', 'month']

export default function ActivityTab() {
  const { t } = useLang()
  const [data, setData] = useState<{ points: { at: number; author: string; hash: string }[]; truncated: boolean } | null>(null)
  const [period, setPeriod] = useState<ActivityPeriod>('week')
  const [repo, setRepo] = useState('')
  useEffect(() => {
    let stale = false
    const load = () => {
      window.gitAPI.getActivity().then(r => { if (!stale) setData(r) }).catch(() => { if (!stale) setData({ points: [], truncated: false }) })
      window.gitAPI.appGetInfo().then((i: any) => { if (!stale && i?.repoName) setRepo(i.repoName) }).catch(() => {})
    }
    load()
    const off = window.gitAPI.onRepoChanged(load)
    return () => { stale = true; off() }
  }, [])
  const pick = (b: ActivityBucket) => { if (b.hashes[0]) void window.gitAPI.revealInPanel(b.hashes[0]) }
  return (
    <div className="gva">
      <header className="gva-head">
        <div>
          <h1 className="gva-title">{t('activity.title')}{repo ? ` — ${repo}` : ''}</h1>
          <p className="gva-lede">{t('activity.lede')}</p>
        </div>
        <div className="sb-act-periods" role="radiogroup" aria-label={t('sb.activity')}>
          {PERIODS.map(p => (
            <button key={p} role="radio" aria-checked={period === p} className={`sb-act-period${period === p ? ' sb-act-period--on' : ''}`} onClick={() => setPeriod(p)}>
              {t(`activity.period.${p}` as 'activity.period.day')}
            </button>
          ))}
        </div>
      </header>
      {data ? <ActivityChart points={data.points} period={period} height={320} onPick={pick} /> : <div className="gva-loading">…</div>}
      {data?.truncated && <p className="gva-note">{t('activity.truncated')}</p>}
    </div>
  )
}
