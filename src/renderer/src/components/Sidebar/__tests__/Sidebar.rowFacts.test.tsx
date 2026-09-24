// What a branch, tag and stash row say beyond a name (#278): the facts the
// list calls already carry, drawn without asking git anything per row.
import { screen, waitFor } from '@testing-library/react'
import { emptyVisibility } from '../../../utils/graphVisibility'
import Sidebar from '../Sidebar'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'
import { ageOf, branchTooltip, prForBranch, stashFacts, stashLabel, stashTooltip, tagTooltip } from '../rowFacts'
import { translations } from '../../../i18n/translations'

const NOW = Date.parse('2026-09-24T12:00:00Z')
const DAY = 86_400
const secondsAgo = (s: number) => Math.floor(NOW / 1000) - s
const en = translations.en as Record<string, any>
const t = (key: string, ...args: any[]) => {
  const v = en[key]
  return typeof v === 'function' ? v(...args) : (v ?? key)
}

beforeEach(() => { jest.spyOn(Date, 'now').mockReturnValue(NOW) })
afterEach(() => { jest.restoreAllMocks() })

describe('rowFacts — the wording, without a side bar', () => {
  test('an age is the side bar\'s short form, and nothing without a date', () => {
    expect(ageOf(secondsAgo(3 * DAY), t)).toBe('3d')
    expect(ageOf(secondsAgo(2 * 3600), t)).toBe('2h')
    expect(ageOf(secondsAgo(10), t)).toBe('just now')
    expect(ageOf(undefined, t)).toBeNull()
    expect(ageOf(0, t)).toBeNull()
  })

  test('a branch tooltip says what it tracks, its pull request, its worktree and its age', () => {
    const tip = branchTooltip({
      name: 'feat/x', current: false, upstream: 'origin/feat/x', ahead: 2, behind: 1,
      date: secondsAgo(5 * DAY), checkedOutIn: { name: 'review' },
      pr: { number: 42, title: 'Cards everywhere' },
    }, t)
    expect(tip.split('\n')).toEqual([
      'feat/x',
      'Tracks origin/feat/x: 2 ahead, 1 behind',
      'Pull request #42: Cards everywhere',
      'Checked out in worktree review',
      'Last commit: 5d',
      t('sb.branch.hint'),
    ])
  })

  test('the tracking line covers level, gone and untracked, and a remote row has none', () => {
    expect(branchTooltip({ name: 'main', current: true, upstream: 'origin/main' }, t).split('\n'))
      .toEqual(['main (current branch)', 'Tracks origin/main, up to date'])
    expect(branchTooltip({ name: 'old', current: false, upstream: 'origin/old', gone: true }, t))
      .toContain('Tracks origin/old, which is gone from the remote')
    expect(branchTooltip({ name: 'local', current: false }, t)).toContain('Tracks no remote branch')
    expect(branchTooltip({ name: 'remotes/origin/x', current: false, remote: true }, t).split('\n'))
      .toEqual(['origin/x', t('sb.branch.hint')])
    expect(branchTooltip({ name: 'd', current: false, upstream: 'origin/d', pr: { number: 7, title: 'WIP', draft: true } }, t))
      .toContain('Draft pull request #7: WIP')
  })

  test('the pull request is the open one whose head is the branch', () => {
    const prs = [
      { number: 1, title: 'other', headRef: 'feat/y' },
      { number: 2, title: 'mine', headRef: 'feat/x', draft: true },
    ]
    expect(prForBranch('feat/x', prs)).toEqual({ number: 2, title: 'mine', draft: true })
    expect(prForBranch('main', prs)).toBeUndefined()
    expect(prForBranch('feat/x', undefined)).toBeUndefined()
  })

  test('a stash row drops the branch prefix it names beside it — and only that branch\'s', () => {
    expect(stashLabel({ message: 'On main: tidy', branch: 'main' })).toBe('tidy')
    expect(stashLabel({ message: 'stash@{0}: WIP on main: 1a2b3c4 fix', branch: 'main' })).toBe('1a2b3c4 fix')
    expect(stashLabel({ message: 'renamed', branch: 'main' })).toBe('renamed')
    expect(stashLabel({ message: 'On other: x', branch: 'main' })).toBe('On other: x')
    expect(stashLabel({ message: 'On main: x' })).toBe('On main: x')
    expect(stashFacts({ branch: 'main', date: secondsAgo(DAY) }, t)).toBe('main · 1d')
    expect(stashFacts({ date: secondsAgo(DAY) }, t)).toBe('1d')
    expect(stashFacts({}, t)).toBeNull()
    expect(stashTooltip({ message: 'On main: tidy', branch: 'main', date: secondsAgo(DAY) }, t, false).split('\n'))
      .toEqual(['On main: tidy', 'Made on main', 'Made: 1d'])
  })

  test('a tag tooltip carries its annotation', () => {
    expect(tagTooltip({ name: 'v1', hash: 'abc1234', message: 'First release', date: secondsAgo(2 * DAY) }, t, false).split('\n'))
      .toEqual(['v1 → abc1234', 'First release', 'Tagged: 2d'])
    expect(tagTooltip({ name: 'light', hash: 'abc1234' }, t, false)).toBe('light → abc1234')
  })
})

