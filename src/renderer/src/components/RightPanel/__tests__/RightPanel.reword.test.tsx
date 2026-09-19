import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RightPanel from '../RightPanel'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// Editing a commit message from the detail panel. It used to work on the tip
// only — `refs.includes('HEAD')` decided it — so a commit four back showed its
// message as dead text with no hint that anything else was possible. git now
// answers the question (getRewordPlan), and the panel asks per commit.

const COMMIT = {
  hash: 'abc1234abc1234abc1234abc1234abc1234abcd',
  shortHash: 'abc1234',
  message: 'feat: the original subject',
  author: 'Alice',
  authorEmail: 'alice@test.local',
  date: '2026-07-30T10:00:00',
  parents: ['def5678def5678def5678def5678def5678defa'],
  refs: [],
}

function render(plan: any, props: Record<string, any> = {}) {
  const api = installMockGitAPI({
    getCommitFiles: jest.fn().mockResolvedValue({ files: [] }),
    getCommitBody: jest.fn().mockResolvedValue({ body: '' }),
    getRewordPlan: jest.fn().mockResolvedValue(plan),
    amendMessage: jest.fn().mockResolvedValue({ success: true }),
    aiGetExplanations: jest.fn().mockResolvedValue({ explanations: {} }),
    getWorkingChanges: jest.fn().mockResolvedValue({ staged: [], unstaged: [], untracked: [] }),
  })
  const view = renderWithProviders(
    <RightPanel
      selectedCommit={COMMIT as any}
      onCommitSuccess={() => {}}
      showToast={() => {}}
      onSelectCommit={() => {}}
      currentBranch="main"
      embedded
      {...props}
    />
  )
  return { api, ...view }
}

const clickMessage = async () => {
  const subject = await screen.findByText('feat: the original subject')
  await userEvent.click(subject)
}

