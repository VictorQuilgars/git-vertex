// The same branch actions are offered by local branch rows and worktree rows.
import type { BranchInfo } from '../../types'
import type { BranchItemProps } from './BranchItem'
import type { SidebarState } from './useSidebar'
import { publishedNameFor } from '../ContextMenu/branchRefs'

export function localBranchProps(s: SidebarState, b: BranchInfo): BranchItemProps {
  const { currentBranch, branches, onReveal, onOpenCard, onDeleteBranch, onMergeBranch, onRenameBranch, onRebaseOnto, onPushBranch, onDeleteRemoteBranch, onSetUpstream, onExplainBranch, onBranchChangelog, onGoTo, onCompareBranch, soloBranch, onToggleSolo, onToggleHide, onPull, isFavorite, issueFor, onToggleFavorite, onOpenBranchOnRemote, onAssociateIssue, prIntentFor, onCreatePR, onCopyBranchLink, onDeleteBranchBoth, onRebaseOntoUpstream, onCompareUpstream, tipActions, mergeTarget, handlePullBranchRow, handleChangeUpstreamRow, handleSquashFixupsRow, worktreeOf, handleCreateWorktreeFor, onSetRepo, branchHidden } = s
  return {
    name: b.name,
    current: b.current,
    currentBranch,
    onCheckout: () => !b.current && onGoTo(b.name),
    onDelete: () => onDeleteBranch(b.name),
    onMerge: () => onMergeBranch(b.name),
    onRename: () => onRenameBranch(b.name),
    onCompare: !b.current ? () => onCompareBranch(b.name) : undefined,
    onRebaseOnto: !b.current ? () => onRebaseOnto(b.name) : undefined,
    onPush: () => onPushBranch(b.name),
    onPublish: () => onPushBranch(b.name),
    onSetUpstream: () => onSetUpstream(b.name),
    onPull: b.current ? onPull : undefined,
    onReveal: onReveal && (() => onReveal(b.name)),
    onOpenCard: onOpenCard && (() => onOpenCard(b.name, 'head')),
    onPullBranch: !b.current && b.upstream ? () => handlePullBranchRow(b.name) : undefined,
    onChangeUpstream: () => handleChangeUpstreamRow(b.name),
    onRebaseOntoUpstream: b.current && b.upstream && onRebaseOntoUpstream
      ? () => onRebaseOntoUpstream(b.upstream!) : undefined,
    onSquashFixups: b.current && (b.upstream || mergeTarget?.name)
      ? () => handleSquashFixupsRow(b.upstream ?? mergeTarget!.name) : undefined,
    onCompareUpstream: b.upstream && onCompareUpstream
      ? () => onCompareUpstream(b.name, b.upstream!) : undefined,
    tip: { ref: b.name, hash: b.commit, subject: b.label },
    tipActions,
    checkedOutIn: worktreeOf(b.name),
    onOpenItsWorktree: (() => {
      const held = worktreeOf(b.name)
      return held ? () => onSetRepo(held.path) : undefined
    })(),
    onCreateWorktreeFor: () => handleCreateWorktreeFor(b.name),
    soloed: soloBranch === b.name,
    hidden: branchHidden(b),
    onToggleSolo: () => onToggleSolo(b.name),
    onToggleHide: () => onToggleHide(b.name),
    favorite: isFavorite?.(b.name),
    issue: issueFor?.(b.name),
    onToggleFavorite: onToggleFavorite && (() => onToggleFavorite(b.name)),
    onOpenOnRemote: onOpenBranchOnRemote && (() => onOpenBranchOnRemote(b.name)),
    onAssociateIssue: onAssociateIssue && (() => onAssociateIssue(b.name)),
    onExplain: onExplainBranch && (() => onExplainBranch(b.name)),
    onChangelog: onBranchChangelog && (() => onBranchChangelog(b.name)),
    pr: prIntentFor?.(b.name),
    onCreatePR,
    publishedAs: publishedNameFor(b.name, branches) ?? undefined,
    onCopyLink: onCopyBranchLink && (() => onCopyBranchLink(b.name)),
    onDeleteRemote: () => {
      const published = publishedNameFor(b.name, branches)
      if (published) onDeleteRemoteBranch(`remotes/${published}`)
    },
    onDeleteBoth: onDeleteBranchBoth && (() => {
      const published = publishedNameFor(b.name, branches)
      if (published) onDeleteBranchBoth(b.name, published)
    }),
    ahead: b.ahead,
    behind: b.behind,
    gone: b.gone,
  }
}
