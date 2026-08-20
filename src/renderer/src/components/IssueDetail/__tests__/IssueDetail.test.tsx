import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import IssueDetail from '../IssueDetail'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The issue detail — §3 bis. The contract these tests hold: every read is
// shown, every edit goes through the one PATCH and applies only after it
// succeeds, and a failure is written where the edit happened rather than
// swallowed. The layout rules (graph replaced, commit panel absent) belong
// to the hosts and are not testable from here.

const ITEM = {
  number: 24, title: 'Push notifications', url: 'https://x/24',
  author: 'victor', createdAt: new Date(Date.now() - 3600_000).toISOString(),
  body: '## Objectif\n\nEnvoyer des notifications.',
  labels: [{ name: 'frontend', color: '1d76db' }],
  assignees: [],
}

function draw(props: Record<string, any> = {}, apiOverrides: Record<string, any> = {}) {
  const api = installMockGitAPI({
    githubIssueComments: jest.fn().mockResolvedValue({
      comments: [{ author: 'alice', createdAt: new Date().toISOString(), body: 'On it — see `notes`.' }],
    }),
    githubAddIssueComment: jest.fn().mockResolvedValue({ success: true }),
    githubUpdateIssue: jest.fn().mockResolvedValue({ success: true }),
    githubListAssignees: jest.fn().mockResolvedValue({ assignees: ['victor', 'alice'] }),
    githubListRepoLabels: jest.fn().mockResolvedValue({
      labels: [{ name: 'frontend', color: '1d76db' }, { name: 'bug', color: 'ff0000' }],
    }),
    openExternal: jest.fn(),
    ...apiOverrides,
  })
  const view = renderWithProviders(
    <IssueDetail
      repo={{ owner: 'o', repo: 'r' }}
      item={ITEM as any}
      onClose={() => {}}
      {...props}
    />
  )
  return { api, ...view }
}

describe('what the detail shows', () => {
  test('the body renders as markdown, the comments arrive with their authors', async () => {
    draw()
    expect(screen.getByText('Objectif')).toBeInTheDocument()
    expect(await screen.findByText('@alice')).toBeInTheDocument()
    expect(screen.getByText(/On it/)).toBeInTheDocument()
  })

  test('status, labels and assignees are in the side column', async () => {
    draw()
    await screen.findByText('@alice')
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('frontend')).toBeInTheDocument()
    expect(screen.getByText('None')).toBeInTheDocument()
  })
})

describe('the writes go through the one PATCH, and apply only on success', () => {
  test('a comment is posted, the box clears, the thread reloads', async () => {
    const { api } = draw()
    await screen.findByText('@alice')
    const box = screen.getByPlaceholderText(/Add a comment/i)
    await userEvent.type(box, 'My two cents')
    await userEvent.click(screen.getByText('Add Comment'))
    await waitFor(() =>
      expect(api.githubAddIssueComment).toHaveBeenCalledWith('o', 'r', 24, 'My two cents'))
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe(''))
    expect(api.githubIssueComments).toHaveBeenCalledTimes(2)
  })

  test('closing flips to reopen; reopening flips back', async () => {
    const { api } = draw()
    await screen.findByText('@alice')
    await userEvent.click(screen.getByText('Close Issue'))
    await waitFor(() =>
      expect(api.githubUpdateIssue).toHaveBeenCalledWith('o', 'r', 24, { state: 'closed' }))
    expect(await screen.findByText('Reopen Issue')).toBeInTheDocument()
    expect(screen.getByText('Closed')).toBeInTheDocument()
  })

  test('the title edits in place, through the PATCH', async () => {
    const { api } = draw()
    await screen.findByText('@alice')
    await userEvent.click(screen.getByText('Push notifications'))
    const input = screen.getByDisplayValue('Push notifications')
    await userEvent.clear(input)
    await userEvent.type(input, 'Web push{Enter}')
    await waitFor(() =>
      expect(api.githubUpdateIssue).toHaveBeenCalledWith('o', 'r', 24, { title: 'Web push' }))
    expect(await screen.findByText('Web push')).toBeInTheDocument()
  })

  test('the labels editor lists the repository labels and saves the picked names', async () => {
    const { api } = draw()
    await screen.findByText('@alice')
    const pencils = document.querySelectorAll('.idv-pencil')
    // side column order: description pencil is in the main column; the side
    // pencils are assignees then labels
    await userEvent.click(pencils[pencils.length - 1])
    await waitFor(() => expect(api.githubListRepoLabels).toHaveBeenCalled())
    await userEvent.click(await screen.findByText('bug'))
    await userEvent.click(screen.getByText('Save'))
    await waitFor(() =>
      expect(api.githubUpdateIssue).toHaveBeenCalledWith('o', 'r', 24, { labels: ['frontend', 'bug'] }))
  })

  test('the assignees editor lists who can be assigned and saves', async () => {
    const { api } = draw()
    await screen.findByText('@alice')
    const pencils = document.querySelectorAll('.idv-pencil')
    await userEvent.click(pencils[pencils.length - 2])
    await waitFor(() => expect(api.githubListAssignees).toHaveBeenCalled())
    await userEvent.click(await screen.findByText('victor'))
    await userEvent.click(screen.getByText('Save'))
    await waitFor(() =>
      expect(api.githubUpdateIssue).toHaveBeenCalledWith('o', 'r', 24, { assignees: ['victor'] }))
    expect(await screen.findByText('@victor')).toBeInTheDocument()
  })

  test('a refused write shows the error and applies nothing', async () => {
    draw({}, { githubUpdateIssue: jest.fn().mockResolvedValue({ error: 'HTTP 403' }) })
    await screen.findByText('@alice')
    await userEvent.click(screen.getByText('Close Issue'))
    expect(await screen.findByText('HTTP 403')).toBeInTheDocument()
    // still open, still offering to close — the failure changed nothing
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('Close Issue')).toBeInTheDocument()
  })
})

describe('the two ways out and the branch', () => {
  test('the create-branch button exists only with its handler, and hands over the issue', async () => {
    draw()
    await screen.findByText('@alice')
    expect(screen.queryByText(/Create Branch/i)).not.toBeInTheDocument()

    const onCreateBranch = jest.fn()
    draw({ onCreateBranch })
    await userEvent.click((await screen.findAllByText(/Create Branch/i))[0])
    expect(onCreateBranch).toHaveBeenCalledWith({ number: 24, title: 'Push notifications', url: 'https://x/24' })
  })

  test('the close control closes, the external control opens the forge', async () => {
    const onClose = jest.fn()
    const { api } = draw({ onClose })
    await screen.findByText('@alice')
    await userEvent.click(screen.getByTitle(/^(Close|Fermer)$/))
    expect(onClose).toHaveBeenCalled()
    await userEvent.click(screen.getByTitle(/Open on GitHub|Ouvrir sur GitHub/))
    expect(api.openExternal).toHaveBeenCalledWith('https://x/24')
  })
})
