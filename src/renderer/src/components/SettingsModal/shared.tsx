// What the settings page is made of, outside any one section: the sections and their
// nav, the AI catalogue helpers, the theme presets, the small controls. Split out of
// SettingsModal.tsx so that the page, its state and each section can be read alone.
import React, { useState } from 'react'
import { Icon } from '../Icon/Icon'
import { Brand } from '../BrandMark/BrandMark'
import { modelKind } from '../../utils/aiModelKind'
import { AI_PROVIDER_CATALOG, type AIProviderDef } from '../../utils/aiProviders'
import { translations } from '../../i18n/translations'
import { type ThemeId } from '../../contexts/SettingsContext'
import { parseAutolinks, type Autolink } from '../../utils/autolinks'
import { useLang } from '../../i18n/LanguageContext'

/**
 * Like parseAutolinks, but keeps half-typed rows on screen. The strict parser
 * drops anything it could not read back, which while you are still typing the
 * URL means the row you are working in disappears under the cursor.
 */
export function parseAutolinksLoose(raw: string): Autolink[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.map((r: any) => ({ prefix: String(r?.prefix ?? ''), url: String(r?.url ?? '') }))
  } catch { return parseAutolinks(raw) }
}

export type Section = 'git' | 'appearance' | 'graph' | 'github' | 'ai' | 'notifications' | 'externalTools' | 'ssh' | 'about'

export const SECTIONS: Section[] = ['git', 'appearance', 'graph', 'github', 'ai', 'notifications', 'externalTools', 'ssh', 'about']

/**
 * Which section was last read.
 *
 * Settings is a tab now, so leaving it is a click on another tab rather than a
 * decision to close it — and coming back to the top of the list every time is
 * the tab forgetting what you were doing. React unmounts the body of a tab you
 * are not looking at, so this outlives the component rather than sitting in it.
 */
export const SECTION_KEY = 'gv-settings-section'

export function lastSection(): Section {
  const saved = localStorage.getItem(SECTION_KEY) as Section | null
  return saved && SECTIONS.includes(saved) ? saved : 'git'
}

// Provider ids are open strings since #169 — the catalog plus whatever the
// user defined. The old four-way union lives on only in the tutorial gate.
export type AIProvider = string

// Sections hidden in the VS Code panel (`embedded`) — desktop-only concerns
// already handled by VS Code itself (SSH, external tools/terminal) or not
// reachable there (Init isn't wired into the extension).
export const DESKTOP_ONLY_SECTIONS: Section[] = ['externalTools', 'ssh', 'about']

// What each section is about, for the search box above the nav: the English
// strings of the keys each section renders, by family. A query matches a
// section when it appears in its name or anywhere in its text — "gpg" finds
// Identity, "autolink" finds GitHub — so nine sections and their long lists
// need not be walked to find one control.
export const SECTION_TEXT: Record<Section, string[]> = {
  // 'settings.scope.' is here and in ssh on purpose: the two sections that
  // write ~/.gitconfig are the two a search for "gitconfig" should find.
  git: ['settings.git.', 'settings.profiles.', 'settings.profile', 'settings.defaultProfile', 'settings.saveAsProfile', 'settings.gitBinary.', 'settings.gpg.', 'settings.scope.'],
  appearance: ['settings.appearance.', 'settings.theme.', 'settings.themes.', 'settings.date.', 'settings.lang.'],
  graph: ['settings.graph.'],
  github: ['settings.github.', 'settings.autolinks.'],
  ai: ['settings.ai.'],
  notifications: ['settings.behavior.', 'settings.general.', 'settings.notifications.'],
  externalTools: ['settings.externalTools.'],
  ssh: ['settings.ssh.', 'settings.scope.'],
  about: ['settings.about.', 'settings.update.', 'settings.installAndRestart'],
}

export const sectionText = (() => {
  const en = translations.en as Record<string, unknown>
  const out = {} as Record<Section, string>
  for (const id of SECTIONS) {
    out[id] = Object.entries(en)
      .filter(([k, v]) => typeof v === 'string' && SECTION_TEXT[id].some(p => k.startsWith(p)))
      .map(([, v]) => v as string).join(' ').toLowerCase()
  }
  return out
})()

