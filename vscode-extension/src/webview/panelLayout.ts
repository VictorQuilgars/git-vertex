// panelLayout.ts — how the panel arranges itself for the space it is given.
//
// The webview is the whole view, wherever VS Code puts it: the bottom panel
// (wide and short), a side bar column (narrow and tall), a secondary side
// bar, an editor tab. Nothing tells the webview which one it is in, and the
// same view can be dragged from one to another while it runs — so it reads
// its own size and decides, and every decision is a pure function of that
// size, here, so the thresholds can be read and tested in one place.

/** Below this width the side view floats over the graph and the toolbar folds. */
export const NARROW_BELOW = 640
/**
 * A narrow body at least this tall shows the graph AND the details, one
 * above the other; shorter than this there is only room for one at a time.
 */
export const SPLIT_ROWS_FROM = 480
export const RAIL_WIDTH = 44
export const RAIL_WIDTH_NARROW = 36
/** Neither the graph nor the details can be dragged below this height. */
export const DETAILS_MIN = 140

export type DetailsPlacement = 'right' | 'bottom' | 'replace'

export interface PanelLayout {
  /** The side view is a layer over the graph, not a column beside it. */
  narrow: boolean
  railWidth: number
  /** Where the details (staging, a commit) sit relative to the graph. */
  details: DetailsPlacement
}

/**
 * `width` and `height` are the body's — the area under the toolbar. Zero
 * means "not measured yet" and reads as wide, which is what a panel opened
 * in the bottom area is on its first frame.
 */
export function resolvePanelLayout(width: number, height: number): PanelLayout {
  const narrow = width > 0 && width < NARROW_BELOW
  if (!narrow) return { narrow: false, railWidth: RAIL_WIDTH, details: 'right' }
  return {
    narrow: true,
    railWidth: RAIL_WIDTH_NARROW,
    details: height >= SPLIT_ROWS_FROM ? 'bottom' : 'replace',
  }
}

/** The details' height in the row layout, kept where both panes stay usable. */
export function clampDetailsHeight(wanted: number, bodyHeight: number): number {
  const max = Math.max(DETAILS_MIN, bodyHeight - DETAILS_MIN)
  return Math.round(Math.max(DETAILS_MIN, Math.min(max, wanted)))
}

/** The floating side view's width: the user's column width, or what is left. */
export function overlayWidth(sideWidth: number, bodyWidth: number, railWidth: number, gap: number): number {
  const room = bodyWidth - railWidth - 3 * gap
  return Math.max(160, Math.min(sideWidth, room))
}
