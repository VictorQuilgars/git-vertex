import { screen, waitFor } from '@testing-library/react'
import RightPanel from '../RightPanel'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The staging list in Tree mode gives every folder a stage/unstage button, and
// that button's tooltip called `t(...)` from a component that never took it from
// the context — a ReferenceError the moment a folder row carried an action, in
// the desktop app and in the VS Code panel alike, since v1.24.0 / ext-v1.22.0.
//
// Nothing caught it: the tests here never turned Tree mode on, and the shared
// renderer could not be type-checked (one bad `t()` signature buried the answer
// under a thousand false errors).

const WORKING_CHANGES = {
  staged: [{ path: 'src/main/git-service.ts', status: 'M' }],
  unstaged: [{ path: 'src/renderer/App.tsx', status: 'M' }],
  untracked: [],
}

function renderTreeMode() {
  localStorage.setItem('st-tree-mode', 'true')
  installMockGitAPI({
    getWorkingChanges: jest.fn().mockResolvedValue(WORKING_CHANGES),
    getLastCommitMessage: jest.fn().mockResolvedValue({ message: '' }),
    getMergeMessage: jest.fn().mockResolvedValue({ message: '' }),
    getCommitFiles: jest.fn().mockResolvedValue({ files: [] }),
  })
  return renderWithProviders(
    <RightPanel
      selectedCommit={{ hash: '__WIP__' } as any}
      onCommitSuccess={() => {}}
      showToast={() => {}}
      onSelectCommit={() => {}}
      currentBranch="main"
    />
  )
}

afterEach(() => localStorage.removeItem('st-tree-mode'))

describe('StagingView — Tree mode', () => {
  test('renders the folder rows without throwing', async () => {
    renderTreeMode()
    await waitFor(() => expect(screen.getAllByText('src').length).toBeGreaterThan(0))
  })

  test('a folder carries the action that stages everything under it', async () => {
    renderTreeMode()
    await waitFor(() => expect(screen.getAllByText('src').length).toBeGreaterThan(0))

    // The tooltip is what crashed: it is the only string on these rows built
    // through the translation function.
    const actions = screen.getAllByTitle(/folder$/i)
    expect(actions.length).toBeGreaterThan(0)
  })
})

// ── The tree's left gutter ──────────────────────────────────────────────────
// The depth was written straight into `paddingLeft`, which REPLACES the row's
// own left padding rather than adding to it. Every level below the first had
// an indent large enough to stand in for the missing gutter, so only the top
// one showed it: a top-level folder's disclosure triangle sat at 0, flush
// against the panel's edge, while the flat reading of the very same files —
// one click away on the same bar — started a gutter in. It is `--tree-gutter`
// plus the depth now, the property being declared beside each list's own left
// padding so the two readings line up and both follow the density.
describe('StagingView — the tree keeps the row’s left gutter', () => {
  /** The tree row whose own name is `text` — `main` is also the branch, off in the chrome. */
  const padOf = (text: string) => {
    const row = [...document.querySelectorAll('.st-tr')].find(
      r => r.querySelector('.st-tr-dirname, .st-tr-name')?.textContent === text)
    if (!row) throw new Error(`no tree row named ${text}`)
    return (row as HTMLElement).style.paddingLeft
  }

  test('a top-level folder is a gutter in, not against the edge', async () => {
    renderTreeMode()
    await waitFor(() => expect(screen.getAllByText('src').length).toBeGreaterThan(0))
    expect(padOf('src')).toBe('calc(var(--tree-gutter) + 0px)')
  })

  test('the depth is added to the gutter, and a file clears its folder’s triangle', async () => {
    renderTreeMode()
    await waitFor(() => expect(screen.getAllByText('git-service.ts').length).toBeGreaterThan(0))
    // src › main › git-service.ts — one level down, then the file under it.
    expect(padOf('main')).toBe('calc(var(--tree-gutter) + 10px)')
    expect(padOf('git-service.ts')).toBe('calc(var(--tree-gutter) + 24px)')
  })
})
