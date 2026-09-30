/**
 * What a tag row offers, and the commit it offers it on (#288).
 *
 * A tag row could check its commit out, copy its name, push, hide and delete
 * it. Comparing it, copying its sha or its message and resetting to it all
 * existed — on the graph row the tag happens to sit on, which meant finding
 * that row first. They are the same entries a branch row already takes from
 * its tip (#281): `branchTipExtras` builds them, from the same host handlers,
 * so a tag's *Select for Compare* is the graph's and not a second copy of it.
 *
 * The one thing a tag adds is a step before them: a tag is not always a
 * commit. An annotated tag is an object of its own, with its own sha — the
 * one `git tag --format=%(objectname)` lists, and the one `TagEntry.hash`
 * carries. Resetting to that, comparing with it or selecting it would hand
 * every handler the wrong object. So the row resolves the tag to its COMMIT
 * first, by its full refname, and every commit entry acts on that.
 */
import type { MenuItemDef } from '../ContextMenu/ContextMenu'
import { branchTipExtras, type BranchTipActions } from '../ContextMenu/branchTipMenu'
import type { BranchMenuExtras } from '../ContextMenu/branchMenu'
import type { TagEntry } from './types'

type T = (key: any, ...args: any[]) => string

/** The commit a tag stands for, as the menu needs it. */
export interface TagCommit {
  /** The commit's full sha — never the annotated tag object's. */
  hash: string
  /** The commit's subject, for *Copy message*. */
  subject?: string
}

/**
 * A tag's full refname. `v1.2` alone would be answered by a branch of the same
 * name in some git commands and by the tag in others; `refs/tags/v1.2` is
 * answered by the tag in all of them.
 */
export function tagRef(name: string): string {
  return `refs/tags/${name}`
}

/** The two calls the resolution makes — both products answer both. */
export interface TagResolver {
  resolveCommit: (ref: string) => Promise<{ hash: string | null; error?: string }>
  getLastCommitMessage: (ref?: string) => Promise<{ message: string; hash?: string }>
}

/**
 * Tag → commit. `resolveCommit` asks git for `<ref>^{commit}`, which peels an
 * annotated tag to the commit it points at and leaves a lightweight one as it
 * is; `null` is a tag that is gone, or points at something that is not a
 * commit (a tagged tree or blob, which git allows and nothing here can act on).
 *
 * The message asked for is the COMMIT's, not the annotation's: *Copy message*
 * on a graph row and on a branch row copies the commit's subject, and a tag's
 * row copying something else under the same label would make the entry mean
 * two things. The annotation is on the tag's card, where it is shown whole.
 * It is asked by the resolved sha, so it cannot be re-resolved differently.
 */
export async function resolveTagCommit(api: TagResolver, name: string): Promise<TagCommit | null> {
  const { hash } = await api.resolveCommit(tagRef(name))
  if (!hash) return null
  let subject: string | undefined
  try {
    subject = (await api.getLastCommitMessage(hash)).message.split('\n')[0].trim() || undefined
  } catch { /* the entries still work; only Copy message is left out */ }
  return { hash, subject }
}

export interface TagMenuState {
  hidden?: boolean
  /** The graph shows only this tag's history. */
  soloed?: boolean
}

export interface TagMenuActions {
  onCheckoutCommit?: () => void
  onPush: () => void
  onDelete: () => void
  onDeleteRemote: () => void
  onToggleHide?: () => void
  /** Show only this tag's history — the solo a branch row has (#288). */
  onToggleSolo?: () => void
  /** The commit against HEAD. Given the resolved commit, never the tag object. */
  onCompareHead?: (hash: string) => void
  /** The tip actions a branch row takes, from the same host (#281). */
  tipActions?: BranchTipActions
  /** Copies text; injected so the menu stays pure. */
  copy: (text: string) => void
}

/**
 * The whole menu of a tag row. `commit` is the resolution above: without one
 * — the tag vanished between the list and the click, or tags a tree — the
 * entries that need a commit are left out rather than offered to fail.
 */
export function tagMenuItems(
  tag: TagEntry,
  commit: TagCommit | null,
  state: TagMenuState,
  actions: TagMenuActions,
  t: T,
): MenuItemDef[] {
  const tip = actions.tipActions ?? {}
  // Only the entries this issue asks of a tag row: creating a branch at a tag
  // is already its double-click, and creating a tag at a tag is not a thing
  // anyone reaches for from the tag.
  const extras = commit
    ? branchTipExtras(
      { ref: tagRef(tag.name), hash: commit.hash, shortHash: commit.hash.slice(0, 7), subject: commit.subject },
      false,
      {
        onReset: tip.onReset,
        onCompareWorking: tip.onCompareWorking,
        onSelectForCompare: tip.onSelectForCompare,
        onCompareWithSelected: tip.onCompareWithSelected,
        onCopyFullHash: tip.onCopyFullHash,
        compareBaseHash: tip.compareBaseHash,
      },
      t,
    )
    : { commit: [], copy: [], compare: [] } as BranchMenuExtras

  const compare: MenuItemDef[] = [
    ...(commit && actions.onCompareHead ? [{ label: t('sb.tag.compareHead'), action: () => actions.onCompareHead!(commit.hash) }] : []),
    ...(extras.compare ?? []),
  ]
  const copy: MenuItemDef[] = [
    { label: t('sb.copyName'), action: () => actions.copy(tag.name) },
    ...(extras.copy ?? []),
  ]
  // The branch row's reset says "to here", which on a graph row is the row
  // under the pointer. A side bar row is not "here" in the graph, so the
  // entry names what it resets to.
  const reset = (extras.commit ?? []).map(item =>
    'submenu' in item && item.submenu ? { ...item, label: t('sb.tag.resetTo') } : item)

  return [
    // A tag is not a branch and cannot be checked out as one. What this does is
    // check out the commit it points at, which detaches HEAD — so the label
    // says commit, not tag, and it is the only entry in the sidebar that
    // detaches anything.
    ...(actions.onCheckoutCommit ? [
      { label: t('sb.tag.checkoutCommit'), action: actions.onCheckoutCommit },
      { separator: true as const },
    ] : []),
    ...(compare.length ? [{ label: t('sb.branch.compareMenu'), submenu: compare }] : []),
    { label: t('sb.branch.copyMenu'), submenu: copy },
    ...reset,
    { separator: true },
    { label: t('sb.tag.push'), action: actions.onPush },
    ...(actions.onToggleSolo ? [{
      label: state.soloed ? t('sb.branch.unsolo') : t('sb.tag.solo'),
      action: actions.onToggleSolo,
      checked: !!state.soloed,
    }] : []),
    ...(actions.onToggleHide ? [{
      label: state.hidden ? t('sb.tag.show') : t('sb.tag.hide'),
      action: actions.onToggleHide,
      checked: !!state.hidden,
    }] : []),
    { separator: true },
    { label: t('sb.tag.deleteLocal'), action: actions.onDelete, danger: true },
    { label: t('sb.tag.deleteRemote'), action: actions.onDeleteRemote, danger: true },
  ]
}
