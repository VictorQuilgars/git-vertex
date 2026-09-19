// Which rows of the graph are drawn. The graph holds every commit it has
// loaded — the layout, the selection, the keys and the search all work on that
// list — but only the rows near the viewport become elements: a page is 500
// commits, *Load more* adds 500, and a side-bar column a few pages in was
// paying, on every scroll and every render, for rows nobody could see.
//
// Pure: rows in, rows out. CommitGraph measures, this decides.
import type { LayoutCommit } from './graph-layout'

/** Rows kept drawn above and below the viewport, so a scroll lands on rows that exist. */
export const OVERSCAN_ROWS = 15

/**
 * The viewport assumed before the body has a height: the first render, a graph
 * mounted but hidden, a test DOM. Enough rows to fill a tall window, so the
 * first paint is not a graph of a dozen rows that fills in a frame later.
 */
export const UNMEASURED_ROWS = 40

/** First and last row drawn, both included. Empty when `end < start`. */
export interface RowWindow { start: number; end: number }

export function rowWindow(
  firstVisible: number, lastVisible: number, total: number, overscan: number = OVERSCAN_ROWS,
): RowWindow {
  if (total <= 0) return { start: 0, end: -1 }
  const first = Math.min(Math.max(0, firstVisible), total - 1)
  const last = Math.min(Math.max(first, lastVisible), total - 1)
  return { start: Math.max(0, first - overscan), end: Math.min(total - 1, last + overscan) }
}

export function inWindow(w: RowWindow, row: number): boolean {
  return row >= w.start && row <= w.end
}

/**
 * The commits to draw as rows: the window, plus any row that has to exist
 * wherever the viewport is — the selection (what `.cg-selected` names), and the
 * row a branch is being dragged from, whose `dragend` would never fire if the
 * element went away mid-drag. `layout[i].row === i` — computeGraphLayout's
 * contract — so the window is a slice, not a filter.
 */
export function rowsToDraw(
  layout: readonly LayoutCommit[], w: RowWindow, pinned: ReadonlyArray<string | null | undefined> = [],
): LayoutCommit[] {
  const rows = w.end < w.start ? [] : layout.slice(w.start, w.end + 1)
  const wanted = pinned.filter((h): h is string => !!h)
  if (wanted.length === 0) return rows
  const extra: LayoutCommit[] = []
  for (const c of layout) {
    if (inWindow(w, c.row)) continue
    if (wanted.includes(c.hash) && !extra.includes(c)) extra.push(c)
  }
  if (extra.length === 0) return rows
  return [...extra.filter(c => c.row < w.start), ...rows, ...extra.filter(c => c.row > w.end)]
}

/** One edge with the commit it leaves from — what renderEdge takes. */
export interface WindowEdge { commit: LayoutCommit; edge: LayoutCommit['edges'][number] }

/**
 * The edges that show in the window: the ones that start or end in it, and the
 * ones that only pass through — a long-lived branch whose two ends are both
 * off screen still has to draw its rail across the rows that are on it.
 */
export function edgesInWindow(layout: readonly LayoutCommit[], w: RowWindow): WindowEdge[] {
  const out: WindowEdge[] = []
  if (w.end < w.start) return out
  for (const commit of layout) {
    for (const edge of commit.edges) {
      const lo = Math.min(commit.row, edge.toRow), hi = Math.max(commit.row, edge.toRow)
      if (lo <= w.end && hi >= w.start) out.push({ commit, edge })
    }
  }
  return out
}
