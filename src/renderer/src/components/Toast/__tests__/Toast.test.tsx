import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider, useToast, TOAST_TIMEOUT, TOAST_ACTION_TIMEOUT, TOAST_STACK_MAX } from '../Toast'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The chip that confirms an action — #127. It had no test at all, which is
// how it kept a card's tint, a timer on its errors and a place on top of the
// Commit button. What is held here is what a user can tell apart: does it
// appear, does it say the right thing, does it go when it should, and does it
// stay when it must.

/** A harness that exposes the three calls as buttons to click. */
function Harness() {
  const toast = useToast()
  return (
    <div>
      <button onClick={() => toast.success('Branch created')}>ok</button>
      <button onClick={() => toast.error('Push refused')}>bad</button>
      <button onClick={() => toast.info('Fetching')}>note</button>
      <button onClick={() => toast.success('Committed', { label: 'Undo', onClick: () => {} })}>act</button>
      <button onClick={() => toast.error('Held', undefined, false)}>bad-timed</button>
    </div>
  )
}

function draw() {
  installMockGitAPI()
  return renderWithProviders(<ToastProvider><Harness /></ToastProvider>)
}

/** Let a chip's countdown expire. */
function elapse(ms: number) {
  act(() => { jest.advanceTimersByTime(ms) })
}

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

/** userEvent drives its own clock; hand it the fake one. */
const click = async (name: string) => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
  await user.click(screen.getByText(name))
}

describe('a chip appears, and says which outcome it is', () => {
  test('a success is announced politely, an error interrupts', async () => {
    draw()
    await click('ok')
    const ok = await screen.findByText('Branch created')
    expect(ok.closest('.chip')).toHaveAttribute('role', 'status')

    await click('bad')
    const bad = await screen.findByText('Push refused')
    expect(bad.closest('.chip')).toHaveAttribute('role', 'alert')
  })

  // No aria-live anywhere in the renderer was the finding. The container has
  // to exist before the message lands in it, or nothing is announced.
  test('the stack is a live region that is there before the message', () => {
    const { container } = draw()
    const stack = container.querySelector('.chip-stack')
    expect(stack).toBeInTheDocument()
    expect(stack).toHaveAttribute('aria-live', 'polite')
  })

  test('the type is on the chip, so the icon can carry the colour', async () => {
    draw()
    await click('note')
    expect((await screen.findByText('Fetching')).closest('.chip')).toHaveClass('chip--info')
  })
})

describe('what goes on a timer, and what waits to be read', () => {
  test('a success expires on its own', async () => {
    draw()
    await click('ok')
    expect(await screen.findByText('Branch created')).toBeInTheDocument()
    elapse(TOAST_TIMEOUT + 1)
    await waitFor(() => expect(screen.queryByText('Branch created')).not.toBeInTheDocument())
  })

  // The one that mattered: an error the user has not read must not vanish.
  test('an error stays until it is dismissed', async () => {
    draw()
    await click('bad')
    expect(await screen.findByText('Push refused')).toBeInTheDocument()
    elapse(TOAST_ACTION_TIMEOUT * 10)
    expect(screen.getByText('Push refused')).toBeInTheDocument()
    await click('×')
    await waitFor(() => expect(screen.queryByText('Push refused')).not.toBeInTheDocument())
  })

  test('an explicit sticky:false puts even an error on the timer', async () => {
    draw()
    await click('bad-timed')
    expect(await screen.findByText('Held')).toBeInTheDocument()
    elapse(TOAST_TIMEOUT + 1)
    await waitFor(() => expect(screen.queryByText('Held')).not.toBeInTheDocument())
  })

  test('a chip offering an action is given longer to reach it', async () => {
    draw()
    await click('act')
    expect(await screen.findByText('Committed')).toBeInTheDocument()
    elapse(TOAST_TIMEOUT + 1)
    expect(screen.getByText('Committed')).toBeInTheDocument()
    elapse(TOAST_ACTION_TIMEOUT - TOAST_TIMEOUT + 1)
    await waitFor(() => expect(screen.queryByText('Committed')).not.toBeInTheDocument())
  })

  test('the action fires and takes its chip away', async () => {
    draw()
    await click('act')
    await click('Undo')
    await waitFor(() => expect(screen.queryByText('Committed')).not.toBeInTheDocument())
  })
})

