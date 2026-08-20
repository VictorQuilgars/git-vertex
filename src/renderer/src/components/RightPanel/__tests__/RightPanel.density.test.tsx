import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RightPanel from '../RightPanel'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The commit pane, measured against a reference: every row of theirs carries
// more than one fact, and the second is always the cost. Ours spent a row per
// fact and never said the cost. These hold the shape of the fix, not its CSS.

const COMMIT = {
  hash: 'abc123def456', shortHash: 'abc123', message: 'feat: something',
  author: 'Victor', authorEmail: 'v@example.com',
  date: new Date(Date.now() - 7 * 3600_000).toISOString(),
  parents: ['p1'], refs: ['HEAD -> tmp'],
}

function render(props: Record<string, any> = {}) {
  installMockGitAPI({
    getCommitFiles: jest.fn().mockResolvedValue({
      files: [
        { path: 'client/tailwind.config.ts', status: 'M', additions: 2, deletions: 0 },
        { path: 'src/app/page.tsx', status: 'M', additions: 33, deletions: 8 },
      ],
    }),
    getDiff: jest.fn().mockResolvedValue({ diff: '' }),
    getCommitBody: jest.fn().mockResolvedValue({ body: '' }),
    getCommitStats: jest.fn().mockResolvedValue({ files: 2, additions: 35, deletions: 8 }),
  })
  return renderWithProviders(
    <RightPanel
      selectedCommit={COMMIT as any}
      onCommitSuccess={() => {}}
      showToast={() => {}}
      onSelectCommit={() => {}}
      currentBranch="tmp"
      embedded
      {...props}
    />
  )
}

describe('the commit header is one line', () => {
  test('it says what the commit cost, summed from its files', async () => {
    render()
    await screen.findByText('tailwind.config.ts')
    // +35 and −8, the totals of the two files, on the header line — scoped
    // there, because the second file's own −8 is also on screen.
    const head = document.querySelector('.cd-head-cost')!
    expect(head.textContent).toContain('+35')
    expect(head.textContent).toContain('−8')
    expect(head.textContent).toContain('2')   // two files
  })

  test('the date reads as a relative time, with the full date a tooltip away', async () => {
    render()
    const meta = await screen.findByText(/7 h ago|il y a 7 h|7 hours/)
    expect(meta.getAttribute('title')).toMatch(/2026|202\d/)
  })

  test('the branch chip sits on the header line', async () => {
    render()
    expect(await screen.findByText('★ tmp')).toBeInTheDocument()
  })
})

describe('the file row says its cost and offers its actions', () => {
  test('per-file counts are on the row', async () => {
    render()
    await screen.findByText('tailwind.config.ts')
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.getByText('+33')).toBeInTheDocument()
  })

  // A file is found by its name, and the folder is where it was found.
  test('the name comes before the folder', async () => {
    render()
    const name = await screen.findByText('tailwind.config.ts')
    const row = name.closest('.rp-file-row')!
    const path = row.querySelector('.rp-file-path')!
    expect(path.firstElementChild!.className).toContain('rp-file-name')
  })

  test('the row offers to copy its path without a context menu', async () => {
    const write = jest.fn()
    Object.assign(navigator, { clipboard: { writeText: write } })
    render()
    await screen.findByText('tailwind.config.ts')
    await userEvent.click(screen.getAllByTitle('Copy Path')[0])
    expect(write).toHaveBeenCalledWith('client/tailwind.config.ts')
  })
})

describe('two primary actions, not one', () => {
  // The rule of the panel: no handler, no button — never an entry that does nothing.
  test('Compare appears only when the host can compare', async () => {
    render()
    await screen.findByText('tailwind.config.ts')
    expect(screen.queryByText('Compare')).not.toBeInTheDocument()

    const onCompareWorking = jest.fn()
    render({ onCompareWorking })
    await userEvent.click((await screen.findAllByText('Compare'))[0])
    expect(onCompareWorking).toHaveBeenCalledWith('abc123def456')
  })

  // A proposal the model makes is never a filled button.
  test('the AI action is an icon control, not the pane primary', async () => {
    render()
    await screen.findByText('tailwind.config.ts')
    const ai = screen.getByTitle('Recompose commit with AI')
    expect(ai.textContent?.trim()).toBe('')
  })
})
