// CompactToolbar.tsx — GitLens-style single-row icon toolbar for the panel.
// Logo + repo name + branch selector on the left; compact icon actions on the right.
import React, { useState, useRef, useEffect } from 'react'
import { useLang } from '../../../src/renderer/src/i18n/LanguageContext'
import type { BranchInfo } from '../../../src/renderer/src/types'

interface Props {
  repoName: string
  branch: string
  branches: BranchInfo[]
  loading: boolean
  stashCount: number
  showAllBranches: boolean
  searchQuery: string
  searchMatches?: number
  lastFetch: Date | null
  ahead?: number
  behind?: number
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
  onRedo: () => void
  onTerminal: () => void
  onOpenDesktop: () => void
  onRefresh: () => void
  onSettings?: () => void
  sidebarOpen?: boolean
  onToggleSidebar?: () => void
}

function IconBtn({ title, onClick, disabled, active, badge, hideNarrow, children }: {
  title: string; onClick: () => void; disabled?: boolean; active?: boolean; badge?: number
  hideNarrow?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      className={`gvt-btn${active ? ' gvt-btn--active' : ''}${hideNarrow ? ' gvt-hide-narrow' : ''}`}
      title={title} onClick={onClick} disabled={disabled}
    >
      {children}
      {badge != null && badge > 0 && <span className="gvt-badge">{badge}</span>}
    </button>
  )
}

// Labelled button (icon + text) — used for the primary sync actions so each is
// clearly identifiable while sharing one consistent style.
function TextBtn({ title, label, onClick, disabled, count, children }: {
  title: string; label: string; onClick: () => void; disabled?: boolean; count?: number; children: React.ReactNode
}) {
  return (
    <button className="gvt-tbtn" title={title} onClick={onClick} disabled={disabled}>
      {children}
      <span className="gvt-tbtn-label">{label}</span>
      {count != null && count > 0 && <span className="gvt-tbtn-count">{count}</span>}
    </button>
  )
}

function relTime(d: Date | null, lang: string, t: (k: string) => string): string {
  if (!d) return ''
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return t('github.justNow')
  if (s < 3600) return lang === 'fr' ? `il y a ${Math.floor(s / 60)} min` : `${Math.floor(s / 60)}m ago`
  if (s < 86400) return lang === 'fr' ? `il y a ${Math.floor(s / 3600)} h` : `${Math.floor(s / 3600)}h ago`
  return lang === 'fr' ? `il y a ${Math.floor(s / 86400)} j` : `${Math.floor(s / 86400)}d ago`
}

