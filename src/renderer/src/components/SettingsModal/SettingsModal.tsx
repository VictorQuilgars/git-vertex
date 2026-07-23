import React, { useState, useEffect } from 'react'
import './SettingsModal.css'
// Bundled through Vite so the logo resolves in the packaged app — the old
// relative "../../resources/icon.png" path only worked in dev and was silently
// hidden by onError in production.
import iconUrl from '../../../../../resources/icon.png'
import { useLang, ENABLED_LANGS } from '../../i18n/LanguageContext'
import { useSettings } from '../../contexts/SettingsContext'

type Section = 'git' | 'appearance' | 'graph' | 'github' | 'ai' | 'notifications' | 'about'
type AIProvider = 'anthropic' | 'google' | 'groq' | 'openai'

// Grouped navigation with icons. `group`/`label` hold i18n keys, resolved
// with t() at render.
const NAV_GROUPS: { group: string; items: { id: Section; icon: string; label: string }[] }[] = [
  { group: 'settings.grp.general', items: [
    { id: 'git',        icon: '👤', label: 'settings.sec.identity' },
    { id: 'appearance', icon: '🎨', label: 'settings.sec.appearance' },
    { id: 'graph',      icon: '🌳', label: 'settings.sec.graph' },
  ]},
  { group: 'settings.grp.integrations', items: [
    { id: 'github', icon: '🐙', label: 'settings.sec.github' },
    { id: 'ai',     icon: '✨', label: 'settings.sec.ai' },
  ]},
  { group: 'settings.grp.system', items: [
    { id: 'notifications', icon: '⚙️', label: 'settings.sec.behavior' },
    { id: 'about',         icon: 'ℹ️', label: 'settings.sec.about' },
  ]},
]

