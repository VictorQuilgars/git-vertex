import React, { useState, useEffect, useCallback, useMemo } from 'react'
import './RepoManager.css'
import { useLang } from '../../i18n/LanguageContext'

// Repository Management (another tool-style): a full-page hub to browse, open,
// clone, init and group your repos. Opened by the 📁 button in the tab bar.

interface LocalRepo { path: string; name: string; changed: number; added: number; deleted: number; branch: string; fullname: string | null }

interface Props {
  recentRepos: string[]
  openRepoPaths: string[]
  workspaces: Record<string, string>
  onSetWorkspace: (path: string, name: string) => Promise<void> | void
  onOpenRepo: (path: string) => void
  onRemoveRecent: (path: string) => void
  onClone: () => void
  onBrowse: () => void
  onInit: () => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
}

// ── Tiny markdown renderer for READMEs ──
function mdInline(text: string, k0 = 0): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g
  let last = 0, m: RegExpExecArray | null, k = k0
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) nodes.push(<strong key={k++}>{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('`')) nodes.push(<code key={k++}>{tok.slice(1, -1)}</code>)
    else if (tok.startsWith('[')) {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)!
      nodes.push(<a key={k++} onClick={() => window.gitAPI.openExternal(mm[2])}>{mm[1]}</a>)
    } else nodes.push(<em key={k++}>{tok.slice(1, -1)}</em>)
    last = m.index + tok.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}
