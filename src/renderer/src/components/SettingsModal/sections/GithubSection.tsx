// Settings › github. Reads its slice of the page's state; the state itself lives in useSettingsPage.
import { Icon } from '../../Icon/Icon'
import { Brand } from '../../BrandMark/BrandMark'
import { isSecretMask } from '../../../utils/secrets'
import type { SettingsPage } from '../useSettingsPage'
import { SaveNote } from '../shared'

export function GithubSection({ page }: { page: SettingsPage }) {
  const { t, settings, section, githubToken, setGithubToken, ghEnterpriseHost, setGhEnterpriseHost, ghEnterpriseToken, setGhEnterpriseToken, showToken, setShowToken, githubUser, githubSource, githubLoading, fetchGithubUser, autolinks, saveAutolinks, handleGithubLogin, handleGithubDisconnect, saveGithub, embedded } = page
  return (
              <div className="stg-section">
                <h2 className="stg-section-title">{t('settings.github.title')}</h2>
                <p className="stg-desc">{t('settings.github.desc')}</p>

                {githubUser && (
                  <div className="stg-gh-connected">
                    <img className="stg-gh-avatar" src={githubUser.avatar} alt={githubUser.login} />
                    <div className="stg-gh-info">
                      <span className="stg-gh-login">{githubUser.login}</span>
                      <span className="stg-gh-status">
                        {githubSource === 'vscode' ? t('settings.github.viaVsCode') : t('settings.github.connected')}
                      </span>
                    </div>
                    <button className="stg-gh-disconnect" onClick={handleGithubDisconnect}>
                      {t('settings.github.disconnect')}
                    </button>
                  </div>
                )}
                {!githubUser && (
                  <button className="stg-gh-login-btn" onClick={handleGithubLogin} disabled={githubLoading}>
                    <Brand name="github" size={18} />
                    {githubLoading ? t('settings.github.connecting') : t('settings.github.login')}
                  </button>
                )}
                {/* Autolinks — nothing here is GitHub-specific, but this is the
                    section people look in when a reference in a commit message
                    did not become a link. */}
                <h2 className="stg-section-title" style={{ marginTop: 24 }}>{t('settings.autolinks.title')}</h2>
                <p className="stg-desc">{t('settings.autolinks.desc')}</p>
                <div className="stg-autolinks">
                  {autolinks.map((link, i) => (
                    <div key={i} className="stg-autolink-row">
                      <input
                        className="stg-input stg-autolink-prefix"
                        value={link.prefix}
                        placeholder="JIRA-"
                        onChange={e => saveAutolinks(autolinks.map((l, j) => j === i ? { ...l, prefix: e.target.value } : l))}
                      />
                      <input
                        className="stg-input stg-autolink-url"
                        value={link.url}
                        placeholder="https://jira.example.com/browse/JIRA-<num>"
                        spellCheck={false}
                        onChange={e => saveAutolinks(autolinks.map((l, j) => j === i ? { ...l, url: e.target.value } : l))}
                      />
                      <button
                        className="stg-autolink-del"
                        title={t('settings.autolinks.remove')}
                        onClick={() => saveAutolinks(autolinks.filter((_, j) => j !== i))}
                      >×</button>
                    </div>
                  ))}
                  <button className="stg-save" style={{ alignSelf: 'flex-start' }}
                    onClick={() => saveAutolinks([...autolinks, { prefix: '', url: '' }])}>
                    {t('settings.autolinks.add')}
                  </button>
                </div>
                <p className="stg-desc" style={{ marginTop: 6 }}>{t('settings.autolinks.hint')}</p>

                {/* Manual Personal Access Token — the fallback, not the way in.
                    The button above signs in through VS Code's own GitHub
                    provider, which usually means confirming a session the user
                    already has. This stays for hosts that do not bundle that
                    provider (VSCodium and other OSS builds), and for anyone who
                    would rather hand over a narrowly scoped token. On desktop,
                    OAuth handles it (prod builds carry the client id). */}
                {!githubUser && embedded && (
                  <div className="stg-field" style={{ marginTop: 16 }}>
                    <label>{t('settings.github.pat')}</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type={showToken ? 'text' : 'password'}
                        value={githubToken}
                        placeholder="ghp_…"
                        onChange={e => setGithubToken(e.target.value)}
                        style={{ flex: 1 }}
                        spellCheck={false}
                      />
                      <button className="stg-save" style={{ background: 'var(--surface-sunken)', color: 'var(--text-primary-soft)' }} onClick={() => setShowToken(v => !v)}><Icon name={showToken ? 'eyeOff' : 'eye'} size={14} /></button>
                      <button className="stg-save" onClick={async () => { await saveGithub(); if (githubToken.trim()) fetchGithubUser() }}>
                        {t('settings.save')}
                      </button>
                    </div>
                    {isSecretMask(githubToken) && <p className="stg-secret-hint">{t('settings.secretHeld')}</p>}
                    <p className="stg-desc" style={{ marginTop: 6 }}>{t('settings.github.patHint')}</p>
                  </div>
                )}

                {/* GitHub Enterprise Server. Deliberately its own host and its
                    own token: a credential belongs to one server, and sending
                    the github.com one to someone's instance would hand it over.
                    Naming the host here is also what makes Git Vertex treat it
                    as GitHub at all — nothing in a hostname says whether a
                    self-hosted forge is GitHub or something else. */}
                <div className="stg-field" style={{ marginTop: 24 }}>
                  <h2 className="stg-section-title">{t('settings.github.enterprise')}</h2>
                  <p className="stg-desc">{t('settings.github.enterpriseDesc')}</p>
                  <label style={{ marginTop: 12 }}>{t('settings.github.enterpriseHost')}</label>
                  <input
                    value={ghEnterpriseHost}
                    placeholder="github.acme.com"
                    onChange={e => setGhEnterpriseHost(e.target.value)}
                    spellCheck={false}
                  />
                  <label style={{ marginTop: 12 }}>{t('settings.github.enterpriseToken')}</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={ghEnterpriseToken}
                      onChange={e => setGhEnterpriseToken(e.target.value)}
                      style={{ flex: 1 }}
                      spellCheck={false}
                    />
                    <button className="stg-save" onClick={saveGithub}>{t('settings.save')}</button>
                    <SaveNote button={t('settings.save')} />
                  </div>
                  <p className="stg-desc" style={{ marginTop: 6 }}>{t('settings.github.enterpriseHint')}</p>
                </div>
              </div>
            )
}
