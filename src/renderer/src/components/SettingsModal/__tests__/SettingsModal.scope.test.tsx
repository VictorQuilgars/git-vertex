import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsModal from '../SettingsModal'
import { SECTIONS } from '../shared'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The page mixed two kinds of change without saying so (#197): what is this
// app's, and what writes GIT's OWN global configuration, which every git client
// on the machine then reads. And the save modes differed from one field to the
// next with nothing on screen to say which was which.
//
// The rule these tests hold: a chip where — and ONLY where — ~/.gitconfig is
// written, and every block says once when it is kept.

const render = () => renderWithProviders(<SettingsModal onClose={() => {}} showToast={() => {}} />)
const go = async (id: string) =>
  userEvent.click(document.querySelector<HTMLElement>(`.stg-nav-item[data-section="${id}"]`)!)
/** The chip's whole text is "Git global · <the key it writes>". */
const chipIn = (label: string | RegExp) => field(label).querySelector('.stg-scope')

beforeEach(() => installMockGitAPI())
afterEach(() => localStorage.clear())

const field = (label: string | RegExp) => screen.getByText(label).closest('.stg-field')!

test('the identity is marked as writing the global git configuration, key included', async () => {
  render()
  await waitFor(() => expect(screen.getByText('Name')).toBeInTheDocument())
  const chip = chipIn('Name')!
  expect(chip).toHaveTextContent('Git global')
  expect(chip).toHaveTextContent('user.name')
  expect(chip.getAttribute('title')).toContain('~/.gitconfig')
  expect(chipIn('Email')).toHaveTextContent('user.email')
})

test('the SSH key is marked too — it writes core.sshCommand for every git on the machine', async () => {
  render()
  await go('ssh')
  await waitFor(() => expect(screen.getByText('SSH Private Key')).toBeInTheDocument())
  expect(chipIn('SSH Private Key')).toHaveTextContent('core.sshCommand')
  expect(chipIn('Use local SSH agent')).toHaveTextContent('core.sshCommand')
  // The public key is stored and never written to git's config: no chip.
  expect(chipIn('SSH Public Key')).toBeNull()
})

test('a setting that is only this app\'s carries no chip, however git-shaped it looks', async () => {
  render()
  await waitFor(() => expect(screen.getByText('GPG signing')).toBeInTheDocument())
  // Signing adds -S to the commits this app makes; it writes nothing to
  // ~/.gitconfig, and a chip saying otherwise would be the same lie the page
  // was already telling, in a smaller font.
  expect(field(/Sign commits/).querySelector('.stg-scope')).toBeNull()
  expect(field('Force a path (optional)').querySelector('.stg-scope')).toBeNull()
})

test('every section says when it is saved, once', async () => {
  const { container } = render()
  await waitFor(() => expect(container.querySelector('.stg-nav-item')).toBeInTheDocument())
  // About holds no setting — nothing there is saved, so nothing says when.
  const withSettings = SECTIONS.filter(id => id !== 'about')
  const seen: string[] = []
  for (const id of withSettings) {
    const nav = container.querySelector<HTMLElement>(`.stg-nav-item[data-section="${id}"]`)
    expect(nav).not.toBeNull()
    await userEvent.click(nav!)
    await waitFor(() => expect(container.querySelector('.stg-section')).toBeInTheDocument())
    if (container.querySelectorAll('.stg-savenote').length > 0) seen.push(id)
  }
  expect(seen).toEqual(withSettings)
})

test('the two modes are told apart in words, not by watching what happens', async () => {
  render()
  await waitFor(() => expect(screen.getByText('Name')).toBeInTheDocument())
  expect(screen.getByText('Nothing here is saved until you press Save.')).toBeInTheDocument()
  await go('graph')
  await waitFor(() => expect(screen.getByText('Saved as you change it.')).toBeInTheDocument())
})

test('the PATH explanation is there to open, not in the way', async () => {
  render()
  await waitFor(() => expect(screen.getByText('git binary')).toBeInTheDocument())
  const help = screen.getByText('Why this app has to look for git').closest('details')!
  expect(help).not.toHaveAttribute('open')
  expect(within(help).getByText(/does not inherit your terminal's PATH/)).toBeInTheDocument()
  // The setting itself did not fold away with the explanation.
  expect(screen.getByPlaceholderText(/homebrew/i)).toBeInTheDocument()
})