describe('Commit detail — editing the message of any commit', () => {
  // Rewriting with the model is one click from the header: the proposal opens
  // the editor to be reviewed, and nothing is committed before Confirm.
  test('Rewrite, in the header, opens the editor on the model\'s proposal', async () => {
    const { api } = render({ canReword: true, isHead: true, rewrites: 0 })
    ;(api as any).aiRecomposeCommit = jest.fn().mockResolvedValue({ message: 'feat: what the diff really does' })
    await screen.findByText('feat: the original subject')
    await userEvent.click(screen.getByRole('button', { name: /rewrite this commit's message with ai/i }))
    expect(await screen.findByDisplayValue('feat: what the diff really does')).toBeInTheDocument()
    expect((api as any).aiRecomposeCommit).toHaveBeenCalledWith(COMMIT.hash)
    expect(api.amendMessage).not.toHaveBeenCalled()
  })

  test('a commit that cannot be rewritten still gets its proposal: copied, and said', async () => {
    const showToast = jest.fn()
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const { api } = render({ canReword: false, isHead: false, rewrites: 0 }, { showToast })
    ;(api as any).aiRecomposeCommit = jest.fn().mockResolvedValue({ message: 'merge: what it brought in' })
    await screen.findByText('feat: the original subject')
    const rewrite = screen.getByRole('button', { name: /rewrite this commit's message with ai/i })
    expect(rewrite.getAttribute('title')).toMatch(/cannot be rewritten here/)
    await userEvent.click(rewrite)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('merge: what it brought in'))
    expect(showToast).toHaveBeenCalledWith('Proposed message copied to clipboard', 'ok')
    expect(document.querySelector('.cd-amend-textarea')).toBeNull()
  })

  // The model's proposal for the message lives where the message is rewritten.
  // It used to hang off an AI icon in the header, beside a second Explain.
  test('Generate fills the editor with the model\'s proposal, and commits nothing', async () => {
    const { api } = render({ canReword: true, isHead: true, rewrites: 0 })
    ;(api as any).aiRecomposeCommit = jest.fn().mockResolvedValue({ message: 'feat: what the diff really does' })
    // The editor's own button asks again while the message is being reviewed.
    await screen.findByText('feat: the original subject')
    expect(screen.queryByRole('button', { name: 'Generate' })).toBeNull()

    await clickMessage()
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
    expect(await screen.findByDisplayValue('feat: what the diff really does')).toBeInTheDocument()
    expect((api as any).aiRecomposeCommit).toHaveBeenCalledWith(COMMIT.hash)
    // A proposal is reviewed, not applied: the amend waits for Confirm.
    expect(api.amendMessage).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /update message/i }))
    await waitFor(() => expect(api.amendMessage).toHaveBeenCalledWith('feat: what the diff really does'))
  })

  test('the tip opens the editor and amends', async () => {
    const { api } = render({ canReword: true, isHead: true, rewrites: 0 })
    await clickMessage()

    const box = await screen.findByDisplayValue('feat: the original subject')
    await userEvent.clear(box)
    await userEvent.type(box, 'feat: a better subject')
    await userEvent.click(screen.getByRole('button', { name: /update message/i }))

    await waitFor(() => expect(api.amendMessage).toHaveBeenCalledWith('feat: a better subject'))
  })

  // The point of the feature: four commits back is editable too.
  test('an older commit opens the same editor and goes through the host', async () => {
    const onRewordMessage = jest.fn().mockResolvedValue(undefined)
    const { api } = render({ canReword: true, isHead: false, rewrites: 4 }, { onRewordMessage })
    await clickMessage()

    const box = await screen.findByDisplayValue('feat: the original subject')
    await userEvent.clear(box)
    await userEvent.type(box, 'fix: what it really did')
    // The button names the operation, because it is not the same promise.
    await userEvent.click(screen.getByRole('button', { name: /rewrite message/i }))

    await waitFor(() => expect(onRewordMessage).toHaveBeenCalledWith(COMMIT.hash, 'fix: what it really did'))
    // A replay is not an amend — the tip-only call must not fire.
    expect(api.amendMessage).not.toHaveBeenCalled()
  })

  test('the cost is stated before and during the edit', async () => {
    render({ canReword: true, isHead: false, rewrites: 4 }, { onRewordMessage: jest.fn() })
    const subject = await screen.findByText('feat: the original subject')
    // Before: in the tooltip of the block you are about to click.
    expect(subject.closest('.cd-message-block')).toHaveAttribute(
      'title', expect.stringContaining('rewrites 4 commits'))

    await userEvent.click(subject)
    // During: next to the button that will do it.
    expect(await screen.findByText('4 commits will be rewritten')).toBeInTheDocument()
  })

  test('a single rewritten commit is not announced in the plural', async () => {
    render({ canReword: true, isHead: false, rewrites: 1 }, { onRewordMessage: jest.fn() })
    await clickMessage()
    expect(await screen.findByText('1 commit will be rewritten')).toBeInTheDocument()
  })

  // git said no: a merge commit, a root commit, or a commit that is not behind
  // HEAD. The message stays plain text rather than offering an edit that would
  // fail — or worse, rewrite the wrong range.
  test.each([
    ['a merge commit', 'merge-commit'],
    ['a root commit', 'root-commit'],
    ['a commit on another branch', 'not-in-history'],
  ])('%s is not editable at all', async (_label, reason) => {
    render({ canReword: false, isHead: false, rewrites: 0, reason }, { onRewordMessage: jest.fn() })
    const subject = await screen.findByText('feat: the original subject')
    const block = subject.closest('.cd-message-block')!
    expect(block).not.toHaveClass('cd-message-block--amendable')
    expect(block).not.toHaveAttribute('title')

    await userEvent.click(subject)
    expect(document.querySelector('.cd-amend-textarea')).not.toBeInTheDocument()
  })

  // Without a host handler there is nothing to run the replay, so the panel
  // must not offer it — the VS Code panel was in exactly this state until now.
  test('an older commit stays read-only when the host offers no reword', async () => {
    render({ canReword: true, isHead: false, rewrites: 2 })
    const subject = await screen.findByText('feat: the original subject')
    expect(subject.closest('.cd-message-block')).not.toHaveClass('cd-message-block--amendable')
    await userEvent.click(subject)
    expect(document.querySelector('.cd-amend-textarea')).not.toBeInTheDocument()
  })

  test('a host that does not implement getRewordPlan disables editing rather than guessing', async () => {
    const api = installMockGitAPI({
      getCommitFiles: jest.fn().mockResolvedValue({ files: [] }),
      getCommitBody: jest.fn().mockResolvedValue({ body: '' }),
      aiGetExplanations: jest.fn().mockResolvedValue({ explanations: {} }),
      getWorkingChanges: jest.fn().mockResolvedValue({ staged: [], unstaged: [], untracked: [] }),
    })
    delete (api as any).getRewordPlan
    renderWithProviders(
      <RightPanel
        selectedCommit={COMMIT as any}
        onCommitSuccess={() => {}}
        showToast={() => {}}
        onSelectCommit={() => {}}
        currentBranch="main"
        embedded
      />
    )
    const subject = await screen.findByText('feat: the original subject')
    await userEvent.click(subject)
    expect(document.querySelector('.cd-amend-textarea')).not.toBeInTheDocument()
  })
})
