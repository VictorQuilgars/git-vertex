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
//
// The head is pushed before the pull request is opened whenever it is a local
// branch the remote has not caught up with — hence `needsPush`.
import type { BranchInfo } from '../../types'
import { remoteNames, shortName } from './branchRefs'

export interface PRIntent {
  /** Branch the pull request comes from. */
  head: string
  /** Branch it lands on. `null` only when the repo's default is unknown. */
  base: string | null
  /** How the base reads in a menu, e.g. `origin/main`. */
  baseLabel: string | null
  /** The head is a local branch the remote does not have, or does not have in full. */
  needsPush: boolean
}

export interface PRContext {
  /** Checked-out branch. Empty on a detached HEAD, which offers nothing. */
  currentBranch: string
  /** Repo default branch, short name. `null` when git cannot tell us. */
  defaultBranch: string | null
  branches: BranchInfo[]
}

const remoteName = (ref: string): string | null => ref.match(/^remotes\/([^/]+)\//)?.[1] ?? null

/**
 * The pull request a branch row should offer, or `null` when it should offer
 * none. `targetRef` is the row's ref as git names it (`main`, `remotes/origin/main`).
 */
export function prIntentFor(targetRef: string, ctx: PRContext): PRIntent | null {
  const { currentBranch, defaultBranch, branches } = ctx
  if (!currentBranch) return null   // detached HEAD — nothing to propose

  // Short name → the remote holding it, for every branch the remote has.
  const remotes = remoteNames(branches)
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

  const labelFor = (branch: string): string => {
    const remote = published.get(branch)
    return remote ? `${remote}/${branch}` : branch
  }
  const needsPushFor = (branch: string): boolean => {
    const local = locals.get(branch)
    if (!local) return false                                  // remote-only: already up there
    return !published.has(branch) || (local.ahead ?? 0) > 0
  }
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
      needsPush: needsPushFor(currentBranch),
    }
  }

  // Rule 5 — on the default branch: the row you clicked is the head.
  if (!usableBase(defaultBranch)) return null
  return {
    head: target,
    base: defaultBranch,
    baseLabel: labelFor(defaultBranch),
    needsPush: needsPushFor(target),
  }
}
