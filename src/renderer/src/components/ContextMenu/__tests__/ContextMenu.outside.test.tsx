import { fireEvent, screen } from '@testing-library/react'
import ContextMenu from '../ContextMenu'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// A menu goes away when the user does something else. A press on a control
// that cancels its pointerdown — the splitter under the minimap does — never
// produced the `mousedown` the menu listened for, and the window losing the
// focus (the editor around the VS Code panel) produced nothing at all: the
// minimap's menu stayed up through both.

const ITEMS = [{ label: 'Commits', action: jest.fn() }, { label: 'Hide minimap', action: jest.fn() }]

function open(extra: Record<string, unknown> = {}) {
  installMockGitAPI()
  const onClose = jest.fn()
  renderWithProviders(<ContextMenu x={10} y={10} items={ITEMS as any} onClose={onClose} {...extra} />)
  return onClose
}

test('a press elsewhere closes it, once, pointer and mouse events alike', () => {
  const onClose = open()
  fireEvent.pointerDown(document.body)
  fireEvent.mouseDown(document.body)
  expect(onClose).toHaveBeenCalledTimes(1)
})

test('a press on a control that cancels it, or keeps it to itself, still closes it', () => {
  const splitter = document.createElement('div')
  splitter.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation() })
  document.body.appendChild(splitter)
  const onClose = open()
  fireEvent.pointerDown(splitter)
  expect(onClose).toHaveBeenCalledTimes(1)
  splitter.remove()
})

test('the window losing the focus closes it', () => {
  const onClose = open()
  fireEvent.blur(window)
  expect(onClose).toHaveBeenCalledTimes(1)
})

test('a press inside it, or on the button that toggles it, does not', () => {
  const button = document.createElement('button')
  document.body.appendChild(button)
  const onClose = open({ anchor: button })
  fireEvent.pointerDown(screen.getByText('Commits'))
  fireEvent.pointerDown(button)
  fireEvent.mouseDown(button)
  expect(onClose).not.toHaveBeenCalled()
  button.remove()
})
