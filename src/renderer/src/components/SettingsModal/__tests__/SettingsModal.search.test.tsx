import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsModal from '../SettingsModal'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// Nine sections and their long lists: the way to one control was to walk
// them. The box above the nav matches a section by its name or by any of its
// text, and moves to the first match when the open section is not one.

const render = () => renderWithProviders(<SettingsModal onClose={() => {}} showToast={() => {}} />)
const navLabels = () => Array.from(document.querySelectorAll('.stg-nav-item')).map(el => el.textContent?.trim())

beforeEach(() => installMockGitAPI())
afterEach(() => localStorage.clear())

test('a word from inside a section finds it, and the view moves there', async () => {
  const { container } = render()
  await waitFor(() => expect(container.querySelector('.stg-nav-item.active')).toBeInTheDocument())
  await userEvent.type(screen.getByLabelText('Search settings…'), 'autolink')
  await waitFor(() => expect(navLabels()).toEqual(['GitHub']))
  expect(container.querySelector('.stg-nav-item.active')!.textContent).toMatch(/GitHub/)
})

test('a section name still works, and clearing the box brings everything back', async () => {
  render()
  const all = navLabels().length
  expect(all).toBeGreaterThan(5)
  const box = screen.getByLabelText('Search settings…')
  await userEvent.type(box, 'appearance')
  await waitFor(() => expect(navLabels()).toContain('Appearance'))
  expect(navLabels().length).toBeLessThan(all)
  await userEvent.clear(box)
  await waitFor(() => expect(navLabels().length).toBe(all))
})

test('nothing matching says so rather than showing an empty column', async () => {
  render()
  await userEvent.type(screen.getByLabelText('Search settings…'), 'zzzz-nothing')
  expect(await screen.findByText('No setting matches')).toBeInTheDocument()
})
