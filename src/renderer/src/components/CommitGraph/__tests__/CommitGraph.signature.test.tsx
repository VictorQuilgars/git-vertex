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

  test.each([
    ['B', 'cg-sig--bad'],
    ['E', 'cg-sig--bad'],
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

  test('an unfamiliar code is still marked rather than trusted', () => {
    render('Z')
    expect(badge()).toBeTruthy()
  })

  // The row draws less; the data is untouched, because a detail pane or a
  // later feature will want it.
  test('a good signature is still carried on the commit, just not drawn', () => {
    render('G')
    expect(screen.getByText('the tip')).toBeInTheDocument()
    expect(badge()).toBeNull()
  })
})
