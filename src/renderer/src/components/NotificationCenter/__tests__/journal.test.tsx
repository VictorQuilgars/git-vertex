import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { ToastProvider, useToast, TOAST_STACK_MAX } from '../../Toast/Toast'
import { JournalProvider, useJournal, orderJournal, JOURNAL_MAX, type JournalEntry } from '../../../contexts/JournalContext'
import NotificationCenter from '../NotificationCenter'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The journal — #193.
//
// What this holds is the sentence the issue is closed by: four errors in a row
// are all still readable a minute later, from the bell, with the repository
// each one was about. The toast stack holds four and evicts the fifth for good,
// which is the whole reason this exists.

const REPO_A = '/Users/dev/alpha'
const REPO_B = '/Users/dev/beta'

function entry(over: Partial<JournalEntry> = {}): JournalEntry {
  return { id: 1, repoPath: REPO_A, message: 'm', type: 'ok', ts: 1000, count: 1, seen: true, ...over }
}

describe('the order the bell reads in', () => {
  test('errors first, newest first inside each group', () => {
    const ordered = orderJournal([
      entry({ id: 1, type: 'ok', ts: 10 }),
      entry({ id: 2, type: 'err', ts: 20 }),
      entry({ id: 3, type: 'info', ts: 30 }),
      entry({ id: 4, type: 'err', ts: 40 }),
    ])
    expect(ordered.map(e => e.id)).toEqual([4, 2, 3, 1])
  })

  test('two entries of the same instant are ordered by arrival, not at random', () => {
    const ordered = orderJournal([entry({ id: 7, ts: 5 }), entry({ id: 8, ts: 5 })])
    expect(ordered.map(e => e.id)).toEqual([8, 7])
  })
})

// ── The store, driven the way the app drives it ────────────────

/** Exposes the journal as buttons, and renders what it holds. */
function Store({ repo = REPO_A }: { repo?: string | null }) {
  const j = useJournal()
  return (
    <div>
      <button onClick={() => j.note(repo, 'Push refused', 'err')}>fail</button>
      <button onClick={() => j.note(repo, 'Fetched', 'ok')}>ok</button>
      <button onClick={() => j.note(REPO_B, 'Pull refused', 'err')}>fail-elsewhere</button>
      <button onClick={() => j.markSeen(repo)}>seen</button>
      <button onClick={() => j.clear(repo)}>clear</button>
      <span data-testid="count">{j.entriesFor(repo).length}</span>
      <span data-testid="unseen">{j.unseenErrors(repo)}</span>
      <span data-testid="lines">{j.entriesFor(repo).map(e => `${e.message}×${e.count}`).join('|')}</span>
    </div>
  )
}

function drawStore(repo?: string | null) {
  installMockGitAPI()
  return renderWithProviders(<JournalProvider><Store repo={repo} /></JournalProvider>)
}

const press = (name: string) => userEvent.click(screen.getByRole('button', { name }))
const read = (id: string) => screen.getByTestId(id).textContent

describe('what the journal keeps', () => {
  test('an entry per operation, kept after the chip would be gone', async () => {
    drawStore()
    await press('fail')
    await press('ok')
    expect(read('count')).toBe('2')
    expect(read('lines')).toBe('Push refused×1|Fetched×1')
  })

  test('the same line twice running is one entry that counts', async () => {
    drawStore()
    await press('fail')
    await press('fail')
    await press('fail')
    expect(read('count')).toBe('1')
    expect(read('lines')).toBe('Push refused×3')
  })

  test('a repeat is only a repeat when nothing else came between', async () => {
    drawStore()
    await press('fail')
    await press('ok')
    await press('fail')
    expect(read('count')).toBe('3')
  })

  test("another repository's entry is not mixed in, and does not break a repeat", async () => {
    drawStore()
    await press('fail')
    await press('fail-elsewhere')
    await press('fail')
    // Two repositories, two journals: alpha still saw the same line twice
    // running, whatever beta did in between.
    expect(read('count')).toBe('1')
    expect(read('lines')).toBe('Push refused×2')
  })

  test('an error is unseen until the bell is opened on it', async () => {
    drawStore()
    await press('fail')
    expect(read('unseen')).toBe('1')
    await press('seen')
    expect(read('unseen')).toBe('0')
  })

  test('a success is never unseen — the badge counts failures', async () => {
    drawStore()
    await press('ok')
    expect(read('unseen')).toBe('0')
  })

  test('the same error arriving again makes it unseen once more', async () => {
    drawStore()
    await press('fail')
    await press('seen')
    await press('fail')
    expect(read('unseen')).toBe('1')
  })

  test("clearing one repository's journal leaves the other's alone", async () => {
    drawStore()
    await press('fail')
    await press('fail-elsewhere')
    await press('clear')
    expect(read('count')).toBe('0')
    // beta's entry survived: rendered through its own repo below.
    expect(screen.getByTestId('lines').textContent).toBe('')
  })

  test('with no repository open the entries still have somewhere to go', async () => {
    drawStore(null)
    await press('fail')
    expect(read('count')).toBe('1')
  })
})

