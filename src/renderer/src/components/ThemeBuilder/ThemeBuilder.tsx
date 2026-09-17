import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLang } from '../../i18n/LanguageContext'
import { useSettings, setInstalledThemes, getInstalledThemes, DRAFT_THEME_ID, type InstalledThemeInfo } from '../../contexts/SettingsContext'
import { Icon } from '../Icon/Icon'
import { useThemeBuilder, closeThemeBuilder } from './builderStore'
import {
  SEED_GROUPS, LICENCES, HEX, seedsOfTheme, slugId, payloadFromDraft, validateDraft,
  errorsBySeed, serialize, parseImport, type Seeds, type Licence,
} from './seeds'
import { readTokenMap, describeElement, type Inspection } from './inspect'
import type { SeedKey } from '../../../../main/theme-validate'
import './ThemeBuilder.css'

// The theme builder (#242): a drawer over the app, and the app is the preview.
//
// A theme is 24 seeds; every colour on screen derives from them. So there is
// nothing to "set the commit button's colour" — the drawer edits the seeds,
// the whole window repaints as you type, and the inspect mode answers the
// other question: click anything, and see which seed it derives from. The
// drawer never covers the graph and never opens a tab, because a preview you
// cannot see beside the controls is not a preview.
//
// Saving installs the theme through the same store and validator as one from
// the bank; the rules are shown live here, but the renderer is sandboxed and
// shared and never decides what reaches the stylesheet.

const DEFAULT_THEME = 'aqua-dark'

/** The drawer, or nothing. Mounted once at each product's root. */
export default function ThemeBuilder() {
  const { open, from } = useThemeBuilder()
  if (!open) return null
  return <ThemeBuilderDrawer key={from ?? ''} from={from} />
}

function fullSeeds(id: string): { seeds: Seeds; found: boolean } {
  const base = (seedsOfTheme(DEFAULT_THEME) ?? {}) as Seeds
  const own = seedsOfTheme(id)
  return { seeds: { ...base, ...(own ?? {}) } as Seeds, found: !!own }
}

