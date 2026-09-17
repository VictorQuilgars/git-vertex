import { fireEvent, render, screen } from '@testing-library/react'
import ThemeBuilder from '../ThemeBuilder'
import { SEED_KEYS } from '../../../../../main/theme-validate'

const previewSeeds = jest.fn()
const palette = Object.fromEntries(SEED_KEYS.map(k => [k, '#334455']))
jest.mock('../../../i18n/LanguageContext', () => ({ useLang: () => ({ t: (k: string) => k }) }))
jest.mock('../builderStore', () => ({ useThemeBuilder: () => ({ open: true, from: 'test' }), closeThemeBuilder: jest.fn() }))
jest.mock('../../../contexts/SettingsContext', () => ({
  useSettings: () => ({ get: () => 'test', set: jest.fn(), previewSeeds, appliedTheme: 'theme-draft' }),
  getInstalledThemes: () => [], DRAFT_THEME_ID: 'theme-draft', setInstalledThemes: jest.fn(),
}))
jest.mock('../seeds', () => ({
  ...jest.requireActual('../seeds'), seedsOfTheme: () => palette,
}))

test('hex editing accepts partial input and previews only complete colours', () => {
  render(<ThemeBuilder />)
  const hex = screen.getByLabelText('accent hex')
  fireEvent.change(hex, { target: { value: '#12' } })
  expect(hex).toHaveValue('#12')
  fireEvent.change(hex, { target: { value: '#123456' } })
  expect(previewSeeds).toHaveBeenLastCalledWith(expect.objectContaining({ accent: '#123456' }))
  fireEvent.change(hex, { target: { value: '#bad' } })
  fireEvent.blur(hex)
  expect(hex).toHaveValue('#123456')
})

test('selection blocks app actions and exposes direct colour controls', () => {
  const action = jest.fn()
  const style = document.createElement('style')
  style.textContent = '.example { background: var(--seed-accent); }'
  document.head.appendChild(style)
  render(<><button className="example" onClick={action}>Example</button><ThemeBuilder /></>)
  fireEvent.click(screen.getByText('builder.inspect'))
  fireEvent.click(screen.getByText('Example'))
  expect(action).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('builder.edit accent'), { target: { value: '#abcdef' } })
  expect(previewSeeds).toHaveBeenLastCalledWith(expect.objectContaining({ accent: '#ABCDEF' }))
  fireEvent.keyDown(document, { key: 'Escape' })
  fireEvent.click(screen.getAllByText('Example')[0])
  expect(action).toHaveBeenCalledTimes(1)
  style.remove()
})

test('undo restores one colour gesture without changing other colours', () => {
  render(<ThemeBuilder />)
  const accent = screen.getByLabelText('accent')
  const undo = screen.getByRole('button', { name: 'builder.undoColor accent' })
  expect(undo).toBeDisabled()
  fireEvent.pointerDown(accent)
  fireEvent.change(accent, { target: { value: '#112233' } })
  fireEvent.change(accent, { target: { value: '#abcdef' } })
  fireEvent.change(screen.getByLabelText('surface'), { target: { value: '#223344' } })
  fireEvent.click(undo)
  expect(screen.getByLabelText('accent hex')).toHaveValue('#334455')
  expect(screen.getByLabelText('surface hex')).toHaveValue('#223344')
  expect(undo).toBeDisabled()
  fireEvent.focus(screen.getByLabelText('accent hex'))
  fireEvent.change(screen.getByLabelText('accent hex'), { target: { value: '#123456' } })
  fireEvent.blur(screen.getByLabelText('accent hex'))
  fireEvent.focus(screen.getByLabelText('accent hex'))
  fireEvent.change(screen.getByLabelText('accent hex'), { target: { value: '#654321' } })
  fireEvent.click(undo)
  expect(screen.getByLabelText('accent hex')).toHaveValue('#123456')
  fireEvent.click(undo)
  expect(screen.getByLabelText('accent hex')).toHaveValue('#334455')
})

