import React from 'react'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'
import CommitComposer from '../CommitComposer'

// The composer is the one place in the app where a model's answer becomes
// history without a further gesture per commit, so what is under test is the
// APPLY: the order, the index it starts from, and what it says when it stops
// halfway. The proposal itself is checked in src/main (parseSplit).

const anchor = { current: document.createElement('div') }

const plan = {
  groups: [
    { message: 'refactor: extract the helper', files: ['src/a.ts'] },
    { message: 'feat: use it', files: ['src/b.ts', 'src/c.ts'] },
  ],
  unassigned: ['docs/notes.md'],
  invented: ['src/ghost.ts'],
}

function open(api: Record<string, any> = {}, props: Record<string, any> = {}) {
  const mock = installMockGitAPI({
    aiProposeCommitSplit: jest.fn().mockResolvedValue(plan),
    unstage: jest.fn().mockResolvedValue({ success: true }),
    stage: jest.fn().mockResolvedValue({ success: true }),
    commit: jest.fn().mockResolvedValue({ success: true }),
    ...api,
  })
  const onCommitted = jest.fn()
  const onClose = jest.fn()
  const showToast = jest.fn()
  renderWithProviders(
    <CommitComposer anchor={anchor as any} onClose={onClose} onCommitted={onCommitted}
      showToast={showToast} {...props} />)
  return { mock, onCommitted, onClose, showToast }
}

describe('CommitComposer', () => {
  test('lays the plan out, and says what it could not place', async () => {
    open()
    await screen.findByText('refactor: extract the helper')
    expect(screen.getByText('3 files in 2 commits')).toBeInTheDocument()
    // The two honesty lines: whole files, and a path the model made up.
    expect(screen.getByText(/whole files/)).toBeInTheDocument()
    expect(screen.getByText('1 path the model invented, dropped.')).toBeInTheDocument()
    // A file in no commit is SHOWN. Dropping it silently would be work the
    // user believes they committed.
    expect(screen.getByText('1 file in no commit')).toBeInTheDocument()
    expect(screen.getByText('docs/notes.md')).toBeInTheDocument()
  })

  test('applies in order: a clean index first, then stage-and-commit per group', async () => {
    const { mock, onCommitted, onClose, showToast } = open()
    await screen.findByText('refactor: extract the helper')
    await userEvent.click(screen.getByRole('button', { name: 'Create 2 commits' }))

    await waitFor(() => expect(mock.commit).toHaveBeenCalledTimes(2))
    // Everything known is unstaged first — including the files the plan left
    // out, or whatever was staged before would ride along with commit 1.
    expect(mock.unstage).toHaveBeenCalledWith(['src/a.ts', 'src/b.ts', 'src/c.ts', 'docs/notes.md'])
    expect(mock.stage).toHaveBeenNthCalledWith(1, ['src/a.ts'])
    expect(mock.commit).toHaveBeenNthCalledWith(1, 'refactor: extract the helper')
    expect(mock.stage).toHaveBeenNthCalledWith(2, ['src/b.ts', 'src/c.ts'])
    expect(mock.commit).toHaveBeenNthCalledWith(2, 'feat: use it')
    expect(showToast).toHaveBeenCalledWith('2 commits created', 'ok')
    expect(onCommitted).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  test('a failure halfway says how far it got, and does not close', async () => {
    const { mock, onCommitted, onClose } = open({
      commit: jest.fn()
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValue({ success: false, error: 'pre-commit hook refused' }),
    })
    await screen.findByText('feat: use it')
    await userEvent.click(screen.getByRole('button', { name: 'Create 2 commits' }))

    await waitFor(() => expect(screen.getByText(/pre-commit hook refused/)).toBeInTheDocument())
    // The first commit is real and the graph has to show it; the rest is
    // still on disk, and the message says so rather than implying a rollback.
    expect(screen.getByText(/1 commit created/)).toBeInTheDocument()
    expect(screen.getByText(/still uncommitted/)).toBeInTheDocument()
    expect(mock.commit).toHaveBeenCalledTimes(2)
    expect(onCommitted).toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  test('a move empties a commit, and the empty commit goes with its last file', async () => {
    const { mock } = open()
    await screen.findByText('refactor: extract the helper')
    const rows = screen.getAllByTitle('Move to another commit')
    await userEvent.selectOptions(rows[0], '1')  // src/a.ts → commit 2
    await userEvent.click(screen.getByRole('button', { name: 'Create 1 commit' }))

    await waitFor(() => expect(mock.commit).toHaveBeenCalledTimes(1))
    // Commit 1 is gone from the plan — it was left with no file, and a
    // message that described files it no longer has describes nothing.
    expect(mock.stage).toHaveBeenCalledWith(['src/b.ts', 'src/c.ts', 'src/a.ts'])
  })

  test('dropping a commit keeps its files, loose', async () => {
    open()
    const first = (await screen.findByText('refactor: extract the helper')).closest('.cc-group') as HTMLElement
    await userEvent.click(within(first).getByTitle('Remove this commit'))
    expect(screen.queryByText('refactor: extract the helper')).not.toBeInTheDocument()
    expect(screen.getByText('2 files in no commit')).toBeInTheDocument()
    expect(screen.getByText('src/a.ts')).toBeInTheDocument()
  })

  test('a commit with no message cannot be applied', async () => {
    open()
    const first = (await screen.findByText('refactor: extract the helper')) as HTMLTextAreaElement
    await userEvent.clear(first)
    expect(screen.getByRole('button', { name: 'Create 2 commits' })).toBeDisabled()
    expect(screen.getByText(/needs a message/)).toBeInTheDocument()
  })

  test('a host that cannot answer says so, and proposes nothing', async () => {
    open({ aiProposeCommitSplit: jest.fn().mockResolvedValue({ error: 'NO_API_KEY' }) })
    await waitFor(() => expect(screen.getByText(/No AI API key/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Create/ })).not.toBeInTheDocument()
  })
})
