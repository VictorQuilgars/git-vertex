import { useState, useEffect, useCallback, useMemo } from 'react'
import './Launchpad.css'
import { useLang } from '../../i18n/LanguageContext'

// Full-page, cross-repo Launchpad (another tool-style): aggregates the PRs and
// issues of every GitHub repo behind your recent paths, optionally scoped to a
// named workspace. Launched by the 🚀 button in the tab bar.

interface Label { name: string; color: string }
interface Row {
  type: 'pr' | 'issue'
  number: number
  title: string
  draft?: boolean
  author: string
  createdAt: string
  comments: number
  labels: Label[]
  url: string
  repoLabel: string   // owner/repo the item belongs to
}

interface Props {
  recentRepos: string[]
  // { repoPath: workspaceName } — the Launchpad owns workspace assignment now.
  workspaces: Record<string, string>
  onSetWorkspace: (path: string, name: string) => Promise<void> | void
}

function timeAgo(dateStr: string, lang: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return lang === 'fr' ? "à l'instant" : 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}${lang === 'fr' ? 'j' : 'd'}`
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo`
  return `${Math.floor(diff / 31536000)}${lang === 'fr' ? 'an' : 'y'}`
}

export default function Launchpad({ recentRepos, workspaces, onSetWorkspace }: Props) {
  const { t, lang } = useLang()
  const [tab, setTab] = useState<'prs' | 'issues' | 'all'>('prs')
  const [wsFilter, setWsFilter] = useState<string>('')   // '' = all recent repos
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [noAuth, setNoAuth] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)

  // Distinct workspace names present on the recent repos.
  const workspaceNames = useMemo(
    () => [...new Set(Object.values(workspaces).filter(Boolean))].sort(),
    [workspaces],
  )

  // Recent paths in scope for the current workspace filter.
  const scopedPaths = useMemo(
    () => (wsFilter ? recentRepos.filter(p => (workspaces[p] ?? '') === wsFilter) : recentRepos),
    [recentRepos, workspaces, wsFilter],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setNoAuth(false)
    try {
      // User-centric feed (another tool-style): a single GitHub search over ALL of
      // the user's repos, not just the recent/local ones.
      const query =
        tab === 'prs'    ? 'is:open is:pr author:@me'    :
        tab === 'issues' ? 'is:open is:issue author:@me' :
                           'is:open author:@me'
      const res = await (window.gitAPI as any).githubSearchIssues(query)
      if (res.error === 'not_authenticated') { setNoAuth(true); setRows([]); return }
      let items: Row[] = (res.items ?? []).map((x: any) => ({ ...x, repoLabel: x.repo }))

      // Optional workspace scoping: keep only items whose repo belongs to a repo
      // assigned to the selected workspace (resolved from its local paths).
      if (wsFilter) {
        const detected = await Promise.all(scopedPaths.map(p =>
          (window.gitAPI as any).githubDetectRepoAt(p).catch(() => ({ owner: null }))
        ))
        const allowed = new Set(detected.filter(d => d?.owner).map(d => `${d.owner}/${d.repo}`))
        items = items.filter(i => allowed.has(i.repoLabel))
      }

      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setRows(items)
    } finally {
      setLoading(false)
    }
  }, [tab, wsFilter, scopedPaths])

  useEffect(() => { load() }, [load])

  return (
    <div className="lp-page">
      <div className="lp-header">
        <span className="lp-rocket">🚀</span>
        <h1 className="lp-title">{t('launchpad.title')}</h1>
        <div style={{ flex: 1 }} />
        <button className="lp-refresh" onClick={load} title={t('launchpad.refresh')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ animation: loading ? 'lp-spin 0.8s linear infinite' : 'none' }}>
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
      </div>

      <div className="lp-toolbar">
        <div className="lp-tabs">
          <button className={`lp-tab ${tab === 'prs' ? 'active' : ''}`} onClick={() => setTab('prs')}>
            {t('launchpad.tab.prs')}{tab === 'prs' && !loading && rows.length > 0 && <span className="lp-count">{rows.length}</span>}
          </button>
          <button className={`lp-tab ${tab === 'issues' ? 'active' : ''}`} onClick={() => setTab('issues')}>
            {t('launchpad.tab.issues')}{tab === 'issues' && !loading && rows.length > 0 && <span className="lp-count">{rows.length}</span>}
          </button>
          <button className={`lp-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
            {t('launchpad.tab.all')}{tab === 'all' && !loading && rows.length > 0 && <span className="lp-count">{rows.length}</span>}
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <select className="lp-ws-filter" value={wsFilter} onChange={e => setWsFilter(e.target.value)}
          title={t('launchpad.workspaceFilter')}>
          <option value="">{t('launchpad.allRepos')}</option>
          {workspaceNames.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <button className={`lp-manage ${manageOpen ? 'active' : ''}`} onClick={() => setManageOpen(o => !o)}
          title={t('launchpad.manage')}>⚙</button>
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
            <div className="lp-empty-hint">
              {wsFilter ? t('launchpad.emptyWorkspace') : t('launchpad.emptyHint')}
            </div>
          </div>
        ) : (
          <table className="lp-table">
            <thead>
              <tr>
                <th className="lp-col-status">{t('launchpad.col.status')}</th>
                <th className="lp-col-item">{t('launchpad.col.item')}</th>
                <th className="lp-col-repo">{t('launchpad.col.repo')}</th>
                <th className="lp-col-action">{t('launchpad.col.action')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={`${r.type}-${r.repoLabel}-${r.number}`} className="lp-row"
                  onClick={() => window.gitAPI.openExternal(r.url)} title={t('launchpad.openIn')}>
                  <td className="lp-col-status">
                    <span className={`lp-dot ${r.draft ? 'draft' : r.type}`} />
                  </td>
                  <td className="lp-col-item">
                    <div className="lp-item-top">
                      <span className={`lp-kind lp-kind--${r.type}`}>{r.type === 'pr' ? t('launchpad.item.pr') : t('launchpad.item.issue')}</span>
                      <span className="lp-num">#{r.number}</span>
                      <span className="lp-item-title">{r.title}</span>
                    </div>
                    <div className="lp-item-meta">
                      <span>@{r.author}</span>
                      <span className="lp-dot-sep">·</span>
                      <span>{timeAgo(r.createdAt, lang)}</span>
                      {r.labels?.slice(0, 3).map(l => (
                        <span key={l.name} className="lp-label"
                          style={{ background: `#${l.color}22`, borderColor: `#${l.color}66`, color: `#${l.color}` }}>
                          {l.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="lp-col-repo">
                    <span className="lp-repo-name" title={r.repoLabel}>{r.repoLabel}</span>
                  </td>
                  <td className="lp-col-action">
                    <button className="lp-view" onClick={e => { e.stopPropagation(); window.gitAPI.openExternal(r.url) }}>
                      {t('launchpad.view')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
