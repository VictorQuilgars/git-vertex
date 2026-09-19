import fs from 'fs'
import path from 'path'
import { screen, waitFor, fireEvent, within } from '@testing-library/react'
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

// One file at a time. The panel's list is .stx-row, and the stylesheet only
// revealed a row's buttons on .st-file-row, the desktop's: the ↺ stayed
// invisible under the pointer, the rows had no right-click menu, and the trash
// was the only way to discard anything.
describe('discarding one file in the panel', () => {
  const rowOf = (file: string) => screen.getByTitle(file).closest('.stx-row') as HTMLElement

  test('the row\'s ↺ asks, then discards that file only', async () => {
    const { api, showConfirm } = render(true)
    await waitFor(() => expect(rowOf('src/b.ts')).toBeInTheDocument())
    await userEvent.click(within(rowOf('src/b.ts')).getByTitle('Discard changes'))
    await waitFor(() => expect(api.discardFile).toHaveBeenCalledWith('src/b.ts'))
    expect(api.discardFile).toHaveBeenCalledTimes(1)
    expect(showConfirm).toHaveBeenCalledWith(expect.stringContaining('src/b.ts'), true)
  })

  test('a right-click on a row offers Discard, and it discards that file', async () => {
    const { api } = render(true)
    await waitFor(() => expect(rowOf('src/b.ts')).toBeInTheDocument())
    fireEvent.contextMenu(rowOf('src/b.ts'), { clientX: 40, clientY: 40 })
    const menu = await screen.findByRole('menu')
    await userEvent.click(within(menu).getByText('Discard changes'))
    await waitFor(() => expect(api.discardFile).toHaveBeenCalledWith('src/b.ts'))
  })

  // jsdom runs no stylesheet: this holds the rule the buttons depend on.
  test('the stylesheet shows a row\'s buttons under the pointer on the panel\'s rows too', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../RightPanel.css'), 'utf8')
    expect(css).toMatch(/\.stx-row:hover \.st-action[^{]*\{\s*opacity:\s*1/)
  })
})