function ThemeBuilderDrawer({ from }: { from: string | null }) {
  const { t } = useLang()
  const { get, set, previewSeeds, appliedTheme } = useSettings()
  const source = from ?? get('theme', DEFAULT_THEME)
  const installed: InstalledThemeInfo | undefined = getInstalledThemes().find(x => x.id === source)

  const [name, setName] = useState<string>(() => installed?.name ?? '')
  const [lic, setLic] = useState<Licence>(() => (LICENCES as readonly string[]).includes(installed?.lic ?? '') ? installed!.lic as Licence : 'MIT')
  const [seeds, setSeeds] = useState<Seeds>(() => {
    if (installed) return { ...fullSeeds(DEFAULT_THEME).seeds, ...installed.seeds } as Seeds
    return fullSeeds(source).seeds
  })
  // Editing an installed theme keeps its id: saving is an update. A new one
  // takes its id from its name.
  const id = installed ? installed.id : slugId(name || t('builder.untitled'))

  const payload = useMemo(() => payloadFromDraft({ id, name: name || t('builder.untitled'), lic, seeds }), [id, name, lic, seeds, t])
  const check = useMemo(() => validateDraft(payload), [payload])
  const bySeed = useMemo(() => errorsBySeed(check.errors), [check])

  // ── The app is the preview ────────────────────────────────────────────
  useEffect(() => { previewSeeds(seeds) }, [seeds, previewSeeds])
  useEffect(() => () => { previewSeeds(null) }, [previewSeeds])
  // A setting changed under us re-applied the real theme; put the draft back.
  useEffect(() => {
    if (!appliedTheme.startsWith(DRAFT_THEME_ID)) previewSeeds(seeds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedTheme])

  // ── Inspect ────────────────────────────────────────────────────────────
  const [inspecting, setInspecting] = useState(false)
  const [picked, setPicked] = useState<Inspection | null>(null)
  useEffect(() => {
    if (!inspecting) return
    const map = readTokenMap()
    const onClick = (e: MouseEvent): void => {
      const target = e.target as Element | null
      if (!target || target.closest('[data-theme-builder]')) return
      e.preventDefault()
      e.stopPropagation()
      setPicked(describeElement(target, map))
    }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setInspecting(false) }
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKey, true)
    document.documentElement.classList.add('gv-inspecting')
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKey, true)
      document.documentElement.classList.remove('gv-inspecting')
    }
  }, [inspecting])

  const rows = useRef<Partial<Record<SeedKey, HTMLDivElement | null>>>({})
  const [flash, setFlash] = useState<SeedKey | null>(null)
  const jumpTo = useCallback((seed: string) => {
    const el = rows.current[seed as SeedKey]
    el?.scrollIntoView({ block: 'center' })
    setFlash(seed as SeedKey)
    window.setTimeout(() => setFlash(null), 1200)
  }, [])

  // ── Save, copy, paste ──────────────────────────────────────────────────
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const save = useCallback(async () => {
    if (!check.ok || busy) return
    setBusy(true); setStatus(null)
    try {
      const r = await window.gitAPI.themesInstallFromSeeds?.(payload)
      if (!r?.success) { setStatus({ kind: 'err', text: r?.error ?? t('builder.saveFailed') }); return }
      const list = await window.gitAPI.themesInstalled?.()
      setInstalledThemes(list?.themes ?? [])
      previewSeeds(null)
      set('theme', payload.id)
      setStatus({ kind: 'ok', text: t('builder.saved') })
    } catch (e: any) {
      setStatus({ kind: 'err', text: e?.message ?? String(e) })
    } finally { setBusy(false) }
  }, [check.ok, busy, payload, previewSeeds, set, t])

  const copy = useCallback(async () => {
    try { await navigator.clipboard.writeText(serialize(payload)); setStatus({ kind: 'ok', text: t('builder.copied') }) }
    catch { setStatus({ kind: 'err', text: t('builder.copyFailed') }) }
  }, [payload, t])

  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const load = useCallback(() => {
    const r = parseImport(pasteText)
    if (!r.ok) { setStatus({ kind: 'err', text: t('builder.badJson', r.why) }); return }
    setSeeds(prev => ({ ...prev, ...r.seeds }) as Seeds)
    if (r.name && !installed) setName(r.name)
    if (r.lic) setLic(r.lic)
    setPasteOpen(false); setPasteText('')
    setStatus({ kind: 'ok', text: t('builder.loaded') })
  }, [pasteText, installed, t])

  const setSeed = useCallback((k: SeedKey, v: string) => {
    setSeeds(prev => ({ ...prev, [k]: v.toUpperCase() }))
  }, [])

  const sourceName = installed?.name ?? source

  return (
    <aside className="thb-drawer" data-theme-builder role="dialog" aria-label={t('builder.title')}>
      <header className="thb-head">
        <Icon name="ink" size={16} />
        <h2 className="thb-title">{t('builder.title')}</h2>
        <span className="thb-from">{t('builder.startsFrom', sourceName)}</span>
        <button className="thb-icon" title={t('builder.close')} aria-label={t('builder.close')} onClick={closeThemeBuilder}>×</button>
      </header>

      <div className="thb-fields">
        <label className="thb-field">
          <span>{t('builder.name')}</span>
          <input value={name} placeholder={t('builder.untitled')} onChange={e => setName(e.target.value)} disabled={!!installed} />
        </label>
        <label className="thb-field thb-field--lic">
          <span>{t('builder.licence')}</span>
          <select value={lic} onChange={e => setLic(e.target.value as Licence)}>
            {LICENCES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
      </div>

      <div className="thb-actions">
        <button className={`thb-btn ${inspecting ? 'thb-btn--on' : ''}`} onClick={() => { setInspecting(v => !v); setPicked(null) }} aria-pressed={inspecting}>
          <Icon name="eye" size={14} /> {t('builder.inspect')}
        </button>
        <button className="thb-btn" onClick={copy}><Icon name="copy" size={14} /> {t('builder.copyJson')}</button>
        <button className="thb-btn" onClick={() => setPasteOpen(v => !v)} aria-expanded={pasteOpen}>{t('builder.pasteJson')}</button>
        <span className="thb-spring" />
        <button className="thb-btn thb-btn--primary" onClick={save} disabled={!check.ok || busy}>{t('builder.save')}</button>
      </div>

      {pasteOpen && (
        <div className="thb-paste">
          <p className="thb-hint">{t('builder.pasteHint')}</p>
          <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={5} spellCheck={false} />
          <button className="thb-btn thb-btn--primary" onClick={load} disabled={!pasteText.trim()}>{t('builder.load')}</button>
        </div>
      )}

      {status && <p className={`thb-status thb-status--${status.kind}`} role="status">{status.text}</p>}
      <p className={`thb-rules ${check.ok ? 'thb-rules--ok' : 'thb-rules--bad'}`}>
        {check.ok ? t('builder.valid') : t('builder.rules', check.errors.length)}
      </p>

      {inspecting && (
        <div className="thb-inspect">
          <p className="thb-hint">{t('builder.inspectHint')}</p>
          {picked ? (
            <>
              <div className="thb-picked-name">{picked.name}</div>
              <code className="thb-picked-id">{picked.id}</code>
              <ul className="thb-picked-tokens">
                {picked.tokens.map(tok => (
                  <li key={tok.token}>
                    <code>{tok.token}</code>
                    <span className="thb-picked-prop">{tok.property}</span>
                    <span className="thb-picked-seeds">
                      {tok.seeds.map(s => (
                        <button key={s} className="thb-seed-chip" title={t('builder.jump')} onClick={() => jumpTo(s)}>
                          <i style={{ background: seeds[s as SeedKey] }} />{s}
                        </button>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : picked === null && <p className="thb-hint thb-hint--soft">{t('builder.inspectNone')}</p>}
        </div>
      )}

      <div className="thb-groups">
        {SEED_GROUPS.map(g => (
          <section key={g.id} className="thb-group">
            <h3 className="thb-group-title">{t(`builder.group.${g.id}` as any)}</h3>
            {g.seeds.map(k => {
              const errs = bySeed[k]
              const lane = k.startsWith('lane-') ? Number(k.slice(5)) : null
              return (
                <div key={k} ref={el => { rows.current[k] = el }}
                  className={`thb-row ${errs ? 'thb-row--bad' : ''} ${flash === k ? 'thb-row--flash' : ''}`}>
                  <input type="color" className="thb-swatch" value={seeds[k]} aria-label={k}
                    onChange={e => setSeed(k, e.target.value)} />
                  <div className="thb-row-main">
                    <div className="thb-row-head">
                      <code className="thb-seed">{k}</code>
                      <input className="thb-hex" value={seeds[k]} spellCheck={false} maxLength={7}
                        onChange={e => { const v = e.target.value; if (HEX.test(v)) setSeed(k, v) }}
                        onBlur={e => { if (!HEX.test(e.target.value)) e.target.value = seeds[k] }} />
                    </div>
                    <div className="thb-role">{lane ? t('builder.seed.lane', lane) : t(`builder.seed.${k}` as any)}</div>
                    {errs && <ul className="thb-errs">{errs.map(e => <li key={e}>{e}</li>)}</ul>}
                  </div>
                </div>
              )
            })}
          </section>
        ))}
      </div>
    </aside>
  )
}
