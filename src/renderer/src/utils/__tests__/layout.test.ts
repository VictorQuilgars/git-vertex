import { detailsTakeCenter, MIN_GRAPH_WIDTH } from '../layout'

describe('when the details take the centre', () => {
  test('the minimum window with the default panes leaves the graph no room', () => {
    expect(detailsTakeCenter(900, 230, 360)).toBe(true)
  })

  test('the default window with the default panes keeps all three', () => {
    expect(detailsTakeCenter(1400, 230, 360)).toBe(false)
    expect(detailsTakeCenter(1100, 230, 360)).toBe(false)
  })

  test('a wide right pane is what makes a wide window cramped', () => {
    expect(detailsTakeCenter(1200, 230, 360)).toBe(false)
    expect(detailsTakeCenter(1200, 230, 560)).toBe(true)
  })

  test('no sidebar counts as no sidebar', () => {
    expect(detailsTakeCenter(MIN_GRAPH_WIDTH + 360 + 12, 0, 360)).toBe(false)
    expect(detailsTakeCenter(MIN_GRAPH_WIDTH + 360 + 11, 0, 360)).toBe(true)
  })
})
