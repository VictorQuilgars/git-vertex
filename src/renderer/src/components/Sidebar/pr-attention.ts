// Pull requests grouped by what each one needs (#257). The view grouped by
// account, which answers "whose is it"; this answers "what is it waiting
// for", and whose move it is.
//
// Every open pull request lands in EXACTLY ONE group: the first rule that
// holds, in the order below, decides. What git and the list already know
// (the head branch, the author, the draft flag, whose review is requested)
// is read off the row; the review decision and the checks are not on a list
// row, and come from the searches the overview already runs to count them —
// which is also what makes the counts here and there agree.
//
// Pure: rows and facts in, groups out. PrsSection draws.
import type { IconName } from '../Icon/Icon'

export type PRGroupKey =
  | 'pinned' | 'current' | 'needs-review' | 'changes-requested' | 'ready'
  | 'blocked' | 'waiting' | 'draft' | 'other' | 'snoozed'

/** The groups, in the order they are shown — which is also, pins and snoozes aside, the order the rules are tried. */
export const PR_GROUPS: { key: PRGroupKey; label: `sb.gh.need.${string}`; icon: IconName }[] = [
  { key: 'pinned', label: 'sb.gh.need.pinned', icon: 'link' },
  { key: 'current', label: 'sb.gh.need.current', icon: 'branch' },
  { key: 'needs-review', label: 'sb.gh.need.needsReview', icon: 'comment' },
  { key: 'changes-requested', label: 'sb.gh.need.changesRequested', icon: 'pencil' },
  { key: 'ready', label: 'sb.gh.need.ready', icon: 'rocket' },
  { key: 'blocked', label: 'sb.gh.need.blocked', icon: 'conflict' },
  { key: 'waiting', label: 'sb.gh.need.waiting', icon: 'clock' },
  { key: 'draft', label: 'sb.gh.need.draft', icon: 'pullRequest' },
  { key: 'other', label: 'sb.gh.need.other', icon: 'kebab' },
  { key: 'snoozed', label: 'sb.gh.need.snoozed', icon: 'bell' },
]

export interface AttentionPR {
  number: number
  author?: string
  draft?: boolean
  headRef?: string
  reviewers?: string[]
  updatedAt?: string
}

/** What the searches answered, as pull request numbers. */
export interface AttentionFacts {
  /** `review-requested:@me` */
  needsReview: ReadonlySet<number>
  /** `author:@me review:changes_requested` */
  changesRequested: ReadonlySet<number>
  /** `author:@me review:approved` */
  approved: ReadonlySet<number>
  /** `author:@me status:failure` */
  failing: ReadonlySet<number>
}

export const NO_FACTS: AttentionFacts = { needsReview: new Set(), changesRequested: new Set(), approved: new Set(), failing: new Set() }

/** A pull request put aside: until a day, or until it next moves — whichever is asked. */
export interface Snooze {
  /** ISO date: awake again from that moment on. */
  until?: string
  /** The `updatedAt` it had when it was snoozed: a different one wakes it. */
  updatedAt?: string
}

export interface AttentionMarks {
  pinned: ReadonlySet<number>
  snoozed: Readonly<Record<number, Snooze>>
}

export interface AttentionContext extends AttentionMarks {
  login: string | null
  currentBranch: string
  facts: AttentionFacts
  now?: number
}

/** Still asleep? Awake once its day has come, or once the pull request has moved since. */
export function isSnoozed(snooze: Snooze | undefined, pr: Pick<AttentionPR, 'updatedAt'>, now: number = Date.now()): boolean {
  if (!snooze) return false
  if (snooze.until && now >= new Date(snooze.until).getTime()) return false
  if (snooze.updatedAt !== undefined && pr.updatedAt !== undefined && pr.updatedAt !== snooze.updatedAt) return false
  // Neither condition was asked for: it sleeps until it is woken by hand.
  return true
}

/** The one group a pull request belongs to. */
export function classifyPR(pr: AttentionPR, ctx: AttentionContext): PRGroupKey {
  if (isSnoozed(ctx.snoozed[pr.number], pr, ctx.now)) return 'snoozed'
  if (ctx.pinned.has(pr.number)) return 'pinned'
  if (pr.headRef && pr.headRef === ctx.currentBranch) return 'current'
  const mine = !!ctx.login && pr.author === ctx.login
  // Asked of you — by the list's own field, or by the search when the list did not carry it.
  if (!mine && ((ctx.login && pr.reviewers?.includes(ctx.login)) || ctx.facts.needsReview.has(pr.number))) return 'needs-review'
  // A draft asks nothing of anybody yet, whatever its checks say.
  if (pr.draft) return 'draft'
  if (mine) {
    if (ctx.facts.changesRequested.has(pr.number)) return 'changes-requested'
    // Approved is only ready while its checks are not failing: red checks block it first.
    if (ctx.facts.failing.has(pr.number)) return 'blocked'
    if (ctx.facts.approved.has(pr.number)) return 'ready'
    return 'waiting'
  }
  return 'other'
}

export interface PRGroup<T> { key: PRGroupKey; rows: T[] }

/** Every group, in order, empty ones included — a count of zero is an answer too. */
export function groupPRs<T extends AttentionPR>(prs: readonly T[], ctx: AttentionContext): PRGroup<T>[] {
  const by = new Map<PRGroupKey, T[]>(PR_GROUPS.map(g => [g.key, []]))
  for (const pr of prs) by.get(classifyPR(pr, ctx))!.push(pr)
  return PR_GROUPS.map(g => ({ key: g.key, rows: by.get(g.key)! }))
}

// ── What is kept on this machine, per repository ─────────────────

const KEY = (repo: string) => `gv-pr-marks:${repo}`

export function readMarks(repo: string | null, storage: Pick<Storage, 'getItem'> = localStorage): { pinned: number[]; snoozed: Record<number, Snooze> } {
  if (!repo) return { pinned: [], snoozed: {} }
  try {
    const raw = JSON.parse(storage.getItem(KEY(repo)) ?? '{}')
    return {
      pinned: Array.isArray(raw.pinned) ? raw.pinned.filter((n: unknown) => Number.isInteger(n)) : [],
      snoozed: raw.snoozed && typeof raw.snoozed === 'object' ? raw.snoozed : {},
    }
  } catch { return { pinned: [], snoozed: {} } }
}

export function writeMarks(repo: string | null, marks: { pinned: number[]; snoozed: Record<number, Snooze> }, storage: Pick<Storage, 'setItem'> = localStorage): void {
  if (!repo) return
  try { storage.setItem(KEY(repo), JSON.stringify(marks)) } catch { /* a full or refused storage loses a pin, not the view */ }
}

/** Snoozes that have woken are dropped, so the store does not keep what no longer applies. */
export function pruneSnoozes<T extends AttentionPR>(snoozed: Record<number, Snooze>, prs: readonly T[], now: number = Date.now()): Record<number, Snooze> {
  const open = new Map(prs.map(pr => [pr.number, pr]))
  const kept: Record<number, Snooze> = {}
  for (const [key, snooze] of Object.entries(snoozed)) {
    const pr = open.get(Number(key))
    if (pr && isSnoozed(snooze, pr, now)) kept[Number(key)] = snooze
  }
  return kept
}
