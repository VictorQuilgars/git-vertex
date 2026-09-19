/**
 * What a side bar row offers on hover, per kind of row and per state (#274).
 *
 * Pure, and deliberately so: the mapping is the feature. A row only ever
 * carried a kebab — the whole menu, or nothing — so the commonest act on a
 * branch that is three commits behind was two clicks and a read. This says
 * which two or three acts a row's own state justifies; the row then draws the
 * ones it was actually given a handler for, which is how a host that has not
 * wired an action avoids offering a dead button.
 *
 * The full menu stays behind the kebab. Nothing here removes anything.
 */

/** The acts a row can put on its own line. `open` is "take me to it". */
export type RowActionId =
  | 'pull' | 'push' | 'publish' | 'fetch'
  | 'switch' | 'open'
  | 'apply' | 'pop' | 'delete'

export interface BranchRowState {
  current: boolean
  /** A remote-tracking row (`remotes/origin/x`), not a local branch. */
  remote?: boolean
  ahead?: number
  behind?: number
  /** It tracks a branch the remote no longer has. */
  gone?: boolean
  /** `origin/x` when the remote holds it — absent means never published. */
  publishedAs?: string
}

/**
 * A branch row.
 *
 * The sync act is the ONE the state calls for, never a row of three: behind
 * pulls, ahead pushes, diverged pulls first (a push would be refused), an
 * unpublished branch publishes, and a branch level with its upstream offers
 * no sync at all — an icon that would do nothing is worse than no icon.
 *
 * A branch whose upstream is gone offers no sync either: there is nothing to
 * sync with, and what to do about it (delete, re-publish) is a decision, not
 * a click.
 */
export function branchRowActions(state: BranchRowState): RowActionId[] {
  const { current, remote, ahead = 0, behind = 0, gone = false, publishedAs } = state
  if (remote) return ['switch', 'fetch']
  const out: RowActionId[] = []
  if (!current) out.push('switch')
  if (gone) return out
  if (!publishedAs) out.push('publish')
  else if (behind > 0) out.push('pull')
  else if (ahead > 0) out.push('push')
  return out
}

/** A stash row: the three things ever done to a stash. */
export function stashRowActions(): RowActionId[] {
  return ['apply', 'pop', 'delete']
}

/**
 * A tag row. `switch` here means what the tag's double-click means — land on
 * a branch at that commit — not the menu's detaching checkout.
 */
export function tagRowActions(): RowActionId[] {
  return ['switch']
}

/** A remote row: re-read it, or open its URL. */
export function remoteRowActions(): RowActionId[] {
  return ['fetch', 'open']
}

export interface WorktreeRowState {
  /** The worktree the window is currently showing. */
  active: boolean
}

/**
 * A worktree row. The active one is already open, so it offers no `open`;
 * what is left is the act that is always true of a folder — reveal it, which
 * the row draws as `open` only when it is somewhere else.
 */
export function worktreeRowActions(state: WorktreeRowState): RowActionId[] {
  return state.active ? [] : ['open']
}
