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
    getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
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
    await userEvent.click(screen.getByText('Generate title and description'))
    await waitFor(() => expect(screen.getByDisplayValue('feat: the branch')).toBeInTheDocument())
    // The reveal writes the title, then the body — the answer exists in full
    // before the first word shows, but the fields fill in sequence.
    await waitFor(() => expect(screen.getByDisplayValue('What it does.')).toBeInTheDocument())
    expect(aiPrDescription).toHaveBeenCalledWith('main', 'feat/x')
    expect(api.githubCreatePR).not.toHaveBeenCalled()
  })

  test('a refusal is named, and the fields are left exactly as they were', async () => {
    const aiPrDescription = jest.fn().mockResolvedValue({ error: 'NO_API_KEY' })
    draw({}, { aiPrDescription })
    await waitFor(() => expect(screen.getByDisplayValue('feat: a thing')).toBeInTheDocument())
    await userEvent.click(screen.getByText('Generate title and description'))
    expect(await screen.findByText('NO_API_KEY')).toBeInTheDocument()
    expect(screen.getByDisplayValue('feat: a thing')).toBeInTheDocument()
  })
})

// #130 §3 — the cheapest item: the flag rides the same call.
describe('opening as a draft', () => {
  test('the checkbox reaches the creation call', async () => {
    const { api } = draw()
    await waitFor(() => expect(screen.getByDisplayValue('feat: a thing')).toBeInTheDocument())
    await userEvent.click(screen.getByLabelText('Submit as draft'))
    await userEvent.click(screen.getByText('Create Pull Request'))
    await waitFor(() => expect(api.githubCreatePR).toHaveBeenCalledWith(
      'o', 'r', 'feat: a thing', '', 'feat/x', 'main', true))
  })
})

// #130 §2 — both ends. A fork's request lands on its parent, and the head
// crosses repositories as `owner:branch`.
describe('choosing both ends', () => {
  // The selectors offer what this repository is CONNECTED to — its remotes
  // and its fork parent — not everything the account can see: a request
  // cannot run between repositories this one is not related to.
  test('the ends offer the repositories behind the remotes, and no more', async () => {
    const getRemotes = jest.fn().mockResolvedValue({ remotes: [
      { name: 'origin', fetchUrl: 'git@github.com:o/r.git', pushUrl: '' },
      { name: 'upstream', fetchUrl: 'https://github.com/up/r.git', pushUrl: '' },
    ] })
    draw({}, { getRemotes })
    await waitFor(() => expect(screen.getByLabelText('To repository')).toHaveTextContent('up/r'))
    expect(screen.getByLabelText('From repository')).toHaveTextContent('up/r')
  })

  test('a target in another repository prefixes the head with its owner', async () => {
    const githubRepoParent = jest.fn().mockResolvedValue({
      parent: { owner: 'up', repo: 'r', defaultBranch: 'main' },
    })
    const { api } = draw({}, { githubRepoParent })
    await waitFor(() => expect(screen.getByDisplayValue('feat: a thing')).toBeInTheDocument())
    // the parent surfaced by the lookup is offered as a target
    await waitFor(() => expect(screen.getByLabelText('To repository')).toHaveTextContent('up/r'))
    await userEvent.selectOptions(screen.getByLabelText('To repository'), 'up/r')
    await userEvent.click(screen.getByText('Create Pull Request'))
    // the request lives in the TARGET repository, the head names the source
    await waitFor(() => expect(api.githubCreatePR).toHaveBeenCalledWith(
      'up', 'r', 'feat: a thing', '', 'o:feat/x', 'main', false))
  })
})

