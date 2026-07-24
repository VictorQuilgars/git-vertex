// One definition of "everything you can do to a branch", shared by every
// surface that offers branch actions.
//
// Before v1.21 these were scattered: Switch/Pull/Fetch lived on the toolbar,
// while Rebase onto / Compare / Rename / Solo / Mute / Delete were reachable
// only by right-clicking a row in the sidebar. Same actions, three places, and
// invisible at the moment they were useful. Callers now pass the handlers they
// can support and get one consistent, identically-ordered menu.
//
// Any handler left undefined drops its row, so a caller that cannot (say) merge
// simply omits onMerge rather than passing a no-op.
import type { MenuItemDef } from './ContextMenu'

export interface BranchMenuTarget {
  /** Full ref as git knows it, e.g. `feature/x` or `remotes/origin/x`. */
  name: string
  /** Short label shown to the user (remote prefix stripped). */
  display: string
  current: boolean
  remote: boolean
}

export interface BranchMenuState {
  /** Name of the checked-out branch — used in "Merge into X" style labels. */
  currentBranch: string
  soloed?: boolean
  muted?: boolean
  pinned?: boolean
  favorite?: boolean
  /** Issue currently linked to this branch, if any. */
  issue?: { number: number; title?: string } | null
}

export interface BranchMenuActions {
  onCheckout?: () => void
  onFetch?: () => void
  onPull?: () => void
  onPush?: () => void
  onMerge?: () => void
  onRebaseOnto?: () => void
  onCompare?: () => void
  onSetUpstream?: () => void
  onOpenOnRemote?: () => void
  onAssociateIssue?: () => void
  onToggleFavorite?: () => void
  onTogglePin?: () => void
  onToggleSolo?: () => void
  onToggleMute?: () => void
  onCopyName?: () => void
  onRename?: () => void
  onDelete?: () => void
  onDeleteRemote?: () => void
}

/** Loose `t` signature so callers can pass `useLang().t` without coupling. */
type T = (key: any, ...args: any[]) => string

/**
 * Builds the branch menu. Sections are separated in a fixed order — navigate,
 * sync, integrate, track, view, edit, destroy — so the same action always sits
 * in the same place whichever surface opened the menu.
 */
export function buildBranchMenu(
  target: BranchMenuTarget,
  state: BranchMenuState,
  actions: BranchMenuActions,
  t: T
): MenuItemDef[] {
  const { current, remote } = target
  const sections: MenuItemDef[][] = []

  // ── Navigate ──
  const navigate: MenuItemDef[] = []
  if (!current && actions.onCheckout) navigate.push({ label: t('sb.branch.checkout'), action: actions.onCheckout })
  sections.push(navigate)

  // ── Sync — only meaningful on the branch you are actually on ──
  const sync: MenuItemDef[] = []
  if (current) {
    if (actions.onFetch) sync.push({ label: t('sb.branch.fetch'), action: actions.onFetch })
    if (actions.onPull) sync.push({ label: t('sb.branch.pull'), action: actions.onPull })
  }
  if (!remote && actions.onPush) sync.push({ label: t('sb.branch.push'), action: actions.onPush })
  if (!remote && actions.onSetUpstream) sync.push({ label: t('sb.branch.setUpstream'), action: actions.onSetUpstream })
  sections.push(sync)

  // ── Integrate into the current branch ──
  const integrate: MenuItemDef[] = []
  if (!current) {
    if (actions.onMerge) integrate.push({ label: t('sb.branch.mergeInto', state.currentBranch), action: actions.onMerge })
    if (actions.onRebaseOnto) integrate.push({ label: t('sb.branch.rebaseOnto', state.currentBranch), action: actions.onRebaseOnto })
    if (actions.onCompare) integrate.push({ label: t('sb.branch.compareWith', state.currentBranch), action: actions.onCompare })
  }
  sections.push(integrate)

  // ── Tracking / outside links ──
  const track: MenuItemDef[] = []
  if (actions.onOpenOnRemote) track.push({ label: t('sb.branch.openOnRemote'), action: actions.onOpenOnRemote })
  if (actions.onAssociateIssue) {
    track.push({
      label: state.issue
        ? t('sb.branch.issueLinked', state.issue.number)
        : t('sb.branch.associateIssue'),
      action: actions.onAssociateIssue,
    })
  }
  sections.push(track)

  // ── Graph view toggles ──
  const view: MenuItemDef[] = []
  if (actions.onToggleFavorite) {
    view.push({
      label: state.favorite ? t('sb.branch.unfavorite') : t('sb.branch.favorite'),
      action: actions.onToggleFavorite,
      checked: !!state.favorite,
    })
  }
  if (actions.onTogglePin) {
    view.push({
      label: state.pinned ? t('sb.branch.unpin') : t('sb.branch.pin'),
      action: actions.onTogglePin,
      checked: !!state.pinned,
    })
  }
  if (actions.onToggleSolo) {
    view.push({
      label: state.soloed ? t('sb.branch.unsolo') : t('sb.branch.solo'),
      action: actions.onToggleSolo,
      checked: !!state.soloed,
    })
  }
  if (actions.onToggleMute) {
    view.push({
      label: state.muted ? t('sb.branch.unmute') : t('sb.branch.mute'),
      action: actions.onToggleMute,
      checked: !!state.muted,
    })
  }
  sections.push(view)

  // ── Edit ──
  const edit: MenuItemDef[] = []
  if (actions.onCopyName) edit.push({ label: t('sb.copyName'), action: actions.onCopyName })
  if (!remote && actions.onRename) edit.push({ label: t('sb.rename'), action: actions.onRename })
  sections.push(edit)

  // ── Destroy — always last, always separated ──
  const destroy: MenuItemDef[] = []
  if (!current && !remote && actions.onDelete) {
    destroy.push({ label: t('sb.delete'), action: actions.onDelete, danger: true })
  }
  if (remote && actions.onDeleteRemote) {
    destroy.push({ label: t('sb.branch.deleteRemote'), action: actions.onDeleteRemote, danger: true })
  }
  sections.push(destroy)

  // Join non-empty sections with a single separator each — no leading, trailing
  // or doubled separators however few sections a caller ends up with.
  const out: MenuItemDef[] = []
  for (const section of sections) {
    if (!section.length) continue
    if (out.length) out.push({ separator: true })
    out.push(...section)
  }
  return out
}
