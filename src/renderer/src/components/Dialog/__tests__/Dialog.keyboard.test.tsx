import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog, PromptDialog } from '../Dialog'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

beforeEach(() => installMockGitAPI())

test('Enter on Cancel never confirms a destructive action', async () => {
  const confirm = jest.fn(), cancel = jest.fn()
  renderWithProviders(<ConfirmDialog message="Delete branch?" danger onConfirm={confirm} onCancel={cancel} />)
  expect(screen.getByRole('dialog', { name: 'Delete branch?' })).toHaveAttribute('aria-modal', 'true')
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  expect(cancel).toHaveBeenCalledTimes(1)
  expect(confirm).not.toHaveBeenCalled()
})

test('an ordinary confirmation opens on Confirm, so Enter still answers yes', async () => {
  const confirm = jest.fn(), cancel = jest.fn()
  renderWithProviders(<ConfirmDialog message="Proceed?" onConfirm={confirm} onCancel={cancel} />)
  expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  expect(confirm).toHaveBeenCalledTimes(1)
  expect(cancel).not.toHaveBeenCalled()
})

test('Tab stays inside the dialog and Enter activates the focused button', async () => {
  const confirm = jest.fn()
  renderWithProviders(<ConfirmDialog message="Delete?" danger onConfirm={confirm} onCancel={jest.fn()} />)
  await userEvent.tab({ shift: true })
  expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus()
  await userEvent.tab()
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  await userEvent.tab()
  await userEvent.keyboard('{Enter}')
  expect(confirm).toHaveBeenCalledTimes(1)
})

test('Escape cancels once and unmount restores the trigger focus', async () => {
  const trigger = document.createElement('button')
  document.body.appendChild(trigger)
  trigger.focus()
  const cancel = jest.fn()
  const view = renderWithProviders(<PromptDialog message="Branch name" onConfirm={jest.fn()} onCancel={cancel} />)
  expect(screen.getByRole('textbox', { name: 'Branch name' })).toHaveFocus()
  await userEvent.keyboard('{Escape}')
  expect(cancel).toHaveBeenCalledTimes(1)
  view.unmount()
  expect(trigger).toHaveFocus()
  trigger.remove()
})
