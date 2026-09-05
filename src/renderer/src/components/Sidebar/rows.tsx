// One row of each of the other lists: a stash, a tag, a reflog entry, a remote, a submodule, a worktree.
import React, { useState, useRef } from 'react'
import { Icon } from '../Icon/Icon'
import ContextMenu, { MenuItemDef } from '../ContextMenu/ContextMenu'
import { useLang } from '../../i18n/LanguageContext'
import { type StashEntry, type TagEntry, type ReflogEntry, type RemoteEntry, type SubmoduleEntry, type WorktreeEntry, type AgentEntry } from './types'

// ── Stash item ────────────────────────────────────────────────────
export function StashItem({ stash, onApply, onPop, onDrop, onPreview, onRename, onExplain, hidden }: {
  stash: StashEntry
  onApply: () => void
  onPop: () => void
  onDrop: () => void
  onPreview?: () => void
  onRename?: () => void
  /** Reads it aloud — what work is parked here (#70 P1). */
  onExplain?: () => void
  /**
   * Dimmed, but with no row action to undo it: the entries of `git stash list`
   * are the reflog of a single ref, `refs/stash`, so git can take all of them
   * out of the graph or none. Hiding lives on the section, and offering it per
   * row would promise something git cannot do.
   */
  hidden?: boolean
}) {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const { t } = useLang()
  const label = stash.message.replace(/^stash@\{\d+\}: /, '')

  const menuItems: MenuItemDef[] = [
    ...(onPreview ? [{ label: t('sb.stash.preview'), action: onPreview }] : []),
    { label: t('sb.stash.applyKeep'), action: onApply },
    { label: t('sb.stash.applyPop'), action: onPop },
    ...(onRename ? [{ label: t('sb.stash.rename'), action: onRename }] : []),
    ...(onExplain ? [{ separator: true } as MenuItemDef, { label: t('sb.stash.explain'), action: onExplain, icon: 'ai', tone: 'ai' } as MenuItemDef] : []),
    { separator: true },
    { label: t('sb.delete'), action: onDrop, danger: true },
  ]

  return (
    <>
      <div
        className={`sb-stash-item${hidden ? ' is-hidden' : ''}`}
        onClick={onPreview}
        onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }}
        title={onPreview ? t('sb.stash.title', stash.message) : stash.message}
      >
        <Icon name="stash" size={11} className="stash-icon" />
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
export function TagItem({ tag, onGoTo, onCheckoutCommit, onDelete, onPush, onDeleteRemote, hidden, onToggleHide }: {
  tag: TagEntry
  /** Double-click: take me here, landing on a branch. Never detaches HEAD. */
  onGoTo?: () => void
  /** Menu only: check out the COMMIT the tag points at, detaching HEAD. */
  onCheckoutCommit?: () => void
  onDelete: () => void; onPush: () => void; onDeleteRemote: () => void
  hidden?: boolean
  onToggleHide?: () => void
}) {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const lastClickTime = useRef(0)
  const { t } = useLang()
  const menuItems: MenuItemDef[] = [
    // A tag is not a branch and cannot be checked out as one. What this does is
    // check out the commit it points at, which detaches HEAD — so the label
    // says commit, not tag, and it is the only entry in the sidebar that
    // detaches anything.
    ...(onCheckoutCommit ? [{ label: t('sb.tag.checkoutCommit'), action: onCheckoutCommit }] : []),
    { label: t('sb.copyName'), action: () => navigator.clipboard.writeText(tag.name) },
    { label: t('sb.tag.push'), action: onPush },
    ...(onToggleHide ? [{
      label: hidden ? t('sb.tag.show') : t('sb.tag.hide'),
      action: onToggleHide,
      checked: !!hidden,
    }] : []),
    { separator: true },
    { label: t('sb.tag.deleteLocal'), action: onDelete, danger: true },
    { label: t('sb.tag.deleteRemote'), action: onDeleteRemote, danger: true },
  ]

  // Same 400ms double-click detection as BranchItem. It used to check the tag
  // out and detach HEAD (v1.23.0); a double-click now means the same thing here
  // as everywhere else — land on a branch — so it offers to create one at the
  // tagged commit instead.
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!onGoTo) return
    const now = Date.now()
    if (now - lastClickTime.current < 400) {
      e.preventDefault()
      onGoTo()
      lastClickTime.current = 0
    } else {
      lastClickTime.current = now
    }
  }

  return (
    <>
      <div
        className={`sb-tag-item${hidden ? ' is-hidden' : ''}`}
        onMouseDown={handleMouseDown}
        onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }}
        title={onGoTo ? t('sb.tag.hint', tag.name, tag.hash) : `${tag.name} → ${tag.hash}`}
      >
        <Icon name="tag" size={13} className="sb-tag-icon" />
        <span className="sb-tag-name">{tag.name}</span>
        {hidden && <span className="sb-row-flag" title={t('sb.hidden.flag')}>⊘</span>}
        <code className="sb-tag-hash">{tag.hash}</code>
      </div>
      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} items={menuItems} onClose={() => setCtx(null)} />
      )}
    </>
  )
}

