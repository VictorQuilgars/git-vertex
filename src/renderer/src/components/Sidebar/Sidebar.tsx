import React, { useState, useRef, useEffect, useCallback } from 'react'
import { BranchInfo, StashScope } from '../../types'
import ContextMenu, { MenuItemDef } from '../ContextMenu/ContextMenu'
import { buildBranchMenu } from '../ContextMenu/branchMenu'
import type { PRIntent } from '../ContextMenu/prIntent'
import { useLang } from '../../i18n/LanguageContext'
import './Sidebar.css'

interface StashEntry { index: number; message: string }
interface TagEntry   { name: string; hash: string }

// Single-view mode (VS Code panel): the rail on the left selects which one of
// these views the resizable side-panel shows. When `view` is undefined the
// Sidebar renders its classic stacked layout (desktop app).
export type SidebarView =
  | 'overview' | 'agents' | 'worktrees' | 'branches' | 'remotes' | 'stash' | 'tags'

interface ReflogEntry { hash: string; ref: string; message: string; date: string }
interface RemoteEntry { name: string; fetchUrl: string; pushUrl: string }
interface SubmoduleEntry { path: string; url: string; status: 'ok' | 'dirty' | 'uninitialized' }
interface WorktreeEntry { path: string; branch: string; head: string; isMain: boolean; locked: boolean }
interface AgentEntry { pid: number; name: string; cwd: string }

interface SidebarProps {
  repoPath: string | null
  repoName: string
  currentBranch: string
  branches: BranchInfo[]
  recentRepos: string[]
  stashes: StashEntry[]
  tags: TagEntry[]
  onOpenRepo: () => void
  onClone: () => void
  onSetRepo: (path: string) => void
  onRemoveRecent: (path: string) => void
  onCheckout: (name: string) => void
  onCreateBranch: () => void
  onDeleteBranch: (name: string) => void
  onMergeBranch: (name: string) => void
  onRenameBranch: (name: string) => void
  onRebaseOnto: (name: string) => void
  onPushBranch: (name: string) => void
  onDeleteRemoteBranch: (name: string) => void
  onSetUpstream: (name: string) => void
  onCreateStash: (scope?: StashScope) => void
  onApplyStash: (index: number) => void
  onPopStash: (index: number) => void
  onDropStash: (index: number) => void
  onPreviewStash?: (index: number, message: string) => void
  onRefreshStashes: () => void
  onCreateTag: () => void
  onDeleteTag: (name: string) => void
  onCheckoutTag: (name: string) => void
  onPushTag: (name: string) => void
  onDeleteRemoteTag: (name: string) => void
  onSelectCommit: (hash: string) => void
  onCompareBranch: (branchName: string) => void
  soloBranch: string | null
  mutedBranches: Set<string>
  onToggleSolo: (name: string) => void
  onToggleMute: (name: string) => void
  // Sync actions for the checked-out branch. They live on the toolbar too, but
  // the unified menu (v1.21.0) is meant to be the one place that has everything.
  onFetch?: () => void
  onPull?: () => void
  // Branch metadata git has no concept of (v1.21.0) — supplied by
  // useBranchMeta in the host. Omitted ⇒ the matching menu rows disappear.
  isFavorite?: (name: string) => boolean
  isPinned?: (name: string) => boolean
  issueFor?: (name: string) => { number: number; title?: string } | null
  onToggleFavorite?: (name: string) => void
  onTogglePin?: (name: string) => void
  onOpenBranchOnRemote?: (name: string) => void
  onAssociateIssue?: (name: string) => void
  // The pull request a branch row should offer, or null for none — the rules
  // live in prIntentFor, the host just supplies the answer. Omitted when the
  // repo has no GitHub remote.
  prIntentFor?: (branchRef: string) => PRIntent | null
  onCreatePR?: (intent: PRIntent) => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
  showPrompt: (msg: string, defaultValue?: string) => Promise<string | null>
  showConfirm: (msg: string, danger?: boolean) => Promise<boolean>
  // Branch/commit state lives in the host, so actions that invalidate it
  // (prune) ask for a reload instead of trying to patch it locally.
  onRefresh?: () => void
  // Embedded host (VS Code panel): the repo is the workspace, so the
  // open/clone/recent repo picker doesn't apply and is hidden.
  embedded?: boolean
  // Single-view mode: render only the section the activity rail selected.
  // Undefined = classic stacked layout (desktop).
  view?: SidebarView
}

