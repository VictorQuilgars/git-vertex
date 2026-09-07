// Settings › graph. Reads its slice of the page's state; the state itself lives in useSettingsPage.
import type { SettingsPage } from '../useSettingsPage'
import { SaveNote } from '../shared'

export function GraphSection({ page }: { page: SettingsPage }) {
  const { t, settings, getBool, set, section } = page
  return (
              <div className="stg-section">
                <h2 className="stg-section-title">{t('settings.graph.title')}</h2>
                <p className="stg-desc">{t('settings.graph.desc')}</p>
                <SaveNote />

                {([
                  ['graphShowAvatars', 'settings.graph.avatars', 'settings.graph.avatarsHint'],
                  ['graphShowAuthor',  'settings.graph.author',  'settings.graph.authorHint'],
                  ['graphShowDate',    'settings.graph.date',    'settings.graph.dateHint'],
                  ['graphShowSha',     'settings.graph.sha',     'settings.graph.shaHint'],
                  ['graphShowStats',   'settings.graph.stats',   'settings.graph.statsHint'],
                ] as [string, string, string][]).map(([key, labelKey, descKey]) => (
                  <label key={key} className="stg-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={getBool(key, true)}
                      onChange={e => set(key, String(e.target.checked))}
                    />
                    <span>{t(labelKey as any)} <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>— {t(descKey as any)}</span></span>
                  </label>
                ))}
                <label className="stg-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={getBool('graphCompactColumns', false)}
                    onChange={e => set('graphCompactColumns', String(e.target.checked))}
                  />
                  <span>{t('settings.graph.compact')} <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{t('settings.graph.compactHint')}</span></span>
                </label>
                <p className="stg-desc" style={{ marginTop: 12 }}>{t('settings.graph.tip')}</p>
              </div>
            )
}
