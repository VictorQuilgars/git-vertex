// DetailsToggle.tsx — the details' switch, and where they go, beside the search.
//
// One control in two halves. The main half shows or hides the details and
// never changes where they go — except with Alt held, where it puts them on the
// OTHER side, as a choice (the placement is then that side, not `auto`). The
// chevron opens the placements: Auto, Right, Bottom, each drawn as the panel it
// makes. Auto's thumbnail is the side it would pick right now, faded, with an A.
// Picking a placement shows the details: asking where they go is asking to see
// them.
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../../src/renderer/src/components/Icon/Icon'
import { useLang } from '../../../src/renderer/src/i18n/LanguageContext'
import type { DetailsLocation, DetailsSide } from './panelLayout'

interface Props {
  /** The details are on screen. */
  visible: boolean
  /** The side they are on — or would be, hidden. */
  side: DetailsSide
  /** What the placement menu has picked. */
  location: DetailsLocation
  /** The side `auto` picks for the panel's shape, now. */
  autoSide: DetailsSide
  /** Alt held: the other side, as a choice, instead of show/hide. */
  onToggle: (altKey: boolean) => void
  onPick: (location: DetailsLocation) => void
}

const ALT = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌥' : 'Alt'

/** Alt held down, for the main half's icon and tooltip to say what a click would do. */
function useAltKey(): boolean {
  const [alt, setAlt] = useState(false)
  useEffect(() => {
    const on = (e: KeyboardEvent) => setAlt(e.altKey)
    const off = () => setAlt(false)
    window.addEventListener('keydown', on)
    window.addEventListener('keyup', on)
    window.addEventListener('blur', off)
    return () => {
      window.removeEventListener('keydown', on)
      window.removeEventListener('keyup', on)
      window.removeEventListener('blur', off)
    }
  }, [])
  return alt
}

const PLACEMENTS: DetailsLocation[] = ['auto', 'right', 'bottom']

export default function DetailsToggle(p: Props) {
  const { t } = useLang()
  const alt = useAltKey()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)
  // A press anywhere else, Escape, or the window losing focus closes the menu.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    const onBlur = () => setOpen(false)
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [open])

  const other: DetailsSide = p.side === 'bottom' ? 'right' : 'bottom'
  const shown: DetailsSide = alt ? other : p.side
  const on = p.visible || alt
  const icon = shown === 'bottom' ? (on ? 'layoutBottom' : 'layoutBottomOff') : (on ? 'layoutRight' : 'layoutRightOff')
  const label = t(p.visible ? 'panel.details.hide' : 'panel.details.show')
  const altLabel = t(other === 'bottom' ? 'panel.details.showBottom' : 'panel.details.showRight')
  const describe = (loc: DetailsLocation) => loc === 'auto'
    ? t(p.autoSide === 'right' ? 'panel.details.autoRight' : 'panel.details.autoBottom')
    : t(loc === 'right' ? 'panel.details.alwaysRight' : 'panel.details.alwaysBottom')

  return (
    <span className="gvt-split" ref={wrap}>
      <button className="gvt-btn gvt-split-main" aria-label={label} aria-pressed={p.visible}
        title={alt ? altLabel : `${label}\n[${ALT}] ${altLabel}`}
        onClick={e => p.onToggle(e.altKey)}>
        <Icon name={icon} size={14} />
      </button>
      <button className="gvt-btn gvt-split-chevron" aria-label={t('panel.details.placement')}
        title={t('panel.details.placement')} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(o => !o)}>
        <Icon name="chevronDown" size={8} />
      </button>
      {open && (
        <div className="gvt-placement" role="menu" aria-label={t('panel.details.placement')}>
          {PLACEMENTS.map(loc => {
            const side = loc === 'auto' ? p.autoSide : loc
            return (
              <button key={loc} type="button" role="menuitemradio" aria-checked={p.location === loc}
                className="gvt-placement-opt" title={describe(loc)}
                onClick={() => { setOpen(false); p.onPick(loc) }}>
                <span className={`gvt-placement-thumb gvt-placement-thumb--${side}${loc === 'auto' ? ' gvt-placement-thumb--auto' : ''}`}>
                  {loc === 'auto' && <span className="gvt-placement-a">A</span>}
                </span>
                <span>{t(loc === 'auto' ? 'panel.details.auto' : loc === 'right' ? 'panel.details.right' : 'panel.details.bottom')}</span>
              </button>
            )
          })}
        </div>
      )}
    </span>
  )
}
