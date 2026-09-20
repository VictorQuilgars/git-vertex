import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CompareView from '../CompareView'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'
import { readKept } from '../../../hooks/useKept'

test('keep, tick a file, close and reopen the comparison with its review intact', async () => {
  const settings: Record<string, string> = {}
  const api = installMockGitAPI({
    settingsGetAll: jest.fn(async () => ({ ...settings })),
    settingsSet: jest.fn(async (key, value) => { settings[key] = value; return { success: true } }),
    getBranches: jest.fn().mockResolvedValue({ branches: [] }),
    getTags: jest.fn().mockResolvedValue({ tags: [] }),
    getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
    diffBetweenCommits: jest.fn().mockResolvedValue({ diff: 'diff --git a/cache.ts b/cache.ts\n--- a/cache.ts\n+++ b/cache.ts\n@@ -1 +1 @@\n-old\n+new' }),
    filesBetweenCommits: jest.fn().mockResolvedValue({ files: [{ path: 'cache.ts', status: 'M', additions: 1, deletions: 1 }] }),
  })
  const view = renderWithProviders(<CompareView initialA="v1" initialB={null} initialAxis="endpoints" repoKey="/repo" />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Keep' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Keep' }))
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Reviewed: cache.ts' }))
  await waitFor(async () => expect((await readKept('/repo'))[0]).toMatchObject({ reviewed: ['cache.ts'] }))
  view.unmount()
  const entry = (await readKept('/repo'))[0]
  if (entry.kind !== 'comparison') throw new Error('expected comparison')
  renderWithProviders(<CompareView initialA={entry.a} initialB={entry.b} initialAxis={entry.axis} repoKey="/repo" />)
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Reviewed: cache.ts' })).toBeChecked())
  expect(api.diffBetweenCommits).toHaveBeenLastCalledWith('v1', null, 'endpoints')
})


test('reopening an existing VS Code comparison restores selectors changed inside the tab', async () => {
  const api = installMockGitAPI({
    getBranches: jest.fn().mockResolvedValue({ branches: [{ name: 'main', current: true }, { name: 'feature', current: false }] }),
    getTags: jest.fn().mockResolvedValue({ tags: [] }),
    getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
    compareBranches: jest.fn().mockResolvedValue({ ahead: [], behind: [] }),
    diffBetweenCommits: jest.fn().mockResolvedValue({ diff: '' }),
    filesBetweenCommits: jest.fn().mockResolvedValue({ files: [] }),
    getMergeBase: jest.fn().mockResolvedValue({ base: null }),
  })
  renderWithProviders(<CompareView initialA="main" initialB="feature" />)
  await waitFor(() => expect(api.diffBetweenCommits).toHaveBeenCalledWith('main', 'feature', 'diverged'))
  await userEvent.selectOptions(screen.getAllByRole('combobox')[1], [':working'])
  act(() => window.dispatchEvent(new CustomEvent('gv-restore-comparison', {
    detail: { a: 'main', b: 'feature', axis: 'diverged' },
  })))
  await waitFor(() => expect(api.diffBetweenCommits).toHaveBeenLastCalledWith('main', 'feature', 'diverged'))
})
