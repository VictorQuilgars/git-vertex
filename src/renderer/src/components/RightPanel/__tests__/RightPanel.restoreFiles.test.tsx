import { screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RightPanel from '../RightPanel'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// #69 — restoring files from a commit, more than one at a time. The list
// API always took paths; the menu now hands it the batch: every file of the
// commit, or every file the filter shows — never one the commit deleted,
// which has no version there to put back.

const COMMIT = {
  hash: 'abc123def456', shortHash: 'abc123', message: 'feat: something',
  author: 'Victor', authorEmail: 'v@example.com', date: '2026-08-02', parents: ['p1'], refs: [],
}
const FILES = [
  { path: 'src/a.ts', status: 'M' },
  { path: 'src/b.ts', status: 'A' },
  { path: 'docs/c.md', status: 'M' },
  { path: 'src/gone.ts', status: 'D' },
]

function render(props: Record<string, any> = {}, files = FILES) {
  installMockGitAPI({
    getCommitFiles: jest.fn().mockResolvedValue({ files }),
    getDiff: jest.fn().mockResolvedValue({ diff: '' }),
    getCommitBody: jest.fn().mockResolvedValue({ body: '' }),
    getCommitStats: jest.fn().mockResolvedValue({ files: files.length, additions: 0, deletions: 0 }),
  })
  return renderWithProviders(
    <RightPanel selectedCommit={COMMIT as any} onCommitSuccess={() => {}} showToast={() => {}}
      onSelectCommit={() => {}} currentBranch="main" embedded {...props} />
  )
}

const menuOn = async (name: string) => {
  await userEvent.pointer({ keys: '[MouseRight]', target: await screen.findByText(name) })
}

test('one file is still one file', async () => {
  const onRestoreFile = jest.fn()
  render({ onRestoreFile })
  await menuOn('a.ts')
  await userEvent.click(await screen.findByText('Restore This Version…'))
  expect(onRestoreFile).toHaveBeenCalledWith('abc123def456', ['src/a.ts'])
})

test('all of the commit\'s files, the deleted one left out', async () => {
  const onRestoreFile = jest.fn()
  render({ onRestoreFile })
  await menuOn('a.ts')
  await userEvent.click(await screen.findByText('Restore All 3 Files of This Commit…'))
  expect(onRestoreFile).toHaveBeenCalledWith('abc123def456', ['src/a.ts', 'src/b.ts', 'docs/c.md'])
})

test('with a filter typed, the files it shows', async () => {
  const onRestoreFile = jest.fn()
  render({ onRestoreFile })
  await screen.findByText('a.ts')
  const filter = document.querySelector('input[type="text"], input[type="search"]') as HTMLInputElement
  fireEvent.change(filter, { target: { value: 'src/' } })
  await menuOn('a.ts')
  await userEvent.click(await screen.findByText('Restore the 2 Files Shown…'))
  expect(onRestoreFile).toHaveBeenCalledWith('abc123def456', ['src/a.ts', 'src/b.ts'])
})

test('a commit with a single restorable file offers no batch', async () => {
  render({ onRestoreFile: jest.fn() }, [FILES[0], FILES[3]])
  await menuOn('a.ts')
  expect(await screen.findByText('Restore This Version…')).toBeInTheDocument()
  expect(screen.queryByText(/Restore All|Files Shown/)).not.toBeInTheDocument()
})
