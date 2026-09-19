import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RightPanel from '../RightPanel'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// Discarding asks first, and asks the HOST. It used to ask `window.confirm`,
// which a VS Code webview does not show and answers `false`: in the panel the
// trash, and every other discard, stopped at its question and did nothing.

const CHANGES = {
  staged: [{ path: 'src/a.ts', status: 'M' }],
  unstaged: [{ path: 'src/b.ts', status: 'M' }],
  untracked: ['notes.md'],
}

function render(answer: boolean) {
  const api = installMockGitAPI({
    getWorkingChanges: jest.fn().mockResolvedValue(CHANGES),
    getLastCommitMessage: jest.fn().mockResolvedValue({ message: '' }),
    getMergeMessage: jest.fn().mockResolvedValue({ message: '' }),
    getCommitFiles: jest.fn().mockResolvedValue({ files: [] }),
    unstage: jest.fn().mockResolvedValue({ success: true }),
    discardFile: jest.fn().mockResolvedValue({ success: true }),
  })
  const showConfirm = jest.fn().mockResolvedValue(answer)
  const native = jest.spyOn(window, 'confirm').mockReturnValue(false)
  renderWithProviders(
    <RightPanel selectedCommit={{ hash: '__WIP__' } as any} onCommitSuccess={() => {}}
      showToast={() => {}} showConfirm={showConfirm} onSelectCommit={() => {}}
      currentBranch="main" embedded />)
  return { api, showConfirm, native }
}

afterEach(() => jest.restoreAllMocks())

const trash = () => screen.getAllByTitle('Discard all changes')[0]

describe('discarding the working changes', () => {
  test('the trash asks the host, as a danger, and then throws everything away', async () => {
    const { api, showConfirm, native } = render(true)
    await waitFor(() => expect(trash()).toBeEnabled())
    await userEvent.click(trash())
    await waitFor(() => expect(api.discardFile).toHaveBeenCalledTimes(3))
    expect(showConfirm).toHaveBeenCalledWith(expect.stringContaining('3'), true)
    expect(api.unstage).toHaveBeenCalledWith(['src/a.ts'])
    expect(native).not.toHaveBeenCalled()
  })

  test('a no leaves every file where it was', async () => {
    const { api, showConfirm } = render(false)
    await waitFor(() => expect(trash()).toBeEnabled())
    await userEvent.click(trash())
    await waitFor(() => expect(showConfirm).toHaveBeenCalled())
    expect(api.discardFile).not.toHaveBeenCalled()
    expect(api.unstage).not.toHaveBeenCalled()
  })
})
