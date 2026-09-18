import { screen, fireEvent, waitFor } from '@testing-library/react'
import FileHistory from '../FileHistory'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// A history tab that can follow the active editor shows the switch; one that
// cannot — the desktop's view tab — shows nothing of the sort.

function draw(follow?: { on: boolean; onToggle: () => void }) {
  installMockGitAPI({
    getFileHistory: jest.fn().mockResolvedValue({ commits: [{ hash: 'abc1234abc1234abc1234abc1234abc1234abc12', shortHash: 'abc1234', message: 'first', author: 'Alice', date: '2026-08-01' }] }),
    getFileDiffAtCommit: jest.fn().mockResolvedValue({ diff: '' }),
    getBlame: jest.fn().mockResolvedValue({ lines: [] }),
  })
  renderWithProviders(<FileHistory file="src/a.ts" follow={follow} />)
}

describe('following the editor', () => {
  test('the switch is offered, off, and asks to be turned on', async () => {
    const onToggle = jest.fn()
    draw({ on: false, onToggle })
    await waitFor(() => expect(screen.getByText('src/a.ts')).toBeInTheDocument())
    const button = screen.getByRole('button', { name: /follow editor/i })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(button)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  test('while following, the switch reads as pressed', async () => {
    draw({ on: true, onToggle: jest.fn() })
    expect(await screen.findByRole('button', { name: /following editor/i })).toHaveAttribute('aria-pressed', 'true')
  })

  test('a tab that cannot follow shows no switch', async () => {
    draw()
    await waitFor(() => expect(screen.getByText('src/a.ts')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /follow/i })).not.toBeInTheDocument()
  })
})