test('inspection keeps the selected element highlighted while editing and scrolling the builder', () => {
  const { container } = render(<><div data-testid="preview">Preview</div><ThemeBuilder /></>)
  fireEvent.click(screen.getByText('builder.inspect'))
  const preview = screen.getByTestId('preview')
  fireEvent.mouseMove(preview)
  const outline = container.querySelector('.thb-highlight') as HTMLElement
  expect(outline.style.display).toBe('block')
  jest.spyOn(preview, 'getBoundingClientRect').mockReturnValue({ left: 42, top: 12, width: 100, height: 30 } as DOMRect)
  fireEvent.click(preview)
  fireEvent.mouseMove(document.body)
  fireEvent.mouseOver(screen.getByRole('dialog'))
  expect(outline.style.display).toBe('block')
  expect(outline.style.left).toBe('42px')
  fireEvent.scroll(screen.getByRole('dialog'))
  expect(outline.style.display).toBe('block')
  fireEvent.change(screen.getByLabelText('accent hex'), { target: { value: '#abcdef' } })
  expect(previewSeeds).toHaveBeenLastCalledWith(expect.objectContaining({ accent: '#ABCDEF' }))
  fireEvent.mouseMove(preview)
  expect(outline.style.display).toBe('block')
  fireEvent.blur(window)
  expect(outline.style.display).toBe('block')
  expect(outline.style.left).toBe('42px')
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(container.querySelector('.thb-highlight')).toBeNull()
})

// ── The 24 places, and where a seed paints ───────────────────────────────

test('the specimen offers one place per seed, and a click on one goes to its row with the keyboard on its swatch', () => {
  render(<ThemeBuilder />)
  const spec = screen.getByRole('region', { name: 'builder.places' })
  const spots = spec.querySelectorAll('.thb-spot[data-seed]')
  expect(new Set(Array.from(spots, s => s.getAttribute('data-seed'))).size).toBe(SEED_KEYS.length)
  expect(spots).toHaveLength(SEED_KEYS.length)
  // The word is the seed.
  expect(screen.getByRole('button', { name: 'text-2 — builder.seed.text-2' })).toHaveTextContent('text-2')
  // The list scrolls so the row lands just under the sticky specimen, not
  // centred behind it: list top 100, specimen 200 tall, row at 700 → +392.
  const list = spec.closest('.thb-groups') as HTMLElement
  const rect = (top: number, height: number) => ({ top, height, left: 0, width: 300, right: 300, bottom: top + height } as DOMRect)
  jest.spyOn(list, 'getBoundingClientRect').mockReturnValue(rect(100, 500))
  jest.spyOn(spec, 'getBoundingClientRect').mockReturnValue(rect(100, 200))
  const row = screen.getByLabelText('lane-7').closest('.thb-row') as HTMLElement
  jest.spyOn(row, 'getBoundingClientRect').mockReturnValue(rect(700, 40))
  let scrollTop = 0
  Object.defineProperty(list, 'scrollTop', { get: () => scrollTop, set: v => { scrollTop = v }, configurable: true })
  fireEvent.click(screen.getByRole('button', { name: 'lane-7 — builder.seed.lane' }))
  expect(scrollTop).toBe(392)
  const swatch = screen.getByLabelText('lane-7')
  expect(swatch).toHaveFocus()
  expect(row).toHaveClass('thb-row--flash')
  // The empty part of an area counts as its caption: the panel is `surface`.
  fireEvent.click(spec.querySelector('.thb-area--surface')!)
  expect(screen.getByLabelText('surface')).toHaveFocus()
  // Folded, the places give the list their room; the rows still hint, and the count still shows.
  fireEvent.click(screen.getByRole('button', { name: 'builder.placesHide' }))
  expect(spec.querySelectorAll('.thb-spot')).toHaveLength(0)
  fireEvent.mouseEnter(screen.getByLabelText('accent').closest('.thb-row')!)
  expect(spec).toHaveTextContent('accent · builder.placesOnScreen')
  fireEvent.click(screen.getByRole('button', { name: 'builder.placesShow' }))
  expect(spec.querySelectorAll('.thb-spot[data-seed]')).toHaveLength(SEED_KEYS.length)
})

