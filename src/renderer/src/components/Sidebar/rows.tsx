// One row of each of the other lists: a stash, a tag, a reflog entry, a remote, a submodule, a worktree.
import { useState } from 'react'
import { Icon } from '../Icon/Icon'
import ContextMenu, { MenuItemDef } from '../ContextMenu/ContextMenu'
import { RowActionBar } from './RowActionBar'
import { stashRowActions, tagRowActions, remoteRowActions, worktreeRowActions } from './rowActions'
import { useRowClick } from './rowClick'
import { useLang } from '../../i18n/LanguageContext'
import { type StashEntry, type TagEntry, type ReflogEntry, type RemoteEntry, type SubmoduleEntry, type WorktreeEntry, type AgentEntry } from './types'

// ── Stash item ────────────────────────────────────────────────────
export function StashItem({ stash, onApply, onPop, onDrop, onPreview, onRename, onExplain, onReveal, onCompareHead, onCompareWorking, onSelectForCompare, onCopySha, onCopyPatch, hidden }: {
  stash: StashEntry
  onApply: () => void
  onPop: () => void
  onDrop: () => void
  onPreview?: () => void
  /**
   * One click: take the graph to this stash's commit (#275). The preview it
   * displaces is not lost — it keeps the menu's first entry and gains the
   * double-click, which is what every other row here means by two clicks.
   */
  onReveal?: () => void
  onRename?: () => void
  // ── A stash as a commit, which is what it is (#287) ──
  /** What this stash is against HEAD, and against the tree as it stands. */
  onCompareHead?: () => void
  onCompareWorking?: () => void
  /** Hold it as one end of a comparison, the way a graph row is held. */
  onSelectForCompare?: () => void
  /** Its sha — for EVERY stash, not only the one with a graph row. */
  onCopySha?: () => void
  onCopyPatch?: () => void
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
  // Without a reveal the row is what it was: one click, the preview.
  const click = useRowClick(onReveal, onReveal ? onPreview : undefined)

  // Every comparison and every copy names the stash by its OWN ref, so an
  // older stash is reached exactly like the newest — only `stash@{0}` ever had
  // a graph row, and that is what made the rest unreachable (#287).
  const compares: MenuItemDef[] = [
    ...(onCompareHead ? [{ label: t('sb.stash.compareHead'), action: onCompareHead }] : []),
    ...(onCompareWorking ? [{ label: t('sb.stash.compareWorking'), action: onCompareWorking }] : []),
    ...(onSelectForCompare ? [{ label: t('graph.menu.selectForCompare'), action: onSelectForCompare }] : []),
  ]
  const copies: MenuItemDef[] = [
    ...(onCopySha ? [{ label: t('graph.menu.copyFullHash'), action: onCopySha }] : []),
    { label: t('graph.menu.copyMessage'), action: () => navigator.clipboard.writeText(label) },
    ...(onCopyPatch ? [{ label: t('graph.menu.copyPatch'), action: onCopyPatch }] : []),
  ]
  const menuItems: MenuItemDef[] = [
    ...(onPreview ? [{ label: t('sb.stash.preview'), action: onPreview }] : []),
    { label: t('sb.stash.applyKeep'), action: onApply },
    { label: t('sb.stash.applyPop'), action: onPop },
    ...(onRename ? [{ label: t('sb.stash.rename'), action: onRename }] : []),
    ...(compares.length ? [{ separator: true } as MenuItemDef, { label: t('sb.branch.compareMenu'), submenu: compares } as MenuItemDef] : []),
    { label: t('sb.branch.copyMenu'), submenu: copies },
    ...(onExplain ? [{ separator: true } as MenuItemDef, { label: t('sb.stash.explain'), action: onExplain, icon: 'ai', tone: 'ai' } as MenuItemDef] : []),
    { separator: true },
    { label: t('sb.delete'), action: onDrop, danger: true },
  ]

  return (
    <>
      <div
        className={`sb-stash-item${hidden ? ' is-hidden' : ''}`}
        onMouseDown={onReveal ? click.onMouseDown : undefined}
        onClick={onReveal ? undefined : onPreview}
        onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }}
        title={onPreview ? t('sb.stash.title', stash.message) : stash.message}
      >
        <Icon name="stash" size={11} className="stash-icon" />
        <span className="sb-stash-label">{label}</span>
        <RowActionBar actions={stashRowActions()} t={t} label={label}
          handlers={{
            apply: () => { click.cancel(); onApply() },
            pop: () => { click.cancel(); onPop() },
            delete: () => { click.cancel(); onDrop() },
          }} />
        <span className="sb-stash-index">#{stash.index}</span>
      </div>
      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} items={menuItems} onClose={() => setCtx(null)} />
      )}
    </>
  )
}

