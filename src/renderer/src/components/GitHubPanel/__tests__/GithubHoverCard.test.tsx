import { screen } from '@testing-library/react'
import GithubHoverCard from '../GithubHoverCard'
import type { GithubRowItem } from '../GithubRow'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

beforeEach(() => installMockGitAPI({}))

// The card is now THE card — the `#123` reference and the sidebar rows share
// it (#95 §3), and the reference resolves closed and merged things the lists
// never carry. The status cell has to say which, with the reading the old
// tooltip had: merged wins, a closed pull request failed where a closed
// issue completed.

const base: GithubRowItem = {
  kind: 'issue', number: 7, title: 'A thing', url: 'https://x/7',
  body: 'Some body.', author: 'ana',
}
const pos = { left: 10, top: 10, maxHeight: 400 }

const draw = (over: Partial<GithubRowItem>) =>
  renderWithProviders(
    <GithubHoverCard item={{ ...base, ...over }} pos={pos}
      inside={{ current: false }} onClose={() => {}} />
  )

describe('the hover card status cell', () => {
  test('an open item reads Open', () => {
    draw({ state: 'open' })
    expect(screen.getByText('Open')).toHaveClass('ghc-status--open')
  })

  test('a sidebar list item — no state at all — still reads Open', () => {
    draw({})
    expect(screen.getByText('Open')).toHaveClass('ghc-status--open')
  })

  test('a merged pull request reads Merged, whatever its state says', () => {
    draw({ kind: 'pr', state: 'closed', merged: true })
    expect(screen.getByText('Merged')).toHaveClass('ghc-status--merged')
  })

  test('a closed pull request failed; a closed issue completed', () => {
    draw({ kind: 'pr', state: 'closed' })
    expect(screen.getByText('Closed')).toHaveClass('ghc-status--closed-pr')
  })

  test('a closed issue wears the done colour, not the failure one', () => {
    draw({ kind: 'issue', state: 'closed' })
    expect(screen.getByText('Closed')).toHaveClass('ghc-status--closed-issue')
  })

  test('a draft is only a draft while it is open', () => {
    draw({ kind: 'pr', draft: true })
    expect(screen.getByText('Draft')).toHaveClass('ghc-status--draft')
  })
})