// `key` holds an i18n key resolved at render for the swatch tooltip.
const ACCENT_PRESETS = [
  { key: 'settings.color.blue',   value: '#58a6ff' },
  { key: 'settings.color.purple', value: '#bc8cff' },
  { key: 'settings.color.green',  value: '#3fb950' },
  { key: 'settings.color.orange', value: '#ffa657' },
  { key: 'settings.color.red',    value: '#f85149' },
  { key: 'settings.color.pink',   value: '#f778ba' },
  { key: 'settings.color.cyan',   value: '#56d4dd' },
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
        .map(g => ({ ...g, items: g.items.filter(i => i.id !== 'about') }))
        .filter(g => g.items.length > 0)
    : NAV_GROUPS

  // Git config
  const [gitUserName, setGitUserName] = useState('')
  const [gitUserEmail, setGitUserEmail] = useState('')

  // GitHub
  const [githubToken, setGithubToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [githubUser, setGithubUser] = useState<{ login: string; avatar: string } | null>(null)
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
  }

  useEffect(() => {
    ;(window.gitAPI as any).appGetInfo().then((info: any) => setAppInfo(info))
    window.gitAPI.gitGetGlobalConfig().then((r: any) => {
      setGitUserName(r.userName ?? '')
      setGitUserEmail(r.userEmail ?? '')
    })
    window.gitAPI.settingsGetAll().then((s: any) => {
      const provider: AIProvider = (s.aiProvider as AIProvider) ?? 'groq'
      const keys = {
        anthropic: s.aiAnthropicKey ?? '',
        google:    s.aiGoogleKey ?? '',
        groq:      s.aiGroqKey ?? s.groqApiKey ?? '',
        openai:    s.aiOpenaiKey ?? '',
      }
      const token = s.githubToken ?? ''
      setGithubToken(token)
      if (token) fetchGithubUser()
      setNotifyFetch(s.notifyFetch !== 'false')
      setNotifyCommit(s.notifyCommit === 'true')
      setNotifyUpdate(s.notifyUpdate !== 'false')
      setAutoStash(s.autoStash === 'true')
      setWarnBeforeConflict(s.warnBeforeConflict !== 'false')
      setGpgSign(s.gpgSign === 'true')
      setExternalEditor(s.externalEditor ?? '')
      try { setProfiles(s.gitProfiles ? JSON.parse(s.gitProfiles) : []) } catch { setProfiles([]) }
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

    // Check if an update was already downloaded
    const api = window.gitAPI as any
    api.getUpdaterState?.().then((state: any) => {
      console.log('[updater] getUpdaterState:', state)
      if (state?.downloadedVersion) {
        setUpdateReady(true)
        setUpdateVersion(state.downloadedVersion)
        setUpdateStatus('available')
      }
    })
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
    return () => { offAuth?.(); offDownloaded?.(); offProgress?.(); offError?.() }
  }, [])

  const handleGithubLogin = async () => {
    setGithubLoading(true)
    await (window.gitAPI as any).githubStartAuth()
  }

  const handleGithubDisconnect = async () => {
    await (window.gitAPI as any).githubDisconnect()
    setGithubToken('')
    setGithubUser(null)
    showToast(t('toast.githubDisconnected'))
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
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
                  <button className="stg-save" style={{ background: '#21262d', color: '#c9d1d9' }} onClick={saveCurrentAsProfile}>
                    + Enregistrer comme profil
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

                {/* Signature GPG */}
                <h2 className="stg-section-title" style={{ marginTop: 20 }}>{t('settings.gpg.title')}</h2>
                <label className="stg-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <input type="checkbox" checked={gpgSign}
                    onChange={async e => {
                      setGpgSign(e.target.checked)
                      await window.gitAPI.settingsSet('gpgSign', String(e.target.checked))
                    }} />
                  <span>{t('settings.gpg.label')} <span style={{ color: '#8b949e', fontSize: 12 }}>{t('settings.gpg.hint')}</span></span>
                </label>
              </div>
            )}

            {/* ── Apparence ── */}
            {section === 'appearance' && (
              <div className="stg-section">
                <h2 className="stg-section-title">{t('settings.appearance.title')}</h2>
                <p className="stg-desc">{t('settings.appearance.desc')}</p>

                <h2 className="stg-section-title" style={{ marginTop: 8 }}>{t('settings.accent.title')}</h2>
                <p className="stg-desc">{t('settings.accent.desc')}</p>
                <div className="stg-swatches">
                  {ACCENT_PRESETS.map(c => {
                    const active = get('accentColor', '#58a6ff').toLowerCase() === c.value.toLowerCase()
                    return (
                      <button
                        key={c.value}
                        className={`stg-swatch ${active ? 'active' : ''}`}
                        style={{ background: c.value }}
                        title={t(c.key as any)}
                        onClick={() => set('accentColor', c.value)}
                      >
                        {active && <span className="stg-swatch-check">✓</span>}
                      </button>
                    )
                  })}
                  <label className="stg-swatch-custom" title={t('settings.color.custom')}>
                    <input
                      type="color"
                      value={get('accentColor', '#58a6ff')}
                      onChange={e => set('accentColor', e.target.value)}
                    />
                  </label>
                </div>

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
                    <span>{t(labelKey as any)} <span style={{ color: '#8b949e', fontSize: 12 }}>— {t(descKey as any)}</span></span>
                  </label>
                ))}
                <label className="stg-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={getBool('graphCompactColumns', false)}
                    onChange={e => set('graphCompactColumns', String(e.target.checked))}
                  />
                  <span>{t('settings.graph.compact')} <span style={{ color: '#8b949e', fontSize: 12 }}>{t('settings.graph.compactHint')}</span></span>
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
                      <span className="stg-gh-status">{t('settings.github.connected')}</span>
                    </div>
                    <button className="stg-gh-disconnect" onClick={embedded ? async () => {
                      await window.gitAPI.settingsSet('githubToken', '')
                      setGithubToken(''); setGithubUser(null)
                      showToast(t('toast.githubDisconnected'))
                    } : handleGithubDisconnect}>
                      {t('settings.github.disconnect')}
                    </button>
                  </div>
                )}
                {!githubUser && !embedded && (
                  <button className="stg-gh-login-btn" onClick={handleGithubLogin} disabled={githubLoading}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
                    </svg>
                    {githubLoading ? t('settings.github.connecting') : t('settings.github.login')}
                  </button>
                )}
                {!githubUser && embedded && (
                  // No OAuth callback flow inside the VS Code panel — manual
                  // Personal Access Token entry instead.
                  <div className="stg-field">
                    <label>Personal Access Token</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type={showToken ? 'text' : 'password'}
                        value={githubToken}
                        placeholder="ghp_…"
                        onChange={e => setGithubToken(e.target.value)}
                        style={{ flex: 1 }}
                        spellCheck={false}
                      />
                      <button className="stg-save" style={{ background: '#21262d', color: '#c9d1d9' }} onClick={() => setShowToken(v => !v)}>{showToken ? '🙈' : '👁'}</button>
                      <button className="stg-save" onClick={async () => { await saveGithub(); if (githubToken.trim()) fetchGithubUser() }}>
                        Enregistrer
                      </button>
                    </div>
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
                  <span>{t('settings.behavior.autostash')} <span style={{ color: '#8b949e', fontSize: 12 }}>{t('settings.behavior.autostashHint')}</span></span>
                </label>

                <label className="stg-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
                  <input type="checkbox" checked={warnBeforeConflict}
                    onChange={async e => {
                      setWarnBeforeConflict(e.target.checked)
                      await window.gitAPI.settingsSet('warnBeforeConflict', String(e.target.checked))
                    }} />
                  <span>{t('settings.behavior.warnConflict')} <span style={{ color: '#8b949e', fontSize: 12 }}>{t('settings.behavior.warnConflictHint')}</span></span>
                </label>

                <label className="stg-field" style={{ marginTop: 12 }}>
                  <span>{t('settings.behavior.externalEditor')} <span style={{ color: '#8b949e', fontSize: 12 }}>{t('settings.behavior.externalEditorHintPre')}<code>code</code>, <code>code --wait</code>, <code>subl</code>, <code>meld</code>{t('settings.behavior.externalEditorHintPost')}</span></span>
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

            {/* ── About ── */}
            {section === 'about' && (
              <div className="stg-section">
                <div className="stg-about-hero">
                  <img src={iconUrl} className="stg-about-icon" alt="Git Vertex" onError={e => (e.currentTarget.style.display = 'none')} />
                  <div>
                    <h1 className="stg-about-name">Git Vertex</h1>
                    <span className="stg-about-version">v{appInfo?.version ?? '—'}</span>
                  </div>
                </div>

                <p className="stg-desc">{t('settings.about.desc')}</p>

                <div className="stg-about-links">
                  <a className="stg-about-link" onClick={() => (window as any).gitAPI.openExternal?.('https://github.com/VictorQuilgars/git-vertex')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                    {t('settings.about.sourceCode')}
                  </a>
                  <a className="stg-about-link" onClick={() => (window as any).gitAPI.openExternal?.('https://github.com/VictorQuilgars/git-vertex/releases')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    {t('settings.about.releases')}
                  </a>
                  <a className="stg-about-link" onClick={() => (window as any).gitAPI.openExternal?.('https://github.com/VictorQuilgars/git-vertex/issues')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
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

                <div className="stg-about-env">
                  <h3 className="stg-about-env-title">{t('settings.about.env')}</h3>
                  <div className="stg-about-env-grid">
                    <span className="stg-about-env-key">Git Vertex</span>
                    <span className="stg-about-env-val">{appInfo?.version ?? '—'}</span>
                    <span className="stg-about-env-key">Electron</span>
                    <span className="stg-about-env-val">{appInfo?.electron ?? '—'}</span>
                    <span className="stg-about-env-key">Node.js</span>
                    <span className="stg-about-env-val">{appInfo?.node ?? '—'}</span>
                    <span className="stg-about-env-key">Chrome</span>
                    <span className="stg-about-env-val">{appInfo?.chrome ?? '—'}</span>
                  </div>
                </div>

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
                        🚀 Installer et relancer v{updateVersion}
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

