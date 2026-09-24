// What the model can be asked about a ref, from its row — and exactly which
// range each question sends (#293).
//
// The three entries reuse the readings that already exist: they differ only
// in the SUBJECT they hand them, and a subject may be a range `base..tip`
// (see src/main/ai-range.ts). Each rule below is the whole of "is this entry
// offered here", kept pure so it is tested without drawing a menu.
import { rangeSubject, readRange } from '../../../../main/ai-range'
import { shortName } from '../ContextMenu/branchRefs'
import type { BranchInfo } from '../../types'

type Row = Pick<BranchInfo, 'name' | 'remote' | 'current' | 'commit'> &
  Partial<Pick<BranchInfo, 'upstream' | 'ahead' | 'gone' | 'detached'>>

/**
 * *Explain unpushed changes*: `<upstream>..<branch>`.
 *
 * Only a local branch that is AHEAD of the branch it tracks — no upstream, a
 * gone one, or nothing unpushed, and there is nothing this reading could say
 * that *Explain branch* does not.
 */
export function unpushedSubject(b: Row): string | null {
  if (b.remote || b.detached || b.gone || !b.upstream || !((b.ahead ?? 0) > 0)) return null
  return rangeSubject(b.upstream, b.name)
}

/**
 * *Recompose commits*: offered on every local branch, and runnable on the one
 * that is checked out.
 *
 * ⚠️ `checkout-first` is a restriction, not an oversight. The composer applies
 * its plan where it commits — the working tree — by unstaging, staging and
 * committing file by file. A branch that is not checked out has no working
 * tree here, so recomposing it would mean switching to it, and that is never
 * done behind the user's back: the row stays, disabled, and says to check it
 * out first. The subject is the branch alone; its base is the one the other
 * readings of it use (resolveBase).
 */
export function recomposeOffer(b: Row): 'here' | 'checkout-first' | null {
  if (b.remote || b.detached || !b.commit) return null
  return b.current ? 'here' : 'checkout-first'
}

/**
 * *Generate changelog since this tag*: `<tag>..<the branch you are on>`.
 *
 * The branch, not HEAD: a kept changelog is filed under its subject and
 * reopened by it, and `v1.2.0..HEAD` would describe whatever happens to be
 * checked out the day it is reopened. That is also why it is not offered on
 * a detached HEAD — there is no branch for the changelog to be about.
 */
export function tagChangelogSubject(tag: string, branches: readonly Row[]): string | null {
  const here = branches.find(b => b.current && !b.remote)
  if (!here || here.detached || !here.commit) return null
  return rangeSubject(tag, here.name)
}

/**
 * How a reading's subject is titled. A branch keeps the short name the rows
 * use; a range keeps its base whole — `origin/feat..feat` says unpushed, and
 * shortening it to `feat..feat` would say nothing at all.
 */
export function readingLabel(subject: string, remotes: Set<string>): string {
  const { tip, base } = readRange(subject)
  return base ? rangeSubject(base, shortName(tip, remotes)) : shortName(subject, remotes)
}
