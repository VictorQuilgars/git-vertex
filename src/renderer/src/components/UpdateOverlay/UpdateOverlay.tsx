import { useLang } from '../../i18n/LanguageContext'
import './UpdateOverlay.css'

export type UpdatePhase = 'available' | 'downloading' | 'installing'

interface Props {
  phase: UpdatePhase
  version: string | null
  progress: number
  onStart: () => void
  onDismiss: () => void
}

// The V-shaped git graph, small and static (the animated draw lives in the
// launch splash; here it's just the brand mark).
function Mark() {
  return (
    <svg className="upd-mark" viewBox="0 0 512 512" role="img" aria-label="Git Vertex">
      <path d="M148 82 L256 422" fill="none" stroke="#3fb950" strokeWidth="22" strokeLinecap="round" />
      <path d="M364 82 L256 422" fill="none" stroke="#58a6ff" strokeWidth="22" strokeLinecap="round" />
      <circle cx="148" cy="82" r="24" fill="#0d1117" stroke="#3fb950" strokeWidth="13" />
      <circle cx="184" cy="192" r="18" fill="#0d1117" stroke="#3fb950" strokeWidth="12" />
      <circle cx="220" cy="302" r="18" fill="#0d1117" stroke="#3fb950" strokeWidth="12" />
      <circle cx="364" cy="82" r="24" fill="#0d1117" stroke="#58a6ff" strokeWidth="13" />
      <circle cx="328" cy="192" r="18" fill="#0d1117" stroke="#58a6ff" strokeWidth="12" />
      <circle cx="292" cy="302" r="18" fill="#0d1117" stroke="#58a6ff" strokeWidth="12" />
      <circle cx="256" cy="422" r="26" fill="#3fb950" opacity="0.5" />
      <circle cx="256" cy="422" r="12" fill="#0d1117" />
    </svg>
  )
}

export default function UpdateOverlay({ phase, version, progress, onStart, onDismiss }: Props) {
  const { t } = useLang()

  return (
    <div className="upd-backdrop" role="dialog" aria-modal="true" aria-label={t('update.available.title')}>
      <div className="upd-card">
        <Mark />

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
