import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ContextMenu from '../ContextMenu'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// A menu of eighteen verbs that only the mouse could walk. The keyboard model
// is the usual one: arrows over the enabled rows, Right into a submenu, Left
// back out, Enter to act, Escape to leave — and the focus returned to where
// it was, so the graph's own arrow keys are not what an open menu answers.

const actions = { checkout: jest.fn(), soft: jest.fn(), mixed: jest.fn(), copy: jest.fn() }
const ITEMS = [
  { label: 'Checkout', action: actions.checkout },
  { separator: true },
  { label: 'Reset', submenu: [{ label: 'Soft', action: actions.soft }, { label: 'Mixed', action: actions.mixed }] },
  { label: 'Disabled', action: jest.fn(), disabled: true },
  { label: 'Copy hash', action: actions.copy },
]

describe('ContextMenu — from the keyboard', () => {
  beforeEach(() => { installMockGitAPI(); jest.clearAllMocks() })

  test('arrows walk the enabled rows, wrap, and skip a disabled one', async () => {
    renderWithProviders(<ContextMenu x={10} y={10} items={ITEMS as any} onClose={jest.fn()} />)
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Checkout' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Copy hash' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Checkout' })).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'Copy hash' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(actions.copy).toHaveBeenCalledTimes(1)
  })

  test('Right opens a submenu on its first entry, Left comes back, Enter acts and closes', async () => {
    const onClose = jest.fn()
    renderWithProviders(<ContextMenu x={10} y={10} items={ITEMS as any} onClose={onClose} />)
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{ArrowDown}')
    const reset = screen.getByRole('menuitem', { name: /^Reset/ })
    expect(reset).toHaveFocus()
    expect(reset).toHaveAttribute('aria-haspopup', 'menu')
    await userEvent.keyboard('{ArrowRight}')
    expect(await screen.findByRole('menuitem', { name: 'Soft' })).toHaveFocus()
    expect(reset).toHaveAttribute('aria-expanded', 'true')
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.queryByRole('menuitem', { name: 'Soft' })).not.toBeInTheDocument()
    expect(reset).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    await screen.findByRole('menuitem', { name: 'Soft' })
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Mixed' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(actions.mixed).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalled()
  })

  test('the menu takes the focus while it is up and gives it back on close', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const view = renderWithProviders(<ContextMenu x={10} y={10} items={ITEMS as any} onClose={jest.fn()} />)
    expect(screen.getByRole('menu')).toHaveFocus()
    view.unmount()
    expect(trigger).toHaveFocus()
    trigger.remove()
  })
})
