import React, { useState, useEffect } from 'react'
import { Icon } from '../Icon/Icon'
import { Brand } from '../BrandMark/BrandMark'
import './SettingsModal.css'
import { useLang, ENABLED_LANGS } from '../../i18n/LanguageContext'
import { useSettings, isVSCodeHost, type ThemeId } from '../../contexts/SettingsContext'
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
type AIProvider = 'anthropic' | 'google' | 'groq' | 'openai'

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
// .stg-theme-chip). A preset that restates a theme's colours is a second copy
// of the palette, and this one had already drifted.
// THEMES is the list; __tests__/token-discipline.test.ts fails if it and the
// [data-theme] blocks in tokens.css stop agreeing.
const THEME_PRESETS: { id: ThemeId; key: string }[] = [
  { id: 'aqua-dark',  key: 'settings.theme.dark' },
  { id: 'aqua-light', key: 'settings.theme.light' },
]

const AI_PROVIDERS: { id: AIProvider; label: string; defaultModel: string; color: string }[] = [
  { id: 'anthropic', label: 'Anthropic (Claude)', defaultModel: 'claude-haiku-4-5-20251001', color: '#d4a27f' },
  { id: 'google',    label: 'Google (Gemini)',    defaultModel: 'gemini-2.0-flash',           color: '#4285f4' },
  { id: 'groq',      label: 'Groq',               defaultModel: 'llama-3.3-70b-versatile',   color: '#f55036' },
  { id: 'openai',    label: 'OpenAI',             defaultModel: 'gpt-4o-mini',               color: '#10a37f' },
]

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
}

