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
  /**
   * The pull request this row would open, as decided by `prIntentFor` — which
   * way round it points depends on where you are standing. Absent means the
   * row offers none, and no amount of handlers brings it back.
   */
  pr?: { head: string; baseLabel: string | null }
  /**
   * How the remote names this branch (`origin/main`), or absent when it has
   * never been pushed. Decides whether the remote half of the delete group and
   * the branch link are offered at all.
   */
  publishedAs?: string
}

export interface BranchMenuState {
  /** Name of the checked-out branch — used in "Merge into X" style labels. */
  currentBranch: string
  soloed?: boolean
  muted?: boolean
  favorite?: boolean
  /** Issue currently linked to this branch, if any. */
  issue?: { number: number; title?: string } | null
}

export interface BranchMenuActions {
  onCheckout?: () => void
  onPull?: () => void
  onPush?: () => void
  onMerge?: () => void
  onRebaseOnto?: () => void
  onCompare?: () => void
  onSetUpstream?: () => void
  /** Opens the PR composer on `target.pr`. Needs that intent to show a row. */
  onCreatePR?: () => void
  onOpenOnRemote?: () => void
  onAssociateIssue?: () => void
  onToggleFavorite?: () => void
  onToggleSolo?: () => void
  onToggleMute?: () => void
  onCopyName?: () => void
  /** Copies the branch's URL on the forge, next to opening it. */
  onCopyLink?: () => void
  onRename?: () => void
  onDelete?: () => void
  onDeleteRemote?: () => void
  /** Deletes the local branch and its published counterpart in one go. */
  onDeleteBoth?: () => void
}

/** Loose `t` signature so callers can pass `useLang().t` without coupling. */
type T = (key: any, ...args: any[]) => string

/**
 * Rows contributed by a caller that shows this menu on a branch *and* on the
 * commit it points at — the graph. They are merged into the matching branch
 * block rather than appended after it, so "copy something" is one place in the
 * menu and not two twenty rows apart.
 */
export interface BranchMenuExtras {
  /** The whole commit section, separators included, placed after the branch. */
  commit?: MenuItemDef[]
  /** Joins "Open Branch on Remote" — e.g. opening the commit. */
  openRemote?: MenuItemDef[]
  /** Joins the Copy submenu — sha, message, link to the commit. */
  copy?: MenuItemDef[]
  /** Joins the Compare submenu — working tree, select for compare. */
  compare?: MenuItemDef[]
  /** Ways of exporting the diff, kept behind their own row. */
  exports?: MenuItemDef[]
}

/**
 * Builds the branch menu, in blocks that answer one question each:
 *
 *   go there        checkout
 *   sync it         pull / push / upstream / pull request
 *   fold it in      merge / rebase
 *   change it       rename / delete
 *   (the commit it points at, when the caller has one)
 *   look at it      open on remote / copy / compare / export / issue / display
 *
 * Order is fixed so an action sits in the same place whichever surface opened
 * the menu. What is flat and what is behind a submenu is deliberate: the daily
 * actions are one click, and only variants of a single idea — five ways to copy
 * a name, three to export a diff — fold away.
 */
