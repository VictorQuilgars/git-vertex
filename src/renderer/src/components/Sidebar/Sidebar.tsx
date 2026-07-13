import React, { useState, useRef, useEffect, useCallback } from 'react'
import { BranchInfo } from '../../types'
import ContextMenu, { MenuItemDef } from '../ContextMenu/ContextMenu'
import './Sidebar.css'

interface StashEntry { index: number; message: string }
interface TagEntry   { name: string; hash: string }

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
  onCreateStash: () => void
  onApplyStash: (index: number) => void
  onPopStash: (index: number) => void
  onDropStash: (index: number) => void
  onPreviewStash?: (index: number, message: string) => void
  onRefreshStashes: () => void
  onCreateTag: () => void
  onDeleteTag: (name: string) => void
  onPushTag: (name: string) => void
  onDeleteRemoteTag: (name: string) => void
  onSelectCommit: (hash: string) => void
  onCompareBranch: (branchName: string) => void
  soloBranch: string | null
  mutedBranches: Set<string>
  onToggleSolo: (name: string) => void
  onToggleMute: (name: string) => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
  showPrompt: (msg: string, defaultValue?: string) => Promise<string | null>
  showConfirm: (msg: string, danger?: boolean) => Promise<boolean>
  // Embedded host (VS Code panel): the repo is the workspace, so the
  // open/clone/recent repo picker doesn't apply and is hidden.
  embedded?: boolean
}

