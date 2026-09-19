import { useState } from 'react'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RightPanel from '../RightPanel'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'
import type { ConflictKind } from '../../../types'

// "Resolve all with AI" (#269), through the panel as a host mounts it. The
// host here keeps the one thing the panel depends on — which paths git still
// reports unmerged — and the mocks move a path in and out of it the way
// resolving, and undoing, does in a real repository.

function setup(kinds: Record<string, ConflictKind>, apiOverrides: Record<string, any> = {}) {
  const unmerged = new Set(Object.keys(kinds))
  const staged = new Set<string>(['src/untouched.ts'])
  const showToast = jest.fn()
  const openDiff = jest.fn()
  const api = installMockGitAPI({
    getMergeMessage: jest.fn().mockResolvedValue({ message: "Merge branch 'feature'" }),
    getWorkingChanges: jest.fn(async () => ({
      staged: [...staged].map(path => ({ path, status: 'M' })), unstaged: [], untracked: [],
    })),
    aiResolveConflict: jest.fn(async (file: string) => ({ resolution: `merged ${file}\n`, explanation: `Kept both sides of ${file}.` })),
    resolveConflict: jest.fn(async (file: string) => { unmerged.delete(file); staged.add(file); return { success: true } }),
    restoreConflict: jest.fn(async (file: string) => { unmerged.add(file); staged.delete(file); return { success: true } }),
    ...apiOverrides,
  })

  let refresh = () => {}
  function Host() {
    const [files, setFiles] = useState([...unmerged])
    refresh = () => setFiles([...unmerged])
    return (
      <RightPanel
        repoPath="/repo"
        selectedCommit={null}
        onCommitSuccess={() => refresh()}
        showToast={showToast}
        onSelectCommit={() => {}}
        conflictFiles={files}
        conflictKinds={kinds}
        conflictMode="merge"
        onConflictFinish={() => {}}
        onConflictAbort={() => {}}
        onOpenResolver={() => {}}
        onOpenFileDiff={openDiff}
        embedded
      />
    )
  }
  renderWithProviders(<Host />)
  return { api, showToast, openDiff, unmerged }
}

const conflicted = () => document.querySelectorAll('.rp-file-conflicted')
const rowOf = (path: string) => screen.getByText(path).closest('.rp-file-row') as HTMLElement

describe('Resolve all with AI', () => {
  test('resolves every content conflict, and leaves a deletion to the user', async () => {
    const { api, showToast, openDiff } = setup({
      'CHANGELOG.md': 'both-modified', 'src/notes.ts': 'both-modified', 'old.ts': 'deleted-by-them',
    })
    await userEvent.click(await screen.findByRole('button', { name: /Resolve all with AI/ }))

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('The model resolved 2 files — review before you commit'))
    expect(api.aiResolveConflict.mock.calls.map((c: any[]) => c[0]).sort()).toEqual(['CHANGELOG.md', 'src/notes.ts'])
    expect(api.resolveConflict).toHaveBeenCalledWith('CHANGELOG.md', 'merged CHANGELOG.md\n')

    // The deletion is still asked of the user; the two others wait for review.
    await waitFor(() => expect(conflicted()).toHaveLength(1))
    expect(rowOf('old.ts')).toHaveClass('rp-file-conflicted--existence')
    const changelog = rowOf('CHANGELOG.md')
    expect(changelog).toHaveClass('rp-file-resolved--model')
    expect(within(changelog).getByText('AI')).toBeInTheDocument()
    expect(screen.getByText('Kept both sides of CHANGELOG.md.')).toBeInTheDocument()
    // A file resolved some other way wears no mark.
    expect(rowOf('src/untouched.ts')).not.toHaveClass('rp-file-resolved--model')

    // Review is what the file becomes: the staged version, against the current side.
    await userEvent.click(within(changelog).getByRole('button', { name: 'Review' }))
    expect(openDiff).toHaveBeenCalledWith({ type: 'working', filePath: 'CHANGELOG.md', area: 'staged' })
  })

  test('with nothing left in conflict, the panel stays until the model’s work is reviewed', async () => {
    const { api } = setup({ 'a.ts': 'both-modified', 'b.ts': 'both-added' })
    await userEvent.click(await screen.findByRole('button', { name: /Resolve all with AI/ }))

    await screen.findByText('All conflicts are resolved')
    expect(screen.getByRole('button', { name: 'Commit & Merge' })).toBeEnabled()

    // Undo puts the file back in conflict, and takes its mark away.
    await userEvent.click(within(rowOf('a.ts')).getByRole('button', { name: 'Undo' }))
    expect(api.restoreConflict).toHaveBeenCalledWith('a.ts')
    await waitFor(() => expect(conflicted()).toHaveLength(1))
    expect(rowOf('a.ts')).toHaveClass('rp-file-conflicted')
    expect(rowOf('b.ts')).toHaveClass('rp-file-resolved--model')
  })

  test('a file the model could not resolve stays in conflict, with the reason under it', async () => {
    const { showToast } = setup({ 'a.ts': 'both-modified', 'big.json': 'both-modified' }, {
      aiResolveConflict: jest.fn(async (file: string) => file === 'big.json'
        ? { error: 'File too long for AI resolution (90000 characters, max 60000)' }
        : { resolution: 'ok\n', explanation: '' }),
    })
    await userEvent.click(await screen.findByRole('button', { name: /Resolve all with AI/ }))

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('The model resolved 1 of 2 files — the others are still in conflict', 'err'))
    expect(await screen.findByText(/The model could not resolve it: File too long/)).toBeInTheDocument()
    expect(rowOf('big.json')).toHaveClass('rp-file-conflicted')
  })

  test('no key: one request, nothing written, and the setting named', async () => {
    const { api, showToast } = setup({ 'a.ts': 'both-modified', 'b.ts': 'both-modified', 'c.ts': 'both-modified' }, {
      aiResolveConflict: jest.fn().mockResolvedValue({ error: 'NO_API_KEY' }),
    })
    await userEvent.click(await screen.findByRole('button', { name: /Resolve all with AI/ }))

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('No AI API key configured — see Settings → AI', 'err'))
    // Two in flight at most, then nothing more is asked.
    expect(api.aiResolveConflict.mock.calls.length).toBeLessThanOrEqual(2)
    expect(api.resolveConflict).not.toHaveBeenCalled()
    expect(conflicted()).toHaveLength(3)
  })

  test('the guidance goes with every file', async () => {
    const { api } = setup({ 'a.ts': 'both-modified', 'b.ts': 'both-modified' })
    await userEvent.click(await screen.findByRole('button', { name: 'Guidance for the model' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Guidance for the model' }), 'keep both entries{Enter}')

    await waitFor(() => expect(api.aiResolveConflict).toHaveBeenCalledTimes(2))
    expect(api.aiResolveConflict).toHaveBeenCalledWith('a.ts', 'keep both entries')
    expect(api.aiResolveConflict).toHaveBeenCalledWith('b.ts', 'keep both entries')
  })

  test('nothing to offer when every conflict is about whether a file survives', async () => {
    setup({ 'old.ts': 'deleted-by-them', 'gone.ts': 'deleted-by-us' })
    await screen.findByText('old.ts')
    expect(screen.queryByRole('button', { name: /Resolve all with AI/ })).not.toBeInTheDocument()
  })
})
