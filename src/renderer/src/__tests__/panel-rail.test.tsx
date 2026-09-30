import { render, screen, fireEvent } from '@testing-library/react'
import { LanguageProvider } from '../i18n/LanguageContext'
import ActivityRail from '../../../../vscode-extension/src/webview/ActivityRail'
import { sidebarCounts } from '../components/Sidebar/sidebarCounts'

// The panel's rail (#277): a count under each icon, from the rule the section
// headers count with; the key that opens each view, in its tooltip; and the
// choice of a docked or a floating side view, at its foot.

// jsdom measures everything at 0, which folds every icon into "More…". Give
// the rail the height of a real panel so the icons are drawn.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 800 })
})
afterAll(() => { delete (HTMLElement.prototype as any).clientHeight })

const rail = (p: Partial<React.ComponentProps<typeof ActivityRail>> = {}) => {
  const props = { active: null, onSelect: jest.fn(), onPlacement: jest.fn(), placement: 'auto' as const, ...p }
  render(<LanguageProvider><ActivityRail {...props} /></LanguageProvider>)
  return props
}
const button = (name: string) => screen.getByRole('button', { name })

describe('the rail', () => {
  test('each icon carries its view’s count — the headers’ rule, over the host’s lists', () => {
    const counts = sidebarCounts({
      branches: [{}, {}, { remote: true }], stashes: [{}], tags: new Array(120).fill({}),
      remotes: [], worktrees: [{}], prs: [{}, {}], issues: undefined,
    })
    rail({ counts })
    const count = (name: string) => button(name).querySelector('.gv-rail-count')?.textContent
    expect(count('Branches')).toBe('2')
    expect(count('Stashes')).toBe('1')
    expect(count('Tags')).toBe('99+')
    expect(count('Pull Requests')).toBe('2')
    // A zero, and a list never asked for, draw nothing.
    expect(count('Remotes')).toBeUndefined()
    expect(count('Issues')).toBeUndefined()
    expect(button('Tags').title).toBe('Tags (120)\nShortcut: 7')
  })

  test('every icon names its key, 1 to 9 down the rail', () => {
    rail()
    const keys = screen.getAllByRole('button', { pressed: false }).map(b => b.getAttribute('aria-keyshortcuts'))
    expect(keys).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
  })

  test('the side view’s placement is chosen at the foot: auto, docked, floating', () => {
    const p = rail({ placement: 'docked' })
    fireEvent.click(button('Side View Placement'))
    const items = screen.getAllByRole('menuitem')
    expect(items.map(i => i.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('Auto'), expect.stringContaining('Always docked'), expect.stringContaining('Always floating'),
    ]))
    fireEvent.click(screen.getByText(/Always floating/))
    expect(p.onPlacement).toHaveBeenCalledWith('floating')
  })
})
