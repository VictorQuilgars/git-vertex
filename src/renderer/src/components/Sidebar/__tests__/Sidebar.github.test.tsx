import { screen, fireEvent, act } from '@testing-library/react'
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
// The sections start folded — the graph is the point of the window, and the
// header's count already says what is behind. Tests about rows open them the
// way a person does.
const unfold = (title: string) => fireEvent.click(screen.getByText(title))

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

  test('the sections start folded, whatever they hold', () => {
    draw({ githubPRs: [{ number: 1, title: 'A PR', url: 'u' }], githubIssues: [] })
    expect(screen.getByText('PULL REQUESTS')).toBeInTheDocument()
    expect(screen.queryByText('A PR')).not.toBeInTheDocument()
    unfold('PULL REQUESTS')
    expect(screen.getByText('A PR')).toBeInTheDocument()
  })

  test('rows carry the number and the title, and a draft says it is one', () => {
    draw({
      githubPRs: [
        { number: 12, title: 'Fix the login', url: 'https://x/12' },
        { number: 13, title: 'Work in progress', url: 'https://x/13', draft: true },
      ],
      githubIssues: [{ number: 7, title: 'Crash on open', url: 'https://x/7' }],
    })
    unfold('PULL REQUESTS'); unfold('GITHUB ISSUES')
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
    unfold('GITHUB ISSUES')
    expect(screen.getByText('@alice')).toBeInTheDocument()
    expect(screen.getByText(/2\s?d|2 j/)).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  test('labels are dots, their names a tooltip away', () => {
    draw({ githubIssues: [rich] })
    unfold('GITHUB ISSUES')
    const dots = screen.getByTitle('perf, P1')
    expect(dots.querySelectorAll('.sb-gh-dot')).toHaveLength(2)
  })

  // A host still sending the narrow shape gets the narrow row — no empty
  // separators claiming metadata that never arrived.
  test('the narrow shape renders without a meta line', () => {
    draw({ githubIssues: [{ number: 7, title: 'Crash on open', url: 'https://x/7' }] })
    unfold('GITHUB ISSUES')
    expect(screen.getByText('Crash on open')).toBeInTheDocument()
    expect(document.querySelector('.sb-gh-meta')).not.toBeInTheDocument()
  })

  test('a PR and an issue carry different state icons, and a draft is greyed', () => {
    draw({
      githubPRs: [{ number: 1, title: 'Open', url: 'u' }, { number: 2, title: 'Draft', url: 'u2', draft: true }],
      githubIssues: [rich],
    })
    unfold('PULL REQUESTS'); unfold('GITHUB ISSUES')
    expect(document.querySelectorAll('.sb-gh-state')).toHaveLength(3)
    expect(document.querySelectorAll('.sb-gh-state--draft')).toHaveLength(1)
  })
})

describe('the affordances follow their handlers', () => {
  const issue = { number: 9, title: 'The bug', url: 'https://x/9' }

  test('right-click on an issue offers the branch only when the host can create one', async () => {
    draw({ githubIssues: [issue], onStartBranchFromIssue: undefined })
    unfold('GITHUB ISSUES')
    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('The bug') })
    expect(screen.queryByText(/Branch for This Issue/i)).not.toBeInTheDocument()
  })

  test('with the handler, the menu creates the branch from that issue', async () => {
    const onStartBranchFromIssue = jest.fn()
    draw({ githubIssues: [issue], onStartBranchFromIssue })
    unfold('GITHUB ISSUES')
    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('The bug') })
    const entry = await screen.findByText(/Branch for This Issue/i)
    await userEvent.click(entry)
    expect(onStartBranchFromIssue).toHaveBeenCalledWith({ number: 9, title: 'The bug', url: 'https://x/9' })
  })

  test('clicking a row goes through the open handler, not straight to a browser', async () => {
    const onOpenGithubItem = jest.fn()
    draw({ githubIssues: [issue], onOpenGithubItem })
    unfold('GITHUB ISSUES')
    await userEvent.click(screen.getByText('The bug'))
    expect(onOpenGithubItem).toHaveBeenCalledWith('https://x/9')
  })

  test('a pull request row never offers a branch menu', async () => {
    draw({ githubPRs: [{ number: 3, title: 'A PR', url: 'u3' }], onStartBranchFromIssue: jest.fn() })
    unfold('PULL REQUESTS')
    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('A PR') })
    expect(screen.queryByText(/Branch for This Issue/i)).not.toBeInTheDocument()
  })
})

