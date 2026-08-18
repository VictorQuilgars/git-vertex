import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsModal from '../SettingsModal'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// Settings is a tab now, so leaving it is a click on another tab rather than a
// decision to close it — and React unmounts the body of a tab you are not
// looking at. Without this, every return landed back on the first section,
// which is the tab forgetting what you were doing.

const render = () => renderWithProviders(
  <SettingsModal onClose={() => {}} showToast={() => {}} />)

beforeEach(() => installMockGitAPI())
afterEach(() => localStorage.clear())

describe('the settings section', () => {
  test('opens on the first section when nothing was read yet', async () => {
    const { container } = render()
    await waitFor(() => expect(container.querySelector('.stg-nav-item.active')).toBeInTheDocument())

    expect(container.querySelector('.stg-nav-item.active')!.textContent).toMatch(/git|identity/i)
  })

  test('remembers the one you were on, across an unmount', async () => {
    const first = render()
    await waitFor(() => expect(screen.getAllByText(/appearance/i).length).toBeGreaterThan(0))

    await userEvent.click(screen.getAllByText(/appearance/i)[0])
    expect(localStorage.getItem('gv-settings-section')).toBe('appearance')

    // Leaving the tab unmounts the body; coming back mounts a fresh one.
    first.unmount()
    const { container } = render()

    await waitFor(() =>
      expect(container.querySelector('.stg-nav-item.active')!.textContent).toMatch(/appearance/i))
  })

  test('a section that no longer exists falls back rather than showing nothing', () => {
    localStorage.setItem('gv-settings-section', 'a-section-we-removed')

    const { container } = render()

    expect(container.querySelector('.stg-nav-item.active')!.textContent).toMatch(/git|identity/i)
  })
})
