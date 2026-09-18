import {
  resolvePanelLayout, clampDetailsHeight, overlayWidth,
  NARROW_BELOW, SPLIT_ROWS_FROM, RAIL_WIDTH, RAIL_WIDTH_NARROW, DETAILS_MIN,
} from '../../../../vscode-extension/src/webview/panelLayout'

// The panel's webview is the whole view, wherever VS Code shows it, and it
// can be dragged from the bottom panel to a side bar while it runs. Nothing
// tells it where it is: it reads its own size. These are the thresholds it
// reads — a bottom panel, a side-bar column, and a column too short for two
// panes — pinned so that moving one is a decision, not a side effect.

describe('the panel layout follows the body size', () => {
  test('a bottom panel is wide: a column beside the graph, details to the right', () => {
    expect(resolvePanelLayout(1100, 220)).toEqual({ narrow: false, railWidth: RAIL_WIDTH, details: 'right' })
  })

  test('an unmeasured body reads as wide, which is what a panel is on its first frame', () => {
    expect(resolvePanelLayout(0, 0).narrow).toBe(false)
  })

  test('a side-bar column is narrow and tall: the details go under the graph', () => {
    const layout = resolvePanelLayout(320, 700)
    expect(layout).toEqual({ narrow: true, railWidth: RAIL_WIDTH_NARROW, details: 'bottom' })
  })

  test('a narrow column too short for two panes shows one at a time', () => {
    expect(resolvePanelLayout(320, SPLIT_ROWS_FROM - 1).details).toBe('replace')
    expect(resolvePanelLayout(320, SPLIT_ROWS_FROM).details).toBe('bottom')
  })

  test('the narrow threshold is exactly where the toolbar could no longer hold its row', () => {
    expect(resolvePanelLayout(NARROW_BELOW, 800).narrow).toBe(false)
    expect(resolvePanelLayout(NARROW_BELOW - 1, 800).narrow).toBe(true)
  })
})

describe('the details height in the row layout', () => {
  test('keeps both panes usable whatever was dragged or remembered', () => {
    expect(clampDetailsHeight(10, 700)).toBe(DETAILS_MIN)
    expect(clampDetailsHeight(5000, 700)).toBe(700 - DETAILS_MIN)
    expect(clampDetailsHeight(350, 700)).toBe(350)
  })

  test('never asks a body shorter than two minimums for more than it has', () => {
    expect(clampDetailsHeight(300, 200)).toBe(DETAILS_MIN)
  })
})

describe('the floating side view', () => {
  test('takes the remembered column width when the body has room for it', () => {
    expect(overlayWidth(240, 600, RAIL_WIDTH_NARROW, 8)).toBe(240)
  })

  test('and what is left beside the rail when it does not', () => {
    expect(overlayWidth(240, 300, RAIL_WIDTH_NARROW, 8)).toBe(300 - RAIL_WIDTH_NARROW - 24)
  })

  test('but never less than a readable list', () => {
    expect(overlayWidth(240, 120, RAIL_WIDTH_NARROW, 8)).toBe(160)
  })
})
