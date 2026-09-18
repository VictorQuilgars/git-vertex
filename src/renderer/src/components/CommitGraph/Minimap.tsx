// Minimap.tsx — the strip above the graph: the loaded history as activity day
// by day, newest on the left, with where the branches and tags are, which
// stretch the graph is showing, and which days the search matched.
//
// It is a way around the graph, not a chart to read on its own: a click goes
// to that day's commit, the wheel scrolls the graph, a drag zooms the strip to
// the days it covers. The whole strip can be hidden — from its own menu, the
// toolbar, the graph's header menu or the settings — and comes back the same.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLang } from '../../i18n/LanguageContext'
import { useSettings } from '../../contexts/SettingsContext'
import { Icon } from '../Icon/Icon'
import ContextMenu, { type MenuItemDef } from '../ContextMenu/ContextMenu'
import { remoteOf } from '../../utils/graphVisibility'
import { fmtRelative } from './graph-parts'
import {
  buildModel, dayOf, yScale, monotonePath, nearestBusyDay,
  DAY_MS, MARKER_OPTIONS, DEFAULT_MARKERS,
  type MinimapCommit, type MinimapDataType, type MinimapMarkerOption, type MinimapMarker,
} from './minimap-model'
import './Minimap.css'

/** The strip's height. The stylesheet says the same (`.cg-mm`). */
export const MINIMAP_H = 40
const TOP = 7            // room for the HEAD triangle
const MARKER_LANE = 7    // the branch and tag ticks along the bottom
const GUTTER = 24        // the options button, right of the chart
const DRAG_SLOP = 6      // px of movement before a press becomes a drag
const MIN_ZOOM_DAYS = 7

export interface MinimapProps {
  commits: MinimapCommit[]
  headHash?: string
  upstreamHash?: string
  /** The hashes the current search matches, or null when nothing is searched. */
  matches: Set<string> | null
  /** The newest and oldest day the graph has on screen. */
  visible: { newest: number; oldest: number } | null
  selectedHash: string | null
  remoteNames?: string[]
  /** A day was clicked: the commit to go to. */
  onPick: (hash: string) => void
  /** The wheel over the strip, handed to the graph. */
  onWheel?: (deltaY: number) => void
  onHide: () => void
}