// The hover card — the reference pane's gesture: rest on a row and the card
// opens over the graph with what the row has no room for. Time is faked: the
// card waits 400ms before existing, and 80ms of grace when the pointer moves
// from the row into the card.
describe('the hover card over the graph', () => {
  const rich = {
    number: 24, title: 'Push notifications', url: 'https://x/24',
    author: 'victor', createdAt: new Date(Date.now() - 3600_000).toISOString(),
    comments: 1, labels: [{ name: 'frontend', color: '1d76db' }],
    assignees: [],
    body: '## Objectif\n\nEnvoyer des notifications.\n\n- [ ] Configurer le `manifest`\n- [x] Fait',
  }
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  const hover = (text: string) => {
    unfold('GITHUB ISSUES')
    fireEvent.mouseEnter(screen.getByText(text).closest('.sb-gh-row')!)
    act(() => { jest.advanceTimersByTime(450) })
  }

  test('resting on a rich row opens the card with the rendered description', () => {
    draw({ githubIssues: [rich] })
    hover('Push notifications')
    const card = document.querySelector('.ghc')!
    expect(card).toBeInTheDocument()
    expect(card.textContent).toContain('Objectif')
    expect(card.textContent).toContain('Envoyer des notifications.')
    // the task list renders as GitHub's own checkboxes, states kept
    const boxes = card.querySelectorAll('input[type="checkbox"]')
    expect(boxes).toHaveLength(2)
    expect((boxes[0] as HTMLInputElement).checked).toBe(false)
    expect((boxes[1] as HTMLInputElement).checked).toBe(true)
  })

  test('the side column says status, labels, assignees and reporter', () => {
    draw({ githubIssues: [rich] })
    hover('Push notifications')
    const card = document.querySelector('.ghc')!
    expect(card.textContent).toContain('Open')
    expect(card.textContent).toContain('frontend')
    expect(card.textContent).toContain('None')        // assignees: asked, none
    expect(card.textContent).toContain('@victor')     // reporter
  })

  test('a narrow-shape row gets no card, not an empty frame', () => {
    draw({ githubIssues: [{ number: 7, title: 'Crash on open', url: 'https://x/7' }] })
    hover('Crash on open')
    expect(document.querySelector('.ghc')).not.toBeInTheDocument()
  })

  test('leaving the row closes the card unless the pointer entered it', () => {
    draw({ githubIssues: [rich] })
    hover('Push notifications')
    fireEvent.mouseLeave(document.querySelector('.sb-gh-row')!)
    act(() => { jest.advanceTimersByTime(120) })
    expect(document.querySelector('.ghc')).not.toBeInTheDocument()
  })

  test('clicking the card opens the issue — the card is a preview, not a reader', () => {
    const onOpenGithubItem = jest.fn()
    draw({ githubIssues: [rich], onOpenGithubItem })
    hover('Push notifications')
    fireEvent.click(document.querySelector('.ghc')!)
    expect(onOpenGithubItem).toHaveBeenCalledWith('https://x/24')
  })

  test('the card never runs past the bottom of the window', () => {
    draw({ githubIssues: [rich] })
    hover('Push notifications')
    const card = document.querySelector('.ghc') as HTMLElement
    const top = parseInt(card.style.top, 10)
    const maxH = parseInt(card.style.maxHeight, 10)
    expect(top + maxH).toBeLessThan(window.innerHeight)
    expect(maxH).toBeGreaterThanOrEqual(300)
  })

  // The regression that froze the app: bold recurses into the inline parser,
  // and a shared global regex carried its position across the recursion —
  // the outer loop re-matched the same span forever. jsdom never saw it
  // because no test body carried nested emphasis.
  test('a body mixing bold, code and links inside one line still renders', () => {
    draw({ githubIssues: [{
      number: 30, title: 'Nested emphasis', url: 'https://x/30', author: 'v',
      body: 'Read **the `manifest` [spec](https://w3.org) carefully** then *do it* — `x` **again** done.',
    }] })
    hover('Nested emphasis')
    const card = document.querySelector('.ghc')!
    expect(card.textContent).toContain('carefully')
    expect(card.textContent).toContain('again')
    expect(card.querySelectorAll('code').length).toBeGreaterThanOrEqual(2)
  })
})
