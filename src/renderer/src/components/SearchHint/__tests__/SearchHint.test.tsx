import { useState } from 'react'
import { fireEvent, screen } from '@testing-library/react'
import SearchHint, { useSearchHint } from '../SearchHint'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

beforeEach(() => { installMockGitAPI() })

// Under the search field while it has the focus: the operators in force,
// removable one by one, and the ones there are, a click away.

function Field({ initial = '' }: { initial?: string }) {
  const [q, setQ] = useState(initial)
  const hint = useSearchHint()
  return (
    <div {...hint.boxProps}>
      <input aria-label="search" value={q} onChange={e => setQ(e.target.value)} />
      <SearchHint open={hint.open} query={q} onChange={setQ} />
      <button>elsewhere</button>
    </div>
  )
}
const input = () => screen.getByLabelText('search') as HTMLInputElement

test('it opens with the focus, lists the four operators, and goes when the focus leaves the box', () => {
  renderWithProviders(<><Field /><button>outside</button></>)
  expect(document.querySelector('.shint')).toBeNull()
  fireEvent.focus(input())
  expect(Array.from(document.querySelectorAll('.shint-op')).map(o => o.textContent)).toEqual(['author:', 'file:', 'after:', 'before:'])
  // Focus moving INSIDE the box keeps it open; leaving the box closes it.
  fireEvent.blur(input(), { relatedTarget: screen.getByText('elsewhere') })
  expect(document.querySelector('.shint')).not.toBeNull()
  fireEvent.blur(input(), { relatedTarget: screen.getByText('outside') })
  expect(document.querySelector('.shint')).toBeNull()
})

test('a click on an operator writes it at the end of the query, and does not take the focus', () => {
  renderWithProviders(<Field initial="cache" />)
  fireEvent.focus(input())
  const row = screen.getByText('file:').closest('button')!
  // The press is cancelled: the field keeps the caret.
  expect(fireEvent.mouseDown(row)).toBe(false)
  fireEvent.click(row)
  expect(input().value).toBe('cache file:')
})

test('the operators in force are chips, each removable on its own', () => {
  renderWithProviders(<Field initial={'author:"Ana Maria" file:src after:2w cache'} />)
  fireEvent.focus(input())
  expect(Array.from(document.querySelectorAll('.shint-chip')).map(c => c.textContent)).toEqual(['author:Ana Maria×', 'file:src×', 'after:2w×'])
  fireEvent.click(screen.getByLabelText('Remove file:src'))
  expect(input().value).toBe('author:"Ana Maria" after:2w cache')
  fireEvent.click(screen.getByLabelText('Remove author:Ana Maria'))
  expect(input().value).toBe('after:2w cache')
})

test('a date that cannot be read is shown as such, with what would be', () => {
  renderWithProviders(<Field initial="after:someday" />)
  fireEvent.focus(input())
  const chip = document.querySelector('.shint-chip--unread') as HTMLElement
  expect(chip.title).toContain('is not a date')
})

test('Escape puts it away and keeps the key from the graph', () => {
  const onWindow = jest.fn()
  window.addEventListener('keydown', onWindow)
  renderWithProviders(<Field />)
  fireEvent.focus(input())
  fireEvent.keyDown(input(), { key: 'Escape' })
  expect(document.querySelector('.shint')).toBeNull()
  expect(onWindow).not.toHaveBeenCalled()
  window.removeEventListener('keydown', onWindow)
})

// ── Plain language, where the field is ──────────────────────────────────────
// The panel opens on the very first focus, before anything is typed: whatever
// it shows first is what the field is taken to be for. It used to show
// operators alone, and the sentence one could have typed instead was behind a
// button at the far right of the field.

function AskField({ initial = '', onAsk, asking = false, answered = false }: {
  initial?: string; onAsk?: () => void; asking?: boolean; answered?: boolean
}) {
  const [q, setQ] = useState(initial)
  const hint = useSearchHint()
  return (
    <div {...hint.boxProps}>
      <input aria-label="search" value={q} onChange={e => setQ(e.target.value)} />
      <SearchHint open={hint.open} query={q} onChange={setQ} onAsk={onAsk} asking={asking} answered={answered} />
    </div>
  )
}