export default function Minimap(props: MinimapProps) {
  const { commits, headHash, upstreamHash, matches, visible, selectedHash, remoteNames, onPick, onWheel, onHide } = props
  const { t } = useLang()
  const { get, getBool, set } = useSettings()
  const locale = t('graph.dateLocale')
  const dataType: MinimapDataType = get('graphMinimapData', 'commits') === 'lines' ? 'lines' : 'commits'
  const reversed = getBool('graphMinimapReversed', false)
  const markerSetting = get('graphMinimapMarkers', DEFAULT_MARKERS.join(','))
  const markerKinds = useMemo(
    () => new Set(markerSetting.split(',').filter((k): k is MinimapMarkerOption => (MARKER_OPTIONS as string[]).includes(k))),
    [markerSetting])

  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const model = useMemo(
    () => buildModel(commits, { remoteOf: ref => remoteOf(ref, remoteNames ?? []), matches }),
    [commits, remoteNames, matches])

  // Zoom: the days a drag covered, newest and oldest. Dropped when the history
  // it points at is no longer loaded.
  const [zoom, setZoom] = useState<{ newest: number; oldest: number } | null>(null)
  const zoomed = useMemo(
    () => zoom ? model.days.filter(d => d <= zoom.newest && d >= zoom.oldest) : null, [zoom, model])
  const days = zoomed && zoomed.length > 0 ? zoomed : model.days
  const isZoomed = days !== model.days
  const indexOf = useMemo(() => new Map(days.map((d, i) => [d, i])), [days])

  const chartW = Math.max(0, width - GUTTER)
  const slot = days.length > 0 ? chartW / days.length : 0
  const base = MINIMAP_H - MARKER_LANE - 1
  const areaH = base - TOP
  const xOf = useCallback((i: number) => {
    const x = (i + 0.5) * slot
    return reversed ? chartW - x : x
  }, [slot, reversed, chartW])
  const indexAt = useCallback((x: number) => {
    if (slot === 0) return -1
    const local = reversed ? chartW - x : x
    return Math.min(days.length - 1, Math.max(0, Math.floor(local / slot)))
  }, [slot, reversed, chartW, days.length])

  const value = useCallback((day: number) => {
    const d = model.byDay.get(day)
    return d ? (dataType === 'lines' ? d.lines : d.commits) : 0
  }, [model, dataType])
  const yMax = useMemo(() => yScale(days.map(value)), [days, value])
  const yOf = useCallback((v: number) => base - (Math.min(v, yMax) / yMax) * areaH, [base, areaH, yMax])

  const { line, area } = useMemo(() => {
    if (days.length === 0 || slot === 0) return { line: '', area: '' }
    const pts = days.map((d, i) => [xOf(i), yOf(value(d))] as const)
    if (reversed) pts.reverse()   // left to right, whichever way time runs
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
    const l = monotonePath(xs, ys)
    return { line: l, area: `${l}L${xs[xs.length - 1]},${base}L${xs[0]},${base}Z` }
  }, [days, slot, xOf, yOf, value, reversed, base])

  const headDay = useMemo(() => {
    const c = headHash ? commits.find(x => x.hash === headHash) : undefined
    return c ? dayOf(new Date(c.date).getTime()) : null
  }, [commits, headHash])
  const upstreamDay = useMemo(() => {
    const c = upstreamHash ? commits.find(x => x.hash === upstreamHash) : undefined
    return c ? dayOf(new Date(c.date).getTime()) : null
  }, [commits, upstreamHash])
  const selectedDay = useMemo(() => {
    const c = selectedHash ? commits.find(x => x.hash === selectedHash) : undefined
    return c ? dayOf(new Date(c.date).getTime()) : null
  }, [commits, selectedHash])

  // ── Pointer: hover, click, drag-to-zoom ──
  const [hover, setHover] = useState<{ day: number; x: number } | null>(null)
  const press = useRef<{ x: number; id: number } | null>(null)
  const [brush, setBrush] = useState<{ x0: number; x1: number } | null>(null)
  const localX = (e: React.PointerEvent | React.MouseEvent) => {
    const r = wrapRef.current?.getBoundingClientRect()
    return r ? e.clientX - r.left : 0
  }
  // A day on a long history can be narrower than a pixel: the pointer means
  // the busiest nearby day rather than the empty one it happens to be over.
  const reach = slot > 0 ? Math.ceil(4 / slot) : 0
  const dayNear = (x: number) => {
    if (x < 0 || x > chartW) return null
    const i = indexAt(x)
    return i < 0 ? null : nearestBusyDay(model, days, i, reach) ?? days[i] ?? null
  }
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || localX(e) > chartW) return
    press.current = { x: localX(e), id: e.pointerId }
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const x = localX(e)
    const p = press.current
    if (p && (brush || Math.abs(x - p.x) > DRAG_SLOP)) {
      setBrush({ x0: p.x, x1: Math.max(0, Math.min(chartW, x)) })
      setHover(null)
      return
    }
    const day = dayNear(x)
    setHover(day === null ? null : { day, x: xOf(indexOf.get(day) ?? 0) })
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const p = press.current
    press.current = null
    ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
    if (!p) return
    if (brush) {
      const a = indexAt(Math.min(brush.x0, brush.x1)), b = indexAt(Math.max(brush.x0, brush.x1))
      setBrush(null)
      let lo = Math.min(a, b), hi = Math.max(a, b)
      // Never narrower than a week: a zoom of one day is a single dot.
      while (hi - lo + 1 < MIN_ZOOM_DAYS && (lo > 0 || hi < days.length - 1)) {
        if (lo > 0) lo--
        if (hi - lo + 1 < MIN_ZOOM_DAYS && hi < days.length - 1) hi++
      }
      if (days[lo] !== undefined && days[hi] !== undefined) setZoom({ newest: days[lo], oldest: days[hi] })
      return
    }
    const day = dayNear(localX(e))
    const hash = day !== null ? model.byDay.get(day)?.hashes[0] : undefined
    if (hash) onPick(hash)
  }
  const onPointerLeave = () => { if (!press.current) setHover(null) }

  // ── The options menu ──
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const toggleMarker = (k: MinimapMarkerOption) => {
    const next = new Set(markerKinds)
    if (next.has(k)) next.delete(k); else next.add(k)
    set('graphMinimapMarkers', MARKER_OPTIONS.filter(o => next.has(o)).join(','))
  }
  const menuItems: MenuItemDef[] = [
    { label: t('minimap.commits'), checked: dataType === 'commits', action: () => set('graphMinimapData', 'commits') },
    { label: t('minimap.lines'), checked: dataType === 'lines', action: () => set('graphMinimapData', 'lines') },
    { separator: true },
    { label: t('minimap.reverse'), checked: reversed, action: () => set('graphMinimapReversed', reversed ? 'false' : 'true') },
    { label: t('minimap.markers'), submenu: MARKER_OPTIONS.map(k => ({
      label: t(`minimap.marker.${k}` as 'minimap.marker.local'), checked: markerKinds.has(k), action: () => toggleMarker(k),
    })) },
    { separator: true },
    { label: t('minimap.hide'), icon: 'eyeOff', action: onHide },
  ]

  // ── What is drawn ──
  const band = useMemo(() => {
    if (!visible) return null
    // Days outside a zoom slide off the edge rather than vanishing.
    const i0 = indexOf.get(visible.newest) ?? (visible.newest > days[0] ? -1 : days.length)
    const i1 = indexOf.get(visible.oldest) ?? (visible.oldest < days[days.length - 1] ? days.length : -1)
    const a = xOf(i0), b = xOf(i1)
    const left = Math.max(0, Math.min(a, b) - slot / 2), right = Math.min(chartW, Math.max(a, b) + slot / 2)
    return right > left ? { x: left, w: right - left } : null
  }, [visible, indexOf, days, xOf, slot, chartW])

  const marks = useMemo(() => {
    const out: { key: string; x: number; kind: MinimapMarker['kind'] }[] = []
    days.forEach((day, i) => {
      const seen = new Set<string>()
      for (const m of model.byDay.get(day)?.markers ?? []) {
        const kind = m.kind === 'head' ? 'local' : m.kind
        if (!markerKinds.has(kind) || seen.has(kind)) continue
        seen.add(kind)
        out.push({ key: `${day}-${kind}`, x: xOf(i), kind })
      }
    })
    // The tall ticks first, so a short one on the same day is drawn over them.
    const tall = (k: MinimapMarker['kind']) => k === 'local' || k === 'stash'
    return [...out.filter(m => tall(m.kind)), ...out.filter(m => !tall(m.kind))]
  }, [days, model, markerKinds, xOf])

  const tickW = Math.max(2, Math.min(slot, 3))
  const hoverInfo = hover ? model.byDay.get(hover.day) : undefined

  return (
    <div className="cg-mm" ref={wrapRef}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onPointerCancel={() => { press.current = null; setBrush(null) }}
      onPointerLeave={onPointerLeave}
      onDoubleClick={() => setZoom(null)}
      onWheel={e => onWheel?.(e.deltaY)}>
      {width > 0 && (
        <svg className="cg-mm-svg" width={chartW} height={MINIMAP_H} role="img" aria-label={t('minimap.aria')}>
          {band && <rect className="cg-mm-band" x={band.x} y={0} width={band.w} height={MINIMAP_H} />}
          {matches && days.map((day, i) => (model.byDay.get(day)?.matches ?? 0) > 0 && (
            <rect key={`m-${day}`} className="cg-mm-match" x={xOf(i) - tickW / 2} y={TOP} width={tickW} height={areaH} />
          ))}
          {area && <path className="cg-mm-area" d={area} />}
          {line && <path className="cg-mm-line" d={line} />}
          {marks.map(m => (
            <rect key={m.key} className={`cg-mm-mark cg-mm-mark--${m.kind}`}
              x={m.x - tickW / 2} width={tickW}
              y={m.kind === 'local' || m.kind === 'stash' ? MINIMAP_H - 6 : MINIMAP_H - 4}
              height={m.kind === 'local' || m.kind === 'stash' ? 6 : 4} />
          ))}
          {upstreamDay !== null && indexOf.has(upstreamDay) && upstreamDay !== headDay && (() => {
            const x = xOf(indexOf.get(upstreamDay)!)
            return <g className="cg-mm-upstream">
              <line x1={x} x2={x} y1={4} y2={MINIMAP_H} />
              <polygon points={`${x - 3},0 ${x + 3},0 ${x},4`} />
            </g>
          })()}
          {headDay !== null && indexOf.has(headDay) && (() => {
            const x = xOf(indexOf.get(headDay)!)
            return <g className="cg-mm-head">
              <line x1={x} x2={x} y1={5} y2={MINIMAP_H} />
              <polygon points={`${x - 4},0 ${x + 4},0 ${x},5`} />
            </g>
          })()}
          {selectedDay !== null && indexOf.has(selectedDay) && (
            <circle className="cg-mm-sel" cx={xOf(indexOf.get(selectedDay)!)} cy={yOf(value(selectedDay))} r={3.5} />
          )}
          {hover && <>
            <line className="cg-mm-hover" x1={hover.x} x2={hover.x} y1={0} y2={MINIMAP_H} />
            <circle className="cg-mm-hover-dot" cx={hover.x} cy={yOf(value(hover.day))} r={2.5} />
          </>}
          {brush && (
            <rect className="cg-mm-brush" x={Math.min(brush.x0, brush.x1)} y={0}
              width={Math.abs(brush.x1 - brush.x0)} height={MINIMAP_H} />
          )}
        </svg>
      )}

      <div className="cg-mm-tools" onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
        <button className="cg-mm-btn" title={t('minimap.options')} aria-label={t('minimap.options')}
          aria-haspopup="menu" aria-expanded={!!menu}
          onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.right - 180, y: r.bottom + 2 }) }}>
          <Icon name="sliders" size={12} />
        </button>
        {isZoomed && (
          <button className="cg-mm-btn" title={t('minimap.exitZoom')} aria-label={t('minimap.exitZoom')} onClick={() => setZoom(null)}>
            <Icon name="undo" size={12} />
          </button>
        )}
      </div>

      {hover && (
        <div className="cg-mm-tip" role="tooltip"
          style={{ left: Math.max(100, Math.min(chartW - 100, hover.x)) }}>
          <div className="cg-mm-tip-head">
            <span className="cg-mm-tip-date">
              {new Date(hover.day).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
            <span className="cg-mm-tip-rel">{relativeDay(hover.day, t)}</span>
          </div>
          <div className="cg-mm-tip-count">
            {t('minimap.nCommits', hoverInfo?.commits ?? 0)}
            {dataType === 'lines' && hoverInfo && hoverInfo.commits > 0 && (
              <> · <span className="cg-mm-tip-add">+{hoverInfo.additions}</span> <span className="cg-mm-tip-del">−{hoverInfo.deletions}</span></>
            )}
          </div>
          {matches && (hoverInfo?.matches ?? 0) > 0 && (
            <div className="cg-mm-tip-match">{t('minimap.nMatches', hoverInfo!.matches)}</div>
          )}
          {hoverInfo && hoverInfo.markers.length > 0 && (
            <div className="cg-mm-tip-refs">
              {sortMarkers(hoverInfo.markers).slice(0, 6).map(m => (
                <span key={`${m.kind}-${m.name}`} className={`cg-mm-ref cg-mm-ref--${m.kind}`}>{m.name}</span>
              ))}
              {hoverInfo.markers.length > 6 && <span className="cg-mm-ref">+{hoverInfo.markers.length - 6}</span>}
            </div>
          )}
        </div>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
    </div>
  )
}

const MARKER_ORDER: MinimapMarker['kind'][] = ['head', 'local', 'remote', 'tag', 'stash']
function sortMarkers(markers: MinimapMarker[]): MinimapMarker[] {
  return [...markers].sort((a, b) => MARKER_ORDER.indexOf(a.kind) - MARKER_ORDER.indexOf(b.kind))
}

function relativeDay(day: number, t: (k: any, ...a: any[]) => string): string {
  const today = dayOf(Date.now())
  if (day >= today) return t('graph.period.today')
  // A calendar day, not 24 hours: the day before a clock change is 23 or 25.
  if (day >= today - DAY_MS - 3_600_000) return t('graph.period.yesterday')
  return fmtRelative(new Date(day + DAY_MS / 2), t)
}
