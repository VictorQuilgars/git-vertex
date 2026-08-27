import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import IssueComposer from '../IssueComposer'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The PR composer's sibling: one POST carries title, body, labels and
// assignees together, and the AI writes from a SENTENCE — the brief is the
// material, there is no diff to read.

function draw(over: Record<string, any> = {}, api: Record<string, any> = {}) {
  const mock = installMockGitAPI({
    githubListRepoLabels: jest.fn().mockResolvedValue({ labels: [
      { name: 'bug', color: 'ff0000' }, { name: 'P1', color: 'fbca04' },
    ] }),
    githubListAssignees: jest.fn().mockResolvedValue({ assignees: ['ana', 'bob'] }),
    githubCreateIssue: jest.fn().mockResolvedValue({ url: 'https://x/issues/9', number: 9 }),
    ...api,
  })
  const props = {
    owner: 'o', repo: 'r',
    anchor: { current: document.createElement('div') },
    onClose: jest.fn(), onCreated: jest.fn(), onStartBranch: jest.fn(),
    showToast: jest.fn(),
    ...over,
  }
  renderWithProviders(<IssueComposer {...(props as any)} />)
  return { api: mock, props }
}

describe('creating an issue', () => {
  test('one call carries the title, the body, the labels and the assignees', async () => {
    const { api, props } = draw()
    await userEvent.type(screen.getByPlaceholderText('A title for the issue'), 'The graph loses focus')
    await userEvent.type(screen.getByPlaceholderText(/Describe it/), 'After a rebase.')
    await userEvent.click(screen.getByText('Add labels…'))
    await userEvent.click(await screen.findByText('bug'))
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByText('Add assignees…'))
    await userEvent.click(await screen.findByText('ana'))
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByText('Create Issue'))
    await waitFor(() => expect(api.githubCreateIssue).toHaveBeenCalledWith(
      'o', 'r', 'The graph loses focus', 'After a rebase.', ['bug'], ['ana']))
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith(9))
    expect(props.onClose).toHaveBeenCalled()
    // the checkbox was not ticked: no branch is started
    expect(props.onStartBranch).not.toHaveBeenCalled()
  })

  test('the checkbox starts the branch once the issue exists', async () => {
    const { props } = draw()
    await userEvent.type(screen.getByPlaceholderText('A title for the issue'), 'A thing')
    await userEvent.click(screen.getByLabelText('Create a branch for this issue'))
    await userEvent.click(screen.getByText('Create Issue'))
    await waitFor(() => expect(props.onStartBranch).toHaveBeenCalledWith(
      { number: 9, title: 'A thing', url: 'https://x/issues/9' }))
  })

  test('a refusal is named where the click happened, and nothing closes', async () => {
    const { props } = draw({}, {
      githubCreateIssue: jest.fn().mockResolvedValue({ error: 'Validation Failed (missing_field)' }),
    })
    await userEvent.type(screen.getByPlaceholderText('A title for the issue'), 'A thing')
    await userEvent.click(screen.getByText('Create Issue'))
    expect(await screen.findByText(/missing_field/)).toBeInTheDocument()
    expect(props.onClose).not.toHaveBeenCalled()
    expect(props.onCreated).not.toHaveBeenCalled()
  })
})

describe('an issue written from what is there', () => {
  // No summoned field: the brief and the finished issue are the same
  // language in the same place, so the model reads the fields and rewrites
  // them — and what it replaced is one click away.
  test('the click generates from the fields and submits nothing', async () => {
    const aiGenerateIssue = jest.fn().mockResolvedValue({
      title: 'The graph loses the selection after a rebase', body: 'Context.\n\n- done when…',
    })
    const { api } = draw({}, { aiGenerateIssue })
    await userEvent.type(screen.getByPlaceholderText(/Describe it/), 'graph selection lost after rebase')
    await userEvent.click(screen.getByText('Generate title and description'))
    await waitFor(() => expect(screen.getByDisplayValue(/loses the selection/)).toBeInTheDocument())
    await waitFor(() => expect(screen.getByDisplayValue(/done when/)).toBeInTheDocument())
    expect(aiGenerateIssue).toHaveBeenCalledWith('graph selection lost after rebase')
    expect(api.githubCreateIssue).not.toHaveBeenCalled()
  })

  test('with nothing to write from, the button is disabled and says why', () => {
    draw({}, { aiGenerateIssue: jest.fn() })
    const btn = screen.getByText('Generate title and description').closest('button')!
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', expect.stringContaining('a few words'))
  })

  test('what the model replaced is one click away', async () => {
    const aiGenerateIssue = jest.fn().mockResolvedValue({ title: 'Proper title', body: 'Proper body.' })
    draw({}, { aiGenerateIssue })
    await userEvent.type(screen.getByPlaceholderText(/Describe it/), 'my rough note')
    await userEvent.click(screen.getByText('Generate title and description'))
    await waitFor(() => expect(screen.getByDisplayValue('Proper title')).toBeInTheDocument())
    await userEvent.click(await screen.findByText('Put it back'))
    expect(screen.getByPlaceholderText(/Describe it/)).toHaveValue('my rough note')
    expect(screen.getByPlaceholderText('A title for the issue')).toHaveValue('')
    // the way back was taken; the line is gone
    expect(screen.queryByText('Put it back')).not.toBeInTheDocument()
  })

  test('a refusal is named and the fields are left exactly as they were', async () => {
    const aiGenerateIssue = jest.fn().mockResolvedValue({ error: 'NO_API_KEY' })
    draw({}, { aiGenerateIssue })
    await userEvent.type(screen.getByPlaceholderText(/Describe it/), 'anything')
    await userEvent.click(screen.getByText('Generate title and description'))
    expect(await screen.findByText('NO_API_KEY')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Describe it/)).toHaveValue('anything')
    expect(screen.queryByText('Put it back')).not.toBeInTheDocument()
  })
})
