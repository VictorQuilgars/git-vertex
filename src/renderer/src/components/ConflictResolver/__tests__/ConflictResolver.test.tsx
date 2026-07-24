import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConflictResolver from '../ConflictResolver'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

const CONFLICTED_FILE = `line one
<<<<<<< HEAD
our version
=======
their version
>>>>>>> feature
line two
`

function renderResolver(overrides: Record<string, any> = {}) {
  const api = installMockGitAPI({
    getFileContent: jest.fn().mockResolvedValue({ content: CONFLICTED_FILE }),
    getConflictVersions: jest.fn().mockResolvedValue({ base: '', ours: 'our version', theirs: 'their version' }),
    getConflictSides: jest.fn().mockResolvedValue({ ours: 'main · abc123 — subject', theirs: 'feature · def456 — subject' }),
    ...overrides,
  })
  renderWithProviders(
    <ConflictResolver file="src/app.ts" onFinish={() => {}} onAbort={() => {}} showToast={() => {}} />
  )
  return api
}

describe('ConflictResolver — external merge tool (v1.20.0)', () => {
  test('the external merge tool button is hidden when no tool is configured', async () => {
    renderResolver() // no externalMergeTool setting → settingsGetAll() default {}
    await waitFor(() => expect(screen.getByText('src/app.ts')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /external merge tool/i })).not.toBeInTheDocument()
  })

  test('the button appears once an external merge tool is configured, and opens it', async () => {
    const api = installMockGitAPI({
      settingsGetAll: jest.fn().mockResolvedValue({ externalMergeTool: 'opendiff -merge' }),
      getFileContent: jest.fn().mockResolvedValue({ content: CONFLICTED_FILE }),
      getConflictVersions: jest.fn().mockResolvedValue({ base: '', ours: 'our version', theirs: 'their version' }),
    })
    renderWithProviders(
      <ConflictResolver file="src/app.ts" onFinish={() => {}} onAbort={() => {}} showToast={() => {}} />
    )
    await waitFor(() => expect(screen.getByText('src/app.ts')).toBeInTheDocument())

    const openBtn = await screen.findByRole('button', { name: /external merge tool/i })
    await userEvent.click(openBtn)

    expect(api.openExternalMerge).toHaveBeenCalledWith('src/app.ts')
    // The button becomes "Load result" once the tool has been spawned.
    expect(await screen.findByRole('button', { name: /load result/i })).toBeInTheDocument()
  })

  test('loading the result reads the merged temp file back', async () => {
    const api = installMockGitAPI({
      settingsGetAll: jest.fn().mockResolvedValue({ externalMergeTool: 'opendiff -merge' }),
      getFileContent: jest.fn().mockResolvedValue({ content: CONFLICTED_FILE }),
      getConflictVersions: jest.fn().mockResolvedValue({ base: '', ours: 'our version', theirs: 'their version' }),
      openExternalMerge: jest.fn().mockResolvedValue({ success: true, mergedPath: '/tmp/merged-app.ts' }),
      readTempFile: jest.fn().mockResolvedValue({ content: 'resolved content' }),
    })
    renderWithProviders(
      <ConflictResolver file="src/app.ts" onFinish={() => {}} onAbort={() => {}} showToast={() => {}} />
    )
    await waitFor(() => expect(screen.getByText('src/app.ts')).toBeInTheDocument())

    await userEvent.click(await screen.findByRole('button', { name: /external merge tool/i }))
    await userEvent.click(await screen.findByRole('button', { name: /load result/i }))

    expect(api.readTempFile).toHaveBeenCalledWith('/tmp/merged-app.ts')
  })
})