/** How many built-in themes the picker shows before "show all". */
export const THEMES_FOLDED = 8

// ── Nav icons ─────────────────────────────────────────────────
// These were seven `<path>` sets inside a local NavIcon wrapper that spelled
// out our own spec a second time — grid 24, stroke 1.7, round caps. They are
// files in components/Icon/icons now, like everything else.
export const IconIdentity = () => <Icon name="person" />

export const IconAppearance = () => <Icon name="sliders" />

export const IconGraph = () => <Icon name="node" />

export const IconShield = () => <Icon name="shield" />

export const IconGithubMark = () => <Brand name="github" size={16} />

// Same sparkle glyph already used for the AI actions in ConflictResolver —
// reused here instead of a new one, so "AI" reads the same everywhere.
export const IconSparkle = () => (
  <Icon name="ai" />
)

export const IconActivity = () => <Icon name="activity" />

export const IconTool = () => <Icon name="wrench" />

export const IconInfo = () => <Icon name="info" />

// Grouped navigation with icons. `label` holds an i18n key, resolved with
// t() at render.
// SSH sits next to Identity & profiles (which already hosts GPG signing) —
// both are "credentials used for git operations", not a "system" concern.
export const NAV_GROUPS: { group: string; items: { id: Section; icon: React.ReactNode; label: string }[] }[] = [
  { group: 'settings.grp.general', items: [
    { id: 'git',        icon: <IconIdentity/>,   label: 'settings.sec.identity' },
    { id: 'appearance', icon: <IconAppearance/>, label: 'settings.sec.appearance' },
    { id: 'graph',      icon: <IconGraph/>,      label: 'settings.sec.graph' },
    { id: 'ssh',        icon: <IconShield/>,     label: 'settings.sec.ssh' },
  ]},
  { group: 'settings.grp.integrations', items: [
    { id: 'github', icon: <IconGithubMark/>, label: 'settings.sec.github' },
    { id: 'ai',     icon: <IconSparkle/>,    label: 'settings.sec.ai' },
  ]},
  { group: 'settings.grp.system', items: [
    { id: 'notifications',  icon: <IconActivity/>, label: 'settings.sec.behavior' },
    { id: 'externalTools',  icon: <IconTool/>,     label: 'settings.sec.externalTools' },
    { id: 'about',          icon: <IconInfo/>,     label: 'settings.sec.about' },
  ]},
]

// `key` holds an i18n key resolved at render for the swatch tooltip.
// One entry per theme, and NOTHING about how it looks: the chip carries the
// theme's own `data-theme` and reads the seeds from tokens.css (see
// .stg-tile-mock--seeded). A preset that restates a theme's colours is a second copy
// of the palette, and this one had already drifted.
// THEMES is the list; __tests__/token-discipline.test.ts fails if it and the
// [data-theme] blocks in tokens.css stop agreeing.
// `name` rather than a translation key for the imported ones: a theme name is
// a proper noun. "Rosé Pine" is called that in every language.
export const THEME_PRESETS: { id: ThemeId; key?: string; name?: string }[] = [
  { id: 'aqua-dark',  key: 'settings.theme.dark' },
  { id: 'aqua-light', key: 'settings.theme.light' },
  { id: 'one-dark-pro', name: "One Dark Pro" },
  { id: 'catppuccin-frappe', name: "Catppuccin Frappé" },
  { id: 'gitpod-dark', name: "Gitpod Dark" },
  { id: 'dracula-theme', name: "Dracula Theme" },
  { id: 'github-dark', name: "GitHub Dark" },
  { id: 'monokai-dimmed', name: "Monokai Dimmed" },
  { id: 'monokai', name: "Monokai" },
  { id: 'vscode-dark', name: "Dark+" },
  { id: 'vscode-red', name: "Red" },
  { id: 'kimbie-dark', name: "Kimbie Dark" },
  { id: 'solarized-dark', name: "Solarized Dark" },
  { id: 'abyss', name: "Abyss" },
  { id: 'tomorrow-night-blue', name: "Tomorrow Night Blue" },
  { id: 'gruvbox-dark-hard', name: "Gruvbox Dark Hard" },
  { id: 'ayu-dark', name: "Ayu Dark" },
  { id: 'atom-one-dark', name: "Atom One Dark" },
  { id: 'tokyo-night', name: "Tokyo Night" },
  { id: 'rose-pine', name: "Rosé Pine" },
  { id: 'night-owl', name: "Night Owl" },
  { id: 'community-material-theme', name: "Community Material Theme" },
  { id: 'powershell-ise', name: "PowerShell ISE" },
  { id: 'catppuccin-latte', name: "Catppuccin Latte" },
  { id: 'gitpod-light', name: "Gitpod Light" },
  { id: 'github-light', name: "GitHub Light" },
  { id: 'quiet-light', name: "Quiet Light" },
  { id: 'vscode-light', name: "Light+" },
  { id: 'solarized-light', name: "Solarized Light" },
  { id: 'gruvbox-light-hard', name: "Gruvbox Light Hard" },
  { id: 'ayu-light', name: "Ayu Light" },
  { id: 'tokyo-night-light', name: "Tokyo Night Light" },
]

