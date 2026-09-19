import { render, screen, fireEvent, within } from '@testing-library/react'
import { LanguageProvider } from '../i18n/LanguageContext'
import DetailsToggle from '../../../../vscode-extension/src/webview/DetailsToggle'

// The panel's details switch, beside the search: one half shows or hides them
// (Alt: the other side, as a choice), the chevron says where they go — Auto,
// Right, Bottom, each drawn as the panel it makes.

const toggle = (over: Partial<React.ComponentProps<typeof DetailsToggle>> = {}) => {
  const p = { visible: true, side: 'right' as const, location: 'auto' as const, autoSide: 'right' as const,
    onToggle: jest.fn(), onPick: jest.fn(), ...over }
  render(<LanguageProvider><DetailsToggle {...p} /></LanguageProvider>)
  return p
}

describe('the details switch', () => {
  test('its main half hides what is shown and shows what is hidden', () => {
    const p = toggle()
    fireEvent.click(screen.getByRole('button', { name: 'Hide Details Panel' }))
    expect(p.onToggle).toHaveBeenCalledWith(false)
    document.body.innerHTML = ''
    toggle({ visible: false })
    expect(screen.getByRole('button', { name: 'Show Details Panel' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('with Alt it asks for the other side, and its tooltip says which beforehand', () => {
    const p = toggle({ side: 'right' })
    const main = screen.getByRole('button', { name: 'Hide Details Panel' })
    expect(main.title).toMatch(/Show Details Panel on Bottom$/)
    fireEvent.click(main, { altKey: true })
    expect(p.onToggle).toHaveBeenCalledWith(true)
  })

  test('the chevron lists the three placements, the one in force checked', () => {
    toggle({ location: 'bottom' })
    fireEvent.click(screen.getByRole('button', { name: 'Details Panel Placement' }))
    const menu = screen.getByRole('menu', { name: 'Details Panel Placement' })
    const items = within(menu).getAllByRole('menuitemradio')
    expect(items.map(i => i.textContent)).toEqual(['AAuto', 'Right', 'Bottom'])
    expect(items.map(i => i.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true'])
  })

  test('Auto is drawn as the side it would pick now, and says so', () => {
    toggle({ autoSide: 'bottom' })
    fireEvent.click(screen.getByRole('button', { name: 'Details Panel Placement' }))
    const auto = screen.getByRole('menuitemradio', { name: /Auto/ })
    expect(auto.querySelector('.gvt-placement-thumb--bottom.gvt-placement-thumb--auto')).not.toBeNull()
    expect(auto.title).toMatch(/currently bottom/)
  })

  test('a placement picked is handed over and the menu closes; Escape closes it too', () => {
    const p = toggle()
    fireEvent.click(screen.getByRole('button', { name: 'Details Panel Placement' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Bottom/ }))
    expect(p.onPick).toHaveBeenCalledWith('bottom')
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Details Panel Placement' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