// ── Collapse section ─────────────────────────────────────────────
function Section({ title, count, children, defaultOpen = true, onAdd, addLabel }: {
  title: string
  count?: number
  children: React.ReactNode
  defaultOpen?: boolean
  // The event is handed over so a section can anchor a menu to the + button
  // (the stash one offers a scope) instead of acting straight away.
  onAdd?: (e: React.MouseEvent) => void
  addLabel?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const { t } = useLang()
  return (
    <div className="sb-section">
      <div className="sb-section-header" onClick={() => setOpen(o => !o)}>
        <svg className={`chevron ${open ? 'open' : ''}`} width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
          <path d="m4 1 8 7-8 7V1z"/>
        </svg>
        <span className="sb-section-title">{title}</span>
        {count !== undefined && <span className="sb-section-count">{count}</span>}
        {onAdd && (
          <button className="sb-add-btn" title={addLabel ?? t('sb.add')}
            onClick={e => { e.stopPropagation(); onAdd(e) }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z"/>
            </svg>
          </button>
        )}
      </div>
      {open && <div className="sb-section-body">{children}</div>}
    </div>
  )
}

// ── Branch item with context menu ────────────────────────────────
interface BranchItemProps {
  name: string
  current: boolean
  remote?: boolean
  currentBranch: string
  onCheckout: () => void
  onDelete?: () => void
  onMerge?: () => void
  onRename?: () => void
  onCompare?: () => void
  onRebaseOnto?: () => void
  onPush?: () => void
  onDeleteRemote?: () => void
  onSetUpstream?: () => void
  soloed?: boolean
  muted?: boolean
  pinned?: boolean
  favorite?: boolean
  issue?: { number: number; title?: string } | null
  onFetch?: () => void
  onPull?: () => void
  onToggleSolo?: () => void
  onToggleMute?: () => void
  onTogglePin?: () => void
  onToggleFavorite?: () => void
  onOpenOnRemote?: () => void
  onAssociateIssue?: () => void
  /** The pull request this row offers, if any — see prIntentFor. */
  pr?: PRIntent | null
  onCreatePR?: (intent: PRIntent) => void
  ahead?: number
  behind?: number
  gone?: boolean
  // Set when another remote also has a branch with this same short name —
  // disambiguates "main" vs "main" by showing "origin/main" / "archive/main"
  // instead of collapsing both to a bare "main".
  showRemotePrefix?: boolean
}

function BranchItem({ name, current, remote, currentBranch, onCheckout, onDelete, onMerge, onRename, onCompare, onRebaseOnto, onPush, onDeleteRemote, onSetUpstream, soloed, muted, pinned, favorite, issue, onFetch, onPull, onToggleSolo, onToggleMute, onTogglePin, onToggleFavorite, onOpenOnRemote, onAssociateIssue, pr, onCreatePR, ahead = 0, behind = 0, gone = false, showRemotePrefix = false }: BranchItemProps) {
  const [hover, setHover] = useState(false)
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const lastClickTime = useRef(0)
  const { t } = useLang()
  const display = remote
    ? (showRemotePrefix ? name.replace(/^remotes\//, '') : name.replace(/^remotes\/[^/]+\//, ''))
    : name

  // Same builder the toolbars use — right-click here and the ⋮ button up there
  // now offer the identical menu (v1.21.0).
  const menuItems: MenuItemDef[] = buildBranchMenu(
    { name, display, current, remote: !!remote, pr: pr ?? undefined },
    { currentBranch, soloed, muted, pinned, favorite, issue },
    {
      onCheckout: current ? undefined : onCheckout,
      onFetch, onPull,
      onPush, onSetUpstream,
      onCreatePR: pr && onCreatePR ? () => onCreatePR(pr) : undefined,
      onMerge, onRebaseOnto, onCompare,
      onOpenOnRemote, onAssociateIssue, onToggleFavorite, onTogglePin,
      onToggleSolo, onToggleMute,
      onCopyName: () => navigator.clipboard.writeText(display),
      onRename, onDelete, onDeleteRemote,
    },
    t
  )

  const handleMouseDown = (e: React.MouseEvent) => {
    if (current) return
    const now = Date.now()
    if (now - lastClickTime.current < 400) {
      // Double-click détecté : bloquer la sélection AVANT que le navigateur agisse
      e.preventDefault()
      onCheckout()
      lastClickTime.current = 0
    } else {
      lastClickTime.current = now
    }
  }

  return (
    <>
      <div
        className={`sb-branch-item ${current ? 'current' : ''} ${remote ? 'remote' : ''} ${muted ? 'muted' : ''} ${soloed ? 'soloed' : ''}`}
        onMouseDown={handleMouseDown}
        onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={current ? t('sb.branch.currentTitle', name) : t('sb.branch.hint')}
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="branch-icon">
          <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z"/>
        </svg>
        <span className="sb-branch-name">{display}</span>
        {(ahead > 0 || behind > 0) && (
          <span className="sb-track" title={t('sb.branch.trackTitle', ahead, behind)}>
            {ahead > 0 && <span className="sb-track-ahead">↑{ahead}</span>}
            {behind > 0 && <span className="sb-track-behind">↓{behind}</span>}
          </span>
        )}
        {gone && <span className="sb-track sb-track-gone" title={t('sb.branch.goneTitle')}>✂</span>}
        {favorite && <span className="sb-branch-flag sb-branch-star" title={t('sb.branch.favoriteFlag')}>★</span>}
        {pinned && <span className="sb-branch-flag" title={t('sb.branch.pinFlag')}>📌</span>}
        {issue && <span className="sb-branch-flag" title={issue.title || `#${issue.number}`}>#{issue.number}</span>}
        {soloed && <span className="sb-branch-flag" title={t('sb.branch.soloFlag')}>👁</span>}
        {muted && <span className="sb-branch-flag" title={t('sb.branch.mutedFlag')}>🔇</span>}
        {current && (
          <svg width="11" height="11" viewBox="0 0 16 16" fill="#3fb950" className="current-check">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/>
          </svg>
        )}
        {/* Hover affordance for the whole menu rather than the lone delete
            cross it replaces — right-click was the only way in before, which
            is what made every other branch action invisible (v1.21.0). */}
        {hover && menuItems.length > 0 && (
          <button className="sb-branch-menu-btn" title={t('sb.branch.menu')}
            onClick={e => {
              e.stopPropagation()
              const r = e.currentTarget.getBoundingClientRect()
              setCtx({ x: r.right, y: r.bottom + 2 })
            }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 4a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 8 4Zm0 5.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Zm1.25 4a1.25 1.25 0 1 0-2.5 0 1.25 1.25 0 0 0 2.5 0Z"/>
            </svg>
          </button>
        )}
      </div>
      {ctx && menuItems.length > 0 && (
        <ContextMenu x={ctx.x} y={ctx.y} items={menuItems} onClose={() => setCtx(null)} />
      )}
    </>
  )
}

// ── Stash item ────────────────────────────────────────────────────
function StashItem({ stash, onApply, onPop, onDrop, onPreview, onRename }: {
  stash: StashEntry
  onApply: () => void
  onPop: () => void
  onDrop: () => void
  onPreview?: () => void
  onRename?: () => void
}) {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const { t } = useLang()
  const label = stash.message.replace(/^stash@\{\d+\}: /, '')

  const menuItems: MenuItemDef[] = [
    ...(onPreview ? [{ label: t('sb.stash.preview'), action: onPreview }] : []),
    { label: t('sb.stash.applyKeep'), action: onApply },
    { label: t('sb.stash.applyPop'), action: onPop },
    ...(onRename ? [{ label: t('sb.stash.rename'), action: onRename }] : []),
    { separator: true },
    { label: t('sb.delete'), action: onDrop, danger: true },
  ]

  return (
    <>
      <div
        className="sb-stash-item"
        onClick={onPreview}
        onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }}
        title={onPreview ? t('sb.stash.title', stash.message) : stash.message}
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="stash-icon">
          <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h8.75a.75.75 0 0 1 0 1.5H2.5a.5.5 0 0 0 0 1H8a1 1 0 0 1 1 1v3.75a.75.75 0 0 1-1.5 0V6H2.5A1.5 1.5 0 0 1 1 4.5v-1Zm3 9A1.5 1.5 0 0 1 2.5 11h1.25a.75.75 0 0 0 0-1.5H2.5A1.5 1.5 0 0 1 1 8v-.5a.75.75 0 0 1 1.5 0V8a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5v-.5a.75.75 0 0 1 1.5 0V8a1.5 1.5 0 0 1-1.5 1.5H4.5v1H14a.75.75 0 0 1 0 1.5H4.5v.5a.75.75 0 0 1-1.5 0v-.5Z"/>
        </svg>
        <span className="sb-stash-label">{label}</span>
        <span className="sb-stash-index">#{stash.index}</span>
      </div>
      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} items={menuItems} onClose={() => setCtx(null)} />
      )}
    </>
  )
}

// ── Tag item ──────────────────────────────────────────────────────
function TagItem({ tag, onCheckout, onDelete, onPush, onDeleteRemote }: {
  tag: TagEntry; onCheckout?: () => void
  onDelete: () => void; onPush: () => void; onDeleteRemote: () => void
}) {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const lastClickTime = useRef(0)
  const { t } = useLang()
  const menuItems: MenuItemDef[] = [
    ...(onCheckout ? [{ label: t('sb.tag.checkout'), action: onCheckout }] : []),
    { label: t('sb.copyName'), action: () => navigator.clipboard.writeText(tag.name) },
    { label: t('sb.tag.push'), action: onPush },
    { separator: true },
    { label: t('sb.tag.deleteLocal'), action: onDelete, danger: true },
    { label: t('sb.tag.deleteRemote'), action: onDeleteRemote, danger: true },
  ]

  // Same 400ms double-click detection as BranchItem — checking out a tag
  // detaches HEAD, which is what git does and what the toast spells out.
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!onCheckout) return
    const now = Date.now()
    if (now - lastClickTime.current < 400) {
      e.preventDefault()
      onCheckout()
      lastClickTime.current = 0
    } else {
      lastClickTime.current = now
    }
  }

  return (
    <>
      <div
        className="sb-tag-item"
        onMouseDown={handleMouseDown}
        onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }}
        title={onCheckout ? t('sb.tag.hint', tag.name, tag.hash) : `${tag.name} → ${tag.hash}`}
      >
        <span className="sb-tag-icon">🏷</span>
        <span className="sb-tag-name">{tag.name}</span>
        <code className="sb-tag-hash">{tag.hash}</code>
      </div>
      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} items={menuItems} onClose={() => setCtx(null)} />
      )}
    </>
  )
}