/**
 * The features a call can belong to (#70) — the same ids the main process and
 * the extension host read (`aiFeatureModel:<id>` / `aiFeatureInstructions:<id>`).
 * One list here, because this page is what writes those keys.
 */
/**
 * The temperament a feature rewards. 'fast' answers in a line and runs often
 * — a reasoning model spends its budget thinking before that line; 'thorough'
 * reads a lot and writes structure — thinking earns its cost there. The hint
 * under each heading says it, and the Suggested group in the select points
 * at live models that match.
 */
export type AITemperament = 'fast' | 'balanced' | 'thorough'

export const AI_FEATURES: { id: string; labelKey: string; kind: AITemperament; chips: string[] }[] = [
  { id: 'commit', kind: 'fast', labelKey: 'settings.ai.feat.commit', chips: [
    'Subject under 50 characters', 'Reference the issue number', 'No body — subject only', 'Explain the why in the body'] },
  // One feature, four diffs: a commit, a branch, a stash, the working tree
  // (#70 P1). They ask the same question and reward the same model, so
  // splitting them into four settings blocks would be four places to keep
  // saying the same thing.
  { id: 'explain', kind: 'thorough', labelKey: 'settings.ai.feat.explain', chips: [
    'Focus on the why', 'Call out risky changes', 'Three sentences at most'] },
  { id: 'conflict', kind: 'thorough', labelKey: 'settings.ai.feat.conflict', chips: [
    'Explain each resolution briefly', 'When both sides are equivalent, prefer the incoming change'] },
  { id: 'search', kind: 'fast', labelKey: 'settings.ai.feat.search', chips: [
    'Match loosely', 'Prefer recent commits'] },
  { id: 'filter', kind: 'fast', labelKey: 'settings.ai.feat.filter', chips: [
    'Prefer label: over free text', 'Scope to open items unless asked'] },
  { id: 'pr', kind: 'thorough', labelKey: 'settings.ai.feat.pr', chips: [
    'Start with a one-line summary', 'Bullet the notable changes', 'Mention breaking changes first'] },
  { id: 'issue', kind: 'balanced', labelKey: 'settings.ai.feat.issue', chips: [
    'Add acceptance criteria', 'Title under 60 characters', 'No invented reproduction steps'] },
  { id: 'changelog', kind: 'thorough', labelKey: 'settings.ai.feat.changelog', chips: [
    'One bullet per change, no more', 'Name the affected area first', 'Keep internal refactors out'] },
  { id: 'compose', kind: 'thorough', labelKey: 'settings.ai.feat.compose', chips: [
    'Prefer fewer, larger commits', 'Tests with the code they cover', 'Keep documentation in its own commit'] },
]

/**
 * The features whose prompt carries a diff — the only ones a detail level
 * means anything for. A commit search reads an index of subjects; a filter
 * query reads a vocabulary. Offering them the choice would be furniture.
 *
 * ⚠️ The main process keeps the same list (`DIFF_FEATURES` in
 * `src/main/ai-diff.ts`), because the two are built separately and this side
 * imports nothing from `src/main`. `ai-diff.test.ts` fails if they disagree.
 */
export const DIFF_FEATURES = ['commit', 'explain', 'pr', 'compose']

/** A model choice that knows which credential it runs on. */
export interface AIPair { provider: AIProvider; model: string }

