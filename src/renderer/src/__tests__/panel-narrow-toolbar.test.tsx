import { render, screen, fireEvent } from '@testing-library/react'
import { LanguageProvider } from '../i18n/LanguageContext'
import CompactToolbar from '../../../../vscode-extension/src/webview/CompactToolbar'

// The panel's toolbar in a side-bar column. At that width the row that holds
// every action in the bottom panel cannot: the secondary actions fold into a
// menu, the sync actions keep their icon and count, and the search field
// takes a row of its own — or a button, when the column is short too.
//
// An extension component tested from the desktop suite, like the rail: jest
// is the only harness here with a DOM.

const calls: Record<string, number> = {}
const count = (name: string) => () => { calls[name] = (calls[name] ?? 0) + 1 }

const toolbar = (over: Partial<React.ComponentProps<typeof CompactToolbar>> = {}) => render(
  <LanguageProvider>
    <CompactToolbar
      narrow searchRow="always"
      repoName="vertex" branch="main" branches={[]} loading={false} stashCount={2}
      searchQuery="" lastFetch={null} ahead={3} behind={0}
      onCheckout={() => {}} onSearch={count('search')} onFetch={count('fetch')} onPull={count('pull')} onPush={count('push')}
      onNewBranch={count('newBranch')} onStash={count('stash')} onPop={count('pop')} onUndo={count('undo')} onRedo={count('redo')}
      onTerminal={count('terminal')} onOpenDesktop={count('desktop')} onRefresh={() => {}} onSettings={count('settings')}
      onToggleSidebar={count('sidebar')}
      {...over}
    />
  </LanguageProvider>
)

beforeEach(() => { for (const k of Object.keys(calls)) delete calls[k] })

describe('the narrow toolbar', () => {
  test('keeps the sync actions in the row, with their counts', () => {
    toolbar()
    expect(screen.getByRole('button', { name: /fetch/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pull/i })).toBeInTheDocument()
    const push = screen.getByRole('button', { name: /push/i })
    expect(push).toHaveTextContent('3')
  })

  test('folds the secondary actions into a menu that still runs them', () => {
    toolbar()
    // Not in the row.
    expect(screen.queryByRole('button', { name: /new branch/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    const menu = screen.getByRole('menu')
    expect(menu).toHaveTextContent(/new branch/i)
    expect(menu).toHaveTextContent(/pop stash \(2\)/i)
    expect(menu).toHaveTextContent(/undo/i)
    expect(menu).toHaveTextContent(/terminal/i)
    expect(menu).toHaveTextContent(/settings/i)
    fireEvent.click(screen.getByText(/new branch/i))
    expect(calls.newBranch).toBe(1)
  })

  test('gives the search field its own row when told there is height for it', () => {
    toolbar()
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /search commits/i })).not.toBeInTheDocument()
  })

  test('and a button that reveals it when there is not', () => {
    toolbar({ searchRow: 'toggle' })
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /search commits/i }))
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
  })

  test('closing the search row clears the filter it held, so nothing stays hidden by an invisible query', () => {
    toolbar({ searchRow: 'toggle', searchQuery: 'fix' })
    // A query opens the row by itself.
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /search commits/i }))
    expect(calls.search).toBe(1)
  })

  test('the wide toolbar is untouched: every action in the row, no menu', () => {
    toolbar({ narrow: false })
    expect(screen.getByRole('button', { name: /new branch/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /more actions/i })).not.toBeInTheDocument()
  })
})

