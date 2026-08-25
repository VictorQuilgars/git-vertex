// What "start a Pull Request" means for a given branch row.
//
// A pull request is not symmetric: it goes *from* a topic branch *into* the
// branch everything merges back to. Offering the row on any branch pair
// produces nonsense ("push main and start a Pull Request to feat/x" proposes
// merging the trunk into a feature), and GitHub rejects half of them anyway.
// So one function decides, for every surface, whether a row is offered at all
// and which way round it points.
//
// The rules:
//
//  1. The base must already exist on the remote. GitHub can only merge into a
//     branch it holds — a local-only branch is not a pull request target.
//  2. Nothing is ever proposed *out of* the default branch. It is where pull
//     requests land, not where they start.
//  3. Right-clicking the branch you are on proposes it into the default branch.
//  4. Right-clicking another branch while you are on a topic branch makes that
//     branch the base — the stacked-PR case, and what the row says.
//  5. Right-clicking another branch while you are *on* the default branch flips
//     it round: that branch becomes the head, landing on the default branch.
//     It is the only reading that makes sense, and the one you meant.
//  6. A pull request that ALREADY EXISTS is not proposed again. Same head into
//     the same base is the one thing GitHub refuses outright, and offering
//     "push and start a Pull Request" on a branch whose request is open two
//     panels away is a lie about the state of the repository. Same head into a
//     DIFFERENT base stays offered — that is a stacked request, and legal.
//
// The head is pushed before the pull request is opened whenever the remote has
// not caught up with it — `needsPush`, which is three states read as two:
//
//   the branch's tip is already on the remote   → start a pull request
//   the branch is on the remote, the tip is not → push, then start one
//   the branch is local only                    → push, then start one
//
// The last two are the same action and the same label; what separates them is
// only whether the push creates the remote branch or moves it.
import type { BranchInfo } from '../../types'
import { remoteNames, shortName } from './branchRefs'

export interface PRIntent {
  /** Branch the pull request comes from. */
  head: string
  /** Branch it lands on. `null` only when the repo's default is unknown. */
  base: string | null
  /** How the base reads in a menu, e.g. `origin/main`. */
  baseLabel: string | null
  /**
   * How the head reads once the remote holds it, e.g. `origin/feat/x`. The
   * label uses this only when no push is needed — when one is, what you push
   * is the LOCAL branch, and naming the remote ref there would be a lie about
   * which of the two the action touches.
   */
  headLabel: string
  /** The head is a local branch the remote does not have, or does not have in full. */
  needsPush: boolean
}

export interface PRContext {
  /** Checked-out branch. Empty on a detached HEAD, which offers nothing. */
  currentBranch: string
  /** Repo default branch, short name. `null` when git cannot tell us. */
  defaultBranch: string | null
  branches: BranchInfo[]
  /**
   * The repository's OPEN pull requests, as the panel already loaded them.
   * Omitted when there is no GitHub, or before the list has arrived — and an
   * absent list proposes as it always did rather than guessing.
   */
  // The refs are optional because the panel's row type carries them that way
  // — an item missing either simply matches nothing.
  openPRs?: readonly { headRef?: string; baseRef?: string }[]
}

const remoteName = (ref: string): string | null => ref.match(/^remotes\/([^/]+)\//)?.[1] ?? null

/**
 * Which short names the remote holds and which are local — the one reading of
 * `branches` that rule 1 and the push question share.
 */
function branchIndex(branches: readonly BranchInfo[]) {
  const remotes = remoteNames(branches as BranchInfo[])
  const published = new Map<string, string>()
  const locals = new Map<string, BranchInfo>()
  for (const b of branches) {
    if (b.remote) {
      const s = shortName(b.name, remotes)
      if (!published.has(s)) published.set(s, remoteName(b.name) ?? '')
    } else {
      locals.set(b.name, b)
    }
  }
  return { remotes, published, locals }
}

/**
 * Whether starting a request from `branch` means pushing it first. Exported
 * for the composer, which lets the head be re-chosen (#130) — the intent's
 * own `needsPush` answered for the head the rules proposed, not the one
 * picked. Same three states as the header comment: tip on the remote, tip
 * ahead of it, branch local-only — and a remote-only branch needs nothing.
 */
export function branchNeedsPush(branch: string, branches: readonly BranchInfo[]): boolean {
  const { published, locals } = branchIndex(branches)
  const local = locals.get(branch)
  if (!local) return false
  return !published.has(branch) || (local.ahead ?? 0) > 0
}

/**
 * The pull request a branch row should offer, or `null` when it should offer
 * none. `targetRef` is the row's ref as git names it (`main`, `remotes/origin/main`).
 */
export function prIntentFor(targetRef: string, ctx: PRContext): PRIntent | null {
  const intent = proposeFor(targetRef, ctx)
  // Rule 6 — one already open for this exact pair means there is nothing to
  // start. `base` null means the pair is not even known, so nothing matches.
  if (intent && intent.base && ctx.openPRs?.some(
    pr => pr.headRef === intent.head && pr.baseRef === intent.base)) return null
  return intent
}

/** Rules 1 to 5: which request this row would open, existing ones aside. */
function proposeFor(targetRef: string, ctx: PRContext): PRIntent | null {
  const { currentBranch, defaultBranch, branches } = ctx
  if (!currentBranch) return null   // detached HEAD — nothing to propose

  // Short name → the remote holding it, for every branch the remote has.
  const { remotes, published } = branchIndex(branches)

  const labelFor = (branch: string): string => {
    const remote = published.get(branch)
    return remote ? `${remote}/${branch}` : branch
  }
  const needsPushFor = (branch: string): boolean => branchNeedsPush(branch, branches)
  // A base has to be a branch the remote already holds (rule 1).
  const usableBase = (branch: string | null): branch is string =>
    !!branch && published.has(branch)

  const target = shortName(targetRef, remotes)
  const onDefault = !!defaultBranch && currentBranch === defaultBranch

  // Rule 3 — the branch you are on, into the default branch.
  if (target === currentBranch) {
    if (onDefault) return null                                // rule 2
    if (defaultBranch && !usableBase(defaultBranch)) return null
    return {
      head: currentBranch,
      base: defaultBranch,
      baseLabel: defaultBranch ? labelFor(defaultBranch) : null,
      headLabel: labelFor(currentBranch),
      needsPush: needsPushFor(currentBranch),
    }
  }

  // Rule 4 — on a topic branch: the row you clicked is the base.
  if (!onDefault) {
    if (!usableBase(target)) return null
    return {
      head: currentBranch,
      base: target,
      baseLabel: labelFor(target),
      headLabel: labelFor(currentBranch),
      needsPush: needsPushFor(currentBranch),
    }
  }

  // Rule 5 — on the default branch: the row you clicked is the head.
  if (!usableBase(defaultBranch)) return null
  return {
    head: target,
    base: defaultBranch,
    baseLabel: labelFor(defaultBranch),
    headLabel: labelFor(target),
    needsPush: needsPushFor(target),
  }
}
