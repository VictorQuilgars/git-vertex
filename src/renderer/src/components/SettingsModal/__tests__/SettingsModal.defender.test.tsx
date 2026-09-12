import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsModal from '../SettingsModal'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The largest speed-up available on Windows is not in this codebase: Defender
// inspects every file git opens, and `git status` on a large repository opens
// all of them. So the settings page says so — where it applies, and nowhere
// else, because an administrator PowerShell command is noise on a Mac.
//
// It is shown and never run: it changes the machine's security settings, so
// it belongs to whoever owns the machine.

const render = () => renderWithProviders(<SettingsModal onClose={() => {}} showToast={() => {}} />)
const openBehaviour = async () => {
  const rendered = render()
  await waitFor(() => expect(screen.getAllByText(/notifications|behaviour|behavior/i).length).toBeGreaterThan(0))
  await userEvent.click(screen.getAllByText(/notifications|behaviour|behavior/i)[0])
  return rendered
}
const note = () => document.querySelector('.stg-defender')

const onPlatform = (platform: string, userAgent: string) => {
  ;(window as any).appInfo = { platform }
  Object.defineProperty(window.navigator, 'userAgent', { value: userAgent, configurable: true })
}

const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128 Electron/44'
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/128'

beforeEach(() => installMockGitAPI())
afterEach(() => { localStorage.clear(); onPlatform('darwin', MAC_UA) })

describe('the Defender note', () => {
  test('is there on Windows, with the command to read', async () => {
    onPlatform('win32', WINDOWS_UA)
    const { container } = await openBehaviour()
    await waitFor(() => expect(note()).toBeInTheDocument())
    expect(container.querySelector('.stg-defender-cmd code')!.textContent).toContain('Add-MpPreference -ExclusionPath')
  })

  test('is not there on macOS or Linux', async () => {
    onPlatform('darwin', MAC_UA)
    await openBehaviour()
    await waitFor(() => expect(screen.getAllByText(/notifications|behaviour|behavior/i).length).toBeGreaterThan(0))
    expect(note()).toBeNull()
  })

  // Inside the VS Code panel the shim claims platform 'vscode', so the window
  // asks the browser it is instead — and the advice is just as true there.
  test('is there in the panel when the panel is on Windows', async () => {
    onPlatform('vscode', WINDOWS_UA)
    await openBehaviour()
    await waitFor(() => expect(note()).toBeInTheDocument())
  })

  test('is not there in the panel on a Mac', async () => {
    onPlatform('vscode', MAC_UA)
    await openBehaviour()
    await waitFor(() => expect(screen.getAllByText(/notifications|behaviour|behavior/i).length).toBeGreaterThan(0))
    expect(note()).toBeNull()
  })

  test('the button copies the command rather than running anything', async () => {
    onPlatform('win32', WINDOWS_UA)
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await openBehaviour()
    await waitFor(() => expect(note()).toBeInTheDocument())

    await userEvent.click(document.querySelector('.stg-defender-copy') as HTMLElement)
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0][0]).toContain('Add-MpPreference -ExclusionPath')
    await waitFor(() => expect(document.querySelector('.stg-defender-copy')!.textContent).toMatch(/copied|copié/i))
  })
})