// ── Reflog item ───────────────────────────────────────────────────
function ReflogItem({ entry, onSelect }: { entry: ReflogEntry; onSelect: () => void }) {
  return (
    <div className="sb-reflog-item" onClick={onSelect} title={`${entry.ref}: ${entry.message}`}>
      <span className="sb-reflog-icon">📋</span>
      <div className="sb-reflog-info">
        <span className="sb-reflog-ref">{entry.ref}</span>
        <span className="sb-reflog-msg">{entry.message}</span>
        <span className="sb-reflog-date">{entry.date}</span>
      </div>
    </div>
  )
}

// ── Remote item ───────────────────────────────────────────────────
function RemoteItem({
  remote, isDefault, onSetDefault, onFetch, onPrune, onRename, onRemove, onCopyUrl
}: {
  remote: RemoteEntry
  isDefault: boolean
  onSetDefault: () => void
  onFetch: () => void
  onPrune: () => void
  onRename: () => void
  onRemove: () => void
  onCopyUrl: () => void
}) {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const { t } = useLang()
  const menuItems: MenuItemDef[] = [
    { label: t('sb.remote.fetch'), action: onFetch },
    { label: t('sb.remote.prune'), action: onPrune },
    // checked (not just disabled) so the current default is visible at a glance
    { label: t('sb.remote.setDefault'), action: onSetDefault, checked: isDefault },
    { label: t('sb.remote.copyUrl'), action: onCopyUrl },
    { label: t('sb.rename'), action: onRename },
    { separator: true },
    { label: t('sb.delete'), action: onRemove, danger: true },
  ]

  return (
    <>
      <div
        className="sb-remote-item"
        onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }}
        title={remote.fetchUrl}
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="remote-icon">
          <path d="M1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25v-8.5C0 2.784.784 2 1.75 2ZM1.5 12.251c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V5.809L8.38 9.397a.75.75 0 0 1-.76 0L1.5 5.809v6.442Zm13-8.181v-.32a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25v.32L8 7.88Z"/>
        </svg>
        <div className="sb-remote-info">
          <span className="sb-remote-name">
            {remote.name}
            {isDefault && <span className="sb-remote-default" title={t('sb.remote.defaultFlag')}>{t('sb.remote.defaultBadge')}</span>}
          </span>
          <span className="sb-remote-url">{remote.fetchUrl}</span>
        </div>
      </div>
      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} items={menuItems} onClose={() => setCtx(null)} />
      )}
    </>
  )
}

