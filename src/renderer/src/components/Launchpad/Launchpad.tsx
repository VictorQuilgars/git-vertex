import { useState, useEffect, useCallback, useMemo } from 'react'
import './Launchpad.css'
import { useLang } from '../../i18n/LanguageContext'

// Full-page, user-centric Launchpad (GitKraken-style): one GitHub search over
// ALL of the user's repos — your open PRs and issues — split into tabs, with an
// optional workspace scope. Launched by the 🚀 button in the tab bar.

interface Label { name: string; color: string }
interface Row {
  type: 'pr' | 'issue'
  number: number
  title: string
  draft?: boolean
  author: string
  authorAvatar?: string
  createdAt: string
  updatedAt?: string
  comments: number
  labels: Label[]
  url: string
  repo: string      // owner/repo
  repoUrl?: string
}

interface Props {
  recentRepos: string[]
  // { repoPath: workspaceName } — the Launchpad owns workspace assignment now.
  workspaces: Record<string, string>
  onSetWorkspace: (path: string, name: string) => Promise<void> | void
}

function timeAgo(dateStr: string, lang: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return lang === 'fr' ? "à l'instant" : 'now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}${lang === 'fr' ? 'j' : 'd'}`
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}${lang === 'fr' ? 'M' : 'mo'}`
  return `${Math.floor(diff / 31536000)}${lang === 'fr' ? 'an' : 'y'}`
}

export default function Launchpad({ recentRepos, workspaces, onSetWorkspace }: Props) {
  const { t, lang } = useLang()
  const [tab, setTab] = useState<'prs' | 'issues' | 'all'>('issues')
  const [wsFilter, setWsFilter] = useState<string>('')   // '' = all my items
  const [prItems, setPrItems] = useState<Row[]>([])
  const [issueItems, setIssueItems] = useState<Row[]>([])
  const [prTotal, setPrTotal] = useState(0)
  const [issueTotal, setIssueTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [noAuth, setNoAuth] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [menuKey, setMenuKey] = useState<string | null>(null)

  const workspaceNames = useMemo(
    () => [...new Set(Object.values(workspaces).filter(Boolean))].sort(),
    [workspaces],
  )
  const scopedPaths = useMemo(
    () => (wsFilter ? recentRepos.filter(p => (workspaces[p] ?? '') === wsFilter) : recentRepos),
    [recentRepos, workspaces, wsFilter],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setNoAuth(false)
    try {
      const [pr, iss] = await Promise.all([
        (window.gitAPI as any).githubSearchIssues('is:open is:pr author:@me'),
        (window.gitAPI as any).githubSearchIssues('is:open is:issue author:@me'),
      ])
      if (pr.error === 'not_authenticated' || iss.error === 'not_authenticated') {
        setNoAuth(true); setPrItems([]); setIssueItems([]); return
      }
      // Optional workspace scoping: keep only items whose repo is assigned to
      // the selected workspace (resolved from its local paths).
      let allowed: Set<string> | null = null
      if (wsFilter) {
        const detected = await Promise.all(scopedPaths.map(p =>
          (window.gitAPI as any).githubDetectRepoAt(p).catch(() => ({ owner: null }))
        ))
        allowed = new Set(detected.filter(d => d?.owner).map(d => `${d.owner}/${d.repo}`))
      }
      const scope = (arr: Row[]) => (allowed ? arr.filter(r => allowed!.has(r.repo)) : arr)
      const prRows = scope(pr.items ?? [])
      const issRows = scope(iss.items ?? [])
      setPrItems(prRows)
      setIssueItems(issRows)
      // With a workspace filter the API total is unfiltered, so fall back to the
      // filtered length; otherwise trust GitHub's total_count.
      setPrTotal(allowed ? prRows.length : (pr.total ?? prRows.length))
      setIssueTotal(allowed ? issRows.length : (iss.total ?? issRows.length))
    } finally {
      setLoading(false)
    }
  }, [wsFilter, scopedPaths])

  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    const base = tab === 'prs' ? prItems : tab === 'issues' ? issueItems : [...prItems, ...issueItems]
    return [...base].sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime())
  }, [tab, prItems, issueItems])

  const openExt = (url?: string) => { if (url) window.gitAPI.openExternal(url) }
  const copy = (url: string) => { navigator.clipboard.writeText(url); setMenuKey(null) }

  const TABS: { id: 'prs' | 'issues' | 'all'; label: string; count: number }[] = [
    { id: 'prs',    label: t('launchpad.tab.prs'),    count: prTotal },
    { id: 'issues', label: t('launchpad.tab.issues'), count: issueTotal },
    { id: 'all',    label: t('launchpad.tab.all'),    count: prTotal + issueTotal },
  ]

  return (
    <div className="lp-page">
      <div className="lp-header">
        <span className="lp-rocket">🚀</span>
        <h1 className="lp-title">{t('launchpad.title')}</h1>
        <div style={{ flex: 1 }} />
        <select className="lp-ws-filter" value={wsFilter} onChange={e => setWsFilter(e.target.value)}
          title={t('launchpad.workspaceFilter')}>
          <option value="">{t('launchpad.allRepos')}</option>
          {workspaceNames.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <button className={`lp-manage ${manageOpen ? 'active' : ''}`} onClick={() => setManageOpen(o => !o)}
          title={t('launchpad.manage')}>⚙</button>
        <button className="lp-refresh" onClick={load} title={t('launchpad.refresh')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ animation: loading ? 'lp-spin 0.8s linear infinite' : 'none' }}>
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
      </div>

      <div className="lp-tabs">
        {TABS.map(tb => (
          <button key={tb.id} className={`lp-tab ${tab === tb.id ? 'active' : ''}`} onClick={() => setTab(tb.id)}>
            <span className="lp-tab-label">{tb.label}</span>
            <span className="lp-count">{loading ? '·' : tb.count}</span>
          </button>
        ))}
      </div>

      {manageOpen && (
        <div className="lp-manage-panel">
          <div className="lp-manage-title">{t('launchpad.manage')}</div>
          <div className="lp-manage-desc">{t('launchpad.manageDesc')}</div>
          <div className="lp-manage-list">
            {recentRepos.length === 0 && <div className="lp-state">{t('launchpad.noRepos')}</div>}
            {recentRepos.map(p => (
              <div key={p} className="lp-manage-row">
                <span className="lp-manage-repo" title={p}>{p.split('/').pop()}</span>
                <input
                  className="lp-manage-input"
                  defaultValue={workspaces[p] ?? ''}
                  placeholder={t('launchpad.workspacePlaceholder')}
                  onBlur={e => { const v = e.target.value.trim(); if (v !== (workspaces[p] ?? '')) onSetWorkspace(p, v) }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="lp-body">
        {noAuth ? (
          <div className="lp-empty">
            <div className="lp-empty-title">{t('launchpad.noAuthTitle')}</div>
            <div className="lp-empty-hint">{t('launchpad.noAuth')}</div>
          </div>
        ) : loading ? (
          <div className="lp-state">{t('launchpad.loading')}</div>
        ) : rows.length === 0 ? (
          <div className="lp-empty">
            <div className="lp-empty-title">
              {tab === 'prs' ? t('launchpad.empty.prs') : tab === 'issues' ? t('launchpad.empty.issues') : t('launchpad.empty.all')}
            </div>
            <div className="lp-empty-hint">{wsFilter ? t('launchpad.emptyWorkspace') : t('launchpad.emptyHint')}</div>
          </div>
        ) : (
          <table className="lp-table">
            <thead>
              <tr>
                <th className="lp-col-status">{t('launchpad.col.status')}</th>
                <th className="lp-col-item">{t('launchpad.col.item')}</th>
                <th className="lp-col-author">{t('launchpad.col.author')}</th>
                <th className="lp-col-repo">{t('launchpad.col.repo')}</th>
                <th className="lp-col-action">{t('launchpad.col.action')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const key = `${r.type}-${r.repo}-${r.number}`
                return (
                  <tr key={key} className="lp-row" onClick={() => openExt(r.url)} title={t('launchpad.openIn')}>
                    <td className="lp-col-status">
                      <span className={`lp-dot ${r.draft ? 'draft' : r.type}`} />
                      <span className="lp-age">{timeAgo(r.updatedAt ?? r.createdAt, lang)}</span>
                    </td>
                    <td className="lp-col-item">
                      <div className="lp-item-top">
                        <span className={`lp-kind lp-kind--${r.type}`}>{r.type === 'pr' ? t('launchpad.item.pr') : t('launchpad.item.issue')}</span>
                        <span className="lp-item-title">{r.title}</span>
                        <span className="lp-num">#{r.number}</span>
                      </div>
                      {(r.comments > 0 || r.labels?.length > 0) && (
                        <div className="lp-item-meta">
                          {r.comments > 0 && <span className="lp-cmt">💬 {r.comments}</span>}
                          {r.labels?.slice(0, 3).map(l => (
                            <span key={l.name} className="lp-label"
                              style={{ background: `#${l.color}22`, borderColor: `#${l.color}66`, color: `#${l.color}` }}>
                              {l.name}
                            </span>
                          ))}
                          {r.labels?.length > 3 && <span className="lp-label-more">+{r.labels.length - 3}</span>}
                        </div>
                      )}
                    </td>
                    <td className="lp-col-author">
                      {r.authorAvatar
                        ? <img className="lp-avatar" src={r.authorAvatar} alt={r.author} title={`@${r.author}`} />
                        : <span className="lp-avatar lp-avatar--ph" title={`@${r.author}`}>{r.author.slice(0, 1).toUpperCase()}</span>}
                    </td>
                    <td className="lp-col-repo">
                      <button className="lp-repo-link" onClick={e => { e.stopPropagation(); openExt(r.repoUrl) }} title={t('launchpad.openRepo')}>
                        {r.repo}
                      </button>
                    </td>
                    <td className="lp-col-action" onClick={e => e.stopPropagation()}>
                      <div className="lp-split">
                        <button className="lp-split-main" onClick={() => openExt(r.url)}>{t('launchpad.view')}</button>
                        <button className="lp-split-caret" onClick={() => setMenuKey(menuKey === key ? null : key)}>▾</button>
                        {menuKey === key && (
                          <div className="lp-menu">
                            <button onClick={() => { openExt(r.url); setMenuKey(null) }}>{t('launchpad.openIn')}</button>
                            <button onClick={() => { openExt(r.repoUrl); setMenuKey(null) }}>{t('launchpad.openRepo')}</button>
                            <button onClick={() => copy(r.url)}>{t('launchpad.copyLink')}</button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {menuKey && <div className="lp-menu-backdrop" onClick={() => setMenuKey(null)} />}
    </div>
  )
}
