// What a branch, tag or stash row says beyond its name (#278) — pure, so the
// wording is tested without mounting a side bar.
//
// Every fact here arrives with the list the row belongs to: the branch's tip
// date from `for-each-ref`, the tag's annotation from the same call, the
// stash's branch and date from `stash list`, the worktree from the list the
// side bar already loads, the pull request from the list the PULL REQUESTS
// section already holds. Nothing is asked of git per row.
import { timeAgo } from '../GitHubPanel/GithubRow'

type T = (key: any, ...args: any[]) => string

/**
 * How long ago, in the side bar's own short form (`3d`, `2mo`) — the one the
 * AI rows and the GitHub rows already use. `null` when there is no date to
 * speak of: an unborn branch, or a host that does not send one yet.
 */
export function ageOf(seconds: number | undefined, t: T): string | null {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null
  return timeAgo(new Date(seconds * 1000).toISOString(), t)
}

/**
 * The same age, read aloud — `3d ago` — for a tooltip, where a bare `3d` after
 * "Last commit:" reads as a duration rather than as when. `just now` stays as it
 * is: it is already a moment, and `just now ago` is not English. The rows keep
 * the short form, which is what fits beside a name.
 */
export function agoOf(seconds: number | undefined, t: T): string | null {
  const short = ageOf(seconds, t)
  if (!short) return null
  return short === t('github.justNow') ? short : t('time.ago', short)
}

/** The open pull request a branch is the head of, as the panel loaded it. */
export interface BranchPR { number: number; title: string; draft?: boolean }

/**
 * The open pull request whose head is this LOCAL branch. Matched on the head's
 * name, which is all the list endpoint gives; a remote-tracking row is not
 * matched — which remote a request's head lives on is not in the list.
 */
export function prForBranch(
  name: string,
  prs: readonly { number: number; title: string; draft?: boolean; headRef?: string }[] | undefined,
): BranchPR | undefined {
  const pr = prs?.find(p => p.headRef === name)
  return pr ? { number: pr.number, title: pr.title, ...(pr.draft ? { draft: true } : {}) } : undefined
}

export interface BranchFacts {
  name: string
  current: boolean
  remote?: boolean
  upstream?: string
  ahead?: number
  behind?: number
  gone?: boolean
  date?: number
  checkedOutIn?: { name: string }
  pr?: BranchPR
}

/**
 * The row's tooltip: what it is, what it tracks, its pull request, where else
 * it is checked out, when it last moved — then how to act on it. One line per
 * fact, and a line only for a fact there is.
 */
export function branchTooltip(f: BranchFacts, t: T): string {
  const lines: string[] = [f.current ? t('sb.branch.currentTitle', f.name) : f.name.replace(/^remotes\//, '')]
  if (!f.remote) {
    const ahead = f.ahead ?? 0
    const behind = f.behind ?? 0
    if (!f.upstream) lines.push(t('sb.branch.tip.untracked'))
    else if (f.gone) lines.push(t('sb.branch.tip.gone', f.upstream))
    else if (ahead || behind) lines.push(t('sb.branch.tip.diverged', f.upstream, ahead, behind))
    else lines.push(t('sb.branch.tip.level', f.upstream))
  }
  if (f.pr) lines.push(t(f.pr.draft ? 'sb.branch.tip.prDraft' : 'sb.branch.tip.pr', f.pr.number, f.pr.title))
  if (f.checkedOutIn) lines.push(t('sb.branch.tip.worktree', f.checkedOutIn.name))
  const age = agoOf(f.date, t)
  if (age) lines.push(t('sb.branch.tip.age', age))
  if (!f.current) lines.push(t('sb.branch.hint'))
  return lines.join('\n')
}

/**
 * What a stash row reads as. git's own messages open on the branch —
 * `On main: tidy` and `WIP on main: 1a2b3c4 subject` — and the row now names
 * the branch beside it, so the prefix is dropped from the label rather than
 * said twice. Only when it names the SAME branch: a renamed stash, or one
 * whose message happens to begin that way, is shown as written. The tooltip,
 * the menu's copy and the rename keep the whole message.
 */
export function stashLabel(s: { message: string; branch?: string }): string {
  const label = s.message.replace(/^stash@\{\d+\}: /, '')
  if (!s.branch) return label
  for (const lead of [`On ${s.branch}: `, `WIP on ${s.branch}: `]) {
    if (label.startsWith(lead) && label.length > lead.length) return label.slice(lead.length)
  }
  return label
}

/** A stash row's second voice: `main · 3d`, or whichever half is known. */
export function stashFacts(s: { branch?: string; date?: number }, t: T): string | null {
  const parts = [s.branch, ageOf(s.date, t)].filter((p): p is string => !!p)
  return parts.length ? parts.join(' · ') : null
}

/** The stash's tooltip: its message, where and when it was made, then the click. */
export function stashTooltip(s: { message: string; branch?: string; date?: number }, t: T, clickable: boolean): string {
  const label = s.message.replace(/^stash@\{\d+\}: /, '')
  const lines = [clickable ? t('sb.stash.title', label) : label]
  if (s.branch) lines.push(t('sb.stash.madeOn', s.branch))
  const age = agoOf(s.date, t)
  if (age) lines.push(t('sb.stash.age', age))
  return lines.join('\n')
}

/**
 * The tag's tooltip: where it points, what its annotation says, then the click.
 *
 * The date is not always the tag's own. An annotated tag is an object with a
 * tagger and a date, and that is the one the list carries; a lightweight tag is
 * only a name for a commit, so the list's date is the COMMIT's — and "Tagged: 3
 * months ago" would say something git does not know. It says what it is.
 */
export function tagTooltip(
  tag: { name: string; hash: string; message?: string; date?: number; annotated?: boolean }, t: T, canGoTo: boolean,
): string {
  const lines = [canGoTo ? t('sb.tag.hint', tag.name, tag.hash) : `${tag.name} → ${tag.hash}`]
  if (tag.message) lines.push(tag.message)
  const age = agoOf(tag.date, t)
  if (age) lines.push(t(tag.annotated ? 'sb.tag.age' : 'sb.tag.commitAge', age))
  return lines.join('\n')
}
