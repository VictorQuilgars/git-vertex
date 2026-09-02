import { screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CommitGraph from '../CommitGraph'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// A commit can carry several refs; the BRANCH/TAG column shows one and a "+N".
// Hovering the chip reveals the rest in a floating panel.
//
// That panel used to have no surface of its own — no background, no border — so
// the revealed names were drawn straight over the next row's chip and the two
// texts overlapped character by character. The surface is CSS, which jsdom does
// not apply; what IS testable is the other half of the fix: the panel must not
// open past the bottom of the window, or the names it reveals are unreachable.

const COMMITS = [
  {
    hash: 'aaa1111', shortHash: 'aaa1111', message: 'release',
    author: 'V', authorEmail: 'v@x.dev', date: '2026-08-02', parents: ['bbb2222'],
    refs: ['tag: v1.29.0', 'tag: ext-v1.27.0', 'tag: mcp-v0.5.3'],
  },
  {
    hash: 'bbb2222', shortHash: 'bbb2222', message: 'before',
    author: 'V', authorEmail: 'v@x.dev', date: '2026-08-01', parents: [], refs: [],
  },
]

function render() {
  installMockGitAPI()
  return renderWithProviders(
    <CommitGraph
      commits={COMMITS as any}
      selectedHash={null}
      onSelectCommit={() => {}}
      searchQuery=""
      currentBranch="main"
    />
  )
}

/** The panel, once its opening delay has passed. */
async function findPanel(): Promise<HTMLElement> {
  await waitFor(() => expect(document.querySelector('.ref-expansion-popup')).not.toBeNull())
  return document.querySelector('.ref-expansion-popup') as HTMLElement
}

/** Force the anchor chip to sit at a chosen distance from the bottom. */
function anchorAt(el: Element, top: number) {
  jest.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    top, bottom: top + 20, left: 40, right: 140, width: 100, height: 20, x: 40, y: top,
    toJSON: () => {},
  } as DOMRect)
}

