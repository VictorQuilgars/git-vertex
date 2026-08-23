import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PRModal from '../PRModal'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The composer had no tests, which is how it came to create a request and tell
// nobody: the app had to be informed of its OWN write by a refresh button.
// A poll would only have hidden it — up to a minute later.

const INTENT = { head: 'feat/x', base: 'main', baseLabel: 'origin/main', headLabel: 'feat/x', needsPush: false }

function draw(over: Record<string, any> = {}, api: Record<string, any> = {}) {
  const mock = installMockGitAPI({
    getLastCommitMessage: jest.fn().mockResolvedValue({ message: 'feat: a thing' }),
    githubListBranches: jest.fn().mockResolvedValue({ branches: ['main', 'feat/x'] }),
    githubCreatePR: jest.fn().mockResolvedValue({ url: 'https://x/pr/7', number: 7 }),
    pushBranch: jest.fn().mockResolvedValue({ success: true }),
    ...api,
  })
  const props = {
    owner: 'o', repo: 'r', intent: INTENT,
    onClose: jest.fn(), onPushed: jest.fn(), onCreated: jest.fn(),
    showToast: jest.fn(),
    ...over,
  }
  renderWithProviders(<PRModal {...(props as any)} />)
  return { api: mock, props }
}

const submit = async () => {
  await waitFor(() => expect(screen.getByDisplayValue('feat: a thing')).toBeInTheDocument())
  await userEvent.click(screen.getByText('Create Pull Request'))
}

describe('creating a pull request', () => {
  test('the host is told, with the number, so its list can hold the new request', async () => {
    const { props } = draw()
    await submit()
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith(7))
  })

  test('a refused creation tells nobody — there is nothing to reload', async () => {
    const { props } = draw({}, {
      githubCreatePR: jest.fn().mockResolvedValue({ error: 'Validation Failed (No commits between main and feat/x)' }),
    })
    await submit()
    expect(await screen.findByText(/No commits between/)).toBeInTheDocument()
    expect(props.onCreated).not.toHaveBeenCalled()
  })

  // GitHub cannot open a request on a branch it has never received, so the
  // composer pushes first — and a failed push must not go on to create.
  test('an unpushed head is pushed first, and a failed push stops there', async () => {
    const pushBranch = jest.fn().mockResolvedValue({ success: false, error: 'rejected' })
    const githubCreatePR = jest.fn()
    const { props } = draw({ intent: { ...INTENT, needsPush: true } }, { pushBranch, githubCreatePR })
    await submit()
    await waitFor(() => expect(pushBranch).toHaveBeenCalledWith('feat/x'))
    expect(githubCreatePR).not.toHaveBeenCalled()
    expect(props.onCreated).not.toHaveBeenCalled()
  })

  test('a successful push reaches the host too, then the request is created', async () => {
    const { api, props } = draw({ intent: { ...INTENT, needsPush: true } })
    await submit()
    await waitFor(() => expect(props.onPushed).toHaveBeenCalled())
    await waitFor(() => expect(api.githubCreatePR).toHaveBeenCalled())
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith(7))
  })
})
