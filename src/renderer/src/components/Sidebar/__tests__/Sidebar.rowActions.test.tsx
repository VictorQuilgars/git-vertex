// The acts a branch row draws, and what each one actually calls (#274, #280).
//
// rowActions.test.ts checks the mapping; this checks the WIRING, which is the
// half that rotted: a branch three commits behind drew no pull at all, because
// the row was only ever handed the checked-out branch's `onPull` — and the
// fast-forward for the others had landed under another name.
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { emptyVisibility } from '../../../utils/graphVisibility'
import Sidebar from '../Sidebar'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

const BRANCHES = [
  { name: 'main', current: true, remote: false, commit: 'aaa1', label: 'main', upstream: 'origin/main', ahead: 5, behind: 0 },
  { name: 'behind-one', current: false, remote: false, commit: 'bbb2', label: 'behind', upstream: 'origin/behind-one', ahead: 0, behind: 3 },
  { name: 'level-one', current: false, remote: false, commit: 'ccc3', label: 'level', upstream: 'origin/level-one', ahead: 0, behind: 0 },
  { name: 'never-published', current: false, remote: false, commit: 'ddd4', label: 'new' },
  { name: 'cut-loose', current: false, remote: false, commit: 'eee5', label: 'gone', upstream: 'origin/cut-loose', gone: true, behind: 2 },
  // The remote side, so publishedNameFor can see what is published.
  { name: 'remotes/origin/main', current: false, remote: true, commit: 'aaa1', label: 'main' },
  { name: 'remotes/origin/behind-one', current: false, remote: true, commit: 'bbb9', label: 'behind' },
  { name: 'remotes/origin/level-one', current: false, remote: true, commit: 'ccc3', label: 'level' },
  { name: 'remotes/origin/cut-loose', current: false, remote: true, commit: 'eee5', label: 'gone' },
]

function draw(api: Record<string, any> = {}) {
  installMockGitAPI({
    getRemotes: jest.fn().mockResolvedValue({ remotes: [{ name: 'origin', fetchUrl: 'git@github.com:o/r.git', pushUrl: '' }] }),
    getReflog: jest.fn().mockResolvedValue({ entries: [] }),
    getSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
    listWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
    getWorkingChanges: jest.fn().mockResolvedValue({ staged: [], unstaged: [], untracked: [] }),
    pullBranch: jest.fn().mockResolvedValue({ success: true, moved: 3 }),
    ...api,
  })
  const props: Record<string, any> = {
    repoPath: '/repo', repoName: 'repo', currentBranch: 'main', view: 'branches',
    branches: BRANCHES, recentRepos: [], stashes: [], tags: [],
    soloBranch: null, visibility: emptyVisibility(),
    showToast: jest.fn(), showPrompt: jest.fn(), showConfirm: jest.fn(),
  }
  for (const k of [
    'onOpenRepo', 'onClone', 'onSetRepo', 'onCheckout', 'onCreateBranch',
    'onDeleteBranch', 'onMergeBranch', 'onRenameBranch', 'onRebaseOnto', 'onPushBranch',
    'onDeleteRemoteBranch', 'onSetUpstream', 'onCreateStash', 'onApplyStash', 'onPopStash',
    'onDropStash', 'onRefreshStashes', 'onCreateTag', 'onDeleteTag', 'onCheckoutTag', 'onGoTo',
    'onPushTag', 'onDeleteRemoteTag', 'onSelectCommit', 'onCompareBranch',
    'onToggleSolo', 'onToggleHide', 'onReveal', 'onPull', 'onRefresh',
  ]) props[k] = jest.fn()
  renderWithProviders(<Sidebar {...(props as any)} />)
  return props
}

/**
 * The LOCAL row with this name. A published branch wears its name twice — once
 * under LOCAL and once under REMOTE — and the two rows offer different acts,
 * which is the whole point.
 */
const localRow = (label: string) => {
  const row = screen.getAllByText(label)
    .map(node => node.closest('.sb-branch-item'))
    .find((el): el is HTMLElement => !!el && !el.classList.contains('remote'))
  if (!row) throw new Error(`no local row for ${label}`)
  return row
}
/** The acts drawn on one row, by the name each button says. */
const actsOn = (label: string) =>
  [...localRow(label).querySelectorAll('.sb-row-action')].map(b => b.getAttribute('title'))

beforeEach(() => localStorage.clear())

describe('what a branch row offers', () => {
  test('behind its upstream: a pull — on a branch you are NOT standing on', async () => {
    draw()
    await screen.findAllByText('behind-one')
    expect(actsOn('behind-one')).toEqual(['Switch', 'Pull'])
  })

  test('and that pull fast-forwards it by name, without switching to it', async () => {
    const p = draw()
    await screen.findAllByText('behind-one')
    await userEvent.click(localRow('behind-one').querySelector('.sb-row-action[title="Pull"]')!)
    await waitFor(() => expect((window.gitAPI as any).pullBranch).toHaveBeenCalledWith('behind-one'))
    // It is a fast-forward, not a checkout: nothing switched.
    expect(p.onGoTo).not.toHaveBeenCalled()
    expect(p.onCheckout).not.toHaveBeenCalled()
  })

  test('ahead, on the branch you are on: a push, and no switch to itself', async () => {
    draw()
    await screen.findAllByText('main')
    expect(actsOn('main')).toEqual(['Push'])
  })

  test('level with its upstream: nothing to sync, so no sync icon', async () => {
    draw()
    await screen.findAllByText('level-one')
    expect(actsOn('level-one')).toEqual(['Switch'])
  })

  test('never published: publish — which is a push, and wears its arrow', async () => {
    draw()
    await screen.findByText('never-published')
    expect(actsOn('never-published')).toEqual(['Switch', 'Publish'])
  })

  test('an upstream that is gone: nothing to sync with, whatever the counts say', async () => {
    draw()
    await screen.findAllByText('cut-loose')
    expect(actsOn('cut-loose')).toEqual(['Switch'])
  })
})