// ── Reflog item ───────────────────────────────────────────────────
export function ReflogItem({ entry, onSelect }: { entry: ReflogEntry; onSelect: () => void }) {
  return (
    <div className="sb-reflog-item" onClick={onSelect} title={`${entry.ref}: ${entry.message}`}>
      <Icon name="reflog" size={13} className="sb-reflog-icon" />
      <div className="sb-reflog-info">
        <span className="sb-reflog-ref">{entry.ref}</span>
        <span className="sb-reflog-msg">{entry.message}</span>
        <span className="sb-reflog-date">{entry.date}</span>
      </div>
    </div>
  )
}

// ── Remote item ───────────────────────────────────────────────────
export function RemoteItem({
  remote, isDefault, onSetDefault, onFetch, onPrune, onRename, onRemove, onCopyUrl, hidden, onToggleHide
}: {
  remote: RemoteEntry
  isDefault: boolean
  onSetDefault: () => void
  onFetch: () => void
  onPrune: () => void
  onRename: () => void
  onRemove: () => void
  onCopyUrl: () => void
  /** Hidden here means all of this remote's branches are out of the graph. */
  hidden?: boolean
  onToggleHide?: () => void
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
    ...(onToggleHide ? [{
      label: hidden ? t('sb.remote.show') : t('sb.remote.hide'),
      action: onToggleHide,
      checked: !!hidden,
    }] : []),
    { separator: true },
    { label: t('sb.delete'), action: onRemove, danger: true },
  ]

  return (
    <>
      <div
        className={`sb-remote-item${hidden ? ' is-hidden' : ''}`}
        onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }}
        title={remote.fetchUrl}
      >
        <Icon name="mail" size={11} className="remote-icon" />
        <div className="sb-remote-info">
          <span className="sb-remote-name">
            {remote.name}
            {isDefault && <span className="sb-remote-default" title={t('sb.remote.defaultFlag')}>{t('sb.remote.defaultBadge')}</span>}
            {hidden && <span className="sb-row-flag" title={t('sb.hidden.flag')}>⊘</span>}
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
export function SubmoduleItem({
  sub, onInit, onUpdate
}: {
  sub: SubmoduleEntry
  onInit: () => void
  onUpdate: () => void
}) {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const { t } = useLang()
  const statusColor = sub.status === 'ok' ? 'var(--success)' : sub.status === 'dirty' ? 'var(--attention)' : 'var(--text-disabled)'
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
export function WorktreeItem({ wt, agents = [], onOpen, onRemove }: {
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
        <span className="sb-sub-status" style={{ color: wt.isMain ? 'var(--success)' : 'var(--accent)' }}>
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
