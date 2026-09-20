import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KeptSection } from '../sections/KeptSection'
import { KeepSearchButton } from '../../SearchHint/KeepSearchButton'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'
import { readKept, type KeptEntry } from '../../../hooks/useKept'

test('a kept search survives remount, can be renamed, reopened and removed in one click', async () => {
  const settings: Record<string, string> = {}
  installMockGitAPI({
    settingsGetAll: jest.fn(async () => ({ ...settings })),
    settingsSet: jest.fn(async (key, value) => { settings[key] = value; return { success: true } }),
  })
  const search = { kind: 'search' as const, query: 'cache file:src', ai: false, hashes: ['hash'], requiredHashes: ['hash'] }
  const button = renderWithProviders(<KeepSearchButton repo="/repo" search={search} />)
  await userEvent.click(screen.getByRole('button', { name: 'Keep' }))
  await screen.findByRole('button', { name: 'Kept' })
  button.unmount()
  const open = jest.fn()
  const list = renderWithProviders(<KeptSection repo="/repo" onOpen={open} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Rename: cache file:src' }))
  const input = screen.getByRole('textbox', { name: 'Name' })
  await userEvent.clear(input)
  await userEvent.type(input, 'Cache work{Enter}')
  await waitFor(async () => expect((await readKept('/repo'))[0].name).toBe('Cache work'))
  list.unmount()
  renderWithProviders(<KeptSection repo="/repo" onOpen={open} />)
  await userEvent.click(await screen.findByRole('button', { name: /⌕ Cache work/ }))
  expect(open).toHaveBeenCalledWith(expect.objectContaining({ ...search, name: 'Cache work' }))
  await userEvent.click(screen.getByRole('button', { name: 'Remove: Cache work' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: /⌕ Cache work/ })).not.toBeInTheDocument())
  expect(await readKept('/repo')).toEqual([])
})

test('opening a comparison passes both refs and its axis to the host', async () => {
  const entry: KeptEntry = { kind: 'comparison', id: 'cmp', at: 1000, name: 'Release', a: 'v1', b: null, axis: 'endpoints', reviewed: ['a.ts'] }
  installMockGitAPI({ settingsGetAll: jest.fn().mockResolvedValue({ 'gv-kept:/repo': JSON.stringify([entry]) }) })
  const open = jest.fn()
  renderWithProviders(<KeptSection repo="/repo" onOpen={open} />)
  await userEvent.click(await screen.findByRole('button', { name: /⇄ Release/ }))
  expect(open).toHaveBeenCalledWith(entry)
})
