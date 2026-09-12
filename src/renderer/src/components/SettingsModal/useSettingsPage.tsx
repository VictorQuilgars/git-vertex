// The state of the settings page — every field of every section, how it is loaded and
// how it is saved — as one hook. The page renders it; a section reads its slice. The
// sections mount only while shown, so the state has to outlive them: it lives here.
import React, { useState, useEffect } from 'react'
import { AI_PROVIDER_CATALOG, parseCustomProviders, type AIProviderDef } from '../../utils/aiProviders'
import { useLang } from '../../i18n/LanguageContext'
import { useSettings, setInstalledThemes, followsEditor, type InstalledThemeInfo } from '../../contexts/SettingsContext'
import { serializeAutolinks, type Autolink } from '../../utils/autolinks'
import { parseAutolinksLoose, type Section, SECTION_KEY, lastSection, type AIProvider, DESKTOP_ONLY_SECTIONS, sectionText, NAV_GROUPS, AI_FEATURES, type AIPair, type AIDraft, serializeAI, type SettingsModalProps } from './shared'

export function useSettingsPage({ onClose, showToast, onUpdateFound, embedded = false, onBrowseThemes }: SettingsModalProps) {
  const { t, lang, setLang } = useLang()
  const { settings, get, getBool, set } = useSettings()
  const [section, setSection] = useState<Section>(lastSection)
  const [navQuery, setNavQuery] = useState('')
  const [showAllThemes, setShowAllThemes] = useState(false)
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
  const allNavGroups = embedded
    ? NAV_GROUPS
        .map(g => ({ ...g, items: g.items.filter(i => !DESKTOP_ONLY_SECTIONS.includes(i.id)) }))
        .filter(g => g.items.length > 0)
    : NAV_GROUPS
  const query = navQuery.trim().toLowerCase()
  const sectionMatches = (item: { id: Section; label: string }) =>
    !query || t(item.label as any).toLowerCase().includes(query) || sectionText[item.id].includes(query)
  const navGroups = query
    ? allNavGroups.map(g => ({ ...g, items: g.items.filter(sectionMatches) })).filter(g => g.items.length > 0)
    : allNavGroups
  // A query the open section does not answer moves to the first one that does.
  useEffect(() => {
    if (!query) return
    const visible = navGroups.flatMap(g => g.items.map(i => i.id))
    if (visible.length && !visible.includes(section)) setSection(visible[0])
  }, [query])
  // eslint-disable-line react-hooks/exhaustive-deps

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
  const [aiFeatRoom, setAiFeatRoom] = useState<Record<string, number>>({})
  const [aiFeatDetail, setAiFeatDetail] = useState<Record<string, string>>({})
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
  const [repoTuning, setRepoTuning] = useState(false)
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
      // How much room an answer gets here — 1, 2 or 4 times the feature's own
      // budget. Written by hand, or by a truncation that grew it on its own
      // (#183); either way it is visible, and undoable, in the same control.
      const featRoom: Record<string, number> = Object.fromEntries(AI_FEATURES.map(f => {
        const n = Number((s[`aiHeadroom:${f.id}`] ?? '').trim())
        return [f.id, [1, 2, 4].includes(n) ? n : 1]
      }))
      // How much of a diff the model is shown (#185). A level of detail, not
      // a character count: the old cut kept the first 6000 characters, which
      // is a different change rather than a shorter view of the same one.
      const featDetail: Record<string, string> = Object.fromEntries(AI_FEATURES.map(f => {
        const v = (s[`aiDetail:${f.id}`] ?? '').trim()
        return [f.id, ['summary', 'standard', 'full'].includes(v) ? v : 'standard']
      }))
      setAiFeatInstr(featInstr)
      setAiFeatRoom(featRoom)
      setAiFeatDetail(featDetail)
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
      setRepoTuning(s.repoTuning === 'true')
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
      setAiSnapshot(serializeAI({ keys, customs, def, global: globalInstr, featSel, featInstr, featRoom, featDetail }))
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
    global: aiGlobalInstr, featSel: aiFeatSel, featInstr: aiFeatInstr, featRoom: aiFeatRoom,
    featDetail: aiFeatDetail,
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
      await window.gitAPI.settingsSet(`aiHeadroom:${f.id}`, String(aiFeatRoom[f.id] ?? 1))
      await window.gitAPI.settingsSet(`aiDetail:${f.id}`, aiFeatDetail[f.id] ?? 'standard')
    }
    setAiSnapshot(serializeAI(aiDraft()))
    showToast(t('toast.aiSaved'))
  }

  return {
    t, lang, setLang, settings, get, getBool, set, section, setSection, navQuery, setNavQuery, showAllThemes, setShowAllThemes, installed, setInstalled, discarded, setDiscarded, bankCount, setBankCount, preview, setPreview, themePickerDisabled, refreshInstalled, removeTheme, allNavGroups, query, sectionMatches, navGroups, gitUserName, setGitUserName, gitUserEmail, setGitUserEmail, gitBinary, setGitBinary, gitBinaryPath, setGitBinaryPath, gitBinaryBusy, setGitBinaryBusy, githubToken, setGithubToken, ghEnterpriseHost, setGhEnterpriseHost, ghEnterpriseToken, setGhEnterpriseToken, showToken, setShowToken, githubUser, setGithubUser, githubSource, setGithubSource, autolinksRaw, setAutolinksRaw, githubLoading, setGithubLoading, appInfo, setAppInfo, updateStatus, setUpdateStatus, updateVersion, setUpdateVersion, updateReady, setUpdateReady, downloadProgress, setDownloadProgress, updateError, setUpdateError, checkHadError, aiGlobalInstr, setAiGlobalInstr, aiFeatSel, setAiFeatSel, aiFeatInstr, setAiFeatInstr, aiFeatRoom, setAiFeatRoom, aiFeatDetail, setAiFeatDetail, aiKeys, setAiKeys, aiCustoms, setAiCustoms, aiDefault, setAiDefault, liveModels, setLiveModels, loadingModels, setLoadingModels, modelsError, setModelsError, aiSnapshot, setAiSnapshot, showKeyFor, setShowKeyFor, showTutoFor, setShowTutoFor, notifyFetch, setNotifyFetch, notifyCommit, setNotifyCommit, notifyUpdate, setNotifyUpdate, autoStash, setAutoStash, warnBeforeConflict, setWarnBeforeConflict, gpgSign, setGpgSign, profiles, setProfiles, externalEditor, setExternalEditor, defaultBranchName, setDefaultBranchName, autoFetchInterval, setAutoFetchInterval, autoUpdateSubmodules, setAutoUpdateSubmodules, repoTuning, setRepoTuning, externalDiffTool, setExternalDiffTool, externalMergeTool, setExternalMergeTool, externalTerminal, setExternalTerminal, sshUseAgent, setSshUseAgent, sshPrivateKey, setSshPrivateKey, sshPublicKey, setSshPublicKey, sshGenerating, setSshGenerating, sshPassphrase, setSshPassphrase, fetchModels, fetchGithubUser, autolinks, saveAutolinks, handleGithubLogin, handleGithubDisconnect, saveGit, persistProfiles, saveCurrentAsProfile, applyProfile, deleteProfile, saveGithub, aiDraft, aiDirty, saveAI, onClose, showToast, onUpdateFound, embedded, onBrowseThemes,
  }
}

/** Everything a section may read or call, typed by inference: add a state to the hook and every section can have it. */
export type SettingsPage = ReturnType<typeof useSettingsPage>
