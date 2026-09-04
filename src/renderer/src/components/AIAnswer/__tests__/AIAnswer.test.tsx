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
    expect(run).toHaveBeenCalledWith(undefined)
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
    expect(run).toHaveBeenLastCalledWith('the migration')
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
})