// ── Tag item ──────────────────────────────────────────────────────
export function TagItem({ tag, onGoTo, onCheckoutCommit, onDelete, onPush, onDeleteRemote, onReveal, onOpenCard, hidden, onToggleHide, displayAs }: {
  tag: TagEntry
  /** Last path segment, when the tree already spells the folders (#276). */
  displayAs?: string
  /** Double-click: take me here, landing on a branch. Never detaches HEAD. */
  onGoTo?: () => void
  /** One click: take the graph to the commit this tag points at (#275). */
  onReveal?: () => void
  /** Open this tag's card — what the chip on its graph row opens. */
  onOpenCard?: () => void
  /** Menu only: check out the COMMIT the tag points at, detaching HEAD. */
  onCheckoutCommit?: () => void
  onDelete: () => void; onPush: () => void; onDeleteRemote: () => void
  hidden?: boolean
  onToggleHide?: () => void
}) {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
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

  // The double-click used to check the tag out and detach HEAD (v1.23.0); it
  // now means the same thing here as everywhere else — land on a branch — so
  // it offers to create one at the tagged commit instead. The single click
  // reveals the commit, and the double takes that reveal back (#275).
  const click = useRowClick(onReveal, onGoTo)

  return (
    <>
      <div
        className={`sb-tag-item${hidden ? ' is-hidden' : ''}`}
        onMouseDown={click.onMouseDown}
        onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }}
        title={onGoTo ? t('sb.tag.hint', tag.name, tag.hash) : `${tag.name} → ${tag.hash}`}
      >
        <Icon name="tag" size={13} className="sb-tag-icon" />
        <span className="sb-tag-name">{displayAs ?? tag.name}</span>
        {hidden && <span className="sb-row-flag" title={t('sb.hidden.flag')}>⊘</span>}
        <RowActionBar actions={tagRowActions()} t={t} label={tag.name}
          handlers={{
            card: onOpenCard && (() => { click.cancel(); onOpenCard() }),
            switch: onGoTo && (() => { click.cancel(); onGoTo() }),
          }} />
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
  remote, isDefault, onSetDefault, onFetch, onPrune, onRename, onRemove, onCopyUrl, onOpen, hidden, onToggleHide
}: {
  remote: RemoteEntry
  isDefault: boolean
  onSetDefault: () => void
  onFetch: () => void
  onPrune: () => void
  onRename: () => void
  onRemove: () => void
  onCopyUrl: () => void
  /** Open the remote where it lives — absent for a URL that is not a page. */
  onOpen?: () => void
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
    ...(onOpen ? [{ label: t('sb.remote.open'), action: onOpen }] : []),
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
        <RowActionBar actions={remoteRowActions()} t={t} label={remote.name}
          handlers={{ fetch: onFetch, open: onOpen }} />
      </div>
      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} items={menuItems} onClose={() => setCtx(null)} />
      )}
    </>
  )
}

