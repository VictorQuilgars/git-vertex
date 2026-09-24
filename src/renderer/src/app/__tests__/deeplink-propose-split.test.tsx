import { act, renderHook } from '@testing-library/react'
import { useAppTabs } from '../useAppTabs'
import { installMockGitAPI } from '../../__tests__/test-utils'

// MCP propose_split (#88) reaches the renderer as a `propose-split` deep link
// whose proposal the main process has already read and inlined. What is under
// test is the hand-off: a readable plan becomes the composer's proposal (which
// opens it) with the working changes beside it; a missing or unreadable one is
// SAID — the agent has already told the user the split is waiting in the app.

const REPO = '/work/repo'

// The refusals also go to the console, for whoever reads the logs; not here.
beforeEach(() => { jest.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { jest.restoreAllMocks() })

function mount() {
  installMockGitAPI({
    setRepo: jest.fn().mockResolvedValue({ path: REPO, name: 'repo' }),
    getRecentRepos: jest.fn().mockResolvedValue([]),
  } as any)
  const app = {
    t: (key: string, ...args: unknown[]) => args.length ? `${key}(${args.join(',')})` : key,
    showToast: jest.fn(),
    repoPath: REPO, setRepoPath: jest.fn(), repoName: 'repo', setRepoName: jest.fn(),
    saveSnapshot: jest.fn(), restoreSnapshot: jest.fn().mockReturnValue(true), forgetRepo: jest.fn(),
    setCommits: jest.fn(), selectedCommit: null, setSelectedCommit: jest.fn(), setRecentRepos: jest.fn(),
    clearRepoView: jest.fn(), detectGithub: jest.fn().mockResolvedValue(undefined),
    rebaseHash: null, setRebaseHash: jest.fn(), setRebasePlanProposal: jest.fn(),
    conflictResolverFile: null, setConflictResolverFile: jest.fn(), setConflictResolverProposal: jest.fn(),
    setCommitProposal: jest.fn(), setComposerProposal: jest.fn(),
  }
  const { result } = renderHook(() => useAppTabs(app as any))
  const follow = (link: Record<string, unknown>) =>
    act(async () => { await result.current.applyDeepLink({ repo: REPO, view: 'propose-split', ...link } as any) })
  return { app, follow }
}

describe('deep link view=propose-split', () => {
  test('a readable plan becomes the composer\'s proposal, with the working changes selected', async () => {
    const { app, follow } = mount()
    const commits = [
      { message: 'feat: a', files: ['src/a.ts'] },
      { message: 'docs: b', files: ['README.md'] },
    ]
    await follow({ proposalContent: JSON.stringify({ kind: 'split', commits }) })

    expect(app.setComposerProposal).toHaveBeenCalledWith({ id: expect.any(Number), repo: REPO, groups: commits })
    expect(app.setSelectedCommit).toHaveBeenLastCalledWith(expect.objectContaining({ hash: '__WIP__' }))
    expect(app.showToast).not.toHaveBeenCalled()
  })

  test('a link that arrives without its proposal says so', async () => {
    const { app, follow } = mount()
    await follow({})
    expect(app.setComposerProposal).not.toHaveBeenCalled()
    expect(app.showToast).toHaveBeenCalledWith('deeplink.missing(deeplink.what.splitPlan)', 'err')
  })

  test.each([
    ['not JSON', 'nope'],
    ['no commits', JSON.stringify({ kind: 'split', commits: [] })],
    ['a commit without files', JSON.stringify({ kind: 'split', commits: [{ message: 'x' }] })],
  ])('an unreadable proposal (%s) is refused out loud', async (_what, proposalContent) => {
    const { app, follow } = mount()
    await follow({ proposalContent })
    expect(app.setComposerProposal).not.toHaveBeenCalled()
    expect(app.showToast).toHaveBeenCalledWith('deeplink.unreadable(deeplink.what.splitPlanCap)', 'err')
  })
})
