import React, { createContext, useContext, useState, useCallback, useRef } from 'react'

/**
 * What happened to this repository — #193.
 *
 * A toast was the only record of an operation. Four fit on screen, the fifth
 * evicts the first, and an error that has been evicted is gone: you cannot go
 * back and read what the push actually said. The notification centre existed
 * but was about updates.
 *
 * So every operation the app reports on is also written down here, under the
 * repository it was about, and the bell is where you go back to it.
 *
 * ── Three things this is not ──────────────────────────────────
 *
 * - **Not a log of git.** It records what the app TOLD the user, one entry per
 *   toast, with the same words. A journal that said something different from
 *   the chip would be a second thing to keep true.
 * - **Not persisted.** For the session, in memory, bounded. An error text is
 *   about a working tree as it was; a week-old one read after a restart is
 *   noise, and it is the kind of thing that carries a path or a remote URL.
 * - **Not global.** Entries are keyed by the repository the operation ran on —
 *   which, with sessions, is not always the one on screen when the answer
 *   arrives. `useRepoSession` already works that repository out to decide
 *   whether a toast should name it; the journal takes the same answer, so a
 *   background repository's entries are waiting in ITS journal when its tab
 *   comes back.
 *
 * The provider is mounted above ToastProvider in the desktop's root. The VS
 * Code panel has no bell and mounts neither, which is why every method here has
 * a no-op default: Toast.tsx reads this context in both products and simply
 * draws no link to a journal that is not there.
 */
export interface JournalEntry {
  id: number
  /** The repository the operation ran on. `null` — no repository open. */
  repoPath: string | null
  /** The words the user was shown, without the "which repository" prefix. */
  message: string
  type: 'ok' | 'err' | 'info'
  ts: number
  /** How many times this same line arrived in a row — as the chip counts. */
  count: number
  /** An error the bell has not been opened on yet. */
  seen: boolean
}

/**
 * Per repository, and low enough that a runaway loop cannot grow the tab's
 * memory without bound. Well past what four evicted toasts ever were.
 */
export const JOURNAL_MAX = 200

interface JournalValue {
  /** False when no provider is mounted — the panel. */
  enabled: boolean
  entries: JournalEntry[]
  /** Write down what the user was just told about `repoPath`. */
  note: (repoPath: string | null, message: string, type: JournalEntry['type']) => void
  /** That repository's entries, errors first, newest first within each group. */
  entriesFor: (repoPath: string | null) => JournalEntry[]
  /** Errors of that repository the bell has not been opened on. */
  unseenErrors: (repoPath: string | null) => number
  markSeen: (repoPath: string | null) => void
  clear: (repoPath: string | null) => void
  drop: (id: number) => void
  /** The bell's panel. Held here so an error chip can link to its own entry. */
  open: boolean
  setOpen: (open: boolean) => void
}

const noop = () => {}
const JournalContext = createContext<JournalValue>({
  enabled: false,
  entries: [],
  note: noop,
  entriesFor: () => [],
  unseenErrors: () => 0,
  markSeen: noop,
  clear: noop,
  drop: noop,
  open: false,
  setOpen: noop,
})

export function useJournal(): JournalValue {
  return useContext(JournalContext)
}

/**
 * Errors first, then the rest; newest first within each group.
 *
 * The order is the point of the panel. What you open the bell for is the thing
 * that went wrong, and a failed push four successful fetches ago is below the
 * fold in a plain chronological list — which is the situation this replaced.
 */
export function orderJournal(entries: JournalEntry[]): JournalEntry[] {
  const byTime = (a: JournalEntry, b: JournalEntry) => b.ts - a.ts || b.id - a.id
  return [
    ...entries.filter(e => e.type === 'err').sort(byTime),
    ...entries.filter(e => e.type !== 'err').sort(byTime),
  ]
}

export function JournalProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [open, setOpen] = useState(false)
  const counter = useRef(0)

  const note = useCallback((repoPath: string | null, message: string, type: JournalEntry['type']) => {
    setEntries(prev => {
      // The same line twice running is one entry that counts, exactly as the
      // chip collapses it: staging ten files that each fail the same way is one
      // thing that happened, not ten.
      const lastOfRepo = [...prev].reverse().find(e => e.repoPath === repoPath)
      if (lastOfRepo && lastOfRepo.message === message && lastOfRepo.type === type) {
        return prev.map(e => e === lastOfRepo
          ? { ...e, count: e.count + 1, ts: Date.now(), seen: type === 'err' ? false : e.seen }
          : e)
      }
      const entry: JournalEntry = {
        id: ++counter.current, repoPath, message, type,
        ts: Date.now(), count: 1, seen: type !== 'err',
      }
      const next = [...prev, entry]
      // Bound per repository, not overall: a busy repository must not evict
      // what another one is still holding.
      const mine = next.filter(e => e.repoPath === repoPath)
      if (mine.length <= JOURNAL_MAX) return next
      const evicted = new Set(mine.slice(0, mine.length - JOURNAL_MAX))
      return next.filter(e => !evicted.has(e))
    })
  }, [])

  const entriesFor = useCallback(
    (repoPath: string | null) => orderJournal(entries.filter(e => e.repoPath === repoPath)),
    [entries])

  const unseenErrors = useCallback(
    (repoPath: string | null) =>
      entries.reduce((n, e) => n + (e.repoPath === repoPath && e.type === 'err' && !e.seen ? 1 : 0), 0),
    [entries])

  const markSeen = useCallback((repoPath: string | null) => {
    setEntries(prev => prev.some(e => e.repoPath === repoPath && !e.seen)
      ? prev.map(e => e.repoPath === repoPath ? { ...e, seen: true } : e)
      : prev)
  }, [])

  const clear = useCallback((repoPath: string | null) => {
    setEntries(prev => prev.filter(e => e.repoPath !== repoPath))
  }, [])

  const drop = useCallback((id: number) => {
    setEntries(prev => prev.filter(e => e.id !== id))
  }, [])

  return (
    <JournalContext.Provider
      value={{ enabled: true, entries, note, entriesFor, unseenErrors, markSeen, clear, drop, open, setOpen }}>
      {children}
    </JournalContext.Provider>
  )
}
