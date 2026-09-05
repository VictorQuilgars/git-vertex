import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ErrorBoundary from '../ErrorBoundary'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

let explode = true
function Fragile() {
  if (explode) throw new Error('lane index out of range')
  return <div>the view</div>
}

beforeEach(() => { installMockGitAPI(); explode = true })

test('a view that throws says so, and Retry mounts it again', async () => {
  const quiet = jest.spyOn(console, 'error').mockImplementation(() => {})
  try {
    renderWithProviders(<ErrorBoundary><Fragile /></ErrorBoundary>)
    expect(screen.getByRole('alert')).toHaveTextContent('lane index out of range')
    explode = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(screen.getByText('the view')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  } finally { quiet.mockRestore() }
})
