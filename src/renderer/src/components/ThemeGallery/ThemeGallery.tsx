import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { useLang } from '../../i18n/LanguageContext'
import { useSettings, setInstalledThemes } from '../../contexts/SettingsContext'
import './ThemeGallery.css'

// The rest of the bank — the themes that are not among the 32 in tokens.css.
//
// Everything here runs on ONE fetch. The catalogue is ~150 KB gzipped for
// 3,960 themes and carries every field the list needs, so search and all four
// filters run in memory: no request per keystroke, no request per filter, and
// the whole thing keeps working once cached with no network at all.
//
// The renderer never fetches directly — it is sandboxed and shared with the
// VS Code panel. `window.gitAPI.themes*` goes to the main process (desktop) or
// GitVertexHost (extension), which run the same store and the same validator.

export interface CatalogueRow {
  id: string
  name: string
  dark: boolean
  canvas: string
  text: string
  border: string
  accent: string
  lic: string
  src: string
  version: string
  hue: string
  vivid: string
  dl: number
}

interface Catalogue {
  version: number
  generatedAt: string
  count: number
  themes: CatalogueRow[]
  stale?: boolean
  error?: string
}

/** The eleven buckets, in the order the spec cuts them off the OKLCH wheel. */
const HUES = ['red', 'orange', 'amber', 'lime', 'green', 'teal',
  'cyan', 'blue', 'indigo', 'violet', 'pink'] as const

/** Explicit rather than built from a template literal, so every key stays a
 *  checked TranslationKey instead of an `as any`. */
const APPEARANCES = [
  { id: 'both' as const, key: 'settings.themes.appearance.both' as const },
  { id: 'dark' as const, key: 'settings.themes.appearance.dark' as const },
  { id: 'light' as const, key: 'settings.themes.appearance.light' as const },
]
const SORTS = [
  { id: 'popular' as const, key: 'settings.themes.sort.popular' as const },
  { id: 'name' as const, key: 'settings.themes.sort.name' as const },
]
const VIVIDS = [
  { id: 'vivid' as const, key: 'settings.themes.vivid.vivid' as const },
  { id: 'muted' as const, key: 'settings.themes.vivid.muted' as const },
  { id: 'neutral' as const, key: 'settings.themes.vivid.neutral' as const },
]

/** How many rows are on screen at once. 3,960 of them will not be rendered:
 *  the list grows a page at a time rather than all at once. */
const PAGE = 60

/** Case- and accent-insensitive, so "rose pine" finds "Rosé Pine". */
function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

interface Props {
  /** Called after an install so a picker elsewhere can refresh. Optional: the
   *  gallery is a VIEW now and usually has no parent holding theme state. */
  onChanged?: () => void
}

