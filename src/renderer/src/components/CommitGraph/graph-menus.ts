// Every menu the graph opens — on a commit, on a batch of commits, on a branch chip, on a
// dropped branch, on the header — built from the callbacks the host provides. What a right
// click offers is decided here and nowhere else; the graph only draws what this returns.
import React, { useCallback } from 'react'
import { MenuItemDef } from '../ContextMenu/ContextMenu'
import { useLang } from '../../i18n/LanguageContext'
import { LayoutCommit } from './graph-layout'
import { WIP_HASH, type ProcessedRef, processRefs } from './graph-parts'
import type { CommitGraphProps, CtxState, DropState } from './CommitGraph'

export interface GraphMenuContext {
  t: ReturnType<typeof useLang>['t']
  set: (key: string, value: string) => void
  showAvatars: boolean
  showAuthor: boolean
  showDate: boolean
  showSha: boolean
  showStats: boolean
  compactColumns: boolean
  drop: DropState | null
  displayLayout: LayoutCommit[]
  multiSel: Set<string>
  setMultiSel: React.Dispatch<React.SetStateAction<Set<string>>>
  setCtx: React.Dispatch<React.SetStateAction<CtxState | null>>
  localBranchAt: (hash: string, exclude: string) => string | null
}

export function useGraphMenus(props: CommitGraphProps, ctx: GraphMenuContext) {
  const {
    currentBranch, onCherryPick, onRevert, onReset, onCreateTag, onCreateBranchAt, onCheckoutBranch, onInteractiveRebase, onCheckoutCommit, onRewordCommit, onCompareWorking, onSelectForCompare, onCompareWithSelected, compareBaseHash, onDropCommit, onMoveCommit, onBranchDrop, onCherryPickMany, onDropCommits, onMergeBranch, onRebaseCurrentOnto, onRenameBranch, onDeleteBranch, onPushBranch, onSetUpstream, prIntentFor, onCreatePR, branchMenuItems, onCopyCommitLink, onCreateAnnotatedTag, onDeleteRemoteBranch, onPushTag, onDeleteTag, onDeleteRemoteTag, onRebaseCurrentOntoCommit, onPushToCommit, onCreatePatch, onCopyPatch, onSharePatch, onCreateWorktreeAt, onOpenCommitOnRemote, nativeContextMenu = false, onNativeMenuTarget,
  } = props
  const { t, set, showAvatars, showAuthor, showDate, showSha, showStats, compactColumns, displayLayout, multiSel, setMultiSel, setCtx, localBranchAt } = ctx

  // The "start a Pull Request" row, pointing whichever way prIntentFor decided
  // — from this branch, or into it, depending on where you are standing.
  // No `isCurrent`: which way the row points is prIntentFor's decision, and has
  // been since it took it over. The argument was still being passed at three
  // call sites and read at none.
  const prRow = useCallback((branchRef: string): MenuItemDef | null => {
    if (!prIntentFor || !onCreatePR) return null
    const intent = prIntentFor(branchRef)
    if (!intent) return null
    // Same rule as branchMenu.ts, and the same wording: a push is promised only
    // when one is needed, both ends are named whenever the base is known, and
    // the head reads as its remote ref only when there is nothing left to push.
    const from = intent.needsPush ? intent.head : intent.headLabel
    return {
      label: intent.needsPush
        ? (intent.baseLabel ? t('sb.branch.startPRTo', from, intent.baseLabel) : t('sb.branch.startPR', from))
        : (intent.baseLabel ? t('sb.branch.openPRTo', from, intent.baseLabel) : t('sb.branch.openPR', from)),
      action: () => onCreatePR(intent),
    }
  }, [prIntentFor, onCreatePR, t])
  // Branch operations for a local branch, shared by the branch chip and the
  // menu of the commit that is its tip — so both offer the exact same actions
  // (right-clicking a branch name == its tip commit).
  const branchActionItems = useCallback((name: string, isHead: boolean, display: string): MenuItemDef[] => {
    // Same deal as the chip menu: when the host can build the full branch menu,
    // the tip commit leads with all of it rather than the few actions this
    // component was handed props for.
    if (branchMenuItems) return branchMenuItems({ name, display, current: isHead, remote: false })

    const items: MenuItemDef[] = []
    if (!isHead && onCheckoutBranch) items.push({ label: `✓ Checkout "${display}"`, action: () => onCheckoutBranch(name) })
    if (!isHead && onMergeBranch && currentBranch) items.push({ label: t('graph.menu.mergeBranchInto', display, currentBranch), action: () => onMergeBranch(name) })
    if (!isHead && onRebaseCurrentOnto && currentBranch) items.push({ label: t('graph.menu.rebaseCurrentOnDisplay', currentBranch, display), action: () => onRebaseCurrentOnto(name) })
    if (onRenameBranch) items.push({ label: t('graph.menu.renameBranchNamed', display), action: () => onRenameBranch(name) })
    if (!isHead && onDeleteBranch) items.push({ label: t('graph.menu.deleteBranchNamed', display), action: () => onDeleteBranch(name), danger: true })
    if (onPushBranch) items.push({ label: t('graph.menu.pushBranch'), action: () => onPushBranch(name) })
    if (onSetUpstream) items.push({ label: t('graph.menu.setUpstream'), action: () => onSetUpstream(name) })
    const pr = prRow(name)
    if (pr) items.push(pr)
    items.push({ label: t('graph.menu.copyBranchName'), action: () => navigator.clipboard.writeText(name) })
    return items
  }, [branchMenuItems, onCheckoutBranch, onMergeBranch, onRebaseCurrentOnto, onRenameBranch, onDeleteBranch, onPushBranch, onSetUpstream, prRow, currentBranch])
  const buildMenuItems = useCallback((commit: LayoutCommit, branchName?: string): MenuItemDef[] => {
    const isHead = commit.refs.some(r => r.includes('HEAD ->') && r.includes(currentBranch))
    // If this commit carries a local branch (clicked explicitly, or its tip),
    // lead with that branch's actions so the menu matches the branch chip's.
    const bp = processRefs(commit.refs).find(r =>
      (r.cls === 'rc-local' || r.cls === 'rc-head') && r.branchName &&
      (branchName ? r.branchName === branchName : true))
    // A root commit (no parents) can only be reworded when it's HEAD (plain
    // amend) — rewording it elsewhere in history would need `rebase --root`,
    // which isn't supported by the targeted mini-rebase this menu uses.
    const canReword = isHead || commit.parents.length > 0
    const onBranchTip = !!bp?.branchName

    // ── What you can make out of this commit ──
    const create: MenuItemDef[] = []
    // Detaching HEAD onto the commit the current branch already points at gets
    // you nowhere, so the row only shows up somewhere it would move you.
    if (!isHead) create.push({ label: t('graph.menu.checkout'), action: () => onCheckoutCommit?.(commit.hash) })
    create.push(
      { label: t('graph.menu.createBranch'), action: () => onCreateBranchAt(commit.hash) },
      { label: t('graph.menu.createTag'), action: () => onCreateTag(commit.hash) },
    )
    if (onCreateAnnotatedTag) create.push({ label: t('graph.menu.createAnnotatedTag'), action: () => onCreateAnnotatedTag(commit.hash) })
    if (onCreateWorktreeAt) create.push({ label: t('graph.menu.createWorktree'), action: () => onCreateWorktreeAt(commit.hash) })

    // ── What you can do to the history around it ──
    const rewrite: MenuItemDef[] = [
      { label: t('graph.menu.interactiveRebase'), action: () => onInteractiveRebase?.(commit.hash) },
    ]
    // On a branch tip this is the same operation the branch block already
    // offers as "Rebase <current> onto this" — one row, not two.
    if (onRebaseCurrentOntoCommit && !isHead && !onBranchTip) {
      rewrite.push({ label: t('graph.menu.rebaseOntoCommit'), action: () => onRebaseCurrentOntoCommit(commit.hash) })
    }
    rewrite.push(
      { label: t('graph.menu.reword'), action: () => onRewordCommit?.(commit.hash), disabled: !canReword },
    )
    // Cherry-picking the commit you are already on is a no-op, and a row that is
    // permanently greyed out on your own branch is just a row in the way.
    if (!isHead) rewrite.push({ label: t('graph.menu.cherryPick'), action: () => onCherryPick(commit.hash) })
    rewrite.push(
      { label: t('graph.menu.revert'), action: () => onRevert(commit.hash) },
      { label: t('graph.menu.dropCommit'), action: () => onDropCommit?.(commit.hash), danger: true },
      { label: t('graph.menu.move'), submenu: [
        { label: t('graph.menu.moveUp'), action: () => onMoveCommit?.(commit.hash, 'up') },
        { label: t('graph.menu.moveDown'), action: () => onMoveCommit?.(commit.hash, 'down') },
      ] },
      { label: t('graph.menu.reset'), submenu: [
        { label: t('graph.menu.resetSoft'), action: () => onReset(commit.hash, 'soft') },
        { label: t('graph.menu.resetMixed'), action: () => onReset(commit.hash, 'mixed') },
        { label: t('graph.menu.resetHard'), action: () => onReset(commit.hash, 'hard'), danger: true },
      ] },
    )
    if (onPushToCommit) rewrite.push({ label: t('graph.menu.pushToCommit'), action: () => onPushToCommit(commit.hash) })

    // ── Ways of looking at it, which the branch menu merges with its own ──
    const openRemote: MenuItemDef[] = onOpenCommitOnRemote
      ? [{ label: t('graph.menu.openOnRemote'), action: () => onOpenCommitOnRemote(commit.hash) }]
      : []
    const copy: MenuItemDef[] = [
      { label: t('graph.menu.copyShortHash'), action: () => navigator.clipboard.writeText(commit.shortHash) },
      { label: t('graph.menu.copyFullHash'), action: () => navigator.clipboard.writeText(commit.hash) },
      { label: t('graph.menu.copyMessage'), action: () => navigator.clipboard.writeText(commit.message) },
    ]
    if (onCopyCommitLink) copy.push({ label: t('graph.menu.copyCommitLink'), action: () => onCopyCommitLink(commit.hash) })
    const compare: MenuItemDef[] = []
    if (onCompareWorking) compare.push({ label: t('graph.menu.compareWorking'), action: () => onCompareWorking(commit.hash) })
    if (onSelectForCompare) compare.push({ label: t('graph.menu.selectForCompare'), action: () => onSelectForCompare(commit.hash) })
    if (onCompareWithSelected && compareBaseHash) {
      compare.push({ label: t('graph.menu.compareWithSelected'), action: () => onCompareWithSelected(commit.hash), disabled: compareBaseHash === commit.hash })
    }
    const exports: MenuItemDef[] = []
    if (onCreatePatch) exports.push({ label: t('graph.menu.createPatch'), action: () => onCreatePatch(commit.hash) })
    if (onCopyPatch) exports.push({ label: t('graph.menu.copyPatch'), action: () => onCopyPatch(commit.hash) })
    if (onSharePatch) exports.push({ label: t('graph.menu.sharePatch'), action: () => onSharePatch(commit.hash) })

    // On a branch tip the branch menu owns the layout and slots these in, so
    // "copy" and "open on remote" appear once each rather than once per subject.
    if (onBranchTip && branchMenuItems) {
      return branchMenuItems(
        { name: bp!.branchName!, display: bp!.display, current: !!bp!.isHead, remote: false },
        { commit: [...create, { separator: true }, ...rewrite], openRemote, copy, compare, exports }
      )
    }

    const items: MenuItemDef[] = bp?.branchName
      ? [...branchActionItems(bp.branchName, !!bp.isHead, bp.display), { separator: true }]
      : []
    items.push(...create, { separator: true }, ...rewrite, { separator: true }, ...openRemote)
    items.push({ label: t('sb.branch.copyMenu'), submenu: copy })
    if (compare.length) items.push({ label: t('sb.branch.compareMenu'), submenu: compare })
    if (exports.length) items.push({ label: t('graph.menu.patchMenu'), submenu: exports })
    return items
  }, [currentBranch, onCherryPick, onRevert, onReset, onCreateTag, onCreateBranchAt, onInteractiveRebase,
      onCheckoutCommit, onRewordCommit, onCompareWorking, onSelectForCompare, onCompareWithSelected,
      compareBaseHash, onDropCommit, onMoveCommit, onRebaseCurrentOntoCommit, onPushToCommit,
      onCreatePatch, onCopyPatch, onSharePatch, onCreateWorktreeAt, onOpenCommitOnRemote,
      onCopyCommitLink, onCreateAnnotatedTag, t, branchActionItems, branchMenuItems])
  // The batch menu (#69): what makes sense for N commits at once, and only
  // that — cherry-pick and drop read OLDEST FIRST (history order, what a
  // pick sequence means), the copies read as displayed (newest first, what
  // the eye just scanned).
  const batchMenuItems = useCallback((): MenuItemDef[] => {
    const asShown = displayLayout.filter(c => multiSel.has(c.hash))
    const oldestFirst = [...asShown].sort((a, b) => b.row - a.row)
    const hashes = oldestFirst.map(c => c.hash)
    const n = hashes.length
    const items: MenuItemDef[] = [
      { label: t('graph.multi.count', n), disabled: true },
      { separator: true },
    ]
    if (onCherryPickMany) {
      items.push({ label: t('graph.multi.cherryPick', n), action: () => { setMultiSel(new Set()); onCherryPickMany(hashes) } })
    }
    if (onDropCommits) {
      items.push({ label: t('graph.multi.drop', n), action: () => { setMultiSel(new Set()); onDropCommits(hashes) }, danger: true })
    }
    items.push({ separator: true })
    if (onOpenCommitOnRemote) {
      items.push({ label: t('graph.multi.openOnRemote', n), action: () => asShown.forEach(c => onOpenCommitOnRemote(c.hash)) })
    }
    items.push(
      { label: t('graph.multi.copyHashes', n), action: () => navigator.clipboard.writeText(asShown.map(c => c.hash).join('\n')) },
      { label: t('graph.multi.copyMessages', n), action: () => navigator.clipboard.writeText(asShown.map(c => c.message).join('\n')) },
    )
    return items
  }, [displayLayout, multiSel, onCherryPickMany, onDropCommits, onOpenCommitOnRemote, t])
  const handleRowContextMenu = useCallback((e: React.MouseEvent, commit: LayoutCommit) => {
    if (commit.hash === WIP_HASH) return
    // A right-click on a row IN the set opens the batch menu — ours on both
    // products: the native menu's contributions are declared per single
    // commit, and a selection is a renderer fact it cannot see.
    if (multiSel.size >= 2 && multiSel.has(commit.hash)) {
      e.preventDefault()
      e.stopPropagation()
      setCtx({ x: e.clientX, y: e.clientY, commit, batch: true })
      return
    }
    // Outside the set, the set is over — the menu that opens is the row's.
    if (multiSel.size) setMultiSel(new Set())
    if (nativeContextMenu) { onNativeMenuTarget?.(commit.hash); return }
    e.preventDefault()
    e.stopPropagation()
    setCtx({ x: e.clientX, y: e.clientY, commit })
  }, [nativeContextMenu, onNativeMenuTarget, multiSel])
  const buildDropItems = useCallback((d: DropState): MenuItemDef[] => {
    const target = localBranchAt(d.hash, d.branch)
    if (target) {
      // Dropped on a branch tip → merge/rebase the dragged branch INTO/ONTO it.
      return [
        { label: t('graph.drop.mergeBranch', d.branch, target), action: () => onBranchDrop?.(d.branch, d.hash, 'merge', target) },
        { label: t('graph.drop.rebaseBranch', d.branch, target), action: () => onBranchDrop?.(d.branch, d.hash, 'rebase', target) },
        { label: t('graph.drop.resetBranch', d.branch, target), action: () => onBranchDrop?.(d.branch, d.hash, 'reset', target), danger: true },
      ]
    }
    // Dropped on a bare commit — no branch to merge into.
    const short = d.hash.slice(0, 7)
    return [
      { label: t('graph.drop.rebase', d.branch, short), action: () => onBranchDrop?.(d.branch, d.hash, 'rebase') },
      { label: t('graph.drop.reset', d.branch, short), action: () => onBranchDrop?.(d.branch, d.hash, 'reset'), danger: true },
    ]
  }, [onBranchDrop, t, localBranchAt])
  // Right-click menu on a branch/tag chip. Only actions whose handler was
  // provided are shown, so each host (desktop / VS Code) opts in independently.
  const buildBranchMenu = useCallback((pref: ProcessedRef): MenuItemDef[] => {
    const items: MenuItemDef[] = []
    const name = pref.branchName

    if (pref.cls === 'rc-tag') {
      const tag = pref.display
      items.push({ label: t('graph.menu.copyName'), action: () => navigator.clipboard.writeText(tag) })
      if (onPushTag) items.push({ label: t('graph.menu.pushTag'), action: () => onPushTag(tag) })
      if (onDeleteTag || onDeleteRemoteTag) items.push({ separator: true })
      if (onDeleteTag) items.push({ label: t('graph.menu.deleteTagLocal'), action: () => onDeleteTag(tag), danger: true })
      if (onDeleteRemoteTag) items.push({ label: t('graph.menu.deleteTagRemote'), action: () => onDeleteRemoteTag(tag), danger: true })
      return items
    }

    if (!name) return items

    // A host that can assemble the whole branch menu (the desktop app) hands it
    // over — the chip then offers exactly what the sidebar row does instead of
    // the handful of actions this component happens to have props for.
    if (branchMenuItems) {
      return branchMenuItems({
        name,
        display: pref.display,
        current: !!pref.isHead,
        remote: pref.cls === 'rc-remote',
      })
    }

    if (pref.cls === 'rc-remote') {
      if (onCheckoutBranch) items.push({ label: '✓ Checkout', action: () => onCheckoutBranch(name) })
      const remotePr = prRow(name)
      if (remotePr) items.push(remotePr)
      if (onDeleteRemoteBranch) items.push({ label: t('graph.menu.deleteRemoteBranch'), action: () => onDeleteRemoteBranch(name), danger: true })
      items.push({ label: t('graph.menu.copyName'), action: () => navigator.clipboard.writeText(pref.display) })
      return items
    }

    // Local or current (head) branch
    if (!pref.isHead && onCheckoutBranch) items.push({ label: '✓ Checkout', action: () => onCheckoutBranch(name) })
    if (!pref.isHead && onMergeBranch && currentBranch) items.push({ label: t('graph.menu.mergeIntoSimple', currentBranch), action: () => onMergeBranch(name) })
    if (!pref.isHead && onRebaseCurrentOnto && currentBranch) items.push({ label: t('graph.menu.rebaseCurrentOntoSimple', currentBranch, pref.display), action: () => onRebaseCurrentOnto(name) })
    if (items.length) items.push({ separator: true })
    if (onPushBranch) items.push({ label: '⬆ Push', action: () => onPushBranch(name) })
    if (onSetUpstream) items.push({ label: t('graph.menu.setUpstream'), action: () => onSetUpstream(name) })
    const localPr = prRow(name)
    if (localPr) items.push(localPr)
    if (onRenameBranch) items.push({ label: t('graph.menu.rename'), action: () => onRenameBranch(name) })
    items.push({ label: t('graph.menu.copyName'), action: () => navigator.clipboard.writeText(name) })
    if (!pref.isHead && onDeleteBranch) {
      items.push({ separator: true })
      items.push({ label: t('graph.menu.delete'), action: () => onDeleteBranch(name), danger: true })
    }
    return items
  }, [currentBranch, branchMenuItems, onCheckoutBranch, onMergeBranch, onRebaseCurrentOnto, onPushBranch,
      onSetUpstream, prRow, onRenameBranch, onDeleteBranch, onDeleteRemoteBranch,
      onPushTag, onDeleteTag, onDeleteRemoteTag])
  // Right-click on the header bar — choose which columns show.
  const buildHeaderMenuItems = useCallback((): MenuItemDef[] => [
    { label: t('graph.col.avatars'), checked: showAvatars, action: () => set('graphShowAvatars', showAvatars ? 'false' : 'true') },
    { label: t('graph.col.author'), checked: showAuthor, action: () => set('graphShowAuthor', showAuthor ? 'false' : 'true') },
    { label: t('graph.col.date'), checked: showDate, action: () => set('graphShowDate', showDate ? 'false' : 'true') },
    { label: 'SHA', checked: showSha, action: () => set('graphShowSha', showSha ? 'false' : 'true') },
    { label: t('graph.col.stats'), checked: showStats, action: () => set('graphShowStats', showStats ? 'false' : 'true') },
    { separator: true },
    { label: t('graph.menu.compactCols'), checked: compactColumns, action: () => set('graphCompactColumns', compactColumns ? 'false' : 'true') },
    { separator: true },
    { label: t('graph.menu.resetCols'), action: () => {
      set('graphShowAvatars', 'true')
      set('graphShowAuthor', 'true')
      set('graphShowDate', 'true')
      set('graphShowSha', 'true')
      set('graphShowStats', 'true')
      set('graphCompactColumns', 'false')
    } },
  ], [showAvatars, showAuthor, showDate, showSha, showStats, compactColumns, set])

  return { buildMenuItems, batchMenuItems, buildDropItems, buildBranchMenu, buildHeaderMenuItems, handleRowContextMenu }
}
