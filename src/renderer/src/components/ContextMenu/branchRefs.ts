// The three shapes a branch reference takes in this app, and how to move
// between them.
//
//   branch list   `remotes/origin/x`   — what git-service returns, what every
//                                        handler and every piece of branch
//                                        metadata is keyed by
//   graph chip    `origin/x`           — git's own decoration, read straight
//                                        out of `git log --decorate`
//   short         `x`                  — the branch as GitHub knows it
//
// Menus mix all three, so the conversions live here rather than as a regex
// repeated at each call site with slightly different edge cases.
import type { BranchInfo } from '../../types'

/** Every remote that has at least one branch in the list. */
export function remoteNames(branches: BranchInfo[]): Set<string> {
  const out = new Set<string>()
  for (const b of branches) {
    const m = b.remote ? b.name.match(/^remotes\/([^/]+)\//) : null
    if (m) out.add(m[1])
  }
  return out
}

/**
 * The branch on its own, whichever shape it arrived in. The leading segment is
 * only stripped when it really names a remote — otherwise a local `feat/x`
 * would lose its `feat/`.
 */
export function shortName(ref: string, remotes: Set<string>): string {
  const full = ref.match(/^remotes\/([^/]+)\/(.+)$/)
  if (full && remotes.has(full[1])) return full[2]
  const decorated = ref.match(/^([^/]+)\/(.+)$/)
  if (decorated && remotes.has(decorated[1])) return decorated[2]
  return ref.replace(/^remotes\/[^/]+\//, '')
}

/**
 * The branch-list form of a ref, so a chip clicked in the graph and a row
 * clicked in the sidebar reach the same handler with the same string.
 */
export function canonicalRef(ref: string, branches: BranchInfo[]): string {
  if (ref.startsWith('remotes/')) return ref
  const match = branches.find(b => b.remote && b.name === `remotes/${ref}`)
  return match ? match.name : ref
}

/**
 * How the remote names a branch it holds — `origin/main` — or null when the
 * remote has never seen it. Answers both "can this be a pull request base?"
 * and "is there a remote branch to delete?".
 */
export function publishedNameFor(ref: string, branches: BranchInfo[]): string | null {
  const short = shortName(ref, remoteNames(branches))
  const published = branches.find(
    b => b.remote && shortName(b.name, remoteNames(branches)) === short
  )
  return published ? published.name.replace(/^remotes\//, '') : null
}
