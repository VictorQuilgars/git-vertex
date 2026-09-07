import { screen, waitFor } from '@testing-library/react'
import RightPanel from '../RightPanel'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// A clean working tree says what comes next on BOTH products (#189). The panel
// has said it since v1.22.0; the desktop showed an empty list and a commit
// button that could not be pressed. What decides is the host supplying
// `emptyState` — not which product is rendering.

const CLEAN = { staged: [], unstaged: [], untracked: [] }
const DIRTY = { staged: [], unstaged: [{ path: 'src/a.ts', status: 'M' }], untracked: [] }

const EMPTY_STATE = {
  state: { branch: 'feature/x', hasUpstream: false, remoteName: 'origin', ahead: 2 },
  actions: { onPublish: jest.fn(), onPush: jest.fn(), onCreateBranch: jest.fn() },
}

function render(props: Record<string, any> = {}, changes: any = CLEAN) {
  installMockGitAPI({
    getWorkingChanges: jest.fn().mockResolvedValue(changes),
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
      currentBranch="feature/x"
      {...props}
    />
  )
}

describe('the desktop staging pane on a clean tree', () => {
  test('shows the next steps, not an empty two-section list', async () => {
    render({ emptyState: EMPTY_STATE })
    await waitFor(() => expect(screen.getByText('Next steps')).toBeInTheDocument())
    expect(screen.getByText('Publish feature/x to origin')).toBeInTheDocument()
    expect(screen.getByText('Push 2 commits to origin')).toBeInTheDocument()
    // The two sections and the message field are what it replaces: a form for a
    // commit with nothing in it says the opposite of "here is what to do next".
    expect(screen.queryByText(/^Unstaged/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Staged/)).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/commit message/i)).not.toBeInTheDocument()
  })

  test('a host that supplies nothing keeps the quiet pane it had', async () => {
    const { container } = render()
    await waitFor(() => expect(container.querySelector('.st2-lists')).toBeInTheDocument())
    expect(screen.queryByText('Next steps')).not.toBeInTheDocument()
  })

  test('one changed file and the form is back', async () => {
    render({ emptyState: EMPTY_STATE }, DIRTY)
    await waitFor(() => expect(screen.getByTitle('src/a.ts')).toBeInTheDocument())
    expect(screen.queryByText('Next steps')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText(/commit message/i)).toBeInTheDocument()
  })
})

describe('what the next steps never replace', () => {
  test('a message already written keeps its form on a clean tree', async () => {
    localStorage.setItem('gv-commit-draft:/repo', JSON.stringify({ message: 'half a thought', amend: false, amendMessage: '' }))
    render({ emptyState: EMPTY_STATE, repoPath: '/repo' })
    await waitFor(() => expect(screen.getByPlaceholderText(/commit message/i)).toHaveValue('half a thought'))
    expect(screen.queryByText('Next steps')).not.toBeInTheDocument()
    localStorage.clear()
  })
})
