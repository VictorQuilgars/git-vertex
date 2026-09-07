import { act, screen } from '@testing-library/react'
import { Section, revealSection } from '../Section'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// A row in another pane leads to the list where the action is (#189): the
// staging pane's "Apply a stash" opens the stash section rather than doing
// nothing. The section owns whether it is open, so the caller names it and the
// section listens for its own name.

beforeAll(() => { Element.prototype.scrollIntoView = jest.fn() })
beforeEach(() => { installMockGitAPI() })

function draw(id: string) {
  return renderWithProviders(
    <Section id={id} title={id.toUpperCase()} defaultOpen={false}>
      <div>the rows</div>
    </Section>
  )
}

test('revealing a folded section opens it and brings it into view', () => {
  draw('stash')
  expect(screen.queryByText('the rows')).not.toBeInTheDocument()
  act(() => revealSection('stash'))
  expect(screen.getByText('the rows')).toBeInTheDocument()
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
})

test('a section already open is still scrolled to — that is the point', () => {
  const scroll = Element.prototype.scrollIntoView as jest.Mock
  renderWithProviders(<Section id="local" title="LOCAL" defaultOpen><div>the rows</div></Section>)
  scroll.mockClear()
  act(() => revealSection('local'))
  expect(screen.getByText('the rows')).toBeInTheDocument()
  expect(scroll).toHaveBeenCalled()
})

test('a name no section answers to is not an error', () => {
  draw('stash')
  expect(() => act(() => revealSection('nothing-here'))).not.toThrow()
})

test('an unmounted section stops listening', () => {
  const { unmount } = draw('worktrees')
  unmount()
  expect(() => act(() => revealSection('worktrees'))).not.toThrow()
})
