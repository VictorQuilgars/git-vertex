import React, { useState, useEffect, useMemo } from 'react'
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

function RepoRow({ repo, onClone, cloning }: { repo: GithubRepo; onClone: () => void; cloning: boolean }) {
  const { t } = useLang()
  const updated = useMemo(() => {
    const d = new Date(repo.updatedAt)
    const diff = Math.floor((Date.now() - d.getTime()) / 86400000)
    if (diff === 0) return "aujourd'hui"
    if (diff === 1) return 'hier'
    if (diff < 30) return `il y a ${diff} j`
    if (diff < 365) return `il y a ${Math.floor(diff / 30)} mois`
    return `il y a ${Math.floor(diff / 365)} an${Math.floor(diff / 365) > 1 ? 's' : ''}`
  }, [repo.updatedAt])

  return (
    <div className="cm-repo-row">
      <div className="cm-repo-info">
        <div className="cm-repo-top">
          <span className="cm-repo-name">{repo.name}</span>
          <span className={`cm-repo-vis ${repo.private ? 'private' : 'public'}`}>
            {repo.private ? t('clone.private') : t('clone.public')}
          </span>
          {repo.stars > 0 && <span className="cm-repo-stars">{t('clone.stars', repo.stars)}</span>}
        </div>
        {repo.description && <div className="cm-repo-desc">{repo.description}</div>}
        <div className="cm-repo-meta">
          {repo.language && (
            <span className="cm-repo-lang">
              <span className="cm-lang-dot" style={{ background: LANG_COLORS[repo.language] ?? '#8b949e' }} />
              {repo.language}
            </span>
          )}
          <span className="cm-repo-date">{updated}</span>
        </div>
      </div>
      <button className="cm-clone-btn" onClick={onClone} disabled={cloning}>
        {cloning ? t('clone.cloning') : t('clone.cloneBtn')}
      </button>
    </div>
  )
}

export default function CloneModal({ onClose, onCloned }: Props) {
  const { t } = useLang()
  const [tab, setTab] = useState<'repos' | 'url'>('repos')
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [loading, setLoading] = useState(false)
  const [authError, setAuthError] = useState(false)
  const [search, setSearch] = useState('')
  const [cloningId, setCloningId] = useState<number | null>(null)
  const [cloneError, setCloneError] = useState<string | null>(null)

  const [urlInput, setUrlInput] = useState('')
  const [urlCloning, setUrlCloning] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setAuthError(false)
    window.gitAPI.githubListRepos().then((r: any) => {
      setLoading(false)
      if (r.error === 'not_authenticated') { setAuthError(true); return }
      if (r.error) { setCloneError(r.error); return }
      setRepos(r.repos ?? [])
    })
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return repos
    const q = search.toLowerCase()
    return repos.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      (r.language ?? '').toLowerCase().includes(q)
    )
  }, [repos, search])

  async function handleClone(repo: GithubRepo) {
    setCloningId(repo.id)
    setCloneError(null)
    const r = await window.gitAPI.githubClone(repo.cloneUrl, repo.name) as any
    setCloningId(null)
    if (r.cancelled) return
    if (r.error) { setCloneError(t('clone.err', r.error)); return }
    onCloned(r.path, r.name ?? repo.name)
  }

  async function handleUrlClone() {
    const url = urlInput.trim()
    if (!url) return
    const name = url.split('/').pop()?.replace(/\.git$/, '') ?? 'repo'
    setUrlCloning(true)
    setUrlError(null)
    const r = await window.gitAPI.githubClone(url, name) as any
    setUrlCloning(false)
    if (r.cancelled) return
    if (r.error) { setUrlError(t('clone.err', r.error)); return }
    onCloned(r.path, r.name ?? name)
  }

  return (
    <div className="cm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cm-modal">
        <div className="cm-header">
          <span className="cm-title">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            {t('clone.title')}
          </span>
          <button className="cm-close" onClick={onClose}>×</button>
        </div>

        <div className="cm-tabs">
          <button className={`cm-tab ${tab === 'repos' ? 'active' : ''}`} onClick={() => setTab('repos')}>
            {t('clone.tabRepos')}
          </button>
          <button className={`cm-tab ${tab === 'url' ? 'active' : ''}`} onClick={() => setTab('url')}>
            {t('clone.tabUrl')}
          </button>
        </div>

        {tab === 'repos' && (
          <>
            <div className="cm-search-row">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                className="cm-search"
                placeholder={t('clone.search')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
              {search && <button className="cm-clear" onClick={() => setSearch('')}>×</button>}
            </div>

            <div className="cm-list">
              {loading && <div className="cm-state">{t('clone.loading')}</div>}
              {authError && <div className="cm-state cm-state-warn">{t('clone.noAuth')}</div>}
              {cloneError && <div className="cm-state cm-state-err">{cloneError}</div>}
              {!loading && !authError && filtered.length === 0 && (
                <div className="cm-state">{t('clone.noRepos')}</div>
              )}
              {filtered.map(repo => (
                <RepoRow
                  key={repo.id}
                  repo={repo}
                  onClone={() => handleClone(repo)}
                  cloning={cloningId === repo.id}
                />
              ))}
            </div>
          </>
        )}

        {tab === 'url' && (
          <div className="cm-url-panel">
            <div className="cm-url-row">
              <input
                className="cm-url-input"
                placeholder={t('clone.urlPlaceholder')}
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleUrlClone()}
                autoFocus
              />
              <button className="cm-url-btn" onClick={handleUrlClone} disabled={urlCloning || !urlInput.trim()}>
                {urlCloning ? t('clone.cloning') : t('clone.urlCloneBtn')}
              </button>
            </div>
            {urlError && <div className="cm-url-err">{urlError}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
