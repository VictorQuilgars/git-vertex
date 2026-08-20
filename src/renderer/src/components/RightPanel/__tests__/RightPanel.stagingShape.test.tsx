import { screen, waitFor } from '@testing-library/react'
import RightPanel from '../RightPanel'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The staging pane in the panel, reordered to the agreed table. These hold the
// rows that changed contract, not the markup.

const CHANGES = {
  staged: [{ path: 'src/a.ts', status: 'M', additions: 2, deletions: 0 }],
  unstaged: [{ path: 'client/tailwind.config.ts', status: 'M', additions: 1, deletions: 0 }],
  untracked: [],
}

function render(props: Record<string, any> = {}) {
  installMockGitAPI({
    getWorkingChanges: jest.fn().mockResolvedValue(CHANGES),
    getLastCommitMessage: jest.fn().mockResolvedValue({ message: '' }),
    getMergeMessage: jest.fn().mockResolvedValue({ message: '' }),
    getCommitFiles: jest.fn().mockResolvedValue({ files: [] }),
  })
  return renderWithProviders(
    <RightPanel selectedCommit={{ hash: '__WIP__' } as any} onCommitSuccess={() => {}}
      showToast={() => {}} onSelectCommit={() => {}} currentBranch="tmp" embedded {...props} />
  )
}

describe('the staging pane, the panel shape', () => {
  // Row 1: the header names the pane and says how much is in it.
  test('the header is "Working Changes" with its count', async () => {
    render()
    await waitFor(() => expect(screen.getByTitle('src/a.ts')).toBeInTheDocument())
    expect(screen.getByText('Working Changes')).toBeInTheDocument()
    expect(screen.getByTitle(/2 files changed/)).toHaveTextContent('2')
  })

  // Row 3: the count that counts is how many are staged.
  test('the files header says N of M staged', async () => {
    render()
    await waitFor(() => expect(screen.getByText(/1 of 2 staged/i)).toBeInTheDocument())
  })

  // Row 5: name strong, folder weak — on the staging rows too.
  test('a file row puts the name before the folder', async () => {
    render()
    const row = await screen.findByTitle('client/tailwind.config.ts')
    expect(row.querySelector('.st-path-name')).toHaveTextContent('tailwind.config.ts')
    expect(row.querySelector('.st-path-dir')).toHaveTextContent('client')
    expect(row.firstElementChild!.className).toContain('st-path-name')
  })

  // Row 8: the footer is the commit, named for its branch — greyed, not hidden.
  test('the footer is "Commit to <branch>", disabled until ready', async () => {
    render()
    await waitFor(() => expect(screen.getByTitle('src/a.ts')).toBeInTheDocument())
    const btn = screen.getAllByRole('button').find(b => /commit to tmp/i.test(b.textContent ?? ''))!
    expect(btn).toBeDefined()
    expect(btn).toBeDisabled()   // staged, but no message yet
  })

  // Row 1's Compare appears only when the host can compare — the panel's rule.
  test('Compare in the header only with a handler', async () => {
    render()
    await waitFor(() => expect(screen.getByTitle('src/a.ts')).toBeInTheDocument())
    expect(screen.queryByText('Compare')).not.toBeInTheDocument()
  })
})
