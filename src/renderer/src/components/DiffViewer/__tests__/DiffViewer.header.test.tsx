import { screen } from '@testing-library/react'
import DiffViewer from '../DiffViewer'
import { syntheticCommit } from '../../../app/shared'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The header says who and when — of a commit. A stash's preview hands it a
// commit with neither, and an empty date was formatted anyway: "Invalid Date".

beforeEach(() => installMockGitAPI())

describe('the diff’s header', () => {
  test('a stash names itself and says nothing it does not know', () => {
    const { container } = renderWithProviders(
      <DiffViewer commit={syntheticCommit('stash@{0}', 'WIP on main')} diff="" files={[]} loading={false} />)

    expect(screen.getByText('WIP on main')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/Invalid Date/)
    expect(container.querySelector('.commit-sub')).toBeNull()
  })

  test('a commit keeps its author and its date', () => {
    const { container } = renderWithProviders(
      <DiffViewer
        commit={{ ...syntheticCommit('abc1234', 'Fix it'), author: 'Ada', date: '2026-09-01T10:00:00Z' }}
        diff="" files={[]} loading={false} />)

    const sub = container.querySelector('.commit-sub')!
    expect(sub.textContent).toContain('Ada')
    expect(sub.querySelector('.dot')).toBeInTheDocument()
    expect(sub.textContent).toMatch(/2026/)
  })
})
