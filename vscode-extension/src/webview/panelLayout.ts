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

/**
 * Where the user wants the details: a side, or `auto` — the side the panel's
 * shape suggests (autoDetailsSide). Chosen from the toolbar's placement menu.
 */
export type DetailsLocation = 'auto' | 'right' | 'bottom'
export type DetailsSide = 'right' | 'bottom'

/**
 * `auto` docks the details on the axis that has room to spare: at the bottom
 * while the width is short of the height × 1.6 — clamped, so a tiny panel still
 * prefers the bottom's full-width file list and a huge one eventually goes side
 * by side — and back to the right only once the width is 10% past that, so a
 * drag across the line does not flap.
 */
export const AUTO_BOTTOM_ASPECT = 1.6
export const AUTO_BOTTOM_MIN = 900
export const AUTO_BOTTOM_MAX = 1600

export function autoDetailsSide(width: number, height: number, previous: DetailsSide = 'right'): DetailsSide {
  if (width <= 0 || height <= 0) return previous
  const enter = Math.min(Math.max(height * AUTO_BOTTOM_ASPECT, AUTO_BOTTOM_MIN), AUTO_BOTTOM_MAX)
  if (previous === 'right') return width < enter ? 'bottom' : 'right'
  return width > enter * 1.1 ? 'right' : 'bottom'
}

/**
 * The details can be put at the bottom only when the body holds two panes of
 * DETAILS_MIN — asked for by name, that is all it takes. Chosen by `auto`, or
 * taken as a fallback, it waits for SPLIT_ROWS_FROM: below that, a narrow
 * panel shows one pane at a time rather than two cramped ones.
 */
export const BOTTOM_FROM = 2 * DETAILS_MIN + 8

/**
 * Below this width the graph is a list — two lines per commit, its refs under
 * the message; from it, a table — one line, the refs before the message and
 * the author, the date and the sha in columns of their own.
 */
export const LIST_BELOW = 520

export interface PanelLayout {
  /** The side view is a layer over the graph, not a column beside it. */
  narrow: boolean
  railWidth: number
  /** Where the details (staging, a commit) sit relative to the graph. */
  details: DetailsPlacement
  /** The side the details are on, for the toolbar's toggle: `replace` is below the graph too. */
  side: DetailsSide
}

/**
 * `width` and `height` are the body's — the area under the toolbar. Zero
 * means "not measured yet" and reads as wide, which is what a panel opened
 * in the bottom area is on its first frame. `autoSide` is the side `auto`
 * picked last (the host keeps it, for the dead band); without it, it is
 * worked out from the size alone.
 */
export function resolvePanelLayout(
  width: number, height: number,
  location: DetailsLocation = 'auto',
  autoSide: DetailsSide = autoDetailsSide(width, height),
): PanelLayout {
  const narrow = width > 0 && width < NARROW_BELOW
  const railWidth = narrow ? RAIL_WIDTH_NARROW : RAIL_WIDTH
  const wanted = location === 'auto' ? autoSide : location
  // A column beside the graph needs a panel that is not narrow; two rows need
  // the height for two panes.
  const columnFits = !narrow
  const rowsFit = height <= 0 || height >= (location === 'bottom' ? BOTTOM_FROM : SPLIT_ROWS_FROM)
  const details: DetailsPlacement = wanted === 'bottom'
    ? (rowsFit ? 'bottom' : columnFits ? 'right' : 'replace')
    : (columnFits ? 'right' : height <= 0 || height >= SPLIT_ROWS_FROM ? 'bottom' : 'replace')
  return { narrow, railWidth, details, side: details === 'right' ? 'right' : 'bottom' }
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
