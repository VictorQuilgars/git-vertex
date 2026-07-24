import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RightPanel from '../RightPanel'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

const CHANGES = {
  staged: [{ path: 'src/a.ts', status: 'M', additions: 12, deletions: 3 }],
  // No counts at all: what git reports for a binary.
  unstaged: [{ path: 'assets/logo.png', status: 'M' }],
  untracked: ['notes.md'],
}

function render(props: Record<string, any> = {}, changes: any = CHANGES) {
  const api = installMockGitAPI({
    getWorkingChanges: jest.fn().mockResolvedValue(changes),
    getLastCommitMessage: jest.fn().mockResolvedValue({ message: '' }),
    getMergeMessage: jest.fn().mockResolvedValue({ message: '' }),
    getCommitFiles: jest.fn().mockResolvedValue({ files: [] }),
    createStash: jest.fn().mockResolvedValue({ success: true }),
  })
  const view = renderWithProviders(
    <RightPanel
      selectedCommit={{ hash: '__WIP__' } as any}
      onCommitSuccess={() => {}}
      showToast={() => {}}
      onSelectCommit={() => {}}
      currentBranch="feature/x"
      embedded
      {...props}
    />
  )
  return { api, ...view }
}

describe('Staging panel — per-file line counts (v1.22.0)', () => {
  test('shows +additions and −deletions for a file git reported counts for', async () => {
    render()
    await waitFor(() => expect(screen.getByText('src/a.ts')).toBeInTheDocument())
    expect(screen.getByText('+12')).toBeInTheDocument()
    expect(screen.getByText('−3')).toBeInTheDocument()
  })

  test('shows nothing rather than +0 −0 when git reported no counts', async () => {
    const { container } = render()
    await waitFor(() => expect(screen.getByText('assets/logo.png')).toBeInTheDocument())
    // The binary row exists but carries no stat block — "unknown" must not be
    // displayed as a genuine zero-line change.
    const rows = [...container.querySelectorAll('.stx-row')]
    const binRow = rows.find(r => r.textContent?.includes('assets/logo.png'))!
    expect(binRow.querySelector('.st-numstat')).toBeNull()
    expect(screen.queryByText('+0')).not.toBeInTheDocument()
  })

  test('a partially staged file sums its staged and unstaged counts', async () => {
    render({}, {
      staged: [{ path: 'src/b.ts', status: 'M', additions: 5, deletions: 1 }],
      unstaged: [{ path: 'src/b.ts', status: 'M', additions: 2, deletions: 4 }],
      untracked: [],
    })
    await waitFor(() => expect(screen.getByText('src/b.ts')).toBeInTheDocument())
    // One row for the file, reporting everything changed against HEAD.
    expect(screen.getByText('+7')).toBeInTheDocument()
    expect(screen.getByText('−5')).toBeInTheDocument()
  })
})

describe('Staging panel — header actions (v1.22.0)', () => {
  test('a staged-count badge distinguishes staged from merely changed', async () => {
    render()
    await waitFor(() => expect(screen.getByText('src/a.ts')).toBeInTheDocument())
    expect(screen.getByText(/1 STAGED/i)).toBeInTheDocument()
  })

  test('no staged badge when nothing is staged', async () => {
    render({}, { staged: [], unstaged: [{ path: 'x.ts', status: 'M' }], untracked: [] })
    await waitFor(() => expect(screen.getByText('x.ts')).toBeInTheDocument())
    expect(screen.queryByText(/STAGED/i)).not.toBeInTheDocument()
  })

  test('stash is reachable from the staging header, not just the toolbar', async () => {
    const { api } = render()
    await waitFor(() => expect(screen.getByText('src/a.ts')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /stash all changes/i }))
    expect(api.createStash).toHaveBeenCalled()
  })

  test('copying the file list puts every path on the clipboard', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render()
    await waitFor(() => expect(screen.getByText('src/a.ts')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /copy file list/i }))
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('src/a.ts')
    )
    expect(writeText.mock.calls[0][0].split('\n')).toHaveLength(3)
  })
})

describe('Branch strip (v1.22.0)', () => {
  const strip = (over: Record<string, any> = {}) => ({
    branch: 'feature/x', ahead: 2, behind: 1,
    onPush: jest.fn(), onPull: jest.fn(), onFetch: jest.fn(),
    ...over,
  })

  test('is absent unless the host supplies it', async () => {
    const { container } = render()
    await waitFor(() => expect(screen.getByText('src/a.ts')).toBeInTheDocument())
    expect(container.querySelector('.bstrip')).toBeNull()
  })

  test('shows the branch and its ahead/behind counts inside the panel', async () => {
    const { container } = render({ branchStrip: strip() })
    await waitFor(() => expect(screen.getByText('src/a.ts')).toBeInTheDocument())
    // Scoped to the strip: the panel's topbar also prints the branch name.
    const bstrip = container.querySelector('.bstrip')!
    expect(within(bstrip as HTMLElement).getByText('feature/x')).toBeInTheDocument()
    expect(within(bstrip as HTMLElement).getByText('↑2')).toBeInTheDocument()
    expect(within(bstrip as HTMLElement).getByText('↓1')).toBeInTheDocument()
  })

  test('push, pull and fetch act without leaving the panel', async () => {
    const s = strip()
    const { container } = render({ branchStrip: s })
    await waitFor(() => expect(container.querySelector('.bstrip')).not.toBeNull())
    // Scoped: the panel also carries a Push tab of its own.
    const strip$ = within(container.querySelector('.bstrip') as HTMLElement)

    await userEvent.click(strip$.getByRole('button', { name: /pull/i }))
    await userEvent.click(strip$.getByRole('button', { name: /push/i }))
    await userEvent.click(strip$.getByRole('button', { name: /fetch/i }))
    expect(s.onPull).toHaveBeenCalledTimes(1)
    expect(s.onPush).toHaveBeenCalledTimes(1)
    expect(s.onFetch).toHaveBeenCalledTimes(1)
  })

  test('push reads as "publish" when the branch has no upstream', async () => {
    render({ branchStrip: strip({ noUpstream: true }) })
    await waitFor(() => expect(document.querySelector('.bstrip')).not.toBeNull())
    expect(screen.getByRole('button', { name: /publish branch/i })).toBeInTheDocument()
  })

  test('associate-issue is a visible call to action, not a buried menu entry', async () => {
    const onAssociateIssue = jest.fn()
    render({ branchStrip: strip({ onAssociateIssue }) })
    await waitFor(() => expect(document.querySelector('.bstrip')).not.toBeNull())

    await userEvent.click(screen.getByRole('button', { name: /associate issue/i }))
    expect(onAssociateIssue).toHaveBeenCalled()
  })

  test('a linked issue is shown with its number and opens on click', async () => {
    const onOpenIssue = jest.fn()
    render({ branchStrip: strip({
      issue: { number: 42, title: 'Login bug' },
      onAssociateIssue: jest.fn(), onOpenIssue,
    }) })
    await waitFor(() => expect(document.querySelector('.bstrip')).not.toBeNull())

    expect(screen.getByText('#42')).toBeInTheDocument()
    expect(screen.getByText('Login bug')).toBeInTheDocument()
    await userEvent.click(screen.getByText('#42'))
    expect(onOpenIssue).toHaveBeenCalledWith(42)
  })
})