// ── Submodule item ────────────────────────────────────────────────
function SubmoduleItem({
  sub, onInit, onUpdate
}: {
  sub: SubmoduleEntry
  onInit: () => void
  onUpdate: () => void
}) {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const { t } = useLang()
  const statusColor = sub.status === 'ok' ? '#3fb950' : sub.status === 'dirty' ? '#ffa657' : '#484f58'
  const statusLabel = sub.status === 'ok' ? '✓' : sub.status === 'dirty' ? '~' : '○'

  const menuItems: MenuItemDef[] = [
    ...(sub.status === 'uninitialized' ? [{ label: t('sb.sub.init'), action: onInit }] : []),
    { label: t('sb.sub.update'), action: onUpdate },
  ]

  return (
    <>
      <div
        className="sb-submodule-item"
        onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }}
        title={sub.url}
      >
        <span className="sb-sub-status" style={{ color: statusColor }}>{statusLabel}</span>
        <div className="sb-sub-info">
          <span className="sb-sub-path">{sub.path}</span>
          <span className="sb-sub-url">{sub.url}</span>
        </div>
      </div>
      {ctx && menuItems.length > 0 && (
        <ContextMenu x={ctx.x} y={ctx.y} items={menuItems} onClose={() => setCtx(null)} />
      )}
    </>
  )
}

// ── Worktree item ─────────────────────────────────────────────────
function WorktreeItem({ wt, agents = [], onOpen, onRemove }: {
  wt: WorktreeEntry
  // Running AI agents whose cwd is inside this worktree
  agents?: AgentEntry[]
  onOpen: () => void
  onRemove: () => void
}) {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const { t } = useLang()
  const name = wt.path.split('/').pop() || wt.path
  const menuItems: MenuItemDef[] = [
    { label: t('sb.wt.open'), action: onOpen },
    { label: t('sb.wt.copyPath'), action: () => navigator.clipboard.writeText(wt.path) },
    ...(!wt.isMain ? [
      { separator: true as const },
      { label: t('sb.wt.remove'), action: onRemove, danger: true },
    ] : []),
  ]
  // De-duplicate agent names ("2× Claude Code" reads better than twice the badge)
  const agentSummary = [...new Map(agents.map(a => [a.name, agents.filter(x => x.name === a.name).length])).entries()]

  return (
    <>
      <div
        className="sb-submodule-item"
        onClick={onOpen}
        onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }}
        title={agents.length ? `${wt.path}\n${agents.map(a => `● ${a.name} (pid ${a.pid})`).join('\n')}` : wt.path}
        style={{ cursor: 'pointer' }}
      >
        <span className="sb-sub-status" style={{ color: wt.isMain ? '#3fb950' : '#58a6ff' }}>
          {wt.isMain ? '◉' : '○'}
        </span>
        <div className="sb-sub-info">
          <span className="sb-sub-path">
            {name} <code style={{ opacity: 0.6 }}>{wt.branch}</code>
            {agentSummary.map(([agentName, count]) => (
              <span key={agentName} className="sb-agent-badge">
                <span className="sb-agent-dot" />
                {count > 1 ? `${count}× ` : ''}{agentName}
              </span>
            ))}
          </span>
          <span className="sb-sub-url">{wt.path}</span>
        </div>
      </div>
      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} items={menuItems} onClose={() => setCtx(null)} />
      )}
    </>
  )
}

