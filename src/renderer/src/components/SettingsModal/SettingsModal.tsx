import React, { useState, useEffect } from 'react'
import { Icon } from '../Icon/Icon'
import { Brand } from '../BrandMark/BrandMark'
import './SettingsModal.css'
import { modelKind } from '../../utils/aiModelKind'
import { AI_PROVIDER_CATALOG, AI_LOCAL_PRESETS, parseCustomProviders, type AIProviderDef } from '../../utils/aiProviders'
import { useLang, ENABLED_LANGS } from '../../i18n/LanguageContext'
import {
  useSettings, isVSCodeHost, setInstalledThemes, followsEditor,
  type ThemeId, type InstalledThemeInfo,
} from '../../contexts/SettingsContext'
import { Mark } from '../Mark/Mark'
import { parseAutolinks, serializeAutolinks, type Autolink } from '../../utils/autolinks'

/**
 * Like parseAutolinks, but keeps half-typed rows on screen. The strict parser
 * drops anything it could not read back, which while you are still typing the
 * URL means the row you are working in disappears under the cursor.
 */
function parseAutolinksLoose(raw: string): Autolink[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.map((r: any) => ({ prefix: String(r?.prefix ?? ''), url: String(r?.url ?? '') }))
  } catch { return parseAutolinks(raw) }
}

type Section = 'git' | 'appearance' | 'graph' | 'github' | 'ai' | 'notifications' | 'externalTools' | 'ssh' | 'about'

const SECTIONS: Section[] = ['git', 'appearance', 'graph', 'github', 'ai', 'notifications', 'externalTools', 'ssh', 'about']

/**
 * Which section was last read.
 *
 * Settings is a tab now, so leaving it is a click on another tab rather than a
 * decision to close it — and coming back to the top of the list every time is
 * the tab forgetting what you were doing. React unmounts the body of a tab you
 * are not looking at, so this outlives the component rather than sitting in it.
 */
const SECTION_KEY = 'gv-settings-section'

function lastSection(): Section {
  const saved = localStorage.getItem(SECTION_KEY) as Section | null
  return saved && SECTIONS.includes(saved) ? saved : 'git'
}
// Provider ids are open strings since #169 — the catalog plus whatever the
// user defined. The old four-way union lives on only in the tutorial gate.
type AIProvider = string

// Sections hidden in the VS Code panel (`embedded`) — desktop-only concerns
// already handled by VS Code itself (SSH, external tools/terminal) or not
// reachable there (Init isn't wired into the extension).
const DESKTOP_ONLY_SECTIONS: Section[] = ['externalTools', 'ssh', 'about']

// ── Nav icons ─────────────────────────────────────────────────
// These were seven `<path>` sets inside a local NavIcon wrapper that spelled
// out our own spec a second time — grid 24, stroke 1.7, round caps. They are
// files in components/Icon/icons now, like everything else.
const IconIdentity = () => <Icon name="person" />
const IconAppearance = () => <Icon name="sliders" />
const IconGraph = () => <Icon name="node" />
const IconShield = () => <Icon name="shield" />
const IconGithubMark = () => <Brand name="github" size={16} />
// Same sparkle glyph already used for the AI actions in ConflictResolver —
// reused here instead of a new one, so "AI" reads the same everywhere.
const IconSparkle = () => (
  <Icon name="ai" />
)
const IconActivity = () => <Icon name="activity" />
const IconTool = () => <Icon name="wrench" />
const IconInfo = () => <Icon name="info" />

