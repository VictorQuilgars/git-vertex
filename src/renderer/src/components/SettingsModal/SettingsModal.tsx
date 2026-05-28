import React, { useState, useEffect } from 'react'
import './SettingsModal.css'

type Section = 'git' | 'github' | 'ai' | 'about'
type AIProvider = 'anthropic' | 'google' | 'groq' | 'openai'

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

const API_KEY_TUTORIALS: Record<AIProvider, { steps: string[]; url: string; urlLabel: string }> = {
  anthropic: {
    steps: [
      '1. Créer un compte sur console.anthropic.com',
      '2. Aller dans Settings → API Keys',
      '3. Cliquer sur "Create Key"',
      '4. Copier la clé (elle ne sera plus visible ensuite)',
    ],
    url: 'https://console.anthropic.com/settings/keys',
    urlLabel: 'Ouvrir console.anthropic.com',
  },
  google: {
    steps: [
      '1. Aller sur aistudio.google.com',
      '2. Cliquer sur "Get API key" en haut à gauche',
      '3. Créer une clé dans un projet Google Cloud',
      '4. Copier la clé générée',
    ],
    url: 'https://aistudio.google.com/app/apikey',
    urlLabel: 'Ouvrir Google AI Studio',
  },
  groq: {
    steps: [
      '1. Créer un compte sur console.groq.com',
      '2. Aller dans "API Keys" dans le menu gauche',
      '3. Cliquer sur "Create API Key"',
      '4. Copier la clé (elle ne sera plus visible ensuite)',
    ],
    url: 'https://console.groq.com/keys',
    urlLabel: 'Ouvrir console.groq.com',
  },
  openai: {
    steps: [
      '1. Créer un compte sur platform.openai.com',
      '2. Aller dans "API keys" dans le menu gauche',
      '3. Cliquer sur "Create new secret key"',
      '4. Copier la clé (elle ne sera plus visible ensuite)',
    ],
    url: 'https://platform.openai.com/api-keys',
    urlLabel: 'Ouvrir platform.openai.com',
  },
}

interface SettingsModalProps {
  onClose: () => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
}

