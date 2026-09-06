import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CompareView from '../CompareView'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// Comparing two branches asks a question, and this view used to ask two at
// once: the commit lists said "what did feature do since they parted"
// (`git log A..B`), while the diff below them said "how do the two trees
// differ" (`git diff A..B`) — which reports every file main gained since the
// split as a deletion, and so claims a branch removed files it never touched.
//
// The axis is now explicit, defaults to the one the lists already answer, and
// the working tree is a target like any other.

const BRANCHES = { branches: [{ name: 'main', current: true }, { name: 'feature', current: false }] }

function render(props: Record<string, any> = {}) {
  const api = installMockGitAPI({
    getBranches: jest.fn().mockResolvedValue(BRANCHES),
    getTags: jest.fn().mockResolvedValue({ tags: [{ name: 'v1.0.0' }] }),
    getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
    compareBranches: jest.fn().mockResolvedValue({ ahead: [], behind: [] }),
    diffBetweenCommits: jest.fn().mockResolvedValue({ diff: '' }),
    filesBetweenCommits: jest.fn().mockResolvedValue({ files: [] }),
    getMergeBase: jest.fn().mockResolvedValue({ base: 'abc1234def' }),
    ...props,
  })
  renderWithProviders(<CompareView initialA="main" initialB="feature" repoKey="/repo" />)
  return api
}

afterEach(() => localStorage.clear())

describe('CompareView — which question it asks', () => {
  test('it asks for what the target did since they parted, by default', async () => {
    const api = render()
    await waitFor(() => expect(api.diffBetweenCommits).toHaveBeenCalled())

    expect(api.diffBetweenCommits).toHaveBeenCalledWith('main', 'feature', 'diverged')
    expect(api.filesBetweenCommits).toHaveBeenCalledWith('main', 'feature', 'diverged')
  })

  test('and names the commit it is measuring from', async () => {
    render()
    expect(await screen.findByText('abc1234')).toBeInTheDocument()
  })

  test('the other axis is one click, and re-asks', async () => {
    const api = render()
    await waitFor(() => expect(api.diffBetweenCommits).toHaveBeenCalled())

    await userEvent.click(screen.getByRole('button', { name: /end to end/i }))

    await waitFor(() =>
      expect(api.diffBetweenCommits).toHaveBeenLastCalledWith('main', 'feature', 'endpoints'))
  })
})

describe('CompareView — the working tree as a target', () => {
  test('it compares against uncommitted work, and asks for no commit list', async () => {
    const api = render()
    await waitFor(() => expect(api.diffBetweenCommits).toHaveBeenCalled())
    ;(api.compareBranches as jest.Mock).mockClear()

    await userEvent.selectOptions(screen.getAllByRole('combobox')[1], [':working'])

    // null, not a ref: `git diff <ref>` with nothing on the other side.
    await waitFor(() => expect(api.diffBetweenCommits).toHaveBeenLastCalledWith('main', null, 'diverged'))
    // The working tree has no commits of its own to be ahead or behind by.
    expect(api.compareBranches).not.toHaveBeenCalled()
  })
})

describe('CompareView — the comparisons it remembers', () => {
  test('a second comparison brings up the register, and restores from it', async () => {
    const api = render()
    await waitFor(() => expect(api.diffBetweenCommits).toHaveBeenCalled())

    // A different pair: main against the tag. The selectors fill from their own
    // request, so the option has to be there before it can be chosen.
    await screen.findAllByRole('option', { name: 'v1.0.0' })
    await userEvent.selectOptions(screen.getAllByRole('combobox')[1], ['v1.0.0'])
    await waitFor(() => expect(api.diffBetweenCommits).toHaveBeenLastCalledWith('main', 'v1.0.0', 'diverged'))

    const chip = await screen.findByRole('button', { name: /main … feature/ })
    await userEvent.click(chip)

    await waitFor(() => expect(api.diffBetweenCommits).toHaveBeenLastCalledWith('main', 'feature', 'diverged'))
  })

  test('and clearing empties it', async () => {
    const api = render()
    await waitFor(() => expect(api.diffBetweenCommits).toHaveBeenCalled())
    await screen.findAllByRole('option', { name: 'v1.0.0' })
    await userEvent.selectOptions(screen.getAllByRole('combobox')[1], ['v1.0.0'])
    await screen.findByRole('button', { name: /main … feature/ })

    await userEvent.click(screen.getByRole('button', { name: /^clear$/i }))

    expect(screen.queryByRole('button', { name: /main … feature/ })).not.toBeInTheDocument()
  })
})

test('a commit hash remains visible in the selector and the host receives comparison edits', async () => {
  const hash = 'abcdef0123456789abcdef0123456789abcdef01'
  installMockGitAPI({
    getBranches: jest.fn().mockResolvedValue(BRANCHES),
    getTags: jest.fn().mockResolvedValue({ tags: [] }),
    getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
    compareBranches: jest.fn().mockResolvedValue({ ahead: [], behind: [] }),
    diffBetweenCommits: jest.fn().mockResolvedValue({ diff: '' }),
    filesBetweenCommits: jest.fn().mockResolvedValue({ files: [] }),
    getMergeBase: jest.fn().mockResolvedValue({ base: null }),
  })
  const change = jest.fn(), title = jest.fn()
  renderWithProviders(<CompareView initialA={hash} initialB={null} onComparisonChange={change} onTitleChange={title} />)
  expect(screen.getAllByRole('combobox')[0]).toHaveValue(hash)
  expect(screen.getByRole('option', { name: 'abcdef0' })).toBeInTheDocument()
  await waitFor(() => expect(change).toHaveBeenLastCalledWith(hash, null, 'diverged'))
  expect(title).toHaveBeenLastCalledWith('abcdef0 … Working tree')
  await screen.findAllByRole('option', { name: 'feature' })
  await userEvent.selectOptions(screen.getAllByRole('combobox')[1], 'feature')
  await userEvent.click(screen.getByRole('button', { name: /end to end/i }))
  await waitFor(() => expect(change).toHaveBeenLastCalledWith(hash, 'feature', 'endpoints'))
})

test('a comparison git refuses says so, and Retry asks again', async () => {
  const api = render({
    diffBetweenCommits: jest.fn()
      .mockResolvedValueOnce({ diff: '', error: 'fatal: bad revision' })
      .mockResolvedValue({ diff: '' }),
  })
  expect(await screen.findByRole('alert')).toHaveTextContent('fatal: bad revision')
  await userEvent.click(screen.getByRole('button', { name: /retry/i }))
  await waitFor(() => expect(api.diffBetweenCommits).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
})
