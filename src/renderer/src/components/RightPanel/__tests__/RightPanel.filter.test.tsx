import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RightPanel from '../RightPanel'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// Three files spread across staged/unstaged/untracked so the filter has to
// reach every list, not just one.
const WORKING_CHANGES = {
  staged: [{ path: 'src/main/git-service.ts', status: 'M' }],
  unstaged: [{ path: 'src/renderer/App.tsx', status: 'M' }],
  untracked: ['docs/readme.md'],
}

function renderStaging(overrides: Record<string, any> = {}, props: Record<string, any> = {}) {
  const api = installMockGitAPI({
    getWorkingChanges: jest.fn().mockResolvedValue(WORKING_CHANGES),
    getLastCommitMessage: jest.fn().mockResolvedValue({ message: '' }),
    getMergeMessage: jest.fn().mockResolvedValue({ message: '' }),
    getCommitFiles: jest.fn().mockResolvedValue({ files: [] }),
    ...overrides,
  })
  const view = renderWithProviders(
    <RightPanel
      selectedCommit={{ hash: '__WIP__' } as any}
      onCommitSuccess={() => {}}
      showToast={() => {}}
      currentBranch="main"
      embedded
      {...props}
    />
  )
  return { api, ...view }
}

const filterButton = () => screen.getByRole('button', { name: /filter files/i })
const filterInput = () => screen.getByPlaceholderText(/filter files/i)

describe('StagingView — file filter (v1.21.0)', () => {
  test('the filter input is hidden until the filter button is clicked', async () => {
    renderStaging()
    await waitFor(() => expect(screen.getByText('src/main/git-service.ts')).toBeInTheDocument())

    expect(screen.queryByPlaceholderText(/filter files/i)).not.toBeInTheDocument()

    await userEvent.click(filterButton())
    expect(filterInput()).toBeInTheDocument()
  })

  test('typing narrows the list to matching paths across staged, unstaged and untracked', async () => {
    renderStaging()
    await waitFor(() => expect(screen.getByText('src/main/git-service.ts')).toBeInTheDocument())
    // All three files visible up front.
    expect(screen.getByText('src/renderer/App.tsx')).toBeInTheDocument()
    expect(screen.getByText('docs/readme.md')).toBeInTheDocument()

    await userEvent.click(filterButton())
    await userEvent.type(filterInput(), 'src/')

    // The two src/ files survive; the untracked doc is filtered out.
    expect(screen.getByText('src/main/git-service.ts')).toBeInTheDocument()
    expect(screen.getByText('src/renderer/App.tsx')).toBeInTheDocument()
    expect(screen.queryByText('docs/readme.md')).not.toBeInTheDocument()
  })

  test('matching is case-insensitive and matches anywhere in the path', async () => {
    renderStaging()
    await waitFor(() => expect(screen.getByText('src/main/git-service.ts')).toBeInTheDocument())

    await userEvent.click(filterButton())
    await userEvent.type(filterInput(), 'APP')

    expect(screen.getByText('src/renderer/App.tsx')).toBeInTheDocument()
    expect(screen.queryByText('src/main/git-service.ts')).not.toBeInTheDocument()
  })

  test('a query matching nothing explains why the list is empty', async () => {
    renderStaging()
    await waitFor(() => expect(screen.getByText('src/main/git-service.ts')).toBeInTheDocument())

    await userEvent.click(filterButton())
    await userEvent.type(filterInput(), 'zzzzz')

    expect(screen.getByText(/no file matches/i)).toBeInTheDocument()
    // Not the "clean working directory" message — the tree is not clean.
    expect(screen.queryByText(/clean working directory/i)).not.toBeInTheDocument()
  })

  test('the filter is a view lens: the change count keeps counting every file', async () => {
    const { container } = renderStaging()
    await waitFor(() => expect(screen.getByText('src/main/git-service.ts')).toBeInTheDocument())
    const count = () => container.querySelector('.stx-count')

    expect(count()).toHaveTextContent(/3 file changes/i)

    await userEvent.click(filterButton())
    await userEvent.type(filterInput(), 'zzzzz')

    // No row is rendered, but the header still counts all 3 real changes.
    expect(screen.getByText(/no file matches/i)).toBeInTheDocument()
    expect(count()).toHaveTextContent(/3 file changes/i)
  })

  test('closing the filter clears it, so no hidden query keeps files out of view', async () => {
    renderStaging()
    await waitFor(() => expect(screen.getByText('src/main/git-service.ts')).toBeInTheDocument())

    await userEvent.click(filterButton())
    await userEvent.type(filterInput(), 'zzzzz')
    expect(screen.queryByText('src/main/git-service.ts')).not.toBeInTheDocument()

    await userEvent.click(filterButton()) // toggle off
    expect(screen.queryByPlaceholderText(/filter files/i)).not.toBeInTheDocument()
    expect(screen.getByText('src/main/git-service.ts')).toBeInTheDocument()
    expect(screen.getByText('docs/readme.md')).toBeInTheDocument()
  })

  test('the clear button empties the query without closing the filter', async () => {
    renderStaging()
    await waitFor(() => expect(screen.getByText('src/main/git-service.ts')).toBeInTheDocument())

    await userEvent.click(filterButton())
    await userEvent.type(filterInput(), 'zzzzz')

    await userEvent.click(screen.getByRole('button', { name: /clear filter/i }))

    expect(filterInput()).toHaveValue('')
    expect(screen.getByText('src/main/git-service.ts')).toBeInTheDocument()
  })
})
