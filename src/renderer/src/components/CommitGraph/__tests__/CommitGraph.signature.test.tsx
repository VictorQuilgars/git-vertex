import { screen } from '@testing-library/react'
import CommitGraph from '../CommitGraph'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// #146 — the shield used to mark every signed commit, which on a repository
// that signs is a mark on every row saying the same thing. It survives only
// where something is WRONG: a row is marked when a signature cannot be vouched
// for, and never when everything is normal.

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

describe('the signature badge', () => {
  test.each([
    ['G', 'a good signature'],
    ['U', 'good, of unknown validity'],
    ['N', 'unsigned'],
    [undefined, 'a repository that does not report one'],
  ])('%s — no badge (%s)', (sig) => {
    render(sig as string | undefined)
    expect(badge()).toBeNull()
  })

  // ⚠️ `E` is "cannot be checked", which is a fact about the reader's keyring
  // and not about the commit. Every merge GitHub makes is signed with its own
  // key, which almost nobody imports — marking E put a warning on every merge
  // commit in the graph, 33 of 300 on this repository.
  test('E — no badge: a missing public key is not a bad signature', () => {
    render('E')
    expect(badge()).toBeNull()
  })

  test.each([
    ['B', 'cg-sig--bad'],
    ['X', 'cg-sig--warn'],
    ['Y', 'cg-sig--warn'],
    ['R', 'cg-sig--warn'],
  ])('%s — marked, and toned %s', (sig, cls) => {
    render(sig)
    const el = badge()
    expect(el).toBeTruthy()
    // getAttribute, not className: on an <svg> that is an SVGAnimatedString.
    expect(el!.getAttribute('class')).toContain(cls)
  })

  // Narrowed to the codes that say something about the commit, so a code
  // nobody has seen is silence rather than a guess — the alternative marked
  // every GitHub merge on the strength of one.
  test('an unfamiliar code is not marked', () => {
    render('Z')
    expect(badge()).toBeNull()
  })

  // The row draws less; the data is untouched, because a detail pane or a
  // later feature will want it.
  test('a good signature is still carried on the commit, just not drawn', () => {
    render('G')
    expect(screen.getByText('the tip')).toBeInTheDocument()
    expect(badge()).toBeNull()
  })
})
