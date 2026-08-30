import { screen } from '@testing-library/react'
import CommitGraph from '../CommitGraph'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The shield's short life: it marked every signed commit, #146 narrowed it to
// signatures that could not be vouched for, and the E code ("cannot be
// checked") was excused because a missing public key says nothing about the
// commit. The trouble codes then did the same thing one key-rotation later —
// GitHub's expired signing key put a shield on every merge in the graph, a
// fact about a keyring worn as a wound on the history. Victor's call
// (28/08/2026): the graph draws no signature at all. The data stays on the
// commit, because a detail pane can afford the nuance a 12px glyph cannot.

const commit = (signature?: string) => ({
  hash: 'aaaa111aaaa111aaaa111aaaa111aaaa111aaaa1',
  shortHash: 'aaaa111',
  message: 'the tip',
  author: 'Alice', authorEmail: 'alice@test.local',
  date: '2026-07-30T10:00:00', parents: [], refs: ['HEAD -> main'],
  signature,
})

function render(signature?: string) {
  installMockGitAPI()
  renderWithProviders(
    <CommitGraph
      commits={[commit(signature)] as any}
      selectedHash={null}
      onSelectCommit={jest.fn()}
      searchQuery=""
      currentBranch="main"
      onCheckoutBranch={jest.fn()}
    />
  )
}

const badge = () => document.querySelector('.cg-sig')

describe('the graph draws no signature badge', () => {
  test.each([
    ['G', 'a good signature'],
    ['U', 'good, of unknown validity'],
    ['N', 'unsigned'],
    ['E', 'cannot be checked — a fact about the keyring'],
    ['B', 'a bad signature'],
    ['X', 'an expired signature'],
    ['Y', 'an expired key'],
    ['R', 'a revoked key'],
    ['Z', 'a code nobody has seen'],
    [undefined, 'a repository that does not report one'],
  ])('%s — no badge (%s)', (sig) => {
    render(sig as string | undefined)
    expect(badge()).toBeNull()
  })

  test('the signature is still carried on the commit, just not drawn', () => {
    render('B')
    expect(screen.getByText('the tip')).toBeInTheDocument()
    expect(badge()).toBeNull()
  })
})
