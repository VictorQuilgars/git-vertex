import { screen, waitFor } from '@testing-library/react'
import InitModal from '../InitModal'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

describe('InitModal — default branch name (v1.20.0)', () => {
  test('falls back to "main" when no defaultBranchName setting is configured', async () => {
    installMockGitAPI()
    renderWithProviders(<InitModal onClose={() => {}} onCreated={() => {}} showToast={() => {}} />)
    await waitFor(() => expect(screen.getByDisplayValue('main')).toBeInTheDocument())
  })

  test('pre-fills the branch field from the defaultBranchName setting', async () => {
    installMockGitAPI({ settingsGetAll: jest.fn().mockResolvedValue({ defaultBranchName: 'develop' }) })
    renderWithProviders(<InitModal onClose={() => {}} onCreated={() => {}} showToast={() => {}} />)
    await waitFor(() => expect(screen.getByDisplayValue('develop')).toBeInTheDocument())
  })
})