export default function SettingsModal({ onClose, showToast }: SettingsModalProps) {
  const [section, setSection] = useState<Section>('git')

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
    ;(window.gitAPI as any).onGithubAuthComplete(async (result: { token?: string; error?: string }) => {
      setGithubLoading(false)
      if (result.token) {
        setGithubToken(result.token)
        await fetchGithubUser()
        showToast('Connecté à GitHub ✓')
      } else {
        showToast(`Connexion GitHub échouée : ${result.error}`, 'err')
      }
    })
  }, [])

  const handleGithubLogin = async () => {
    setGithubLoading(true)
    await (window.gitAPI as any).githubStartAuth()
  }

  const handleGithubDisconnect = async () => {
    await (window.gitAPI as any).githubDisconnect()
    setGithubToken('')
    setGithubUser(null)
    showToast('Déconnecté de GitHub')
  }

  const saveGit = async () => {
    const r = await window.gitAPI.gitSetGlobalConfig(gitUserName.trim(), gitUserEmail.trim())
    if (r.success) showToast('Config Git sauvegardée ✓')
    else showToast(`Erreur : ${r.error}`, 'err')
  }

  const saveGithub = async () => {
    await window.gitAPI.settingsSet('githubToken', githubToken.trim())
    showToast('Token GitHub sauvegardé ✓')
  }

  const saveAI = async () => {
    const cap = aiProvider.charAt(0).toUpperCase() + aiProvider.slice(1)
    await window.gitAPI.settingsSet('aiProvider', aiProvider)
    await window.gitAPI.settingsSet(`ai${cap}Key`, aiKeys[aiProvider])
    await window.gitAPI.settingsSet(`ai${cap}Model`, aiModels[aiProvider])
    if (aiProvider === 'groq') await window.gitAPI.settingsSet('groqApiKey', aiKeys.groq)
    showToast('Paramètres IA sauvegardés ✓')
  }

  const tuto = API_KEY_TUTORIALS[aiProvider]

  return (
    <div className="stg-page">
      {/* Header */}
      <div className="stg-header">
        <button className="stg-back" onClick={onClose} title="Retour">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Retour
        </button>
        <span className="stg-title">Paramètres</span>
      </div>

      <div className="stg-body">
        {/* Left nav */}
        <nav className="stg-nav">
            {(['git', 'github', 'ai', 'about'] as Section[]).map(s => (
              <button
                key={s}
                className={`stg-nav-item ${section === s ? 'active' : ''}`}
                onClick={() => setSection(s)}
              >
                {s === 'git' && '⎇ Git'}
                {s === 'github' && '🐙 GitHub'}
                {s === 'ai' && '✨ Intelligence Artificielle'}
                {s === 'about' && 'ℹ À propos'}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="stg-content">

            {/* ── Git ── */}
            {section === 'git' && (
              <div className="stg-section">
                <h2 className="stg-section-title">Configuration Git globale</h2>
                <p className="stg-desc">Ces valeurs sont utilisées pour signer vos commits (<code>git config --global</code>).</p>

                <label className="stg-field">
                  <span>Nom</span>
                  <input
                    className="stg-input"
                    value={gitUserName}
                    onChange={e => setGitUserName(e.target.value)}
                    placeholder="Prénom Nom"
                  />
                </label>

                <label className="stg-field">
                  <span>Email</span>
                  <input
                    className="stg-input"
                    type="email"
                    value={gitUserEmail}
                    onChange={e => setGitUserEmail(e.target.value)}
                    placeholder="vous@exemple.com"
                  />
                </label>

                <button className="stg-save" onClick={saveGit}>Enregistrer</button>
              </div>
            )}

            {/* ── GitHub ── */}
            {section === 'github' && (
              <div className="stg-section">
                <h2 className="stg-section-title">Connexion GitHub</h2>
                <p className="stg-desc">Connectez votre compte GitHub pour accéder aux Pull Requests, Issues et autres fonctionnalités collaboratives.</p>

                {githubUser ? (
                  <div className="stg-gh-connected">
                    <img className="stg-gh-avatar" src={githubUser.avatar} alt={githubUser.login} />
                    <div className="stg-gh-info">
                      <span className="stg-gh-login">{githubUser.login}</span>
                      <span className="stg-gh-status">Connecté</span>
                    </div>
                    <button className="stg-gh-disconnect" onClick={handleGithubDisconnect}>
                      Déconnecter
                    </button>
                  </div>
                ) : (
                  <button
                    className="stg-gh-login-btn"
                    onClick={handleGithubLogin}
                    disabled={githubLoading}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
                    </svg>
                    {githubLoading ? 'Connexion en cours…' : 'Se connecter avec GitHub'}
                  </button>
                )}
              </div>
            )}

            {/* ── AI ── */}
            {section === 'ai' && (
              <div className="stg-section">
                <h2 className="stg-section-title">Fournisseur d'IA</h2>
                <p className="stg-desc">Choisissez le fournisseur utilisé pour la génération automatique de messages de commit.</p>

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
                    <span>Modèle — {AI_PROVIDERS.find(p => p.id === aiProvider)?.label}</span>
                    {liveModels[aiProvider] && (
                      <span className="stg-model-count">{liveModels[aiProvider]!.length} modèles disponibles</span>
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
                          <option value={aiModels[aiProvider]}>{aiModels[aiProvider]} (custom)</option>
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
                      title="Recharger les modèles disponibles"
                    >
                      {loadingModels ? '…' : '⟳'}
                    </button>
                  </div>
                  {liveModels[aiProvider] && (
                    <input
                      className="stg-input stg-mono stg-model-custom"
                      value={aiModels[aiProvider]}
                      onChange={e => setAiModels(m => ({ ...m, [aiProvider]: e.target.value }))}
                      placeholder="ou saisir un modèle custom…"
                    />
                  )}
                  {modelsError && <span className="stg-models-error">{modelsError}</span>}
                </div>

                <label className="stg-field">
                  <span>Clé API — {AI_PROVIDERS.find(p => p.id === aiProvider)?.label}</span>
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
                    <button className="stg-eye" onClick={() => setShowKey(v => !v)} title={showKey ? 'Masquer' : 'Afficher'}>
                      {showKey ? '🙈' : '👁'}
                    </button>
                  </div>
                </label>

                <button
                  className="stg-tuto-toggle"
                  onClick={() => setShowTuto(v => !v)}
                >
                  {showTuto ? '▾' : '▸'} Comment obtenir une clé API {AI_PROVIDERS.find(p => p.id === aiProvider)?.label}
                </button>

                {showTuto && (
                  <div className="stg-tuto">
                    <ol className="stg-tuto-steps">
                      {tuto.steps.map((s, i) => <li key={i}>{s}</li>)}
                    </ol>
                  </div>
                )}

                <button className="stg-save" onClick={saveAI}>Enregistrer</button>
              </div>
            )}

            {/* ── About ── */}
            {section === 'about' && (
              <div className="stg-section">
                <div className="stg-about-hero">
                  <img src="../../resources/icon.png" className="stg-about-icon" alt="Git Vertex" onError={e => (e.currentTarget.style.display = 'none')} />
                  <div>
                    <h1 className="stg-about-name">Git Vertex</h1>
                    <span className="stg-about-version">v{appInfo?.version ?? '—'}</span>
                  </div>
                </div>

                <p className="stg-desc">Interface graphique Git rapide et moderne. Visualisez vos branches, indexez vos changements et gérez vos commits simplement.</p>

                <div className="stg-about-links">
                  <a className="stg-about-link" onClick={() => (window as any).gitAPI.openExternal?.('https://github.com/VictorQuilgars/git-vertex')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                    Code source
                  </a>
                  <a className="stg-about-link" onClick={() => (window as any).gitAPI.openExternal?.('https://github.com/VictorQuilgars/git-vertex/releases')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Releases
                  </a>
                  <a className="stg-about-link" onClick={() => (window as any).gitAPI.openExternal?.('https://github.com/VictorQuilgars/git-vertex/issues')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    Signaler un bug
                  </a>
                </div>

                <div className="stg-about-author">
                  <span className="stg-about-label">Créé par</span>
                  <a className="stg-about-link" onClick={() => (window as any).gitAPI.openExternal?.('https://github.com/VictorQuilgars')}>Victor Quilgars</a>
                </div>

                <div className="stg-about-env">
                  <h3 className="stg-about-env-title">Environnement</h3>
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

                <div className="stg-about-license">
                  Distribué sous licence <strong>MIT</strong>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
  )
}

