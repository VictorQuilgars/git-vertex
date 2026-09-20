import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import RefCard from '../RefCard'
import { LanguageProvider } from '../../../i18n/LanguageContext'
import { SettingsProvider } from '../../../contexts/SettingsContext'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// A chip's card: the facts for a local branch, a remote-only branch and an
// annotated tag — and the actions that fit each, and only those.

const H = (c: string) => c.repeat(40)
const branches = [
  { name: 'main', current: false, remote: false, commit: 'mmmmmmm', label: 'on main', upstream: 'origin/main' },
  { name: 'feature/login', current: true, remote: false, commit: 'fffffff', label: 'add the form', upstream: 'origin/feature/login', ahead: 2, behind: 1, date: Math.floor(Date.now() / 1000) - 3 * 86400 },
  { name: 'spike', current: false, remote: false, commit: 'sssssss', label: 'try it' },
  { name: 'remotes/origin/only-there', current: false, remote: true, commit: 'ooooooo', label: 'theirs' },
] as any[]

function draw(target: any, api: Record<string, jest.Mock> = {}, over: Record<string, any> = {}) {
  installMockGitAPI({
    compareBranches: jest.fn().mockResolvedValue({ ahead: [{}, {}], behind: [{}, {}, {}] }),
    predictConflicts: jest.fn().mockResolvedValue({ files: [] }),
    listWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
    getTagDetails: jest.fn().mockResolvedValue({ tag: null }),
    isTagOnRemote: jest.fn().mockResolvedValue({ pushed: null, remote: null }),
    ...api,
  } as any)
  const handlers = Object.fromEntries(['onClose', 'onSwitch', 'onPull', 'onPush', 'onFetch', 'onPushBranch', 'onSetUpstream',
    'onCompare', 'onMerge', 'onRebase', 'onOpenOnRemote', 'onDelete', 'onDeleteRemote', 'onOpenPR', 'onCreatePR',
    'onPushTag', 'onDeleteTag', 'onCheckoutTag', 'onCreateBranchAt'].map(k => [k, jest.fn()]))
  const props = { target, branches, currentBranch: 'feature/login', defaultBranch: 'main', ...handlers, ...over }
  const view = renderWithProviders(<RefCard {...(props as any)} />)
  return { ...props, rerenderCard: (overrides: Record<string, unknown>) => view.rerender(<LanguageProvider><SettingsProvider><RefCard {...({ ...props, ...overrides } as any)} /></SettingsProvider></LanguageProvider>) } as Record<string, jest.Mock> & typeof props
}
const buttons = () => Array.from(document.querySelectorAll('.refcard-btn')).map(b => b.textContent)
const steps = () => Array.from(document.querySelectorAll('.refcard-step-label')).map(s => s.textContent)

