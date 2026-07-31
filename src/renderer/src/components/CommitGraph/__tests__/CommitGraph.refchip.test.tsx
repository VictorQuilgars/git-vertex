import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CommitGraph from '../CommitGraph'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// A branch chip sits on top of the commit row. The browser sends click, click,
// dblclick, and only the last was being stopped — so double-clicking a chip ran
// the row's onSelectCommit first and the detail panel flashed open on the way to
// the checkout. A chip is about the BRANCH; its click must not reach the row.

const COMMITS = [
  {
    hash: 'aaaa111aaaa111aaaa111aaaa111aaaa111aaaa1',
    shortHash: 'aaaa111',
    message: 'the tip',
    author: 'Alice', authorEmail: 'alice@test.local',
    date: '2026-07-30T10:00:00', parents: [], refs: ['HEAD -> main', 'origin/main'],
  },
]

function render() {
  installMockGitAPI()
  const onSelectCommit = jest.fn()
  const onCheckoutBranch = jest.fn()
  renderWithProviders(
    <CommitGraph
      commits={COMMITS as any}
      selectedHash={null}
      onSelectCommit={onSelectCommit}
      searchQuery=""
      currentBranch="main"
      onCheckoutBranch={onCheckoutBranch}
    />
  )
  return { onSelectCommit, onCheckoutBranch }
}

describe('CommitGraph — branch chips', () => {
  test('double-clicking a chip goes to the branch without selecting the commit', async () => {
    const { onSelectCommit, onCheckoutBranch } = render()
    const chip = await screen.findByText('main')

    await userEvent.dblClick(chip)

    await waitFor(() => expect(onCheckoutBranch).toHaveBeenCalledWith('main'))
    // The flash: the row's handler must never have run.
    expect(onSelectCommit).not.toHaveBeenCalled()
  })

  test('a single click on a chip does not select the commit either', async () => {
    const { onSelectCommit } = render()

    await userEvent.click(await screen.findByText('main'))

    expect(onSelectCommit).not.toHaveBeenCalled()
  })

  test('clicking the row itself still selects the commit', async () => {
    const { onSelectCommit } = render()

    await userEvent.click(await screen.findByText('the tip'))

    expect(onSelectCommit).toHaveBeenCalled()
  })
})
