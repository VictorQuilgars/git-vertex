import { screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import MarkdownField from '../MarkdownField'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

beforeEach(() => { installMockGitAPI() })

// #337 — the comment box and the description editors can show what they will
// read as once posted. The contract: Preview renders the draft with the same
// renderer as the posted body, it HIDES the textarea rather than dropping it
// (the caret and a caller's ref survive), and an emptied field is back on
// Write.

function Harness({ initial = '', openLink }: { initial?: string; openLink?: (u: string) => void }) {
  const [v, setV] = useState(initial)
  return (
    <>
      <MarkdownField value={v} openLink={openLink}>
        <textarea aria-label="draft" value={v} onChange={e => setV(e.target.value)} />
      </MarkdownField>
      <button onClick={() => setV('')}>clear</button>
    </>
  )
}

test('Write is where it opens, and the textarea is the caller’s own', () => {
  renderWithProviders(<Harness initial="hello" />)
  expect(screen.getByRole('tab', { name: 'Write' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByLabelText('draft')).toBeVisible()
  expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument()
})

test('Preview renders the draft as markdown and only hides the field', () => {
  const openLink = jest.fn()
  renderWithProviders(<Harness initial={'## Plan\n\n- [x] **done**\n\nsee [the doc](https://x/doc)'} openLink={openLink} />)
  const field = screen.getByLabelText('draft')
  fireEvent.click(screen.getByRole('tab', { name: 'Preview' }))

  const panel = screen.getByRole('tabpanel')
  expect(panel.querySelector('.mdl-h')?.textContent).toBe('Plan')
  expect(panel.querySelector('strong')?.textContent).toBe('done')
  expect(panel.querySelector('input[type="checkbox"]')).toBeChecked()
  // Still in the document — the same node — only hidden.
  expect(screen.getByLabelText('draft')).toBe(field)
  expect(field).not.toBeVisible()

  fireEvent.click(screen.getByText('the doc'))
  expect(openLink).toHaveBeenCalledWith('https://x/doc')

  fireEvent.click(screen.getByRole('tab', { name: 'Write' }))
  expect(field).toBeVisible()
})

test('an empty draft previews as nothing, said so', () => {
  renderWithProviders(<Harness initial="   " />)
  fireEvent.click(screen.getByRole('tab', { name: 'Preview' }))
  expect(screen.getByText('Nothing to preview')).toBeInTheDocument()
})

test('a field emptied while previewed goes back to Write', () => {
  renderWithProviders(<Harness initial="posted" />)
  fireEvent.click(screen.getByRole('tab', { name: 'Preview' }))
  fireEvent.click(screen.getByText('clear'))
  expect(screen.getByRole('tab', { name: 'Write' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByLabelText('draft')).toBeVisible()
})
