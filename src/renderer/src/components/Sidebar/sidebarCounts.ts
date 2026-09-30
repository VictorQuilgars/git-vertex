/**
 * How many rows each side bar view holds — one rule, read by two places (#277).
 *
 * The section headers have always carried a count; the panel's rail did not,
 * so knowing whether there was a stash meant opening the view. The rail counts
 * now, and it counts with THIS function, over the same lists the headers are
 * given: a rail that said 4 over a header that said 5 would be two answers to
 * one question, and the first one anybody trusted would be the wrong one.
 *
 * The one difference is the side bar's filter field. A header counts what the
 * field lets through, because that is what is under it; the rail counts the
 * lists whole, because the field narrows the view on screen, not the others.
 * With the field empty the two agree by construction.
 */
import type { SidebarView } from './types'

export interface CountedLists {
  /** Every branch — the remote ones are not counted: the view's count is LOCAL's. */
  branches?: readonly { remote?: boolean }[]
  stashes?: readonly unknown[]
  tags?: readonly unknown[]
  remotes?: readonly unknown[]
  worktrees?: readonly unknown[]
  /** `undefined` is "not asked", which has no count — not a zero. */
  prs?: readonly unknown[]
  issues?: readonly unknown[]
}

export type SidebarCounts = Partial<Record<SidebarView, number>>

export function sidebarCounts(l: CountedLists): SidebarCounts {
  const out: SidebarCounts = {}
  if (l.branches) out.branches = l.branches.filter(b => !b.remote).length
  if (l.stashes) out.stash = l.stashes.length
  if (l.tags) out.tags = l.tags.length
  if (l.remotes) out.remotes = l.remotes.length
  if (l.worktrees) out.worktrees = l.worktrees.length
  if (l.prs) out.prs = l.prs.length
  if (l.issues) out.issues = l.issues.length
  return out
}

/** What a count reads as where there is room for three characters. */
export function shortCount(n: number): string {
  return n > 99 ? '99+' : String(n)
}
