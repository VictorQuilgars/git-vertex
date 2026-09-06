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