// ── Submodule item ────────────────────────────────────────────────
export function SubmoduleItem({
  sub, onInit, onUpdate, onSync, onDeinit
}: {
  sub: SubmoduleEntry
  onInit: () => void
  onUpdate: () => void
  onSync: () => void
  onDeinit: () => void
}) {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const { t } = useLang()
  const statusColor = sub.status === 'ok' ? 'var(--success)' : sub.status === 'dirty' ? 'var(--attention)' : 'var(--text-disabled)'
  const statusLabel = sub.status === 'ok' ? '✓' : sub.status === 'dirty' ? '~' : '○'

  const menuItems: MenuItemDef[] = [
    ...(sub.status === 'uninitialized' ? [{ label: t('sb.sub.init'), action: onInit }] : []),
    { label: t('sb.sub.update'), action: onUpdate },
    // Only where they mean something: there is no URL to re-read into a
    // submodule that was never checked out, and nothing to empty either.
    ...(sub.status === 'uninitialized' ? [] : [
      { label: t('sb.sub.sync'), action: onSync },
      { separator: true as const },
      { label: t('sb.sub.deinit'), action: onDeinit, danger: true },
    ]),
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
export function WorktreeItem({ wt, agents = [], active = false, onOpen, onRemove, onReveal, onOpenTerminal, onRevealInFileManager, onToggleLock, onCopyChanges }: {
  wt: WorktreeEntry
  // Running AI agents whose cwd is inside this worktree
  agents?: AgentEntry[]
  /** The worktree this window is showing — it has nothing to open. */
  active?: boolean
  onOpen: () => void
  onRemove: () => void
  /**
   * One click: the graph goes to what this worktree is at (#275) — the
   * working changes for the one on screen, its HEAD for any other, whose
   * changes this graph cannot show.
   */
  onReveal?: () => void
  // ── What a worktree is, beside a path (#285) ──
  onOpenTerminal?: () => void
  onRevealInFileManager?: () => void
  onToggleLock?: () => void
  /** Move what is uncommitted here into another worktree. */
  onCopyChanges?: () => void
}) {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const { t } = useLang()
  const name = wt.path.split('/').pop() || wt.path
  const click = useRowClick(onReveal, onReveal ? onOpen : undefined)
  const menuItems: MenuItemDef[] = [
    // The one on screen is already open; everything else still applies to it.
    ...(active ? [] : [{ label: t('sb.wt.open'), action: onOpen }]),
    ...(onRevealInFileManager ? [{ label: t('sb.wt.reveal'), action: onRevealInFileManager }] : []),
    ...(onOpenTerminal ? [{ label: t('sb.wt.terminal'), action: onOpenTerminal }] : []),
    { label: t('sb.wt.copyPath'), action: () => navigator.clipboard.writeText(wt.path) },
    ...(onCopyChanges ? [{ label: t('sb.wt.copyChanges'), action: onCopyChanges }] : []),
    // A lock is what stops git pruning or moving a worktree on a drive that
    // comes and goes — it was read from the list and never shown (#285).
    ...(onToggleLock ? [{
      label: wt.locked ? t('sb.wt.unlock') : t('sb.wt.lock'),
      action: onToggleLock,
      checked: !!wt.locked,
    }] : []),
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
        onMouseDown={onReveal ? click.onMouseDown : undefined}
        onClick={onReveal ? undefined : onOpen}
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
            {/* Where this worktree stands, in the marks the rest of the panel
                already uses for the same facts (#285). */}
            {active && <span className="sb-wt-flag sb-wt-flag--active" title={t('sb.wt.activeFlag')}>{t('sb.wt.activeBadge')}</span>}
            {wt.locked && <span className="sb-wt-flag" title={wt.lockReason ? t('sb.wt.lockedWhy', wt.lockReason) : t('sb.wt.lockedFlag')}>🔒</span>}
            {wt.prunable && <span className="sb-wt-flag sb-wt-flag--gone" title={t('sb.wt.prunableFlag')}>✂</span>}
            {wt.dirty && <span className="sb-wt-flag sb-wt-flag--dirty" title={t('sb.wt.dirtyFlag')}>●</span>}
            {(wt.ahead || wt.behind) ? (
              <span className="sb-track" title={t('sb.branch.trackTitle', wt.ahead ?? 0, wt.behind ?? 0)}>
                {!!wt.ahead && <span className="sb-track-ahead">↑{wt.ahead}</span>}
                {!!wt.behind && <span className="sb-track-behind">↓{wt.behind}</span>}
              </span>
            ) : null}
            {agentSummary.map(([agentName, count]) => (
              <span key={agentName} className="sb-agent-badge">
                <span className="sb-agent-dot" />
                {count > 1 ? `${count}× ` : ''}{agentName}
              </span>
            ))}
          </span>
          <span className="sb-sub-url">{wt.path}</span>
        </div>
        <RowActionBar actions={worktreeRowActions({ active })} t={t} label={name}
          handlers={{ open: () => { click.cancel(); onOpen() } }} />
      </div>
      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} items={menuItems} onClose={() => setCtx(null)} />
      )}
    </>
  )
}