function Markdown({ md }: { md: string }) {
  const out: React.ReactNode[] = []
  const lines = md.split('\n')
  let list: React.ReactNode[] | null = null, code: string[] | null = null, k = 0
  const flushList = () => { if (list) { out.push(<ul key={k++}>{list}</ul>); list = null } }
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (line.startsWith('```')) {
      if (code) { out.push(<pre key={k++}><code>{code.join('\n')}</code></pre>); code = null }
      else { flushList(); code = [] }
      continue
    }
    if (code) { code.push(raw); continue }
    if (/^#{1,3}\s/.test(line)) {
      flushList()
      const level = line.match(/^#+/)![0].length
      const txt = line.replace(/^#+\s/, '')
      out.push(level === 1 ? <h1 key={k++}>{mdInline(txt)}</h1> : level === 2 ? <h2 key={k++}>{mdInline(txt)}</h2> : <h3 key={k++}>{mdInline(txt)}</h3>)
    } else if (/^[-*]\s/.test(line)) {
      ;(list ||= []).push(<li key={k++}>{mdInline(line.replace(/^[-*]\s/, ''))}</li>)
    } else if (line.trim() === '') {
      flushList()
    } else {
      flushList()
      out.push(<p key={k++}>{mdInline(line)}</p>)
    }
  }
  flushList()
  if (code) out.push(<pre key={k++}><code>{code.join('\n')}</code></pre>)
  return <div className="rm-md">{out}</div>
}

export default function RepoManager({
  recentRepos, openRepoPaths, workspaces, onSetWorkspace, onOpenRepo, onRemoveRecent, onClone, onBrowse, onInit, showToast,
}: Props) {
  const { t } = useLang()
  const [repos, setRepos] = useState<LocalRepo[]>([])
  const [search, setSearch] = useState('')
  const [wipSummary, setWipSummary] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [favorites, setFavorites] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem('rm-favorites') || '[]')) } catch { return new Set() } })
  const [details, setDetails] = useState<{ path: string; name: string; fullname: string | null; content: string | null; loading: boolean } | null>(null)
  const [wsModal, setWsModal] = useState(false)

  useEffect(() => {
    ;(window.gitAPI as any).scanLocalRepos().then((r: any) => setRepos(r.repos ?? [])).catch(() => {})
  }, [])
  const byPath = useMemo(() => { const m: Record<string, LocalRepo> = {}; for (const r of repos) m[r.path] = r; return m }, [repos])

  const toggleFav = (p: string) => setFavorites(prev => {
    const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p)
    localStorage.setItem('rm-favorites', JSON.stringify([...n])); return n
  })

  const info = useCallback((p: string): LocalRepo => byPath[p] ?? { path: p, name: p.split('/').pop() ?? p, changed: 0, added: 0, deleted: 0, branch: '', fullname: null }, [byPath])
  const match = useCallback((p: string) => !search.trim() || info(p).name.toLowerCase().includes(search.trim().toLowerCase()), [search, info])

  const openList = openRepoPaths.filter(match)
  const favList = [...favorites].filter(p => recentRepos.includes(p) || openRepoPaths.includes(p)).filter(match)
  const recentList = recentRepos.filter(match)

  const openDetails = async (p: string) => {
    const i = info(p)
    setDetails({ path: p, name: i.name, fullname: i.fullname, content: null, loading: true })
    const r = await (window.gitAPI as any).readReadme(p).catch(() => ({ content: null }))
    setDetails(d => d && d.path === p ? { ...d, content: r.content ?? null, loading: false } : d)
  }

  const RepoRow = ({ p }: { p: string }) => {
    const i = info(p)
    const isFav = favorites.has(p)
    return (
      <div className="rm-row" onDoubleClick={() => onOpenRepo(p)}>
        <button className={`rm-fav ${isFav ? 'on' : ''}`} title={isFav ? t('repomgmt.unfavorite') : t('repomgmt.favorite')} onClick={() => toggleFav(p)}>★</button>
        <button className="rm-name" onClick={() => onOpenRepo(p)} title={p}>{i.name}</button>
        <span className="rm-owner">{i.fullname ? i.fullname.split('/')[0] : ''}</span>
        <span className="rm-branch-cell">
          {i.branch && <span className="rm-branch">⑂ {i.branch}</span>}
          {wipSummary && (i.changed > 0) && (
            <span className="rm-wip">
              {i.changed > 0 && <span className="rm-stat-files">✎ {i.changed}</span>}
              {i.added > 0 && <span className="rm-stat-add">+{i.added}</span>}
              {i.deleted > 0 && <span className="rm-stat-del">−{i.deleted}</span>}
            </span>
          )}
        </span>
        <span className="rm-actions">
          <button title={t('repomgmt.openInEditor')} onClick={async () => { const r = await (window.gitAPI as any).openPathInEditor(p); if (r?.error) showToast(t('toast.err', r.error), 'err') }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </button>
          <button title={t('repomgmt.details')} onClick={() => openDetails(p)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          </button>
          <button title={t('repomgmt.remove')} onClick={() => onRemoveRecent(p)}>✕</button>
        </span>
      </div>
    )
  }

  const Section = ({ id, label, paths }: { id: string; label: string; paths: string[] }) => (
    <div className="rm-section">
      <button className="rm-section-head" onClick={() => setCollapsed(c => ({ ...c, [id]: !c[id] }))}>
        <span className={`rm-caret ${collapsed[id] ? 'closed' : ''}`}>▾</span>
        <span className="rm-section-title">{label}</span>
        <span className="rm-section-count">{paths.length}</span>
      </button>
      {!collapsed[id] && (paths.length === 0
        ? <div className="rm-section-empty">{t('repomgmt.sectionEmpty')}</div>
        : paths.map(p => <RepoRow key={p} p={p} />))}
    </div>
  )

  return (
    <div className="rm-page">
      <div className="rm-header">
        <h1 className="rm-title">{t('repomgmt.title')}</h1>
        <div className="rm-toolbar">
          <button className="rm-btn" onClick={onBrowse}>📂 {t('repomgmt.browse')}</button>
          <button className="rm-btn" onClick={onClone}>⬇ {t('repomgmt.clone')}</button>
          <button className="rm-btn" onClick={onInit}>＋ {t('repomgmt.init')}</button>
          <button className="rm-btn" onClick={() => setWsModal(true)}>▦ {t('repomgmt.newWorkspace')}</button>
        </div>
      </div>

      <div className="rm-filters">
        <div className="rm-search">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M11.7 10.3a6 6 0 1 0-1.4 1.4l3 3a1 1 0 0 0 1.4-1.4l-3-3zM3 7a4 4 0 1 1 8 0 4 4 0 0 1-8 0z"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('repomgmt.search')} />
        </div>
        <label className="rm-wip-toggle">
          <input type="checkbox" checked={wipSummary} onChange={e => setWipSummary(e.target.checked)} />
          {t('repomgmt.wipSummary')}
        </label>
      </div>

      <div className="rm-body">
        <Section id="open" label={t('repomgmt.open')} paths={openList} />
        <Section id="fav" label={t('repomgmt.favorites')} paths={favList} />
        <Section id="recent" label={t('repomgmt.recent')} paths={recentList} />
      </div>

      {/* Repo details (README) slide-in */}
      {details && (
        <div className="rm-details">
          <div className="rm-details-head">
            <div className="rm-details-title">{details.fullname ?? details.name}</div>
            <div className="rm-details-actions">
              <button className="rm-btn" onClick={() => onOpenRepo(details.path)}>{t('repomgmt.openRepo')}</button>
              {details.fullname && <button className="rm-btn" onClick={() => window.gitAPI.openExternal(`https://github.com/${details.fullname}`)}>{t('repomgmt.openGithub')}</button>}
              <button className="rm-details-close" onClick={() => setDetails(null)}>✕</button>
            </div>
          </div>
          <div className="rm-details-body">
            {details.loading ? <div className="rm-details-empty">{t('repomgmt.loading')}</div>
              : details.content ? <Markdown md={details.content} />
              : <div className="rm-details-empty">{t('repomgmt.noReadme')}</div>}
          </div>
        </div>
      )}

      {wsModal && (
        <WorkspaceModal
          recentRepos={recentRepos}
          info={info}
          onClose={() => setWsModal(false)}
          onCreate={async (name, paths) => {
            for (const p of paths) await onSetWorkspace(p, name)
            setWsModal(false)
            showToast(t('repomgmt.wsCreated', name as any))
          }}
        />
      )}
    </div>
  )
}

function WorkspaceModal({ recentRepos, info, onClose, onCreate }: {
  recentRepos: string[]
  info: (p: string) => LocalRepo
  onClose: () => void
  onCreate: (name: string, paths: string[]) => void
}) {
  const { t } = useLang()
  const [name, setName] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const toggle = (p: string) => setSel(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n })
  return (
    <div className="rm-modal-backdrop" onClick={onClose}>
      <div className="rm-modal" onClick={e => e.stopPropagation()}>
        <div className="rm-modal-head">{t('repomgmt.newWorkspace')}<button className="rm-details-close" onClick={onClose}>✕</button></div>
        <input className="rm-modal-input" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder={t('repomgmt.wsName')} />
        <div className="rm-modal-desc">{t('repomgmt.wsPick')}</div>
        <div className="rm-modal-list">
          {recentRepos.map(p => (
            <label key={p} className="rm-modal-repo">
              <input type="checkbox" checked={sel.has(p)} onChange={() => toggle(p)} />
              <span>{info(p).name}</span>
            </label>
          ))}
        </div>
        <div className="rm-modal-foot">
          <button className="rm-btn" onClick={onClose}>{t('repomgmt.cancel')}</button>
          <button className="rm-btn rm-btn-primary" disabled={!name.trim() || sel.size === 0} onClick={() => onCreate(name.trim(), [...sel])}>{t('repomgmt.create')}</button>
        </div>
      </div>
    </div>
  )
}
