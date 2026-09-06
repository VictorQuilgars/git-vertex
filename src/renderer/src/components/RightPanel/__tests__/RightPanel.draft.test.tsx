import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LanguageProvider } from '../../../i18n/LanguageContext'
import { SettingsProvider } from '../../../contexts/SettingsContext'
import RightPanel from '../RightPanel'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

const wip = { hash: '__WIP__' } as any
function panel(repoPath = '/repo', selectedCommit = wip) {
  return <RightPanel repoPath={repoPath} selectedCommit={selectedCommit} onCommitSuccess={jest.fn()}
    showToast={jest.fn()} onSelectCommit={jest.fn()} currentBranch="main" embedded />
}
beforeEach(() => {
  localStorage.clear()
  installMockGitAPI({
    getWorkingChanges: jest.fn().mockResolvedValue({ staged: [{ path: 'a.ts', status: 'M' }], unstaged: [], untracked: [] }),
    getLastCommitMessage: jest.fn().mockResolvedValue({ message: 'Previous commit' }),
    getMergeMessage: jest.fn().mockResolvedValue({ message: '' }),
    getCommitFiles: jest.fn().mockResolvedValue({ files: [] }),
    getLog: jest.fn().mockResolvedValue({ commits: [] }),
    commit: jest.fn().mockResolvedValue({ success: false, error: 'Hook rejected commit' }),
  })
})

test('leaving WIP, changing repository and returning restores the right message', async () => {
  const view = render(panel(), { wrapper: ({ children }) => <LanguageProvider><SettingsProvider>{children}</SettingsProvider></LanguageProvider> })
  await userEvent.type(screen.getByPlaceholderText(/commit message/i), 'My draft')
  view.rerender(panel('/repo', null as any))
  view.rerender(panel('/other'))
  expect(screen.getByPlaceholderText(/commit message/i)).toHaveValue('')
  view.rerender(panel())
  expect(screen.getByPlaceholderText(/commit message/i)).toHaveValue('My draft')
})

test('an amend armed for a commit that is no longer HEAD is disarmed on return', async () => {
  ;(window.gitAPI.getLastCommitMessage as jest.Mock).mockResolvedValue({ message: 'Previous commit', hash: 'a'.repeat(40) })
  const view = renderWithProviders(panel())
  await screen.findByTitle('a.ts')
  await userEvent.click(screen.getByLabelText(/amend previous commit/i))
  await waitFor(() => expect(screen.getByPlaceholderText(/commit message/i)).toHaveValue('Previous commit'))
  await userEvent.type(screen.getByPlaceholderText(/commit message/i), ' reworded')
  view.unmount()
  // Same HEAD: the box stays checked and the edit is kept.
  const same = renderWithProviders(panel())
  await screen.findByTitle('a.ts')
  expect(screen.getByLabelText(/amend previous commit/i)).toBeChecked()
  await waitFor(() => expect(screen.getByPlaceholderText(/commit message/i)).toHaveValue('Previous commit reworded'))
  same.unmount()
  // HEAD moved on (a commit from a terminal, say): the amend is disarmed and its text dropped.
  ;(window.gitAPI.getLastCommitMessage as jest.Mock).mockResolvedValue({ message: 'Newer commit', hash: 'b'.repeat(40) })
  renderWithProviders(panel())
  await waitFor(() => expect(screen.getByLabelText(/amend previous commit/i)).not.toBeChecked())
  expect(screen.getByPlaceholderText(/commit message/i)).toHaveValue('')
})

test('failed commits keep their message; successful commits clear the persisted draft', async () => {
  const view = renderWithProviders(panel())
  await screen.findByTitle('a.ts')
  await userEvent.type(screen.getByPlaceholderText(/commit message/i), 'My draft')
  const commitButton = () => document.querySelector('.st2-commit-btn') as HTMLButtonElement
  await userEvent.click(commitButton())
  await waitFor(() => expect(window.gitAPI.commit).toHaveBeenCalledWith('My draft', false))
  view.unmount()
  const restored = renderWithProviders(panel())
  expect(screen.getByPlaceholderText(/commit message/i)).toHaveValue('My draft')
  ;(window.gitAPI.commit as jest.Mock).mockResolvedValue({ success: true })
  await screen.findByTitle('a.ts')
  await userEvent.click(commitButton())
  await waitFor(() => expect(screen.getByPlaceholderText(/commit message/i)).toHaveValue(''))
  restored.unmount()
  renderWithProviders(panel())
  expect(screen.getByPlaceholderText(/commit message/i)).toHaveValue('')
})
