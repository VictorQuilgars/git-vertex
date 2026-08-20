import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RightPanel, { __resetSelfEmailCache } from '../RightPanel'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The second pass over the commit pane (#113): the reference's remaining rows.
// Each test holds one of them — the counted files bar, the filter that is a
// field, the guided explanation, the honest autolinks line, and the author who
// is you. As everywhere in the panel: every control does something real.

const COMMIT = {
  hash: 'abc123def456', shortHash: 'abc123', message: 'feat: something\n\nSee #12.',
  author: 'Victor', authorEmail: 'v@example.com',
  date: new Date(Date.now() - 7 * 3600_000).toISOString(),
  parents: ['p1'], refs: ['HEAD -> tmp'],
}

beforeEach(() => __resetSelfEmailCache())

function render(props: Record<string, any> = {}, apiOverrides: Record<string, any> = {}) {
  const api = installMockGitAPI({
    getCommitFiles: jest.fn().mockResolvedValue({
      files: [
        { path: 'client/tailwind.config.ts', status: 'M', additions: 2, deletions: 0 },
        { path: 'src/app/page.tsx', status: 'M', additions: 33, deletions: 8 },
      ],
    }),
    getDiff: jest.fn().mockResolvedValue({ diff: '' }),
    getCommitBody: jest.fn().mockResolvedValue({ body: 'See #12.' }),
    getCommitStats: jest.fn().mockResolvedValue({ files: 2, additions: 35, deletions: 8 }),
    ...apiOverrides,
  })
  const view = renderWithProviders(
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
  return { api, ...view }
}

describe('the files bar counts and its tools are real', () => {
  test('the header names the list and counts every file', async () => {
    render()
    await screen.findByText('tailwind.config.ts')
    expect(screen.getByText('FILES CHANGED')).toBeInTheDocument()
    expect(document.querySelector('.cd-files-count')!.textContent).toBe('2')
  })

  test('the copy tool writes the full paths, one per line', async () => {
    const write = jest.fn()
    Object.assign(navigator, { clipboard: { writeText: write } })
    render()
    await screen.findByText('tailwind.config.ts')
    await userEvent.click(screen.getByTitle('Copy file list'))
    expect(write).toHaveBeenCalledWith('client/tailwind.config.ts\nsrc/app/page.tsx')
  })

  // The sort button that used to live on this bar had no onClick. Its absence
  // is the fix; this holds the bar to controls that do something.
  test('every button on the bar has a handler', async () => {
    render()
    await screen.findByText('tailwind.config.ts')
    const bar = document.querySelector('.cd-files-bar')!
    for (const btn of Array.from(bar.querySelectorAll('button'))) {
      expect((btn as any).onclick ?? btn.getAttribute('onClick')).not.toBeNull()
    }
    expect(bar.querySelector('.cd-sort-btn')).not.toBeInTheDocument()
  })
})

describe('the commit filter is a field, and a lens', () => {
  test('typing narrows the list; the count keeps counting all files', async () => {
    render()
    await screen.findByText('tailwind.config.ts')
    const inputs = document.querySelectorAll('.st-filter-input')
    const field = inputs[inputs.length - 1] as HTMLInputElement
    await userEvent.type(field, 'page')
    expect(screen.queryByText('tailwind.config.ts')).not.toBeInTheDocument()
    expect(screen.getByText('page.tsx')).toBeInTheDocument()
    expect(document.querySelector('.cd-files-count')!.textContent).toBe('2')
  })

  test('a filter matching nothing says so, and Escape clears it', async () => {
    render()
    await screen.findByText('tailwind.config.ts')
    const inputs = document.querySelectorAll('.st-filter-input')
    const field = inputs[inputs.length - 1] as HTMLInputElement
    await userEvent.type(field, 'zzz')
    expect(screen.getByText(/No file matches|Aucun fichier/)).toBeInTheDocument()
    await userEvent.type(field, '{Escape}')
    expect(await screen.findByText('tailwind.config.ts')).toBeInTheDocument()
  })
})

describe('the guided explanation', () => {
  test('guidance travels with the call and bypasses the cache', async () => {
    const aiExplainCommit = jest.fn().mockResolvedValue({ explanation: 'because' })
    const { api } = render({}, { aiExplainCommit })
    await screen.findByText('tailwind.config.ts')
    const field = document.querySelector('.cd-explain-input') as HTMLInputElement
    await userEvent.type(field, 'focus on the config{Enter}')
    await waitFor(() =>
      expect(api.aiExplainCommit).toHaveBeenCalledWith('abc123def456', true, 'focus on the config'))
  })
})

describe('the message zone', () => {
  test('the copy control writes subject and body', async () => {
    const write = jest.fn()
    Object.assign(navigator, { clipboard: { writeText: write } })
    render()
    await screen.findByText('tailwind.config.ts')
    await userEvent.click(screen.getByTitle(/Copy message|Copier le message/))
    await waitFor(() => expect(write).toHaveBeenCalled())
    expect(write.mock.calls[0][0]).toContain('feat: something')
    expect(write.mock.calls[0][0]).toContain('See #12.')
  })

  test('a message with no reference says No Autolinks Found', async () => {
    render({}, { getCommitBody: jest.fn().mockResolvedValue({ body: '' }) })
    const plain = { ...COMMIT, message: 'feat: something' }
    render({ selectedCommit: plain }, { getCommitBody: jest.fn().mockResolvedValue({ body: '' }) })
    expect(await screen.findAllByText(/No autolinks found|Aucune référence/i)).toBeTruthy()
  })

  test('a message that references an issue does not say it', async () => {
    render({ githubRepo: { owner: 'o', repo: 'r' } })
    await screen.findByText('tailwind.config.ts')
    expect(screen.queryByText(/No autolinks found/i)).not.toBeInTheDocument()
  })
})

describe('the author who is you', () => {
  test('your own email renders as You, with the name a tooltip away', async () => {
    render({}, {
      gitGetGlobalConfig: jest.fn().mockResolvedValue({ userName: 'Victor', userEmail: 'v@example.com' }),
    })
    const you = await screen.findByText(/^(You|Vous)$/)
    expect(you.getAttribute('title')).toContain('Victor')
  })

  test('someone else keeps their name', async () => {
    render({}, {
      gitGetGlobalConfig: jest.fn().mockResolvedValue({ userName: 'Alice', userEmail: 'alice@else.where' }),
    })
    await screen.findByText('tailwind.config.ts')
    expect(screen.getByText('Victor')).toBeInTheDocument()
    expect(screen.queryByText(/^(You|Vous)$/)).not.toBeInTheDocument()
  })
})
