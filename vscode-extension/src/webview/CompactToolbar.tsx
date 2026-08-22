// CompactToolbar.tsx — single-row icon toolbar for the panel.
// Logo + repo name + branch selector on the left; compact icon actions on the right.
import React, { useState, useRef, useEffect } from 'react'
import { Icon } from '../../../src/renderer/src/components/Icon/Icon'
import { useLang } from '../../../src/renderer/src/i18n/LanguageContext'
import type { IssueRef } from '../../../src/renderer/src/utils/issueRef'
import ContextMenu from '../../../src/renderer/src/components/ContextMenu/ContextMenu'
import { buildBranchMenu } from '../../../src/renderer/src/components/ContextMenu/branchMenu'
import type { PRIntent } from '../../../src/renderer/src/components/ContextMenu/prIntent'
import { Mark } from '../../../src/renderer/src/components/Mark/Mark'
import type { BranchInfo } from '../../../src/renderer/src/types'

interface Props {
  repoName: string
  branch: string
  branches: BranchInfo[]
  loading: boolean
  stashCount: number
  searchQuery: string
  searchMatches?: number
  lastFetch: Date | null
  ahead?: number
  behind?: number
  onCheckout: (ref: string) => void
  onSearch: (q: string) => void
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
  // ── Unified branch menu (v1.21.0) ──
  // The "⋮" next to the branch selector gathers what used to be split between
  // this toolbar (Fetch/Pull/Push) and the sidebar's right-click menu.
  onMergeBranch?: (name: string) => void
  onRebaseOnto?: (name: string) => void
  onCompareBranch?: (name: string) => void
  onSetUpstream?: (name: string) => void
  onRenameBranch?: (name: string) => void
  onDeleteBranch?: (name: string) => void
  onOpenBranchOnRemote?: (name: string) => void
  onAssociateIssue?: (name: string) => void
  onToggleFavorite?: (name: string) => void
  onToggleSolo?: (name: string) => void
  onToggleHide?: (name: string) => void
  isFavorite?: (name: string) => boolean
  // The shared IssueRef, not a `{ number }` of its own: a reference has not
  // had to be a GitHub number since branches could carry `PROJ-421`, and this
  // declaration had not followed (#105).
  issueFor?: (name: string) => IssueRef | null
  soloBranch?: string | null
  hiddenBranches?: Set<string>
  /** The pull request the checked-out branch offers, if any — see prIntentFor. */
  pr?: PRIntent | null
  onCreatePR?: (intent: PRIntent) => void
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

/** The translator as the context actually types it — a keyed lookup, not `(k: string)`. */
type Translate = ReturnType<typeof useLang>['t']

function relTime(d: Date | null, lang: string, t: Translate): string {
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
  const [branchMenu, setBranchMenu] = useState<{ x: number; y: number } | null>(null)
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

  // Menu for the checked-out branch — the one the toolbar is showing.
  const branchMenuItems = buildBranchMenu(
    { name: p.branch, display: p.branch, current: true, remote: false, pr: p.pr ?? undefined },
    {
      currentBranch: p.branch,
      soloed: p.soloBranch === p.branch,
      hidden: p.hiddenBranches?.has(p.branch),
      favorite: p.isFavorite?.(p.branch),
      issue: p.issueFor?.(p.branch),
    },
    {
      onPull: p.onPull,
      onPush: p.onPush,
      onSetUpstream: p.onSetUpstream && (() => p.onSetUpstream!(p.branch)),
      onOpenOnRemote: p.onOpenBranchOnRemote && (() => p.onOpenBranchOnRemote!(p.branch)),
      onAssociateIssue: p.onAssociateIssue && (() => p.onAssociateIssue!(p.branch)),
      onToggleFavorite: p.onToggleFavorite && (() => p.onToggleFavorite!(p.branch)),
      onToggleSolo: p.onToggleSolo && (() => p.onToggleSolo!(p.branch)),
      onToggleHide: p.onToggleHide && (() => p.onToggleHide!(p.branch)),
      onCopyName: () => navigator.clipboard.writeText(p.branch),
      onRename: p.onRenameBranch && (() => p.onRenameBranch!(p.branch)),
      onCreatePR: p.pr && p.onCreatePR ? () => p.onCreatePR!(p.pr!) : undefined,
    },
    t
  )

  return (
    <div className="gvt">
      {/* Logo only — the VS Code panel title already reads "Git Vertex",
          so the brand name here would be redundant.

          16px, so Mark picks its `bare` cut on its own: the dotted iris rings
          go sub-pixel below ~72px and the node would turn to grey mush. This
          used to be the mark drawn by hand here, in two straight lines and the
          pre-aqua greens — it kept them right through the palette migration
          because a copy is not a reference. */}
      <Mark className="gvt-logo" size={16} />
      {p.onToggleSidebar && (
        <IconBtn title={t('gvt.toggleSidebar')} onClick={p.onToggleSidebar} active={p.sidebarOpen}>
          <Icon name="panel" size={14} />
        </IconBtn>
      )}
      {p.repoName && <span className="gvt-repo">{p.repoName}</span>}

      {/* Branch selector */}
      <div className="gvt-branch-wrap" ref={branchRef}>
        <button className="gvt-branch" title={t('gvt.switchBranch')} onClick={() => setBranchOpen(o => !o)}>
          <Icon name="branch" size={11} />
          <span className="gvt-branch-name">{p.branch || '—'}</span>
          <Icon name="chevronDown" size={8} />
        </button>
        {branchOpen && (
          <div className="gvt-branch-menu">
            {locals.length === 0 && <div className="gvt-branch-empty">{t('sb.noLocalBranch')}</div>}
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
      {branchMenuItems.length > 0 && (
        <button className="gvt-branch-menu-btn" title={t('sb.branch.menu')}
          onClick={e => {
            const r = e.currentTarget.getBoundingClientRect()
            setBranchMenu({ x: r.left, y: r.bottom + 3 })
          }}>
          <Icon name="kebab" size={12} />
        </button>
      )}
      {branchMenu && (
        <ContextMenu x={branchMenu.x} y={branchMenu.y} items={branchMenuItems}
          onClose={() => setBranchMenu(null)} />
      )}

      <span className="gvt-spring" />

      {/* Sync actions — labelled, all identical style */}
      <TextBtn title={p.lastFetch ? `Fetch · ${relTime(p.lastFetch, lang, t)}` : 'Fetch'} label="Fetch" onClick={p.onFetch} disabled={p.loading}>
        <Icon name="refresh" size={13} />
      </TextBtn>
      <TextBtn
        title={p.behind ? t('gvt.pull', p.behind) : 'Pull'}
        label="Pull" onClick={p.onPull} disabled={p.loading} count={p.behind}>
        <Icon name="download" size={13} />
      </TextBtn>
      <TextBtn
        title={p.ahead ? t('gvt.push', p.ahead) : 'Push'}
        label="Push" onClick={p.onPush} disabled={p.loading} count={p.ahead}>
        <Icon name="push" size={13} />
      </TextBtn>

      <span className="gvt-sep" />

      {/* Repo actions */}
      <IconBtn title={t('sb.newBranch')} onClick={p.onNewBranch}>
        <Icon name="newBranch" size={14} />
      </IconBtn>
      <IconBtn title="Stash" onClick={p.onStash}>
        <Icon name="stash" size={14} />
      </IconBtn>
      <IconBtn title="Pop stash" onClick={p.onPop} disabled={p.stashCount === 0} badge={p.stashCount}>
        <Icon name="pop" size={14} />
      </IconBtn>
      <IconBtn title={t('gvt.undo')} onClick={p.onUndo}>
        <Icon name="undo" size={14} />
      </IconBtn>
      <IconBtn title={t('toolbar.redo.tooltip')} onClick={p.onRedo}>
        <Icon name="redo" size={14} />
      </IconBtn>
      <IconBtn title="Terminal" onClick={p.onTerminal} hideNarrow>
        <Icon name="terminal" size={14} />
      </IconBtn>

      <span className="gvt-sep" />

      <IconBtn title={t('gvt.openDesktop')} onClick={p.onOpenDesktop} hideNarrow>
        <Icon name="externalLink" size={14} />
      </IconBtn>
      {p.onSettings && (
        <IconBtn title={t('gvt.settings')} onClick={p.onSettings}>
          <Icon name="gear" size={14} />
        </IconBtn>
      )}

      {/* Search */}
      <div className="gvt-search">
        <Icon name="search" size={11} />
        <input type="text" placeholder={t('gvt.search')} value={p.searchQuery} onChange={e => p.onSearch(e.target.value)} />
        {p.searchQuery && p.searchMatches != null && p.searchMatches >= 0 && (
          <span className={`gvt-search-count${p.searchMatches === 0 ? ' gvt-search-count--none' : ''}`}>
            {p.searchMatches}
          </span>
        )}
        {p.searchQuery && <button className="gvt-search-clear" title={t('common.clearSearch')} onClick={() => p.onSearch('')}>×</button>}
      </div>
    </div>
  )
}