// Grouped navigation with icons. `label` holds an i18n key, resolved with
// t() at render.
// SSH sits next to Identity & profiles (which already hosts GPG signing) —
// both are "credentials used for git operations", not a "system" concern.
const NAV_GROUPS: { group: string; items: { id: Section; icon: React.ReactNode; label: string }[] }[] = [
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
const THEME_PRESETS: { id: ThemeId; key?: string; name?: string }[] = [
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
type AITemperament = 'fast' | 'balanced' | 'thorough'

const AI_FEATURES: { id: string; labelKey: string; kind: AITemperament; chips: string[] }[] = [
  { id: 'commit', kind: 'fast', labelKey: 'settings.ai.feat.commit', chips: [
    'Subject under 50 characters', 'Reference the issue number', 'No body — subject only', 'Explain the why in the body'] },
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
]

/** A model choice that knows which credential it runs on. */
interface AIPair { provider: AIProvider; model: string }

/**
 * One select over EVERY connected provider, grouped — the choice the rework
 * exists for. A pair whose provider lost its key still shows (orphaned, so
 * the user sees what will stop working); the caller draws the warning.
 */
/** The characteristic a model id gives away, worn as a coloured badge —
    reasoning in the AI ink (it is the model thinking), fast in the doing
    green. Unlabelled ids wear nothing: the heuristic never guesses. */
function KindBadge({ id }: { id: string }) {
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
function ModelSelect({ value, onChange, defaultLabel, defaultModel, providers, liveModels, suggest, suggestLabel }: {
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
const AI_GLOBAL_CHIPS = [
  'Keep it concise', 'Plain tone, no hype', 'Use the imperative mood', 'Prefer short sentences',
]

/**
 * Extra headers edit as text, one `Name: value` per line — a table UI for a
 * quirk two gateways in a hundred need would be furniture. A line without a
 * colon costs the line, the autolink rule.
 */
const headersToLines = (h?: Record<string, string>): string =>
  Object.entries(h ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n')
const linesToHeaders = (text: string): Record<string, string> | undefined => {
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
function makeCustomId(label: string, existing: { id: string }[]): string {
  const slug = 'custom-' + (label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'endpoint')
  if (!existing.some(e => e.id === slug)) return slug
  let n = 2
  while (existing.some(e => e.id === `${slug}-${n}`)) n++
  return `${slug}-${n}`
}

/** Append a fragment to an instructions field, once. */
const appendChip = (value: string, chip: string): string =>
  value.trim() ? `${value.trimEnd()}\n${chip}` : chip

/**
 * Everything the AI page writes, as one comparable string. The Save button
 * lights when the page differs from what it last loaded or saved — the
 * page is long, and "did I save that key?" should not need a scroll.
 */
interface AIDraft {
  keys: Record<string, string>
  customs: AIProviderDef[]
  def: AIPair
  global: string
  featSel: Record<string, AIPair | null>
  featInstr: Record<string, string>
}
const serializeAI = (d: AIDraft): string => JSON.stringify(d)

/**
 * The tuning pair every block shares — the model on the left, the
 * instructions on the right: one shape for the defaults and each feature,
 * so the eye learns it once. Chips write their fragment into the field and
 * stand down once the text holds it: an offer already taken is not an offer.
 * The instructions column is a div, not a label — a label whose first
 * control is a chip button would fire that chip on a click of its caption.
 */
function AITuning({ modelLabel, picker, warn, instrLabel, chips, value, onChange, placeholder }: {
  modelLabel: string
  picker: React.ReactNode
  warn: React.ReactNode
  instrLabel: string
  chips: string[]
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
        <span>{instrLabel}</span>
        <div className="stg-ai-chips">
          {chips.filter(c => !value.includes(c)).map(c => (
            <button key={c} type="button" className="stg-ai-chip" aria-label={c}
              onClick={() => onChange(appendChip(value, c))}>{c}</button>
          ))}
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
const AI_PROVIDERS = AI_PROVIDER_CATALOG

const MODEL_SUGGESTIONS: Record<AIProvider, string[]> = {
  anthropic: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-7'],
  google:    ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
  groq:      ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
  openai:    ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
}

interface SettingsModalProps {
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

export default function SettingsModal({ onClose, showToast, onUpdateFound, embedded = false, onBrowseThemes }: SettingsModalProps) {
  const { t, lang, setLang } = useLang()
  const { settings, get, getBool, set } = useSettings()
  const [section, setSection] = useState<Section>(lastSection)
  useEffect(() => { localStorage.setItem(SECTION_KEY, section) }, [section])

  // ── Themes ────────────────────────────────────────────────────────────────
  const [installed, setInstalled] = useState<InstalledThemeInfo[]>([])
  const [discarded, setDiscarded] = useState<Array<{ id: string; why: string }>>([])
  // The card shows how many themes are behind it and four of them. That is one
  // catalogue read, cached by the main process, and it never blocks the page:
  // with no answer the card falls back to a wordier label and still opens.
  const [bankCount, setBankCount] = useState(0)
  const [preview, setPreview] = useState<{ id: string; canvas: string; border: string; accent: string }[]>([])

  // In the panel the picker is dead while the editor is being followed —
  // disabled with the reason shown, rather than hidden, so it is clear that
  // the choice exists and what is holding it.
  const themePickerDisabled = followsEditor(settings)

  const refreshInstalled = React.useCallback(() => {
    window.gitAPI.themesInstalled?.()
      .then((r: { themes?: InstalledThemeInfo[]; discarded?: Array<{ id: string; why: string }> }) => {
        const list = r?.themes ?? []
        setInstalled(list)
        setDiscarded(r?.discarded ?? [])
        // Keeps resolveTheme and the injected [data-theme] rules in step with
        // what is actually on disk.
        setInstalledThemes(list)
      })
      .catch(() => { /* older host, or nothing installed */ })
  }, [])

  useEffect(() => { refreshInstalled() }, [refreshInstalled])

  useEffect(() => {
    let alive = true
    window.gitAPI.themesCatalogue?.()
      .then((c: any) => {
        if (!alive || !c?.themes?.length) return
        setBankCount(c.count ?? c.themes.length)
        setPreview(c.themes.slice(0, 4).map((r: any) => ({
          id: r.id, canvas: r.canvas, border: r.border, accent: r.accent,
        })))
      })
      .catch(() => { /* offline: the card keeps its plain label */ })
    return () => { alive = false }
  }, [])

  const removeTheme = React.useCallback(async (id: string) => {
    await window.gitAPI.themesRemove?.(id)
    // Falling back before the list refreshes, so the UI never sits on a theme
    // whose rule has just been withdrawn.
    if (get('theme', 'aqua-dark') === id) set('theme', 'aqua-dark')
    refreshInstalled()
  }, [get, set, refreshInstalled])

  const navGroups = embedded
    ? NAV_GROUPS
        .map(g => ({ ...g, items: g.items.filter(i => !DESKTOP_ONLY_SECTIONS.includes(i.id)) }))
        .filter(g => g.items.length > 0)
    : NAV_GROUPS

  // Git config
  const [gitUserName, setGitUserName] = useState('')
  const [gitUserEmail, setGitUserEmail] = useState('')
  // Which git the app runs. Desktop-only: inside VS Code the extension inherits
  // a real shell environment, so there is nothing to pick or correct.
  const [gitBinary, setGitBinary] = useState<{ version: string | null; path: string; source: string } | null>(null)
  const [gitBinaryPath, setGitBinaryPath] = useState('')
  const [gitBinaryBusy, setGitBinaryBusy] = useState(false)

  // GitHub
  const [githubToken, setGithubToken] = useState('')
  // GitHub Enterprise Server: the same API on the customer's own host. A host
  // is only treated as GitHub once it is named here, and its token is only ever
  // sent there — see src/main/github-host.ts.
  const [ghEnterpriseHost, setGhEnterpriseHost] = useState('')
  const [ghEnterpriseToken, setGhEnterpriseToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [githubUser, setGithubUser] = useState<{ login: string; avatar: string } | null>(null)
  // Where the identity came from, when the host says: 'vscode' for a session
  // VS Code owns, 'pat' for a token we hold. Null on the desktop, which has
  // only ever had one source and does not report it.
  const [githubSource, setGithubSource] = useState<'vscode' | 'pat' | null>(null)
  const [autolinksRaw, setAutolinksRaw] = useState('')
  const [githubLoading, setGithubLoading] = useState(false)

  // About
  const [appInfo, setAppInfo] = useState<{ version: string; electron: string; node: string; chrome: string } | null>(null)
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'up-to-date' | 'error'>('idle')
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [updateReady, setUpdateReady] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const checkHadError = React.useRef(false)

  // AI (#70, reworked): there is no ACTIVE provider. A provider with a key is
  // CONNECTED, and every model choice carries its own (provider, model) pair —
  // a bare model id is ambiguous across providers. Null pair = the default.
  const [aiGlobalInstr, setAiGlobalInstr] = useState('')
  const [aiFeatSel, setAiFeatSel] = useState<Record<string, AIPair | null>>({})
  const [aiFeatInstr, setAiFeatInstr] = useState<Record<string, string>>({})
  const [aiKeys, setAiKeys] = useState<Record<string, string>>({})
  // User-defined endpoints (#169) — Ollama and kin. Kept whole (key inline)
  // in the aiCustomProviders JSON; a custom with models fetched counts as
  // connected even keyless, because local runtimes have no key to give.
  const [aiCustoms, setAiCustoms] = useState<AIProviderDef[]>([])
  const [aiDefault, setAiDefault] = useState<AIPair>({ provider: 'groq', model: 'llama-3.3-70b-versatile' })
  const [liveModels, setLiveModels] = useState<Record<string, string[] | null>>({})
  // Per provider, so the row whose key was refused is the row that says so.
  const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({})
  const [modelsError, setModelsError] = useState<Record<string, string>>({})
  // What the page last loaded or saved; see AIDraft.
  const [aiSnapshot, setAiSnapshot] = useState<string | null>(null)
  const [showKeyFor, setShowKeyFor] = useState<AIProvider | null>(null)
  const [showTutoFor, setShowTutoFor] = useState<AIProvider | null>(null)

  // ── Notifications ──
  const [notifyFetch, setNotifyFetch] = useState(true)
  const [notifyCommit, setNotifyCommit] = useState(false)
  const [notifyUpdate, setNotifyUpdate] = useState(true)
  const [autoStash, setAutoStash] = useState(false)
  const [warnBeforeConflict, setWarnBeforeConflict] = useState(true)

  // ── GPG & profiles/identities ──
  const [gpgSign, setGpgSign] = useState(false)
  const [profiles, setProfiles] = useState<{ name: string; email: string }[]>([])
  const [externalEditor, setExternalEditor] = useState('')

  // ── Général (v1.20.0) ──
  const [defaultBranchName, setDefaultBranchName] = useState('')
  const [autoFetchInterval, setAutoFetchInterval] = useState('0')
  const [autoUpdateSubmodules, setAutoUpdateSubmodules] = useState(false)

  // ── Outils externes (v1.20.0) ──
  const [externalDiffTool, setExternalDiffTool] = useState('')
  const [externalMergeTool, setExternalMergeTool] = useState('')
  const [externalTerminal, setExternalTerminal] = useState('')

  // ── SSH (v1.20.0) ──
  const [sshUseAgent, setSshUseAgent] = useState(false)
  const [sshPrivateKey, setSshPrivateKey] = useState('')
  const [sshPublicKey, setSshPublicKey] = useState('')
  const [sshGenerating, setSshGenerating] = useState(false)
  const [sshPassphrase, setSshPassphrase] = useState('')

  const fetchModels = async (provider: AIProvider, key: string, baseUrl?: string) => {
    if (!key && !baseUrl) return   // a custom endpoint may be keyless; a catalog cloud may not
    setLoadingModels(m => ({ ...m, [provider]: true }))
    setModelsError(({ [provider]: _gone, ...rest }) => rest)
    const r = await (window.gitAPI as any).aiListProviderModels(provider, key, baseUrl)
    setLoadingModels(m => ({ ...m, [provider]: false }))
    if (r.error) { setModelsError(m => ({ ...m, [provider]: String(r.error) })); return }
    const models = r.models as string[]
    setLiveModels(prev => ({ ...prev, [provider]: models }))
    // A default that names a model this provider no longer serves moves to
    // the first it does — silently wrong beats silently broken nowhere here.
    setAiDefault(d => (d.provider === provider && models.length > 0 && !models.includes(d.model))
      ? { provider, model: models[0] } : d)
  }

  const fetchGithubUser = async () => {
    const r = await (window.gitAPI as any).githubGetUser()
    setGithubUser(r.user ?? null)
    setGithubSource(r.source ?? null)
  }

  useEffect(() => {
    ;(window.gitAPI as any).appGetInfo().then((info: any) => setAppInfo(info))
    window.gitAPI.gitGetGlobalConfig().then((r: any) => {
      setGitUserName(r.userName ?? '')
      setGitUserEmail(r.userEmail ?? '')
    })
    // Optional call: a host that does not answer it simply shows no git block.
    if (!embedded) {
      window.gitAPI.getGitCapabilities?.()
        .then(caps => setGitBinary({ version: caps.version, path: caps.path ?? 'git', source: caps.source ?? 'process-path' }))
        .catch(() => setGitBinary(null))
    }
    window.gitAPI.settingsGetAll().then((s: any) => {
      const provider: AIProvider = (s.aiProvider as AIProvider) ?? 'groq'
      const globalInstr: string = s.aiGlobalInstructions ?? ''
      setAiGlobalInstr(globalInstr)
      // A pair needs both halves. A legacy override (model without provider,
      // written before the rework) is read against the legacy provider.
      const featSel: Record<string, AIPair | null> = Object.fromEntries(AI_FEATURES.map(f => {
        const fp = (s[`aiFeatureProvider:${f.id}`] ?? '').trim()
        const fm = (s[`aiFeatureModel:${f.id}`] ?? '').trim()
        return [f.id, fm ? { provider: (fp || provider) as AIProvider, model: fm } : null]
      }))
      setAiFeatSel(featSel)
      const featInstr: Record<string, string> = Object.fromEntries(AI_FEATURES.map(f => [f.id, s[`aiFeatureInstructions:${f.id}`] ?? '']))
      setAiFeatInstr(featInstr)
      const keys: Record<string, string> = Object.fromEntries(
        AI_PROVIDER_CATALOG.map(p => [p.id, s[p.keySetting!] ?? (p.id === 'groq' ? s.groqApiKey ?? '' : '') ?? ''])
      )
      const customs = parseCustomProviders(s.aiCustomProviders)
      setAiCustoms(customs)
      setAutolinksRaw(s.autolinks ?? '')
      const token = s.githubToken ?? ''
      setGhEnterpriseHost(s.githubEnterpriseHost ?? '')
      setGhEnterpriseToken(s.githubEnterpriseToken ?? '')
      setGithubToken(token)
      // Embedded, a stored token is no longer the only way to be signed in: a
      // VS Code session writes nothing here, so gating on it showed "Sign in
      // with GitHub" to someone whose pull requests and issues were loading
      // fine two panes away. Ask the host, which knows about both.
      if (token || embedded) fetchGithubUser()
      setNotifyFetch(s.notifyFetch !== 'false')
      setNotifyCommit(s.notifyCommit === 'true')
      setNotifyUpdate(s.notifyUpdate !== 'false')
      setAutoStash(s.autoStash === 'true')
      setWarnBeforeConflict(s.warnBeforeConflict !== 'false')
      setGpgSign(s.gpgSign === 'true')
      setExternalEditor(s.externalEditor ?? '')
      try { setProfiles(s.gitProfiles ? JSON.parse(s.gitProfiles) : []) } catch { setProfiles([]) }
      setDefaultBranchName(s.defaultBranchName ?? '')
      setAutoFetchInterval(s.autoFetchInterval ?? '0')
      setAutoUpdateSubmodules(s.autoUpdateSubmodules === 'true')
      setExternalDiffTool(s.externalDiffTool ?? '')
      setExternalMergeTool(s.externalMergeTool ?? '')
      setExternalTerminal(s.externalTerminal ?? '')
      setSshUseAgent(s.sshUseAgent === 'true')
      setSshPrivateKey(s.sshPrivateKey ?? '')
      setSshPublicKey(s.sshPublicKey ?? '')
      setGitBinaryPath(s.gitBinaryPath ?? '')
      setAiKeys(keys)
      // The default pair: its own keys first, the legacy active-provider
      // settings as the fallback nobody loses an upgrade to.
      const legacyModels: Record<string, string> = {
        anthropic: s.aiAnthropicModel || 'claude-haiku-4-5-20251001',
        google:    s.aiGoogleModel    || 'gemini-2.0-flash',
        groq:      s.aiGroqModel      || 'llama-3.3-70b-versatile',
        openai:    s.aiOpenaiModel    || 'gpt-4o-mini',
      }
      const def: AIPair = {
        provider: ((s.aiDefaultProvider ?? '').trim() || provider) as AIProvider,
        model: (s.aiDefaultModel ?? '').trim() || legacyModels[provider],
      }
      setAiDefault(def)
      // The page compares itself against this to know it has something to
      // save — taken before the probes below, so a default they move counts.
      setAiSnapshot(serializeAI({ keys, customs, def, global: globalInstr, featSel, featInstr }))
      // Every usable provider fetches its list — the pickers are grouped
      // across all of them. Keyless customs fetch too: reaching /models is
      // exactly what CONNECTED means for a local runtime.
      for (const p of AI_PROVIDER_CATALOG) {
        if (keys[p.id]) fetchModels(p.id, keys[p.id])
      }
      for (const c of customs) fetchModels(c.id, c.key ?? '', c.baseUrl)
    })

    // Listen for OAuth callback result from main process
    const offAuth = (window.gitAPI as any).onGithubAuthComplete(async (result: { token?: string; error?: string }) => {
      setGithubLoading(false)
      if (result.token) {
        setGithubToken(result.token)
        await fetchGithubUser()
        showToast(t('toast.githubConnected'))
      } else {
        showToast(t('toast.githubErr', result.error ?? ''), 'err')
      }
    })

    // Check if an update was already downloaded. Desktop only: VS Code updates
    // the extension itself, so embedded this asked the host for a state it has
    // no updater to answer with — and the About section that would show the
    // result is not even rendered there.
    const api = window.gitAPI as any
    if (!embedded) {
      api.getUpdaterState?.().then((state: any) => {
        console.log('[updater] getUpdaterState:', state)
        if (state?.downloadedVersion) {
          setUpdateReady(true)
          setUpdateVersion(state.downloadedVersion)
          setUpdateStatus('available')
        }
      })
    }
    const offDownloaded = api.onUpdateDownloaded?.((version: string) => {
      console.log('[updater] update-downloaded:', version)
      setUpdateReady(true)
      setUpdateVersion(version)
      setUpdateStatus('available')
      setDownloadProgress(null)
    })
    const offProgress = api.onDownloadProgress?.((pct: number) => {
      console.log('[updater] download-progress:', pct + '%')
      setDownloadProgress(pct)
    })
    const offError = api.onUpdateError?.((err: string) => {
      console.log('[updater] error:', err)
      checkHadError.current = true
      if (err.includes('Cannot find latest') || err.includes('latest-mac.yml') || err.includes('latest.yml')) {
        setUpdateStatus('up-to-date')
      } else {
        setUpdateStatus('error')
        setUpdateError(err)
      }
      setDownloadProgress(null)
    })
    // Signing out of GitHub happens in VS Code's Accounts menu, outside this
    // page entirely. Without this the account stayed on screen until the page
    // was closed and reopened — the settings saying one thing while every
    // GitHub call answered another. Absent on the desktop, whose OAuth result
    // arrives on onGithubAuthComplete above.
    const api2 = window.gitAPI as any
    const onAuthChanged = () => { void fetchGithubUser() }
    api2.onGithubAuthChanged?.(onAuthChanged)

    return () => {
      offAuth?.(); offDownloaded?.(); offProgress?.(); offError?.()
      api2.offGithubAuthChanged?.(onAuthChanged)
    }
  }, [])

  // Two hosts, two shapes of answer. The desktop starts an OAuth flow and
  // returns nothing — the result arrives later on onGithubAuthComplete, so the
  // button stays in its loading state until then. The VS Code panel asks its
  // own GitHub provider and answers straight away, so a returned object means
  // it is already over, one way or the other.
  // Autolinks live in the same store as the rest and are written as they are
  // edited: a Save button on a list you add rows to is one more thing to forget.
  // Rows that are still half-typed are kept on screen and dropped on read —
  // serializeAutolinks refuses what parseAutolinks would not read back.
  const autolinks = parseAutolinksLoose(autolinksRaw)
  const saveAutolinks = (next: Autolink[]) => {
    setAutolinksRaw(JSON.stringify(next))
    void window.gitAPI.settingsSet('autolinks', serializeAutolinks(next))
  }

  const handleGithubLogin = async () => {
    setGithubLoading(true)
    const r = await (window.gitAPI as any).githubStartAuth()
    if (!r) return                       // desktop: wait for the callback event
    setGithubLoading(false)
    if (r.success) { await fetchGithubUser(); showToast(t('toast.githubConnected')); return }
    // Cancelling is a choice, not a failure — say nothing.
    if (r.error === 'cancelled') return
    showToast(r.error === 'no-provider' ? t('settings.github.noProvider') : t('toast.githubErr', r.error ?? ''), 'err')
  }

  const handleGithubDisconnect = async () => {
    const r = await (window.gitAPI as any).githubDisconnect()
    setGithubToken('')
    // Re-ask rather than assume: this is the one call that has to prove it
    // worked, and the host is the only thing that knows whether anything is
    // still signing us in.
    await fetchGithubUser()
    // Disconnecting a VS Code session means we stop using it — the account
    // itself is VS Code's, and stays in its Accounts menu. Saying only
    // "disconnected" would leave the user hunting for an account we do not own.
    showToast(r?.wasVsCodeSession ? t('settings.github.disconnectedVsCode') : t('toast.githubDisconnected'))
  }

  const saveGit = async () => {
    const r = await window.gitAPI.gitSetGlobalConfig(gitUserName.trim(), gitUserEmail.trim())
    if (r.success) showToast(t('toast.gitConfigSaved'))
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }

  const persistProfiles = async (next: { name: string; email: string }[]) => {
    setProfiles(next)
    await window.gitAPI.settingsSet('gitProfiles', JSON.stringify(next))
  }

  const saveCurrentAsProfile = async () => {
    const name = gitUserName.trim(), email = gitUserEmail.trim()
    if (!name || !email) { showToast(t('settings.profiles.needBoth'), 'err'); return }
    if (profiles.some(p => p.name === name && p.email === email)) { showToast(t('settings.profiles.already')); return }
    await persistProfiles([...profiles, { name, email }])
    showToast(t('settings.profiles.saved'))
  }

  const applyProfile = async (p: { name: string; email: string }) => {
    setGitUserName(p.name); setGitUserEmail(p.email)
    const r = await window.gitAPI.gitSetGlobalConfig(p.name, p.email)
    if (r.success) showToast(t('settings.profiles.applied', p.name))
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }

  const deleteProfile = async (idx: number) => {
    await persistProfiles(profiles.filter((_, i) => i !== idx))
  }

  const saveGithub = async () => {
    await window.gitAPI.settingsSet('githubToken', githubToken.trim())
    // The host is stored bare — no scheme, no trailing slash — because it is
    // compared against what a git remote reports, which is a hostname.
    await window.gitAPI.settingsSet(
      'githubEnterpriseHost',
      ghEnterpriseHost.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase(),
    )
    await window.gitAPI.settingsSet('githubEnterpriseToken', ghEnterpriseToken.trim())
    showToast(t('settings.github.tokenSaved'))
  }

  const aiDraft = (): AIDraft => ({
    keys: aiKeys, customs: aiCustoms, def: aiDefault,
    global: aiGlobalInstr, featSel: aiFeatSel, featInstr: aiFeatInstr,
  })
  const aiDirty = aiSnapshot !== null && serializeAI(aiDraft()) !== aiSnapshot

  const saveAI = async () => {
    // Every key — a credential belongs to its provider, not to a selection.
    for (const p of AI_PROVIDER_CATALOG) {
      await window.gitAPI.settingsSet(p.keySetting!, aiKeys[p.id] ?? '')
    }
    await window.gitAPI.settingsSet('groqApiKey', aiKeys.groq ?? '')
    // The customs travel whole — key included — in one JSON blob (#169).
    await window.gitAPI.settingsSet('aiCustomProviders', JSON.stringify(
      aiCustoms.map(c => ({
        id: c.id, label: c.label, baseUrl: c.baseUrl, key: c.key ?? '',
        ...(c.authHeader ? { authHeader: c.authHeader } : {}),
        ...(c.extraHeaders && Object.keys(c.extraHeaders).length ? { extraHeaders: c.extraHeaders } : {}),
      }))
    ))
    await window.gitAPI.settingsSet('aiDefaultProvider', aiDefault.provider)
    await window.gitAPI.settingsSet('aiDefaultModel', aiDefault.model)
    // The legacy mirror, so anything still reading the old vocabulary keeps
    // answering with the default the user just chose.
    const defDef = AI_PROVIDER_CATALOG.find(p => p.id === aiDefault.provider)
    await window.gitAPI.settingsSet('aiProvider', aiDefault.provider)
    if (defDef?.legacyModelSetting) await window.gitAPI.settingsSet(defDef.legacyModelSetting, aiDefault.model)
    await window.gitAPI.settingsSet('aiGlobalInstructions', aiGlobalInstr)
    for (const f of AI_FEATURES) {
      const sel = aiFeatSel[f.id]
      await window.gitAPI.settingsSet(`aiFeatureProvider:${f.id}`, sel?.provider ?? '')
      await window.gitAPI.settingsSet(`aiFeatureModel:${f.id}`, sel?.model ?? '')
      await window.gitAPI.settingsSet(`aiFeatureInstructions:${f.id}`, aiFeatInstr[f.id] ?? '')
    }
    setAiSnapshot(serializeAI(aiDraft()))
    showToast(t('toast.aiSaved'))
  }

  return (
    <div className="stg-page">
      {/* Header */}
      <div className="stg-header">
        <button className="stg-back" onClick={onClose} title={t('settings.back')}>
          <Icon name="chevronLeft" />
          {t('settings.back')}
        </button>
        <span className="stg-title">{t('settings.title')}</span>
      </div>

      <div className="stg-body">
        {/* Left nav — grouped */}
        <nav className="stg-nav">
          {navGroups.map(grp => (
            <div key={grp.group} className="stg-nav-group">
              <div className="stg-nav-group-label">{t(grp.group as any)}</div>
              {grp.items.map(item => (
                <button
                  key={item.id}
                  className={`stg-nav-item ${section === item.id ? 'active' : ''}`}
                  onClick={() => setSection(item.id)}
                >
                  <span className="stg-nav-icon">{item.icon}</span>
                  <span>{t(item.label as any)}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

          {/* Content */}
          {/* Appearance is the one pane that is not a column of fields. The
              600px reading measure is right for prose and inputs and wrong for
              a grid of theme tiles — it left two thirds of the window empty
              and made the tiles smaller than they need to be. */}
          <div className={`stg-content ${section === 'appearance' || section === 'ai' ? 'stg-content--wide' : ''}`}>

            {/* ── Git ── */}
            {section === 'git' && (
              <div className="stg-section">
                <h2 className="stg-section-title">{t('settings.git.title')}</h2>
                <p className="stg-desc">{t('settings.git.desc')}</p>

                <label className="stg-field">
                  <span>{t('settings.git.name')}</span>
                  <input
                    className="stg-input"
                    value={gitUserName}
                    onChange={e => setGitUserName(e.target.value)}
                    placeholder={t('settings.git.name.placeholder')}
                  />
                </label>

                <label className="stg-field">
                  <span>{t('settings.git.email')}</span>
                  <input
                    className="stg-input"
                    type="email"
                    value={gitUserEmail}
                    onChange={e => setGitUserEmail(e.target.value)}
                    placeholder={t('settings.git.email.placeholder')}
                  />
                </label>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="stg-save" onClick={saveGit}>{t('settings.save')}</button>
                  <button className="stg-save" style={{ background: 'var(--surface-sunken)', color: 'var(--text-primary-soft)' }} onClick={saveCurrentAsProfile}>
                    {t('settings.saveAsProfile')}
                  </button>
                </div>

                {/* Profils / identités */}
                {profiles.length > 0 && (
                  <>
                    <h2 className="stg-section-title" style={{ marginTop: 20 }}>{t('settings.profiles.title')}</h2>
                    <p className="stg-desc">{t('settings.profiles.desc')}</p>
                    <div className="stg-profiles">
                      {profiles.map((p, i) => {
                        const active = p.name === gitUserName.trim() && p.email === gitUserEmail.trim()
                        return (
                          <div key={i} className={`stg-profile ${active ? 'active' : ''}`}>
                            <div className="stg-profile-info">
                              <span className="stg-profile-name">{p.name}</span>
                              <span className="stg-profile-email">{p.email}</span>
                            </div>
                            {active
                              ? <span className="stg-profile-badge">{t('settings.profiles.active')}</span>
                              : <button className="stg-profile-apply" onClick={() => applyProfile(p)}>{t('settings.profiles.use')}</button>}
                            <button className="stg-profile-del" onClick={() => deleteProfile(i)} title={t('settings.profiles.delete')}>✕</button>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                {/* Which git we run. Only meaningful on the desktop: launched
                    from the Finder this process gets a truncated PATH, so a
                    machine with both Apple's git and Homebrew's can end up on
                    the older one without anything saying so. */}
                {!embedded && (
                  <>
                    <h2 className="stg-section-title" style={{ marginTop: 20 }}>{t('settings.gitBinary.title')}</h2>
                    <p className="stg-desc">{t('settings.gitBinary.desc')}</p>
                    <p className="stg-desc" style={{ color: 'var(--text-primary-soft)' }}>
                      {gitBinary
                        ? <>
                            <strong>git {gitBinary.version ?? '—'}</strong>
                            {' — '}
                            <code>{gitBinary.path}</code>
                            <span style={{ color: 'var(--text-secondary)' }}> ({t(`settings.gitBinary.source.${gitBinary.source}` as any)})</span>
                          </>
                        : t('settings.gitBinary.unknown')}
                    </p>
                    <label className="stg-field">
                      <span>{t('settings.gitBinary.path')}</span>
                      <input
                        className="stg-input"
                        value={gitBinaryPath}
                        onChange={e => setGitBinaryPath(e.target.value)}
                        placeholder={t('settings.gitBinary.path.placeholder')}
                      />
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="stg-save"
                        disabled={gitBinaryBusy}
                        onClick={async () => {
                          setGitBinaryBusy(true)
                          const value = gitBinaryPath.trim()
                          await window.gitAPI.settingsSet('gitBinaryPath', value)
                          // Re-resolve rather than restart: the answer shown here
                          // must be the one the app will actually use.
                          const r = await window.gitAPI.resolveGitBinary(value).catch(() => null)
                          setGitBinaryBusy(false)
                          if (!r) { showToast(t('settings.gitBinary.failed'), 'err'); return }
                          setGitBinary(r)
                          if (r.version) showToast(t('settings.gitBinary.applied', r.version, r.path))
                          else showToast(t('settings.gitBinary.notRunnable', r.path), 'err')
                        }}
                      >
                        {gitBinaryBusy ? t('settings.gitBinary.checking') : t('settings.gitBinary.apply')}
                      </button>
                    </div>
                  </>
                )}

                {/* Signature GPG */}
                <h2 className="stg-section-title" style={{ marginTop: 20 }}>{t('settings.gpg.title')}</h2>
                <label className="stg-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <input type="checkbox" checked={gpgSign}
                    onChange={async e => {
                      setGpgSign(e.target.checked)
                      await window.gitAPI.settingsSet('gpgSign', String(e.target.checked))
                    }} />
                  <span>{t('settings.gpg.label')} <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{t('settings.gpg.hint')}</span></span>
                </label>
              </div>
            )}

            {/* ── Apparence ── */}
            {section === 'appearance' && (
              <div className="stg-section">
                <h2 className="stg-section-title">{t('settings.appearance.title')}</h2>
                <p className="stg-desc">{t('settings.appearance.desc')}</p>

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
                    {THEME_PRESETS.map(th => {
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
            )}

            {/* ── Graphe de commits ── */}
            {section === 'graph' && (
              <div className="stg-section">
                <h2 className="stg-section-title">{t('settings.graph.title')}</h2>
                <p className="stg-desc">{t('settings.graph.desc')}</p>

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
            )}

            {/* ── GitHub ── */}
            {section === 'github' && (
              <div className="stg-section">
                <h2 className="stg-section-title">{t('settings.github.title')}</h2>
                <p className="stg-desc">{t('settings.github.desc')}</p>

                {githubUser && (
                  <div className="stg-gh-connected">
                    <img className="stg-gh-avatar" src={githubUser.avatar} alt={githubUser.login} />
                    <div className="stg-gh-info">
                      <span className="stg-gh-login">{githubUser.login}</span>
                      <span className="stg-gh-status">
                        {githubSource === 'vscode' ? t('settings.github.viaVsCode') : t('settings.github.connected')}
                      </span>
                    </div>
                    <button className="stg-gh-disconnect" onClick={handleGithubDisconnect}>
                      {t('settings.github.disconnect')}
                    </button>
                  </div>
                )}
                {!githubUser && (
                  <button className="stg-gh-login-btn" onClick={handleGithubLogin} disabled={githubLoading}>
                    <Brand name="github" size={18} />
                    {githubLoading ? t('settings.github.connecting') : t('settings.github.login')}
                  </button>
                )}
                {/* Autolinks — nothing here is GitHub-specific, but this is the
                    section people look in when a reference in a commit message
                    did not become a link. */}
                <h2 className="stg-section-title" style={{ marginTop: 24 }}>{t('settings.autolinks.title')}</h2>
                <p className="stg-desc">{t('settings.autolinks.desc')}</p>
                <div className="stg-autolinks">
                  {autolinks.map((link, i) => (
                    <div key={i} className="stg-autolink-row">
                      <input
                        className="stg-input stg-autolink-prefix"
                        value={link.prefix}
                        placeholder="JIRA-"
                        onChange={e => saveAutolinks(autolinks.map((l, j) => j === i ? { ...l, prefix: e.target.value } : l))}
                      />
                      <input
                        className="stg-input stg-autolink-url"
                        value={link.url}
                        placeholder="https://jira.example.com/browse/JIRA-<num>"
                        spellCheck={false}
                        onChange={e => saveAutolinks(autolinks.map((l, j) => j === i ? { ...l, url: e.target.value } : l))}
                      />
                      <button
                        className="stg-autolink-del"
                        title={t('settings.autolinks.remove')}
                        onClick={() => saveAutolinks(autolinks.filter((_, j) => j !== i))}
                      >×</button>
                    </div>
                  ))}
                  <button className="stg-save" style={{ alignSelf: 'flex-start' }}
                    onClick={() => saveAutolinks([...autolinks, { prefix: '', url: '' }])}>
                    {t('settings.autolinks.add')}
                  </button>
                </div>
                <p className="stg-desc" style={{ marginTop: 6 }}>{t('settings.autolinks.hint')}</p>

                {/* Manual Personal Access Token — the fallback, not the way in.
                    The button above signs in through VS Code's own GitHub
                    provider, which usually means confirming a session the user
                    already has. This stays for hosts that do not bundle that
                    provider (VSCodium and other OSS builds), and for anyone who
                    would rather hand over a narrowly scoped token. On desktop,
                    OAuth handles it (prod builds carry the client id). */}
                {!githubUser && embedded && (
                  <div className="stg-field" style={{ marginTop: 16 }}>
                    <label>{t('settings.github.pat')}</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type={showToken ? 'text' : 'password'}
                        value={githubToken}
                        placeholder="ghp_…"
                        onChange={e => setGithubToken(e.target.value)}
                        style={{ flex: 1 }}
                        spellCheck={false}
                      />
                      <button className="stg-save" style={{ background: 'var(--surface-sunken)', color: 'var(--text-primary-soft)' }} onClick={() => setShowToken(v => !v)}><Icon name={showToken ? 'eyeOff' : 'eye'} size={14} /></button>
                      <button className="stg-save" onClick={async () => { await saveGithub(); if (githubToken.trim()) fetchGithubUser() }}>
                        {t('settings.save')}
                      </button>
                    </div>
                    <p className="stg-desc" style={{ marginTop: 6 }}>{t('settings.github.patHint')}</p>
                  </div>
                )}

                {/* GitHub Enterprise Server. Deliberately its own host and its
                    own token: a credential belongs to one server, and sending
                    the github.com one to someone's instance would hand it over.
                    Naming the host here is also what makes Git Vertex treat it
                    as GitHub at all — nothing in a hostname says whether a
                    self-hosted forge is GitHub or something else. */}
                <div className="stg-field" style={{ marginTop: 24 }}>
                  <h2 className="stg-section-title">{t('settings.github.enterprise')}</h2>
                  <p className="stg-desc">{t('settings.github.enterpriseDesc')}</p>
                  <label style={{ marginTop: 12 }}>{t('settings.github.enterpriseHost')}</label>
                  <input
                    value={ghEnterpriseHost}
                    placeholder="github.acme.com"
                    onChange={e => setGhEnterpriseHost(e.target.value)}
                    spellCheck={false}
                  />
                  <label style={{ marginTop: 12 }}>{t('settings.github.enterpriseToken')}</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={ghEnterpriseToken}
                      onChange={e => setGhEnterpriseToken(e.target.value)}
                      style={{ flex: 1 }}
                      spellCheck={false}
                    />
                    <button className="stg-save" onClick={saveGithub}>{t('settings.save')}</button>
                  </div>
                  <p className="stg-desc" style={{ marginTop: 6 }}>{t('settings.github.enterpriseHint')}</p>
                </div>
              </div>
            )}

            {/* ── AI ── */}
            {section === 'ai' && (() => {
              // Usable = a catalog entry with its key, or any custom — local
              // runtimes are keyless, their /models answer is the connection
              // (#169). CONNECTED is stricter: the /models answer came back.
              const usableProviders = [
                ...AI_PROVIDERS.filter(p => aiKeys[p.id]?.trim()),
                ...aiCustoms,
              ].map(p => ({ id: p.id, label: p.label }))
              const anyConnected = usableProviders.length > 0
              const connectedCount = [...AI_PROVIDERS, ...aiCustoms].filter(p => liveModels[p.id]).length
              const orphanWarn = (pair: AIPair | null) =>
                pair && !usableProviders.some(p => p.id === pair.provider)
                  ? <span className="stg-ai-warn">{t('settings.ai.keyMissing')}</span>
                  : null
              const status = (models: string[] | null | undefined, busy: boolean, idle: string) => (
                <span className={`stg-ai-status${models ? ' stg-ai-status--on' : ''}`}>
                  {models ? <><Icon name="check" size={12} />{t('settings.ai.modelsCount', models.length)}</>
                    : busy ? t('settings.ai.checking') : idle}
                </span>
              )
              return (
              <div className="stg-section stg-ai">
                <h2 className="stg-section-title">{t('settings.ai.title')}</h2>
                <p className="stg-desc">{t('settings.ai.desc')}</p>

                {/* ── 1. Providers — ONE list, catalog and customs alike, a
                    row each. No active provider: a provider that answered
                    /models is CONNECTED, and the pickers below draw from
                    every connected one. */}
                <div className="stg-ai-block stg-ai-block--first">
                  <div className="stg-ai-block-head">
                    <h3 className="stg-ai-h">{t('settings.ai.providersTitle')}</h3>
                    {connectedCount > 0 && <span className="stg-ai-count">{t('settings.ai.connectedCount', connectedCount)}</span>}
                  </div>
                  <div className="stg-ai-list">
                    {AI_PROVIDERS.map(p => {
                      const key = aiKeys[p.id] ?? ''
                      const models = liveModels[p.id]
                      const on = !!models
                      const err = modelsError[p.id]
                      const tuto = p.hasTuto && showTutoFor === p.id
                      return (
                        <div key={p.id} className={`stg-ai-row${on ? ' stg-ai-row--on' : ''}`}>
                          <div className="stg-ai-row-id">
                            <span className="stg-ai-dot" style={on ? { background: p.color } : undefined} />
                            <span className="stg-ai-provider-name" style={on ? { color: p.color } : undefined}>{p.label}</span>
                          </div>
                          <div className="stg-ai-row-input">
                            <input
                              className="stg-input stg-mono"
                              type={showKeyFor === p.id ? 'text' : 'password'}
                              value={key}
                              aria-label={t('settings.ai.apiKey', p.label)}
                              onChange={e => setAiKeys(k => ({ ...k, [p.id]: e.target.value }))}
                              onBlur={e => { if (e.target.value) fetchModels(p.id, e.target.value) }}
                              placeholder={p.keyPlaceholder}
                            />
                            <button type="button" className="stg-eye" onClick={() => setShowKeyFor(v => v === p.id ? null : p.id)}
                              title={showKeyFor === p.id ? t('settings.ai.hide') : t('settings.ai.show')}>
                              <Icon name={showKeyFor === p.id ? 'eyeOff' : 'eye'} size={14} />
                            </button>
                          </div>
                          <div className="stg-ai-row-status">
                            {status(models, !!loadingModels[p.id], key ? t('settings.ai.keyUnverified') : t('settings.ai.noKey'))}
                            {p.hasTuto && !on && (
                              <button type="button" className="stg-ai-link" aria-expanded={!!tuto}
                                onClick={() => setShowTutoFor(v => v === p.id ? null : p.id)}>
                                {t('settings.ai.getKey')}
                              </button>
                            )}
                          </div>
                          {(err || tuto) && (
                            <div className="stg-ai-row-sub">
                              {err && <span className="stg-models-error">{err}</span>}
                              {tuto && (
                                <ol className="stg-tuto-steps">
                                  {(t(`settings.ai.tuto.${p.id}` as any) as unknown as string[]).map((step: string, i: number) => <li key={i}>{step}</li>)}
                                </ol>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {/* ── Custom endpoints — the local story (#169). Anything
                        speaking the OpenAI dialect: an Ollama, an LM Studio, a
                        gateway. Keyless is normal here; reaching /models is
                        what CONNECTED means for a runtime with no key to give. */}
                    {aiCustoms.map((c, i) => {
                      const models = liveModels[c.id]
                      const on = !!models
                      const err = modelsError[c.id]
                      const upd = (patch: Partial<AIProviderDef>) =>
                        setAiCustoms(a => a.map((x, j) => j === i ? { ...x, ...patch } : x))
                      const probe = () => { if (c.baseUrl) fetchModels(c.id, c.key ?? '', c.baseUrl) }
                      return (
                        <div key={c.id} className={`stg-ai-row stg-ai-row--custom${on ? ' stg-ai-row--on' : ''}`}>
                          <div className="stg-ai-row-id">
                            <span className="stg-ai-dot" />
                            <input
                              className="stg-input stg-ai-custom-name"
                              value={c.label}
                              aria-label={t('settings.ai.customName')}
                              placeholder={t('settings.ai.customName')}
                              onChange={e => upd({ label: e.target.value })}
                            />
                          </div>
                          <div className="stg-ai-row-input">
                            <input
                              className="stg-input stg-mono stg-ai-custom-url"
                              value={c.baseUrl ?? ''}
                              aria-label={t('settings.ai.customUrl')}
                              placeholder="http://localhost:11434/v1"
                              onChange={e => upd({ baseUrl: e.target.value })}
                              onBlur={probe}
                            />
                            <input
                              className="stg-input stg-mono stg-ai-custom-key"
                              type="password"
                              value={c.key ?? ''}
                              aria-label={t('settings.ai.customKeyOptional')}
                              placeholder={t('settings.ai.customKeyOptional')}
                              onChange={e => upd({ key: e.target.value })}
                              onBlur={probe}
                            />
                          </div>
                          <div className="stg-ai-row-status">
                            {status(models, !!loadingModels[c.id], t('settings.ai.notReached'))}
                            <button type="button" className="stg-ai-row-del"
                              title={t('settings.ai.customRemove')} aria-label={t('settings.ai.customRemove')}
                              onClick={() => setAiCustoms(a => a.filter((_, j) => j !== i))}>
                              <Icon name="trash" size={14} />
                            </button>
                          </div>
                          <div className="stg-ai-row-sub">
                            {err && <span className="stg-models-error">{err}</span>}
                            {/* Auth QUIRKS, never formats (#169 P2): rare by
                                design, so they live behind a fold. */}
                            <details className="stg-ai-quirks">
                              <summary>{t('settings.ai.authQuirks')}{(c.authHeader || c.extraHeaders) ? ' ·' : ''}</summary>
                              <input
                                className="stg-input stg-mono"
                                value={c.authHeader ?? ''}
                                aria-label={t('settings.ai.authHeaderLabel')}
                                placeholder={t('settings.ai.authHeaderLabel')}
                                onChange={e => upd({ authHeader: e.target.value.trim() || undefined })}
                              />
                              <textarea
                                className="stg-input stg-mono stg-ai-instr"
                                value={headersToLines(c.extraHeaders)}
                                aria-label={t('settings.ai.extraHeadersLabel')}
                                placeholder={t('settings.ai.extraHeadersLabel')}
                                rows={2}
                                onChange={e => upd({ extraHeaders: linesToHeaders(e.target.value) })}
                              />
                            </details>
                          </div>
                        </div>
                      )
                    })}
                    <div className="stg-ai-row stg-ai-row--add">
                      <span className="stg-ai-add-hint">{t('settings.ai.customDesc')}</span>
                      <div className="stg-ai-chips">
                        {AI_LOCAL_PRESETS.map(pr => (
                          <button key={pr.label} type="button" className="stg-ai-chip" aria-label={pr.label}
                            onClick={() => setAiCustoms(a => [...a, {
                              id: makeCustomId(pr.label, a), label: pr.label, dialect: 'openai-compat',
                              baseUrl: pr.baseUrl, key: '', custom: true,
                            }])}>+ {pr.label}</button>
                        ))}
                        <button type="button" className="stg-ai-chip" aria-label={t('settings.ai.customAdd')}
                          onClick={() => setAiCustoms(a => [...a, {
                            id: makeCustomId('endpoint', a), label: '', dialect: 'openai-compat',
                            baseUrl: '', key: '', custom: true,
                          }])}>+ {t('settings.ai.customAdd')}</button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={anyConnected ? undefined : 'stg-ai-dim'}>
                  {/* ── 2. Defaults — the same shape as a feature block: the
                      model on the left, the instructions on the right. */}
                  <div className="stg-ai-block">
                    <div className="stg-ai-block-head">
                      <h3 className="stg-ai-h">{t('settings.ai.defaultsTitle')}</h3>
                    </div>
                    <p className="stg-desc stg-ai-temper">{anyConnected ? t('settings.ai.defaultsDesc') : t('settings.ai.connectFirst')}</p>
                    <AITuning
                      modelLabel={t('settings.ai.defaultModelLabel')}
                      picker={<ModelSelect value={aiDefault} onChange={v => { if (v) setAiDefault(v) }}
                        providers={usableProviders} liveModels={liveModels} />}
                      warn={orphanWarn(aiDefault)}
                      instrLabel={t('settings.ai.globalInstructions')}
                      chips={AI_GLOBAL_CHIPS}
                      value={aiGlobalInstr}
                      onChange={setAiGlobalInstr}
                      placeholder={t('settings.ai.globalInstructionsHint')}
                    />
                  </div>

                  {/* ── 3. Per feature — the temperament worn as a tag beside
                      the heading, in the badge colours, so it READS against
                      the badge of the model picked below it. */}
                  {AI_FEATURES.map(f => (
                    <div key={f.id} className="stg-ai-block stg-ai-feature">
                      <div className="stg-ai-block-head">
                        <h3 className="stg-ai-h">{t(f.labelKey as any)}</h3>
                        <span className={`stg-kind stg-temper${f.kind === 'fast' ? ' stg-kind--fast' : f.kind === 'thorough' ? ' stg-kind--reasoning' : ''}`}>
                          {t(`settings.ai.temperTag.${f.kind}` as any)}
                        </span>
                      </div>
                      <p className="stg-desc stg-ai-temper">{t(`settings.ai.temper.${f.kind}` as any)}</p>
                      <AITuning
                        modelLabel={t('settings.ai.modelLabel')}
                        picker={<ModelSelect
                          value={aiFeatSel[f.id] ?? null}
                          onChange={v => setAiFeatSel(m => ({ ...m, [f.id]: v }))}
                          defaultLabel={t('settings.ai.defaultModel', aiDefault.model)}
                          defaultModel={aiDefault.model}
                          suggest={f.kind === 'thorough' ? 'reasoning' : f.kind === 'fast' ? 'fast' : undefined}
                          suggestLabel={t('settings.ai.suggested')}
                          providers={usableProviders} liveModels={liveModels} />}
                        warn={orphanWarn(aiFeatSel[f.id] ?? null)}
                        instrLabel={t('settings.ai.instructionsLabel')}
                        chips={f.chips}
                        value={aiFeatInstr[f.id] ?? ''}
                        onChange={v => setAiFeatInstr(m => ({ ...m, [f.id]: v }))}
                        placeholder={t('settings.ai.instructionsHint')}
                      />
                    </div>
                  ))}
                </div>

                {/* The Save rides with the scroll: the page is long and the
                    key you just pasted is at the top of it. It lights only
                    when the page differs from what it loaded or last saved. */}
                <div className="stg-ai-savebar">
                  <div className="stg-ai-savebar-inner">
                    <span className="stg-ai-savebar-note">{aiDirty ? t('settings.ai.unsaved') : ''}</span>
                    <button className="stg-save" onClick={saveAI} disabled={!aiDirty}>{t('settings.save')}</button>
                  </div>
                </div>
              </div>
              )
            })()}
            {/* ── Notifications ── */}
            {section === 'notifications' && (
              <div className="stg-section">
                <h2 className="stg-section-title">{t('settings.behavior.title')}</h2>

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
            )}

            {/* ── Outils externes (v1.20.0) ── */}
            {section === 'externalTools' && (
              <div className="stg-section">
                <h2 className="stg-section-title">{t('settings.externalTools.title')}</h2>
                <p className="stg-desc">{t('settings.externalTools.desc')}</p>

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
            )}

            {/* ── SSH (v1.20.0) ── */}
            {section === 'ssh' && (
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
            )}

            {/* ── About ── */}
            {section === 'about' && (
              <div className="stg-section">
                <div className="stg-about-hero">
                  <Mark size={64} className="stg-about-icon" title="Git Vertex" />
                  <div>
                    <h1 className="stg-about-name">Git Vertex</h1>
                    <span className="stg-about-version">v{appInfo?.version ?? '—'}</span>
                  </div>
                </div>

                <p className="stg-desc">{t('settings.about.desc')}</p>

                <div className="stg-about-links">
                  <a className="stg-about-link" onClick={() => (window as any).gitAPI.openExternal?.('https://github.com/VictorQuilgars/git-vertex')}>
                    <Brand name="github" size={14} />
                    {t('settings.about.sourceCode')}
                  </a>
                  <a className="stg-about-link" onClick={() => (window as any).gitAPI.openExternal?.('https://github.com/VictorQuilgars/git-vertex/releases')}>
                    <Icon name="download" size={14} />
                    {t('settings.about.releases')}
                  </a>
                  <a className="stg-about-link" onClick={() => (window as any).gitAPI.openExternal?.('https://github.com/VictorQuilgars/git-vertex/issues')}>
                    <Icon name="info" size={14} />
                    {t('settings.about.reportBug')}
                  </a>
                </div>

                <div className="stg-about-author">
                  <span className="stg-about-label">{t('settings.about.createdBy')}</span>
                  <a className="stg-about-link" onClick={() => (window as any).gitAPI.openExternal?.('https://github.com/VictorQuilgars')}>Victor Quilgars</a>
                </div>

                {ENABLED_LANGS.length > 1 && (
                  <div className="stg-about-lang">
                    <span className="stg-about-label">{t('settings.about.language')}</span>
                    <div className="stg-lang-btns">
                      {ENABLED_LANGS.map(l => (
                        <button key={l} className={`stg-lang-btn ${lang === l ? 'active' : ''}`} onClick={() => setLang(l)}>
                          {l === 'fr' ? '🇫🇷' : '🇬🇧'} {t(`settings.lang.${l}` as any)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="stg-about-update">
                  {updateReady ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <button
                        className="stg-about-install-btn"
                        onClick={async () => {
                          const r = await (window.gitAPI as any).installManual?.()
                          if (r?.error) {
                            // fallback to electron's quitAndInstall
                            ;(window.gitAPI as any).installUpdate?.()
                          }
                        }}
                      >
                        {t('settings.installAndRestart', updateVersion ?? '')}
                      </button>
                    </div>
                  ) : (
                    <button
                      className="stg-about-check-btn"
                      disabled={updateStatus === 'checking'}
                      onClick={async () => {
                        checkHadError.current = false
                        setUpdateStatus('checking')
                        setUpdateError(null)
                        console.log('[updater] checkForUpdates called, app version:', (window as any).appInfo)
                        const r = await (window.gitAPI as any).checkForUpdates?.()
                        console.log('[updater] checkForUpdates result:', r)
                        if (checkHadError.current) { console.log('[updater] error already received, ignoring result'); return }
                        if (r?.dev) { console.log('[updater] dev mode'); setUpdateStatus('up-to-date'); return }
                        if (r?.error) {
                          console.log('[updater] error in result:', r.error)
                          if (r.error.includes('Cannot find latest') || r.error.includes('latest-mac.yml') || r.error.includes('latest.yml')) {
                            setUpdateStatus('up-to-date')
                          } else {
                            setUpdateStatus('error')
                            setUpdateError(r.error)
                          }
                          return
                        }
                        console.log('[updater] remote version:', r?.version, '— will update:', !!r?.version)
                        if (r?.version) {
                          // Hand off to the app-level overlay (single download+install
                          // flow). Keep Settings open underneath so "Later" returns
                          // here instead of dropping the user back on the home page.
                          setUpdateStatus('idle')
                          onUpdateFound?.(r.version)
                        } else setUpdateStatus('up-to-date')
                      }}
                    >
                      {updateStatus === 'checking' ? t('settings.update.checking') : t('settings.update.check')}
                    </button>
                  )}
                  {!updateReady && updateStatus === 'up-to-date' && <span className="stg-about-update-ok">{t('settings.update.upToDate')}</span>}
                  {!updateReady && updateStatus === 'available' && (
                    <span className="stg-about-update-new">
                      {downloadProgress !== null
                        ? t('settings.update.downloading', downloadProgress)
                        : t('settings.update.starting', updateVersion ?? '')}
                    </span>
                  )}
                  {updateStatus === 'error' && (
                    <span className="stg-about-update-err" title={updateError ?? ''}>
                      ✗ {updateError ?? t('settings.update.unknownErr')}
                    </span>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
  )
}

