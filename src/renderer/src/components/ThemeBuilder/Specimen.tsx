import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { useLang } from '../../i18n/LanguageContext'
import { SEED_KEYS, type SeedKey } from '../../../../main/theme-validate'

// The 24 places (#242): a miniature of the app drawn from the seeds
// themselves, one labelled place per seed. The live window is the preview,
// but a click in it answers with whatever happens to be under the pointer —
// and a panel's padding answers with a panel while the eye reads the text.
// Here the mapping is fixed: the word IS the seed, the place around it is
// what that seed paints, and a click goes to that seed's row. Hovering a
// place, or a row, outlines every element of the window the seed paints.
//
// Drawn with `var(--seed-*)` and not the derived tokens, on purpose: a place
// shows the seed, not a mix of it — the same choice the gallery's seeded
// tiles make.

interface Props {
  hint: SeedKey | null
  onHint: (seed: SeedKey | null) => void
  onPick: (seed: SeedKey) => void
  /** How many places of the hinted seed are on screen, or null when nothing is hinted. */
  count: number | null
  /** Folded to its title: the list below gets the room. The count still shows there. */
  collapsed: boolean
  onToggle: () => void
}

const LANES = SEED_KEYS.filter(k => k.startsWith('lane-'))

export function Specimen({ hint, onHint, onPick, count, collapsed, onToggle }: Props) {
  const { t } = useLang()
  const role = (seed: SeedKey) => seed.startsWith('lane-') ? t('builder.seed.lane', Number(seed.slice(5))) : t(`builder.seed.${seed}` as any)

  /** A place: the word is the seed, and it is a button to that seed's row. */
  const Spot = ({ seed, className = '', children }: { seed: SeedKey; className?: string; children?: ReactNode }) => (
    <span role="button" tabIndex={0} data-seed={seed} title={role(seed)} aria-label={`${seed} — ${role(seed)}`}
      className={`thb-spot thb-spot--${seed} ${className} ${hint === seed ? 'thb-spot--hint' : ''}`}
      onClick={(e: MouseEvent) => { e.stopPropagation(); onPick(seed) }}
      onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onPick(seed) } }}
      onMouseOver={(e: MouseEvent) => { e.stopPropagation(); onHint(seed) }}
      onFocus={() => onHint(seed)}>
      {children ?? seed}
    </span>
  )
  /** An area: clicking its empty part is clicking its caption. */
  const area = (seed: SeedKey) => ({
    'data-seed': seed,
    className: `thb-area thb-area--${seed} ${hint === seed ? 'thb-spot--hint' : ''}`,
    onClick: (e: MouseEvent) => { e.stopPropagation(); onPick(seed) },
    onMouseOver: (e: MouseEvent) => { e.stopPropagation(); onHint(seed) },
  })

  return (
    <section className={`thb-specimen ${collapsed ? 'thb-specimen--collapsed' : ''}`} aria-label={t('builder.places')} onMouseLeave={() => onHint(null)}>
      <div className="thb-spec-head">
        <h3 className="thb-group-title">{t('builder.places')}</h3>
        <span className="thb-spec-count" aria-live="polite">
          {hint && <>{hint} · {count === null ? '' : t('builder.placesOnScreen', count)}</>}
        </span>
        <button className="thb-btn thb-spec-toggle" aria-expanded={!collapsed} onClick={onToggle}>{t(collapsed ? 'builder.placesShow' : 'builder.placesHide')}</button>
      </div>
      {!collapsed && <p className="thb-hint thb-spec-hint">{t('builder.placesHint')}</p>}
      {!collapsed && <div className="thb-spec">
        <div {...area('canvas')}>
          <Spot seed="canvas" className="thb-spec-cap" />
          <div {...area('surface')}>
            <div className="thb-spec-row">
              <Spot seed="surface" className="thb-spec-cap" />
              <Spot seed="border" className="thb-spec-tag" />
            </div>
            <div className="thb-spec-row">
              <Spot seed="text" />
              <Spot seed="sunken" className="thb-spec-tag" />
            </div>
            <div className="thb-spec-row">
              <Spot seed="text-2" />
              <Spot seed="text-3" />
            </div>
            <div className="thb-spec-row">
              <Spot seed="accent" className="thb-spec-tag" />
              <Spot seed="on-fill" className="thb-spec-tag" />
              <Spot seed="agent" className="thb-spec-tag" />
            </div>
            <div className="thb-spec-row">
              <Spot seed="success">+ success</Spot>
              <Spot seed="warning">~ warning</Spot>
              <Spot seed="danger">− danger</Spot>
              <Spot seed="conflict">! conflict</Spot>
            </div>
          </div>
          <div className="thb-spec-lanes">
            {LANES.map(k => <Spot key={k} seed={k} className="thb-spec-lane"><i /></Spot>)}
          </div>
        </div>
      </div>}
    </section>
  )
}
