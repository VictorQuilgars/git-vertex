import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import Minimap from '../Minimap'
import CommitGraph from '../CommitGraph'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The strip above the graph: a way around the loaded history that the user
// can put away. jsdom lays nothing out, so the strip is given a width and the
// pointer's x is read against a strip that starts at 0.

const WIDTH = 424          // 400 of chart and the options gutter
let widthSpy: jest.SpyInstance
beforeAll(() => {
  // jsdom has no PointerEvent: without one a pointer event is a bare Event and
  // loses its clientX and button on the way.
  if (!(window as any).PointerEvent) {
    ;(window as any).PointerEvent = class extends MouseEvent {
      pointerId: number
      constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 0 }
    }
  }
  ;(Element.prototype as any).scrollTo = jest.fn()
  ;(Element.prototype as any).scrollBy = jest.fn()
  widthSpy = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList?.contains('cg-mm') ? WIDTH : 0
  })
})
afterAll(() => widthSpy.mockRestore())

const at = (daysAgo: number) => {
  const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(12, 0, 0, 0)
  return d.toISOString()
}
// Four days on the strip: today (two commits), yesterday (none), two and three days ago.
const COMMITS = [
  { hash: 'a1', date: at(0), refs: ['HEAD -> main'], additions: 5, deletions: 1 },
  { hash: 'a2', date: at(0), refs: [], additions: 1, deletions: 0 },
  { hash: 'b1', date: at(2), refs: ['tag: v1'], additions: 3, deletions: 3 },
  { hash: 'c1', date: at(3), refs: [], additions: 1, deletions: 1 },
]
const slotX = (i: number) => (i + 0.5) * (400 / 4)   // the middle of day i, newest first

function draw(over: Partial<React.ComponentProps<typeof Minimap>> = {}) {
  installMockGitAPI()
  const props = {
    commits: COMMITS, headHash: 'a1', matches: null, visible: null, selectedHash: null,
    onPick: jest.fn(), onHide: jest.fn(), ...over,
  }
  renderWithProviders(<Minimap {...props} />)
  return props
}
const strip = () => document.querySelector('.cg-mm') as HTMLElement
const point = (type: 'pointerDown' | 'pointerMove' | 'pointerUp', x: number) =>
  fireEvent[type](strip(), { clientX: x, button: 0, pointerId: 1 })

test('draws the activity, and HEAD where it stands', () => {
  draw()
  expect(document.querySelector('.cg-mm-line')?.getAttribute('d')).toMatch(/^M/)
  expect(document.querySelector('.cg-mm-head')).not.toBeNull()
})

test('hovering a day says when it was and what happened', () => {
  draw()
  point('pointerMove', slotX(0))
  const tip = screen.getByRole('tooltip')
  expect(tip).toHaveTextContent('Today')
  expect(tip).toHaveTextContent('2 commits')
  expect(tip).toHaveTextContent('main')
})

test('a click goes to the newest commit of the day', () => {
  const props = draw()
  point('pointerDown', slotX(2)); point('pointerUp', slotX(2))
  expect(props.onPick).toHaveBeenCalledWith('b1')
})

test('a click on a quiet day lands on the nearest one with commits', () => {
  const props = draw()
  point('pointerDown', slotX(1)); point('pointerUp', slotX(1))
  expect(props.onPick).toHaveBeenCalledTimes(1)
  expect(['a1', 'b1']).toContain(props.onPick.mock.calls[0][0])
})

test('a drag zooms, and the zoom has a way out', () => {
  const props = draw()
  point('pointerDown', slotX(0)); point('pointerMove', slotX(2)); point('pointerUp', slotX(2))
  expect(props.onPick).not.toHaveBeenCalled()
  const exit = screen.getByRole('button', { name: 'Exit zoom' })
  fireEvent.click(exit)
  expect(screen.queryByRole('button', { name: 'Exit zoom' })).toBeNull()
})

