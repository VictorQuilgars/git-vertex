import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PRComposer from '../PRComposer'
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
    githubListRepos: jest.fn().mockResolvedValue({ repos: [] }),
    githubRepoParent: jest.fn().mockResolvedValue({ parent: null }),
    pushBranch: jest.fn().mockResolvedValue({ success: true }),
    ...api,
  })
  const props = {
    owner: 'o', repo: 'r', intent: INTENT,
    branches: [],
    // The drawer measures the panel it extends; any element is a panel here.
    anchor: { current: document.createElement('div') },
    onClose: jest.fn(), onPushed: jest.fn(), onCreated: jest.fn(),
    showToast: jest.fn(),
    ...over,
  }
  renderWithProviders(<PRComposer {...(props as any)} />)
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

// #130 §1 — title and body from one call, filled and never submitted.
describe('generating the title and description', () => {
  test('the answer fills both fields and submits nothing', async () => {
    const aiPrDescription = jest.fn().mockResolvedValue({ title: 'feat: the branch', body: 'What it does.' })
    const { api } = draw({}, { aiPrDescription })
    await waitFor(() => expect(screen.getByDisplayValue('feat: a thing')).toBeInTheDocument())
    await userEvent.click(screen.getByText('Draft the title and description'))
    await waitFor(() => expect(screen.getByDisplayValue('feat: the branch')).toBeInTheDocument())
    expect(screen.getByDisplayValue('What it does.')).toBeInTheDocument()
    expect(aiPrDescription).toHaveBeenCalledWith('main', 'feat/x')
    expect(api.githubCreatePR).not.toHaveBeenCalled()
  })

  test('a refusal is named, and the fields are left exactly as they were', async () => {
    const aiPrDescription = jest.fn().mockResolvedValue({ error: 'NO_API_KEY' })
    draw({}, { aiPrDescription })
    await waitFor(() => expect(screen.getByDisplayValue('feat: a thing')).toBeInTheDocument())
    await userEvent.click(screen.getByText('Draft the title and description'))
    expect(await screen.findByText('NO_API_KEY')).toBeInTheDocument()
    expect(screen.getByDisplayValue('feat: a thing')).toBeInTheDocument()
  })
})

// #130 §3 — the cheapest item: the flag rides the same call.
describe('opening as a draft', () => {
  test('the checkbox reaches the creation call', async () => {
    const { api } = draw()
    await waitFor(() => expect(screen.getByDisplayValue('feat: a thing')).toBeInTheDocument())
    await userEvent.click(screen.getByLabelText('Open as a draft'))
    await userEvent.click(screen.getByText('Create Pull Request'))
    await waitFor(() => expect(api.githubCreatePR).toHaveBeenCalledWith(
      'o', 'r', 'feat: a thing', '', 'feat/x', 'main', true))
  })
})

// #130 §2 — both ends. A fork's request lands on its parent, and the head
// crosses repositories as `owner:branch`.
describe('choosing both ends', () => {
  test('a target in another repository prefixes the head with its owner', async () => {
    const githubRepoParent = jest.fn().mockResolvedValue({
      parent: { owner: 'up', repo: 'r', defaultBranch: 'main' },
    })
    const { api } = draw({}, { githubRepoParent })
    await waitFor(() => expect(screen.getByDisplayValue('feat: a thing')).toBeInTheDocument())
    // the parent surfaced by the lookup is offered as a target
    await waitFor(() => expect(screen.getByTitle('Target repository')).toHaveTextContent('up/r'))
    await userEvent.selectOptions(screen.getByTitle('Target repository'), 'up/r')
    await userEvent.click(screen.getByText('Create Pull Request'))
    // the request lives in the TARGET repository, the head names the source
    await waitFor(() => expect(api.githubCreatePR).toHaveBeenCalledWith(
      'up', 'r', 'feat: a thing', '', 'o:feat/x', 'main', false))
  })
})