export function buildBranchMenu(
  target: BranchMenuTarget,
  state: BranchMenuState,
  actions: BranchMenuActions,
  t: T,
  extras: BranchMenuExtras = {}
): MenuItemDef[] {
  const { current, remote } = target
  const sections: MenuItemDef[][] = []

  // ── Navigate ──
  const navigate: MenuItemDef[] = []
  if (!current && actions.onCheckout) navigate.push({ label: t('sb.branch.checkout'), action: actions.onCheckout })
  sections.push(navigate)

  // ── Sync — only meaningful on the branch you are actually on ──
  //
  // No Fetch: it acts on the whole repo, not on the branch you right-clicked,
  // and it already has the toolbar and the Pull split-button. It was the one
  // row here that did not answer "what can I do to this branch".
  const sync: MenuItemDef[] = []
  if (current && actions.onPull) sync.push({ label: t('sb.branch.pull'), action: actions.onPull })
  if (!remote && actions.onPush) sync.push({ label: t('sb.branch.push'), action: actions.onPush })
  if (!remote && actions.onSetUpstream) sync.push({ label: t('sb.branch.setUpstream'), action: actions.onSetUpstream })
  // A pull request starts with a push — GitHub cannot see a branch it has never
  // received — so the row says so and the composer does it. Which branch the
  // request runs from is `prIntentFor`'s call, not this row's: it names whatever
  // head that returned, and says nothing when it returned nothing.
  if (actions.onCreatePR && target.pr) {
    const { head, baseLabel } = target.pr
    sync.push({
      label: baseLabel && !current
        ? t('sb.branch.startPRTo', head, baseLabel)
        : t('sb.branch.startPR', head),
      action: actions.onCreatePR,
    })
  }
  sections.push(sync)

  // ── Fold this branch into the one you are on ──
  const integrate: MenuItemDef[] = []
  if (!current) {
    if (actions.onMerge) integrate.push({ label: t('sb.branch.mergeInto', state.currentBranch), action: actions.onMerge })
    if (actions.onRebaseOnto) integrate.push({ label: t('sb.branch.rebaseOnto', state.currentBranch), action: actions.onRebaseOnto })
  }
  sections.push(integrate)

  // ── Change the branch itself ──
  //
  // Rename and delete are the branch's own lifecycle, so they sit together
  // rather than at opposite ends of the menu.
  const edit: MenuItemDef[] = []
  if (!remote && actions.onRename) edit.push({ label: t('sb.rename'), action: actions.onRename })
  if (!current && !remote) {
    const ends: MenuItemDef[] = []
    if (actions.onDelete) {
      ends.push({ label: t('sb.branch.deleteNamed', target.display), action: actions.onDelete, danger: true })
    }
    if (target.publishedAs && actions.onDeleteRemote) {
      ends.push({ label: t('sb.branch.deleteRemoteNamed', target.publishedAs), action: actions.onDeleteRemote, danger: true })
    }
    if (target.publishedAs && actions.onDelete && actions.onDeleteBoth) {
      ends.push({
        label: t('sb.branch.deleteBoth', target.display, target.publishedAs),
        action: actions.onDeleteBoth,
        danger: true,
      })
    }
    // Which end to delete is a choice, not three separate actions — and the
    // dropdown puts a deliberate step between the cursor and the half that the
    // remote cannot give back. An unpublished branch has no choice to make, so
    // it keeps its single flat row.
    if (ends.length === 1) edit.push(ends[0])
    else if (ends.length > 1) edit.push({ label: t('sb.delete'), submenu: ends, danger: true })
  }
  if (remote && actions.onDeleteRemote) {
    edit.push({ label: t('sb.branch.deleteRemote'), action: actions.onDeleteRemote, danger: true })
  }
  sections.push(edit)

  // ── Everything about the commit this branch points at ──
  sections.push(extras.commit ?? [])

  // ── Look at it: on the forge, on the clipboard, against something else ──
  const inspect: MenuItemDef[] = []
  if (actions.onOpenOnRemote) inspect.push({ label: t('sb.branch.openOnRemote'), action: actions.onOpenOnRemote })
  inspect.push(...(extras.openRemote ?? []))
  if (actions.onCopyName) inspect.push({ label: t('sb.copyName'), action: actions.onCopyName })
  // Every other "copy the identity of this thing" in one place — the branch's
  // URL next to the commit's sha — instead of a branch Copy near the top and a
  // commit Copy near the bottom.
  const copies: MenuItemDef[] = []
  if (target.publishedAs && actions.onCopyLink) {
    copies.push({ label: t('sb.branch.copyLink', target.publishedAs), action: actions.onCopyLink })
  }
  copies.push(...(extras.copy ?? []))
  if (copies.length) inspect.push({ label: t('sb.branch.copyMenu'), submenu: copies })
  const compares: MenuItemDef[] = []
  if (!current && actions.onCompare) {
    compares.push({ label: t('sb.branch.compareWith', state.currentBranch), action: actions.onCompare })
  }
  compares.push(...(extras.compare ?? []))
  if (compares.length) inspect.push({ label: t('sb.branch.compareMenu'), submenu: compares })
  if (extras.exports?.length) inspect.push({ label: t('graph.menu.patchMenu'), submenu: extras.exports })
  if (actions.onAssociateIssue) {
    inspect.push({
      label: state.issue
        ? t('sb.branch.issueLinked', state.issue.number)
        : t('sb.branch.associateIssue'),
      action: actions.onAssociateIssue,
    })
  }

  // Four rows that only change how the graph looks, folded behind one — they
  // are the least-reached-for entries in a menu this long, and their state
  // stays visible as checkmarks once it is open.
  const toggles: MenuItemDef[] = []
  if (actions.onToggleFavorite) {
    toggles.push({
      label: state.favorite ? t('sb.branch.unfavorite') : t('sb.branch.favorite'),
      action: actions.onToggleFavorite,
      checked: !!state.favorite,
    })
  }
  if (actions.onToggleSolo) {
    toggles.push({
      label: state.soloed ? t('sb.branch.unsolo') : t('sb.branch.solo'),
      action: actions.onToggleSolo,
      checked: !!state.soloed,
    })
  }
  if (actions.onToggleMute) {
    toggles.push({
      label: state.muted ? t('sb.branch.unmute') : t('sb.branch.mute'),
      action: actions.onToggleMute,
      checked: !!state.muted,
    })
  }
  // A branch that is soloed, hidden or starred says so on the parent row, or
  // folding them away would hide the fact that they are on. Only when one is —
  // an unticked `checked` still reserves its slot and leaves the row visibly
  // indented against its neighbours.
  const anyToggleOn = !!(state.favorite || state.soloed || state.muted)
  if (toggles.length) {
    inspect.push({
      label: t('sb.branch.viewMenu'),
      submenu: toggles,
      ...(anyToggleOn ? { checked: true } : {}),
    })
  }
  sections.push(inspect)

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
