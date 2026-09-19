// One branch row, and everything its menu offers.
import { useState } from 'react'
import { Icon } from '../Icon/Icon'
import { RowActionBar } from './RowActionBar'
import { branchRowActions } from './rowActions'
import { useRowClick } from './rowClick'
import ContextMenu, { MenuItemDef } from '../ContextMenu/ContextMenu'
import { buildBranchMenu } from '../ContextMenu/branchMenu'
import { branchTipExtras, type BranchTip, type BranchTipActions } from '../ContextMenu/branchTipMenu'
import type { PRIntent } from '../ContextMenu/prIntent'
import { issueRefLabel, type IssueRef as LinkedIssueRef } from '../../utils/issueRef'
import { useLang } from '../../i18n/LanguageContext'

// ── Branch item with context menu ────────────────────────────────
export interface BranchItemProps {
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
  hidden?: boolean
  favorite?: boolean
  issue?: LinkedIssueRef | null
  onPull?: () => void
  onToggleSolo?: () => void
  onToggleHide?: () => void
  onToggleFavorite?: () => void
  onOpenOnRemote?: () => void
  onAssociateIssue?: () => void
  /** The pull request this row offers, if any — see prIntentFor. */
  pr?: PRIntent | null
  onCreatePR?: (intent: PRIntent) => void
  /** `origin/x` when the remote holds this branch — gates the remote-side rows. */
  publishedAs?: string
  onCopyLink?: () => void
  onDeleteBoth?: () => void
  ahead?: number
  behind?: number
  gone?: boolean
  // Set when another remote also has a branch with this same short name —
  // disambiguates "main" vs "main" by showing "origin/main" / "archive/main"
  // instead of collapsing both to a bare "main".
  showRemotePrefix?: boolean
  /**
   * What the row reads as. The tree passes the last path segment, because the
   * folders above it already spell the rest. Everything else — the menu, the
   * ref, copy-name — keeps using the full name (#134).
   */
  displayAs?: string
  /** The two AI readings of this branch (#70 P1). */
  onExplain?: () => void
  onChangelog?: () => void
  /** One click: take the graph to this branch's tip (#275). */
  onReveal?: () => void
  /** Publish an unpublished branch — the sync act its state calls for (#274). */
  onPublish?: () => void
  /** Fetch this remote branch's own remote (#274). */
  onFetch?: () => void
  // ── What a branch needs, and what its tip can do (#280, #281, #282) ──
  onPullBranch?: () => void
  onChangeUpstream?: () => void
  onRebaseOntoUpstream?: () => void
  onSquashFixups?: () => void
  onHideRemote?: () => void
  onCompareUpstream?: () => void
  /** Its tip commit, so the row can offer what the tip's graph row offers. */
  tip?: BranchTip
  tipActions?: BranchTipActions
}

export function BranchItem({ name, current, remote, currentBranch, onCheckout, onDelete, onMerge, onRename, onCompare, onRebaseOnto, onPush, onDeleteRemote, onSetUpstream, soloed, hidden, favorite, issue, onPull, onToggleSolo, onToggleHide, onToggleFavorite, onOpenOnRemote, onAssociateIssue, onExplain, onChangelog, onReveal, onPublish, onFetch, onPullBranch, onChangeUpstream, onRebaseOntoUpstream, onSquashFixups, onHideRemote, onCompareUpstream, tip, tipActions, pr, onCreatePR, publishedAs, onCopyLink, onDeleteBoth, ahead = 0, behind = 0, gone = false, showRemotePrefix = false, displayAs }: BranchItemProps) {
  const [hover, setHover] = useState(false)
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const { t } = useLang()
  const fullDisplay = remote
    ? (showRemotePrefix ? name.replace(/^remotes\//, '') : name.replace(/^remotes\/[^/]+\//, ''))
    : name
  // The menu, the ref and copy-name all keep the full name; only what the eye
  // reads is shortened by the tree.
  const display = displayAs ?? fullDisplay

  // Same builder the toolbars use — right-click here and the ⋮ button up there
  // now offer the identical menu (v1.21.0).
  const menuItems: MenuItemDef[] = buildBranchMenu(
    { name, display: fullDisplay, current, remote: !!remote, pr: pr ?? undefined, publishedAs },
    { currentBranch, soloed, hidden, favorite, issue },
    {
      onCheckout: current ? undefined : onCheckout,
      onPull,
      onPush, onSetUpstream,
      onCreatePR: pr && onCreatePR ? () => onCreatePR(pr) : undefined,
      onMerge, onRebaseOnto, onCompare,
      onOpenOnRemote, onAssociateIssue, onToggleFavorite,
      onExplain, onChangelog,
      onToggleSolo, onToggleHide,
      onCopyName: () => navigator.clipboard.writeText(fullDisplay),
      onCopyLink,
      onRename, onDelete, onDeleteRemote, onDeleteBoth,
      onPullBranch, onChangeUpstream, onRebaseOntoUpstream, onSquashFixups,
      onHideRemote, onCompareUpstream,
    },
    t,
    // The tip's own actions, in the slots the graph fills from its row (#281).
    tip && tipActions ? branchTipExtras(tip, current, tipActions, t) : {}
  )

  // One click takes the graph to the tip, the double-click still switches —
  // and takes back the reveal the first press armed (#275).
  const click = useRowClick(onReveal, current ? undefined : onCheckout)

  // What this branch's own state calls for, of what the host actually wired.
  const actions = branchRowActions({ current, remote, ahead, behind, gone, publishedAs })

  return (
    <>
      <div
        className={`sb-branch-item ${current ? 'current' : ''} ${remote ? 'remote' : ''} ${hidden ? 'is-hidden' : ''} ${soloed ? 'soloed' : ''}`}
        onMouseDown={click.onMouseDown}
        onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={current ? t('sb.branch.currentTitle', name) : t('sb.branch.hint')}
      >
        <Icon name="branch" size={11} className="branch-icon" />
        <span className="sb-branch-name">{display}</span>
        {(ahead > 0 || behind > 0) && (
          <span className="sb-track" title={t('sb.branch.trackTitle', ahead, behind)}>
            {ahead > 0 && <span className="sb-track-ahead">↑{ahead}</span>}
            {behind > 0 && <span className="sb-track-behind">↓{behind}</span>}
          </span>
        )}
        {gone && <span className="sb-track sb-track-gone" title={t('sb.branch.goneTitle')}>✂</span>}
        {favorite && <span className="sb-branch-flag sb-branch-star" title={t('sb.branch.favoriteFlag')}>★</span>}
        {issue && (
          <span className="sb-branch-flag" title={issue.title || issueRefLabel(issue)}>{issueRefLabel(issue)}</span>
        )}
        {soloed && <Icon name="eye" size={12} className="sb-branch-flag" title={t('sb.branch.soloFlag')} />}
        {hidden && <span className="sb-branch-flag" title={t('sb.branch.hiddenFlag')}>⊘</span>}
        {current && (
          <Icon name="check" size={11} className="current-check" />
        )}
        {/* The commonest acts, on the row itself (#274) — the whole menu stays
            behind the kebab beside them. */}
        <RowActionBar actions={actions} t={t} label={fullDisplay}
          handlers={{
            switch: current ? undefined : () => { click.cancel(); onCheckout() },
            pull: onPull, push: onPush, publish: onPublish, fetch: onFetch,
          }} />
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
            <Icon name="kebab" size={12} />
          </button>
        )}
      </div>
      {ctx && menuItems.length > 0 && (
        <ContextMenu x={ctx.x} y={ctx.y} items={menuItems} onClose={() => setCtx(null)} />
      )}
    </>
  )
}