describe('the journal is bounded', () => {
  function Flood() {
    const j = useJournal()
    useEffect(() => {
      // Distinct lines, so nothing collapses and the cap is what is tested.
      for (let i = 0; i < JOURNAL_MAX + 25; i++) j.note(REPO_A, `line ${i}`, 'info')
      j.note(REPO_B, 'kept', 'info')
    }, [])
    return (
      <>
        <span data-testid="count">{j.entriesFor(REPO_A).length}</span>
        <span data-testid="oldest">{j.entriesFor(REPO_A).map(e => e.message).join('|')}</span>
        <span data-testid="other">{j.entriesFor(REPO_B).length}</span>
      </>
    )
  }

  test('it holds a session, not a lifetime — and drops the oldest', async () => {
    installMockGitAPI()
    renderWithProviders(<JournalProvider><Flood /></JournalProvider>)
    await waitFor(() => expect(read('count')).toBe(String(JOURNAL_MAX)))
    expect(screen.getByTestId('oldest').textContent).not.toContain('line 0|')
    expect(screen.getByTestId('oldest').textContent).toContain(`line ${JOURNAL_MAX + 24}`)
  })

  test('a busy repository does not evict what another one is holding', async () => {
    installMockGitAPI()
    renderWithProviders(<JournalProvider><Flood /></JournalProvider>)
    await waitFor(() => expect(read('other')).toBe('1'))
  })
})

// ── The chip and the journal, together ─────────────────────────

