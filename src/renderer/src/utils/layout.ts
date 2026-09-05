// When the details take the centre.
//
// The graph, the details and the sidebar share one width. Below some width
// the graph is lanes and little else, and the details are better served the
// whole window with a way back. That width is a function of the panes the
// user actually has — a right pane dragged to 500px at 1,200px is as cramped
// as the default panes at 1,000px — so it is computed from them, not read off
// a breakpoint that would be right for one set of widths only.

/** Below this much room the graph shows lanes and truncated subjects. */
export const MIN_GRAPH_WIDTH = 400
/** The two drag handles between the panes. */
const RESIZE_HANDLES = 12

export function detailsTakeCenter(windowWidth: number, sidebarWidth: number, rightWidth: number): boolean {
  return windowWidth - sidebarWidth - rightWidth - RESIZE_HANDLES < MIN_GRAPH_WIDTH
}
