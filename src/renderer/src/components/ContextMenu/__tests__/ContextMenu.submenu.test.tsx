import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ContextMenu from '../ContextMenu'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// Reaching a submenu entry — the three Reset modes, the Delete variants — used
// to close it on the way there. Twice: once because a sibling row of the parent
// menu closed it instantly, and once because `row()` renders BOTH menus, so a
// submenu entry took the "close the open submenu" branch and closed itself.
// Neither is visible from the outside, and neither had a test.

const ITEMS = [
  { label: 'Checkout', action: jest.fn() },
  {
    label: 'Reset',
    submenu: [
      { label: 'Soft', action: jest.fn() },
      { label: 'Mixed', action: jest.fn() },
      { label: 'Hard', action: jest.fn() },
    ],
  },
  { label: 'Copy hash', action: jest.fn() },
]

/** Hover the parent row and let the open delay elapse. */
async function openReset(user: ReturnType<typeof userEvent.setup>) {
  await user.hover(screen.getByText('Reset'))
  await act(async () => { jest.advanceTimersByTime(250) })
  expect(await screen.findByText('Hard')).toBeInTheDocument()
}

describe('ContextMenu — submenus', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  const setup = () => {
    installMockGitAPI()
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    renderWithProviders(<ContextMenu x={10} y={10} items={ITEMS as any} onClose={() => {}} />)
    return user
  }

  test('hovering an entry inside the submenu keeps it open', async () => {
    const user = setup()
    await openReset(user)

    await user.hover(screen.getByText('Mixed'))
    // Well past the grace period: the submenu must not close itself under the
    // cursor that is resting on it.
    await act(async () => { jest.advanceTimersByTime(1000) })

    expect(screen.getByText('Mixed')).toBeInTheDocument()
    expect(screen.getByText('Hard')).toBeInTheDocument()
  })

  test('an entry of the submenu can actually be clicked', async () => {
    const user = setup()
    await openReset(user)

    await user.hover(screen.getByText('Hard'))
    await act(async () => { jest.advanceTimersByTime(400) })
    await user.click(screen.getByText('Hard'))

    expect(ITEMS[1].submenu![2].action).toHaveBeenCalled()
  })

  // Reaching the second or third entry means moving right AND down, which
  // clips the parent row below on the way. Closing on the spot made those
  // entries unreachable.
  test('brushing past a sibling row on the way in does not close it', async () => {
    const user = setup()
    await openReset(user)

    await user.hover(screen.getByText('Copy hash'))
    await act(async () => { jest.advanceTimersByTime(80) })   // just passing through
    await user.hover(screen.getByText('Hard'))
    await act(async () => { jest.advanceTimersByTime(1000) })

    expect(screen.getByText('Hard')).toBeInTheDocument()
  })

  test('resting on a sibling row does close it', async () => {
    const user = setup()
    await openReset(user)

    await user.hover(screen.getByText('Copy hash'))
    await act(async () => { jest.advanceTimersByTime(400) })

    expect(screen.queryByText('Hard')).not.toBeInTheDocument()
  })
})
