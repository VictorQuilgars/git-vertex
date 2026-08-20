import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

// The rows themselves are the shared GithubRow, compact — the same component
// the GitHub tab mounts. These hold the compact contract: the data the
// endpoints return is shown, and every affordance exists only when its
// handler does.
describe('the rows carry what the endpoints return', () => {
  const rich = {
    number: 42, title: 'Speed up the graph', url: 'https://x/42',
    author: 'alice', createdAt: new Date(Date.now() - 2 * 86400_000).toISOString(),
    comments: 3, labels: [{ name: 'perf', color: '00ff00' }, { name: 'P1', color: 'ff0000' }],
  }

  test('author, age and comment count are on the second line', () => {
    draw({ githubIssues: [rich] })
    expect(screen.getByText('@alice')).toBeInTheDocument()
    expect(screen.getByText(/2\s?d|2 j/)).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  test('labels are dots, their names a tooltip away', () => {
    draw({ githubIssues: [rich] })
    const dots = screen.getByTitle('perf, P1')
    expect(dots.querySelectorAll('.sb-gh-dot')).toHaveLength(2)
  })

  // A host still sending the narrow shape gets the narrow row — no empty
  // separators claiming metadata that never arrived.
  test('the narrow shape renders without a meta line', () => {
    draw({ githubIssues: [{ number: 7, title: 'Crash on open', url: 'https://x/7' }] })
    expect(screen.getByText('Crash on open')).toBeInTheDocument()
    expect(document.querySelector('.sb-gh-meta')).not.toBeInTheDocument()
  })

  test('a PR and an issue carry different state icons, and a draft is greyed', () => {
    draw({
      githubPRs: [{ number: 1, title: 'Open', url: 'u' }, { number: 2, title: 'Draft', url: 'u2', draft: true }],
      githubIssues: [rich],
    })
    expect(document.querySelectorAll('.sb-gh-state')).toHaveLength(3)
    expect(document.querySelectorAll('.sb-gh-state--draft')).toHaveLength(1)
  })
})

describe('the affordances follow their handlers', () => {
  const issue = { number: 9, title: 'The bug', url: 'https://x/9' }

  test('right-click on an issue offers the branch only when the host can create one', async () => {
    draw({ githubIssues: [issue], onStartBranchFromIssue: undefined })
    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('The bug') })
    expect(screen.queryByText(/Branch for This Issue/i)).not.toBeInTheDocument()
  })

  test('with the handler, the menu creates the branch from that issue', async () => {
    const onStartBranchFromIssue = jest.fn()
    draw({ githubIssues: [issue], onStartBranchFromIssue })
    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('The bug') })
    const entry = await screen.findByText(/Branch for This Issue/i)
    await userEvent.click(entry)
    expect(onStartBranchFromIssue).toHaveBeenCalledWith({ number: 9, title: 'The bug', url: 'https://x/9' })
  })

  test('clicking a row goes through the open handler, not straight to a browser', async () => {
    const onOpenGithubItem = jest.fn()
    draw({ githubIssues: [issue], onOpenGithubItem })
    await userEvent.click(screen.getByText('The bug'))
    expect(onOpenGithubItem).toHaveBeenCalledWith('https://x/9')
  })

  test('a pull request row never offers a branch menu', async () => {
    draw({ githubPRs: [{ number: 3, title: 'A PR', url: 'u3' }], onStartBranchFromIssue: jest.fn() })
    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('A PR') })
    expect(screen.queryByText(/Branch for This Issue/i)).not.toBeInTheDocument()
  })
})
