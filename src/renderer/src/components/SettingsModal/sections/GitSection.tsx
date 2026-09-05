// Settings › git. Reads its slice of the page's state; the state itself lives in useSettingsPage.
import type { SettingsPage } from '../useSettingsPage'

export function GitSection({ page }: { page: SettingsPage }) {
  const { t, settings, section, gitUserName, setGitUserName, gitUserEmail, setGitUserEmail, gitBinary, setGitBinary, gitBinaryPath, setGitBinaryPath, gitBinaryBusy, setGitBinaryBusy, gpgSign, setGpgSign, profiles, saveGit, saveCurrentAsProfile, applyProfile, deleteProfile, showToast, embedded } = page
  return (
              <div className="stg-section">
                <h2 className="stg-section-title">{t('settings.git.title')}</h2>
                <p className="stg-desc">{t('settings.git.desc')}</p>

                <label className="stg-field">
                  <span>{t('settings.git.name')}</span>
                  <input
                    className="stg-input"
                    value={gitUserName}
                    onChange={e => setGitUserName(e.target.value)}
                    placeholder={t('settings.git.name.placeholder')}
                  />
                </label>

                <label className="stg-field">
                  <span>{t('settings.git.email')}</span>
                  <input
                    className="stg-input"
                    type="email"
                    value={gitUserEmail}
                    onChange={e => setGitUserEmail(e.target.value)}
                    placeholder={t('settings.git.email.placeholder')}
                  />
                </label>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="stg-save" onClick={saveGit}>{t('settings.save')}</button>
                  <button className="stg-save" style={{ background: 'var(--surface-sunken)', color: 'var(--text-primary-soft)' }} onClick={saveCurrentAsProfile}>
                    {t('settings.saveAsProfile')}
                  </button>
                </div>

                {/* Profils / identités */}
                {profiles.length > 0 && (
                  <>
                    <h2 className="stg-section-title" style={{ marginTop: 20 }}>{t('settings.profiles.title')}</h2>
                    <p className="stg-desc">{t('settings.profiles.desc')}</p>
                    <div className="stg-profiles">
                      {profiles.map((p, i) => {
                        const active = p.name === gitUserName.trim() && p.email === gitUserEmail.trim()
                        return (
                          <div key={i} className={`stg-profile ${active ? 'active' : ''}`}>
                            <div className="stg-profile-info">
                              <span className="stg-profile-name">{p.name}</span>
                              <span className="stg-profile-email">{p.email}</span>
                            </div>
                            {active
                              ? <span className="stg-profile-badge">{t('settings.profiles.active')}</span>
                              : <button className="stg-profile-apply" onClick={() => applyProfile(p)}>{t('settings.profiles.use')}</button>}
                            <button className="stg-profile-del" onClick={() => deleteProfile(i)} title={t('settings.profiles.delete')}>✕</button>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                {/* Which git we run. Only meaningful on the desktop: launched
                    from the Finder this process gets a truncated PATH, so a
                    machine with both Apple's git and Homebrew's can end up on
                    the older one without anything saying so. */}
                {!embedded && (
                  <>
                    <h2 className="stg-section-title" style={{ marginTop: 20 }}>{t('settings.gitBinary.title')}</h2>
                    <p className="stg-desc">{t('settings.gitBinary.desc')}</p>
                    <p className="stg-desc" style={{ color: 'var(--text-primary-soft)' }}>
                      {gitBinary
                        ? <>
                            <strong>git {gitBinary.version ?? '—'}</strong>
                            {' — '}
                            <code>{gitBinary.path}</code>
                            <span style={{ color: 'var(--text-secondary)' }}> ({t(`settings.gitBinary.source.${gitBinary.source}` as any)})</span>
                          </>
                        : t('settings.gitBinary.unknown')}
                    </p>
                    <label className="stg-field">
                      <span>{t('settings.gitBinary.path')}</span>
                      <input
                        className="stg-input"
                        value={gitBinaryPath}
                        onChange={e => setGitBinaryPath(e.target.value)}
                        placeholder={t('settings.gitBinary.path.placeholder')}
                      />
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="stg-save"
                        disabled={gitBinaryBusy}
                        onClick={async () => {
                          setGitBinaryBusy(true)
                          const value = gitBinaryPath.trim()
                          await window.gitAPI.settingsSet('gitBinaryPath', value)
                          // Re-resolve rather than restart: the answer shown here
                          // must be the one the app will actually use.
                          const r = await window.gitAPI.resolveGitBinary(value).catch(() => null)
                          setGitBinaryBusy(false)
                          if (!r) { showToast(t('settings.gitBinary.failed'), 'err'); return }
                          setGitBinary(r)
                          if (r.version) showToast(t('settings.gitBinary.applied', r.version, r.path))
                          else showToast(t('settings.gitBinary.notRunnable', r.path), 'err')
                        }}
                      >
                        {gitBinaryBusy ? t('settings.gitBinary.checking') : t('settings.gitBinary.apply')}
                      </button>
                    </div>
                  </>
                )}

                {/* Signature GPG */}
                <h2 className="stg-section-title" style={{ marginTop: 20 }}>{t('settings.gpg.title')}</h2>
                <label className="stg-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <input type="checkbox" checked={gpgSign}
                    onChange={async e => {
                      setGpgSign(e.target.checked)
                      await window.gitAPI.settingsSet('gpgSign', String(e.target.checked))
                    }} />
                  <span>{t('settings.gpg.label')} <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{t('settings.gpg.hint')}</span></span>
                </label>
              </div>
            )
}
