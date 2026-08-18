import { screen, waitFor } from '@testing-library/react'
import RightPanel from '../RightPanel'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The staging list in Tree mode gives every folder a stage/unstage button, and
// that button's tooltip called `t(...)` from a component that never took it from
// the context — a ReferenceError the moment a folder row carried an action, in
// the desktop app and in the VS Code panel alike, since v1.24.0 / ext-v1.22.0.
//
// Nothing caught it: the tests here never turned Tree mode on, and the shared
// renderer could not be type-checked (one bad `t()` signature buried the answer
// under a thousand false errors).

const WORKING_CHANGES = {
  staged: [{ path: 'src/main/git-service.ts', status: 'M' }],
  unstaged: [{ path: 'src/renderer/App.tsx', status: 'M' }],
  untracked: [],
}

function renderTreeMode() {
  localStorage.setItem('st-tree-mode', 'true')
  installMockGitAPI({
    getWorkingChanges: jest.fn().mockResolvedValue(WORKING_CHANGES),
    getLastCommitMessage: jest.fn().mockResolvedValue({ message: '' }),
    getMergeMessage: jest.fn().mockResolvedValue({ message: '' }),
    getCommitFiles: jest.fn().mockResolvedValue({ files: [] }),
  })
  return renderWithProviders(
    <RightPanel
      selectedCommit={{ hash: '__WIP__' } as any}
      onCommitSuccess={() => {}}
      showToast={() => {}}
      onSelectCommit={() => {}}
      currentBranch="main"
    />
  )
}

afterEach(() => localStorage.removeItem('st-tree-mode'))

describe('StagingView — Tree mode', () => {
  test('renders the folder rows without throwing', async () => {
    renderTreeMode()
    await waitFor(() => expect(screen.getAllByText('src').length).toBeGreaterThan(0))
  })

  test('a folder carries the action that stages everything under it', async () => {
    renderTreeMode()
    await waitFor(() => expect(screen.getAllByText('src').length).toBeGreaterThan(0))

    // The tooltip is what crashed: it is the only string on these rows built
    // through the translation function.
    const actions = screen.getAllByTitle(/folder$/i)
    expect(actions.length).toBeGreaterThan(0)
  })
})
