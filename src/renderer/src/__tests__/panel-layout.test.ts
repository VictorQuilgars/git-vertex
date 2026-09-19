import {
  resolvePanelLayout, clampDetailsHeight, overlayWidth, autoDetailsSide,
  NARROW_BELOW, SPLIT_ROWS_FROM, RAIL_WIDTH, RAIL_WIDTH_NARROW, DETAILS_MIN, BOTTOM_FROM,
} from '../../../../vscode-extension/src/webview/panelLayout'

// The panel's webview is the whole view, wherever VS Code shows it, and it
// can be dragged from the bottom panel to a side bar while it runs. Nothing
// tells it where it is: it reads its own size. These are the thresholds it
// reads — a bottom panel, a side-bar column, and a column too short for two
// panes — pinned so that moving one is a decision, not a side effect.

describe('the panel layout follows the body size', () => {
  test('a bottom panel is wide: a column beside the graph, details to the right', () => {
    expect(resolvePanelLayout(1100, 220)).toEqual({ narrow: false, railWidth: RAIL_WIDTH, details: 'right', side: 'right' })
  })

  test('an unmeasured body reads as wide, which is what a panel is on its first frame', () => {
    expect(resolvePanelLayout(0, 0).narrow).toBe(false)
  })

  test('a side-bar column is narrow and tall: the details go under the graph', () => {
    const layout = resolvePanelLayout(320, 700)
    expect(layout).toEqual({ narrow: true, railWidth: RAIL_WIDTH_NARROW, details: 'bottom', side: 'bottom' })
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

// The toolbar's placement menu: Auto, Right, Bottom. Auto docks the details on
// the axis with room to spare, and a side asked for by name is taken wherever
// the two panes can physically fit.
describe('where the details go', () => {
  test('auto: at the bottom while the width is short of the height × 1.6, clamped 900–1600', () => {
    expect(autoDetailsSide(1100, 300)).toBe('right')    // a bottom panel: 900 is the floor
    expect(autoDetailsSide(899, 300)).toBe('bottom')
    expect(autoDetailsSide(1200, 900)).toBe('bottom')   // an editor-sized area: 1440
    expect(autoDetailsSide(1500, 900)).toBe('right')
    expect(autoDetailsSide(1700, 2000)).toBe('right')   // 1600 is the ceiling
  })

  test('auto does not flap across the line: back to the right only 10% past it', () => {
    expect(autoDetailsSide(950, 300, 'bottom')).toBe('bottom')
    expect(autoDetailsSide(991, 300, 'bottom')).toBe('right')
    expect(autoDetailsSide(0, 0, 'bottom')).toBe('bottom')
  })

  test('auto follows the side it picked', () => {
    expect(resolvePanelLayout(1200, 900, 'auto', 'bottom')).toMatchObject({ details: 'bottom', side: 'bottom' })
    expect(resolvePanelLayout(1200, 900, 'auto', 'right')).toMatchObject({ details: 'right', side: 'right' })
  })

  test('a side asked for by name is taken', () => {
    expect(resolvePanelLayout(1600, 800, 'bottom').details).toBe('bottom')
    expect(resolvePanelLayout(900, 900, 'right').details).toBe('right')
  })

  test('the bottom, asked for, only needs two panes of height — a bottom panel can have it', () => {
    expect(resolvePanelLayout(1400, BOTTOM_FROM, 'bottom').details).toBe('bottom')
    expect(resolvePanelLayout(1400, BOTTOM_FROM - 1, 'bottom').details).toBe('right')
    // auto keeps the stricter height before it splits rows
    expect(resolvePanelLayout(1400, 400, 'auto', 'bottom').details).toBe('right')
  })

  test('where a side cannot fit, the other one is taken, or one pane at a time', () => {
    expect(resolvePanelLayout(320, 800, 'right')).toMatchObject({ details: 'bottom', side: 'bottom' })
    expect(resolvePanelLayout(320, 400, 'right').details).toBe('replace')
    expect(resolvePanelLayout(320, 200, 'bottom').details).toBe('replace')
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