export default function CompactToolbar(p: Props) {
  const { t, lang } = useLang()
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
      {/* Logo only — the VS Code panel title already reads "Git Vertex",
          so the brand name here would be redundant. */}
      <svg className="gvt-logo" viewBox="0 0 512 512" width="16" height="16" aria-hidden>
        <line x1="148" y1="82" x2="256" y2="422" stroke="#3fb950" strokeWidth="40" strokeLinecap="round" />
        <line x1="364" y1="82" x2="256" y2="422" stroke="#58a6ff" strokeWidth="40" strokeLinecap="round" />
        <circle cx="256" cy="422" r="34" fill="#3fb950" />
      </svg>
      {p.onToggleSidebar && (
        <IconBtn title="Afficher/masquer le panneau latéral" onClick={p.onToggleSidebar} active={p.sidebarOpen}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0 1 14.25 16H1.75A1.75 1.75 0 0 1 0 14.25V1.75C0 .784.784 0 1.75 0zM1.5 1.75v12.5c0 .138.112.25.25.25H6V1.5H1.75a.25.25 0 0 0-.25.25zM7.5 1.5v13h6.75a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25H7.5z"/></svg>
        </IconBtn>
      )}
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

      {/* Sync actions — labelled, all identical style */}
      <TextBtn title={p.lastFetch ? `Fetch · ${relTime(p.lastFetch, lang, t)}` : 'Fetch'} label="Fetch" onClick={p.onFetch} disabled={p.loading}>
        <svg className={p.loading ? 'gvt-spin' : ''} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
      </TextBtn>
      <TextBtn
        title={p.behind ? lang === 'fr' ? `Pull — ${p.behind} commit(s) en retard` : `Pull — ${p.behind} commit(s) behind` : 'Pull'}
        label="Pull" onClick={p.onPull} disabled={p.loading} count={p.behind}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="3" x2="12" y2="15"/><polyline points="7 10 12 15 17 10"/><polyline points="3 21 21 21"/></svg>
      </TextBtn>
      <TextBtn
        title={p.ahead ? lang === 'fr' ? `Push — ${p.ahead} commit(s) en avance` : `Push — ${p.ahead} commit(s) ahead` : 'Push'}
        label="Push" onClick={p.onPush} disabled={p.loading} count={p.ahead}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="21" x2="12" y2="9"/><polyline points="7 14 12 9 17 14"/><polyline points="3 3 21 3"/></svg>
      </TextBtn>

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
      <IconBtn title="Rétablir la dernière action annulée" onClick={p.onRedo}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/></svg>
      </IconBtn>
      <IconBtn title="Terminal" onClick={p.onTerminal} hideNarrow>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
      </IconBtn>

      <span className="gvt-sep" />

      <IconBtn title="Afficher toutes les branches" onClick={p.onToggleAllBranches} active={p.showAllBranches}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218zM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM5 3.25a.75.75 0 1 0 0 .005V3.25z"/></svg>
      </IconBtn>
      <IconBtn title="Ouvrir dans Git Vertex Desktop" onClick={p.onOpenDesktop} hideNarrow>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </IconBtn>
      {p.onSettings && (
        <IconBtn title="Réglages (identité, GitHub, IA…)" onClick={p.onSettings}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8.2 8.2 0 0 1 .701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63.27.385.506.792.704 1.218.315.675.111 1.422-.364 1.891l-.814.806c-.049.048-.098.147-.088.294.016.257.016.515 0 .772-.01.147.038.246.088.294l.814.806c.475.469.679 1.216.364 1.891a7.977 7.977 0 0 1-.704 1.217c-.428.61-1.176.807-1.82.63l-1.102-.302c-.067-.019-.177-.011-.3.071a5.909 5.909 0 0 1-.668.386c-.133.066-.194.158-.211.224l-.29 1.106c-.168.646-.715 1.196-1.458 1.26a8.006 8.006 0 0 1-1.402 0c-.743-.064-1.289-.614-1.458-1.26l-.289-1.106c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 0 1-.668-.386c-.123-.082-.233-.09-.299-.071l-1.103.303c-.644.176-1.392-.021-1.82-.63a8.12 8.12 0 0 1-.704-1.218c-.315-.675-.111-1.422.363-1.891l.815-.806c.05-.048.098-.147.088-.294a6.214 6.214 0 0 1 0-.772c.01-.147-.038-.246-.088-.294l-.815-.806C.635 6.045.431 5.298.746 4.623a7.92 7.92 0 0 1 .704-1.217c.428-.61 1.176-.807 1.82-.63l1.102.302c.067.019.177.011.3-.071.214-.143.437-.272.668-.386.133-.066.194-.158.211-.224l.29-1.106C6.009.645 6.556.095 7.299.03 7.53.01 7.764 0 8 0Zm-.571 1.525c-.036.003-.108.036-.137.146l-.289 1.105c-.147.561-.549.967-.998 1.189-.173.086-.34.183-.5.29-.417.278-.97.423-1.529.27l-1.103-.303c-.109-.03-.175.016-.195.045-.22.312-.412.644-.573.99-.014.031-.021.11.059.19l.815.806c.411.406.562.957.53 1.456a4.709 4.709 0 0 0 0 .582c.032.499-.119 1.05-.53 1.456l-.815.806c-.081.08-.073.159-.059.19.162.346.353.677.573.989.02.03.085.076.195.046l1.102-.303c.56-.153 1.113-.008 1.53.27.161.107.328.204.501.29.447.222.85.629.997 1.189l.289 1.105c.029.109.101.143.137.146a6.6 6.6 0 0 0 1.142 0c.036-.003.108-.036.137-.146l.289-1.105c.147-.561.549-.967.998-1.189.173-.086.34-.183.5-.29.417-.278.97-.423 1.529-.27l1.103.303c.109.029.175-.016.195-.045.22-.313.411-.644.573-.99.014-.031.021-.11-.059-.19l-.815-.806c-.411-.406-.562-.957-.53-1.456a4.709 4.709 0 0 0 0-.582c-.032-.499.119-1.05.53-1.456l.815-.806c.081-.08.073-.159.059-.19a6.464 6.464 0 0 0-.573-.989c-.02-.03-.085-.076-.195-.046l-1.102.303c-.56.153-1.113.008-1.53-.27a4.44 4.44 0 0 0-.501-.29c-.447-.222-.85-.629-.997-1.189l-.289-1.105c-.029-.11-.101-.143-.137-.146a6.6 6.6 0 0 0-1.142 0ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9.5 8a1.5 1.5 0 1 0-3.001.001A1.5 1.5 0 0 0 9.5 8Z"/></svg>
        </IconBtn>
      )}

      {/* Search */}
      <div className="gvt-search">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" placeholder="Rechercher…" value={p.searchQuery} onChange={e => p.onSearch(e.target.value)} />
        {p.searchQuery && p.searchMatches != null && p.searchMatches >= 0 && (
          <span className={`gvt-search-count${p.searchMatches === 0 ? ' gvt-search-count--none' : ''}`}>
            {p.searchMatches}
          </span>
        )}
        {p.searchQuery && <button className="gvt-search-clear" onClick={() => p.onSearch('')}>×</button>}
      </div>
    </div>
  )
}
