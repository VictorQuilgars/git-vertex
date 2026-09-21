import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MemoryView, { searchQueryForGit } from '../MemoryView'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'
import { parseSearchQuery } from '../../../utils/searchQuery'
import type { KeptEntry } from '../../../hooks/useKept'

// The page the side bar's list became. What it has to get right is the one
// thing the list could not say: a kept search is an ANSWER and a QUESTION, the
// answer ages, and asking again has to show which of the two you are looking at.

const commit = (hash: string, message: string) => ({
  hash, shortHash: hash.slice(0, 7), message,
  author: 'Ada', authorEmail: 'ada@test.com', date: '2026-09-01T10:00:00+02:00', parents: [], refs: [],
})
const A = 'a'.repeat(40)
const B = 'b'.repeat(40)
const C = 'c'.repeat(40)

function mount(entries: KeptEntry[], api: Record<string, any> = {}) {
  const settings: Record<string, string> = { 'gv-kept:/repo': JSON.stringify(entries) }
  const mock = installMockGitAPI({
    settingsGetAll: jest.fn(async () => ({ ...settings })),
    settingsSet: jest.fn(async (key: string, value: string) => { settings[key] = value; return { success: true } }),
    commitsByHash: jest.fn(async () => ({ commits: [] })),
    searchCommits: jest.fn(async () => ({ commits: [] })),
    filesBetweenCommits: jest.fn(async () => ({ files: [] })),
    ...api,
  })
  return { mock, settings }
}

const search = (over: Partial<KeptEntry> = {}): KeptEntry => ({
  kind: 'search', id: 'one', name: 'Cache work', at: 1_700_000_000_000,
  query: 'cache', ai: false, hashes: [A, B], requiredHashes: null, ...over,
} as KeptEntry)

test('a kept search shows the commits it kept, and says what is no longer there', async () => {
  mount([search()], { commitsByHash: jest.fn(async () => ({ commits: [commit(A, 'cache the page')] })) })
  renderWithProviders(<MemoryView repo="/repo" />)
  expect(await screen.findByText('cache the page')).toBeInTheDocument()
  // Two hashes were kept and git answers with one: the other was rewritten away.
  expect(screen.getByText('1 kept commit is no longer in this repository')).toBeInTheDocument()
})

test('asking again marks what the kept answer did not hold, and keeping it writes it', async () => {
  const { mock, settings } = mount([search()], {
    commitsByHash: jest.fn(async () => ({ commits: [commit(A, 'cache the page'), commit(B, 'cache the tree')] })),
    searchCommits: jest.fn(async () => ({ commits: [commit(C, 'cache the refs'), commit(A, 'cache the page')] })),
  })
  renderWithProviders(<MemoryView repo="/repo" />)
  await screen.findByText('cache the page')

  await userEvent.click(screen.getByRole('button', { name: /Ask again/ }))
  expect(await screen.findByText('cache the refs')).toBeInTheDocument()
  expect(screen.getByText('2 commits now · 1 the kept answer did not hold')).toBeInTheDocument()
  // The new one wears the badge; the one that was already kept does not.
  const rows = screen.getAllByTitle(/^cache the/)
  expect(within(rows[0]).queryByText('new')).toBeInTheDocument()
  expect(within(rows[1]).queryByText('new')).toBeNull()

  await userEvent.click(screen.getByRole('button', { name: /Keep this answer instead/ }))
  await waitFor(() => expect(mock.settingsSet).toHaveBeenCalled())
  expect(JSON.parse(settings['gv-kept:/repo'])[0].hashes).toEqual([C, A])
})

// The engine that answered is part of what was kept: the commits that ADD a
// word are not the commits that mention it, and asking the wrong one would put
// a different search under the kept one's name.
test('a search asked of the diffs is asked of the diffs again', async () => {
  const { mock } = mount([search({ diffs: true, hashes: [A] })], {
    commitsByHash: jest.fn(async () => ({ commits: [commit(A, 'cache the page')] })),
    searchInDiffs: jest.fn(async () => ({ hashes: [A] })),
  })
  renderWithProviders(<MemoryView repo="/repo" />)
  await screen.findByText('cache the page')
  await userEvent.click(screen.getByRole('button', { name: /Ask again/ }))
  await waitFor(() => expect(mock.searchInDiffs).toHaveBeenCalledWith('cache'))
  expect(mock.searchCommits).not.toHaveBeenCalled()
})