// ── Collapse section ─────────────────────────────────────────────
function Section({ title, count, children, defaultOpen = true, onAdd, addLabel }: {
  title: string
  count?: number
  children: React.ReactNode
  defaultOpen?: boolean
  onAdd?: () => void
  addLabel?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="sb-section">
      <div className="sb-section-header" onClick={() => setOpen(o => !o)}>
        <svg className={`chevron ${open ? 'open' : ''}`} width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
          <path d="m4 1 8 7-8 7V1z"/>
        </svg>
        <span className="sb-section-title">{title}</span>
        {count !== undefined && <span className="sb-section-count">{count}</span>}
        {onAdd && (
          <button className="sb-add-btn" title={addLabel ?? 'Ajouter'}
            onClick={e => { e.stopPropagation(); onAdd() }}>
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
  onToggleSolo?: () => void
  onToggleMute?: () => void
  ahead?: number
  behind?: number
  gone?: boolean
}

function BranchItem({ name, current, remote, currentBranch, onCheckout, onDelete, onMerge, onRename, onCompare, onRebaseOnto, onPush, onDeleteRemote, onSetUpstream, soloed, muted, onToggleSolo, onToggleMute, ahead = 0, behind = 0, gone = false }: BranchItemProps) {
  const [hover, setHover] = useState(false)
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const lastClickTime = useRef(0)
  const display = remote ? name.replace(/^remotes\/[^/]+\//, '') : name

  const menuItems: MenuItemDef[] = [
    ...(!current ? [{ label: '✓ Checkout', action: onCheckout }] : []),
    ...(!current && onMerge ? [{ label: `⇒ Merger dans "${currentBranch}"`, action: onMerge }] : []),
    ...(!current && onRebaseOnto ? [{ label: `⤵ Rebaser "${currentBranch}" dessus`, action: onRebaseOnto }] : []),
    ...(!current && onCompare ? [{ label: `⇄ Comparer avec "${currentBranch}"`, action: onCompare }] : []),
    { separator: true as const },
    ...(!remote && onPush ? [{ label: '⬆ Push', action: onPush }] : []),
    ...(!remote && onSetUpstream ? [{ label: '🔗 Définir l\'upstream (origin)', action: onSetUpstream }] : []),
    { label: '📋 Copier le nom', action: () => navigator.clipboard.writeText(display) },
    ...(onToggleSolo ? [{ label: soloed ? '👁 Annuler le solo' : '👁 Solo (afficher seule)', action: onToggleSolo }] : []),
    ...(onToggleMute ? [{ label: muted ? '🔊 Réafficher' : '🔇 Masquer du graphe', action: onToggleMute }] : []),
    ...(!remote && onRename ? [{ label: '✏️ Renommer', action: onRename }] : []),
    ...((!current && !remote && onDelete) ? [
      { separator: true as const },
      { label: '🗑 Supprimer', action: onDelete, danger: true },
    ] : []),
    ...((remote && onDeleteRemote) ? [
      { separator: true as const },
      { label: '🗑 Supprimer la branche distante', action: onDeleteRemote, danger: true },
    ] : []),
  ]

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
        title={current ? `${name} (branche courante)` : `Double-clic: checkout • Clic droit: options`}
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="branch-icon">
          <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z"/>
        </svg>
        <span className="sb-branch-name">{display}</span>
        {(ahead > 0 || behind > 0) && (
          <span className="sb-track" title={`${ahead} commit${ahead > 1 ? 's' : ''} en avance, ${behind} en retard sur l'upstream`}>
            {ahead > 0 && <span className="sb-track-ahead">↑{ahead}</span>}
            {behind > 0 && <span className="sb-track-behind">↓{behind}</span>}
          </span>
        )}
        {gone && <span className="sb-track sb-track-gone" title="Upstream supprimé sur le remote">✂</span>}
        {soloed && <span className="sb-branch-flag" title="Solo">👁</span>}
        {muted && <span className="sb-branch-flag" title="Masquée">🔇</span>}
        {current && (
          <svg width="11" height="11" viewBox="0 0 16 16" fill="#3fb950" className="current-check">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/>
          </svg>
        )}
        {hover && !current && onDelete && (
          <button className="sb-delete-btn" title="Supprimer"
            onClick={e => { e.stopPropagation(); onDelete() }}>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
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
function StashItem({ stash, onApply, onPop, onDrop, onPreview }: {
  stash: StashEntry
  onApply: () => void
  onPop: () => void
  onDrop: () => void
  onPreview?: () => void
}) {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const label = stash.message.replace(/^stash@\{\d+\}: /, '')

  const menuItems: MenuItemDef[] = [
    ...(onPreview ? [{ label: '👁 Aperçu du contenu', action: onPreview }] : []),
    { label: '▶ Appliquer (garder)', action: onApply },
    { label: '▶ Appliquer (pop)', action: onPop },
    { separator: true },
    { label: '🗑 Supprimer', action: onDrop, danger: true },
  ]

  return (
    <>
      <div
        className="sb-stash-item"
        onClick={onPreview}
        onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }}
        title={onPreview ? `${stash.message} — clic : aperçu` : stash.message}
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
function TagItem({ tag, onDelete, onPush, onDeleteRemote }: {
  tag: TagEntry; onDelete: () => void; onPush: () => void; onDeleteRemote: () => void
}) {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const menuItems: MenuItemDef[] = [
    { label: '📋 Copier le nom', action: () => navigator.clipboard.writeText(tag.name) },
    { label: '⬆ Pousser le tag', action: onPush },
    { separator: true },
    { label: '🗑 Supprimer (local)', action: onDelete, danger: true },
    { label: '🗑 Supprimer (distant)', action: onDeleteRemote, danger: true },
  ]

  return (
    <>
      <div
        className="sb-tag-item"
        onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }}
        title={`${tag.name} → ${tag.hash}`}
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
  remote, onFetch, onRename, onRemove, onCopyUrl
}: {
  remote: RemoteEntry
  onFetch: () => void
  onRename: () => void
  onRemove: () => void
  onCopyUrl: () => void
}) {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const menuItems: MenuItemDef[] = [
    { label: '⬇ Fetch ce remote', action: onFetch },
    { label: '📋 Copier l\'URL', action: onCopyUrl },
    { label: '✏️ Renommer', action: onRename },
    { separator: true },
    { label: '🗑 Supprimer', action: onRemove, danger: true },
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
          <span className="sb-remote-name">{remote.name}</span>
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
  const statusColor = sub.status === 'ok' ? '#3fb950' : sub.status === 'dirty' ? '#ffa657' : '#484f58'
  const statusLabel = sub.status === 'ok' ? '✓' : sub.status === 'dirty' ? '~' : '○'

  const menuItems: MenuItemDef[] = [
    ...(sub.status === 'uninitialized' ? [{ label: '⬇ Initialiser', action: onInit }] : []),
    { label: '↺ Mettre à jour', action: onUpdate },
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
  const name = wt.path.split('/').pop() || wt.path
  const menuItems: MenuItemDef[] = [
    { label: '📂 Ouvrir', action: onOpen },
    { label: '📋 Copier le chemin', action: () => navigator.clipboard.writeText(wt.path) },
    ...(!wt.isMain ? [
      { separator: true as const },
      { label: '🗑 Supprimer le worktree', action: onRemove, danger: true },
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
  onCreateTag, onDeleteTag, onPushTag, onDeleteRemoteTag,
  onSelectCommit, onCompareBranch,
  soloBranch, mutedBranches, onToggleSolo, onToggleMute,
  showToast, showPrompt, showConfirm, embedded = false,
}: SidebarProps) {
  const [reflog, setReflog] = useState<ReflogEntry[]>([])
  const [remotes, setRemotes] = useState<RemoteEntry[]>([])
  const [submodules, setSubmodules] = useState<SubmoduleEntry[]>([])
  const [worktrees, setWorktrees] = useState<WorktreeEntry[]>([])
  // Running AI agents (Claude Code, aider…) keyed by their cwd — matched
  // against worktree paths to badge "an agent is working here".
  const [agents, setAgents] = useState<AgentEntry[]>([])

  const loadWorktrees = useCallback(() => {
    window.gitAPI.listWorktrees().then(r => setWorktrees(r.worktrees ?? []))
    ;(window.gitAPI as any).listAgents?.().then((r: { agents?: AgentEntry[] }) => setAgents(r?.agents ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!repoPath) return
    window.gitAPI.getReflog().then(r => setReflog(r.entries ?? []))
    window.gitAPI.getRemotes().then(r => setRemotes(r.remotes ?? []))
    window.gitAPI.getSubmodules().then(r => setSubmodules(r.submodules ?? []))
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
    const dir = await window.gitAPI.selectDirectory('Emplacement du nouveau worktree')
    if (!dir.path) return
    const ref = await showPrompt('Branche ou commit à extraire (laisser vide = nouvelle branche) :', currentBranch)
    if (ref === null) return
    const r = await window.gitAPI.addWorktree(dir.path, ref || '')
    if (r.success) { showToast(`✓ Worktree créé : ${dir.path.split('/').pop()}`); loadWorktrees() }
    else showToast(`Erreur : ${r.error}`, 'err')
  }

  const handleRemoveWorktree = async (path: string) => {
    const ok = await showConfirm(`Supprimer le worktree "${path}" ?`, true)
    if (!ok) return
    let r = await window.gitAPI.removeWorktree(path)
    if (!r.success && r.error && /contains modified|untracked|use --force|locked/i.test(r.error)) {
      const force = await showConfirm('Le worktree contient des modifications. Forcer la suppression ?', true)
      if (force) r = await window.gitAPI.removeWorktree(path, true)
    }
    if (r.success) { showToast(`Worktree supprimé`); loadWorktrees() }
    else showToast(`Erreur : ${r.error}`, 'err')
  }

  const handleInitSubmodule = async (path: string) => {
    const r = await window.gitAPI.initSubmodule(path)
    if (r.success) {
      showToast(`✓ Submodule "${path}" initialisé`)
      const updated = await window.gitAPI.getSubmodules()
      setSubmodules(updated.submodules ?? [])
    } else {
      showToast(`Erreur : ${r.error}`, 'err')
    }
  }

  const handleUpdateSubmodule = async (path: string) => {
    const r = await window.gitAPI.updateSubmodule(path)
    if (r.success) {
      showToast(`✓ Submodule "${path}" mis à jour`)
      const updated = await window.gitAPI.getSubmodules()
      setSubmodules(updated.submodules ?? [])
    } else {
      showToast(`Erreur : ${r.error}`, 'err')
    }
  }

  const handleAddRemote = async () => {
    const name = await showPrompt('Nom du remote :')
    if (!name) return
    const url = await showPrompt('URL du remote :')
    if (!url) return
    const r = await window.gitAPI.addRemote(name, url)
    if (r.success) {
      showToast(`✓ Remote "${name}" ajouté`)
      const updated = await window.gitAPI.getRemotes()
      setRemotes(updated.remotes ?? [])
    } else {
      showToast(`Erreur : ${r.error}`, 'err')
    }
  }

  const handleRemoveRemote = async (name: string) => {
    const ok = await showConfirm(`Supprimer le remote "${name}" ?`, true)
    if (!ok) return
    const r = await window.gitAPI.removeRemote(name)
    if (r.success) {
      showToast(`Remote "${name}" supprimé`)
      const updated = await window.gitAPI.getRemotes()
      setRemotes(updated.remotes ?? [])
    } else {
      showToast(`Erreur : ${r.error}`, 'err')
    }
  }

  const handleRenameRemote = async (name: string) => {
    const newName = await showPrompt(`Renommer "${name}" en :`, name)
    if (!newName || newName === name) return
    const r = await window.gitAPI.renameRemote(name, newName)
    if (r.success) {
      showToast(`✓ Remote renommé en "${newName}"`)
      const updated = await window.gitAPI.getRemotes()
      setRemotes(updated.remotes ?? [])
    } else {
      showToast(`Erreur : ${r.error}`, 'err')
    }
  }

  const handleFetchRemote = async (name: string) => {
    const r = await window.gitAPI.fetchRemote(name)
    if (r.success) showToast(`✓ Fetch "${name}" réussi`)
    else showToast(`Fetch échoué : ${r.error}`, 'err')
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

  const localBranches = branches
    .filter(b => !b.remote)
    .filter(b => !branchFilter || b.name.toLowerCase().includes(branchFilter.toLowerCase()))
  const remoteBranches = branches
    .filter(b => b.remote)
    .filter(b => !branchFilter || b.name.toLowerCase().includes(branchFilter.toLowerCase()))

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
          <span className="sb-repo-name">{repoName || 'Ouvrir un dépôt'}</span>
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
              Ouvrir un dépôt…
            </button>
            <button className="sb-dropdown-item sb-open-item"
              onClick={() => { onClone(); setRepoMenuOpen(false) }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
              </svg>
              Cloner depuis GitHub…
            </button>
            {otherRecents.length > 0 && (
              <>
                <div className="sb-dropdown-sep" />
                <div className="sb-dropdown-label">RÉCENTS</div>
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
                    <button className="sb-recent-remove" title="Retirer"
                      onClick={() => onRemoveRecent(path)}>×</button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
      )}

      {/* ── Branch filter ── */}
      {repoPath && (
        <div className="sb-search">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"/>
          </svg>
          <input type="text" placeholder="Filtrer les branches…"
            value={branchFilter} onChange={e => setBranchFilter(e.target.value)} />
          {branchFilter && <button className="sb-filter-clear" onClick={() => setBranchFilter('')}>×</button>}
        </div>
      )}

      {/* ── Sections ── */}
      {repoPath && (
        <div className="sb-sections">

          {/* LOCAL */}
          <Section title="LOCAL" count={localBranches.length} onAdd={onCreateBranch} addLabel="Nouvelle branche">
            {localBranches.length === 0 && <div className="sb-empty">Aucune branche locale</div>}
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
                soloed={soloBranch === b.name}
                muted={mutedBranches.has(b.name)}
                onToggleSolo={() => onToggleSolo(b.name)}
                onToggleMute={() => onToggleMute(b.name)}
                ahead={b.ahead}
                behind={b.behind}
                gone={b.gone}
              />
            ))}
          </Section>

          {/* REMOTE */}
          {remoteBranches.length > 0 && (
            <Section title="REMOTE" count={remoteBranches.length} defaultOpen={false}>
              {remoteBranches.map(b => (
                <BranchItem
                  key={b.name}
                  name={b.name}
                  current={false}
                  remote={true}
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
                />
              ))}
            </Section>
          )}

          {/* TAGS */}
          <Section title="TAGS" count={tags.length} defaultOpen={false}
            onAdd={onCreateTag} addLabel="Nouveau tag">
            {tags.length === 0
              ? <div className="sb-empty">Aucun tag</div>
              : tags.map(t => (
                  <TagItem key={t.name} tag={t} onDelete={() => onDeleteTag(t.name)}
                    onPush={() => onPushTag(t.name)} onDeleteRemote={() => onDeleteRemoteTag(t.name)} />
                ))
            }
          </Section>

          {/* REMOTES */}
          <Section title="REMOTES" count={remotes.length} defaultOpen={false}
            onAdd={handleAddRemote} addLabel="Ajouter un remote">
            {remotes.length === 0
              ? <div className="sb-empty">Aucun remote</div>
              : remotes.map(r => (
                  <RemoteItem
                    key={r.name}
                    remote={r}
                    onFetch={() => handleFetchRemote(r.name)}
                    onRename={() => handleRenameRemote(r.name)}
                    onRemove={() => handleRemoveRemote(r.name)}
                    onCopyUrl={() => navigator.clipboard.writeText(r.fetchUrl)}
                  />
                ))
            }
          </Section>

          {/* SUBMODULES */}
          {submodules.length > 0 && (
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
          <Section title="WORKTREES" count={worktrees.length} defaultOpen={false}
            onAdd={handleAddWorktree} addLabel="Ajouter un worktree">
            {worktrees.length === 0
              ? <div className="sb-empty">Aucun worktree</div>
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

          {/* REFLOG */}
          <Section title="REFLOG" count={reflog.length} defaultOpen={false}>
            {reflog.length === 0
              ? <div className="sb-empty">Reflog vide</div>
              : reflog.map((entry, i) => (
                  <ReflogItem
                    key={i}
                    entry={entry}
                    onSelect={() => onSelectCommit(entry.hash)}
                  />
                ))
            }
          </Section>

          {/* STASH */}
          <Section
            title="STASH"
            count={stashes.length}
            defaultOpen={false}
            onAdd={onCreateStash}
            addLabel="Créer un stash"
          >
            {stashes.length === 0
              ? <div className="sb-empty">Aucun stash</div>
              : stashes.map(s => (
                  <StashItem
                    key={s.index}
                    stash={s}
                    onApply={() => onApplyStash(s.index)}
                    onPop={() => onPopStash(s.index)}
                    onDrop={() => onDropStash(s.index)}
                    onPreview={onPreviewStash ? () => onPreviewStash(s.index, s.message) : undefined}
                  />
                ))
            }
          </Section>

        </div>
      )}

      {/* ── Empty state ── */}
      {!repoPath && (
        <div className="sb-no-repo">
          <button className="sb-open-btn" onClick={onOpenRepo}>Ouvrir un dépôt</button>
          <button className="sb-open-btn sb-clone-btn" onClick={onClone}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            Cloner depuis GitHub
          </button>
          {recentRepos.length > 0 && (
            <>
              <div className="sb-recents-title">RÉCENTS</div>
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
