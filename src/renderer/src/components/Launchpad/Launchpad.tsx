import { useState, useEffect, useCallback, useMemo } from 'react'
import './Launchpad.css'
import { useLang } from '../../i18n/LanguageContext'

// Full-page, user-centric Launchpad (another tool-style): one GitHub search over
// ALL of the user's repos — your open PRs and issues — plus a WIPs tab that
// scans local repos for uncommitted work. ALL mixes WIPs + items, like another tool.

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
interface LocalRepo { path: string; name: string; changed: number; added: number; deleted: number; branch: string; fullname: string | null }
type Entry = { kind: 'wip'; wip: LocalRepo } | { kind: 'item'; row: Row }

interface Props {
  recentRepos: string[]
  workspaces: Record<string, string>
  onSetWorkspace: (path: string, name: string) => Promise<void> | void
  onOpenRepo: (path: string) => void
}
type Tab = 'prs' | 'issues' | 'wips' | 'all'

function timeAgo(dateStr: string, lang: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return lang === 'fr' ? "à l'instant" : 'now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}${lang === 'fr' ? 'j' : 'd'}`
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}${lang === 'fr' ? 'M' : 'mo'}`
  return `${Math.floor(diff / 31536000)}${lang === 'fr' ? 'an' : 'y'}`
}

export default function Launchpad({ recentRepos, workspaces, onSetWorkspace, onOpenRepo }: Props) {
  const { t, lang } = useLang()
  const [tab, setTab] = useState<Tab>('issues')
  const [wsFilter, setWsFilter] = useState<string>('')
  const [labelFilter, setLabelFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [prItems, setPrItems] = useState<Row[]>([])
  const [issueItems, setIssueItems] = useState<Row[]>([])
  const [prTotal, setPrTotal] = useState(0)
  const [issueTotal, setIssueTotal] = useState(0)
  const [localRepos, setLocalRepos] = useState<LocalRepo[]>([])
  const [loading, setLoading] = useState(false)
  const [noAuth, setNoAuth] = useState(false)
  const [error, setError] = useState<{ msg: string; retryIn?: number } | null>(null)
  const [manageOpen, setManageOpen] = useState(false)
  const [menuKey, setMenuKey] = useState<string | null>(null)

  const workspaceNames = useMemo(
    () => [...new Set(Object.values(workspaces).filter(Boolean))].sort(),
    [workspaces],
  )
  // owner/repo → local path, for "View Repo".
  const repoMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const r of localRepos) if (r.fullname) m[r.fullname] = r.path
    return m
  }, [localRepos])

  // The GitHub feed is fetched once (not per workspace) — the search API is
  // rate-limited, so workspace scoping happens client-side below.
  const load = useCallback(async (force = false) => {
    setLoading(true)
    setNoAuth(false)
    setError(null)
    try {
      const [pr, iss, local] = await Promise.all([
        (window.gitAPI as any).githubSearchIssues('is:open is:pr author:@me', force),
        (window.gitAPI as any).githubSearchIssues('is:open is:issue author:@me', force),
        (window.gitAPI as any).scanLocalRepos(force).catch(() => ({ repos: [] })),
      ])
      setLocalRepos(local.repos ?? [])
      const err = pr.error || iss.error
      if (err === 'not_authenticated') { setNoAuth(true); setPrItems([]); setIssueItems([]); return }
      if (err === 'rate_limited') { setError({ msg: 'rate_limited', retryIn: pr.retryIn ?? iss.retryIn }); return }
      if (err) { setError({ msg: err }); return }
      setPrItems(pr.items ?? [])
      setIssueItems(iss.items ?? [])
      setPrTotal(pr.total ?? (pr.items?.length ?? 0))
      setIssueTotal(iss.total ?? (iss.items?.length ?? 0))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const allowedRepos = useMemo(() => {
    if (!wsFilter) return null
    const s = new Set<string>()
    for (const r of localRepos) if (r.fullname && (workspaces[r.path] ?? '') === wsFilter) s.add(r.fullname)
    return s
  }, [wsFilter, localRepos, workspaces])

  const wips = useMemo(() => {
    let w = localRepos.filter(r => r.changed > 0)
    if (wsFilter) w = w.filter(r => (workspaces[r.path] ?? '') === wsFilter)
    return w.sort((a, b) => b.changed - a.changed)
  }, [localRepos, wsFilter, workspaces])

  const allLabels = useMemo(() => {
    const s = new Set<string>()
    for (const r of [...prItems, ...issueItems]) for (const l of r.labels ?? []) s.add(l.name)
    return [...s].sort()
  }, [prItems, issueItems])

  const prShown = useMemo(() => allowedRepos ? prItems.filter(r => allowedRepos.has(r.repo)) : prItems, [prItems, allowedRepos])
  const issShown = useMemo(() => allowedRepos ? issueItems.filter(r => allowedRepos.has(r.repo)) : issueItems, [issueItems, allowedRepos])
  const prCount = allowedRepos ? prShown.length : prTotal
  const issueCount = allowedRepos ? issShown.length : issueTotal

  // Unified entries for the active tab (ALL mixes WIPs + items).
  const entries = useMemo(() => {
    let items = tab === 'prs' ? prShown : tab === 'issues' ? issShown : tab === 'all' ? [...prShown, ...issShown] : []
    if (labelFilter) items = items.filter(r => r.labels?.some(l => l.name === labelFilter))
    items = [...items].sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime())
    const wipList = tab === 'wips' || tab === 'all' ? wips : []
    let e: Entry[] = [
      ...wipList.map(w => ({ kind: 'wip', wip: w } as Entry)),
      ...items.map(r => ({ kind: 'item', row: r } as Entry)),
    ]
    const q = search.trim().toLowerCase()
    if (q) e = e.filter(en => en.kind === 'wip'
      ? en.wip.name.toLowerCase().includes(q)
      : (en.row.title.toLowerCase().includes(q) || en.row.repo.toLowerCase().includes(q)))
    return e
  }, [tab, prShown, issShown, wips, labelFilter, search])

  const openExt = (url?: string) => { if (url) window.gitAPI.openExternal(url) }
  const copy = (url: string) => { navigator.clipboard.writeText(url); setMenuKey(null) }
  const viewRepo = (fullname: string, repoUrl?: string) => {
    const p = repoMap[fullname]
    if (p) onOpenRepo(p); else openExt(repoUrl)
  }

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: 'prs',    label: t('launchpad.tab.prs'),    count: prCount },
    { id: 'issues', label: t('launchpad.tab.issues'), count: issueCount },
    { id: 'wips',   label: t('launchpad.tab.wips'),   count: wips.length },
    { id: 'all',    label: t('launchpad.tab.all'),    count: prCount + issueCount + wips.length },
  ]

  const showError = error && tab !== 'wips'
  const showNoAuth = noAuth && tab !== 'wips'
  const showLoading = loading && tab !== 'wips'

  return (
    <div className="lp-page">
      <div className="lp-header">
        <span className="lp-rocket">🚀</span>
        <h1 className="lp-title">{t('launchpad.title')}</h1>
        <div style={{ flex: 1 }} />
        <button className={`lp-manage ${manageOpen ? 'active' : ''}`} onClick={() => setManageOpen(o => !o)} title={t('launchpad.manage')}>⚙</button>
        <button className="lp-refresh" onClick={() => load(true)} title={t('launchpad.refresh')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ animation: loading ? 'lp-spin 0.8s linear infinite' : 'none' }}>
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
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

      <div className="lp-filters">
        <div className="lp-search">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M11.7 10.3a6 6 0 1 0-1.4 1.4l3 3a1 1 0 0 0 1.4-1.4l-3-3zM3 7a4 4 0 1 1 8 0 4 4 0 0 1-8 0z"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('launchpad.search')} />
        </div>
        <select className="lp-select" value={wsFilter} onChange={e => setWsFilter(e.target.value)} title={t('launchpad.workspaceFilter')}>
          <option value="">{t('launchpad.allRepos')}</option>
          {workspaceNames.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        {tab !== 'wips' && (
          <select className="lp-select" value={labelFilter} onChange={e => setLabelFilter(e.target.value)} title={t('launchpad.labelFilter')}>
            <option value="">{t('launchpad.allLabels')}</option>
            {allLabels.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
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
                <input className="lp-manage-input" defaultValue={workspaces[p] ?? ''} placeholder={t('launchpad.workspacePlaceholder')}
                  onBlur={e => { const v = e.target.value.trim(); if (v !== (workspaces[p] ?? '')) onSetWorkspace(p, v) }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="lp-body">
        {showError ? (
          <div className="lp-empty">
            <div className="lp-empty-title">{error!.msg === 'rate_limited' ? t('launchpad.rateTitle') : t('launchpad.errorTitle')}</div>
            <div className="lp-empty-hint">{error!.msg === 'rate_limited' ? t('launchpad.rateHint', error!.retryIn ?? 60) : t('launchpad.errorHint', error!.msg)}</div>
            <button className="lp-retry" onClick={() => load(true)}>{t('launchpad.retry')}</button>
          </div>
        ) : showNoAuth ? (
          <div className="lp-empty">
            <div className="lp-empty-title">{t('launchpad.noAuthTitle')}</div>
            <div className="lp-empty-hint">{t('launchpad.noAuth')}</div>
          </div>
        ) : showLoading ? (
          <div className="lp-state">{t('launchpad.loading')}</div>
        ) : entries.length === 0 ? (
          <div className="lp-empty">
            <div className="lp-empty-title">
              {tab === 'prs' ? t('launchpad.empty.prs') : tab === 'issues' ? t('launchpad.empty.issues') : tab === 'wips' ? t('launchpad.empty.wips') : t('launchpad.empty.all')}
            </div>
            <div className="lp-empty-hint">
              {tab === 'wips' ? t('launchpad.emptyWipsHint') : (wsFilter || labelFilter || search) ? t('launchpad.emptyFiltered') : t('launchpad.emptyHint')}
            </div>
          </div>
        ) : (
          <table className="lp-table">
            <thead><tr>
              <th className="lp-col-status">{t('launchpad.col.status')}</th>
              <th className="lp-col-item">{t('launchpad.col.item')}</th>
              <th className="lp-col-author">{t('launchpad.col.author')}</th>
              <th className="lp-col-repo">{t('launchpad.col.repoBranch')}</th>
              <th className="lp-col-action">{t('launchpad.col.action')}</th>
            </tr></thead>
            <tbody>
              {entries.map(en => en.kind === 'wip' ? (
                <tr key={`wip-${en.wip.path}`} className="lp-row" onClick={() => onOpenRepo(en.wip.path)} title={t('launchpad.openRepo')}>
                  <td className="lp-col-status" />
                  <td className="lp-col-item">
                    <div className="lp-item-top">
                      <span className="lp-kind lp-kind--wip">WIP</span>
                      <span className="lp-item-title">{t('launchpad.wipOn', en.wip.name)}</span>
                    </div>
                    <div className="lp-item-meta">
                      {en.wip.changed > 0 && <span className="lp-stat lp-stat--files">✎ {en.wip.changed}</span>}
                      {en.wip.added > 0 && <span className="lp-stat lp-stat--add">+{en.wip.added}</span>}
                      {en.wip.deleted > 0 && <span className="lp-stat lp-stat--del">−{en.wip.deleted}</span>}
                    </div>
                  </td>
                  <td className="lp-col-author" />
                  <td className="lp-col-repo">
                    <div className="lp-repo-name">{en.wip.name}</div>
                    {en.wip.branch && <div className="lp-branch">⑂ {en.wip.branch}</div>}
                  </td>
                  <td className="lp-col-action" onClick={e => e.stopPropagation()}>
                    <button className="lp-split-main lp-split-solo" onClick={() => onOpenRepo(en.wip.path)}>{t('launchpad.viewRepo')}</button>
                  </td>
                </tr>
              ) : (() => {
                const r = en.row
                const key = `${r.type}-${r.repo}-${r.number}`
                const isLocal = !!repoMap[r.repo]
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
                            <span key={l.name} className="lp-label" style={{ background: `#${l.color}22`, borderColor: `#${l.color}66`, color: `#${l.color}` }}>{l.name}</span>
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
                      <button className="lp-repo-link" onClick={e => { e.stopPropagation(); viewRepo(r.repo, r.repoUrl) }} title={t('launchpad.openRepo')}>{r.repo}</button>
                    </td>
                    <td className="lp-col-action" onClick={e => e.stopPropagation()}>
                      <div className="lp-split">
                        <button className="lp-split-main" onClick={() => viewRepo(r.repo, r.repoUrl)} title={isLocal ? t('launchpad.openRepo') : t('launchpad.openRepoGh')}>{t('launchpad.viewRepo')}</button>
                        <button className="lp-split-caret" onClick={() => setMenuKey(menuKey === key ? null : key)}>▾</button>
                        {menuKey === key && (
                          <div className="lp-menu">
                            <button onClick={() => { openExt(r.url); setMenuKey(null) }}>{t('launchpad.openIn')}</button>
                            <button onClick={() => { openExt(r.repoUrl); setMenuKey(null) }}>{t('launchpad.openRepoGh')}</button>
                            <button onClick={() => copy(r.url)}>{t('launchpad.copyLink')}</button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })())}
            </tbody>
          </table>
        )}
      </div>

      {menuKey && <div className="lp-menu-backdrop" onClick={() => setMenuKey(null)} />}
    </div>
  )
}