test('hovering a seed boxes every place in the window it paints, and says how many', () => {
  const style = document.createElement('style')
  style.textContent = '.card { background: var(--seed-surface); } .card-title { color: var(--seed-surface); } .far { background: var(--seed-surface); }'
  document.head.appendChild(style)
  const { container } = render(<>
    <div className="card" data-testid="card"><span className="card-title" data-testid="title">Card</span></div>
    <div className="far" data-testid="far">far away</div>
    <ThemeBuilder />
  </>)
  const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height } as DOMRect)
  jest.spyOn(screen.getByTestId('card'), 'getBoundingClientRect').mockReturnValue(rect(10, 10, 200, 100))
  jest.spyOn(screen.getByTestId('title'), 'getBoundingClientRect').mockReturnValue(rect(20, 20, 50, 16))
  jest.spyOn(screen.getByTestId('far'), 'getBoundingClientRect').mockReturnValue(rect(10, 5000, 200, 100))
  const overlay = container.querySelector('.thb-places')!
  expect(overlay.children).toHaveLength(0)
  // From the list: the row of `surface`.
  fireEvent.mouseEnter(screen.getByLabelText('surface').closest('.thb-row')!)
  const boxes = Array.from(overlay.querySelectorAll('.thb-place'))
  expect(boxes.map(b => [b.className, (b as HTMLElement).style.left])).toEqual([
    ['thb-place thb-place--fill', '10px'], ['thb-place thb-place--ink', '20px'],
  ])
  expect(screen.getByRole('region', { name: 'builder.places' })).toHaveTextContent('surface · builder.placesOnScreen')
  expect(screen.getByRole('button', { name: 'surface — builder.seed.surface' })).toHaveClass('thb-spot--hint')
  fireEvent.mouseLeave(screen.getByLabelText('surface').closest('.thb-row')!)
  expect(overlay.children).toHaveLength(0)
  // From the specimen: a place hints its seed, leaving the specimen clears it.
  fireEvent.mouseOver(screen.getByRole('button', { name: 'surface — builder.seed.surface' }))
  expect(overlay.querySelectorAll('.thb-place')).toHaveLength(2)
  fireEvent.mouseLeave(screen.getByRole('region', { name: 'builder.places' }))
  expect(overlay.children).toHaveLength(0)
  style.remove()
})

test('the inspection outlines the element that answers, and says what each seed does there', () => {
  const style = document.createElement('style')
  style.textContent = '.pane { background: var(--seed-canvas); color: var(--seed-text); } .pane-btn { background: var(--seed-accent); }'
  document.head.appendChild(style)
  const { container } = render(<>
    <div className="pane" data-testid="pane"><div className="pad" data-testid="pad">padding <button className="pane-btn"><span data-testid="label">Go</span></button></div></div>
    <ThemeBuilder />
  </>)
  const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height } as DOMRect)
  jest.spyOn(screen.getByTestId('pane'), 'getBoundingClientRect').mockReturnValue(rect(100, 0, 600, 400))
  jest.spyOn(screen.getByTestId('pad'), 'getBoundingClientRect').mockReturnValue(rect(110, 10, 580, 380))
  fireEvent.click(screen.getByText('builder.inspect'))
  const outline = container.querySelector('.thb-highlight') as HTMLElement
  // Hovering the padding outlines the pane — what a click there will name.
  fireEvent.mouseMove(screen.getByTestId('pad'))
  expect(outline.style.left).toBe('100px')
  fireEvent.click(screen.getByTestId('pad'))
  expect(outline.style.left).toBe('100px')
  const rows = Array.from(container.querySelectorAll('.thb-quick-color'))
  expect(rows.map(r => [r.querySelector('.thb-seed-chip')!.textContent, r.querySelector('.thb-role-tag')!.textContent])).toEqual([
    ['canvas', 'builder.role.fill'], ['text', 'builder.role.ink'],
  ])
  // A label inside the button: the button's fill, and the ink from around, said so.
  fireEvent.click(screen.getByTestId('label'))
  const after = Array.from(container.querySelectorAll('.thb-quick-color'))
  expect(after.map(r => [r.querySelector('.thb-seed-chip')!.textContent, r.querySelector('.thb-role-tag')!.textContent])).toEqual([
    ['accent', 'builder.role.fill'], ['text', 'builder.role.ink — builder.role.inherited'],
  ])
  fireEvent.keyDown(document, { key: 'Escape' })
  style.remove()
})