export default function ThemeGallery({ onChanged }: Props) {
  const { t } = useLang()
  // Reads and writes the setting itself. As a tab there is no settings page
  // above it to pass `currentTheme` down, and going through the context means
  // applying a theme from here behaves exactly like applying one from there.
  const { get, set } = useSettings()
  const currentTheme = get('theme', 'aqua-dark')
  const [installedIds, setInstalledIds] = useState<string[]>([])
  const refreshInstalled = useCallback(() => {
    window.gitAPI.themesInstalled?.()
      .then((list: any) => {
        const themes = Array.isArray(list) ? list : []
        // Not just local state: setInstalledThemes INJECTS the [data-theme]
        // rule for each installed theme. Without it, applying one sets the
        // attribute on <html> and selects nothing — the id sticks, the colours
        // do not, and it reads as "my choice was ignored". That is exactly what
        // shipped when this component was made self-managing and copied the
        // fetch without the injection.
        setInstalledThemes(themes)
        setInstalledIds(themes.map((i: any) => i.id))
      })
      .catch(() => { /* older host, or nothing installed */ })
  }, [])
  useEffect(() => { refreshInstalled() }, [refreshInstalled])
  const onApply = useCallback((id: string) => set('theme', id), [set])
  const [cat, setCat] = useState<Catalogue | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [appearance, setAppearance] = useState<'both' | 'dark' | 'light'>('both')
  const [hue, setHue] = useState<string | null>(null)
  const [vivid, setVivid] = useState<string | null>(null)
  const [sort, setSort] = useState<'popular' | 'name'>('popular')
  const [shown, setShown] = useState(PAGE)
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState<{ id: string; why: string } | null>(null)
  // Which row has its licence panel open. Installing shows the notice first —
  // the palettes are other people's work, under licences that require the
  // notice to travel with them.
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const ask = window.gitAPI.themesCatalogue
    if (!ask) { setLoading(false); return }
    ask()
      .then(c => { if (alive) { setCat(c as Catalogue); setLoading(false) } })
      .catch(() => { if (alive) { setCat(null); setLoading(false) } })
    return () => { alive = false }
  }, [])

  // One pass over the catalogue per change of any input, and nothing else.
  const rows = useMemo(() => {
    if (!cat) return []
    const q = fold(query.trim())
    const out = cat.themes.filter(r => {
      if (q && !fold(r.name).includes(q)) return false
      if (appearance === 'dark' && !r.dark) return false
      if (appearance === 'light' && r.dark) return false
      if (hue && r.hue !== hue) return false
      if (vivid && r.vivid !== vivid) return false
      return true
    })
    // `dl` is brutally skewed — 2.1M at the top, 1,961 at the median — so past
    // the first few hundred the number stops meaning anything and the name is
    // the more useful order. It is the secondary key either way.
    out.sort((a, b) => sort === 'name'
      ? a.name.localeCompare(b.name)
      : (b.dl - a.dl) || a.name.localeCompare(b.name))
    return out
  }, [cat, query, appearance, hue, vivid, sort])

  useEffect(() => { setShown(PAGE) }, [query, appearance, hue, vivid, sort])

  const install = useCallback(async (id: string) => {
    setBusy(id); setFailed(null)
    try {
      const r = await window.gitAPI.themesInstall?.(id)
      // Installing does NOT apply. Browsing a gallery and adding one to your
      // collection should not repaint the app under you — the theme you are
      // reading it in is the theme you chose. The tile switches to "Use", and
      // using it is a second, deliberate click.
      if (r?.success) { refreshInstalled(); onChanged?.(); setExpanded(null) }
      else setFailed({ id, why: r?.error ?? t('settings.themes.installFailed') })
    } catch (e: any) {
      setFailed({ id, why: e?.message ?? String(e) })
    } finally { setBusy(null) }
  }, [onApply, onChanged, refreshInstalled, t])

  if (loading) return <p className="stg-desc">{t('settings.themes.loading')}</p>

  // A settings page must never be blocked by a fetch: the 32 built-in themes
  // sit above this and stay usable, so this degrades to a sentence.
  if (!cat || cat.error) {
    return (
      <p className="stg-gal-note stg-gal-note--warn">
        {cat?.error ?? t('settings.themes.offline')}
      </p>
    )
  }

  return (
    <div className="stg-gallery">
      {/* A view has to lay itself out. This used to sit inside the settings
          page and inherit its padding; as a tab it is the whole surface, so it
          carries the page structure the Launchpad carries — padded head, one
          scrolling body — or the content sits flush against the window edge. */}
      <div className="stg-gal-head">
      {cat.stale && <p className="stg-gal-note">{t('settings.themes.stale')}</p>}

      <div className="stg-gal-controls">
        <input
          className="stg-input stg-gal-search"
          type="search"
          value={query}
          placeholder={t('settings.themes.searchPlaceholder')}
          onChange={e => setQuery(e.target.value)}
          aria-label={t('settings.themes.searchPlaceholder')}
        />

        <div className="stg-segment">
          {APPEARANCES.map(a => (
            <button
              key={a.id}
              className={`stg-segment-btn ${appearance === a.id ? 'active' : ''}`}
              onClick={() => setAppearance(a.id)}
              aria-pressed={appearance === a.id}
            >{t(a.key)}</button>
          ))}
        </div>

        <div className="stg-segment">
          {SORTS.map(s => (
            <button
              key={s.id}
              className={`stg-segment-btn ${sort === s.id ? 'active' : ''}`}
              onClick={() => setSort(s.id)}
              aria-pressed={sort === s.id}
            >{t(s.key)}</button>
          ))}
        </div>
      </div>

      {/* Swatches rather than words: "indigo" and "violet" are not a
          distinction anyone makes reliably in prose, and the buckets are cut
          on hue in the first place. Each swatch is its bucket's centre hue,
          drawn in the same colour space the facet was computed in. */}
      <div className="stg-hues" role="group" aria-label={t('settings.themes.colour')}>
        <button
          className={`stg-hue-any ${hue === null ? 'active' : ''}`}
          onClick={() => setHue(null)}
          aria-pressed={hue === null}
        >{t('settings.themes.all')}</button>
        {HUES.map(h => (
          <button
            key={h}
            className={`stg-hue stg-hue--${h} ${hue === h ? 'active' : ''}`}
            onClick={() => setHue(hue === h ? null : h)}
            aria-pressed={hue === h}
            aria-label={h}
            title={h}
          />
        ))}
      </div>

      <div className="stg-vivids">
        {VIVIDS.map(v => (
          <button
            key={v.id}
            className={`stg-chipfilter ${vivid === v.id ? 'active' : ''}`}
            onClick={() => setVivid(vivid === v.id ? null : v.id)}
            aria-pressed={vivid === v.id}
          >{t(v.key)}</button>
        ))}
      </div>

      <p className="stg-desc stg-gal-count">
        {t('settings.themes.matches', String(rows.length), String(cat.count))}
      </p>
      </div>

      <div className="stg-gal-body">

      {/* The site's wall, tile for tile — 42-git-vertex-web, `.thm-*` in
          styles.css. It is a miniature commit graph rather than a coloured
          square: a lane rail, three commits, and the primary button. Four
          hexes off the catalogue, so a tile costs no request, which is the
          whole reason index.json carries `text` and `border`.

          Same drawing in both products so they read as one thing. The only
          difference is the grid's column width. */}
      <ul className="stg-wall">
        {rows.slice(0, shown).map(r => {
          const isInstalled = installedIds.includes(r.id)
          const isActive = currentTheme === r.id
          const open = expanded === r.id
          return (
            <li key={r.id} className={`stg-tile ${isActive ? 'active' : ''}`}>
              <span className="stg-tile-mock" style={{ background: r.canvas }} aria-hidden="true">
                <span className="stg-tile-rail" style={{ background: r.border }} />
                <span className="stg-tile-row">
                  <i className="stg-tile-node" style={{ background: r.accent }} />
                  <i className="stg-tile-bar" style={{ background: r.text, width: '64%' }} />
                </span>
                <span className="stg-tile-row">
                  <i className="stg-tile-node" style={{ background: r.accent }} />
                  <i className="stg-tile-bar" style={{ background: r.border, width: '44%', opacity: 0.9 }} />
                </span>
                <span className="stg-tile-row">
                  <i className="stg-tile-node" style={{ background: r.accent }} />
                  <i className="stg-tile-bar" style={{ background: r.text, width: '54%' }} />
                </span>
                <span className="stg-tile-btn" style={{ background: r.accent }} />
              </span>

              {isInstalled && (
                <span className="stg-tile-badge">{t('settings.themes.installed')}</span>
              )}

              <span className="stg-tile-meta">
                <span className="stg-tile-name" title={r.name}>{r.name}</span>
                <span className="stg-tile-sub">
                  {r.dark ? t('settings.themes.appearance.dark') : t('settings.themes.appearance.light')}
                  {' · '}{r.lic}
                </span>
              </span>

              {isInstalled
                ? (
                  <button className="stg-tile-action" onClick={() => onApply(r.id)} disabled={isActive}>
                    {isActive ? t('settings.themes.applied') : t('settings.themes.use')}
                  </button>
                )
                : (
                  <button
                    className="stg-tile-action"
                    onClick={() => { setExpanded(open ? null : r.id); setFailed(null) }}
                    aria-expanded={open}
                  >{t('settings.themes.install')}</button>
                )}

              {/* The licence stays a gate, not a footnote: it covers the tile
                  rather than pushing the grid around, so opening one does not
                  reflow every other row. */}
              {open && !isInstalled && (
                <div className="stg-tile-notice">
                  <p className="stg-tile-notice-text">
                    {t('settings.themes.noticeIntro', r.name, r.src, r.version, r.lic)}
                  </p>
                  {failed?.id === r.id && (
                    <p className="stg-gal-note stg-gal-note--warn">{failed.why}</p>
                  )}
                  <div className="stg-gal-notice-actions">
                    <button
                      className="stg-gal-btn stg-gal-btn--primary"
                      disabled={busy === r.id}
                      onClick={() => install(r.id)}
                    >
                      {busy === r.id ? t('settings.themes.installing') : t('settings.themes.confirmInstall')}
                    </button>
                    <button className="stg-gal-btn" onClick={() => setExpanded(null)}>
                      {t('settings.themes.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {rows.length > shown && (
        <button className="stg-gal-btn stg-gal-more" onClick={() => setShown(s => s + PAGE)}>
          {t('settings.themes.showMore', String(Math.min(PAGE, rows.length - shown)))}
        </button>
      )}
      {rows.length === 0 && <p className="stg-desc">{t('settings.themes.noMatch')}</p>}
      </div>
    </div>
  )
}
