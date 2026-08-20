import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CommitGraph from '../CommitGraph'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The Working Changes row is the way into the staging pane. In the VS Code
// panel it is always there, clean tree or not, because a pane nobody can reach
// is a pane that does not exist — and it is selected on open, so the panel
// always has two panes. The desktop keeps the old rule: a row only when there
// is something to show.

const COMMITS = [{
  hash: 'aaaa111aaaa111aaaa111aaaa111aaaa111aaaa1', shortHash: 'aaaa111',
  message: 'the tip', author: 'Alice', authorEmail: 'a@test.local',
  date: '2026-07-30T10:00:00', parents: [], refs: ['HEAD -> main'],
}]

function render(props: Record<string, any> = {}) {
  installMockGitAPI()
  return renderWithProviders(
    <CommitGraph
      commits={COMMITS as any}
      selectedHash={null}
      onSelectCommit={() => {}}
      searchQuery=""
      currentBranch="main"
      wipCount={0}
      {...props}
    />
  )
}

describe('the Working Changes row', () => {
  test('the desktop shows it only when there is something', async () => {
    render({ wipCount: 0 })
    await screen.findByText('the tip')
    expect(screen.queryByText('Working Changes')).not.toBeInTheDocument()
  })

  test('the panel shows it on a clean tree too', async () => {
    render({ wipCount: 0, alwaysShowWip: true, refsBelow: true })
    expect(await screen.findByText('Working Changes')).toBeInTheDocument()
  })

  // A button that can do nothing is not shown.
  test('✓ appears only when there is something to stage', async () => {
    const onStageAll = jest.fn()
    render({ wipCount: 0, alwaysShowWip: true, refsBelow: true, onStageAll })
    await screen.findByText('Working Changes')
    expect(screen.queryByTitle('Stage all changes')).not.toBeInTheDocument()
  })

  test('✓ stages everything, and does not select the row on the way', async () => {
    const onStageAll = jest.fn()
    const onSelectCommit = jest.fn()
    render({ wipCount: 2, alwaysShowWip: true, refsBelow: true, onStageAll, onSelectCommit })
    await userEvent.click(await screen.findByTitle('Stage all changes'))
    expect(onStageAll).toHaveBeenCalledTimes(1)
    expect(onSelectCommit).not.toHaveBeenCalled()
  })

  test('and without a handler there is no ✓, whatever the count', async () => {
    render({ wipCount: 2, alwaysShowWip: true, refsBelow: true })
    await screen.findByText(/2 files changed/)
    expect(screen.queryByTitle('Stage all changes')).not.toBeInTheDocument()
  })
})
