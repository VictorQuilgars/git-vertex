import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CenterFileDiff from '../CenterFileDiff'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

const SAMPLE_DIFF = `diff --git a/src/app.ts b/src/app.ts
index 111..222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,2 @@
-old line
+new line
 context line
`

describe('CenterFileDiff — external diff tool (v1.20.0)', () => {
  test('hidden when no external diff tool is configured', async () => {
    installMockGitAPI({ getDiff: jest.fn().mockResolvedValue({ diff: SAMPLE_DIFF }) })
    renderWithProviders(
      <CenterFileDiff target={{ type: 'commit', commitHash: 'abc123', filePath: 'src/app.ts' }} />
    )
    await waitFor(() => expect(screen.getByText('src/app.ts')).toBeInTheDocument())
    expect(screen.queryByTitle(/external diff tool/i)).not.toBeInTheDocument()
  })

  test('appears once configured, and diffs the previous revision against the shown one', async () => {
    const api = installMockGitAPI({
      settingsGetAll: jest.fn().mockResolvedValue({ externalDiffTool: 'opendiff' }),
      getDiff: jest.fn().mockResolvedValue({ diff: SAMPLE_DIFF }),
      getFileAtCommit: jest.fn()
        .mockResolvedValueOnce({ content: 'old line\ncontext line\n' })   // abc123^
        .mockResolvedValueOnce({ content: 'new line\ncontext line\n' }), // abc123
    })
    renderWithProviders(
      <CenterFileDiff target={{ type: 'commit', commitHash: 'abc123', filePath: 'src/app.ts' }} />
    )
    await waitFor(() => expect(screen.getByText('src/app.ts')).toBeInTheDocument())

    const btn = await screen.findByTitle(/external diff tool/i)
    await userEvent.click(btn)

    expect(api.getFileAtCommit).toHaveBeenNthCalledWith(1, 'abc123^', 'src/app.ts')
    expect(api.getFileAtCommit).toHaveBeenNthCalledWith(2, 'abc123', 'src/app.ts')
    await waitFor(() => expect(api.openExternalDiff).toHaveBeenCalledWith('old line\ncontext line\n', 'new line\ncontext line\n', 'src/app.ts'))
  })

  test('for a working-tree file, diffs HEAD against the working copy', async () => {
    const api = installMockGitAPI({
      settingsGetAll: jest.fn().mockResolvedValue({ externalDiffTool: 'opendiff' }),
      getWorkingFileDiff: jest.fn().mockResolvedValue({ diff: SAMPLE_DIFF }),
      getFileAtCommit: jest.fn().mockResolvedValue({ content: 'head content\n' }),
      getFileContent: jest.fn().mockResolvedValue({ content: 'working content\n' }),
    })
    renderWithProviders(
      <CenterFileDiff target={{ type: 'working', filePath: 'src/app.ts', area: 'unstaged' }} />
    )
    await waitFor(() => expect(screen.getByText('src/app.ts')).toBeInTheDocument())

    await userEvent.click(await screen.findByTitle(/external diff tool/i))

    expect(api.getFileAtCommit).toHaveBeenCalledWith('HEAD', 'src/app.ts')
    expect(api.getFileContent).toHaveBeenCalledWith('src/app.ts')
    await waitFor(() => expect(api.openExternalDiff).toHaveBeenCalledWith('head content\n', 'working content\n', 'src/app.ts'))
  })
})
