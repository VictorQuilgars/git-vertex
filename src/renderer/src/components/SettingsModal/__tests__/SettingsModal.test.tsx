import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsModal from '../SettingsModal'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

describe('SettingsModal — navigation', () => {
  test('does not render two nav items with the same label (regression: General/General collision)', async () => {
    installMockGitAPI()
    renderWithProviders(<SettingsModal onClose={() => {}} showToast={() => {}} />)
    await waitFor(() => expect(screen.getByText('Identity & profiles')).toBeInTheDocument())

    const items = screen.getAllByRole('button').map(b => b.textContent?.trim())
    const labels = items.filter((t): t is string => !!t && t.length > 0)
    const duplicates = labels.filter((t, i) => labels.indexOf(t) !== i)
    expect(duplicates).toEqual([])
  })

  test('the three v1.20.0 sections appear in the nav on desktop', async () => {
    installMockGitAPI()
    renderWithProviders(<SettingsModal onClose={() => {}} showToast={() => {}} />)
    await waitFor(() => expect(screen.getByText('Identity & profiles')).toBeInTheDocument())

    expect(screen.getByRole('button', { name: /ssh/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /external tools/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /behavior/i })).toBeInTheDocument()
  })

  test('embedded (VS Code host) hides SSH, External Tools and About', async () => {
    installMockGitAPI()
    renderWithProviders(<SettingsModal embedded onClose={() => {}} showToast={() => {}} />)
    await waitFor(() => expect(screen.getByText('Identity & profiles')).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: /^ssh$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /external tools/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^about$/i })).not.toBeInTheDocument()
    // Behavior stays available embedded — it's not a desktop-only concern.
    expect(screen.getByRole('button', { name: /behavior/i })).toBeInTheDocument()
  })
})

describe('SettingsModal — Behavior section (General fields folded in, v1.20.0)', () => {
  async function openBehavior() {
    installMockGitAPI()
    renderWithProviders(<SettingsModal onClose={() => {}} showToast={() => {}} />)
    await waitFor(() => expect(screen.getByText('Identity & profiles')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /behavior/i }))
  }

  test('shows default branch name, auto-fetch interval and submodule fields', async () => {
    await openBehavior()
    expect(await screen.findByPlaceholderText('main')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton')).toBeInTheDocument() // Auto-Fetch Interval
    expect(screen.getByRole('checkbox', { name: /keep submodules up to date/i })).toBeInTheDocument()
    // Pre-existing fields must still be there — nothing lost in the move.
    expect(screen.getByRole('checkbox', { name: /auto-stash on checkout/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /warn before a conflict/i })).toBeInTheDocument()
  })

  test('editing the default branch name persists it', async () => {
    const api = installMockGitAPI()
    renderWithProviders(<SettingsModal onClose={() => {}} showToast={() => {}} />)
    await waitFor(() => expect(screen.getByText('Identity & profiles')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /behavior/i }))

    const branchInput = await screen.findByPlaceholderText('main')
    await userEvent.type(branchInput, 'develop')

    await waitFor(() => expect(api.settingsSet).toHaveBeenCalledWith('defaultBranchName', 'develop'))
  })
})

describe('SettingsModal — External Tools section (v1.20.0)', () => {
  test('shows editor, diff tool, merge tool and terminal fields', async () => {
    installMockGitAPI()
    renderWithProviders(<SettingsModal onClose={() => {}} showToast={() => {}} />)
    await waitFor(() => expect(screen.getByText('Identity & profiles')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /external tools/i }))

    expect(await screen.findByPlaceholderText('code')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('opendiff')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('opendiff -merge')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('iTerm')).toBeInTheDocument()
  })
})

