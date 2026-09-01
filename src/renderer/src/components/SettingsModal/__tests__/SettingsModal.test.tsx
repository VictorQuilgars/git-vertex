import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsModal from '../SettingsModal'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The settings page remembers the section you were last on (it is a tab, and
// leaving a tab unmounts its body). Each test here navigates, so each has to
// start from the same place rather than from wherever the last one stopped.
afterEach(() => localStorage.removeItem('gv-settings-section'))

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

describe('SettingsModal — GitHub sign-in', () => {
  async function openGitHub(embedded: boolean, api: Record<string, any> = {}) {
    const mock = installMockGitAPI(api)
    const showToast = jest.fn()
    renderWithProviders(
      <SettingsModal embedded={embedded} onClose={() => {}} showToast={showToast} />)
    await waitFor(() => expect(screen.getByText('Identity & profiles')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /github/i }))
    return { mock, showToast }
  }

  // The point of the lot. The panel used to offer a Personal Access Token and
  // nothing else, because desktop OAuth needs a gitgui:// deep link that VS Code
  // has no equivalent for — so everything already shipped behind a token (create
  // a PR, the PR and issue lists, #123 cards on private repos) was gated behind
  // "go to github.com and mint one". Sign-in now goes through VS Code's own
  // GitHub provider.
  test('embedded offers sign-in, not just a token field', async () => {
    await openGitHub(true)
    expect(await screen.findByRole('button', { name: /sign in with github/i })).toBeInTheDocument()
    // The token stays as the fallback — hosts without the provider need it.
    expect(screen.getByPlaceholderText('ghp_…')).toBeInTheDocument()
  })

  // Two hosts answer differently and the button has to read both. The extension
  // resolves the call itself; the desktop returns nothing and finishes later on
  // onGithubAuthComplete. Getting this backwards leaves the button spinning
  // forever on one product or the other.
  test('embedded resolves the sign-in itself', async () => {
    const { mock, showToast } = await openGitHub(true, {
      githubStartAuth: jest.fn().mockResolvedValue({ success: true, login: 'octocat' }),
      // Nobody on mount, somebody once the session exists — the real sequence.
      githubGetUser: jest.fn()
        .mockResolvedValueOnce({ user: null })
        .mockResolvedValue({ user: { login: 'octocat', avatar: 'x' }, source: 'vscode' }),
    })
    await userEvent.click(await screen.findByRole('button', { name: /sign in with github/i }))

    expect(mock.githubStartAuth).toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText('octocat')).toBeInTheDocument())
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/connect/i))
  })

  test('desktop leaves the button waiting for the OAuth callback', async () => {
    // The desktop handler returns undefined: the result arrives on an event.
    const { showToast } = await openGitHub(false, {
      githubStartAuth: jest.fn().mockResolvedValue(undefined),
    })
    await userEvent.click(await screen.findByRole('button', { name: /sign in with github/i }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /connecting/i })).toBeDisabled())
    expect(showToast).not.toHaveBeenCalled()
  })

  test('a cancelled sign-in says nothing', async () => {
    const { showToast } = await openGitHub(true, {
      githubStartAuth: jest.fn().mockResolvedValue({ success: false, error: 'cancelled' }),
    })
    await userEvent.click(await screen.findByRole('button', { name: /sign in with github/i }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /sign in with github/i })).toBeEnabled())
    expect(showToast).not.toHaveBeenCalled()
  })

  // VSCodium and other builds that do not bundle vscode.github-authentication.
  // A dialog that never opens is the worst answer; point at the token instead.
  test('a host with no GitHub provider says so', async () => {
    const { showToast } = await openGitHub(true, {
      githubStartAuth: jest.fn().mockResolvedValue({ success: false, error: 'no-provider' }),
    })
    await userEvent.click(await screen.findByRole('button', { name: /sign in with github/i }))

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(
      expect.stringMatching(/no github sign-in/i), 'err'))
  })

  // The first version of this button was honest and useless: it forgot a token
  // that was not there, found the VS Code session still live, and put the user
  // straight back on screen as connected. No extension API revokes a session —
  // so Disconnect means Git Vertex stops using it, and it has to actually stop.
  test('disconnecting a VS Code session really signs out of the panel', async () => {
    const { mock, showToast } = await openGitHub(true, {
      settingsGetAll: jest.fn().mockResolvedValue({}),
      githubGetUser: jest.fn()
        .mockResolvedValueOnce({ user: { login: 'octocat', avatar: 'x' }, source: 'vscode' })
        .mockResolvedValue({ user: null }),      // the host stopped using the session
      githubDisconnect: jest.fn().mockResolvedValue({ success: true, wasVsCodeSession: true }),
    })
    expect(await screen.findByText('octocat')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /disconnect/i }))

    expect(mock.githubDisconnect).toHaveBeenCalled()
    // Gone from the panel, and the way back in is offered again.
    await waitFor(() => expect(screen.queryByText('octocat')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /sign in with github/i })).toBeInTheDocument()
    // And it says where the account went, since we do not own it.
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/no longer uses your GitHub account/i))
  })

  test('disconnecting a token says the plain thing', async () => {
    const { showToast } = await openGitHub(true, {
      settingsGetAll: jest.fn().mockResolvedValue({ githubToken: 'ghp_x' }),
      githubGetUser: jest.fn()
        .mockResolvedValueOnce({ user: { login: 'octocat', avatar: 'x' }, source: 'pat' })
        .mockResolvedValue({ user: null }),
      githubDisconnect: jest.fn().mockResolvedValue({ success: true, wasVsCodeSession: false }),
    })
    await userEvent.click(await screen.findByRole('button', { name: /disconnect/i }))

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(
      expect.not.stringMatching(/Accounts menu/i)))
  })

  // The defect a manual test cannot see: a VS Code session writes nothing to our
  // settings, so gating the mount fetch on a stored token showed "Sign in with
  // GitHub" to someone whose PRs and issues were loading fine. It only appears
  // on REOPENING the panel — right after clicking Connect the state is in memory.
  test('embedded shows the session on mount, with no stored token', async () => {
    await openGitHub(true, {
      settingsGetAll: jest.fn().mockResolvedValue({}),          // no PAT anywhere
      githubGetUser: jest.fn().mockResolvedValue({ user: { login: 'octocat', avatar: 'x' }, source: 'vscode' }),
    })
    expect(await screen.findByText('octocat')).toBeInTheDocument()
    // And it says where the identity comes from — otherwise "Disconnect" reads
    // as a promise we cannot keep, since that session is VS Code's to revoke.
    expect(screen.getByText(/signed in through vs code/i)).toBeInTheDocument()
  })

  test('desktop still only asks when it holds a token', async () => {
    const { mock } = await openGitHub(false, {
      settingsGetAll: jest.fn().mockResolvedValue({}),
      githubGetUser: jest.fn().mockResolvedValue({ user: null }),
    })
    expect(mock.githubGetUser).not.toHaveBeenCalled()
  })
})

