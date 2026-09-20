/**
 * What a branch's TIP COMMIT can do, offered from the branch's own row (#281).
 *
 * All of this existed already — on the graph row the branch happens to point
 * at. Reaching it meant finding that row first, which is the one thing a side
 * bar row is supposed to save you: the `+` on the Branches header always
 * branched from HEAD, and creating a branch from `origin/release` meant going
 * to the graph, finding its tip and right-clicking there.
 *
 * So the rows are built here, from the same `extras` slots the graph fills —
 * `buildBranchMenu` then merges them into the same blocks, and "copy" is one
 * place in the menu whichever surface opened it, rather than two.
 *
 * Pure, and given a tip rather than asked for one: a side bar row already
 * carries its branch's tip and subject (`BranchInfo.commit` / `.label`).
 */
import type { MenuItemDef } from './ContextMenu'
import type { BranchMenuExtras } from './branchMenu'

export interface BranchTip {
  /** The branch as git names it — `feat/x`, `remotes/origin/x`. */
  ref: string
  /** Its tip, short or full: what the host's handlers are given. */
  hash: string
  /** The tip's subject, for *Copy message*. */
  subject?: string
}

export interface BranchTipActions {
  onCreateBranchAt?: (hash: string) => void
  onCreateTag?: (hash: string) => void
  onCreateWorktreeAt?: (hash: string) => void
  onReset?: (hash: string, mode: 'soft' | 'mixed' | 'hard') => void
  onCompareWorking?: (hash: string) => void
  onSelectForCompare?: (hash: string) => void
  onCompareWithSelected?: (hash: string) => void
  /** Copies the full sha, which a row only carries in its short form. */
  onCopyFullHash?: (ref: string) => void
  /** What is already selected for a comparison, if anything. */
  compareBaseHash?: string | null
}

type T = (key: any, ...args: any[]) => string

/**
 * The extras a branch row contributes, in the slots `buildBranchMenu` merges.
 *
 * `current` decides one thing only: resetting the branch you are standing on
 * to its own tip is a no-op, so that row is not drawn there.
 */
export function branchTipExtras(
  tip: BranchTip,
  current: boolean,
  actions: BranchTipActions,
  t: T,
): BranchMenuExtras {
  const create: MenuItemDef[] = []
  if (actions.onCreateBranchAt) create.push({ label: t('graph.menu.createBranch'), action: () => actions.onCreateBranchAt!(tip.hash) })
  if (actions.onCreateTag) create.push({ label: t('graph.menu.createTag'), action: () => actions.onCreateTag!(tip.hash) })
  if (actions.onCreateWorktreeAt) create.push({ label: t('graph.menu.createWorktree'), action: () => actions.onCreateWorktreeAt!(tip.hash) })
  if (!current && actions.onReset) {
    create.push({ label: t('graph.menu.reset'), submenu: [
      { label: t('graph.menu.resetSoft'), action: () => actions.onReset!(tip.hash, 'soft') },
      { label: t('graph.menu.resetMixed'), action: () => actions.onReset!(tip.hash, 'mixed') },
      { label: t('graph.menu.resetHard'), action: () => actions.onReset!(tip.hash, 'hard'), danger: true },
    ] })
  }

  const copy: MenuItemDef[] = [
    { label: t('graph.menu.copyShortHash'), action: () => navigator.clipboard.writeText(tip.hash) },
  ]
  if (actions.onCopyFullHash) copy.push({ label: t('graph.menu.copyFullHash'), action: () => actions.onCopyFullHash!(tip.ref) })
  if (tip.subject) copy.push({ label: t('graph.menu.copyMessage'), action: () => navigator.clipboard.writeText(tip.subject!) })

  const compare: MenuItemDef[] = []
  if (actions.onCompareWorking) compare.push({ label: t('graph.menu.compareWorking'), action: () => actions.onCompareWorking!(tip.hash) })
  if (actions.onSelectForCompare) compare.push({ label: t('graph.menu.selectForCompare'), action: () => actions.onSelectForCompare!(tip.hash) })
  if (actions.onCompareWithSelected && actions.compareBaseHash) {
    compare.push({
      label: t('graph.menu.compareWithSelected'),
      action: () => actions.onCompareWithSelected!(tip.hash),
      // Comparing a commit with itself answers nothing, and the graph's own
      // row greys it out for the same reason.
      disabled: actions.compareBaseHash === tip.hash,
    })
  }

  return { commit: create, copy, compare }
}