describe('SettingsModal — SSH section (v1.20.0)', () => {
  async function openSsh() {
    installMockGitAPI()
    renderWithProviders(<SettingsModal onClose={() => {}} showToast={() => {}} />)
    await waitFor(() => expect(screen.getByText('Identity & profiles')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /^ssh$/i }))
  }

  test('shows the use-agent toggle and key fields', async () => {
    await openSsh()
    expect(await screen.findByRole('checkbox', { name: /use local ssh agent/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /browse/i }).length).toBe(2)
    expect(screen.getByRole('button', { name: /generate/i })).toBeInTheDocument()
  })

  test('generating a key pair fills the private/public key fields', async () => {
    const api = installMockGitAPI({
      sshGenerateKey: jest.fn().mockResolvedValue({
        privateKey: '/home/me/.ssh/id_ed25519_gitvertex',
        publicKey: '/home/me/.ssh/id_ed25519_gitvertex.pub',
      }),
    })
    renderWithProviders(<SettingsModal onClose={() => {}} showToast={() => {}} />)
    await waitFor(() => expect(screen.getByText('Identity & profiles')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /^ssh$/i }))

    await userEvent.click(await screen.findByRole('button', { name: /generate/i }))

    expect(api.sshGenerateKey).toHaveBeenCalled()
    await waitFor(() => {
      expect(api.settingsSet).toHaveBeenCalledWith('sshPrivateKey', '/home/me/.ssh/id_ed25519_gitvertex')
      expect(api.settingsSet).toHaveBeenCalledWith('sshPublicKey', '/home/me/.ssh/id_ed25519_gitvertex.pub')
    })
    expect(screen.getByDisplayValue('/home/me/.ssh/id_ed25519_gitvertex')).toBeInTheDocument()
  })

  test('browsing for a private key sets the field from the picked path', async () => {
    const api = installMockGitAPI({
      sshBrowseKey: jest.fn().mockResolvedValue({ path: '/home/me/.ssh/custom_key' }),
    })
    renderWithProviders(<SettingsModal onClose={() => {}} showToast={() => {}} />)
    await waitFor(() => expect(screen.getByText('Identity & profiles')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /^ssh$/i }))

    const browseButtons = await screen.findAllByRole('button', { name: /browse/i })
    await userEvent.click(browseButtons[0]) // private key row is first

    expect(api.sshBrowseKey).toHaveBeenCalledWith('private')
    await waitFor(() => expect(api.settingsSet).toHaveBeenCalledWith('sshPrivateKey', '/home/me/.ssh/custom_key'))
  })
})

// The git binary block. It exists because a version number on its own is not
// actionable on a machine that has Apple's git and Homebrew's: the notice named
// 2.39 while `git --version` in the user's terminal said something newer.
describe('SettingsModal — git binary', () => {
  test('shows the version AND the path of the git in use', async () => {
    installMockGitAPI()
    renderWithProviders(<SettingsModal onClose={() => {}} showToast={() => {}} />)
    await waitFor(() => expect(screen.getByText('Identity & profiles')).toBeInTheDocument())

    expect(await screen.findByText('git 2.50.0')).toBeInTheDocument()
    expect(screen.getByText('/opt/homebrew/bin/git')).toBeInTheDocument()
    // How it was chosen, or "why that one?" has no answer.
    expect(screen.getByText(/login shell PATH/i)).toBeInTheDocument()
  })

  test('a forced path is persisted and re-resolved without a restart', async () => {
    const api = installMockGitAPI({
      resolveGitBinary: jest.fn().mockResolvedValue({
        version: '2.51.0', path: '/custom/git', source: 'setting',
      }),
    })
    renderWithProviders(<SettingsModal onClose={() => {}} showToast={() => {}} />)
    await waitFor(() => expect(screen.getByText('Identity & profiles')).toBeInTheDocument())

    await userEvent.type(await screen.findByPlaceholderText(/opt\/homebrew\/bin\/git/), '/custom/git')
    await userEvent.click(screen.getByRole('button', { name: /apply and check/i }))

    await waitFor(() => expect(api.settingsSet).toHaveBeenCalledWith('gitBinaryPath', '/custom/git'))
    expect(api.resolveGitBinary).toHaveBeenCalledWith('/custom/git')
    // The block must show what the app will actually use from now on.
    expect(await screen.findByText('git 2.51.0')).toBeInTheDocument()
    expect(screen.getByText('/custom/git')).toBeInTheDocument()
  })

  test('a path that will not run says so instead of reporting success', async () => {
    const showToast = jest.fn()
    installMockGitAPI({
      resolveGitBinary: jest.fn().mockResolvedValue({
        version: null, path: '/nope/git', source: 'setting',
      }),
    })
    renderWithProviders(<SettingsModal onClose={() => {}} showToast={showToast} />)
    await waitFor(() => expect(screen.getByText('Identity & profiles')).toBeInTheDocument())

    await userEvent.type(await screen.findByPlaceholderText(/opt\/homebrew\/bin\/git/), '/nope/git')
    await userEvent.click(screen.getByRole('button', { name: /apply and check/i }))

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('/nope/git is not executable.', 'err'))
  })

  test('embedded (VS Code host) does not show it at all', async () => {
    installMockGitAPI()
    renderWithProviders(<SettingsModal embedded onClose={() => {}} showToast={() => {}} />)
    await waitFor(() => expect(screen.getByText('Identity & profiles')).toBeInTheDocument())

    // VS Code hands the extension host a real shell environment, so there is
    // nothing to correct and nothing to choose.
    expect(screen.queryByText('git binary')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /apply and check/i })).not.toBeInTheDocument()
  })
})
