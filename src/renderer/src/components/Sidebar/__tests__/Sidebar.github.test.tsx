import { useState } from 'react'
import { screen, fireEvent, act, waitFor } from '@testing-library/react'
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

  // The labels are NOT on the row — they live in the hover card and the
  // detail. The right edge belongs to the kebab of actions.
  test('no label dots on the row; the kebab holds that edge', () => {
    draw({ githubIssues: [rich] })
    unfold('GITHUB ISSUES')
    expect(document.querySelector('.sb-gh-dot')).not.toBeInTheDocument()
    expect(document.querySelector('.sb-gh-line1 .sb-gh-kebab')).toBeInTheDocument()
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

  // §3 bis: with a detail handler, an issue click stays in the app; the
  // browser is what the detail's own control offers. A PR has no detail
  // yet (#110), so its click keeps going out.
  test('an issue click opens the detail when the host has one, never the browser', async () => {
    const onShowGithubDetail = jest.fn()
    const onOpenGithubItem = jest.fn()
    draw({ githubIssues: [issue], onShowGithubDetail, onOpenGithubItem })
    unfold('GITHUB ISSUES')
    await userEvent.click(screen.getByText('The bug'))
    expect(onShowGithubDetail).toHaveBeenCalledWith(expect.objectContaining({ number: 9 }), 'issue')
    expect(onOpenGithubItem).not.toHaveBeenCalled()
  })

  test('without a detail handler the click falls back to the browser', async () => {
    const onOpenGithubItem = jest.fn()
    draw({ githubIssues: [issue], onOpenGithubItem })
    unfold('GITHUB ISSUES')
    await userEvent.click(screen.getByText('The bug'))
    expect(onOpenGithubItem).toHaveBeenCalledWith('https://x/9')
  })

  test('a PR click opens its detail too — #110 gave it one', async () => {
    const onShowGithubDetail = jest.fn()
    const onOpenGithubItem = jest.fn()
    draw({ githubPRs: [{ number: 3, title: 'A PR', url: 'u3' }], onShowGithubDetail, onOpenGithubItem })
    unfold('PULL REQUESTS')
    await userEvent.click(screen.getByText('A PR'))
    expect(onShowGithubDetail).toHaveBeenCalledWith(expect.objectContaining({ number: 3 }), 'pr')
    expect(onOpenGithubItem).not.toHaveBeenCalled()
  })

  // The kebab: the same actions as the right-click, discoverable on hover.
  test('the kebab opens the full action list of an issue row', async () => {
    const write = jest.fn()
    Object.assign(navigator, { clipboard: { writeText: write } })
    const onShowGithubDetail = jest.fn()
    const onStartBranchFromIssue = jest.fn()
    const onOpenGithubItem = jest.fn()
    draw({ githubIssues: [issue], onShowGithubDetail, onStartBranchFromIssue, onOpenGithubItem })
    unfold('GITHUB ISSUES')
    await userEvent.click(document.querySelector('.sb-gh-kebab')!)
    expect(await screen.findByText('View Issue')).toBeInTheDocument()
    expect(screen.getByText(/Branch for This Issue/)).toBeInTheDocument()
    expect(screen.getByText(/Copy/i)).toBeInTheDocument()
    expect(screen.getByText(/Open on GitHub/)).toBeInTheDocument()
    // the kebab click itself must not activate the row
    expect(onShowGithubDetail).not.toHaveBeenCalled()
    await userEvent.click(screen.getByText('View Issue'))
    expect(onShowGithubDetail).toHaveBeenCalledWith(expect.objectContaining({ number: 9 }), 'issue')
  })

  test('a PR row gets the kebab too, with its own smaller list', async () => {
    const onOpenGithubItem = jest.fn()
    draw({ githubPRs: [{ number: 3, title: 'A PR', url: 'u3' }], onOpenGithubItem, onStartBranchFromIssue: jest.fn() })
    unfold('PULL REQUESTS')
    await userEvent.click(document.querySelector('.sb-gh-kebab')!)
    expect(await screen.findByText(/Open on GitHub/)).toBeInTheDocument()
    expect(screen.queryByText(/Branch for This Issue/)).not.toBeInTheDocument()
    expect(screen.queryByText('View Issue')).not.toBeInTheDocument()
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

  test('while a detail is open, the rows stop offering their card', () => {
    draw({ githubIssues: [rich], githubDetailOpen: true })
    hover('Push notifications')
    expect(document.querySelector('.ghc')).not.toBeInTheDocument()
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

// §1 bis: a section is a list of named groups, not one flat list. The
// asymmetry between the two sections is the point — a pull request is
// something you are personally on the hook for, an issue is not.
describe('the sections are named groups', () => {
  const prs = [
    { number: 1, title: 'Mine', url: 'u1', author: 'victor' },
    { number: 2, title: 'To review', url: 'u2', author: 'alice', reviewers: ['victor'] },
    { number: 3, title: 'Assigned', url: 'u3', author: 'alice', assignees: ['victor'] },
    { number: 4, title: 'Elsewhere', url: 'u4', author: 'bob' },
  ]

  test('with an identity, PULL REQUESTS carries the four groups with their counts', () => {
    draw({ githubPRs: prs, githubLogin: 'victor' })
    unfold('PULL REQUESTS')
    const groups = [...document.querySelectorAll('.sb-gh-group-head')]
      .map(g => g.textContent)
    expect(groups).toHaveLength(4)
    expect(groups[0]).toContain('My Pull Requests'); expect(groups[0]).toContain('1')
    expect(groups[1]).toContain('Assigned To Me');   expect(groups[1]).toContain('1')
    expect(groups[2]).toContain('Awaiting My Review'); expect(groups[2]).toContain('1')
    expect(groups[3]).toContain('All Pull Requests'); expect(groups[3]).toContain('4')
  })

  // With no identity the account groups have nothing to say — three empty
  // rows would read as "no pull requests".
  test('without an identity, only All Pull Requests exists', () => {
    draw({ githubPRs: prs, githubLogin: null })
    unfold('PULL REQUESTS')
    const groups = [...document.querySelectorAll('.sb-gh-group-head')].map(g => g.textContent)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toContain('All Pull Requests')
  })

  test('an empty group still shows, with its 0 — that is what says the query ran', () => {
    draw({ githubPRs: [{ number: 4, title: 'Elsewhere', url: 'u4', author: 'bob' }], githubLogin: 'victor' })
    unfold('PULL REQUESTS')
    const mine = [...document.querySelectorAll('.sb-gh-group-head')]
      .find(g => g.textContent?.includes('My Pull Requests'))!
    expect(mine.textContent).toContain('0')
  })

  test('a group collapses on its own, the others stay', () => {
    draw({ githubPRs: prs, githubLogin: 'victor' })
    unfold('PULL REQUESTS')
    // All Pull Requests holds every row; fold My Pull Requests only
    const mineHead = [...document.querySelectorAll('.sb-gh-group-head')]
      .find(g => g.textContent?.includes('My Pull Requests'))!
    fireEvent.click(mineHead)
    // 'Mine' still visible through All Pull Requests; the fold removed one copy
    expect(screen.getAllByText('Mine')).toHaveLength(1)
    expect(screen.getAllByText('Elsewhere')).toHaveLength(1)
  })

  test('the issues get one group, All Open Issues', () => {
    draw({ githubIssues: [{ number: 7, title: 'Crash on open', url: 'u7' }] })
    unfold('GITHUB ISSUES')
    const groups = [...document.querySelectorAll('.sb-gh-group-head')].map(g => g.textContent)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toContain('All Open Issues')
    expect(screen.getByText('Crash on open')).toBeInTheDocument()
  })
})

// §2: the search is a display lens — it narrows what is shown, it does not
// re-query, and the counts keep counting everything. The selector points a
// section at another repository, through the host.
describe('the section search and the repository selector', () => {
  const prs = [
    { number: 1, title: 'Speed up the graph', url: 'u1', author: 'victor' },
    { number: 2, title: 'Fix the login', url: 'u2', author: 'alice' },
  ]

  test('typing narrows the rows; the counts keep counting everything', () => {
    draw({ githubPRs: prs, githubLogin: null })
    unfold('PULL REQUESTS')
    const field = screen.getByPlaceholderText(/Search pull requests/)
    fireEvent.change(field, { target: { value: 'login' } })
    expect(screen.queryByText('Speed up the graph')).not.toBeInTheDocument()
    expect(screen.getByText('Fix the login')).toBeInTheDocument()
    const all = [...document.querySelectorAll('.sb-gh-group-head')]
      .find(g => g.textContent?.includes('All Pull Requests'))!
    expect(all.textContent).toContain('2')
  })

  test('the lens also answers to a number and an author, and Escape clears', () => {
    draw({ githubPRs: prs, githubLogin: null })
    unfold('PULL REQUESTS')
    const field = screen.getByPlaceholderText(/Search pull requests/)
    fireEvent.change(field, { target: { value: 'alice' } })
    expect(screen.queryByText('Speed up the graph')).not.toBeInTheDocument()
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(screen.getByText('Speed up the graph')).toBeInTheDocument()
  })

  test('each section searches on its own', () => {
    draw({ githubPRs: prs, githubIssues: [{ number: 7, title: 'Crash on open', url: 'u7' }] })
    unfold('PULL REQUESTS'); unfold('GITHUB ISSUES')
    fireEvent.change(screen.getByPlaceholderText(/Search pull requests/), { target: { value: 'zzz' } })
    expect(screen.getByText('Crash on open')).toBeInTheDocument()
    expect(screen.queryByText('Fix the login')).not.toBeInTheDocument()
  })

})

// §4: a saved filter is one more named group, and it RE-QUERIES — through
// githubSearchIssues, pinned to the repository, typed to the section. A
// malformed or refused filter costs that filter, never the section.
describe('the saved filters', () => {
  const gh = { githubRepo: { owner: 'o', repo: 'r' }, repoName: 'r' }
  const searchOk = (total: number, items: any[]) =>
    jest.fn().mockResolvedValue({ total, items })

  beforeEach(() => localStorage.clear())

  const openEditor = async () => {
    unfold('PULL REQUESTS')
    await userEvent.click(screen.getByTitle('New Filter'))
  }

  test('creating a filter needs a name and a valid query, and names the bad token', async () => {
    const githubSearchIssues = searchOk(1, [{ type: 'pr', number: 9, title: 'Found', url: 'u9' }])
    installMockGitAPI({
      getReflog: jest.fn().mockResolvedValue({ entries: [] }),
      getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
      getSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
      getWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
      listWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
      listSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
      listAgents: jest.fn().mockResolvedValue({ agents: [] }),
      githubSearchIssues,
    })
    draw({ githubPRs: [], ...gh })
    await openEditor()
    await userEvent.type(screen.getByPlaceholderText('Filter name'), 'Mine')
    const query = screen.getByPlaceholderText(/label:bug/)
    await userEvent.type(query, 'reviiew:approved')
    expect(screen.getByText(/Unknown token: reviiew:approved/)).toBeInTheDocument()
    expect(screen.getByText('Create Filter')).toBeDisabled()
    await userEvent.clear(query)
    await userEvent.type(query, 'review:approved')
    await userEvent.click(screen.getByText('Create Filter'))
    // the new group ran its search, pinned and typed
    // The second argument is the cache bypass (#133): a run nobody asked for
    // is never forced.
    await waitFor(() => expect(githubSearchIssues).toHaveBeenCalledWith('repo:o/r is:pr review:approved', false))
    expect(await screen.findByText('Found')).toBeInTheDocument()
    // and it persisted per repository
    expect(JSON.parse(localStorage.getItem('gv:gh-filters:r')!).prs).toEqual([{ name: 'Mine', query: 'review:approved' }])
  })

  test('the vocabulary is the section: review: passes on PRs, not on issues', async () => {
    installMockGitAPI({
      getReflog: jest.fn().mockResolvedValue({ entries: [] }),
      getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
      getSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
      getWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
      listWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
      listSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
      listAgents: jest.fn().mockResolvedValue({ agents: [] }),
    })
    draw({ githubIssues: [], ...gh })
    unfold('GITHUB ISSUES')
    await userEvent.click(screen.getByTitle('New Filter'))
    await userEvent.type(screen.getByPlaceholderText(/label:bug/), 'review:approved')
    expect(screen.getByText(/Unknown token: review:approved/)).toBeInTheDocument()
  })

  test('a refused query costs that filter, not the section', async () => {
    localStorage.setItem('gv:gh-filters:r', JSON.stringify({ prs: [{ name: 'Broken', query: 'label:x' }], issues: [] }))
    installMockGitAPI({
      getReflog: jest.fn().mockResolvedValue({ entries: [] }),
      getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
      getSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
      getWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
      listWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
      listSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
      listAgents: jest.fn().mockResolvedValue({ agents: [] }),
      githubSearchIssues: jest.fn().mockResolvedValue({ error: 'HTTP 422' }),
    })
    draw({ githubPRs: [{ number: 1, title: 'Still here', url: 'u1' }], ...gh })
    unfold('PULL REQUESTS')
    expect(await screen.findByText('HTTP 422')).toBeInTheDocument()
    expect(screen.getByText('Still here')).toBeInTheDocument()
  })

  test('a capped result says what it counted, not "the first 50"', async () => {
    localStorage.setItem('gv:gh-filters:r', JSON.stringify({ prs: [], issues: [{ name: 'Old', query: 'state:closed' }] }))
    installMockGitAPI({
      getReflog: jest.fn().mockResolvedValue({ entries: [] }),
      getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
      getSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
      getWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
      listWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
      listSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
      listAgents: jest.fn().mockResolvedValue({ agents: [] }),
      githubSearchIssues: searchOk(120, [
        { type: 'issue', number: 5, title: 'One of many', url: 'u5' },
      ]),
    })
    draw({ githubIssues: [], ...gh })
    unfold('GITHUB ISSUES')
    expect(await screen.findByText('One of many')).toBeInTheDocument()
    const head = [...document.querySelectorAll('.sb-gh-group-head')].find(g => g.textContent?.includes('Old'))!
    expect(head.textContent).toContain('120')
    expect(screen.getByText('+119 more on GitHub')).toBeInTheDocument()
  })

  test('deleting a filter removes its group and its storage', async () => {
    localStorage.setItem('gv:gh-filters:r', JSON.stringify({ prs: [{ name: 'Doomed', query: 'label:x' }], issues: [] }))
    installMockGitAPI({
      getReflog: jest.fn().mockResolvedValue({ entries: [] }),
      getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
      getSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
      getWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
      listWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
      listSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
      listAgents: jest.fn().mockResolvedValue({ agents: [] }),
      githubSearchIssues: searchOk(0, []),
    })
    draw({ githubPRs: [], ...gh })
    unfold('PULL REQUESTS')
    await userEvent.pointer({ keys: '[MouseRight]', target: await screen.findByText('Doomed') })
    await userEvent.click(await screen.findByText('Delete Filter'))
    expect(screen.queryByText('Doomed')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('gv:gh-filters:r')!).prs).toEqual([])
  })
})

// #133 — the two lists come from a server that changes without us, and until
// now the only way to re-read them was to reopen the repository.
describe('refreshing a GitHub section', () => {
  const pr = (n: number) => ({ number: n, title: `pr ${n}`, author: 'a', url: 'u', createdAt: '', comments: 0, labels: [] })
  const issue = (n: number) => ({ number: n, title: `issue ${n}`, author: 'a', url: 'u', createdAt: '', comments: 0, labels: [] })

  /** The button lives on the header, so the section need not be unfolded. */
  const refreshOf = (title: string) =>
    screen.getByText(title).closest('.sb-section')!.querySelector('.sb-add-btn[title="Refresh this section"]') as HTMLElement

  test('each section refreshes itself, and says which one it is', async () => {
    const onRefreshGithub = jest.fn()
    draw({ githubPRs: [pr(1)], githubIssues: [issue(2)], onRefreshGithub })
    await userEvent.click(refreshOf('PULL REQUESTS'))
    expect(onRefreshGithub).toHaveBeenCalledWith('prs')
    await userEvent.click(refreshOf('GITHUB ISSUES'))
    expect(onRefreshGithub).toHaveBeenCalledWith('issues')
  })

  // Two lists, two calls, and either can be the stale one: refreshing both
  // because one looks wrong spends two requests to answer one question.
  test('refreshing one section does not refresh the other', async () => {
    const onRefreshGithub = jest.fn()
    draw({ githubPRs: [pr(1)], githubIssues: [issue(2)], onRefreshGithub })
    await userEvent.click(refreshOf('PULL REQUESTS'))
    expect(onRefreshGithub).toHaveBeenCalledTimes(1)
    expect(onRefreshGithub).toHaveBeenCalledWith('prs')
  })

  test('the button of the section in flight cannot be pressed again', async () => {
    const onRefreshGithub = jest.fn()
    draw({ githubPRs: [pr(1)], githubIssues: [issue(2)], onRefreshGithub, githubRefreshing: 'prs' })
    expect(refreshOf('PULL REQUESTS')).toBeDisabled()
    // ...and the other one is still usable: they are two lists.
    expect(refreshOf('GITHUB ISSUES')).toBeEnabled()
  })

  test('no handler, no button — the host decides whether it can refresh at all', () => {
    draw({ githubPRs: [pr(1)], githubIssues: [issue(2)] })
    expect(screen.getByText('PULL REQUESTS').closest('.sb-section')!
      .querySelector('.sb-add-btn[title="Refresh this section"]')).toBeNull()
  })

  // The trap this issue was written around: `github:search-issues` is cached
  // for 20 seconds, so a saved filter re-queried without `force` answers with
  // exactly the list the user pressed the button to get away from.
  test('a saved filter re-queries with force when the tick moves', async () => {
    const githubSearchIssues = jest.fn().mockResolvedValue({ total: 0, items: [] })
    installMockGitAPI({
      getReflog: jest.fn().mockResolvedValue({ entries: [] }),
      getRemotes: jest.fn().mockResolvedValue({ remotes: [] }),
      getSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
      getWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
      listWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }),
      listSubmodules: jest.fn().mockResolvedValue({ submodules: [] }),
      listAgents: jest.fn().mockResolvedValue({ agents: [] }),
      githubSearchIssues,
    })
    // Filters live per repository in localStorage, which is where the section
    // reads them from.
    localStorage.setItem('gv:gh-filters:r', JSON.stringify({ prs: [{ name: 'Mine', query: 'author:@me' }], issues: [] }))

    // The real flow: the button bumps the tick, the tick reaches the group.
    function Host() {
      const [tick, setTick] = useState({ prs: 0, issues: 0 })
      return <Sidebar {...base} githubPRs={[pr(1)]} githubIssues={[]}
        githubRepo={{ owner: 'o', repo: 'r' }} repoName="r"
        githubRefreshTick={tick}
        onRefreshGithub={(s: 'prs' | 'issues') => setTick(v => ({ ...v, [s]: v[s] + 1 }))} />
    }
    renderWithProviders(<Host />)
    unfold('PULL REQUESTS')
    await waitFor(() => expect(githubSearchIssues).toHaveBeenCalled())
    // The first run is not a refresh: it must not spend a forced request.
    expect(githubSearchIssues.mock.calls[0][1]).toBe(false)

    githubSearchIssues.mockClear()
    await userEvent.click(refreshOf('PULL REQUESTS'))
    await waitFor(() => expect(githubSearchIssues).toHaveBeenCalled())
    expect(githubSearchIssues.mock.calls[0][1]).toBe(true)
  })
})
