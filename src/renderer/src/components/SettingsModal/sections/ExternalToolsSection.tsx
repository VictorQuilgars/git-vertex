// Settings › externalTools. Reads its slice of the page's state; the state itself lives in useSettingsPage.
import type { SettingsPage } from '../useSettingsPage'
import { SaveNote } from '../shared'

export function ExternalToolsSection({ page }: { page: SettingsPage }) {
  const { t, externalEditor, setExternalEditor, externalDiffTool, setExternalDiffTool, externalMergeTool, setExternalMergeTool, externalTerminal, setExternalTerminal } = page
  return (
              <div className="stg-section">
                <h2 className="stg-section-title">{t('settings.externalTools.title')}</h2>
                <p className="stg-desc">{t('settings.externalTools.desc')}</p>
                <SaveNote />

                <label className="stg-field">
                  <span>{t('settings.behavior.externalEditor')} <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{t('settings.behavior.externalEditorHintPre')}<code>code</code>, <code>code --wait</code>, <code>subl</code>, <code>meld</code>{t('settings.behavior.externalEditorHintPost')}</span></span>
                  <input
                    className="stg-input"
                    value={externalEditor}
                    onChange={async e => {
                      setExternalEditor(e.target.value)
                      await window.gitAPI.settingsSet('externalEditor', e.target.value)
                    }}
                    placeholder="code"
                  />
                </label>

                <label className="stg-field" style={{ marginTop: 12 }}>
                  <span>{t('settings.externalTools.diffTool')} <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{t('settings.externalTools.diffToolHint')}</span></span>
                  <input
                    className="stg-input"
                    value={externalDiffTool}
                    onChange={async e => {
                      setExternalDiffTool(e.target.value)
                      await window.gitAPI.settingsSet('externalDiffTool', e.target.value)
                    }}
                    placeholder="opendiff"
                  />
                </label>

                <label className="stg-field" style={{ marginTop: 12 }}>
                  <span>{t('settings.externalTools.mergeTool')} <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{t('settings.externalTools.mergeToolHint')}</span></span>
                  <input
                    className="stg-input"
                    value={externalMergeTool}
                    onChange={async e => {
                      setExternalMergeTool(e.target.value)
                      await window.gitAPI.settingsSet('externalMergeTool', e.target.value)
                    }}
                    placeholder="opendiff -merge"
                  />
                </label>

                <label className="stg-field" style={{ marginTop: 12 }}>
                  <span>{t('settings.externalTools.terminal')} <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{t('settings.externalTools.terminalHint')}</span></span>
                  <input
                    className="stg-input"
                    value={externalTerminal}
                    onChange={async e => {
                      setExternalTerminal(e.target.value)
                      await window.gitAPI.settingsSet('externalTerminal', e.target.value)
                    }}
                    placeholder="iTerm"
                  />
                </label>
              </div>
            )
}