// #70 — a model and instructions PER FEATURE, plus one standing block. The
// page is what writes the keys the two hosts read, so the contract under
// test is the keys, not the pixels.
describe('SettingsModal — per-feature AI overrides', () => {
  const open = async (api: Record<string, any> = {}) => {
    const mock = installMockGitAPI(api)
    renderWithProviders(<SettingsModal onClose={() => {}} showToast={() => {}} />)
    await waitFor(() => expect(screen.getByText('Identity & profiles')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /ai/i }))
    await waitFor(() => expect(screen.getByText('Standing instructions (every AI feature)')).toBeInTheDocument())
    return mock
  }

  test('every feature is a section, in the open', async () => {
    await open()
    for (const label of ['Commit messages', 'Explain a commit', 'Conflict resolution',
      'Commit search', 'Filter queries', 'Pull request descriptions', 'Issue drafting']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    // and every one names the model it will fall back to
    expect(screen.getAllByText(/The model used for/).length).toBe(7)
  })

  test('a chip writes its fragment, then stands down', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Focus on the why' }))
    const explain = screen.getAllByPlaceholderText('Instructions for this feature only…')[1]
    expect(explain).toHaveValue('Focus on the why')
    // an offer already taken is not an offer
    expect(screen.queryByRole('button', { name: 'Focus on the why' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Call out risky changes' }))
    expect(explain).toHaveValue('Focus on the why\nCall out risky changes')
  })

  test('saving writes the standing block and every feature key', async () => {
    const mock = await open()
    await userEvent.type(
      screen.getByPlaceholderText(/Keep answers plain/), 'No exclamation marks.')
    await userEvent.click(screen.getByText('Explain a commit'))
    await userEvent.type(
      screen.getAllByPlaceholderText('Instructions for this feature only…')[1], 'Focus on the why.')
    await userEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(mock.settingsSet).toHaveBeenCalledWith('aiGlobalInstructions', 'No exclamation marks.'))
    expect(mock.settingsSet).toHaveBeenCalledWith('aiFeatureInstructions:explain', 'Focus on the why.')
    // A choice is a PAIR — model and the provider whose key it runs on — and
    // no choice writes both halves empty.
    expect(mock.settingsSet).toHaveBeenCalledWith('aiFeatureModel:commit', '')
    expect(mock.settingsSet).toHaveBeenCalledWith('aiFeatureProvider:commit', '')
    expect(mock.settingsSet).toHaveBeenCalledWith('aiDefaultProvider', expect.any(String))
    expect(mock.settingsSet).toHaveBeenCalledWith('aiDefaultModel', expect.any(String))
    // every credential is written — a key belongs to its provider, not to a
    // selection — and the legacy mirror keeps old readers answering.
    expect(mock.settingsSet).toHaveBeenCalledWith('aiAnthropicKey', '')
    expect(mock.settingsSet).toHaveBeenCalledWith('aiProvider', expect.any(String))
  })

  test('every feature says which temperament it rewards', async () => {
    await open()
    // one line under each heading; a reasoning model's tax on one-liners is
    // said where the choice is made, not learned from an empty reply.
    expect(screen.getAllByText(/a fast, small model shines here/).length).toBe(3)
    expect(screen.getAllByText(/earns its cost here/).length).toBe(3)
    expect(screen.getAllByText(/mid-tier model does well/).length).toBe(1)
  })

  test('the providers zone lists all four, keyed or not', async () => {
    await open()
    for (const name of ['Anthropic (Claude)', 'Google (Gemini)', 'Groq', 'OpenAI']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
    // three have no key and say so; none of them is an "active" anything
    expect(screen.getAllByText('No key').length).toBeGreaterThanOrEqual(3)
  })
})
