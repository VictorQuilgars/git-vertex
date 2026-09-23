// The extended search reads the whole history; the graph holds a page of it.
// A hit beyond the page is a row the graph does not have, and a search that
// looks like it found nothing. This decides how far the page has to grow to
// show the hits it can, which one to select, and what to say about the rest.
import { LOG_PAGE } from './shared'

/**
 * How deep the graph grows on its own to show a hit. Further than this the
 * hit is reported with its position rather than loaded: ten pages is a graph
 * that still scrolls, and a hit at 40,000 is better found by its hash.
 */
export const HISTORY_REACH = 5000

export interface ReachPlan {
  /** The page size that shows every hit within reach; 0 when nothing has to be loaded. */
  loadTo: number
  /** The nearest hit that was beyond the page, to select once its row is in. */
  select: string | null
  /** Hits a shown ref reaches, beyond HISTORY_REACH — nearest first. */
  beyond: { hash: string; position: number }[]
  /** Hits no ref the graph shows reaches: a hidden branch, or a solo one. */
  unreached: string[]
}

/**
 * @param hits       what the extended search found, over the whole history
 * @param loaded     the hashes the graph holds
 * @param positions  the 1-based row of each missing hit in the log the graph loads
 * @param limit      the page size the graph loads today
 */
export function planReach(
  hits: string[], loaded: Set<string>, positions: Record<string, number>, limit: number,
  reach = HISTORY_REACH, page = LOG_PAGE,
): ReachPlan {
  const missing = hits.filter(h => !loaded.has(h))
  const located = missing
    .filter(h => positions[h] !== undefined)
    .map(h => ({ hash: h, position: positions[h] }))
    .sort((a, b) => a.position - b.position)
  const within = located.filter(x => x.position <= reach)
  const beyond = located.filter(x => x.position > reach)
  const unreached = missing.filter(h => positions[h] === undefined)
  // Every hit within reach, not only the nearest: the count in the search
  // field is then true for everything the graph can show.
  const farthest = within.length ? within[within.length - 1].position : 0
  const loadTo = farthest > limit ? Math.ceil(farthest / page) * page : 0
  return { loadTo, select: within[0]?.hash ?? null, beyond, unreached }
}

/**
 * The model's answer, reached — the same plan with one difference: what is
 * selected is the MOST PROBABLE hit the graph can show, not the nearest.
 *
 * The answer comes back best first, and that order used to be thrown away at
 * the first `new Set(...)`: every hit lit alike, the page not grown for any of
 * them, so a hit past the page was a row the graph did not have and the count
 * in the field said fewer than the model found. The ranking now decides where
 * the graph goes; the plan still loads every hit within reach, so the count is
 * true for everything the graph can show.
 */
export function planAnswer(
  ranked: string[], loaded: Set<string>, positions: Record<string, number>, limit: number,
  reach = HISTORY_REACH, page = LOG_PAGE,
): ReachPlan {
  const plan = planReach(ranked, loaded, positions, limit, reach, page)
  const best = ranked.find(h => loaded.has(h) || (positions[h] !== undefined && positions[h] <= reach)) ?? null
  return { ...plan, select: best }
}

type Translate = (key: any, ...args: any[]) => string

/** What a search has to say about the hits the graph will not show: none, or one sentence per kind. */
export function reachMessage(t: Translate, plan: ReachPlan): string | null {
  const parts: string[] = []
  if (plan.beyond.length) parts.push(t('search.reach.beyond', plan.beyond.length, plan.beyond[0].position.toLocaleString('en-US')))
  if (plan.unreached.length) parts.push(t('search.reach.unreached', plan.unreached.length))
  return parts.length ? parts.join(' ') : null
}

/** What a host may say about its answer beyond the hashes — ai-judge's JudgeSearchResult, read loosely. */
export interface AnswerFacts { hashes?: string[]; total?: number; partial?: number; batches?: number; readOnly?: number }

/**
 * What the answer itself leaves out: none, or one sentence per kind.
 *
 * Each of these used to be silent, and each looks exactly like a complete
 * answer: fifty rows read as "all of them", a history read to its thousandth
 * commit reads as a history read whole, and a batch that never answered reads
 * as a batch where nothing matched.
 */
export function answerMessage(t: Translate, a: AnswerFacts): string | null {
  const parts: string[] = []
  const shown = a.hashes?.length ?? 0
  if (a.total && a.total > shown) parts.push(t('search.ai.capped', shown, a.total))
  if (a.readOnly) parts.push(t('search.ai.readOnly', a.readOnly.toLocaleString('en-US')))
  if (a.partial) parts.push(t('search.ai.partial', a.partial, a.batches ?? a.partial))
  return parts.length ? parts.join(' ') : null
}
