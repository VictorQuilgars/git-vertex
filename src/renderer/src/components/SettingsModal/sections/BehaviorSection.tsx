// Settings › notifications. Reads its slice of the page's state; the state itself lives in useSettingsPage.
import type { SettingsPage } from '../useSettingsPage'
import { SaveNote } from '../shared'

export function BehaviorSection({ page }: { page: SettingsPage }) {
  const { t, settings, section, notifyFetch, setNotifyFetch, notifyCommit, setNotifyCommit, notifyUpdate, setNotifyUpdate, autoStash, setAutoStash, warnBeforeConflict, setWarnBeforeConflict, defaultBranchName, setDefaultBranchName, autoFetchInterval, setAutoFetchInterval, autoUpdateSubmodules, setAutoUpdateSubmodules, repoTuning, setRepoTuning, embedded } = page
  return (
              <div className="stg-section">
                <h2 className="stg-section-title">{t('settings.behavior.title')}</h2>
                <SaveNote />

                <label className="stg-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <input type="checkbox" checked={autoStash}
                    onChange={async e => {
                      setAutoStash(e.target.checked)
                      await window.gitAPI.settingsSet('autoStash', String(e.target.checked))
                    }} />
                  <span>{t('settings.behavior.autostash')} <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{t('settings.behavior.autostashHint')}</span></span>
                </label>

                <label className="stg-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
                  <input type="checkbox" checked={warnBeforeConflict}
                    onChange={async e => {
                      setWarnBeforeConflict(e.target.checked)
                      await window.gitAPI.settingsSet('warnBeforeConflict', String(e.target.checked))
                    }} />
                  <span>{t('settings.behavior.warnConflict')} <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{t('settings.behavior.warnConflictHint')}</span></span>
                </label>

                <label className="stg-field" style={{ marginTop: 12 }}>
                  <span>{t('settings.general.defaultBranch')} <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{t('settings.general.defaultBranchHint')}</span></span>
                  <input
                    className="stg-input"
                    value={defaultBranchName}
                    onChange={async e => {
                      setDefaultBranchName(e.target.value)
                      await window.gitAPI.settingsSet('defaultBranchName', e.target.value)
                    }}
                    placeholder="main"
                  />
                </label>

                <label className="stg-field" style={{ marginTop: 12 }}>
                  <span>{t('settings.general.autoFetch')} <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{t('settings.general.autoFetchHint')}</span></span>
                  <input
                    className="stg-input"
                    type="number"
                    min={0}
                    max={60}
                    value={autoFetchInterval}
                    onChange={async e => {
                      const v = e.target.value
                      setAutoFetchInterval(v)
                      await window.gitAPI.settingsSet('autoFetchInterval', v)
                    }}
                    placeholder="0"
                  />
                </label>

                <label className="stg-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
                  <input type="checkbox" checked={autoUpdateSubmodules}
                    onChange={async e => {
                      setAutoUpdateSubmodules(e.target.checked)
                      await window.gitAPI.settingsSet('autoUpdateSubmodules', String(e.target.checked))
                    }} />
                  <span>{t('settings.general.autoSubmodules')} <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{t('settings.general.autoSubmodulesHint')}</span></span>
                </label>

                {/* Writes into the repository's own config, so it says which
                    keys — the same rule as the identity fields above. */}
                <label className="stg-field" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 12 }}>
                  <input type="checkbox" checked={repoTuning} style={{ marginTop: 3 }}
                    onChange={async e => {
                      setRepoTuning(e.target.checked)
                      await window.gitAPI.settingsSet('repoTuning', String(e.target.checked))
                    }} />
                  <span>
                    {t('settings.general.repoTuning')}
                    <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
                      {t('settings.general.repoTuningHint')}
                    </span>
                  </span>
                </label>

                {/* OS notifications — desktop only (no-op in the VS Code host) */}
                {!embedded && (
                  <>
                    <h2 className="stg-section-title" style={{ marginTop: 16 }}>{t('settings.notifications.title')}</h2>
                    <p className="stg-desc">{t('settings.notifications.desc')}</p>

                    <label className="stg-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <input type="checkbox" checked={notifyFetch}
                        onChange={async e => {
                          setNotifyFetch(e.target.checked)
                          await window.gitAPI.settingsSet('notifyFetch', String(e.target.checked))
                        }} />
                      <span>{t('settings.notifications.fetch')}</span>
                    </label>

                    <label className="stg-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <input type="checkbox" checked={notifyCommit}
                        onChange={async e => {
                          setNotifyCommit(e.target.checked)
                          await window.gitAPI.settingsSet('notifyCommit', String(e.target.checked))
                        }} />
                      <span>{t('settings.notifications.commit')}</span>
                    </label>

                    <label className="stg-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <input type="checkbox" checked={notifyUpdate}
                        onChange={async e => {
                          setNotifyUpdate(e.target.checked)
                          await window.gitAPI.settingsSet('notifyUpdate', String(e.target.checked))
                        }} />
                      <span>{t('settings.notifications.update')}</span>
                    </label>
                  </>
                )}
              </div>
            )
}
