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

  test('it opens below the chip when there is room', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    render()
    const chip = await screen.findByText('v1.29.0')
    anchorAt(chip.closest('.ref-chip')!, 100)
    await userEvent.hover(chip)

    const panel = await waitFor(() => document.querySelector('.ref-expansion-popup') as HTMLElement)
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

    const panel = await waitFor(() => document.querySelector('.ref-expansion-popup') as HTMLElement)
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

    const panel = await waitFor(() => document.querySelector('.ref-expansion-popup') as HTMLElement)
    await waitFor(() => expect(panel.style.bottom).not.toBe(''))
    expect(panel.style.top).toBe('')
  })
})
