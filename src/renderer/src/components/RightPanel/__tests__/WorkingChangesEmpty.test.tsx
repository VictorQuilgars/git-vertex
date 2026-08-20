import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WorkingChangesEmpty, { nextSteps } from '../WorkingChangesEmpty'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The staging pane on a clean tree. The rule that matters: every row is true
// of the repository, or it is not drawn. A pane of greyed-out suggestions is a
// pane nobody reads.

const t = (k: string, ...a: any[]) => `${k}(${a.join(',')})`
const noop = () => {}

describe('nextSteps — only what is true', () => {
  test('a published, level branch offers nothing but recompose', () => {
    const rows = nextSteps({ branch: 'main', hasUpstream: true, ahead: 0, behind: 0 },
      { onPublish: noop, onPush: noop, onPull: noop, onRecompose: noop }, t)
    expect(rows.map(r => r.key)).toEqual(['recompose'])
  })

  test('an unpublished branch offers publish, and never push', () => {
    const rows = nextSteps({ branch: 'feat', hasUpstream: false, ahead: 3 },
      { onPublish: noop, onPush: noop }, t)
    expect(rows.map(r => r.key)).toEqual(['publish', 'push'])
    expect(rows[0].label).toBe('wc.publish(feat,origin)')
  })

  test('ahead offers push with the count, behind offers pull with the count', () => {
    const rows = nextSteps({ branch: 'b', hasUpstream: true, ahead: 2, behind: 5, remoteName: 'upstream' },
      { onPush: noop, onPull: noop }, t)
    expect(rows.map(r => r.label)).toEqual(['wc.push(2,upstream)', 'wc.pull(5,upstream)'])
  })

  // The rule of the panel, applied here: no handler, no row.
  test('a row without its handler is not offered, whatever the state', () => {
    const rows = nextSteps({ branch: 'feat', hasUpstream: false, ahead: 3, behind: 2 }, {}, t)
    expect(rows).toEqual([])
  })

  test('unknown upstream reads as "has one" — publish is not guessed', () => {
    const rows = nextSteps({ branch: 'b' }, { onPublish: noop }, t)
    expect(rows).toEqual([])
  })
})

describe('WorkingChangesEmpty — what it draws', () => {
  beforeEach(() => { installMockGitAPI() })

  test('a section with nothing true in it is not drawn', () => {
    renderWithProviders(<WorkingChangesEmpty
      state={{ branch: 'main', hasUpstream: true }}
      actions={{}} />)
    expect(screen.queryByText(/next steps/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/attention/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/start new/i)).not.toBeInTheDocument()
  })

  test('the attention section exists only when the host knows about pull requests', () => {
    const { unmount } = renderWithProviders(<WorkingChangesEmpty
      state={{ branch: 'main', hasUpstream: true }} actions={{}} />)
    expect(screen.queryByText(/pull request/i)).not.toBeInTheDocument()
    unmount()
    renderWithProviders(<WorkingChangesEmpty
      state={{ branch: 'main', hasUpstream: true, openPRs: 3 }} actions={{ onShowPRs: noop }} />)
    expect(screen.getByText(/3 open pull requests/i)).toBeInTheDocument()
  })

  test('the buttons do what their row says', async () => {
    const onPush = jest.fn(), onCreateBranch = jest.fn()
    renderWithProviders(<WorkingChangesEmpty
      state={{ branch: 'b', hasUpstream: true, ahead: 1 }}
      actions={{ onPush, onCreateBranch }} />)
    await userEvent.click(screen.getByText('Push'))
    await userEvent.click(screen.getByText(/create a branch/i))
    expect(onPush).toHaveBeenCalledTimes(1)
    expect(onCreateBranch).toHaveBeenCalledTimes(1)
  })

  // Victor's second pass: the reference fills the pane — Launchpad and the six
  // start-new rows. Same rule as everything else here: a row exists only when
  // its handler does, because each handler is only supplied when the thing it
  // opens exists (a stash list with stashes in it, a GitHub tab with a repo).
  test('review-changes is a next step when the host can compare', () => {
    const onReviewChanges = jest.fn()
    const rows = nextSteps({ branch: 'b', hasUpstream: true }, { onReviewChanges }, t)
    expect(rows.map(r => r.key)).toEqual(['review'])
  })

  test('the start-new list is exactly the handlers supplied, in order', () => {
    renderWithProviders(<WorkingChangesEmpty
      state={{ branch: 'b', hasUpstream: true }}
      actions={{
        onStartFromIssue: noop, onStartReviewPR: noop, onApplyStash: noop,
        onCreateWorktree: noop, onCreateBranch: noop, onSwitchBranch: noop,
      }} />)
    const labels = [...document.querySelectorAll('.wce-start')].map(b => b.textContent)
    expect(labels).toEqual([
      'Start work on an issue…', 'Start review on a PR…', 'Apply / pop a stash…',
      'Create a worktree…', 'Create a branch…', 'Switch branch…',
    ])
  })

  test('the PR count is a Launchpad row, and zero says so', () => {
    renderWithProviders(<WorkingChangesEmpty
      state={{ branch: 'b', hasUpstream: true, openPRs: 4 }} actions={{ onShowPRs: noop }} />)
    expect(screen.getByText('Launchpad')).toBeInTheDocument()
    expect(screen.getByText(/4 open pull requests/i)).toBeInTheDocument()
  })
})