describe('BRANCH/TAG — the panel behind "+N"', () => {
  const REAL_H = window.innerHeight

  afterEach(() => {
    jest.restoreAllMocks()
    Object.defineProperty(window, 'innerHeight', { value: REAL_H, configurable: true })
  })

  test('hovering reveals the refs the chip was hiding', async () => {
    render()
    const chip = await screen.findByText('v1.29.0')
    await userEvent.hover(chip)

    // The two it was hiding appear; the visible one is not duplicated.
    expect(await screen.findByText('ext-v1.27.0')).toBeInTheDocument()
    expect(screen.getByText('mcp-v0.5.3')).toBeInTheDocument()
    // a tip row's own refs: the panel wears no ghost tenue
    const panel = document.querySelector('.ref-expansion-popup')!
    expect(panel.classList.contains('ref-expansion-popup--ghost')).toBe(false)
    expect(panel.querySelectorAll('.ref-chip--ghost').length).toBe(0)
  })

  // The panel is anchored to where its chip was; a scroll moves the chip out
  // from under it, and the panel used to stay, pointer or no pointer.
  test('a scroll closes it', async () => {
    render()
    await userEvent.hover(await screen.findByText('v1.29.0'))
    expect(await screen.findByText('ext-v1.27.0')).toBeInTheDocument()
    fireEvent.scroll(document.body)
    await waitFor(() => expect(screen.queryByText('ext-v1.27.0')).not.toBeInTheDocument())
  })

  // The contract is the pointer's POSITION, not a mouseleave that may never
  // come: a move anywhere outside the chip and its panel closes it.
  test('a move away from the chip and the panel closes it; a move within keeps it', async () => {
    render()
    const chip = await screen.findByText('v1.29.0')
    await userEvent.hover(chip)
    expect(await screen.findByText('ext-v1.27.0')).toBeInTheDocument()
    // jsdom lays everything out at 0,0: a move at the origin is "within"
    fireEvent.mouseMove(document.body, { clientX: 2, clientY: 2 })
    expect(screen.getByText('ext-v1.27.0')).toBeInTheDocument()
    fireEvent.mouseMove(document.body, { clientX: 900, clientY: 900 })
    await waitFor(() => expect(screen.queryByText('ext-v1.27.0')).not.toBeInTheDocument())
  })

  test('the "+N" badge stays while the panel is open — the chip keeps its width under the pointer', async () => {
    render()
    const chip = await screen.findByText('v1.29.0')
    expect(chip.closest('.cg-refs-chips')!.querySelector('.rc-stack-badge')).toHaveTextContent('+2')
    await userEvent.hover(chip)
    expect(await screen.findByText('ext-v1.27.0')).toBeInTheDocument()
    expect(chip.closest('.cg-refs-chips')!.querySelector('.rc-stack-badge')).toHaveTextContent('+2')
  })

  // After a scroll the browser re-hovers whatever landed under the still
  // pointer — a hover the scroll made. It must open nothing.
  test('a hover right after a scroll opens nothing; one a moment later does', async () => {
    render()
    const chip = await screen.findByText('v1.29.0')
    fireEvent.scroll(document.body)
    await userEvent.hover(chip)
    await new Promise(r => setTimeout(r, 250))
    expect(screen.queryByText('ext-v1.27.0')).not.toBeInTheDocument()
    await userEvent.unhover(chip)
    await new Promise(r => setTimeout(r, 200))
    await userEvent.hover(chip)
    expect(await screen.findByText('ext-v1.27.0')).toBeInTheDocument()
  })

  // A name the column cut is read whole on a rest — the chip drawn over the
  // graph, bullet included; a name that fit gets no such thing.
  test('a cut name shows whole over the graph on a rest; a name that fits does not', async () => {
    render()
    const chip = await screen.findByText('v1.29.0')
    await userEvent.hover(chip)
    await findPanel()
    expect(document.querySelector('.ref-peek')).toBeNull()
    await userEvent.unhover(chip)
    fireEvent.mouseMove(document.body, { clientX: 900, clientY: 900 })
    await waitFor(() => expect(document.querySelector('.ref-expansion-popup')).toBeNull())
    // jsdom measures nothing: say the name overflows its box
    Object.defineProperty(chip, 'scrollWidth', { value: 300, configurable: true })
    Object.defineProperty(chip, 'clientWidth', { value: 80, configurable: true })
    await userEvent.hover(chip)
    await waitFor(() => expect(document.querySelector('.ref-peek')).not.toBeNull())
    const peek = document.querySelector('.ref-peek')!
    expect(peek.querySelector('.rc-name')).toHaveTextContent('v1.29.0')
    expect(peek.querySelector('.rc-stack-badge')).toHaveTextContent('+2')
    fireEvent.mouseMove(document.body, { clientX: 900, clientY: 900 })
    await waitFor(() => expect(document.querySelector('.ref-peek')).toBeNull())
  })

  test('it opens below the chip when there is room', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    render()
    const chip = await screen.findByText('v1.29.0')
    anchorAt(chip.closest('.ref-chip')!, 100)
    await userEvent.hover(chip)

    const panel = await findPanel()
    expect(panel.style.top).toBe('124px')      // anchor.bottom + 4
    expect(panel.style.bottom).toBe('')
  })

  // It belongs to one chip, so it is that chip's width — not the wrapper's,
  // which also holds the "+N" badge and made the panel wider for no reason.
  test('it is as wide as the chip it belongs to, not the whole wrapper', async () => {
    render()
    const chip = await screen.findByText('v1.29.0')
    anchorAt(chip.closest('.ref-chip')!, 100)
    await userEvent.hover(chip)

    const panel = await findPanel()
    expect(panel.style.minWidth).toBe('100px')   // the chip's width, from anchorAt
    expect(panel.style.left).toBe('40px')        // and its left edge
  })

  // The case that made the names unreachable: hovering a "+N" on one of the last
  // rows pushed the panel past the bottom of the window.
  test('it flips above the chip rather than off the bottom of the window', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 300, configurable: true })
    render()
    const chip = await screen.findByText('v1.29.0')
    anchorAt(chip.closest('.ref-chip')!, 280)
    await userEvent.hover(chip)

    const panel = await findPanel()
    await waitFor(() => expect(panel.style.bottom).not.toBe(''))
    expect(panel.style.top).toBe('')
  })
})
