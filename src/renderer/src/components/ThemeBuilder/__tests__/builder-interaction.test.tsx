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
