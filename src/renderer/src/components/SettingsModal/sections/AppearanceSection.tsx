// Settings › appearance. Reads its slice of the page's state; the state itself lives in useSettingsPage.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../../Icon/Icon'
import { isVSCodeHost, followsEditor } from '../../../contexts/SettingsContext'
import { THEME_PRESETS, SaveNote } from '../shared'
import { openThemeBuilder } from '../../ThemeBuilder/builderStore'
import type { SettingsPage } from '../useSettingsPage'

export function AppearanceSection({ page }: { page: SettingsPage }) {
  const { t, settings, get, set, installed, discarded, bankCount, preview, themePickerDisabled, removeTheme, onBrowseThemes } = page
  // The shelf's strip (#242): which edges are reached, so the fade is only
  // where there is something behind it; the mouse wheel slides it when the
  // strip can move that way, and leaves the page alone otherwise.
  const stripRef = useRef<HTMLDivElement>(null)
  const [stripEdges, setStripEdges] = useState({ start: true, end: false })
  const measureStrip = useCallback(() => {
    const el = stripRef.current
    if (!el) return
    setStripEdges({ start: el.scrollLeft <= 1, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 })
  }, [])
  useEffect(() => {
    measureStrip()
    const el = stripRef.current
    if (!el) return
    el.querySelector('.stg-tile.active')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' })
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      const can = e.deltaY > 0 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 0
      if (!can) return
      e.preventDefault()
      el.scrollBy({ left: e.deltaY })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measureStrip) : null
    ro?.observe(el)
    return () => { el.removeEventListener('wheel', onWheel); ro?.disconnect() }
  }, [measureStrip, installed.length])
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

                {/* ── Layout (#240) ── the frame: the panes as cards, or edge to
                    edge, in both products. Each option carries data-layout on
                    its own preview, for the same reason the density's does. */}
                {(
                  <>
                    <h2 className="stg-section-title" style={{ marginTop: 8 }}>{t('settings.layout.title')}</h2>
                    <p className="stg-desc">{t('settings.layout.desc')}</p>
                    <div className="stg-density" role="radiogroup" aria-label={t('settings.layout.title')}>
                      {(['blocks', 'flush'] as const).map(l => (
                        <label key={l} className={`stg-density-opt ${get('layout', 'blocks') === l ? 'stg-density-opt--on' : ''}`}>
                          <input
                            type="radio"
                            name="gv-layout"
                            value={l}
                            checked={get('layout', 'blocks') === l}
                            onChange={() => set('layout', l)}
                          />
                          <span className="stg-layout-preview" data-layout={l} aria-hidden>
                            <span className="stg-layout-pane" />
                            <span className="stg-layout-pane stg-layout-pane--wide" />
                            <span className="stg-layout-pane" />
                          </span>
                          <span className="stg-density-label">{t(`settings.layout.${l}` as any)}</span>
                        </label>
                      ))}
                    </div>
                  </>
                )}

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
                {/* Your own theme (#242), first: the one thing here that is
                    not a choice among ready-made ones. A drawer over the app,
                    which is the preview, starting from the theme in use. */}
                <button className="stg-cta" onClick={() => openThemeBuilder(get('theme', 'aqua-dark'))}>
                  <span className="stg-cta-icon" aria-hidden="true"><Icon name="ink" size={26} /></span>
                  <span className="stg-cta-text">
                    <strong>{t('builder.card')}</strong>
                    <span>{t('builder.cardHint')}</span>
                  </span>
                  <span className="stg-cta-go">{t('builder.cardGo')}</span>
                </button>

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
                      current theme.

                      The shelf (#242): every theme, on two rows that slide
                      sideways, and at their end the bank's card, which does
                      not move. What arrives from the right fades in rather
                      than popping at the edge; the theme in use is scrolled
                      into view once. Installed themes sit with the built-in
                      ones — the distinction is ours, not the user's. */}
                  <div className="stg-shelf">
                    <div
                      className={`stg-strip${stripEdges.start ? ' stg-strip--start' : ''}${stripEdges.end ? ' stg-strip--end' : ''}`}
                      ref={stripRef}
                      onScroll={measureStrip}
                    >
                      <ul className="stg-wall stg-wall--strip">
                        {[
                          ...THEME_PRESETS.map(th => ({ id: th.id, name: th.name ?? t(th.key as any), removable: false })),
                          ...installed.map(th => ({ id: th.id, name: th.name, removable: true })),
                        ].map(tile => (
                          <li key={tile.id} className={`stg-tile ${get('theme', 'aqua-dark') === tile.id ? 'active' : ''}`}>
                            <span className="stg-tile-mock stg-tile-mock--seeded" data-theme={tile.id} aria-hidden="true">
                              <span className="stg-tile-rail" />
                              <span className="stg-tile-row"><i className="stg-tile-node" /><i className="stg-tile-bar" style={{ width: '64%' }} /></span>
                              <span className="stg-tile-row"><i className="stg-tile-node" /><i className="stg-tile-bar stg-tile-bar--dim" style={{ width: '44%' }} /></span>
                              <span className="stg-tile-row"><i className="stg-tile-node" /><i className="stg-tile-bar" style={{ width: '54%' }} /></span>
                              <span className="stg-tile-btn" />
                            </span>
                            {tile.removable && (
                              <button
                                className="stg-tile-remove"
                                title={t('settings.themes.remove')}
                                aria-label={`${t('settings.themes.remove')} ${tile.name}`}
                                onClick={() => removeTheme(tile.id)}
                              >×</button>
                            )}
                            <span className="stg-tile-meta">
                              <span className="stg-tile-name">{tile.name}</span>
                            </span>
                            <button
                              className="stg-tile-action"
                              onClick={() => set('theme', tile.id)}
                              disabled={get('theme', 'aqua-dark') === tile.id}
                              aria-pressed={get('theme', 'aqua-dark') === tile.id}
                            >{get('theme', 'aqua-dark') === tile.id ? t('settings.themes.applied') : t('settings.themes.use')}</button>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* The way into the rest of the bank: a card the height of
                        both rows, still while the tiles slide. It carries the
                        count and opens the gallery as a TAB — the same gesture
                        as opening a repo, and in the panel the same one as the
                        interactive rebase. */}
                    <button className="stg-browse stg-browse--tall" onClick={onBrowseThemes} disabled={!onBrowseThemes}>
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
                      <span className="stg-browse-go" aria-hidden="true"><Icon name="chevronRight" size={16} /></span>
                    </button>
                  </div>
                </fieldset>

                {discarded.length > 0 && (
                  <p className="stg-gal-note stg-gal-note--warn">
                    {t('settings.themes.discarded', String(discarded.length))}
                  </p>
                )}

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
