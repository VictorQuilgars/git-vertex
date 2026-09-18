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
