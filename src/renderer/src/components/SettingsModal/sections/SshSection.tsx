// Settings › ssh. Reads its slice of the page's state; the state itself lives in useSettingsPage.
import type { SettingsPage } from '../useSettingsPage'

export function SshSection({ page }: { page: SettingsPage }) {
  const { t, settings, section, sshUseAgent, setSshUseAgent, sshPrivateKey, setSshPrivateKey, sshPublicKey, setSshPublicKey, sshGenerating, setSshGenerating, sshPassphrase, setSshPassphrase, showToast } = page
  return (
              <div className="stg-section">
                <h2 className="stg-section-title">{t('settings.ssh.title')}</h2>
                <p className="stg-desc">{t('settings.ssh.desc')}</p>

                <label className="stg-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <input type="checkbox" checked={sshUseAgent}
                    onChange={async e => {
                      setSshUseAgent(e.target.checked)
                      await window.gitAPI.settingsSet('sshUseAgent', String(e.target.checked))
                    }} />
                  <span>{t('settings.ssh.useAgent')}</span>
                </label>

                <label className="stg-field" style={{ marginTop: 12, opacity: sshUseAgent ? 0.5 : 1 }}>
                  <span>{t('settings.ssh.privateKey')}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="stg-input"
                      value={sshPrivateKey}
                      disabled={sshUseAgent}
                      onChange={async e => {
                        setSshPrivateKey(e.target.value)
                        await window.gitAPI.settingsSet('sshPrivateKey', e.target.value)
                      }}
                      placeholder="~/.ssh/id_ed25519"
                    />
                    <button className="stg-save" style={{ background: 'var(--surface-sunken)', color: 'var(--text-primary-soft)' }} disabled={sshUseAgent}
                      onClick={async () => {
                        const r = await (window.gitAPI as any).sshBrowseKey('private')
                        if (r?.path) { setSshPrivateKey(r.path); await window.gitAPI.settingsSet('sshPrivateKey', r.path) }
                      }}>{t('settings.ssh.browse')}</button>
                  </div>
                </label>

                <label className="stg-field" style={{ marginTop: 12, opacity: sshUseAgent ? 0.5 : 1 }}>
                  <span>{t('settings.ssh.publicKey')}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="stg-input"
                      value={sshPublicKey}
                      disabled={sshUseAgent}
                      onChange={async e => {
                        setSshPublicKey(e.target.value)
                        await window.gitAPI.settingsSet('sshPublicKey', e.target.value)
                      }}
                      placeholder="~/.ssh/id_ed25519.pub"
                    />
                    <button className="stg-save" style={{ background: 'var(--surface-sunken)', color: 'var(--text-primary-soft)' }} disabled={sshUseAgent}
                      onClick={async () => {
                        const r = await (window.gitAPI as any).sshBrowseKey('public')
                        if (r?.path) { setSshPublicKey(r.path); await window.gitAPI.settingsSet('sshPublicKey', r.path) }
                      }}>{t('settings.ssh.browse')}</button>
                  </div>
                </label>

                <h2 className="stg-section-title" style={{ marginTop: 20 }}>{t('settings.ssh.generate.title')}</h2>
                <p className="stg-desc">{t('settings.ssh.generate.desc')}</p>
                <div className="stg-field">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="stg-input"
                      type="password"
                      value={sshPassphrase}
                      onChange={e => setSshPassphrase(e.target.value)}
                      placeholder={t('settings.ssh.generate.passphrase')}
                    />
                    <button className="stg-save" disabled={sshGenerating}
                      onClick={async () => {
                        setSshGenerating(true)
                        const r = await (window.gitAPI as any).sshGenerateKey(sshPassphrase)
                        setSshGenerating(false)
                        if (r?.error) { showToast(t('toast.err', r.error), 'err'); return }
                        setSshPrivateKey(r.privateKey); setSshPublicKey(r.publicKey)
                        await window.gitAPI.settingsSet('sshPrivateKey', r.privateKey)
                        await window.gitAPI.settingsSet('sshPublicKey', r.publicKey)
                        showToast(t('settings.ssh.generate.done'))
                      }}>{sshGenerating ? t('settings.ssh.generate.busy') : t('settings.ssh.generate.button')}</button>
                  </div>
                </div>
              </div>
            )
}
