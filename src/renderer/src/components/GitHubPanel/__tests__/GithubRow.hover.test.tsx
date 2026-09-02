import { useState } from 'react'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GithubRow from '../GithubRow'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The card that would not leave. Clicking a row opens the detail, and while
// the detail is open the row's card is off — its hover handlers with it. So
// nothing closed the card the click had opened: it hid, kept its place, and
// came back the moment the detail closed, the pointer long gone. The card
// closes on the click itself now, whenever it is switched off, and on any
// scroll — the section bodies scroll on their own (#176), and a card anchored
// to where a row was would float over a stranger.

const ITEM = {
  kind: 'issue' as const, number: 175, title: 'Clicking another issue', url: 'https://x/175',
  author: 'victor', body: 'The detail seeds its state once.',
}

function Host({ onDetail }: { onDetail: () => void }) {
  const [detail, setDetail] = useState(false)
  return (
    <>
      <button onClick={() => setDetail(d => !d)}>toggle detail</button>
      <GithubRow item={ITEM} hoverCard={!detail} onDetail={() => { setDetail(true); onDetail() }} />
    </>
  )
}

// By class, not by title: once the card is open the title is on screen twice.
const row = () => document.querySelector('.sb-gh-row') as HTMLElement
const card = () => screen.queryByText('The detail seeds its state once.')

describe('the GitHub row hover card — when it leaves', () => {
  beforeEach(() => installMockGitAPI({}))

  test('the click that opens the detail closes the card, and closing the detail does not bring it back', async () => {
    const onDetail = jest.fn()
    renderWithProviders(<Host onDetail={onDetail} />)
    await userEvent.hover(row())
    await waitFor(() => expect(card()).toBeInTheDocument())
    await userEvent.click(row())
    expect(onDetail).toHaveBeenCalled()
    expect(card()).not.toBeInTheDocument()
    // the detail closes; the pointer is elsewhere; the card stays gone
    await userEvent.click(screen.getByText('toggle detail'))
    await new Promise(r => setTimeout(r, 500))
    expect(card()).not.toBeInTheDocument()
  })

  test('switching the card off while it is open closes it for good', async () => {
    renderWithProviders(<Host onDetail={() => {}} />)
    await userEvent.hover(row())
    await waitFor(() => expect(card()).toBeInTheDocument())
    await userEvent.click(screen.getByText('toggle detail'))   // off
    expect(card()).not.toBeInTheDocument()
    await userEvent.click(screen.getByText('toggle detail'))   // on again
    await new Promise(r => setTimeout(r, 500))
    expect(card()).not.toBeInTheDocument()
  })

  test('a scroll anywhere closes it', async () => {
    renderWithProviders(<Host onDetail={() => {}} />)
    await userEvent.hover(row())
    await waitFor(() => expect(card()).toBeInTheDocument())
    fireEvent.scroll(document.body)
    await waitFor(() => expect(card()).not.toBeInTheDocument())
  })
})
