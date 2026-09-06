import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import InteractiveRebase from '../InteractiveRebase'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// Reordering was drag-and-drop only, and the plan said nothing of what it
// would do until git had done it. Two arrows per row, and a line that says
// how many commits go in, how many come out, and whether a force push follows.

const COMMITS = [
  { hash: 'a'.repeat(40), shortHash: 'aaaaaaa', message: 'first' },
  { hash: 'b'.repeat(40), shortHash: 'bbbbbbb', message: 'second' },
  { hash: 'c'.repeat(40), shortHash: 'ccccccc', message: 'third' },
]

function draw(props: Record<string, any> = {}) {
  installMockGitAPI({ getRebaseSequence: jest.fn().mockResolvedValue({ commits: COMMITS }) })
  renderWithProviders(
    <InteractiveRebase embedded baseHash={'0'.repeat(40)} onClose={jest.fn()} onSuccess={jest.fn()} showToast={jest.fn()} {...props} />
  )
}
const order = () => Array.from(document.querySelectorAll('.ir-hash')).map(el => el.textContent)

test('the arrows reorder without a mouse, and the ends have nowhere to go', async () => {
  draw()
  await screen.findByText('third')
  expect(order()).toEqual(['aaaaaaa', 'bbbbbbb', 'ccccccc'])
  expect(screen.getAllByRole('button', { name: 'Move up' })[0]).toBeDisabled()
  expect(screen.getAllByRole('button', { name: 'Move down' })[2]).toBeDisabled()
  await userEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0])
  expect(order()).toEqual(['bbbbbbb', 'aaaaaaa', 'ccccccc'])
  await userEvent.click(screen.getAllByRole('button', { name: 'Move up' })[2])
  expect(order()).toEqual(['bbbbbbb', 'ccccccc', 'aaaaaaa'])
})

test('the summary says what the plan comes to, and warns about commits already published', async () => {
  draw({ unpushedCount: 1 })
  await screen.findByText('third')
  expect(screen.getByRole('status')).toHaveTextContent('Rewrites 3 commits into 3: 0 folded into another, 0 dropped, 0 reworded.')
  expect(screen.getByRole('status')).toHaveTextContent('2 of them are already on the upstream')
  const selects = screen.getAllByRole('combobox')
  await userEvent.selectOptions(selects[1], 'squash')
  await userEvent.selectOptions(selects[2], 'drop')
  expect(screen.getByRole('status')).toHaveTextContent('Rewrites 3 commits into 1: 1 folded into another, 1 dropped, 0 reworded.')
})

test('without an upstream, nothing is said about a force push', async () => {
  draw()
  await screen.findByText('third')
  expect(screen.getByRole('status')).not.toHaveTextContent('upstream')
})
