import React, { useState, useEffect } from 'react'
import './SettingsModal.css'

type Section = 'git' | 'github' | 'ai'
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

  // AI
  const [aiProvider, setAiProvider] = useState<AIProvider>('groq')
  const [aiKeys, setAiKeys] = useState<Record<AIProvider, string>>({ anthropic: '', google: '', groq: '', openai: '' })
  const [aiModels, setAiModels] = useState<Record<AIProvider, string>>({
    anthropic: 'claude-haiku-4-5-20251001',
    google:    'gemini-2.0-flash',
    groq:      'llama-3.3-70b-versatile',
    openai:    'gpt-4o-mini',
  })
  const [showKey, setShowKey] = useState(false)
  const [showTuto, setShowTuto] = useState(false)

  useEffect(() => {
    window.gitAPI.gitGetGlobalConfig().then((r: any) => {
      setGitUserName(r.userName ?? '')
      setGitUserEmail(r.userEmail ?? '')
    })
    window.gitAPI.settingsGetAll().then((s: any) => {
      setGithubToken(s.githubToken ?? '')
      setAiProvider((s.aiProvider as AIProvider) ?? 'groq')
      setAiKeys({
        anthropic: s.aiAnthropicKey ?? '',
        google:    s.aiGoogleKey ?? '',
        groq:      s.aiGroqKey ?? s.groqApiKey ?? '',
        openai:    s.aiOpenaiKey ?? '',
      })
      setAiModels(m => ({
        anthropic: s.aiAnthropicModel || m.anthropic,
        google:    s.aiGoogleModel    || m.google,
        groq:      s.aiGroqModel      || m.groq,
        openai:    s.aiOpenaiModel    || m.openai,
      }))
    })
  }, [])

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
    <div className="stg-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="stg-panel">
        {/* Header */}
        <div className="stg-header">
          <span className="stg-title">⚙ Paramètres</span>
          <button className="stg-close" onClick={onClose}>×</button>
        </div>

        <div className="stg-body">
          {/* Left nav */}
          <nav className="stg-nav">
            {(['git', 'github', 'ai'] as Section[]).map(s => (
              <button
                key={s}
                className={`stg-nav-item ${section === s ? 'active' : ''}`}
                onClick={() => setSection(s)}
              >
                {s === 'git' && '⎇ Git'}
                {s === 'github' && '🐙 GitHub'}
                {s === 'ai' && '✨ Intelligence Artificielle'}
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
                <h2 className="stg-section-title">Token GitHub</h2>
                <p className="stg-desc">Un Personal Access Token (PAT) permet d'accéder à l'API GitHub pour les opérations authentifiées.</p>

                <label className="stg-field">
                  <span>Personal Access Token</span>
                  <div className="stg-input-row">
                    <input
                      className="stg-input"
                      type={showToken ? 'text' : 'password'}
                      value={githubToken}
                      onChange={e => setGithubToken(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    />
                    <button className="stg-eye" onClick={() => setShowToken(v => !v)} title={showToken ? 'Masquer' : 'Afficher'}>
                      {showToken ? '🙈' : '👁'}
                    </button>
                  </div>
                </label>

                <div className="stg-tuto">
                  <p className="stg-tuto-title">Comment générer un token GitHub :</p>
                  <ol className="stg-tuto-steps">
                    <li>Aller dans <strong>github.com → Settings → Developer settings</strong></li>
                    <li>Cliquer sur <strong>Personal access tokens → Tokens (classic)</strong></li>
                    <li>Cliquer sur <strong>"Generate new token"</strong></li>
                    <li>Sélectionner les scopes : <code>repo</code>, <code>workflow</code></li>
                    <li>Copier le token généré (visible une seule fois)</li>
                  </ol>
                </div>

                <button className="stg-save" onClick={saveGithub}>Enregistrer</button>
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
                      onClick={() => { setAiProvider(p.id); setShowTuto(false); setShowKey(false) }}
                    >
                      <span className="stg-provider-name">{p.label}</span>
                      <span className="stg-provider-model">{aiModels[p.id]}</span>
                    </button>
                  ))}
                </div>

                <label className="stg-field" style={{ marginTop: 16 }}>
                  <span>Modèle — {AI_PROVIDERS.find(p => p.id === aiProvider)?.label}</span>
                  <input
                    className="stg-input stg-mono"
                    list={`stg-models-${aiProvider}`}
                    value={aiModels[aiProvider]}
                    onChange={e => setAiModels(m => ({ ...m, [aiProvider]: e.target.value }))}
                    placeholder={AI_PROVIDERS.find(p => p.id === aiProvider)?.defaultModel}
                  />
                  <datalist id={`stg-models-${aiProvider}`}>
                    {MODEL_SUGGESTIONS[aiProvider].map(m => <option key={m} value={m} />)}
                  </datalist>
                </label>

                <label className="stg-field">
                  <span>Clé API — {AI_PROVIDERS.find(p => p.id === aiProvider)?.label}</span>
                  <div className="stg-input-row">
                    <input
                      className="stg-input stg-mono"
                      type={showKey ? 'text' : 'password'}
                      value={aiKeys[aiProvider]}
                      onChange={e => setAiKeys(k => ({ ...k, [aiProvider]: e.target.value }))}
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

          </div>
        </div>
      </div>
    </div>
  )
}