test('the question in words comes first, and says what pressing Enter would ask', () => {
  const onAsk = jest.fn()
  renderWithProviders(<AskField initial="author:ana the commits that broke the build" onAsk={onAsk} />)
  fireEvent.focus(input())
  // First, before the operators — the panel reads as "ask, or narrow".
  const heads = Array.from(document.querySelectorAll('.shint-head')).map(h => h.textContent)
  expect(heads).toEqual(['Ask in plain language', 'Narrow with an operator'])
  // The operators are not part of the question, and the row shows the words.
  const ask = document.querySelector('.shint-ask') as HTMLButtonElement
  expect(ask).toHaveTextContent('Ask the model for "the commits that broke the build"')
  expect(ask.querySelector('.shint-key')).toHaveTextContent('↵')
  fireEvent.click(ask)
  expect(onAsk).toHaveBeenCalled()
})

test('with nothing but operators there is nothing to ask, and the row says what to type', () => {
  renderWithProviders(<AskField initial="author:ana" onAsk={jest.fn()} />)
  fireEvent.focus(input())
  const ask = document.querySelector('.shint-ask') as HTMLButtonElement
  expect(ask.disabled).toBe(true)
  expect(ask).toHaveTextContent('Describe the commits you are after')
  expect(document.body.textContent).toContain('the commits that touch the graph CSS')
})

test('while the model is being asked the row says so and cannot be pressed again', () => {
  renderWithProviders(<AskField initial="what broke the build" onAsk={jest.fn()} asking />)
  fireEvent.focus(input())
  const ask = document.querySelector('.shint-ask') as HTMLButtonElement
  expect(ask).toHaveTextContent('Asking the model…')
  expect(ask.disabled).toBe(true)
  expect(ask.querySelector('.shint-key')).toBeNull()
})

test('once it has answered, the row offers to ask again — and the operators are still there to go back to', () => {
  renderWithProviders(<AskField initial="what broke the build" onAsk={jest.fn()} answered />)
  fireEvent.focus(input())
  expect(document.querySelector('.shint-ask')).toHaveTextContent('Ask the model again')
  // A click on an operator edits the query, which is what leaves the answer.
  fireEvent.click(screen.getByText('after:').closest('button')!)
  expect(input().value).toBe('what broke the build after:')
})

test('a host that cannot ask a model draws no such row — the VS Code panel', () => {
  renderWithProviders(<AskField initial="cache" />)
  fireEvent.focus(input())
  expect(document.querySelector('.shint-ask')).toBeNull()
  expect(Array.from(document.querySelectorAll('.shint-head')).map(h => h.textContent))
    .toEqual(['Narrow with an operator'])
})

test('a panel that grows past the window edge hangs from the field, measured as it grows', () => {
  // jsdom lays nothing out, so the panel's width is a value this test moves:
  // narrow when it opens on an empty field, at its cap once a sentence is in
  // it. Measuring only on the way up fitted the first and never saw the second.
  let panelWidth = 300
  const width = jest.spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
    .mockImplementation(function (this: HTMLElement) { return this.classList.contains('shint') ? panelWidth : 0 })
  const innerWidth = window.innerWidth
  Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true })
  try {
    renderWithProviders(<AskField onAsk={jest.fn()} />)
    fireEvent.focus(input())
    expect(document.querySelector('.shint')).not.toHaveClass('shint--end')
    panelWidth = 420
    fireEvent.change(input(), { target: { value: 'the commits that touch the graph CSS' } })
    expect(document.querySelector('.shint')).toHaveClass('shint--end')
  } finally {
    width.mockRestore()
    Object.defineProperty(window, 'innerWidth', { value: innerWidth, configurable: true })
  }
})
