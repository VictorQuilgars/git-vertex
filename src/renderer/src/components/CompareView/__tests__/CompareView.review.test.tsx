import { screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CompareView from '../CompareView'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// #265 — the comparison asks the model for a review only when told to, and
// shows the comments under the lines they are about: proposals, each one
// dismissible, with an account of what the model did not read.

const DIFF = [
  'diff --git a/src/retry.ts b/src/retry.ts',
  '--- a/src/retry.ts',
  '+++ b/src/retry.ts',
  '@@ -10,3 +10,4 @@',
  '   const n = 3',
  '-  if (!ok) throw err',
  '+  if (!ok) return',
  '+  console.log("debug", err)',
  '   return value',
  '',
].join('\n')

function render(api: Record<string, any> = {}, props: Record<string, any> = {}) {
  const mock = installMockGitAPI({
    getBranches: jest.fn().mockResolvedValue({ branches: [{ name: 'main', current: true }, { name: 'feature', current: false }] }),
    getTags: jest.fn().mockResolvedValue({ tags: [] }),
    getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
    compareBranches: jest.fn().mockResolvedValue({ ahead: [{ hash: 'f1', shortHash: 'f1', message: 'retry' }], behind: [] }),
    diffBetweenCommits: jest.fn().mockResolvedValue({ diff: DIFF }),
    filesBetweenCommits: jest.fn().mockResolvedValue({ files: [{ path: 'src/retry.ts', status: 'M', additions: 2, deletions: 1 }] }),
    getMergeBase: jest.fn().mockResolvedValue({ base: 'abc1234def' }),
    ...api,
  })
  renderWithProviders(<CompareView initialA="main" initialB="feature" repoKey="/repo" {...props} />)
  return mock
}

afterEach(() => localStorage.clear())

const REVIEW = {
  comments: [
    { file: 'src/retry.ts', line: 12, severity: 'leftover', body: 'Debug output left in.' },
    { file: 'src/retry.ts', line: null, severity: 'risk', body: 'The error is now swallowed, and no test says so.' },
  ],
  partial: [], unread: ['big.lock'],
}

test('nothing is sent until asked; then the comments land on their line and on their file', async () => {
  const aiReviewComparison = jest.fn().mockResolvedValue(REVIEW)
  render({ aiReviewComparison })
  const ask = await screen.findByRole('button', { name: 'Review with AI' })
  expect(aiReviewComparison).not.toHaveBeenCalled()
  await userEvent.click(ask)
  expect(aiReviewComparison).toHaveBeenCalledWith('main', 'feature', 'diverged')

  const onLine = await screen.findByText('Debug output left in.')
  // Under line 12: the row before it is the one numbered 12 on the new side.
  const row = onLine.closest('tr')!.previousElementSibling as HTMLElement
  expect(row.querySelector('.line-num.new')?.textContent).toBe('12')
  // The comment on the file sits under the file's name, outside any hunk.
  const onFile = screen.getByText(/now swallowed/)
  expect(onFile.closest('tr')).toBeNull()
  expect(screen.getByText('2 comments from the model')).toBeInTheDocument()
  expect(screen.getByText('1 file not read')).toBeInTheDocument()
})

test('a dismissed comment is gone, and only that one', async () => {
  render({ aiReviewComparison: jest.fn().mockResolvedValue(REVIEW) })
  await userEvent.click(await screen.findByRole('button', { name: 'Review with AI' }))
  const card = (await screen.findByText('Debug output left in.')).closest('.dv-note') as HTMLElement
  fireEvent.click(card.querySelector('button')!)
  expect(screen.queryByText('Debug output left in.')).not.toBeInTheDocument()
  expect(screen.getByText(/now swallowed/)).toBeInTheDocument()
  expect(screen.getByText('1 comment from the model')).toBeInTheDocument()
})

test('a refusal is said where the review would be', async () => {
  render({ aiReviewComparison: jest.fn().mockResolvedValue({ comments: [], partial: [], unread: [], error: 'No AI provider configured' }) })
  await userEvent.click(await screen.findByRole('button', { name: 'Review with AI' }))
  expect(await screen.findByText('The review failed: No AI provider configured')).toBeInTheDocument()
})

test('against the working tree, or on a host without the call, there is no button', async () => {
  render({ aiReviewComparison: jest.fn() }, { initialB: null })
  await waitFor(() => expect(screen.queryByText(/Choose two/)).not.toBeInTheDocument())
  expect(screen.queryByRole('button', { name: 'Review with AI' })).not.toBeInTheDocument()
})