// ── Main Sidebar ──────────────────────────────────────────────────
export default function Sidebar({
  repoPath, repoName, currentBranch, branches, recentRepos, stashes, tags,
  onOpenRepo, onClone, onSetRepo, onRemoveRecent,
  onCheckout, onCreateBranch, onDeleteBranch, onMergeBranch, onRenameBranch,
  onRebaseOnto, onPushBranch, onDeleteRemoteBranch, onSetUpstream,
  onCreateStash, onApplyStash, onPopStash, onDropStash, onPreviewStash, onRefreshStashes,
  onCreateTag, onDeleteTag, onCheckoutTag, onPushTag, onDeleteRemoteTag,
  onSelectCommit, onCompareBranch,
  soloBranch, mutedBranches, onToggleSolo, onToggleMute,
  onFetch, onPull,
  isFavorite, isPinned, issueFor, onToggleFavorite, onTogglePin,
  onOpenBranchOnRemote, onAssociateIssue, prIntentFor, onCreatePR,
  showToast, showPrompt, showConfirm, onRefresh, embedded = false, view,
}: SidebarProps) {
  // In single-view mode a section is shown when it matches the active view.
  // Without a view (desktop) every section renders (classic stacked layout).
  const single = view !== undefined
  const show = (v: SidebarView) => !single || view === v
  const [reflog, setReflog] = useState<ReflogEntry[]>([])
  const [remotes, setRemotes] = useState<RemoteEntry[]>([])
  // Which remote push/pull target by default — resolved by the service, so it
  // reflects the explicit choice or the origin/first-remote fallback.
  const [defaultRemote, setDefaultRemote] = useState<string | null>(null)
  const [submodules, setSubmodules] = useState<SubmoduleEntry[]>([])
  const [worktrees, setWorktrees] = useState<WorktreeEntry[]>([])
  // Running AI agents (Claude Code, aider…) keyed by their cwd — matched
  // against worktree paths to badge "an agent is working here".
  const [agents, setAgents] = useState<AgentEntry[]>([])
  // Working-tree summary for the overview "current work" card.
  const [work, setWork] = useState<{ staged: number; changed: number }>({ staged: 0, changed: 0 })
  const { t } = useLang()

  const loadWorktrees = useCallback(() => {
    window.gitAPI.listWorktrees().then(r => setWorktrees(r.worktrees ?? []))
    ;(window.gitAPI as any).listAgents?.().then((r: { agents?: AgentEntry[] }) => setAgents(r?.agents ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!repoPath) return
    window.gitAPI.getReflog().then(r => setReflog(r.entries ?? []))
    window.gitAPI.getRemotes().then(r => setRemotes(r.remotes ?? []))
    window.gitAPI.getDefaultRemote?.().then(r => setDefaultRemote(r?.remote ?? null)).catch(() => {})
    window.gitAPI.getSubmodules().then(r => setSubmodules(r.submodules ?? []))
    window.gitAPI.getWorkingChanges?.()
      .then(w => setWork({ staged: w.staged.length, changed: w.unstaged.length + w.untracked.length }))
      .catch(() => {})
    loadWorktrees()
    // Light poll so agent badges stay current while the sidebar is open.
    const interval = setInterval(() => {
      ;(window.gitAPI as any).listAgents?.().then((r: { agents?: AgentEntry[] }) => setAgents(r?.agents ?? [])).catch(() => {})
    }, 10000)
    return () => clearInterval(interval)
  }, [repoPath, loadWorktrees])

  const agentsFor = useCallback((wtPath: string) =>
    agents.filter(a => a.cwd === wtPath || a.cwd.startsWith(wtPath + '/')),
  [agents])

  const handleAddWorktree = async () => {
    const dir = await window.gitAPI.selectDirectory(t('worktree.selectDir'))
    if (!dir.path) return
    const ref = await showPrompt(t('sb.wt.checkoutPrompt'), currentBranch)
    if (ref === null) return
    const r = await window.gitAPI.addWorktree(dir.path, ref || '')
    if (r.success) { showToast(t('toast.worktreeCreated', dir.path.split('/').pop() ?? '')); loadWorktrees() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }

  const handleRemoveWorktree = async (path: string) => {
    const ok = await showConfirm(t('sb.wt.removeConfirm', path), true)
    if (!ok) return
    let r = await window.gitAPI.removeWorktree(path)
    if (!r.success && r.error && /contains modified|untracked|use --force|locked/i.test(r.error)) {
      const force = await showConfirm(t('sb.wt.forceConfirm'), true)
      if (force) r = await window.gitAPI.removeWorktree(path, true)
    }
    if (r.success) { showToast(t('sb.wt.removed')); loadWorktrees() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }

  const handleInitSubmodule = async (path: string) => {
    const r = await window.gitAPI.initSubmodule(path)
    if (r.success) {
      showToast(t('sb.sub.initialized', path))
      const updated = await window.gitAPI.getSubmodules()
      setSubmodules(updated.submodules ?? [])
    } else {
      showToast(t('toast.err', r.error ?? ''), 'err')
    }
  }

  const handleUpdateSubmodule = async (path: string) => {
    const r = await window.gitAPI.updateSubmodule(path)
    if (r.success) {
      showToast(t('sb.sub.updated', path))
      const updated = await window.gitAPI.getSubmodules()
      setSubmodules(updated.submodules ?? [])
    } else {
      showToast(t('toast.err', r.error ?? ''), 'err')
    }
  }

  const handleAddRemote = async () => {
    const name = await showPrompt(t('sb.remote.namePrompt'))
    if (!name) return
    const url = await showPrompt(t('sb.remote.urlPrompt'))
    if (!url) return
    const r = await window.gitAPI.addRemote(name, url)
    if (r.success) {
      showToast(t('sb.remote.added', name))
      const updated = await window.gitAPI.getRemotes()
      setRemotes(updated.remotes ?? [])
    } else {
      showToast(t('toast.err', r.error ?? ''), 'err')
    }
  }

  const handleRemoveRemote = async (name: string) => {
    const ok = await showConfirm(t('sb.remote.removeConfirm', name), true)
    if (!ok) return
    const r = await window.gitAPI.removeRemote(name)
    if (r.success) {
      showToast(t('sb.remote.removed', name))
      const updated = await window.gitAPI.getRemotes()
      setRemotes(updated.remotes ?? [])
    } else {
      showToast(t('toast.err', r.error ?? ''), 'err')
    }
  }

  const handleRenameRemote = async (name: string) => {
    const newName = await showPrompt(t('sb.remote.renamePrompt', name), name)
    if (!newName || newName === name) return
    const r = await window.gitAPI.renameRemote(name, newName)
    if (r.success) {
      showToast(t('sb.remote.renamed', newName))
      const updated = await window.gitAPI.getRemotes()
      setRemotes(updated.remotes ?? [])
    } else {
      showToast(t('toast.err', r.error ?? ''), 'err')
    }
  }

  // The + on the stash section offers a scope rather than always taking
  // everything: stashing only the index (or only what isn't staged) is a
  // routine move git supports natively (v1.23.0).
  const [stashMenu, setStashMenu] = useState<{ x: number; y: number } | null>(null)
  const stashScopeItems: MenuItemDef[] = [
    { label: t('sb.stash.scopeAll'), action: () => onCreateStash('all') },
    { label: t('sb.stash.scopeStaged'), action: () => onCreateStash('staged') },
    { label: t('sb.stash.scopeUnstaged'), action: () => onCreateStash('unstaged') },
  ]

  // git has no `stash rename`, so this re-stores the entry under a new label —
  // which moves it to the top of the stack. Say so rather than let the list
  // reorder itself unexplained (v1.23.0).
  const handleRenameStash = async (index: number, current: string) => {
    const label = current.replace(/^stash@\{\d+\}: /, '')
    const next = await showPrompt(t('sb.stash.renamePrompt'), label)
    if (!next || next === label) return
    const r = await window.gitAPI.renameStash(index, next)
    if (r.success) { showToast(t('sb.stash.renamed')); onRefreshStashes() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }

  // Pruning the remote is only half the cleanup: once its tracking refs go,
  // the local branches that pointed at them read as "gone" and are usually
  // dead too — so offer to sweep them in the same gesture rather than leaving
  // the user to hunt for them one by one (v1.23.0).
  const handlePruneRemote = async (name: string) => {
    const r = await window.gitAPI.pruneRemote(name)
    if (!r.success) { showToast(t('toast.err', r.error ?? ''), 'err'); return }

    const pruned = r.pruned ?? []
    showToast(pruned.length ? t('sb.remote.pruneOk', name, pruned.length) : t('sb.remote.pruneNone', name))
    onRefresh?.()

    const { branches: gone } = await window.gitAPI.getGoneBranches()
    if (gone.length === 0) return
    const ok = await showConfirm(t('sb.branch.pruneGoneConfirm', gone.length, gone.join(', ')), true)
    if (!ok) return
    const d = await window.gitAPI.pruneGoneBranches(gone)
    if (d.success) showToast(t('sb.branch.pruneGoneOk', d.deleted.length))
    else showToast(t('toast.err', d.error ?? ''), 'err')
    onRefresh?.()
  }

  const handleSetDefaultRemote = async (name: string) => {
    const r = await window.gitAPI.setDefaultRemote(name)
    if (!r.success) { showToast(t('toast.err', r.error ?? ''), 'err'); return }
    setDefaultRemote(name)
    showToast(t('sb.remote.defaultSet', name))
  }

  const handleFetchRemote = async (name: string) => {
    const r = await window.gitAPI.fetchRemote(name)
    if (r.success) showToast(t('sb.remote.fetchOk', name))
    else showToast(t('toast.fetchErr', r.error ?? ''), 'err')
  }
  const [repoMenuOpen, setRepoMenuOpen] = useState(false)
  const [branchFilter, setBranchFilter] = useState('')
  const repoMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (repoMenuRef.current && !repoMenuRef.current.contains(e.target as Node)) {
        setRepoMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Favorites float to the top of LOCAL — the whole point of starring a branch
  // is not to hunt for it in a long list (v1.21.0). Order is otherwise
  // untouched, so unstarred branches keep the ordering git gave us.
  const localBranches = branches
    .filter(b => !b.remote)
    .filter(b => !branchFilter || b.name.toLowerCase().includes(branchFilter.toLowerCase()))
    .sort((a, b) => Number(isFavorite?.(b.name) ?? false) - Number(isFavorite?.(a.name) ?? false))
  const remoteBranches = branches
    .filter(b => b.remote)
    .filter(b => !branchFilter || b.name.toLowerCase().includes(branchFilter.toLowerCase()))
  // Same short name under more than one remote ("main" on both origin and
  // archive) → prefix those with their remote name so they're tellable apart.
  const remoteShortNameCounts = new Map<string, number>()
  for (const b of remoteBranches) {
    const short = b.name.replace(/^remotes\/[^/]+\//, '')
    remoteShortNameCounts.set(short, (remoteShortNameCounts.get(short) ?? 0) + 1)
  }

  const otherRecents = recentRepos.filter(r => r !== repoPath)

  return (
    <div className="sidebar">
      {/* ── Repo selector ── (hidden when embedded in the VS Code panel: the
          repo is always the workspace, so open/clone/recent don't apply) */}
      {!embedded && (
      <div className="sb-repo-area" ref={repoMenuRef}>
        <button className="sb-repo-btn" onClick={() => setRepoMenuOpen(o => !o)}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="#3fb950">
            <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 0 1 1-1h8z"/>
          </svg>
          <span className="sb-repo-name">{repoName || t('sb.openRepo')}</span>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.427 7.427l3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427z"/>
          </svg>
        </button>

        {repoMenuOpen && (
          <div className="sb-repo-dropdown">
            <button className="sb-dropdown-item sb-open-item"
              onClick={() => { onOpenRepo(); setRepoMenuOpen(false) }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                <path d="M.75 9.75a.75.75 0 0 0 0 1.5h14.5a.75.75 0 0 0 0-1.5H.75ZM0 2.75C0 2.336.336 2 .75 2h14.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 2.75ZM0 6.25C0 5.836.336 5.5.75 5.5h14.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 6.25Z"/>
              </svg>
              {t('sb.openRepoDots')}
            </button>
            <button className="sb-dropdown-item sb-open-item"
              onClick={() => { onClone(); setRepoMenuOpen(false) }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
              </svg>
              {t('sb.cloneDots')}
            </button>
            {otherRecents.length > 0 && (
              <>
                <div className="sb-dropdown-sep" />
                <div className="sb-dropdown-label">{t('sb.recents')}</div>
                {otherRecents.map(path => (
                  <div key={path} className="sb-dropdown-item sb-recent-item">
                    <button className="sb-recent-path"
                      onClick={() => { onSetRepo(path); setRepoMenuOpen(false) }} title={path}>
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 0 1 1-1h8z"/>
                      </svg>
                      <span>{path.split('/').pop()}</span>
                      <span className="sb-recent-full">{path}</span>
                    </button>
                    <button className="sb-recent-remove" title={t('sb.removeRecent')}
                      onClick={() => onRemoveRecent(path)}>×</button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
      )}

      {/* ── Branch filter ── (branches view only in single mode) */}
      {repoPath && show('branches') && (
        <div className="sb-search">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"/>
          </svg>
          <input type="text" placeholder={t('sb.filterBranches')}
            value={branchFilter} onChange={e => setBranchFilter(e.target.value)} />
          {branchFilter && <button className="sb-filter-clear" title={t('common.clearFilter')} onClick={() => setBranchFilter('')}>×</button>}
        </div>
      )}

      {/* ── Sections ── */}
      {repoPath && (
        <div className="sb-sections">

          {/* OVERVIEW "current work" card (single-view only) */}
          {view === 'overview' && (() => {
            const cur = branches.find(b => b.current)
            const ahead = cur?.ahead ?? 0
            const behind = cur?.behind ?? 0
            const hasStats = ahead > 0 || behind > 0 || work.staged > 0 || work.changed > 0
            return (
              <div className="sb-overview">
                <div className="sb-ov-label">{t('sb.currentWork')}</div>
                <div className="sb-ov-card">
                  <div className="sb-ov-branch">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="#3fb950">
                      <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z"/>
                    </svg>
                    <span className="sb-ov-branch-name">{currentBranch}</span>
                    {agents.length > 0 && (
                      <span className="sb-ov-agents" title={t('sb.agentsActive', agents.length)}>
                        <span className="sb-agent-dot" />{agents.length}
                      </span>
                    )}
                  </div>
                  {hasStats && (
                    <div className="sb-ov-stats">
                      {ahead > 0 && <span className="sb-track-ahead" title={t('sb.branch.trackTitle', ahead, behind)}>↑{ahead}</span>}
                      {behind > 0 && <span className="sb-track-behind" title={t('sb.branch.trackTitle', ahead, behind)}>↓{behind}</span>}
                      {work.staged > 0 && <span className="sb-ov-staged" title={t('sb.staged')}>+{work.staged}</span>}
                      {work.changed > 0 && <span className="sb-ov-changed" title={t('sb.changed')}>✎{work.changed}</span>}
                    </div>
                  )}
                  {!hasStats && <div className="sb-ov-clean">{t('sb.clean')}</div>}
                </div>
              </div>
            )
          })()}

          {/* AGENTS (single-view only) */}
          {view === 'agents' && (
            <Section title="AGENTS" count={agents.length} defaultOpen>
              {agents.length === 0
                ? <div className="sb-empty">{t('sb.noAgent')}</div>
                : agents.map(a => (
                    <div key={a.pid} className="sb-submodule-item" title={a.cwd}>
                      <span className="sb-agent-dot" />
                      <div className="sb-sub-info">
                        <span className="sb-sub-path">
                          {a.name} <code style={{ opacity: 0.6 }}>pid {a.pid}</code>
                        </span>
                        <span className="sb-sub-url">{a.cwd}</span>
                      </div>
                    </div>
                  ))
              }
            </Section>
          )}

          {/* LOCAL (also shown in the overview "current work" home) */}
          {(show('branches') || view === 'overview') && (
          <Section title="LOCAL" count={localBranches.length} onAdd={onCreateBranch} addLabel={t('sb.newBranch')}>
            {localBranches.length === 0 && <div className="sb-empty">{t('sb.noLocalBranch')}</div>}
            {localBranches.map(b => (
              <BranchItem
                key={b.name}
                name={b.name}
                current={b.current}
                currentBranch={currentBranch}
                onCheckout={() => !b.current && onCheckout(b.name)}
                onDelete={() => onDeleteBranch(b.name)}
                onMerge={() => onMergeBranch(b.name)}
                onRename={() => onRenameBranch(b.name)}
                onCompare={!b.current ? () => onCompareBranch(b.name) : undefined}
                onRebaseOnto={!b.current ? () => onRebaseOnto(b.name) : undefined}
                onPush={() => onPushBranch(b.name)}
                onSetUpstream={() => onSetUpstream(b.name)}
                onFetch={b.current ? onFetch : undefined}
                onPull={b.current ? onPull : undefined}
                soloed={soloBranch === b.name}
                muted={mutedBranches.has(b.name)}
                onToggleSolo={() => onToggleSolo(b.name)}
                onToggleMute={() => onToggleMute(b.name)}
                favorite={isFavorite?.(b.name)}
                pinned={isPinned?.(b.name)}
                issue={issueFor?.(b.name)}
                onToggleFavorite={onToggleFavorite && (() => onToggleFavorite(b.name))}
                onTogglePin={onTogglePin && (() => onTogglePin(b.name))}
                onOpenOnRemote={onOpenBranchOnRemote && (() => onOpenBranchOnRemote(b.name))}
                onAssociateIssue={onAssociateIssue && (() => onAssociateIssue(b.name))}
                pr={prIntentFor?.(b.name)}
                onCreatePR={onCreatePR}
                ahead={b.ahead}
                behind={b.behind}
                gone={b.gone}
              />
            ))}
          </Section>
          )}

          {/* REMOTE */}
          {show('branches') && remoteBranches.length > 0 && (
            <Section title="REMOTE" count={remoteBranches.length} defaultOpen={single}>
              {remoteBranches.map(b => (
                <BranchItem
                  key={b.name}
                  name={b.name}
                  current={false}
                  remote={true}
                  showRemotePrefix={(remoteShortNameCounts.get(b.name.replace(/^remotes\/[^/]+\//, '')) ?? 0) > 1}
                  currentBranch={currentBranch}
                  onCheckout={() => {
                    const localName = b.name.replace(/^remotes\/[^/]+\//, '')
                    onCheckout(localName)
                  }}
                  onDeleteRemote={() => onDeleteRemoteBranch(b.name)}
                  soloed={soloBranch === b.name}
                  muted={mutedBranches.has(b.name)}
                  onToggleSolo={() => onToggleSolo(b.name)}
                  onToggleMute={() => onToggleMute(b.name)}
                  favorite={isFavorite?.(b.name)}
                  pinned={isPinned?.(b.name)}
                  onToggleFavorite={onToggleFavorite && (() => onToggleFavorite(b.name))}
                  onTogglePin={onTogglePin && (() => onTogglePin(b.name))}
                  onOpenOnRemote={onOpenBranchOnRemote && (() => onOpenBranchOnRemote(b.name))}
                  pr={prIntentFor?.(b.name)}
                  onCreatePR={onCreatePR}
                />
              ))}
            </Section>
          )}

          {/* TAGS */}
          {show('tags') && (
          <Section title="TAGS" count={tags.length} defaultOpen={single}
            onAdd={onCreateTag} addLabel={t('sb.newTag')}>
            {tags.length === 0
              ? <div className="sb-empty">{t('sb.noTag')}</div>
              : tags.map(t => (
                  <TagItem key={t.name} tag={t} onCheckout={() => onCheckoutTag(t.name)}
                    onDelete={() => onDeleteTag(t.name)}
                    onPush={() => onPushTag(t.name)} onDeleteRemote={() => onDeleteRemoteTag(t.name)} />
                ))
            }
          </Section>
          )}

          {/* REMOTES */}
          {show('remotes') && (
          <Section title="REMOTES" count={remotes.length} defaultOpen={single}
            onAdd={handleAddRemote} addLabel={t('sb.addRemote')}>
            {remotes.length === 0
              ? <div className="sb-empty">{t('sb.noRemote')}</div>
              : remotes.map(r => (
                  <RemoteItem
                    key={r.name}
                    remote={r}
                    isDefault={defaultRemote === r.name}
                    onSetDefault={() => handleSetDefaultRemote(r.name)}
                    onFetch={() => handleFetchRemote(r.name)}
                    onPrune={() => handlePruneRemote(r.name)}
                    onRename={() => handleRenameRemote(r.name)}
                    onRemove={() => handleRemoveRemote(r.name)}
                    onCopyUrl={() => navigator.clipboard.writeText(r.fetchUrl)}
                  />
                ))
            }
          </Section>
          )}

          {/* SUBMODULES */}
          {show('overview') && submodules.length > 0 && (
            <Section title="SUBMODULES" count={submodules.length} defaultOpen={false}>
              {submodules.map(sub => (
                <SubmoduleItem
                  key={sub.path}
                  sub={sub}
                  onInit={() => handleInitSubmodule(sub.path)}
                  onUpdate={() => handleUpdateSubmodule(sub.path)}
                />
              ))}
            </Section>
          )}

          {/* WORKTREES */}
          {show('worktrees') && (
          <Section title="WORKTREES" count={worktrees.length} defaultOpen={single}
            onAdd={handleAddWorktree} addLabel={t('sb.addWorktree')}>
            {worktrees.length === 0
              ? <div className="sb-empty">{t('sb.noWorktree')}</div>
              : worktrees.map(wt => (
                  <WorktreeItem
                    key={wt.path}
                    wt={wt}
                    agents={agentsFor(wt.path)}
                    onOpen={() => onSetRepo(wt.path)}
                    onRemove={() => handleRemoveWorktree(wt.path)}
                  />
                ))
            }
          </Section>
          )}

          {/* REFLOG — recovery/history tool, kept collapsed at the bottom of
              the overview (not the point of the overview) */}
          {show('overview') && (
          <Section title="REFLOG" count={reflog.length} defaultOpen={false}>
            {reflog.length === 0
              ? <div className="sb-empty">{t('sb.reflogEmpty')}</div>
              : reflog.map((entry, i) => (
                  <ReflogItem
                    key={i}
                    entry={entry}
                    onSelect={() => onSelectCommit(entry.hash)}
                  />
                ))
            }
          </Section>
          )}

          {/* STASH */}
          {show('stash') && (
          <Section
            title="STASH"
            count={stashes.length}
            defaultOpen={single}
            onAdd={e => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setStashMenu({ x: r.left, y: r.bottom + 4 })
            }}
            addLabel={t('sb.stash.create')}
          >
            {stashes.length === 0
              ? <div className="sb-empty">{t('sb.noStash')}</div>
              : stashes.map(s => (
                  <StashItem
                    key={s.index}
                    stash={s}
                    onApply={() => onApplyStash(s.index)}
                    onPop={() => onPopStash(s.index)}
                    onDrop={() => onDropStash(s.index)}
                    onPreview={onPreviewStash ? () => onPreviewStash(s.index, s.message) : undefined}
                    onRename={() => handleRenameStash(s.index, s.message)}
                  />
                ))
            }
          </Section>
          )}

        </div>
      )}

      {stashMenu && (
        <ContextMenu x={stashMenu.x} y={stashMenu.y} items={stashScopeItems}
          onClose={() => setStashMenu(null)} />
      )}

      {/* ── Empty state ── */}
      {!repoPath && (
        <div className="sb-no-repo">
          <button className="sb-open-btn" onClick={onOpenRepo}>{t('sb.openRepo')}</button>
          <button className="sb-open-btn sb-clone-btn" onClick={onClone}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            {t('sb.clone')}
          </button>
          {recentRepos.length > 0 && (
            <>
              <div className="sb-recents-title">{t('sb.recents')}</div>
              {recentRepos.map(path => (
                <button key={path} className="sb-recent-btn" onClick={() => onSetRepo(path)} title={path}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 0 1 1-1h8z"/>
                  </svg>
                  {path.split('/').pop()}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
