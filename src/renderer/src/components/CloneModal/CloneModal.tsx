import { useState, useEffect, useMemo } from 'react'
import './CloneModal.css'
import { useLang } from '../../i18n/LanguageContext'

interface GithubRepo {
  id: number
  name: string
  fullName: string
  description: string
  private: boolean
  language: string | null
  stars: number
  updatedAt: string
  cloneUrl: string
  sshUrl: string
}

interface Props {
  onClose: () => void
  onCloned: (path: string, name: string) => void
}

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5',
  Rust: '#dea584', Go: '#00ADD8', Java: '#b07219', 'C#': '#178600',
  'C++': '#f34b7d', C: '#555555', Ruby: '#701516', Swift: '#F05138',
  Kotlin: '#A97BFF', Dart: '#00B4AB', HTML: '#e34c26', CSS: '#563d7c',
  Vue: '#41b883', Svelte: '#ff3e00', Shell: '#89e051',
}

export default function CloneModal({ onClose, onCloned }: Props) {
  const { t } = useLang()
  const [provider, setProvider] = useState<'url' | 'github'>('github')
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [loading, setLoading] = useState(false)
  const [authError, setAuthError] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<GithubRepo | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [location, setLocation] = useState('')
  const [shallow, setShallow] = useState(false)
  const [sparse, setSparse] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setAuthError(false)
    window.gitAPI.githubListRepos().then((r: any) => {
      setLoading(false)
      if (r.error === 'not_authenticated') { setAuthError(true); return }
      if (r.error) { setError(r.error); return }
      setRepos(r.repos ?? [])
    })
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return repos
    const q = search.toLowerCase()
    return repos.filter(r => r.name.toLowerCase().includes(q) || r.fullName.toLowerCase().includes(q) || (r.language ?? '').toLowerCase().includes(q))
  }, [repos, search])

  const browse = async () => {
    const r = await window.gitAPI.selectDirectory(t('clone.chooseLocation'))
    if (r.path) setLocation(r.path)
  }

  const targetUrl = provider === 'github' ? selected?.cloneUrl : urlInput.trim()
  const targetName = provider === 'github'
    ? selected?.name
    : (urlInput.trim().split('/').pop()?.replace(/\.git$/, '') || 'repo')
  const canClone = !!location && !!targetUrl && !cloning

  const doClone = async () => {
    if (!canClone || !targetUrl || !targetName) return
    setCloning(true)
    setError(null)
    const r = await (window.gitAPI as any).cloneTo({ url: targetUrl, location, name: targetName, shallow, sparse })
    setCloning(false)
    if (r.error) { setError(t('clone.err', r.error)); return }
    onCloned(r.path, r.name ?? targetName)
  }

  const PROVIDERS: { id: 'url' | 'github'; icon: string; label: string }[] = [
    { id: 'url',    icon: '🌐', label: t('clone.withUrl') },
    { id: 'github', icon: '🐙', label: 'GitHub.com' },
  ]

  return (
    <div className="cm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cm-modal">
        <div className="cm-header">
          <span className="cm-title">{t('clone.title')}</span>
          <button className="cm-close" onClick={onClose}>×</button>
        </div>

        <div className="cm-body">
          <nav className="cm-nav">
            {PROVIDERS.map(p => (
              <button key={p.id} className={`cm-nav-item ${provider === p.id ? 'active' : ''}`} onClick={() => setProvider(p.id)}>
                <span className="cm-nav-icon">{p.icon}</span>{p.label}
              </button>
            ))}
          </nav>

          <div className="cm-form">
            <h3 className="cm-form-title">{t('clone.formTitle')}</h3>

            <div className="cm-field">
              <label>{t('clone.whereTo')}</label>
              <div className="cm-row">
                <input className="cm-input" value={location} onChange={e => setLocation(e.target.value)} />
                <button className="cm-browse" onClick={browse}>{t('clone.browse')}</button>
              </div>
            </div>

            {provider === 'url' ? (
              <div className="cm-field">
                <label>{t('clone.url')}</label>
                <input className="cm-input" autoFocus value={urlInput} onChange={e => setUrlInput(e.target.value)}
                  placeholder="https://github.com/owner/repo.git" onKeyDown={e => e.key === 'Enter' && doClone()} />
              </div>
            ) : (
              <div className="cm-field cm-field-list">
                <label>{t('clone.repoToClone')}</label>
                <div className="cm-picker">
                  <div className="cm-search-row">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input className="cm-search" placeholder={t('clone.search')} value={search} onChange={e => setSearch(e.target.value)} autoFocus />
                    {search && <button className="cm-clear" onClick={() => setSearch('')}>×</button>}
                  </div>
                  <div className="cm-list">
                    {loading && <div className="cm-state">{t('clone.loading')}</div>}
                    {authError && <div className="cm-state cm-state-warn">{t('clone.noAuth')}</div>}
                    {!loading && !authError && filtered.length === 0 && <div className="cm-state">{t('clone.noRepos')}</div>}
                    {filtered.map(repo => (
                      <button key={repo.id} className={`cm-repo-row ${selected?.id === repo.id ? 'selected' : ''}`} onClick={() => setSelected(repo)}>
                        <div className="cm-repo-info">
                          <div className="cm-repo-top">
                            <span className="cm-repo-name">{repo.name}</span>
                            <span className={`cm-repo-vis ${repo.private ? 'private' : 'public'}`}>{repo.private ? t('clone.private') : t('clone.public')}</span>
                          </div>
                          {repo.description && <div className="cm-repo-desc">{repo.description}</div>}
                          <div className="cm-repo-meta">
                            {repo.language && <span className="cm-repo-lang"><span className="cm-lang-dot" style={{ background: LANG_COLORS[repo.language] ?? '#8b949e' }} />{repo.language}</span>}
                          </div>
                        </div>
                        {selected?.id === repo.id && <span className="cm-repo-check">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <label className="cm-check"><input type="checkbox" checked={shallow} onChange={e => setShallow(e.target.checked)} />{t('clone.shallow')}</label>
            <label className="cm-check"><input type="checkbox" checked={sparse} onChange={e => setSparse(e.target.checked)} />{t('clone.sparse')}</label>

            {error && <div className="cm-error">{error}</div>}

            <div className="cm-foot">
              <button className="cm-clone-go" disabled={!canClone} onClick={doClone}>
                {cloning ? t('clone.cloning') : t('clone.cloneRepo')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
