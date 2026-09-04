import React from 'react'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'
import AIAnswer from '../AIAnswer'

// The drawer the four readings of #70 P1 share. What matters is that it asks
// once on open, that a focus is a NEW question rather than an addition, and
// that a refusal is shown instead of an empty panel.

const anchor = { current: document.createElement('div') }

function open(run: jest.Mock, props: Record<string, any> = {}) {
  installMockGitAPI()
  const onClose = jest.fn()
  renderWithProviders(
    <AIAnswer anchor={anchor as any} title="Explain branch" subject="feat/x"
      run={run} onClose={onClose} {...props} />)
  return { onClose }
}

describe('AIAnswer', () => {
  test('asks once on open, and shows the answer with what it was read against', async () => {
    const run = jest.fn().mockResolvedValue({ text: 'It adds a thing.', meta: 'against origin/main' })
    open(run)
    await waitFor(() => expect(screen.getByText('It adds a thing.')).toBeInTheDocument())
    // Once — the drawer exists because the action was chosen; a Generate
    // button inside it would be furniture.
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith(undefined, undefined)
    expect(screen.getByText('feat/x')).toBeInTheDocument()
    expect(screen.getByText('against origin/main')).toBeInTheDocument()
  })

  test('a focus is a new question, asked with it', async () => {
    const run = jest.fn()
      .mockResolvedValueOnce({ text: 'The whole branch.' })
      .mockResolvedValue({ text: 'Only the migration.' })
    open(run, { guide: true })
    await screen.findByText('The whole branch.')
    await userEvent.type(screen.getByPlaceholderText(/only the migration/i), 'the migration')
    await userEvent.click(screen.getByRole('button', { name: 'Ask again' }))
    await waitFor(() => expect(screen.getByText('Only the migration.')).toBeInTheDocument())
    expect(run).toHaveBeenLastCalledWith('the migration', undefined)
    // It REPLACES: a second reading of the same thing is not a second opinion
    // to be compared against the first.
    expect(screen.queryByText('The whole branch.')).not.toBeInTheDocument()
  })

  test('no focus field where the answer is not an opinion', async () => {
    open(jest.fn().mockResolvedValue({ text: '### Added\n- a' }))
    await screen.findByText(/### Added/)
    expect(screen.queryByRole('button', { name: 'Ask again' })).not.toBeInTheDocument()
  })

  test('a missing key reads as the app says it everywhere else', async () => {
    open(jest.fn().mockResolvedValue({ error: 'NO_API_KEY' }))
    await waitFor(() => expect(screen.getByText(/No AI API key/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  test('a host that rejects is an error, not an unhandled promise', async () => {
    open(jest.fn().mockRejectedValue(new Error('not-implemented')))
    await waitFor(() => expect(screen.getByText('not-implemented')).toBeInTheDocument())
  })

  test('an empty answer is not shown as an answer', async () => {
    open(jest.fn().mockResolvedValue({ text: '   ' }))
    await waitFor(() => expect(screen.getByText('The model answered nothing.')).toBeInTheDocument())
  })

  test('an answer already written is shown whole, and nothing is asked', async () => {
    const run = jest.fn()
    const recall = jest.fn().mockResolvedValue({ text: '### Added\n- A thing.', meta: '3 commits over origin/main · written 2h' })
    open(run, { recall, mono: true })
    await screen.findByText(/### Added/)
    expect(run).not.toHaveBeenCalled()
    expect(screen.getByText('3 commits over origin/main · written 2h')).toBeInTheDocument()
    // and it can be asked for again, deliberately
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeInTheDocument()
  })

  test('a remembered answer that has fallen behind offers an update, and builds on itself', async () => {
    const run = jest.fn().mockResolvedValue({ text: 'the extended changelog' })
    const recall = jest.fn().mockResolvedValue({
      text: 'the old changelog', notice: '3 commits since — this changelog does not cover them.', stale: true,
    })
    open(run, { recall })
    await screen.findByText('the old changelog')
    expect(screen.getByText(/3 commits since/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Update' }))
    await waitFor(() => expect(screen.getByText('the extended changelog')).toBeInTheDocument())
    // The earlier text goes WITH the request: an update keeps its bullets,
    // it does not reword a document its reviewer has already read.
    expect(run).toHaveBeenCalledWith(undefined, 'the old changelog')
  })

  test('regenerating a fresh remembered answer starts over rather than extending', async () => {
    const run = jest.fn().mockResolvedValue({ text: 'a new take' })
    open(run, { recall: jest.fn().mockResolvedValue({ text: 'the stored one' }) })
    await screen.findByText('the stored one')
    await userEvent.click(screen.getByRole('button', { name: 'Regenerate' }))
    await waitFor(() => expect(screen.getByText('a new take')).toBeInTheDocument())
    expect(run).toHaveBeenCalledWith(undefined, undefined)
    // Once written, it is the latest — nothing left to re-ask for.
    expect(screen.queryByRole('button', { name: /Regenerate|Update/ })).not.toBeInTheDocument()
  })

  test('nothing remembered falls through to generating', async () => {
    const run = jest.fn().mockResolvedValue({ text: 'fresh' })
    open(run, { recall: jest.fn().mockResolvedValue(null) })
    await screen.findByText('fresh')
    expect(run).toHaveBeenCalledTimes(1)
  })

  test('an extra action is handed the whole answer', async () => {
    const insert = jest.fn()
    open(jest.fn().mockResolvedValue({ text: 'the changelog' }),
      { actions: [{ label: 'Insert into changelog', run: insert }] })
    await screen.findByText('the changelog')
    await userEvent.click(screen.getByRole('button', { name: 'Insert into changelog' }))
    expect(insert).toHaveBeenCalledWith('the changelog')
  })
})