export default function SettingsModal({ onClose, showToast, onUpdateFound, embedded = false }: SettingsModalProps) {
  const { t, lang, setLang } = useLang()
  const { get, getBool, set } = useSettings()
  const [section, setSection] = useState<Section>('git')

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

  // AI
  const [aiProvider, setAiProvider] = useState<AIProvider>('groq')
  const [aiKeys, setAiKeys] = useState<Record<AIProvider, string>>({ anthropic: '', google: '', groq: '', openai: '' })
  const [aiModels, setAiModels] = useState<Record<AIProvider, string>>({
    anthropic: 'claude-haiku-4-5-20251001',
    google:    'gemini-2.0-flash',
    groq:      'llama-3.3-70b-versatile',
    openai:    'gpt-4o-mini',
  })
  const [liveModels, setLiveModels] = useState<Record<AIProvider, string[] | null>>({ anthropic: null, google: null, groq: null, openai: null })
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [showTuto, setShowTuto] = useState(false)

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

  const fetchModels = async (provider: AIProvider, key: string) => {
    if (!key) return
    setLoadingModels(true)
    setModelsError(null)
    const r = await (window.gitAPI as any).aiListProviderModels(provider, key)
    setLoadingModels(false)
    if (r.error) { setModelsError(r.error); return }
    const models = r.models as string[]
    setLiveModels(prev => ({ ...prev, [provider]: models }))
    setAiModels(m => {
      if (models.length > 0 && !models.includes(m[provider])) return { ...m, [provider]: models[0] }
      return m
    })
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
      const keys = {
        anthropic: s.aiAnthropicKey ?? '',
        google:    s.aiGoogleKey ?? '',
        groq:      s.aiGroqKey ?? s.groqApiKey ?? '',
        openai:    s.aiOpenaiKey ?? '',
      }
      setAutolinksRaw(s.autolinks ?? '')
      const token = s.githubToken ?? ''
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
      setAiProvider(provider)
      setAiKeys(keys)
      setAiModels(m => ({
        anthropic: s.aiAnthropicModel || m.anthropic,
        google:    s.aiGoogleModel    || m.google,
        groq:      s.aiGroqModel      || m.groq,
        openai:    s.aiOpenaiModel    || m.openai,
      }))
      if (keys[provider]) fetchModels(provider, keys[provider])
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
    showToast(t('settings.github.tokenSaved'))
  }

  const saveAI = async () => {
    const cap = aiProvider.charAt(0).toUpperCase() + aiProvider.slice(1)
    await window.gitAPI.settingsSet('aiProvider', aiProvider)
    await window.gitAPI.settingsSet(`ai${cap}Key`, aiKeys[aiProvider])
    await window.gitAPI.settingsSet(`ai${cap}Model`, aiModels[aiProvider])
    if (aiProvider === 'groq') await window.gitAPI.settingsSet('groqApiKey', aiKeys.groq)
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
          <div className="stg-content">

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

                {/* Not offered in the panel: there we follow the editor's theme,
                    which is what an extension is expected to do. */}
                {!isVSCodeHost && (
                  <>
                    <h2 className="stg-section-title" style={{ marginTop: 8 }}>{t('settings.theme.title')}</h2>
                    <p className="stg-desc">{t('settings.theme.desc')}</p>
                    <div className="stg-themes">
                      {THEME_PRESETS.map(th => {
                        const active = get('theme', 'aqua-dark') === th.id
                        return (
                          <button
                            key={th.id}
                            className={`stg-theme ${active ? 'active' : ''}`}
                            onClick={() => set('theme', th.id)}
                            aria-pressed={active}
                          >
                            <span className="stg-theme-chip" data-theme={th.id}>
                              <span className="stg-theme-dot" />
                            </span>
                            {t(th.key as any)}
                          </button>
                        )
                      })}
                    </div>
                  </>
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
              </div>
            )}

            {/* ── AI ── */}
            {section === 'ai' && (
              <div className="stg-section">
                <h2 className="stg-section-title">{t('settings.ai.title')}</h2>
                <p className="stg-desc">{t('settings.ai.desc')}</p>

                <div className="stg-providers">
                  {AI_PROVIDERS.map(p => (
                    <button
                      key={p.id}
                      className={`stg-provider-btn ${aiProvider === p.id ? 'active' : ''}`}
                      style={aiProvider === p.id ? { borderColor: p.color, color: p.color } : {}}
                      onClick={() => {
                        setAiProvider(p.id)
                        setShowTuto(false)
                        setShowKey(false)
                        setModelsError(null)
                        if (aiKeys[p.id] && !liveModels[p.id]) fetchModels(p.id, aiKeys[p.id])
                      }}
                    >
                      <span className="stg-provider-name">{p.label}</span>
                      <span className="stg-provider-model">{aiModels[p.id]}</span>
                    </button>
                  ))}
                </div>

                <div className="stg-field" style={{ marginTop: 16 }}>
                  <div className="stg-model-header">
                    <span>{t('settings.ai.model', AI_PROVIDERS.find(p => p.id === aiProvider)?.label ?? '')}</span>
                    {liveModels[aiProvider] && (
                      <span className="stg-model-count">{t('settings.ai.modelsCount', liveModels[aiProvider]!.length)}</span>
                    )}
                  </div>
                  <div className="stg-input-row">
                    {liveModels[aiProvider] ? (
                      <select
                        className="stg-input stg-mono"
                        value={aiModels[aiProvider]}
                        onChange={e => setAiModels(m => ({ ...m, [aiProvider]: e.target.value }))}
                      >
                        {liveModels[aiProvider]!.map(m => <option key={m} value={m}>{m}</option>)}
                        {!liveModels[aiProvider]!.includes(aiModels[aiProvider]) && (
                          <option value={aiModels[aiProvider]}>{aiModels[aiProvider]} {t('settings.ai.custom')}</option>
                        )}
                      </select>
                    ) : (
                      <input
                        className="stg-input stg-mono"
                        value={aiModels[aiProvider]}
                        onChange={e => setAiModels(m => ({ ...m, [aiProvider]: e.target.value }))}
                        placeholder={AI_PROVIDERS.find(p => p.id === aiProvider)?.defaultModel}
                      />
                    )}
                    <button
                      className="stg-load-models"
                      onClick={() => fetchModels(aiProvider, aiKeys[aiProvider])}
                      disabled={loadingModels || !aiKeys[aiProvider]}
                      title={t('settings.ai.reloadModels')}
                    >
                      {loadingModels ? '…' : '⟳'}
                    </button>
                  </div>
                  {liveModels[aiProvider] && (
                    <input
                      className="stg-input stg-mono stg-model-custom"
                      value={aiModels[aiProvider]}
                      onChange={e => setAiModels(m => ({ ...m, [aiProvider]: e.target.value }))}
                      placeholder={t('settings.ai.customPlaceholder')}
                    />
                  )}
                  {modelsError && <span className="stg-models-error">{modelsError}</span>}
                </div>

                <label className="stg-field">
                  <span>{t('settings.ai.apiKey', AI_PROVIDERS.find(p => p.id === aiProvider)?.label ?? '')}</span>
                  <div className="stg-input-row">
                    <input
                      className="stg-input stg-mono"
                      type={showKey ? 'text' : 'password'}
                      value={aiKeys[aiProvider]}
                      onChange={e => setAiKeys(k => ({ ...k, [aiProvider]: e.target.value }))}
                      onBlur={e => { if (e.target.value) fetchModels(aiProvider, e.target.value) }}
                      placeholder={
                        aiProvider === 'anthropic' ? 'sk-ant-...' :
                        aiProvider === 'google'    ? 'AIza...' :
                        aiProvider === 'openai'    ? 'sk-...' :
                        'gsk_...'
                      }
                    />
                    <button className="stg-eye" onClick={() => setShowKey(v => !v)} title={showKey ? t('settings.ai.hide') : t('settings.ai.show')}>
                      {showKey ? '🙈' : '👁'}
                    </button>
                  </div>
                </label>

                <button
                  className="stg-tuto-toggle"
                  onClick={() => setShowTuto(v => !v)}
                >
                  {showTuto ? '▾' : '▸'} {t('settings.ai.howToKey')}{AI_PROVIDERS.find(p => p.id === aiProvider)?.label}
                </button>

                {showTuto && (
                  <div className="stg-tuto">
                    <ol className="stg-tuto-steps">
                      {(t(`settings.ai.tuto.${aiProvider}` as any) as unknown as string[]).map((s: string, i: number) => <li key={i}>{s}</li>)}
                    </ol>
                  </div>
                )}

                <button className="stg-save" onClick={saveAI}>{t('settings.save')}</button>
              </div>
            )}

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
                        {t('settings.installAndRestart', updateVersion)}
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

