import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSeedHistory } from './useSeedHistory'
import { useBuilderWindow } from './useBuilderWindow'
import { useLang } from '../../i18n/LanguageContext'
import { useSettings, setInstalledThemes, getInstalledThemes, DRAFT_THEME_ID, type InstalledThemeInfo } from '../../contexts/SettingsContext'
import { Icon } from '../Icon/Icon'
import { useThemeBuilder, closeThemeBuilder } from './builderStore'
import {
  SEED_GROUPS, LICENCES, HEX, seedsOfTheme, slugId, payloadFromDraft, validateDraft,
  errorsBySeed, serialize, parseImport, type Seeds, type Licence,
} from './seeds'
import { createInspector, drawablePlaces, type Inspector, type Inspection, type PaintRole } from './inspect'
import { Specimen } from './Specimen'
import type { SeedKey } from '../../../../main/theme-validate'
import './ThemeBuilder.css'

// The theme builder (#242): a drawer over the app, and the app is the preview.
//
// A theme is 24 seeds; every colour on screen derives from them. So there is
// nothing to "set the commit button's colour" — the drawer edits the seeds,
// the whole window repaints as you type, and the inspect mode answers the
// other question: click anything, and see which seed it derives from. The
// drawer floats, docked to the right edge at first, and can be dragged by
// its title bar or opened in a window of its own (`useBuilderWindow`), so
// the app is never hidden behind its own controls; the draft, the
// inspection and the save all stay in the main tree.
//
// Two things make the mapping between a colour and a place legible, because
// a click in the live window is not enough on its own — a panel's padding
// answers with the panel while the eye reads the text in it:
// - the specimen (`Specimen`): the 24 places, a miniature of the app drawn
//   from the seeds, where the word is the seed and a click goes to its row;
// - the places overlay: hovering a seed, there or in the list, boxes every
//   element of the window that seed paints, and says how many.
// And the inspection itself outlines the element that ANSWERS, not the one
// under the pointer, and says what each seed does there: fill, ink, border.
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
  const { container, detach, attach } = useBuilderWindow()
  const [help, setHelp] = useState(false)
  // Docked to the right edge at first, where the old fixed drawer was, and
  // level with the panes: over the details, never over the sidebar and the
  // graph a theme is judged on, and never over the toolbar's search.
  const [position, setPosition] = useState(() => ({
    x: Math.max(0, window.innerWidth - 380 - 24),
    y: Math.round(document.querySelector('.app-body')?.getBoundingClientRect().top ?? 72) + 8,
  }))
  const drag = useRef<{ x: number; y: number } | null>(null)
  // The outline around the hovered element is painted straight onto a
  // ref'd div: a state per mouse move re-rendered the whole drawer sixty
  // times a second while inspecting.
  const hlRef = useRef<HTMLDivElement>(null)
  const selected = useRef<Element | null>(null)
  const paint = useCallback((r: DOMRect | null) => {
    const el = hlRef.current
    if (!el) return
    if (!r) { el.style.display = 'none'; return }
    el.style.display = 'block'
    el.style.left = `${r.left}px`; el.style.top = `${r.top}px`; el.style.width = `${r.width}px`; el.style.height = `${r.height}px`
  }, [])
  useEffect(() => {
    const resize = () => setPosition(p => ({ x: Math.max(0, Math.min(p.x, window.innerWidth - 380)), y: Math.max(0, Math.min(p.y, window.innerHeight - 120)) }))
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  const { get, set, previewSeeds, appliedTheme } = useSettings()
  const source = from ?? get('theme', DEFAULT_THEME)
  const installed: InstalledThemeInfo | undefined = getInstalledThemes().find(x => x.id === source)

  const [name, setName] = useState<string>(() => installed?.name ?? '')
  const [lic, setLic] = useState<Licence>(() => (LICENCES as readonly string[]).includes(installed?.lic ?? '') ? installed!.lic as Licence : 'MIT')
  const { seeds, history, beginEdit, setSeed, importSeeds, undoSeed } = useSeedHistory(() => {
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
  // One reading of the stylesheets per drawer, made on the first need and
  // kept: the rules do not change while the drawer is open, only the draft's
  // seed values, which the reading does not hold.
  const inspector = useRef<Inspector | null>(null)
  const getInspector = useCallback(() => (inspector.current ??= createInspector()), [])
  const [inspecting, setInspecting] = useState(false)
  const [picked, setPicked] = useState<Inspection | null>(null)
  useEffect(() => {
    if (!inspecting) return
    const { describe } = getInspector()
    let outlined: Element | null = selected.current
    const onClick = (e: MouseEvent): void => {
      const target = e.target as Element | null
      if (!target || target.closest('[data-theme-builder]')) return
      e.preventDefault()
      e.stopPropagation()
      const found = describe(target)
      selected.current = found.el
      outlined = found.el
      paint(found.el.getBoundingClientRect())
      setPicked(found)
    }
    const block = (e: Event) => {
      if ((e.target as Element)?.closest('[data-theme-builder]')) return
      e.preventDefault(); e.stopPropagation()
    }
    // Keep the edited element visible while using the floating or detached
    // controls. The builder has its own higher layer and is never inspected.
    const retainSelection = () => {
      outlined = selected.current ?? outlined
      paint(outlined?.getBoundingClientRect() ?? null)
    }
    // The outline follows the element that would ANSWER a click — the
    // nearest that paints — so what is boxed is what the palette will name.
    const onMove = (e: MouseEvent) => {
      const target = e.target as Element
      if (target.closest('[data-theme-builder]')) { retainSelection(); return }
      outlined = describe(target).el
      paint(outlined.getBoundingClientRect())
    }
    const onScroll = () => paint(outlined?.getBoundingClientRect() ?? null)
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setInspecting(false) }
    document.addEventListener('pointerdown', block, true)
    document.addEventListener('mousedown', block, true)
    document.addEventListener('pointerup', block, true)
    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('mouseover', onMove, true)
    window.addEventListener('blur', retainSelection)
    container?.ownerDocument.addEventListener('mousemove', onMove, true)
    document.addEventListener('scroll', onScroll, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKey, true)
    container?.ownerDocument.addEventListener('keydown', onKey, true)
    document.documentElement.classList.add('gv-inspecting')
    return () => {
      document.removeEventListener('pointerdown', block, true)
      document.removeEventListener('mousedown', block, true)
      document.removeEventListener('pointerup', block, true)
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('mouseover', onMove, true)
      window.removeEventListener('blur', retainSelection)
      container?.ownerDocument.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('scroll', onScroll, true)
      document.removeEventListener('click', onClick, true)
      paint(null)
      selected.current = null
      document.removeEventListener('keydown', onKey, true)
      container?.ownerDocument.removeEventListener('keydown', onKey, true)
      document.documentElement.classList.remove('gv-inspecting')
    }
  }, [inspecting, container, paint, getInspector])

  // ── Where a seed paints ────────────────────────────────────────────────
  // Hovering a seed — a place in the specimen, a row of the list — boxes
  // every element of the window it paints. Painted straight into a ref'd
  // host, like the outline: a scroll redraws it without a render.
  const [hint, setHint] = useState<SeedKey | null>(null)
  const [hintCount, setHintCount] = useState<number | null>(null)
  const [placesFolded, setPlacesFolded] = useState(false)
  const placesRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const host = placesRef.current
    if (!host) return
    if (!hint) { host.textContent = ''; setHintCount(null); return }
    const places = getInspector().placesOf(hint)
    let frame = 0
    let first = true
    const draw = () => {
      frame = 0
      const boxes = drawablePlaces(places, window)
      host.textContent = ''
      for (const b of boxes) {
        const box = document.createElement('div')
        box.className = `thb-place thb-place--${b.role}`
        box.style.left = `${b.rect.left}px`; box.style.top = `${b.rect.top}px`
        box.style.width = `${b.rect.width}px`; box.style.height = `${b.rect.height}px`
        host.appendChild(box)
      }
      if (first) { first = false; setHintCount(boxes.length) }
    }
    draw()
    const redraw = () => { if (!frame) frame = requestAnimationFrame(draw) }
    document.addEventListener('scroll', redraw, true)
    window.addEventListener('resize', redraw)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      document.removeEventListener('scroll', redraw, true)
      window.removeEventListener('resize', redraw)
      host.textContent = ''
    }
  }, [hint, getInspector])
  const hintOf = (seed: SeedKey) => ({ onMouseEnter: () => setHint(seed), onMouseLeave: () => setHint(null) })

  const rows = useRef<Partial<Record<SeedKey, HTMLDivElement | null>>>({})
  const [flash, setFlash] = useState<SeedKey | null>(null)
  const jumpTo = useCallback((seed: string) => {
    const el = rows.current[seed as SeedKey]
    // Just under the specimen, which is sticky: centred, the row landed
    // behind it.
    const list = el?.closest('.thb-groups')
    if (el && list) {
      const sticky = list.querySelector('.thb-specimen')?.getBoundingClientRect().height ?? 0
      list.scrollTop += el.getBoundingClientRect().top - list.getBoundingClientRect().top - sticky - 8
    }
    setFlash(seed as SeedKey)
    window.setTimeout(() => setFlash(null), 1200)
  }, [])
  /** A place was chosen: go to its seed, and put the keyboard on its swatch. */
  const pick = useCallback((seed: SeedKey) => {
    jumpTo(seed)
    rows.current[seed]?.querySelector<HTMLInputElement>('input[type="color"]')?.focus({ preventScroll: true })
  }, [jumpTo])

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
    importSeeds(r.seeds)
    if (r.name && !installed) setName(r.name)
    if (r.lic) setLic(r.lic)
    setPasteOpen(false); setPasteText('')
    setStatus({ kind: 'ok', text: t('builder.loaded') })
  }, [pasteText, installed, t, importSeeds])

  const sourceName = installed?.name ?? source

  const editor = (
    <aside className={`thb-drawer ${container ? 'thb-drawer--detached' : ''}`} style={container ? undefined : { left: position.x, top: position.y, height: `min(920px, calc(100vh - ${position.y + 16}px))` }} data-theme-builder role="dialog" aria-label={t('builder.title')}>
      <header className="thb-head" title={t('builder.move')}
        onPointerDown={e => {
          if (container || (e.target as Element).closest('button')) return
          drag.current = { x: e.clientX - position.x, y: e.clientY - position.y }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={e => {
          if (!drag.current) return
          setPosition({ x: Math.max(0, Math.min(e.clientX - drag.current.x, window.innerWidth - 380)), y: Math.max(0, Math.min(e.clientY - drag.current.y, window.innerHeight - 120)) })
        }}
        onPointerUp={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }}>
        <Icon name="ink" size={16} />
        <h2 className="thb-title">{t('builder.title')}</h2>
        <span className="thb-from">{t('builder.startsFrom', sourceName)}</span>
        <button className="thb-icon" title={t('builder.close')} aria-label={t('builder.close')} onClick={closeThemeBuilder}>×</button>
      </header>

      <div className="thb-actions">
        {window.appInfo?.platform !== 'vscode' && <button className="thb-btn" onClick={container ? attach : detach}>{t(container ? 'builder.attach' : 'builder.detach')}</button>}
        <button className="thb-btn" aria-expanded={help} onClick={() => setHelp(v => !v)}>{t('builder.help')}</button>
      </div>
      {help && <ol className="thb-help">
        <li>{t('builder.helpMove')}</li><li>{t('builder.helpSelect')}</li>
        <li>{t('builder.helpColor')}</li><li>{t('builder.helpSave')}</li>
      </ol>}
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

      {(inspecting || picked) && (
        <div className="thb-inspect">
          <p className="thb-hint">{t('builder.inspectHint')}</p>
          {picked ? (
            <>
              <div className="thb-picked-name">{picked.name}</div>
              <code className="thb-picked-id">{picked.id}</code>
              <p className="thb-hint">{t(picked.tokens.length ? 'builder.sharedColor' : 'builder.noToken')}</p>
              <div className="thb-quick-colors">
                {seedRoles(picked).filter(r => r.seed in seeds).map(({ seed: k, roles, inherited }) => (
                  <div key={k} className="thb-quick-color" {...hintOf(k)}>
                    <input type="color" className="thb-swatch" value={seeds[k]} aria-label={`${t('builder.edit')} ${k}`}
                      onFocus={beginEdit} onPointerDown={beginEdit} onChange={e => setSeed(k, e.target.value)} />
                    <button className="thb-seed-chip" title={t('builder.jump')} onClick={() => pick(k)}>{k}</button>
                    <span className="thb-role-tag">
                      {roles.map(r => t(`builder.role.${r}` as any)).join(' · ')}{inherited ? ` — ${t('builder.role.inherited')}` : ''}
                    </span>
                    <button className="thb-btn thb-undo" title={`${t('builder.undoColor')} — ${k}`} aria-label={`${t('builder.undoColor')} ${k}`}
                      disabled={!history[k]?.length} onClick={() => undoSeed(k)}>↶</button>
                  </div>
                ))}
              </div>
            </>
          ) : picked === null && <p className="thb-hint thb-hint--soft">{t('builder.inspectNone')}</p>}
        </div>
      )}

      <div className="thb-groups">
        <Specimen hint={hint} onHint={setHint} onPick={pick} count={hintCount} collapsed={placesFolded} onToggle={() => setPlacesFolded(v => !v)} />
        {SEED_GROUPS.map(g => (
          <section key={g.id} className="thb-group">
            <h3 className="thb-group-title">{t(`builder.group.${g.id}` as any)}</h3>
            {g.seeds.map(k => {
              const errs = bySeed[k]
              const lane = k.startsWith('lane-') ? Number(k.slice(5)) : null
              return (
                <div key={k} ref={el => { rows.current[k] = el }} {...hintOf(k)}
                  className={`thb-row ${errs ? 'thb-row--bad' : ''} ${flash === k ? 'thb-row--flash' : ''}`}>
                  <input type="color" className="thb-swatch" value={seeds[k]} aria-label={k}
                    onFocus={beginEdit} onPointerDown={beginEdit} onChange={e => setSeed(k, e.target.value)} />
                  <div className="thb-row-main">
                    <div className="thb-row-head">
                      <code className="thb-seed">{k}</code>
                      <HexField value={seeds[k]} label={k} onFocus={beginEdit} onChange={v => setSeed(k, v)} />
                      <button className="thb-btn thb-undo" title={`${t('builder.undoColor')} — ${k}`} aria-label={`${t('builder.undoColor')} ${k}`}
                        disabled={!history[k]?.length} onClick={() => undoSeed(k)}>↶</button>
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
  return <>
    {container ? createPortal(editor, container) : editor}
    {inspecting && <div ref={hlRef} className="thb-highlight" style={{ display: 'none' }} aria-hidden="true" />}
    <div ref={placesRef} className="thb-places" data-theme-builder aria-hidden="true" />
  </>
}

/** The seeds an inspection names, each with what it does on the element, own tokens first. */
function seedRoles(picked: Inspection): { seed: SeedKey; roles: PaintRole[]; inherited: boolean }[] {
  const out = new Map<SeedKey, { seed: SeedKey; roles: PaintRole[]; inherited: boolean }>()
  for (const tok of picked.tokens) {
    for (const s of tok.seeds) {
      const seed = s as SeedKey
      const row = out.get(seed) ?? { seed, roles: [], inherited: true }
      if (!row.roles.includes(tok.role)) row.roles.push(tok.role)
      if (!tok.inherited) row.inherited = false
      out.set(seed, row)
    }
  }
  return Array.from(out.values())
}

function HexField({ value, label, onChange, onFocus }: { value: string; label: string; onChange: (value: string) => void; onFocus: () => void }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return <input className="thb-hex" value={text} onFocus={onFocus} aria-label={`${label} hex`} spellCheck={false} maxLength={7}
    onChange={e => { setText(e.target.value); if (HEX.test(e.target.value)) onChange(e.target.value) }}
    onBlur={() => setText(value)} onKeyDown={e => { if (e.key === 'Escape') setText(value) }} />
}
