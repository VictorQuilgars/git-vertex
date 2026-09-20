// The staging pane says which of its two faces it is showing (#298).
import { waitFor } from '@testing-library/react'
import { StagingView } from '../StagingView'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

const EMPTY = { staged: [], unstaged: [], untracked: [] }
const DIRTY = { staged: [{ path: 'a.ts', status: 'M' }], unstaged: [], untracked: [] }

const emptyState = {
  state: { branch: 'main', hasUpstream: true, remoteName: 'origin' },
  actions: { onPublish: jest.fn(), onPush: jest.fn(), onPull: jest.fn(), onCreateBranch: jest.fn() },
}

function draw(changes: any, withEmptyState = true) {
  installMockGitAPI({
    getWorkingChanges: jest.fn().mockResolvedValue(changes),
    getStatus: jest.fn().mockResolvedValue({ staged: [], unstaged: [], untracked: [] }),
  })
  const onEmptyState = jest.fn()
  renderWithProviders(
    <StagingView repoPath="/repo" currentBranch="main" embedded
      onCommitSuccess={jest.fn()} showToast={jest.fn()} showConfirm={jest.fn()}
      emptyState={withEmptyState ? (emptyState as any) : undefined}
      onEmptyState={onEmptyState} />)
  return onEmptyState
}

test('a clean tree shows the home, and says so', async () => {
  const onEmptyState = draw(EMPTY)
  await waitFor(() => expect(onEmptyState).toHaveBeenLastCalledWith(true))
})

test('files on screen are not the home', async () => {
  const onEmptyState = draw(DIRTY)
  await waitFor(() => expect(onEmptyState).toHaveBeenCalled())
  expect(onEmptyState).toHaveBeenLastCalledWith(false)
})

test('a host that offers no home card never shows one, whatever the tree', async () => {
  const onEmptyState = draw(EMPTY, false)
  await waitFor(() => expect(onEmptyState).toHaveBeenCalled())
  expect(onEmptyState).toHaveBeenLastCalledWith(false)
})
