import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RightPanel from '../RightPanel'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// A file inside a commit is the one place the UI knows BOTH a path and the exact
// ref it existed at, which is what a link worth sharing needs. The URL itself is
// built and tested in utils/remoteUrl; what these tests cover is the wiring —
// that the right-click hands over the right commit and the right path, and that
// the rows stay silent when the host offers no way to link.

const COMMIT = {
  hash: 'abc123def456', shortHash: 'abc123', message: 'feat: something',
  author: 'Victor', authorEmail: 'v@example.com', date: '2026-08-02', parents: ['p1'], refs: [],
}

function render(props: Record<string, any> = {}) {
  installMockGitAPI({
    getCommitFiles: jest.fn().mockResolvedValue({
      files: [{ path: 'src/main/index.ts', status: 'M' }],
    }),
    getDiff: jest.fn().mockResolvedValue({ diff: '' }),
    getCommitBody: jest.fn().mockResolvedValue({ body: '' }),
    getCommitStats: jest.fn().mockResolvedValue({ files: 1, additions: 0, deletions: 0 }),
  })
  return renderWithProviders(
    <RightPanel
      selectedCommit={COMMIT as any}
      onCommitSuccess={() => {}}
      showToast={() => {}}
      onSelectCommit={() => {}}
      currentBranch="main"
      embedded
      {...props}
    />
  )
}

describe('Commit files — link to this file on the remote', () => {
  test('right-clicking a file offers to open it and to copy its link', async () => {
    render({ onOpenFileOnRemote: jest.fn(), onCopyFileLink: jest.fn() })
    const row = await screen.findByText('index.ts')
    await userEvent.pointer({ keys: '[MouseRight]', target: row })

    expect(await screen.findByText('Open File on Remote')).toBeInTheDocument()
    expect(screen.getByText('Copy Link to This File')).toBeInTheDocument()
  })

  // The wiring, which is the part that can be wrong while every URL test passes:
  // the commit's OWN hash, not HEAD, and the file's full path, not its basename.
  test('it hands over the commit hash and the full path', async () => {
    const onCopyFileLink = jest.fn()
    render({ onCopyFileLink })
    const row = await screen.findByText('index.ts')
    await userEvent.pointer({ keys: '[MouseRight]', target: row })
    await userEvent.click(await screen.findByText('Copy Link to This File'))

    expect(onCopyFileLink).toHaveBeenCalledWith('abc123def456', 'src/main/index.ts')
  })

  // A host with no remote passes no callbacks. Showing the rows anyway is
  // exactly the dead-button class the panel-surface guard exists to prevent —
  // here the same rule applies inside one component.
  test('no callbacks, no rows — but the path can still be copied', async () => {
    render()
    const row = await screen.findByText('index.ts')
    await userEvent.pointer({ keys: '[MouseRight]', target: row })

    expect(await screen.findByText('Copy Path')).toBeInTheDocument()
    expect(screen.queryByText('Open File on Remote')).not.toBeInTheDocument()
    expect(screen.queryByText('Copy Link to This File')).not.toBeInTheDocument()
  })

  test('a left click still opens the diff, unchanged', async () => {
    const onOpenFileDiff = jest.fn()
    render({ onOpenFileDiff, onCopyFileLink: jest.fn() })
    await userEvent.click(await screen.findByText('index.ts'))

    await waitFor(() => expect(onOpenFileDiff).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'commit', commitHash: 'abc123def456', filePath: 'src/main/index.ts' })))
    expect(screen.queryByText('Copy Path')).not.toBeInTheDocument()
  })
})
