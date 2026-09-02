import { screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import IssueDetail, { detailKey } from '../IssueDetail'
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

  test('the status is the current state, not a verb', async () => {
    draw()
    await screen.findByText('@alice')
    const bar = document.querySelector('.idv-state-bar')!
    expect(bar.textContent).toBe('Open')
    expect(screen.queryByText(/Close Issue/)).not.toBeInTheDocument()
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

  test('closing is editing the status: pencil, then the other state', async () => {
    const { api } = draw()
    await screen.findByText('@alice')
    // the pencil beside STATUS opens the two states, the current one checked
    const statusBlock = document.querySelector('.idv-state-bar')!.closest('.idv-block')!
    await userEvent.click(statusBlock.querySelector('.idv-pencil')!)
    const closedOption = [...statusBlock.querySelectorAll('.idv-pick-row')]
      .find(b => b.textContent?.includes('Closed'))!
    await userEvent.click(closedOption)
    await waitFor(() =>
      expect(api.githubUpdateIssue).toHaveBeenCalledWith('o', 'r', 24, { state: 'closed' }))
    await waitFor(() =>
      expect(document.querySelector('.idv-state-bar')!.textContent).toBe('Closed'))
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

  test('a label toggle applies on the spot — no Save anywhere', async () => {
    const { api } = draw()
    await screen.findByText('@alice')
    const pencils = document.querySelectorAll('.idv-pencil')
    await userEvent.click(pencils[pencils.length - 1])
    await waitFor(() => expect(api.githubListRepoLabels).toHaveBeenCalled())
    await userEvent.click(await screen.findByText('bug'))
    await waitFor(() =>
      expect(api.githubUpdateIssue).toHaveBeenCalledWith('o', 'r', 24, { labels: ['frontend', 'bug'] }))
    expect(screen.queryByText('Save')).not.toBeInTheDocument()
  })

  test('what the issue already carries comes first, and holds its place', async () => {
    const { api } = draw({}, {
      githubListRepoLabels: jest.fn().mockResolvedValue({
        labels: [{ name: 'bug', color: 'ff0000' }, { name: 'cli', color: '00ffff' },
                 { name: 'frontend', color: '1d76db' }],
      }),
    })
    await screen.findByText('@alice')
    const pencils = document.querySelectorAll('.idv-pencil')
    await userEvent.click(pencils[pencils.length - 1])
    await waitFor(() => expect(api.githubListRepoLabels).toHaveBeenCalled())
    const first = () => document.querySelector('.idv-pick-row')!.textContent
    expect(first()).toContain('frontend')
    // un-picking it must not re-sort the list under the pointer
    await userEvent.click(screen.getAllByText('frontend').find(e => e.closest('.idv-pick-row'))!)
    await waitFor(() => expect(api.githubUpdateIssue).toHaveBeenCalled())
    expect(first()).toContain('frontend')
  })

  test('the search narrows the options', async () => {
    const { api } = draw()
    await screen.findByText('@alice')
    const pencils = document.querySelectorAll('.idv-pencil')
    await userEvent.click(pencils[pencils.length - 1])
    await waitFor(() => expect(api.githubListRepoLabels).toHaveBeenCalled())
    await userEvent.type(screen.getByPlaceholderText(/Select|Filtrer/), 'bu')
    const rows = document.querySelectorAll('.idv-pick-row')
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toContain('bug')
  })

  test('an assignee toggle applies on the spot, and shows once GitHub said yes', async () => {
    const { api } = draw()
    await screen.findByText('@alice')
    const pencils = document.querySelectorAll('.idv-pencil')
    await userEvent.click(pencils[pencils.length - 2])
    await waitFor(() => expect(api.githubListAssignees).toHaveBeenCalled())
    await userEvent.click(await screen.findByText('victor'))
    await waitFor(() =>
      expect(api.githubUpdateIssue).toHaveBeenCalledWith('o', 'r', 24, { assignees: ['victor'] }))
    expect(await screen.findByText('@victor')).toBeInTheDocument()
  })

  test('clicking anywhere else leaves the editor', async () => {
    const { api } = draw()
    await screen.findByText('@alice')
    const pencils = document.querySelectorAll('.idv-pencil')
    await userEvent.click(pencils[pencils.length - 1])
    await waitFor(() => expect(api.githubListRepoLabels).toHaveBeenCalled())
    expect(document.querySelector('.idv-picker')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByText('Objectif'))
    await waitFor(() =>
      expect(document.querySelector('.idv-picker')).not.toBeInTheDocument())
  })

  test('a refused write shows the error and applies nothing', async () => {
    draw({}, { githubUpdateIssue: jest.fn().mockResolvedValue({ error: 'HTTP 403' }) })
    await screen.findByText('@alice')
    const statusBlock = document.querySelector('.idv-state-bar')!.closest('.idv-block')!
    await userEvent.click(statusBlock.querySelector('.idv-pencil')!)
    const closedOption = [...statusBlock.querySelectorAll('.idv-pick-row')]
      .find(b => b.textContent?.includes('Closed'))!
    await userEvent.click(closedOption)
    expect(await screen.findByText('HTTP 403')).toBeInTheDocument()
    // the failure changed nothing: the bar still says Open
    expect(document.querySelector('.idv-state-bar')!.textContent).toBe('Open')
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

// #175 — clicking another issue while one was open kept showing the first:
// the detail seeds its state from the item once, at mount, and the host
// handed it a new item under the same instance. The host keys it now; this
// is the host's shape, reduced to what matters.
describe('another issue is another instance', () => {
  function Host({ items }: { items: any[] }) {
    const [i, setI] = useState(0)
    const item = items[i]
    return (
      <>
        <button onClick={() => setI(1)}>next</button>
        <IssueDetail key={detailKey('issue', item.number)} repo={{ owner: 'o', repo: 'r' }}
          item={item} onClose={() => {}} />
      </>
    )
  }

  test('keyed by detailKey, the second item shows — head and all', async () => {
    installMockGitAPI({
      githubIssueComments: jest.fn().mockResolvedValue({ comments: [] }),
      githubListAssignees: jest.fn().mockResolvedValue({ assignees: [] }),
      githubListRepoLabels: jest.fn().mockResolvedValue({ labels: [] }),
    })
    const other = { ...ITEM, number: 25, title: 'Dark mode', body: 'Everything, inverted.', labels: [] }
    renderWithProviders(<Host items={[ITEM, other]} />)
    expect(await screen.findByText('Push notifications')).toBeInTheDocument()
    await userEvent.click(screen.getByText('next'))
    expect(await screen.findByText('Dark mode')).toBeInTheDocument()
    expect(screen.queryByText('Push notifications')).not.toBeInTheDocument()
    expect(detailKey('pr', 25)).not.toBe(detailKey('issue', 25))
  })
})