// `keptHashes.length` in an `&&` chain is a number, and React renders a 0.
test('a search with no kept answer prints no stray zero between its buttons', async () => {
  mount([search({ hashes: null })], { searchCommits: jest.fn(async () => ({ commits: [commit(A, 'cache the page')] })) })
  renderWithProviders(<MemoryView repo="/repo" />)
  await screen.findByText('cache the page')
  expect(document.querySelector('.mem-actions')!.textContent).not.toMatch(/0/)
  expect(screen.queryByRole('button', { name: /Keep this answer instead/ })).toBeNull()
})

test('a search that kept no commit asks its question straight away', async () => {
  const { mock } = mount([search({ hashes: null })], {
    searchCommits: jest.fn(async () => ({ commits: [commit(A, 'cache the page')] })),
  })
  renderWithProviders(<MemoryView repo="/repo" />)
  expect(await screen.findByText('cache the page')).toBeInTheDocument()
  expect(mock.commitsByHash).not.toHaveBeenCalled()
  expect(mock.searchCommits).toHaveBeenCalled()
})

test('the query is asked of git in its parts, never as one string', async () => {
  const { mock } = mount([search({ hashes: null, query: 'cache file:src/cache.ts author:"Ada L" before:2026-01-01' })])
  renderWithProviders(<MemoryView repo="/repo" />)
  await waitFor(() => expect(mock.searchCommits).toHaveBeenCalled())
  expect(mock.searchCommits.mock.calls[0][0]).toEqual({
    text: 'cache', authors: ['Ada L'], paths: ['src/cache.ts'],
    after: undefined, before: new Date(new Date(2026, 0, 2).getTime() - 1).toISOString(),
  })
})

test('a span is read from today, not from the day it was kept', () => {
  const now = new Date('2026-09-20T12:00:00Z').getTime()
  const asked = searchQueryForGit(parseSearchQuery('after:2w bug'), now)
  expect(asked.after).toBe(new Date(now - 14 * 86400e3).toISOString())
  expect(asked.text).toBe('bug')
})

test('a bound git cannot read is dropped, not passed on', () => {
  expect(searchQueryForGit(parseSearchQuery('after:soon fix')).after).toBeUndefined()
})

test('a kept comparison shows its files, ticks what was reviewed, and opens with its axis', async () => {
  const comparison: KeptEntry = {
    kind: 'comparison', id: 'two', name: 'Release', at: 1_700_000_000_000,
    a: 'v1.0.0', b: null, axis: 'endpoints', reviewed: ['src/a.ts'],
  } as KeptEntry
  mount([comparison], { filesBetweenCommits: jest.fn(async () => ({ files: [{ path: 'src/a.ts' }, { path: 'src/b.ts' }] })) })
  const onOpenCompare = jest.fn()
  renderWithProviders(<MemoryView repo="/repo" onOpenCompare={onOpenCompare} />)
  expect(await screen.findByText('src/b.ts')).toBeInTheDocument()
  expect(screen.getByText('1 of 2 files reviewed')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /Open the comparison/ }))
  // `b: null` is the working tree, and the axis is part of the question.
  expect(onOpenCompare).toHaveBeenCalledWith('v1.0.0', null, 'endpoints', 'Release')
})

test('a commit row is a button only where the host can show a commit', async () => {
  mount([search()], { commitsByHash: jest.fn(async () => ({ commits: [commit(A, 'cache the page')] })) })
  const { unmount } = renderWithProviders(<MemoryView repo="/repo" />)
  await screen.findByText('cache the page')
  expect(screen.queryByRole('button', { name: /cache the page/ })).toBeNull()
  expect(screen.queryByRole('button', { name: /Show in the graph/ })).toBeNull()
  unmount()

  const onOpenCommit = jest.fn()
  renderWithProviders(<MemoryView repo="/repo" onOpenCommit={onOpenCommit} onShowCommits={jest.fn()} />)
  await userEvent.click(await screen.findByRole('button', { name: /cache the page/ }))
  expect(onOpenCommit).toHaveBeenCalledWith(A)
})
