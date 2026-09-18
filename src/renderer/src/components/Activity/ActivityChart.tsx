// ActivityChart.tsx — the commits of a repository, as bars in time, stacked
// by author. Hover a bar and it says what it counts; click one and the
// caller gets its commits. The period (day / week / month) is the caller's
// to choose — this only draws.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLang } from '../../i18n/LanguageContext'
import { bucketize, topAuthors, bucketLabel, type ActivityPoint, type ActivityPeriod, type ActivityBucket } from './activity'
import './ActivityChart.css'

const LANES = 10

export default function ActivityChart({ points, period, height = 120, onPick, picked, now }: {
  points: ActivityPoint[]
  period: ActivityPeriod
  height?: number
  /** A bar was clicked: its commits, newest first, and its span. */
  onPick?: (bucket: ActivityBucket) => void
  /** The bucket whose commits the graph is showing, if any — drawn pressed. */
  picked?: number | null
  now?: number
}) {
  const { t } = useLang()
  const locale = t('graph.dateLocale')
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const buckets = useMemo(() => bucketize(points, period, undefined, now), [points, period, now])
  const authors = useMemo(() => topAuthors(buckets), [buckets])
  const max = Math.max(1, ...buckets.map(b => b.total))
  const w = width || 320
  const gap = 2
  const barW = Math.max(2, (w - gap * (buckets.length - 1)) / buckets.length)
  const plotH = height - 18   // the axis line of labels underneath
  const colour = (author: string) => `var(--lane-${(authors.indexOf(author) % LANES) + 1})`
  const every = Math.max(1, Math.ceil(buckets.length / Math.max(2, Math.floor(w / 64))))
  const total = buckets.reduce((n, b) => n + b.total, 0)

  return (
    <div className="ac" ref={wrapRef}>
      {total === 0 ? (
        <div className="ac-empty">{t('activity.empty')}</div>
      ) : (
        <svg className="ac-svg" width={w} height={height} role="img" aria-label={t('activity.aria', total)}>
          {buckets.map((b, i) => {
            const x = i * (barW + gap)
            const label = bucketLabel(b, period, locale)
            const shares = Object.entries(b.byAuthor).sort((p, q) => q[1] - p[1])
            const detail = shares.slice(0, 4).map(([a, n]) => `${a} ${n}`).join(', ')
            let y = plotH
            const parts = shares.map(([a, n]) => {
              const h = (n / max) * (plotH - 2)
              y -= h
              return { key: a, y, h, fill: authors.includes(a) ? colour(a) : 'var(--text-disabled)' }
            })
            return (
              <g key={b.start} className={`ac-bar${picked === b.start ? ' ac-bar--picked' : ''}${onPick && b.total > 0 ? ' ac-bar--live' : ''}`}
                tabIndex={onPick && b.total > 0 ? 0 : -1} role={onPick ? 'button' : undefined}
                aria-label={`${label}: ${t('activity.commits', b.total)}`}
                onClick={() => { if (onPick && b.total > 0) onPick(b) }}
                onKeyDown={e => { if (onPick && b.total > 0 && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPick(b) } }}>
                <title>{`${label} · ${t('activity.commits', b.total)}${detail ? ` · ${detail}` : ''}`}</title>
                {/* the whole column is the hit area, empty or not */}
                <rect className="ac-hit" x={x} y={0} width={barW} height={plotH} />
                {parts.map(pt => <rect key={pt.key} x={x} y={pt.y} width={barW} height={Math.max(1, pt.h)} fill={pt.fill} rx={1} />)}
                {i % every === 0 && (
                  <text className="ac-tick" x={x} y={height - 4}>{bucketLabel(b, period === 'week' ? 'day' : period, locale)}</text>
                )}
              </g>
            )
          })}
          <text className="ac-max" x={w} y={10} textAnchor="end">{max}</text>
        </svg>
      )}
      {authors.length > 0 && (
        <div className="ac-legend">
          {authors.map(a => <span key={a} className="ac-who"><i className="ac-swatch" style={{ background: colour(a) }} />{a}</span>)}
          {buckets.some(b => Object.keys(b.byAuthor).some(a => !authors.includes(a))) && (
            <span className="ac-who"><i className="ac-swatch ac-swatch--others" />{t('activity.others')}</span>
          )}
        </div>
      )}
    </div>
  )
}