describe('the repository picker', () => {
  const repos = [{ path: '/w/app', name: 'app' }, { path: '/w/lib', name: 'lib' }]

  test('a workspace with several repositories gets a picker that switches', () => {
    const onSwitchRepo = jest.fn()
    toolbar({ narrow: false, repoName: 'app', repoPath: '/w/app', repos, onSwitchRepo })
    fireEvent.click(screen.getByRole('button', { name: /switch repository/i }))
    const menu = screen.getByRole('menu')
    expect(menu).toHaveTextContent('app')
    expect(menu).toHaveTextContent('lib')
    fireEvent.click(screen.getByRole('menuitem', { name: /lib/i }))
    expect(onSwitchRepo).toHaveBeenCalledWith('/w/lib')
  })

  test('picking the repository already on screen switches nothing', () => {
    const onSwitchRepo = jest.fn()
    toolbar({ narrow: false, repoName: 'app', repoPath: '/w/app', repos, onSwitchRepo })
    fireEvent.click(screen.getByRole('button', { name: /switch repository/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /app/i }))
    expect(onSwitchRepo).not.toHaveBeenCalled()
  })

  test('the picker is there in the narrow column too, where nothing else names the repository', () => {
    toolbar({ narrow: true, repoName: 'app', repoPath: '/w/app', repos, onSwitchRepo: jest.fn() })
    expect(screen.getByRole('button', { name: /switch repository/i })).toHaveTextContent('app')
  })

  test('one repository is a name, not a control', () => {
    toolbar({ narrow: false, repoName: 'app', repoPath: '/w/app', repos: repos.slice(0, 1), onSwitchRepo: jest.fn() })
    expect(screen.queryByRole('button', { name: /switch repository/i })).not.toBeInTheDocument()
    expect(screen.getByText('app')).toBeInTheDocument()
  })
})

describe('following the cursor', () => {
  test('the wide toolbar has the switch, pressed while following', () => {
    const onToggleFollowCursor = jest.fn()
    toolbar({ narrow: false, followCursor: true, onToggleFollowCursor })
    const button = screen.getByRole('button', { name: /follow the cursor/i })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(button)
    expect(onToggleFollowCursor).toHaveBeenCalledTimes(1)
  })

  test('the narrow toolbar keeps it in the menu, checked while following', () => {
    toolbar({ followCursor: true, onToggleFollowCursor: jest.fn() })
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    expect(screen.getByRole('menu')).toHaveTextContent(/follow the cursor/i)
  })
})

// The panel's field asks in words exactly as the desktop's does: the host has
// answered `aiSearchCommits` since the extension's first release, and only the
// field never offered to put the question.
describe('the search in words', () => {
  const field = () => screen.getByPlaceholderText(/search/i)

  test('says both ways in, and Enter over a sentence asks', () => {
    const onAskAi = jest.fn()
    toolbar({ searchQuery: 'the commits that broke the build', onAskAi })
    expect(field()).toHaveAttribute('placeholder', 'Search, or ask…')
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onAskAi).toHaveBeenCalledTimes(1)
  })

  test('Enter over operators alone asks nothing — that filter is already live', () => {
    const onAskAi = jest.fn()
    toolbar({ searchQuery: 'author:ana after:2w', onAskAi })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onAskAi).not.toHaveBeenCalled()
  })

  test('Enter while a question is out does not send a second one', () => {
    const onAskAi = jest.fn()
    toolbar({ searchQuery: 'what broke the build', onAskAi, aiSearchLoading: true })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onAskAi).not.toHaveBeenCalled()
    expect(document.querySelector('.gvt-search-ai')).toHaveTextContent('…')
  })

  test('the panel that opens on focus offers the question first', () => {
    const onAskAi = jest.fn()
    toolbar({ searchQuery: 'what broke the build', onAskAi })
    fireEvent.focus(field())
    const ask = document.querySelector('.shint-ask') as HTMLButtonElement
    expect(ask).not.toBeNull()
    fireEvent.click(ask)
    expect(onAskAi).toHaveBeenCalledTimes(1)
  })

  test('the answer on screen is a state of the field, not a button', () => {
    toolbar({ searchQuery: 'what broke the build', onAskAi: jest.fn(), aiSearch: true })
    expect(document.querySelector('.gvt-search')).toHaveClass('gvt-search--ai')
    expect(document.querySelector('.gvt-search-ai')!.tagName).toBe('SPAN')
  })

  test('without a host to answer, the field keeps its plain placeholder and no row', () => {
    toolbar({ searchQuery: 'what broke the build' })
    expect(field()).toHaveAttribute('placeholder', 'Search…')
    fireEvent.focus(field())
    expect(document.querySelector('.shint-ask')).toBeNull()
  })
})
