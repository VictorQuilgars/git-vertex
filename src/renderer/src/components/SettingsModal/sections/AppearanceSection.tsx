// Settings › appearance. Reads its slice of the page's state; the state itself lives in useSettingsPage.
import { Icon } from '../../Icon/Icon'
import { isVSCodeHost, followsEditor } from '../../../contexts/SettingsContext'
import { THEMES_FOLDED, THEME_PRESETS, SaveNote } from '../shared'
import type { SettingsPage } from '../useSettingsPage'

export function AppearanceSection({ page }: { page: SettingsPage }) {
  const { t, settings, get, set, showAllThemes, setShowAllThemes, installed, discarded, bankCount, preview, themePickerDisabled, removeTheme, onBrowseThemes } = page
  return (
              <div className="stg-section">
                <h2 className="stg-section-title">{t('settings.appearance.title')}</h2>
                <p className="stg-desc">{t('settings.appearance.desc')}</p>
                <SaveNote />

                {/* ── Reading density (#195) ──
                    Each option carries `data-density` on its own preview, so
                    what you are choosing between is drawn at the density it
                    names rather than described in words. Same trick as the
                    theme tiles below, and the reason compact is a real
                    [data-density] rule rather than inline properties on
                    <html>: only a rule reaches a descendant. */}
                <h2 className="stg-section-title" style={{ marginTop: 8 }}>{t('settings.density.title')}</h2>
                <p className="stg-desc">{t('settings.density.desc')}</p>
                <div className="stg-density" role="radiogroup" aria-label={t('settings.density.title')}>
                  {(['comfortable', 'compact'] as const).map(d => (
                    <label key={d} className={`stg-density-opt ${get('density', 'comfortable') === d ? 'stg-density-opt--on' : ''}`}>
                      <input
                        type="radio"
                        name="gv-density"
                        value={d}
                        checked={get('density', 'comfortable') === d}
                        onChange={() => set('density', d)}
                      />
                      <span className="stg-density-preview" data-density={d} aria-hidden>
                        <span className="stg-density-row" />
                        <span className="stg-density-row" />
                        <span className="stg-density-row" />
                      </span>
                      <span className="stg-density-label">{t(`settings.density.${d}` as any)}</span>
                    </label>
                  ))}
                </div>

                {/* The picker is offered in BOTH products now. In the panel it
                    is governed by "Follow the editor" below, which is on by
                    default — a panel that does not match its editor reads as
                    broken, so choosing your own is something you opt into. */}
                {isVSCodeHost && (
                  <>
                    <h2 className="stg-section-title" style={{ marginTop: 8 }}>{t('settings.themes.followEditor')}</h2>
                    <p className="stg-desc">{t('settings.themes.followEditorDesc')}</p>
                    <label className="stg-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <input
                        type="checkbox"
                        checked={followsEditor(settings)}
                        onChange={e => set('panelFollowEditorTheme', e.target.checked ? 'true' : 'false')}
                      />
                      <span>{t('settings.themes.followEditor')}</span>
                    </label>
                  </>
                )}

                <h2 className="stg-section-title" style={{ marginTop: 8 }}>{t('settings.theme.title')}</h2>
                <p className="stg-desc">{t('settings.theme.desc')}</p>
                {themePickerDisabled && (
                  <p className="stg-gal-note">{t('settings.themes.pickerDisabled')}</p>
                )}
                <fieldset className="stg-themes-fieldset" disabled={themePickerDisabled}>
                  {/* The same tile as the gallery. A 26×18 chip could not
                      show what a theme looks like, which is the one thing this
                      list exists to do — and it made the thirty that ship with
                      the app look like a different feature from the four
                      thousand behind them.

                      The colours come from `data-theme` rather than inline
                      hexes: seeds are literal values, so a descendant carrying
                      the attribute reads that theme's block. It works for the
                      built-ins (blocks in tokens.css) and for installed themes
                      alike, because SettingsContext injects a real rule for
                      each of those. A derived token would NOT work here — it
                      resolves against :root and every tile would show the
                      current theme. */}
                  <ul className="stg-wall stg-wall--compact">
                    {/* The current theme and a handful, then the rest on
                        request: thirty-two tiles took the pane before the
                        options below them, for a choice made once. */}
                    {(showAllThemes
                      ? THEME_PRESETS
                      : THEME_PRESETS.filter((th, i) => i < THEMES_FOLDED || get('theme', 'aqua-dark') === th.id)
                    ).map(th => {
                      const active = get('theme', 'aqua-dark') === th.id
                      return (
                        <li key={th.id} className={`stg-tile ${active ? 'active' : ''}`}>
                          <span className="stg-tile-mock stg-tile-mock--seeded" data-theme={th.id} aria-hidden="true">
                            <span className="stg-tile-rail" />
                            <span className="stg-tile-row"><i className="stg-tile-node" /><i className="stg-tile-bar" style={{ width: '64%' }} /></span>
                            <span className="stg-tile-row"><i className="stg-tile-node" /><i className="stg-tile-bar stg-tile-bar--dim" style={{ width: '44%' }} /></span>
                            <span className="stg-tile-row"><i className="stg-tile-node" /><i className="stg-tile-bar" style={{ width: '54%' }} /></span>
                            <span className="stg-tile-btn" />
                          </span>
                          <span className="stg-tile-meta">
                            <span className="stg-tile-name">{th.name ?? t(th.key as any)}</span>
                          </span>
                          <button
                            className="stg-tile-action"
                            onClick={() => set('theme', th.id)}
                            disabled={active}
                            aria-pressed={active}
                          >{active ? t('settings.themes.applied') : t('settings.themes.use')}</button>
                        </li>
                      )
                    })}
                    {/* Installed themes sit with the built-in ones — the
                        distinction is ours, not the user's. */}
                    {installed.map(th => {
                      const active = get('theme', 'aqua-dark') === th.id
                      return (
                        <li key={th.id} className={`stg-tile ${active ? 'active' : ''}`}>
                          <span className="stg-tile-mock stg-tile-mock--seeded" data-theme={th.id} aria-hidden="true">
                            <span className="stg-tile-rail" />
                            <span className="stg-tile-row"><i className="stg-tile-node" /><i className="stg-tile-bar" style={{ width: '64%' }} /></span>
                            <span className="stg-tile-row"><i className="stg-tile-node" /><i className="stg-tile-bar stg-tile-bar--dim" style={{ width: '44%' }} /></span>
                            <span className="stg-tile-row"><i className="stg-tile-node" /><i className="stg-tile-bar" style={{ width: '54%' }} /></span>
                            <span className="stg-tile-btn" />
                          </span>
                          <button
                            className="stg-tile-remove"
                            title={t('settings.themes.remove')}
                            aria-label={`${t('settings.themes.remove')} ${th.name}`}
                            onClick={() => removeTheme(th.id)}
                          >×</button>
                          <span className="stg-tile-meta">
                            <span className="stg-tile-name">{th.name}</span>
                          </span>
                          <button
                            className="stg-tile-action"
                            onClick={() => set('theme', th.id)}
                            disabled={active}
                            aria-pressed={active}
                          >{active ? t('settings.themes.applied') : t('settings.themes.use')}</button>
                        </li>
                      )
                    })}
                  </ul>
                </fieldset>

                {THEME_PRESETS.length > THEMES_FOLDED && (
                  <button className="stg-wall-toggle" onClick={() => setShowAllThemes(v => !v)} aria-expanded={showAllThemes}>
                    {showAllThemes ? t('settings.themes.showFewer') : t('settings.themes.showAll', THEME_PRESETS.length)}
                  </button>
                )}

                {discarded.length > 0 && (
                  <p className="stg-gal-note stg-gal-note--warn">
                    {t('settings.themes.discarded', String(discarded.length))}
                  </p>
                )}

                {/* The way into the rest of the bank. It used to be a text
                    toggle that expanded the gallery in place, which read as a
                    minor option and gave 3,960 themes a column the width of a
                    settings pane. It is a card now, it carries the count, and
                    it opens the gallery as a TAB — the same gesture as opening
                    a repo, and in the panel the same one as the interactive
                    rebase. */}
                <button className="stg-browse" onClick={onBrowseThemes} disabled={!onBrowseThemes}>
                  <span className="stg-browse-strip" aria-hidden="true">
                    {preview.map(r => (
                      <span key={r.id} className="stg-browse-chip" style={{ background: r.canvas, borderColor: r.border }}>
                        <i style={{ background: r.accent }} />
                      </span>
                    ))}
                  </span>
                  <span className="stg-browse-text">
                    <span className="stg-browse-title">
                      {bankCount
                        ? t('settings.themes.browseCount', bankCount.toLocaleString())
                        : t('settings.themes.browse')}
                    </span>
                    <span className="stg-browse-sub">{t('settings.themes.browseSub')}</span>
                  </span>
                  <Icon name="chevronRight" size={16} className="stg-browse-go" />
                </button>

                <h2 className="stg-section-title" style={{ marginTop: 20 }}>{t('settings.date.title')}</h2>
                <p className="stg-desc">{t('settings.date.desc')}</p>
                <div className="stg-segment">
                  <button
                    className={`stg-segment-btn ${get('dateFormat', 'relative') === 'relative' ? 'active' : ''}`}
                    onClick={() => set('dateFormat', 'relative')}
                  >{t('settings.date.relative')} <span className="stg-segment-hint">{t('settings.date.relativeHint')}</span></button>
                  <button
                    className={`stg-segment-btn ${get('dateFormat', 'relative') === 'absolute' ? 'active' : ''}`}
                    onClick={() => set('dateFormat', 'absolute')}
                  >{t('settings.date.absolute')} <span className="stg-segment-hint">{t('settings.date.absoluteHint')}</span></button>
                </div>
              </div>
            )
}
