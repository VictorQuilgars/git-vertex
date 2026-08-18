import { screen } from '@testing-library/react'
import DiffViewer from '../DiffViewer'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The file list was 120px, whatever it held: three rows visible, the rest
// behind a scrollbar inside a box you could not resize. It is the list you use
// to decide what to read, and a comparison routinely has twenty entries.

const files = Array.from({ length: 12 }, (_, i) => ({
  path: `src/file-${i}.ts`, status: 'M', additions: i, deletions: i,
}))

const paneOf = (c: HTMLElement) => c.querySelector('.file-list') as HTMLElement

// The settings provider around the viewer asks the bridge for its themes.
beforeEach(() => installMockGitAPI())
afterEach(() => localStorage.clear())

describe('the diff’s file list', () => {
  test('opens taller than the three rows it used to show', () => {
    const { container } = renderWithProviders(
      <DiffViewer commit={null} headerLabel="a...b" diff="" files={files as any} loading={false} />)

    expect(paneOf(container).style.maxHeight).toBe('200px')
  })

  test('takes the height it was last dragged to', () => {
    localStorage.setItem('gv-dv-files-h', '420')

    const { container } = renderWithProviders(
      <DiffViewer commit={null} headerLabel="a...b" diff="" files={files as any} loading={false} />)

    expect(paneOf(container).style.maxHeight).toBe('420px')
  })

  test('a stored height out of range is brought back into it', () => {
    // Hand-edited storage, or a window that used to be much taller.
    localStorage.setItem('gv-dv-files-h', '99999')

    const { container } = renderWithProviders(
      <DiffViewer commit={null} headerLabel="a...b" diff="" files={files as any} loading={false} />)

    expect(paneOf(container).style.maxHeight).toBe('640px')
  })

  test('and there is something to drag', () => {
    const { container } = renderWithProviders(
      <DiffViewer commit={null} headerLabel="a...b" diff="" files={files as any} loading={false} />)

    expect(container.querySelector('.file-list-resize')).toBeInTheDocument()
  })

  test('no files, no pane and no handle', () => {
    const { container } = renderWithProviders(
      <DiffViewer commit={null} headerLabel="a...b" diff="" files={[]} loading={false} />)

    expect(container.querySelector('.file-list')).toBeNull()
    expect(container.querySelector('.file-list-resize')).toBeNull()
    expect(screen.getByText('a...b')).toBeInTheDocument()
  })
})
