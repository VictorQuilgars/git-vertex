// Settings › about. Reads its slice of the page's state; the state itself lives in useSettingsPage.
import { Icon } from '../../Icon/Icon'
import { Brand } from '../../BrandMark/BrandMark'
import { ENABLED_LANGS } from '../../../i18n/LanguageContext'
import { Mark } from '../../Mark/Mark'
import type { SettingsPage } from '../useSettingsPage'

export function AboutSection({ page }: { page: SettingsPage }) {
  const { t, lang, setLang, settings, section, appInfo, updateStatus, setUpdateStatus, updateVersion, updateReady, downloadProgress, updateError, setUpdateError, checkHadError, onUpdateFound } = page
  return (
              <div className="stg-section">
                <div className="stg-about-hero">
                  <Mark size={64} className="stg-about-icon" title="Git Vertex" />
                  <div>
                    <h1 className="stg-about-name">Git Vertex</h1>
                    <span className="stg-about-version">v{appInfo?.version ?? '—'}</span>
                  </div>
                </div>

                <p className="stg-desc">{t('settings.about.desc')}</p>

                <div className="stg-about-links">
                  <a className="stg-about-link" onClick={() => (window as any).gitAPI.openExternal?.('https://github.com/VictorQuilgars/git-vertex')}>
                    <Brand name="github" size={14} />
                    {t('settings.about.sourceCode')}
                  </a>
                  <a className="stg-about-link" onClick={() => (window as any).gitAPI.openExternal?.('https://github.com/VictorQuilgars/git-vertex/releases')}>
                    <Icon name="download" size={14} />
                    {t('settings.about.releases')}
                  </a>
                  <a className="stg-about-link" onClick={() => (window as any).gitAPI.openExternal?.('https://github.com/VictorQuilgars/git-vertex/issues')}>
                    <Icon name="info" size={14} />
                    {t('settings.about.reportBug')}
                  </a>
                </div>

                <div className="stg-about-author">
                  <span className="stg-about-label">{t('settings.about.createdBy')}</span>
                  <a className="stg-about-link" onClick={() => (window as any).gitAPI.openExternal?.('https://github.com/VictorQuilgars')}>Victor Quilgars</a>
                </div>

                {ENABLED_LANGS.length > 1 && (
                  <div className="stg-about-lang">
                    <span className="stg-about-label">{t('settings.about.language')}</span>
                    <div className="stg-lang-btns">
                      {ENABLED_LANGS.map(l => (
                        <button key={l} className={`stg-lang-btn ${lang === l ? 'active' : ''}`} onClick={() => setLang(l)}>
                          {l === 'fr' ? '🇫🇷' : '🇬🇧'} {t(`settings.lang.${l}` as any)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="stg-about-update">
                  {updateReady ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <button
                        className="stg-about-install-btn"
                        onClick={async () => {
                          const r = await (window.gitAPI as any).installManual?.()
                          if (r?.error) {
                            // fallback to electron's quitAndInstall
                            ;(window.gitAPI as any).installUpdate?.()
                          }
                        }}
                      >
                        {t('settings.installAndRestart', updateVersion ?? '')}
                      </button>
                    </div>
                  ) : (
                    <button
                      className="stg-about-check-btn"
                      disabled={updateStatus === 'checking'}
                      onClick={async () => {
                        checkHadError.current = false
                        setUpdateStatus('checking')
                        setUpdateError(null)
                        console.log('[updater] checkForUpdates called, app version:', (window as any).appInfo)
                        const r = await (window.gitAPI as any).checkForUpdates?.()
                        console.log('[updater] checkForUpdates result:', r)
                        if (checkHadError.current) { console.log('[updater] error already received, ignoring result'); return }
                        if (r?.dev) { console.log('[updater] dev mode'); setUpdateStatus('up-to-date'); return }
                        if (r?.error) {
                          console.log('[updater] error in result:', r.error)
                          if (r.error.includes('Cannot find latest') || r.error.includes('latest-mac.yml') || r.error.includes('latest.yml')) {
                            setUpdateStatus('up-to-date')
                          } else {
                            setUpdateStatus('error')
                            setUpdateError(r.error)
                          }
                          return
                        }
                        console.log('[updater] remote version:', r?.version, '— will update:', !!r?.version)
                        if (r?.version) {
                          // Hand off to the app-level overlay (single download+install
                          // flow). Keep Settings open underneath so "Later" returns
                          // here instead of dropping the user back on the home page.
                          setUpdateStatus('idle')
                          onUpdateFound?.(r.version)
                        } else setUpdateStatus('up-to-date')
                      }}
                    >
                      {updateStatus === 'checking' ? t('settings.update.checking') : t('settings.update.check')}
                    </button>
                  )}
                  {!updateReady && updateStatus === 'up-to-date' && <span className="stg-about-update-ok">{t('settings.update.upToDate')}</span>}
                  {!updateReady && updateStatus === 'available' && (
                    <span className="stg-about-update-new">
                      {downloadProgress !== null
                        ? t('settings.update.downloading', downloadProgress)
                        : t('settings.update.starting', updateVersion ?? '')}
                    </span>
                  )}
                  {updateStatus === 'error' && (
                    <span className="stg-about-update-err" title={updateError ?? ''}>
                      ✗ {updateError ?? t('settings.update.unknownErr')}
                    </span>
                  )}
                </div>
              </div>
            )
}
