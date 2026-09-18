import { fireEvent, screen } from '@testing-library/react'
import RefOverflow, { fitCount, headerRefs } from '../RefOverflow'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The refs in the header of a commit's details are drawn whole or not at all.
// They used to share the line by shrinking, and four of them in a narrow panel
// came out as "v…", "ext…", "ori…", "m…".

beforeEach(() => { installMockGitAPI() })

describe('what is shown first', () => {
  test('where HEAD is, then the branches, their remotes, then the tags', () => {
    const refs = headerRefs(['tag: v1.37.0', 'tag: ext-v1.35.0', 'origin/main', 'origin/HEAD', 'HEAD -> main', 'release/x'])
    expect(refs.map(r => r.text)).toEqual(['★ main', 'release/x', 'origin/main', 'v1.37.0', 'ext-v1.35.0'])
    expect(refs.map(r => r.cls)).toEqual(['rp-ref-head', 'rp-ref-local', 'rp-ref-remote', 'rp-ref-tag', 'rp-ref-tag'])
    // The name a cut chip would lose is in its tooltip, without the star.
    expect(refs[0].title).toBe('main')
  })
})

describe('how many are drawn whole', () => {
  test('all of them when they fit', () => {
    expect(fitCount([40, 60, 50], 170, 6, 34)).toBe(3)
  })
  test('otherwise as many as leave room for the +N — never a chip squeezed to make one more fit', () => {
    // 40 + 6 + 60 + 6 = 112, +34 for the "+N" = 146 ≤ 150; a third (50) would not leave room.
    expect(fitCount([40, 60, 50, 30], 150, 6, 34)).toBe(2)
    expect(fitCount([40, 60, 50, 30], 100, 6, 34)).toBe(1)
  })
  test('never none: the first is the one that matters, and is cut alone rather than hidden', () => {
    expect(fitCount([120, 60], 50, 6, 34)).toBe(1)
  })
  test('a pane that is not laid out fits everything, and no refs is no chips', () => {
    expect(fitCount([40, 60], 0, 6, 34)).toBe(2)
    expect(fitCount([], 200, 6, 34)).toBe(0)
  })
})

describe('the row', () => {
  const refs = headerRefs(['HEAD -> main', 'origin/main', 'tag: v1.37.0', 'tag: ext-v1.35.0'])
  // jsdom lays nothing out: give the box a width and each chip one, by its text.
  const layOut = (boxWidth: number) => {
    jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('rp-refs') ? boxWidth : 0
    })
    jest.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('rp-ref') ? 16 + (this.textContent?.length ?? 0) * 7 : 0
    })
  }
  afterEach(() => jest.restoreAllMocks())
  const drawn = () => Array.from(document.querySelectorAll('.rp-refs > .rp-ref:not(.rp-ref--off)')).map(c => c.textContent)

  test('room for all: every name, whole, and no +N', () => {
    layOut(600)
    renderWithProviders(<RefOverflow refs={refs} />)
    expect(drawn()).toEqual(['★ main', 'origin/main', 'v1.37.0', 'ext-v1.35.0'])
    expect(document.querySelector('.rp-refs-more')).toBeNull()
  })

  test('a narrow panel: the branches whole, the rest behind a +N that lists them whole', () => {
    // ★ main (58) + origin/main (93) + two gaps (12) + the +N (34) = 197.
    layOut(200)
    renderWithProviders(<RefOverflow refs={refs} />)
    expect(drawn()).toEqual(['★ main', 'origin/main'])
    const more = screen.getByLabelText('2 more references on this commit')
    expect(more.textContent).toBe('+2')
    expect(document.querySelector('.rp-refs-pop')).toBeNull()
    fireEvent.click(more)
    expect(Array.from(document.querySelectorAll('.rp-refs-pop .rp-ref')).map(c => c.textContent)).toEqual(['v1.37.0', 'ext-v1.35.0'])
    // A press elsewhere puts the list away.
    fireEvent.pointerDown(document.body)
    expect(document.querySelector('.rp-refs-pop')).toBeNull()
  })

  test('room for one only: it is the chip that may be cut, and says so to the stylesheet', () => {
    layOut(60)
    renderWithProviders(<RefOverflow refs={refs} />)
    expect(drawn()).toEqual(['★ main'])
    expect(document.querySelector('.rp-refs')!.className).toContain('rp-refs--one')
    expect((document.querySelector('.rp-refs > .rp-ref') as HTMLElement).title).toBe('main')
    // The others are off stage, not gone: they are measured again when the panel widens.
    expect(document.querySelectorAll('.rp-refs > .rp-ref--off')).toHaveLength(3)
  })

  test('no refs, no row', () => {
    const { container } = renderWithProviders(<RefOverflow refs={[]} />)
    expect(container.querySelector('.rp-refs')).toBeNull()
  })
})
