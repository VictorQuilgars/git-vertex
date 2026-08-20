import { screen } from '@testing-library/react'
import Sidebar from '../Sidebar'
import { emptyVisibility } from '../../../utils/graphVisibility'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The two GitHub lists are sections of the left panel, not a view of their own:
// they are read beside the branches, and in the VS Code panel a tab would
// replace what is being worked on.
//
// The distinction these tests exist for: **absent** and **empty** are different
// answers. No GitHub here, or nothing to authenticate with, means no section at
// all — an empty section would claim we asked and there was nothing.

const base: any = {
  repoPath: '/r', repoName: 'r', currentBranch: 'main', branches: [], recentRepos: [],
  stashes: [], tags: [], soloBranch: null, visibility: emptyVisibility(),
  showToast: () => {}, showPrompt: async () => null, showConfirm: async () => true,
  onOpenRepo: () => {}, onClone: () => {}, onSetRepo: () => {}, onRemoveRecent: () => {},
  onCheckout: () => {}, onCreateBranch: () => {}, onDeleteBranch: () => {},
  onMergeBranch: () => {}, onRenameBranch: () => {}, onRebaseOnto: () => {},
  onPushBranch: () => {}, onDeleteRemoteBranch: () => {}, onSetUpstream: () => {},
  onCreateStash: () => {}, onApplyStash: () => {}, onPopStash: () => {}, onDropStash: () => {},
  onRefreshStashes: () => {}, onCreateTag: () => {}, onDeleteTag: () => {},
  onCheckoutTag: () => {}, onGoTo: () => {}, onPushTag: () => {}, onDeleteRemoteTag: () => {},
  onSelectCommit: () => {}, onCompareBranch: () => {}, onToggleSolo: () => {}, onToggleHide: () => {},
}

beforeEach(() => {
  installMockGitAPI({
    getReflog: jest.fn().mockResolvedValue({ entries: [] }),
    getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
    getSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
    getWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
    listWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
    listSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
    listAgents: jest.fn().mockResolvedValue({ agents: [] }),
  })
})

const draw = (props: any) => renderWithProviders(<Sidebar {...base} {...props} />)

describe('the GitHub sections of the sidebar', () => {
  test('no GitHub here means no sections at all', () => {
    draw({})
    expect(screen.queryByText('PULL REQUESTS')).not.toBeInTheDocument()
    expect(screen.queryByText('GITHUB ISSUES')).not.toBeInTheDocument()
  })

  // Asked, and there was nothing — which is not the same as not having asked.
  // The section is there with a zero on it; it stays folded, because there is
  // nothing behind it to look at.
  test('an empty list is still a section, with its zero', () => {
    draw({ githubPRs: [], githubIssues: [] })
    expect(screen.getByText('PULL REQUESTS')).toBeInTheDocument()
    expect(screen.getByText('GITHUB ISSUES')).toBeInTheDocument()
  })

  test('rows carry the number and the title, and a draft says it is one', () => {
    draw({
      githubPRs: [
        { number: 12, title: 'Fix the login', url: 'https://x/12' },
        { number: 13, title: 'Work in progress', url: 'https://x/13', draft: true },
      ],
      githubIssues: [{ number: 7, title: 'Crash on open', url: 'https://x/7' }],
    })
    expect(screen.getByText('#12')).toBeInTheDocument()
    expect(screen.getByText('Fix the login')).toBeInTheDocument()
    expect(screen.getByText(/draft/i)).toBeInTheDocument()
    expect(screen.getByText('Crash on open')).toBeInTheDocument()
  })

  test('one of the two can be present without the other', () => {
    draw({ githubIssues: [] })
    expect(screen.queryByText('PULL REQUESTS')).not.toBeInTheDocument()
    expect(screen.getByText('GITHUB ISSUES')).toBeInTheDocument()
  })
})