describe('the stack cannot cover the window it reports on', () => {
  test('the same message running twice is one chip and a count', async () => {
    draw()
    await click('ok')
    await click('ok')
    await click('ok')
    expect(await screen.findByText('×3')).toBeInTheDocument()
    expect(screen.getAllByText('Branch created')).toHaveLength(1)
  })

  test('a repeat restarts the countdown rather than inheriting the first deadline', async () => {
    draw()
    await click('ok')
    elapse(TOAST_TIMEOUT - 500)
    await click('ok')
    elapse(600)                      // past the FIRST chip's deadline
    expect(screen.getByText('Branch created')).toBeInTheDocument()
    elapse(TOAST_TIMEOUT)
    await waitFor(() => expect(screen.queryByText('Branch created')).not.toBeInTheDocument())
  })

  test('a chip carrying an action is never collapsed into a count', async () => {
    draw()
    await click('act')
    await click('act')
    expect(screen.getAllByText('Committed')).toHaveLength(2)
    expect(screen.queryByText('×2')).not.toBeInTheDocument()
  })

  test('the stack is capped, and the oldest is the one that goes', async () => {
    const { container } = draw()
    // Five distinct messages, so nothing collapses on the way.
    await click('ok'); await click('bad'); await click('note')
    await click('act'); await click('bad-timed')
    await waitFor(() =>
      expect(container.querySelectorAll('.chip')).toHaveLength(TOAST_STACK_MAX))
    // The first one raised is the one no longer there — even though it is an
    // error, which is the compromise the cap makes.
    expect(screen.queryByText('Branch created')).not.toBeInTheDocument()
    expect(screen.getByText('Held')).toBeInTheDocument()
  })
})

// The rule from Toast.tsx, held where it was broken: the staging actions.
// Every one of these mutates — the index, or the file on disk — and every one
// of them used to say nothing at all. Discard was the worst: destructive and
// silent.
describe('the rule: a mutating action confirms', () => {
  const chips = () => Array.from(document.querySelectorAll('.chip-msg')).map(n => n.textContent)

  /** The provider, driven the way RightPanel.handle() drives it. */
  function Staging() {
    const toast = useToast()
    const handle = async (fn: () => Promise<any>, say?: string) => {
      const r = await fn()
      if (r?.success === false) { toast.error(r.error); return }
      if (say) toast.success(say)
    }
    return (
      <div>
        <button onClick={() => handle(async () => ({ success: true }), '3 files staged')}>stage</button>
        <button onClick={() => handle(async () => ({ success: true }), '1 file unstaged')}>unstage</button>
        <button onClick={() => handle(async () => ({ success: true }), '2 files discarded')}>discard</button>
        <button onClick={() => handle(async () => ({ success: false, error: 'index.lock exists' }))}>fails</button>
      </div>
    )
  }

  const drawStaging = () => {
    installMockGitAPI()
    return renderWithProviders(<ToastProvider><Staging /></ToastProvider>)
  }

  test('staging, unstaging and discarding each confirm', async () => {
    drawStaging()
    // handle() is async, so each chip is awaited rather than assumed.
    await click('stage')
    expect(await screen.findByText('3 files staged')).toBeInTheDocument()
    await click('unstage')
    expect(await screen.findByText('1 file unstaged')).toBeInTheDocument()
    await click('discard')
    expect(await screen.findByText('2 files discarded')).toBeInTheDocument()
    expect(chips()).toEqual(['3 files staged', '1 file unstaged', '2 files discarded'])
  })

  test('a refusal is reported with git\'s own message, and waits to be read', async () => {
    drawStaging()
    await click('fails')
    const chip = await screen.findByText('index.lock exists')
    expect(chip.closest('.chip')).toHaveClass('chip--error')
    elapse(TOAST_ACTION_TIMEOUT * 10)
    expect(screen.getByText('index.lock exists')).toBeInTheDocument()
  })
})
