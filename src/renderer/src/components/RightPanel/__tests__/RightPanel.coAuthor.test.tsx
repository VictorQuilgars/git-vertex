import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RightPanel from '../RightPanel'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The panel already wrote a Signed-off-by trailer and already READ co-authors to
// show their avatars. This is the half that was missing: writing one.
//
// git is particular about trailers — the block goes at the end, separated from
// the message by one blank line, one per line after that. Getting the separator
// wrong produces a message that looks right and that git does not parse.

const LOG = {
  commits: [
    { hash: 'a', author: 'Victor Quilgars', authorEmail: 'v@example.com' },
    { hash: 'b', author: 'Ada Lovelace', authorEmail: 'ada@example.com' },
    // Same person twice, and a commit with no email at all.
    { hash: 'c', author: 'Ada Lovelace', authorEmail: 'ADA@example.com' },
    { hash: 'd', author: 'Ghost', authorEmail: '' },
  ],
}

function render() {
  installMockGitAPI({
    getWorkingChanges: jest.fn().mockResolvedValue({
      staged: [{ path: 'src/a.ts', status: 'M' }], unstaged: [], untracked: [],
    }),
    getLastCommitMessage: jest.fn().mockResolvedValue({ message: '' }),
    getMergeMessage: jest.fn().mockResolvedValue({ message: '' }),
    getCommitFiles: jest.fn().mockResolvedValue({ files: [] }),
    getLog: jest.fn().mockResolvedValue(LOG),
  })
  return renderWithProviders(
    <RightPanel
      selectedCommit={{ hash: '__WIP__' } as any}
      onCommitSuccess={() => {}}
      showToast={() => {}}
      onSelectCommit={() => {}}
      currentBranch="main"
      embedded
    />
  )
}

/** Render and open the commit options, which is where the button lives. */
async function setup() {
  render()
  await screen.findByText('src/a.ts')
  await userEvent.click(screen.getByText('Commit options'))
  return screen.getByPlaceholderText(/commit message/i) as HTMLTextAreaElement
}

/** Open the menu (it closes on pick) and choose someone. */
async function pick(who: string) {
  await userEvent.click(await screen.findByText('Add Co-author'))
  await userEvent.click(await screen.findByText(who))
}

describe('Commit message — add a co-author', () => {
  test('offers the people who have committed here, once each', async () => {
    await setup()
    await userEvent.click(await screen.findByText('Add Co-author'))
    expect(await screen.findByText('Victor Quilgars <v@example.com>')).toBeInTheDocument()
    // Deduplicated case-insensitively: one Ada, not two.
    expect(screen.getAllByText(/Ada Lovelace/)).toHaveLength(1)
    // A commit with no email cannot become a trailer, so it is not offered.
    expect(screen.queryByText(/Ghost/)).not.toBeInTheDocument()
  })

  test('writes the trailer git expects, after a blank line', async () => {
    const box = await setup()
    await userEvent.type(box, 'feat: something')
    await pick('Ada Lovelace <ada@example.com>')

    await waitFor(() => expect(box.value)
      .toBe('feat: something\n\nCo-authored-by: Ada Lovelace <ada@example.com>\n'))
  })

  // A second trailer joins the existing block instead of starting a new one —
  // a blank line between them ends the block and git stops reading.
  test('a second co-author joins the same block', async () => {
    const box = await setup()
    await userEvent.type(box, 'feat: something')

    await pick('Ada Lovelace <ada@example.com>')
    await pick('Victor Quilgars <v@example.com>')

    await waitFor(() => expect(box.value).toBe(
      'feat: something\n\n'
      + 'Co-authored-by: Ada Lovelace <ada@example.com>\n'
      + 'Co-authored-by: Victor Quilgars <v@example.com>\n'))
  })

  test('the same person twice adds nothing', async () => {
    const box = await setup()
    await userEvent.type(box, 'feat: something')

    await pick('Ada Lovelace <ada@example.com>')
    await pick('Ada Lovelace <ada@example.com>')

    await waitFor(() => expect(box.value.match(/Co-authored-by/g)).toHaveLength(1))
  })
})