/**
 * One select over EVERY connected provider, grouped — the choice the rework
 * exists for. A pair whose provider lost its key still shows (orphaned, so
 * the user sees what will stop working); the caller draws the warning.
 */
/** The characteristic a model id gives away, worn as a coloured badge —
    reasoning in the AI ink (it is the model thinking), fast in the doing
    green. Unlabelled ids wear nothing: the heuristic never guesses. */
// ── What a control changes, and when it is kept ──────────────────
// The page mixed two kinds of change without saying so: what is this app's
// (a theme, an auto-fetch interval, an API key) and what writes GIT's OWN
// global configuration — the identity, the SSH command — which every git
// client on the machine then reads. And the save modes differed from one
// field to the next with nothing on screen to say which was which.
//
// Two marks answer both, in the field rather than in a paragraph above it.

/**
 * This field writes `~/.gitconfig`. `writes` names the key it sets, so the
 * tooltip is specific — `user.name`, `core.sshCommand` — rather than a vague
 * warning about "git settings".
 */
export function GitGlobalChip({ writes }: { writes: string }) {
  const { t } = useLang()
  return (
    <span className="stg-scope" title={`${writes} — ${t('settings.scope.gitGlobal.title')}`}>
      {t('settings.scope.gitGlobal')} · <code>{writes}</code>
    </span>
  )
}

/**
 * When this block is saved. One mode per block, said once: either everything
 * in it is kept as you change it, or nothing is until you press the button it
 * names. A block that says nothing is a block you have to guess at, and the
 * two modes look identical while you are typing.
 */
export function SaveNote({ button }: { button?: string }) {
  const { t } = useLang()
  return (
    <p className="stg-savenote">
      {button ? t('settings.saveMode.button', button) : t('settings.saveMode.live')}
    </p>
  )
}

/**
 * What this application cannot make faster, on the one platform where it is
 * usually the largest number.
 *
 * Defender's real-time protection inspects each file as it is opened, and
 * `git status` on a large repository opens all of them — which is why the
 * same repository is quick on a Mac and slow on a Windows laptop with the
 * same git. Excluding the folder the repositories live in routinely beats
 * everything in this codebase put together, and there is nothing we can do
 * about it from in here.
 *
 * Shown, never run. It is an administrator command against the machine's own
 * security settings: it belongs to whoever owns the machine, who should read
 * it before running it — so the button copies, and says what it copied.
 */
export function DefenderNote() {
  const { t } = useLang()
  const [copied, setCopied] = useState(false)
  const command = "Add-MpPreference -ExclusionPath 'C:\\Users\\you\\code'"
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* no clipboard — the command is on screen to be read */ }
  }
  return (
    <div className="stg-defender">
      <p className="stg-defender-title">{t('settings.general.defender')}</p>
      <p className="stg-defender-body">{t('settings.general.defenderBody')}</p>
      <div className="stg-defender-cmd">
        <code>{command}</code>
        <button type="button" className="stg-defender-copy" onClick={copy}>
          {copied ? t('settings.general.defenderCopied') : t('settings.general.defenderCopy')}
        </button>
      </div>
      <p className="stg-defender-body">{t('settings.general.defenderCaveat')}</p>
    </div>
  )
}

export function KindBadge({ id }: { id: string }) {
  const k = modelKind(id)
  if (!k) return null
  return <span className={`stg-kind stg-kind--${k}`}>{k}</span>
}

/**
 * One picker over EVERY connected provider — our own dropdown, not a native
 * select, because the characteristics have to READ: an <option> cannot wear
 * a badge, and "· reasoning" as plain text was exactly as visible as it
 * sounds. Groups per provider, the Suggested section first where a caller
 * declares a temperament, the current pick badged on the face itself. Same
 * closing contract as the composer's pickers: focus leaves, it closes.
 */