function draw(overrides: Record<string, any> = {}, worktrees: any[] = []) {
  installMockGitAPI({
    getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
    getReflog: jest.fn().mockResolvedValue({ entries: [] }),
    getSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
    listWorktrees: jest.fn().mockResolvedValue({ worktrees }),
    getWorkingChanges: jest.fn().mockResolvedValue({ staged: [], unstaged: [], untracked: [] }),
  })
  const props: Record<string, any> = {
    repoPath: '/repo', repoName: 'repo', currentBranch: 'main',
    branches: [], recentRepos: [], stashes: [], tags: [],
    soloBranch: null, visibility: emptyVisibility(),
    showToast: jest.fn(), showPrompt: jest.fn().mockResolvedValue(null), showConfirm: jest.fn(),
  }
  for (const k of [
    'onOpenRepo', 'onClone', 'onSetRepo', 'onCheckout', 'onCreateBranch',
    'onDeleteBranch', 'onMergeBranch', 'onRenameBranch', 'onRebaseOnto', 'onPushBranch',
    'onDeleteRemoteBranch', 'onSetUpstream', 'onCreateStash', 'onApplyStash', 'onPopStash',
    'onDropStash', 'onRefreshStashes', 'onCreateTag', 'onDeleteTag', 'onCheckoutTag', 'onGoTo',
    'onPushTag', 'onDeleteRemoteTag', 'onSelectCommit', 'onCompareBranch',
    'onToggleSolo', 'onToggleHide',
  ]) props[k] = jest.fn()
  Object.assign(props, overrides)
  renderWithProviders(<Sidebar {...(props as any)} />)
  return props
}

describe('Sidebar — the rows carry their facts', () => {
  test('a tag row shows its annotation; a lightweight one shows none', async () => {
    draw({
      view: 'tags',
      tags: [
        { name: 'v2', hash: 'b4e1f37', annotated: true, message: 'Second release', date: secondsAgo(DAY) },
        { name: 'light', hash: 'a77e361' },
      ],
    })
    await waitFor(() => expect(screen.getByText('v2')).toBeInTheDocument())
    expect(screen.getByText('Second release')).toHaveClass('sb-tag-msg')
    const lightRow = screen.getByText('light').closest('.sb-tag-item')!
    expect(lightRow.querySelector('.sb-tag-msg')).toBeNull()
    expect(screen.getByText('v2').closest('.sb-tag-item')!.getAttribute('title')).toContain('Second release')
  })

  test('a stash row names the branch it was made on, and its age', async () => {
    draw({
      view: 'stash',
      stashes: [{ index: 0, message: 'On feat/x: tidy up', branch: 'feat/x', date: secondsAgo(3 * DAY) }],
    })
    await waitFor(() => expect(screen.getByText('tidy up')).toBeInTheDocument())
    expect(screen.getByText('feat/x · 3d')).toHaveClass('sb-row-facts')
    const title = screen.getByText('tidy up').closest('.sb-stash-item')!.getAttribute('title')!
    expect(title).toContain('On feat/x: tidy up')
    expect(title).toContain('Made on feat/x')
  })

  test('a branch row shows its tip\'s age, a mark when another worktree holds it, and a tooltip', async () => {
    draw({
      view: 'branches',
      branches: [
        { name: 'main', current: true, remote: false, commit: 'a', label: 's', upstream: 'origin/main', date: secondsAgo(2 * 3600) },
        { name: 'topic', current: false, remote: false, commit: 'b', label: 's', upstream: 'origin/topic', ahead: 1, behind: 0, date: secondsAgo(4 * DAY) },
      ],
      githubPRs: [{ number: 12, title: 'Cards', url: 'u', headRef: 'topic' }],
    }, [
      { path: '/repo', branch: 'main', head: 'h0', isMain: true, locked: false },
      { path: '/wt/review', branch: 'topic', head: 'h1', isMain: false, locked: false },
    ])
    await waitFor(() => expect(screen.getByText('topic')).toBeInTheDocument())
    const row = screen.getByText('topic').closest('.sb-branch-item')!
    expect(row.querySelector('.sb-branch-age')!.textContent).toBe('4d')
    await waitFor(() => expect(row.querySelector('.sb-branch-wt')).not.toBeNull())
    const title = row.getAttribute('title')!
    expect(title).toContain('Tracks origin/topic: 1 ahead, 0 behind')
    expect(title).toContain('Pull request #12: Cards')
    expect(title).toContain('Checked out in worktree review')
    // The branch on screen is held by THIS worktree: no mark.
    const main = screen.getByText('main').closest('.sb-branch-item')!
    expect(main.querySelector('.sb-branch-wt')).toBeNull()
    expect(main.querySelector('.sb-branch-age')!.textContent).toBe('2h')
  })
})
