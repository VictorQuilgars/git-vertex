// CompactToolbar.tsx — GitLens-style single-row icon toolbar for the panel.
// Brand + branch selector + fetch on the left; compact icon actions on the right.
import React, { useState, useRef, useEffect } from 'react'
import type { BranchInfo } from '../../../src/renderer/src/types'

interface Props {
  repoName: string
  branch: string
  branches: BranchInfo[]
  loading: boolean
  stashCount: number
  showAllBranches: boolean
  searchQuery: string
  lastFetch: Date | null
  onCheckout: (ref: string) => void
  onSearch: (q: string) => void
  onToggleAllBranches: () => void
  onFetch: () => void
  onPull: () => void
  onPush: () => void
  onNewBranch: () => void
  onStash: () => void
  onPop: () => void
  onUndo: () => void
  onTerminal: () => void
  onOpenDesktop: () => void
  onRefresh: () => void
}

function IconBtn({ title, onClick, disabled, active, badge, children }: {
  title: string; onClick: () => void; disabled?: boolean; active?: boolean; badge?: number
  children: React.ReactNode
}) {
  return (
    <button className={`gvt-btn${active ? ' gvt-btn--active' : ''}`} title={title} onClick={onClick} disabled={disabled}>
      {children}
      {badge != null && badge > 0 && <span className="gvt-badge">{badge}</span>}
    </button>
  )
}

function relTime(d: Date | null): string {
  if (!d) return ''
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return "à l'instant"
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`
  return `il y a ${Math.floor(s / 86400)} j`
}

export default function CompactToolbar(p: Props) {
  const [branchOpen, setBranchOpen] = useState(false)
  const branchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!branchOpen) return
    const onDown = (e: MouseEvent) => {
      if (branchRef.current && !branchRef.current.contains(e.target as Node)) setBranchOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [branchOpen])

  const locals = p.branches.filter(b => !b.remote && !b.name.includes('HEAD'))

  return (
    <div className="gvt">
      {/* Brand */}
      <svg className="gvt-logo" viewBox="0 0 512 512" width="16" height="16" aria-hidden>
        <line x1="148" y1="82" x2="256" y2="422" stroke="#3fb950" strokeWidth="40" strokeLinecap="round" />
        <line x1="364" y1="82" x2="256" y2="422" stroke="#58a6ff" strokeWidth="40" strokeLinecap="round" />
        <circle cx="256" cy="422" r="34" fill="#3fb950" />
      </svg>
      <span className="gvt-brand">Git Vertex</span>
      {p.repoName && <span className="gvt-repo">{p.repoName}</span>}

      {/* Branch selector */}
      <div className="gvt-branch-wrap" ref={branchRef}>
        <button className="gvt-branch" title="Changer de branche" onClick={() => setBranchOpen(o => !o)}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z"/></svg>
          <span className="gvt-branch-name">{p.branch || '—'}</span>
          <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor"><path d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06z"/></svg>
        </button>
        {branchOpen && (
          <div className="gvt-branch-menu">
            {locals.length === 0 && <div className="gvt-branch-empty">Aucune branche locale</div>}
            {locals.map(b => (
              <button key={b.name} className={`gvt-branch-item${b.current ? ' gvt-branch-item--current' : ''}`}
                onClick={() => { setBranchOpen(false); if (!b.current) p.onCheckout(b.name) }}>
                <span className="gvt-branch-tick">{b.current ? '✓' : ''}</span>
                <span className="gvt-branch-label">{b.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <span className="gvt-spring" />

      {/* Sync actions — Fetch / Pull / Push share the same icon-button style */}
      <IconBtn title={p.lastFetch ? `Fetch · ${relTime(p.lastFetch)}` : 'Fetch'} onClick={p.onFetch} disabled={p.loading}>
        <svg className={p.loading ? 'gvt-spin' : ''} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
      </IconBtn>
      <IconBtn title="Pull" onClick={p.onPull} disabled={p.loading}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="3" x2="12" y2="15"/><polyline points="7 10 12 15 17 10"/><polyline points="3 21 21 21"/></svg>
      </IconBtn>
      <IconBtn title="Push" onClick={p.onPush} disabled={p.loading}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="21" x2="12" y2="9"/><polyline points="7 14 12 9 17 14"/><polyline points="3 3 21 3"/></svg>
      </IconBtn>

      <span className="gvt-sep" />

      {/* Repo actions */}
      <IconBtn title="Nouvelle branche" onClick={p.onNewBranch}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5z"/></svg>
      </IconBtn>
      <IconBtn title="Stash" onClick={p.onStash}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
      </IconBtn>
      <IconBtn title="Pop stash" onClick={p.onPop} disabled={p.stashCount === 0} badge={p.stashCount}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 4v8"/><polyline points="8 8 12 4 16 8"/><path d="M22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6"/></svg>
      </IconBtn>
      <IconBtn title="Annuler la dernière action" onClick={p.onUndo}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
      </IconBtn>
      <IconBtn title="Terminal" onClick={p.onTerminal}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
      </IconBtn>

      <span className="gvt-sep" />

      <IconBtn title="Afficher toutes les branches" onClick={p.onToggleAllBranches} active={p.showAllBranches}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218zM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM5 3.25a.75.75 0 1 0 0 .005V3.25z"/></svg>
      </IconBtn>
      <IconBtn title="Ouvrir dans Git Vertex Desktop" onClick={p.onOpenDesktop}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </IconBtn>

      {/* Search */}
      <div className="gvt-search">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" placeholder="Rechercher…" value={p.searchQuery} onChange={e => p.onSearch(e.target.value)} />
        {p.searchQuery && <button className="gvt-search-clear" onClick={() => p.onSearch('')}>×</button>}
      </div>
    </div>
  )
}