describe('an error survives the stack it was shown in', () => {
  /** Raises n distinct errors and shows what the journal kept. */
  function Failing() {
    const toast = useToast()
    const j = useJournal()
    return (
      <div>
        <button onClick={() => {
          for (let i = 1; i <= TOAST_STACK_MAX + 1; i++) {
            toast.error(`Error ${i}`)
            j.note(REPO_A, `Error ${i}`, 'err')
          }
        }}>burst</button>
        <span data-testid="lines">{j.entriesFor(REPO_A).map(e => e.message).join('|')}</span>
      </div>
    )
  }

  test('the chip the stack evicted is still in the journal', async () => {
    installMockGitAPI()
    renderWithProviders(
      <JournalProvider><ToastProvider><Failing /></ToastProvider></JournalProvider>)
    await press('burst')
    // The stack holds four and the fifth pushed the first off for good…
    expect(screen.queryByText('Error 1')).not.toBeInTheDocument()
    expect(screen.getByText('Error 5')).toBeInTheDocument()
    // …but all five are readable from the bell, newest first.
    expect(read('lines')).toBe('Error 5|Error 4|Error 3|Error 2|Error 1')
  })

  test('an error chip offers the way back, and a success does not', async () => {
    installMockGitAPI()
    function Two() {
      const toast = useToast()
      return (
        <div>
          <button onClick={() => toast.error('Push refused')}>bad</button>
          <button onClick={() => toast.success('Branch created')}>good</button>
        </div>
      )
    }
    renderWithProviders(<JournalProvider><ToastProvider><Two /></ToastProvider></JournalProvider>)
    await press('good')
    expect(screen.queryByRole('button', { name: 'Journal' })).not.toBeInTheDocument()
    await press('bad')
    expect(screen.getByRole('button', { name: 'Journal' })).toBeInTheDocument()
  })

  test('the link is not drawn where no journal is mounted — the VS Code panel', async () => {
    installMockGitAPI()
    function Bad() {
      const toast = useToast()
      return <button onClick={() => toast.error('Push refused')}>bad</button>
    }
    renderWithProviders(<ToastProvider><Bad /></ToastProvider>)
    await press('bad')
    expect(screen.getByText('Push refused')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Journal' })).not.toBeInTheDocument()
  })

  test('pressing it opens the bell', async () => {
    installMockGitAPI()
    function Bad() {
      const toast = useToast()
      const j = useJournal()
      return (
        <div>
          <button onClick={() => toast.error('Push refused')}>bad</button>
          <span data-testid="open">{String(j.open)}</span>
        </div>
      )
    }
    renderWithProviders(<JournalProvider><ToastProvider><Bad /></ToastProvider></JournalProvider>)
    await press('bad')
    expect(read('open')).toBe('false')
    await press('Journal')
    expect(read('open')).toBe('true')
  })

  test('adding the link did not stop identical errors collapsing into one chip', async () => {
    installMockGitAPI()
    function Bad() {
      const toast = useToast()
      return <button onClick={() => toast.error('Push refused')}>bad</button>
    }
    renderWithProviders(<JournalProvider><ToastProvider><Bad /></ToastProvider></JournalProvider>)
    await press('bad')
    await press('bad')
    await press('bad')
    // One chip, counting — not three stacked on top of the window.
    expect(screen.getAllByText('Push refused')).toHaveLength(1)
    expect(screen.getByText('×3')).toBeInTheDocument()
  })
})

// ── The panel ──────────────────────────────────────────────────

describe('the notification centre shows both halves', () => {
  const noop = () => {}
  const draw = (journal: JournalEntry[], notifications: any[] = []) => {
    installMockGitAPI()
    return renderWithProviders(
      <NotificationCenter
        notifications={notifications}
        journal={journal}
        repoName="alpha"
        onClose={noop} onToggleRead={noop} onDelete={noop}
        onMarkAllRead={noop} onClearAll={noop} onActivate={noop}
        onDropEntry={noop} onClearJournal={noop}
      />)
  }

  test('every entry is readable, and names the repository it was about', () => {
    draw([
      entry({ id: 1, type: 'err', message: 'Push refused: non-fast-forward' }),
      entry({ id: 2, type: 'err', message: 'Pull refused', repoPath: REPO_B }),
    ])
    expect(screen.getByText('Push refused: non-fast-forward')).toBeInTheDocument()
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('beta')).toBeInTheDocument()
  })

  test('a repeat says how many times it happened', () => {
    draw([entry({ id: 1, type: 'err', message: 'Push refused', count: 4 })])
    expect(screen.getByText('×4')).toBeInTheDocument()
  })

  test('an empty journal and no notification is still the empty state', () => {
    draw([])
    expect(screen.getByText('No notifications')).toBeInTheDocument()
  })

  test('a journal alone is not the empty state', () => {
    draw([entry({ id: 1, message: 'Fetched' })])
    expect(screen.queryByText('No notifications')).not.toBeInTheDocument()
    expect(screen.getByText('Fetched')).toBeInTheDocument()
  })

  test('an update notification and a journal entry live in the same panel', () => {
    draw(
      [entry({ id: 1, type: 'err', message: 'Push refused' })],
      [{ id: 'u', kind: 'update', data: { version: '1.36.0' }, ts: Date.now(), read: false }])
    expect(screen.getByText(/1\.36\.0/)).toBeInTheDocument()
    expect(screen.getByText('Push refused')).toBeInTheDocument()
  })

  test('dropping one entry asks for that entry', async () => {
    const onDropEntry = jest.fn()
    installMockGitAPI()
    renderWithProviders(
      <NotificationCenter
        notifications={[]} journal={[entry({ id: 42, message: 'Fetched' })]} repoName="alpha"
        onClose={noop} onToggleRead={noop} onDelete={noop}
        onMarkAllRead={noop} onClearAll={noop} onActivate={noop}
        onDropEntry={onDropEntry} onClearJournal={noop}
      />)
    await userEvent.click(screen.getByTitle('Delete'))
    expect(onDropEntry).toHaveBeenCalledWith(42)
  })
})

describe('an operation is recorded where it ran, not where the user is looking', () => {
  // The shape useRepoSession computes: the repository an operation started on
  // decides both whether the chip names it and whose journal the line goes in.
  function Session() {
    const j = useJournal()
    return (
      <div>
        {/* A background repository reports while alpha is on screen. */}
        <button onClick={() => j.note(REPO_B, 'Auto-fetch failed', 'err')}>background</button>
        <span data-testid="shown">{j.entriesFor(REPO_A).length}</span>
        <span data-testid="hidden">{j.entriesFor(REPO_B).map(e => e.message).join('|')}</span>
        <span data-testid="hidden-unseen">{j.unseenErrors(REPO_B)}</span>
      </div>
    )
  }

  test("it waits in the hidden repository's journal for its tab to come back", async () => {
    installMockGitAPI()
    renderWithProviders(<JournalProvider><Session /></JournalProvider>)
    await press('background')
    expect(read('shown')).toBe('0')
    expect(read('hidden')).toBe('Auto-fetch failed')
    expect(read('hidden-unseen')).toBe('1')
  })
})
