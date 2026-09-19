// What a branch's card says about it (#258): where it stands against its
// upstream, and against the branch it will merge into. Pure — the card draws,
// this decides — so the sentences are tested without a DOM.
import type { BranchInfo } from '../../types'

/** The reference a chip stands for, as the graph hands it to the host. */
export interface RefTarget {
  kind: 'head' | 'remote' | 'tag'
  /** `main`, `origin/main`, `v1.2.0`. */
  name: string
  /** The commit the chip sits on. */
  hash: string
}

export type UpstreamState = 'unpublished' | 'missing' | 'diverged' | 'behind' | 'ahead' | 'level'

export interface UpstreamFacts {
  state: UpstreamState
  /** `origin/main`; absent while unpublished. */
  name?: string
  ahead: number
  behind: number
}

/** Where a local branch stands against what it tracks. */
export function upstreamFacts(branch: Pick<BranchInfo, 'upstream' | 'ahead' | 'behind' | 'gone'>): UpstreamFacts {
  const ahead = branch.ahead ?? 0, behind = branch.behind ?? 0
  if (!branch.upstream) return { state: 'unpublished', ahead: 0, behind: 0 }
  if (branch.gone) return { state: 'missing', name: branch.upstream, ahead: 0, behind: 0 }
  const state: UpstreamState = ahead && behind ? 'diverged' : behind ? 'behind' : ahead ? 'ahead' : 'level'
  return { state, name: branch.upstream, ahead, behind }
}

/**
 * The one thing the merge-target card concludes, in priority order:
 *  - `merged`     the target holds every commit of the branch, and has moved on;
 *  - `conflicts`  behind, and merging would conflict;
 *  - `clean`      behind, and merging would not;
 *  - `unknown`    behind, and the check could not say;
 *  - `in-sync`    not behind: nothing of the target's is missing here.
 */
export type MergeVerdict = 'merged' | 'conflicts' | 'clean' | 'unknown' | 'in-sync'

export interface MergeFacts {
  target: string
  ahead: number
  behind: number
  /** Files that would conflict; null when the check has not answered, or could not. */
  conflicts: number | null
}

export function mergeVerdict(f: MergeFacts): MergeVerdict {
  // Nothing of its own left, and the target went on without it: it is in there.
  // A branch just cut — nothing ahead, nothing behind — is not "merged", it is new.
  if (f.ahead === 0 && f.behind > 0) return 'merged'
  if (f.behind === 0) return 'in-sync'
  if (f.conflicts === null) return 'unknown'
  return f.conflicts > 0 ? 'conflicts' : 'clean'
}

/**
 * The branch a local one will merge into: the default branch, unless this IS
 * the default branch. A remote branch and a tag merge into nothing.
 */
export function mergeTargetOf(target: RefTarget, defaultBranch: string | null): string | null {
  if (target.kind !== 'head' || !defaultBranch || target.name === defaultBranch) return null
  return defaultBranch
}

/** `origin/feature/x` → the remote and the branch on it. */
export function splitRemoteRef(name: string): { remote: string; branch: string } {
  const at = name.indexOf('/')
  return at < 0 ? { remote: '', branch: name } : { remote: name.slice(0, at), branch: name.slice(at + 1) }
}

/** The row of `branches` a target stands for — a remote one is listed as `remotes/origin/x`. */
export function branchOf(target: RefTarget, branches: readonly BranchInfo[]): BranchInfo | undefined {
  if (target.kind === 'tag') return undefined
  const listed = target.kind === 'remote' ? `remotes/${target.name}` : target.name
  return branches.find(b => b.name === listed && b.remote === (target.kind === 'remote'))
}
