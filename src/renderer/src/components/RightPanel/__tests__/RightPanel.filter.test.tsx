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
      onSelectCommit={() => {}}
      currentBranch="main"
      embedded
      {...props}
    />
  )
  return { api, ...view }
}

// A row writes its name and its folder in two spans, so a file is found by the
// title that carries its whole path — the same thing the eye uses.
const row = (path: string) => screen.queryByTitle(path)
const filterInput = () => screen.getByPlaceholderText(/filter files/i)

describe('StagingView — file filter (v1.21.0)', () => {
  // The filter used to hide behind a button. It is a field now, always there:
  // a search you have to find is a search nobody uses.
  test('the filter is a field, there before anything is typed', async () => {
    renderStaging()
    await waitFor(() => expect(row('src/main/git-service.ts')).toBeInTheDocument())
    expect(filterInput()).toBeInTheDocument()
  })

  test('typing narrows the list to matching paths across staged, unstaged and untracked', async () => {
    renderStaging()
    await waitFor(() => expect(row('src/main/git-service.ts')).toBeInTheDocument())
    // All three files visible up front.
    expect(row('src/renderer/App.tsx')).toBeInTheDocument()
    expect(row('docs/readme.md')).toBeInTheDocument()

    await userEvent.type(filterInput(), 'src/')

    // The two src/ files survive; the untracked doc is filtered out.
    expect(row('src/main/git-service.ts')).toBeInTheDocument()
    expect(row('src/renderer/App.tsx')).toBeInTheDocument()
    expect(row('docs/readme.md')).not.toBeInTheDocument()
  })

  test('matching is case-insensitive and matches anywhere in the path', async () => {
    renderStaging()
    await waitFor(() => expect(row('src/main/git-service.ts')).toBeInTheDocument())

    await userEvent.type(filterInput(), 'APP')

    expect(row('src/renderer/App.tsx')).toBeInTheDocument()
    expect(row('src/main/git-service.ts')).not.toBeInTheDocument()
  })

  test('a query matching nothing explains why the list is empty', async () => {
    renderStaging()
    await waitFor(() => expect(row('src/main/git-service.ts')).toBeInTheDocument())

    await userEvent.type(filterInput(), 'zzzzz')

    expect(screen.getByText(/no file matches/i)).toBeInTheDocument()
    // Not the "clean working directory" message — the tree is not clean.
    expect(screen.queryByText(/clean working directory/i)).not.toBeInTheDocument()
  })

  test('the filter is a view lens: the change count keeps counting every file', async () => {
    const { container } = renderStaging()
    await waitFor(() => expect(row('src/main/git-service.ts')).toBeInTheDocument())
    // The header's count is "N of M staged" now; the M is what the lens must
    // leave alone — it counts every real change, shown or not.
    const count = () => container.querySelector('.stx-staged-badge')

    expect(count()).toHaveTextContent(/of 3 staged/i)

    await userEvent.type(filterInput(), 'zzzzz')

    // No row is rendered, but the header still counts all 3 real changes.
    expect(screen.getByText(/no file matches/i)).toBeInTheDocument()
    expect(count()).toHaveTextContent(/of 3 staged/i)
  })

  // There is no button to close any more; Escape empties the field, and an
  // empty field keeps nothing out of view.
  test('Escape clears the query, so no hidden query keeps files out of view', async () => {
    renderStaging()
    await waitFor(() => expect(row('src/main/git-service.ts')).toBeInTheDocument())

    await userEvent.type(filterInput(), 'zzzzz')
    expect(row('src/main/git-service.ts')).not.toBeInTheDocument()

    await userEvent.type(filterInput(), '{Escape}')
    expect(row('src/main/git-service.ts')).toBeInTheDocument()
    expect(row('docs/readme.md')).toBeInTheDocument()
  })

  test('the clear button empties the query without closing the filter', async () => {
    renderStaging()
    await waitFor(() => expect(row('src/main/git-service.ts')).toBeInTheDocument())

    await userEvent.type(filterInput(), 'zzzzz')

    await userEvent.click(screen.getByRole('button', { name: /clear filter/i }))

    expect(filterInput()).toHaveValue('')
    expect(row('src/main/git-service.ts')).toBeInTheDocument()
  })
})