describe('a local branch', () => {
  test('the checked-out branch: its upstream, how far, and what fits — then the merge target and its verdict', async () => {
    const p = draw({ kind: 'head', name: 'feature/login', hash: H('f') }, {},
      { tip: { hash: H('f'), message: 'add the form', author: 'Ada', date: '2026-09-15T10:00:00' }, pr: { number: 42, title: 'Login' }, issue: { key: '7', provider: 'github' } })
    expect(screen.getByRole('dialog', { name: 'Branch feature/login' })).toBeTruthy()
    // Upstream card: named, diverged, and the three buttons of a branch that is both ahead and behind.
    expect(document.querySelector('.refcard-token')?.textContent).toBe('origin/feature/login')
    expect(document.querySelector('.refcard-track')?.textContent).toBe('1↓ 2↑')
    expect(screen.getByText('Diverged')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('No Conflicts')).toBeTruthy())
    expect(screen.getByText('Behind main by 3 commits')).toBeTruthy()
    // Force Push has no handler here: a button that can do nothing is not drawn.
    expect(buttons()).toEqual(expect.arrayContaining(['Pull', 'Fetch', 'Merge', 'Rebase']))
    expect(buttons()).not.toContain('Force Push')
    // The strip: its issue, its pull request.
    expect(document.querySelector('.refcard-strip')?.textContent).toContain('#7')
    expect(document.querySelector('.refcard-pill--pr')?.textContent?.trim()).toBe('#42Open')
    // The last commit, and no way to switch to, compare with or delete the branch one is on.
    expect(document.querySelector('.refcard-last-row')?.textContent).toContain('add the form')
    expect(document.querySelector('.refcard-last-row')?.textContent).toContain('Ada')
    expect(steps()).toEqual(['Pull Request #42 · Open: Login'])
    fireEvent.click(screen.getByText('Merge'))
    expect(p.onMerge).toHaveBeenCalledWith('main')
    // The target first: compareBranches(a, b) counts what B has over a.
    expect((window as any).gitAPI.compareBranches).toHaveBeenCalledWith('main', 'feature/login')
    expect((window as any).gitAPI.predictConflicts).toHaveBeenCalledWith('feature/login', 'main')
  })

  test('conflicts are the one filled verdict', async () => {
    draw({ kind: 'head', name: 'feature/login', hash: H('f') }, { predictConflicts: jest.fn().mockResolvedValue({ files: ['a.ts', 'b.ts'] }) })
    const chip = await waitFor(() => screen.getByText('2 Conflicts'))
    expect(chip.className).toContain('refcard-verdict--conflicts')
    expect(chip.getAttribute('title')).toBe('Merging into main will conflict in 2 files')
  })

  test('another branch, unpublished: publish, switch, compare, merge, rebase, delete', async () => {
    const p = draw({ kind: 'head', name: 'spike', hash: H('s') })
    expect(screen.getByText('Unpublished')).toBeTruthy()
    expect(document.querySelector('.refcard-track')).toBeNull()
    expect(buttons()).toContain('Publish')
    expect(steps()).toEqual([
      'Switch to spike', 'Compare with feature/login', 'Merge spike into feature/login',
      'Rebase feature/login onto spike', 'Delete spike',
    ])
    fireEvent.click(screen.getByText('Publish'))
    expect(p.onPushBranch).toHaveBeenCalledWith('spike')
    fireEvent.click(screen.getByText('Switch'))
    expect(p.onSwitch).toHaveBeenCalledWith('spike')
  })

  test('publishing the current branch establishes tracking and the open card follows refreshed facts', async () => {
    const unpublished = branches.map(b => b.name === 'feature/login'
      ? { ...b, upstream: undefined, ahead: 0, behind: 0 } : b)
    const p = draw({ kind: 'head', name: 'feature/login', hash: H('f') }, {}, { branches: unpublished })
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    expect(p.onPushBranch).toHaveBeenCalledWith('feature/login')
    expect(p.onPush).not.toHaveBeenCalled()

    // Publishing changes config, not the tip: a refresh must update this same card.
    p.rerenderCard({ branches: unpublished.map(b => b.name === 'feature/login'
      ? { ...b, upstream: 'origin/feature/login' } : b) })
    await waitFor(() => expect(screen.queryByText('Unpublished')).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()
    expect(document.querySelector('.refcard-token')).toHaveTextContent('origin/feature/login')
    await waitFor(() => expect(screen.getByText('No Conflicts')).toBeInTheDocument())
  })

  test('republishing the current branch also uses the tracking-aware action', async () => {
    const p = draw({ kind: 'head', name: 'feature/login', hash: H('f') }, {}, {
      branches: branches.map(b => b.name === 'feature/login' ? { ...b, gone: true } : b),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    expect(p.onPushBranch).toHaveBeenCalledWith('feature/login')
    expect(p.onPush).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText('No Conflicts')).toBeInTheDocument())
  })

  test('an ordinary push on a tracked current branch keeps its configured destination', async () => {
    const p = draw({ kind: 'head', name: 'feature/login', hash: H('f') }, {}, {
      branches: branches.map(b => b.name === 'feature/login' ? { ...b, behind: 0 } : b),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Push' }))
    expect(p.onPush).toHaveBeenCalledTimes(1)
    expect(p.onPushBranch).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText('No Conflicts')).toBeInTheDocument())
  })

  test('merged into its target: safe to delete, and deleting is the card\'s own button', async () => {
    draw({ kind: 'head', name: 'spike', hash: H('s') }, { compareBranches: jest.fn().mockResolvedValue({ ahead: [], behind: [{}, {}] }) })
    await waitFor(() => expect(screen.getByText('Merged')).toBeTruthy())
    expect(screen.getByText('Safe to delete')).toBeTruthy()
    expect(buttons()).toContain('Delete Branch')
    expect(steps()).not.toContain('Delete spike')
  })

  describe('deleting a branch that is on the remote too', () => {
    const tracked = [...branches, { name: 'fix/draft', current: false, remote: false, commit: 'ddddddd', label: 'the fix', upstream: 'origin/fix/draft' }]
    // Merged into main here; origin/main has it or not, as asked.
    const compare = (onRemote: boolean) => jest.fn(async (a: string) => a === 'origin/main'
      ? { ahead: onRemote ? [] : [{}], behind: [] }
      : { ahead: [], behind: [{}] })

    test('one button, three choices: this end, the remote end, or both', async () => {
      const p = draw({ kind: 'head', name: 'fix/draft', hash: H('d') }, { compareBranches: compare(true) },
        { branches: tracked, onDeleteBoth: jest.fn() })
      await waitFor(() => expect(screen.getByText('Safe to delete')).toBeTruthy())
      const open = async () => { fireEvent.click(screen.getByRole('button', { name: 'Delete Branch' })); await screen.findByRole('menu') }
      await open()
      expect(p.onDelete).not.toHaveBeenCalled()
      expect(Array.from(document.querySelectorAll('.ctx-menu [role="menuitem"]')).map(r => r.textContent))
        .toEqual(['Delete fix/draft', 'Delete origin/fix/draft', 'Delete fix/draft and origin/fix/draft'])
      fireEvent.click(screen.getByText('Delete fix/draft and origin/fix/draft'))
      expect(p.onDeleteBoth).toHaveBeenCalledWith('fix/draft', 'origin/fix/draft')

      await open()
      fireEvent.click(screen.getByText('Delete origin/fix/draft'))
      expect(p.onDeleteRemote).toHaveBeenCalledWith('remotes/origin/fix/draft')
      expect(p.onDelete).not.toHaveBeenCalled()

      await open()
      fireEvent.click(screen.getByText('Delete fix/draft'))
      expect(p.onDelete).toHaveBeenCalledWith('fix/draft')
    })

    test('merged, a branch has nothing left to fetch: Delete is what is left', async () => {
      draw({ kind: 'head', name: 'fix/draft', hash: H('d') }, { compareBranches: compare(true) }, { branches: tracked, onDeleteBoth: jest.fn() })
      await waitFor(() => expect(screen.getByText('Safe to delete')).toBeTruthy())
      expect(buttons()).not.toContain('Fetch')
    })

    test('merged only here, with its pull request open: said, before the remote end is chosen', async () => {
      const p = draw({ kind: 'head', name: 'fix/draft', hash: H('d') }, { compareBranches: compare(false) },
        { branches: tracked, onDeleteBoth: jest.fn(), pr: { number: 266, title: 'The fix' } })
      await waitFor(() => expect(screen.getByText('Not on origin/main yet')).toBeTruthy())
      expect(screen.queryByText('Safe to delete')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Delete Branch' }))
      // Every choice that touches the remote carries the cost; the local one does not.
      expect(await screen.findByText('Delete origin/fix/draft — closes PR #266 · not on origin/main yet')).toBeTruthy()
      expect(screen.getByText('Delete fix/draft')).toBeTruthy()
      fireEvent.click(screen.getByText('Delete fix/draft and origin/fix/draft — closes PR #266 · not on origin/main yet'))
      expect(p.onDeleteBoth).toHaveBeenCalledWith('fix/draft', 'origin/fix/draft')
    })

    test('an upstream the remote no longer has is no choice: deleting is the branch alone', async () => {
      const gone = [...branches, { name: 'fix/draft', current: false, remote: false, commit: 'ddddddd', label: 'the fix', upstream: 'origin/fix/draft', gone: true }]
      const p = draw({ kind: 'head', name: 'fix/draft', hash: H('d') }, {}, { branches: gone, onDeleteBoth: jest.fn() })
      fireEvent.click(screen.getByText('Delete Local Branch'))
      expect(p.onDelete).toHaveBeenCalledWith('fix/draft')
      expect(p.onDeleteBoth).not.toHaveBeenCalled()
    })
  })

  test('the default branch merges into nothing, so it has no such card — and is not deleted from here', () => {
    draw({ kind: 'head', name: 'main', hash: H('m') })
    expect(screen.queryByText('Merges into')).toBeNull()
    expect((window as any).gitAPI.compareBranches).not.toHaveBeenCalled()
    expect(steps()).toContain('Switch to main')
    expect(steps()).not.toContain('Delete main')
  })

  test('checked out in another worktree: said, and not offered as a switch', async () => {
    draw({ kind: 'head', name: 'spike', hash: H('s') },
      { listWorktrees: jest.fn().mockResolvedValue({ worktrees: [{ path: '/code/repo-spike', branch: 'refs/heads/spike', isMain: false }] }) })
    await waitFor(() => expect(steps()).toContain('In worktree · repo-spike'))
    expect(steps()).not.toContain('Switch to spike')
  })
})

describe('the request a branch carried, whatever its state', () => {
  const REPO = { owner: 'o', repo: 'r' }
  const ghPR = (over: Record<string, any>) => ({
    number: 248, title: 'Release app 1.37.0', state: 'merged', url: 'https://github.com/o/r/pull/248',
    headRef: 'release/1.37', headSha: H('r'), baseRef: 'main', author: 'victor', updatedAt: '', mergedAt: '2026-09-18T12:00:00Z', ...over,
  })
  const release = (over: Record<string, any> = {}) => [...branches, { name: 'release/1.37', current: false, remote: false, commit: 'rrrrrrr', label: 'release', upstream: 'origin/release/1.37', ...over }]
  // git's view of a squash-merged branch: its commits are not in main.
  const unmerged = { compareBranches: jest.fn().mockResolvedValue({ ahead: [{}, {}], behind: new Array(18).fill({}) }), predictConflicts: jest.fn().mockResolvedValue({ files: [] }) }

  test('an old request is shown with its state, and opens in the app\'s own sheet', async () => {
    const p = draw({ kind: 'head', name: 'release/1.37', hash: H('x') },
      { ...unmerged, githubBranchPRs: jest.fn().mockResolvedValue({ prs: [ghPR({ headSha: H('z') })] }) }, { branches: release(), githubRepo: REPO })
    await waitFor(() => expect(document.querySelector('.refcard-pill--merged')?.textContent?.trim()).toBe('#248Merged'))
    expect((window as any).gitAPI.githubBranchPRs).toHaveBeenCalledWith('o', 'r', 'release/1.37')
    expect(steps()).toContain('Pull Request #248 · Merged: Release app 1.37.0')
    fireEvent.click(screen.getByText('View'))
    expect(p.onOpenPR).toHaveBeenCalledWith(248, { title: 'Release app 1.37.0', url: 'https://github.com/o/r/pull/248' })
  })

  test('merged by its request from this very tip: merged, and gone from the remote for that reason — nothing to publish', async () => {
    draw({ kind: 'head', name: 'release/1.37', hash: H('r') },
      { ...unmerged, githubBranchPRs: jest.fn().mockResolvedValue({ prs: [ghPR({})] }) },
      { branches: release({ gone: true }), githubRepo: REPO })
    await waitFor(() => expect(screen.getByText('By PR #248 · Safe to delete')).toBeTruthy())
    expect(document.querySelector('.refcard-verdict--merged')?.textContent).toBe('Merged')
    expect(screen.getByText('Deleted from the remote when PR #248 was merged')).toBeTruthy()
    expect(buttons()).toContain('Delete Local Branch')
    expect(buttons()).not.toContain('Publish')
    expect(steps()).not.toContain('Create a Pull Request')
  })

  test('without the request, git cannot tell: the branch stays unmerged, and publishing is offered', async () => {
    draw({ kind: 'head', name: 'release/1.37', hash: H('r') }, unmerged, { branches: release({ gone: true }) })
    await waitFor(() => expect(screen.getByText('No Conflicts')).toBeTruthy())
    expect(buttons()).toEqual(expect.arrayContaining(['Delete Local Branch', 'Publish']))
  })

  test('commits after the merge: the request is shown, the branch is not called merged, and a new request is offered', async () => {
    draw({ kind: 'head', name: 'release/1.37', hash: H('n') },
      { ...unmerged, githubBranchPRs: jest.fn().mockResolvedValue({ prs: [ghPR({})] }) }, { branches: release(), githubRepo: REPO })
    await waitFor(() => expect(steps()).toContain('Pull Request #248 · Merged: Release app 1.37.0'))
    expect(screen.queryByText('By PR #248 · Safe to delete')).toBeNull()
    expect(steps()).toContain('Create a Pull Request')
  })

  test('an open request is preferred to a newer closed one', async () => {
    draw({ kind: 'head', name: 'release/1.37', hash: H('n') },
      { ...unmerged, githubBranchPRs: jest.fn().mockResolvedValue({ prs: [ghPR({ number: 251, state: 'closed', mergedAt: null }), ghPR({ number: 250, state: 'draft', mergedAt: null })] }) },
      { branches: release(), githubRepo: REPO })
    await waitFor(() => expect(document.querySelector('.refcard-pill--draft')?.textContent?.trim()).toBe('#250Draft'))
    expect(steps()).not.toContain('Create a Pull Request')
  })
})

describe('a remote-only branch', () => {
  test('no relationship cards: a way to land on it, to compare, to delete it there', () => {
    const p = draw({ kind: 'remote', name: 'origin/only-there', hash: H('o') })
    expect(screen.getByRole('dialog', { name: 'Remote branch origin/only-there' })).toBeTruthy()
    expect(document.querySelector('.refcard-cards')).toBeNull()
    expect(steps()).toEqual(['Switch to origin/only-there', 'Compare with feature/login', 'Delete origin/only-there from its remote'])
    fireEvent.click(screen.getByTitle('Open Branch on Remote'))
    expect(p.onOpenOnRemote).toHaveBeenCalledWith('only-there')
    // `origin/only-there` alone is read as a branch of that name on the default remote.
    fireEvent.click(screen.getByText('Delete…'))
    expect(p.onDeleteRemote).toHaveBeenCalledWith('remotes/origin/only-there')
  })

  test('tracked by a local branch: its Delete offers that one too', async () => {
    const withLocal = [...branches, { name: 'remotes/origin/fix/draft', current: false, remote: true, commit: 'ddddddd', label: 'the fix' },
      { name: 'fix/draft', current: false, remote: false, commit: 'ddddddd', label: 'the fix', upstream: 'origin/fix/draft' }]
    const p = draw({ kind: 'remote', name: 'origin/fix/draft', hash: H('d') }, {}, { branches: withLocal, onDeleteBoth: jest.fn() })
    fireEvent.click(screen.getByText('Delete…'))
    await screen.findByRole('menu')
    expect(Array.from(document.querySelectorAll('.ctx-menu [role="menuitem"]')).map(r => r.textContent))
      .toEqual(['Delete origin/fix/draft', 'Delete fix/draft and origin/fix/draft'])
    fireEvent.click(screen.getByText('Delete fix/draft and origin/fix/draft'))
    expect(p.onDeleteBoth).toHaveBeenCalledWith('fix/draft', 'origin/fix/draft')
  })
})

describe('a tag', () => {
  const annotated = { name: 'v1.2.0', commit: H('c'), annotated: true, message: 'The September release\n\nWith notes.', tagger: 'Grace', date: Math.floor(Date.now() / 1000) - 86400 }

  test('annotated: the commit, who tagged it and what they wrote, whether the remote has it', async () => {
    const p = draw({ kind: 'tag', name: 'v1.2.0', hash: H('c') }, {
      getTagDetails: jest.fn().mockResolvedValue({ tag: annotated }),
      isTagOnRemote: jest.fn().mockResolvedValue({ pushed: false, remote: 'origin' }),
    }, { tip: { hash: H('c'), message: 'cut the release', author: 'Ada', date: '2026-09-15T10:00:00' } })
    expect(document.querySelector('.refcard-sha')?.textContent).toBe('ccccccc')
    expect(document.querySelector('.refcard-strip-text')?.textContent).toBe('cut the release')
    await waitFor(() => expect(screen.getByText('Grace')).toBeTruthy())
    expect(document.querySelector('.refcard-annotation-text')?.textContent).toBe('The September release\n\nWith notes.')
    await waitFor(() => expect(screen.getByText('Not on origin yet')).toBeTruthy())
    expect(steps()).toEqual(['Compare with feature/login', 'Create Branch from v1.2.0', 'Switch to v1.2.0 (Detached)', 'Push v1.2.0 to a remote', 'Delete v1.2.0'])
    fireEvent.click(screen.getByText('Push…'))
    expect(p.onPushTag).toHaveBeenCalledWith('v1.2.0')
  })

  test('already on the remote: said, and pushing is not offered again', async () => {
    draw({ kind: 'tag', name: 'v1.2.0', hash: H('c') }, {
      getTagDetails: jest.fn().mockResolvedValue({ tag: annotated }),
      isTagOnRemote: jest.fn().mockResolvedValue({ pushed: true, remote: 'origin' }),
    })
    await waitFor(() => expect(screen.getByText('On origin')).toBeTruthy())
    expect(steps()).not.toContain('Push v1.2.0 to a remote')
  })

  test('lightweight: said so, and nobody to name', async () => {
    draw({ kind: 'tag', name: 'light', hash: H('c') }, { getTagDetails: jest.fn().mockResolvedValue({ tag: { name: 'light', commit: H('c'), annotated: false } }) })
    await waitFor(() => expect(screen.getByText(/A lightweight tag/)).toBeTruthy())
    expect(document.querySelector('.refcard-annotation')).toBeNull()
  })
})

describe('closing', () => {
  test('the close button, the scrim and Escape all close it', async () => {
    const p = draw({ kind: 'head', name: 'spike', hash: H('s') })
    fireEvent.click(screen.getByTitle('Close'))
    fireEvent.mouseDown(document.querySelector('.refcard-scrim')!)
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(p.onClose).toHaveBeenCalledTimes(3)
  })
})