// Reviewers, assignees and labels ride AFTER the creation — the create
// endpoint takes none of them — and what they need already exists host-side
// (#95's write surface). A failure there is a fact to report, never a
// failure to create.
describe('reviewers, assignees and labels', () => {
  const staffed = () => ({
    githubListAssignees: jest.fn().mockResolvedValue({ assignees: ['ana', 'bob'] }),
    githubListRepoLabels: jest.fn().mockResolvedValue({ labels: [{ name: 'bug', color: 'ff0000' }] }),
  })

  test('the picks are applied to the created request, in its repository', async () => {
    const githubRequestReviewers = jest.fn().mockResolvedValue({ success: true })
    const githubUpdateIssue = jest.fn().mockResolvedValue({ success: true })
    const { props } = draw({}, { ...staffed(), githubRequestReviewers, githubUpdateIssue })
    await waitFor(() => expect(screen.getByDisplayValue('feat: a thing')).toBeInTheDocument())
    // the three fields wait behind the fold
    expect(screen.queryByText('Add reviewers…')).not.toBeInTheDocument()
    await userEvent.click(screen.getByText('More options'))
    await userEvent.click(screen.getByText('Add reviewers…'))
    await userEvent.click(await screen.findByText('ana'))
    await userEvent.click(screen.getByText('Add labels…'))
    await userEvent.click(await screen.findByText('bug'))
    await userEvent.click(screen.getByText('Create Pull Request'))
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith(7))
    expect(githubRequestReviewers).toHaveBeenCalledWith('o', 'r', 7, ['ana'])
    expect(githubUpdateIssue).toHaveBeenCalledWith('o', 'r', 7, { labels: ['bug'] })
  })

  test('a refusal after creation is reported, and the creation stands', async () => {
    const githubRequestReviewers = jest.fn().mockResolvedValue({ error: 'Reviews may only be requested from collaborators' })
    const { props } = draw({}, { ...staffed(), githubRequestReviewers, githubUpdateIssue: jest.fn() })
    await waitFor(() => expect(screen.getByDisplayValue('feat: a thing')).toBeInTheDocument())
    await userEvent.click(screen.getByText('More options'))
    await userEvent.click(screen.getByText('Add reviewers…'))
    await userEvent.click(await screen.findByText('ana'))
    await userEvent.click(screen.getByText('Create Pull Request'))
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith(7))
    expect(props.showToast).toHaveBeenCalledWith(expect.stringContaining('collaborators'), 'err')
  })
})

// The picker filters as you type — a repository's labels outgrow scanning —
// and a name that matches nothing can be MADE, right away, in the target
// repository, which is what the row offering it says.
describe('the label picker', () => {
  const opened = async (api: Record<string, any>) => {
    const drawn = draw({}, {
      githubListRepoLabels: jest.fn().mockResolvedValue({ labels: [
        { name: 'bug', color: 'ff0000' }, { name: 'build', color: '00ff00' }, { name: 'docs', color: '0000ff' },
      ] }),
      ...api,
    })
    await waitFor(() => expect(screen.getByDisplayValue('feat: a thing')).toBeInTheDocument())
    await userEvent.click(screen.getByText('More options'))
    await userEvent.click(screen.getByText('Add labels…'))
    return drawn
  }

  test('typing narrows the list', async () => {
    await opened({})
    await userEvent.type(screen.getByPlaceholderText('Type to filter…'), 'bu')
    expect(screen.getByText('bug')).toBeInTheDocument()
    expect(screen.getByText('build')).toBeInTheDocument()
    expect(screen.queryByText('docs')).not.toBeInTheDocument()
  })

  test('a name that matches nothing is offered as a creation, and created', async () => {
    const githubCreateLabel = jest.fn().mockResolvedValue({ label: { name: 'urgent', color: '0052cc' } })
    await opened({ githubCreateLabel })
    await userEvent.type(screen.getByPlaceholderText('Type to filter…'), 'urgent')
    await userEvent.click(screen.getByText('Create label “urgent”'))
    await waitFor(() => expect(githubCreateLabel).toHaveBeenCalledWith('o', 'r', 'urgent', expect.stringMatching(/^[0-9a-f]{6}$/)))
    // chosen on arrival: the chip is in the field
    expect(await screen.findByText('urgent')).toBeInTheDocument()
  })

  test('an existing name offers no creation', async () => {
    await opened({})
    await userEvent.type(screen.getByPlaceholderText('Type to filter…'), 'bug')
    expect(screen.queryByText(/Create label/)).not.toBeInTheDocument()
  })

  test('a refused creation is named and chooses nothing', async () => {
    const githubCreateLabel = jest.fn().mockResolvedValue({ error: 'Validation Failed (already_exists)' })
    const { props } = await opened({ githubCreateLabel })
    await userEvent.type(screen.getByPlaceholderText('Type to filter…'), 'urgent')
    await userEvent.click(screen.getByText('Create label “urgent”'))
    await waitFor(() => expect(props.showToast).toHaveBeenCalledWith(expect.stringContaining('already_exists'), 'err'))
    expect(screen.queryByText('urgent')).not.toBeInTheDocument()
  })
})