export function ModelSelect({ value, onChange, defaultLabel, defaultModel, providers, liveModels, suggest, suggestLabel }: {
  value: AIPair | null
  onChange: (v: AIPair | null) => void
  /** Present ⇒ an empty choice is offered, reading as the default it falls to. */
  defaultLabel?: string
  /** The model the empty choice falls to — so its badge can be worn too. */
  defaultModel?: string
  /** The USABLE providers — catalog entries with a key, customs regardless. */
  providers: { id: string; label: string }[]
  liveModels: Record<string, string[] | null>
  /** The kind of model this caller rewards — heads the list with live
   *  matches. A suggestion, never a gate; absent for balanced features. */
  suggest?: 'reasoning' | 'fast'
  suggestLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const connected = providers
  const orphan = value && !providers.some(p => p.id === value.provider)
    ? { id: value.provider, label: value.provider } : null
  const suggested = suggest
    ? connected.flatMap(p => (liveModels[p.id] ?? [])
        .filter(m => modelKind(m) === suggest)
        .map(m => ({ p: p.id, m })))
      .slice(0, 6)
    : []
  const pick = (v: AIPair | null) => { onChange(v); setOpen(false) }
  const row = (p: AIProvider, m: string, keyPrefix = '') => {
    const on = value?.provider === p && value?.model === m
    return (
      <button key={`${keyPrefix}${p}-${m}`} type="button" role="option" aria-selected={on}
        className={`stg-msel-row${on ? ' stg-msel-row--on' : ''}`}
        onMouseDown={e => { e.preventDefault(); pick({ provider: p, model: m }) }}>
        <span className="stg-msel-name">{m}</span>
        <KindBadge id={m} />
        {on && <span className="stg-msel-check">✓</span>}
      </button>
    )
  }
  return (
    <div className="stg-msel"
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false) }}>
      <button type="button" className="stg-input stg-mono stg-msel-face" aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false) } }}>
        <span className="stg-msel-name">{value ? value.model : defaultLabel}</span>
        <KindBadge id={value ? value.model : (defaultModel ?? '')} />
        <span className="stg-msel-caret">▾</span>
      </button>
      {open && (
        <div className="stg-msel-list" role="listbox">
          {defaultLabel !== undefined && (
            <button type="button" role="option" aria-selected={value === null}
              className={`stg-msel-row${value === null ? ' stg-msel-row--on' : ''}`}
              onMouseDown={e => { e.preventDefault(); pick(null) }}>
              <span className="stg-msel-name">{defaultLabel}</span>
              {defaultModel && <KindBadge id={defaultModel} />}
              {value === null && <span className="stg-msel-check">✓</span>}
            </button>
          )}
          {suggested.length > 0 && (
            <>
              <div className="stg-msel-group">{suggestLabel}</div>
              {suggested.map(({ p, m }) => row(p, m, 's-'))}
            </>
          )}
          {connected.map(p => (
            <React.Fragment key={p.id}>
              <div className="stg-msel-group">{p.label}</div>
              {(liveModels[p.id] ?? []).map(m => row(p.id, m))}
              {value?.provider === p.id && !(liveModels[p.id] ?? []).includes(value.model) && row(p.id, value.model, 'x-')}
            </React.Fragment>
          ))}
          {orphan && value && (
            <>
              <div className="stg-msel-group">{orphan.label}</div>
              {row(value.provider, value.model, 'o-')}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** The fragments offered for every feature at once. */
export const AI_GLOBAL_CHIPS = [
  'Keep it concise', 'Plain tone, no hype', 'Use the imperative mood', 'Prefer short sentences',
]

/**
 * Extra headers edit as text, one `Name: value` per line — a table UI for a
 * quirk two gateways in a hundred need would be furniture. A line without a
 * colon costs the line, the autolink rule.
 */
export const headersToLines = (h?: Record<string, string>): string =>
  Object.entries(h ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n')

export const linesToHeaders = (text: string): Record<string, string> | undefined => {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const i = line.indexOf(':')
    if (i <= 0) continue
    const k = line.slice(0, i).trim()
    const v = line.slice(i + 1).trim()
    if (k) out[k] = v
  }
  return Object.keys(out).length ? out : undefined
}

/** A stable, readable id for a custom provider — slug, suffixed on clash. */
export function makeCustomId(label: string, existing: { id: string }[]): string {
  const slug = 'custom-' + (label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'endpoint')
  if (!existing.some(e => e.id === slug)) return slug
  let n = 2
  while (existing.some(e => e.id === `${slug}-${n}`)) n++
  return `${slug}-${n}`
}

/** Append a fragment to an instructions field, once. */
export const appendChip = (value: string, chip: string): string =>
  value.trim() ? `${value.trimEnd()}\n${chip}` : chip

/**
 * Everything the AI page writes, as one comparable string. The Save button
 * lights when the page differs from what it last loaded or saved — the
 * page is long, and "did I save that key?" should not need a scroll.
 */
export interface AIDraft {
  keys: Record<string, string>
  customs: AIProviderDef[]
  def: AIPair
  global: string
  featSel: Record<string, AIPair | null>
  featInstr: Record<string, string>
  /** How much room each feature's answers get — 1, 2 or 4 times its own. */
  featRoom: Record<string, number>
  /** How much of a diff each feature shows the model. */
  featDetail: Record<string, string>
}

export const serializeAI = (d: AIDraft): string => JSON.stringify(d)

/**
 * The ready-made fragments, behind a button at the right of the field's
 * caption rather than laid out above it: eight blocks of chips were the
 * page's noise, and the field is what the user came to write in. The menu
 * borrows the model picker's list and its closing contract — focus leaves,
 * it closes; a pick writes the fragment and closes. A fragment the text
 * already holds is shown taken, not hidden: the list keeps its shape, so
 * the eye finds the one it wants where it was last time.
 */
export function TemplateMenu({ templates, value, onPick, label }: {
  templates: string[]
  value: string
  onPick: (fragment: string) => void
  label: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="stg-ai-tpl"
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false) }}>
      <button type="button" className="stg-ai-tpl-btn" aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false) } }}>
        <Icon name="list" size={12} />
        {label}
        <span className="stg-msel-caret">▾</span>
      </button>
      {open && (
        <div className="stg-msel-list stg-ai-tpl-list" role="listbox" aria-label={label}>
          {templates.map(c => {
            const taken = value.includes(c)
            return (
              <button key={c} type="button" role="option" aria-selected={taken} aria-disabled={taken}
                className={`stg-msel-row stg-ai-tpl-row${taken ? ' stg-msel-row--on' : ''}`}
                onMouseDown={e => { e.preventDefault(); if (!taken) { onPick(c); setOpen(false) } }}>
                <span className="stg-msel-name">{c}</span>
                {taken && <span className="stg-msel-check">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * The tuning pair every block shares — the model on the left, the
 * instructions on the right: one shape for the defaults and each feature,
 * so the eye learns it once. The instructions column is a div, not a label —
 * a label whose first control is the templates button would open the menu
 * on a click of its caption.
 */
export function AITuning({ modelLabel, picker, warn, instrLabel, templates, templatesLabel, value, onChange, placeholder }: {
  modelLabel: string
  picker: React.ReactNode
  warn: React.ReactNode
  instrLabel: string
  templates: string[]
  templatesLabel: string
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="stg-ai-tuning">
      <label className="stg-field">
        <span>{modelLabel}</span>
        {picker}
        {warn}
      </label>
      <div className="stg-field">
        <div className="stg-ai-field-head">
          <span>{instrLabel}</span>
          <TemplateMenu templates={templates} value={value} label={templatesLabel}
            onPick={c => onChange(appendChip(value, c))} />
        </div>
        <textarea
          className="stg-input stg-ai-instr"
          value={value}
          aria-label={instrLabel}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
        />
      </div>
    </div>
  )
}

// The roster is the shared catalog now (#169) — this page renders it, the two
// AI pipelines resolve against it, and customs join it at runtime.
export const AI_PROVIDERS = AI_PROVIDER_CATALOG

export const MODEL_SUGGESTIONS: Record<AIProvider, string[]> = {
  anthropic: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-7'],
  google:    ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
  groq:      ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
  openai:    ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
}

export interface SettingsModalProps {
  onClose: () => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
  // Called when "check for updates" finds a newer version — the host (App)
  // opens the update overlay, which owns the single download+install flow.
  onUpdateFound?: (version: string) => void
  // VS Code panel host: hides the desktop-only About section (and the OS
  // notification toggles inside Comportement) and swaps the GitHub OAuth flow
  // for a manual token field. Behaviour toggles (auto-stash, conflict warning,
  // external editor) stay available.
  embedded?: boolean
  /** Opens the gallery as a tab. Absent on a host that has no tabs, in which
   *  case the card is inert rather than hidden — the bank still exists. */
  onBrowseThemes?: () => void
}
