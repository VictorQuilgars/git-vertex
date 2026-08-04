import { useLang } from '../../i18n/LanguageContext'
import { Mark } from '../Mark/Mark'
import './UpdateOverlay.css'

export type UpdatePhase = 'available' | 'downloading' | 'installing'

interface Props {
  phase: UpdatePhase
  version: string | null
  progress: number
  onStart: () => void
  onDismiss: () => void
}

export default function UpdateOverlay({ phase, version, progress, onStart, onDismiss }: Props) {
  const { t } = useLang()

  return (
    <div className="upd-backdrop" role="dialog" aria-modal="true" aria-label={t('update.available.title')}>
      <div className="upd-card">
        <Mark className="upd-mark" size={78} />

        {phase === 'available' && (
          <>
            <h2 className="upd-title">{t('update.available.title')}</h2>
            <p className="upd-desc">{t('update.available.desc', version ?? '')}</p>
            <div className="upd-actions">
              <button className="upd-btn upd-btn--primary" onClick={onStart}>{t('update.download')}</button>
              <button className="upd-btn upd-btn--ghost" onClick={onDismiss}>{t('update.later')}</button>
            </div>
          </>
        )}

        {phase === 'downloading' && (
          <>
            <h2 className="upd-title">{version ? `v${version}` : t('update.available.title')}</h2>
            <p className="upd-desc">{t('update.downloading', progress)}</p>
            <div className="upd-track">
              <div className="upd-track-fill" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
            </div>
          </>
        )}

        {phase === 'installing' && (
          <>
            <h2 className="upd-title">{t('update.installing.title')}</h2>
            <p className="upd-desc">{t('update.installing.desc')}</p>
            <div className="upd-track upd-track--indeterminate">
              <div className="upd-track-sweep" />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