test('the options menu hides the strip', () => {
  const props = draw()
  fireEvent.click(screen.getByRole('button', { name: 'Minimap options' }))
  fireEvent.click(screen.getByText('Hide minimap'))
  expect(props.onHide).toHaveBeenCalled()
})

test('a press in the options menu is not a press on the chart', () => {
  // The menu is portalled out of the strip, but React bubbles its events
  // through it: "Hide minimap" used to take the graph to a day as well.
  const props = draw()
  fireEvent.click(screen.getByRole('button', { name: 'Minimap options' }))
  const row = screen.getByText('Hide minimap')
  fireEvent.pointerMove(row, { clientX: slotX(2), button: 0, pointerId: 1 })
  fireEvent.pointerDown(row, { clientX: slotX(2), button: 0, pointerId: 1 })
  fireEvent.pointerUp(row, { clientX: slotX(2), button: 0, pointerId: 1 })
  expect(props.onPick).not.toHaveBeenCalled()
  expect(screen.queryByRole('tooltip')).toBeNull()
})

test('its height is dragged, and remembered', async () => {
  draw()
  const api = (window as any).gitAPI
  const handle = screen.getByRole('separator', { name: 'Minimap height' })
  expect(strip().style.height).toBe('40px')
  // The handle is under the strip: moving it down makes the strip taller.
  fireEvent.pointerDown(handle, { clientY: 100, button: 0, pointerId: 7 })
  fireEvent.pointerMove(window, { clientY: 160, pointerId: 7 })
  expect(strip().style.height).toBe('100px')
  fireEvent.pointerUp(window, { clientY: 160, pointerId: 7 })
  await waitFor(() => expect(api.settingsSet).toHaveBeenCalledWith('graphMinimapHeight', '100'))
  // And never past its bounds.
  fireEvent.keyDown(handle, { key: 'End' })
  expect(strip().style.height).toBe('200px')
  fireEvent.keyDown(handle, { key: 'Home' })
  expect(strip().style.height).toBe('28px')
})

describe('in the graph', () => {
  const graphCommits = COMMITS.map((c, i) => ({
    ...c, shortHash: c.hash, message: `commit ${i}`, author: 'Alice', authorEmail: 'a@test.local',
    parents: i < COMMITS.length - 1 ? [COMMITS[i + 1].hash] : [],
  }))
  const graph = (settings: Record<string, string> = {}, extra: Record<string, unknown> = {}) => {
    installMockGitAPI({ settingsGetAll: jest.fn().mockResolvedValue(settings) })
    renderWithProviders(<CommitGraph {...({
      commits: graphCommits, selectedHash: null, onSelectCommit: jest.fn(), searchQuery: '', currentBranch: 'main', ...extra,
    } as any)} />)
  }

  test('goes in the block the host gives it, above the panes rather than inside the graph', async () => {
    const slot = document.createElement('div')
    slot.className = 'cg-mm-slot'
    document.body.appendChild(slot)
    graph({}, { minimapSlot: slot })
    await act(async () => {})
    expect(slot.querySelector('.cg-mm')).not.toBeNull()
    expect(document.querySelector('.cg-container .cg-mm')).toBeNull()
    slot.remove()
  })

  test('draws nothing while the host block is not mounted yet', async () => {
    graph({}, { minimapSlot: null })
    await act(async () => {})
    expect(strip()).toBeNull()
  })

  test('is there by default', async () => {
    graph()
    await act(async () => {})
    expect(strip()).not.toBeNull()
  })

  test('stays away once hidden', async () => {
    graph({ graphMinimap: 'false' })
    await waitFor(() => expect(strip()).toBeNull())
  })

  test('comes back from the header menu', async () => {
    graph({ graphMinimap: 'false' })
    await waitFor(() => expect(strip()).toBeNull())
    fireEvent.contextMenu(document.querySelector('.cg-header')!)
    fireEvent.click(screen.getByText('Minimap'))
    await waitFor(() => expect(strip()).not.toBeNull())
  })
})
