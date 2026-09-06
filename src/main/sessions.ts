// The repositories that are open, each with its own git service — and which
// one a request is about.
//
// There used to be one service, replaced whenever a repository was set: every
// handler answered for "the repository of the moment", and a response that
// came back after the moment had passed was written into whatever repository
// was open by then. A session is one repository, kept for as long as a tab
// shows it: its service, its watchers, its auto-fetch timer.
//
// Which session a handler runs against is decided per request. The preload
// names the repository in an envelope on every call, the handler wrapper
// (ipc/handle.ts) opens an async context with that name, and `sessionFor()`
// reads it from anywhere down the call — `await`s included — with no argument
// threaded through 220 signatures. A request that names nothing (an older
// caller, a timer, a deep link) gets the active session, as before.
//
// Pure: no Electron here, so the registry and the binding are unit-tested.
import { AsyncLocalStorage } from 'async_hooks'
import type { GitService } from './git-service'
import type { FSWatcher } from 'fs'

export interface RepoSession {
  path: string
  name: string
  service: GitService
  gitDirWatcher: FSWatcher | null
  workingDirWatcher: FSWatcher | null
  gitDebounce: ReturnType<typeof setTimeout> | null
  workingDebounce: ReturnType<typeof setTimeout> | null
  autoFetchTimer: ReturnType<typeof setInterval> | null
  autoFetchRunning: boolean
  /** When it was last the active one — the eviction order. */
  lastActive: number
}

/** How many repositories stay open behind the one shown. Beyond it, the least recently active goes. */
export const MAX_SESSIONS = 8

const sessions = new Map<string, RepoSession>()
let activePath: string | null = null
const requestRepo = new AsyncLocalStorage<string | null>()
// A tick per activation rather than a clock: two activations in the same
// millisecond would otherwise tie, and a tie is an arbitrary eviction.
let activations = 0

export function newSession(path: string, name: string, service: GitService): RepoSession {
  return { path, name, service, gitDirWatcher: null, workingDirWatcher: null, gitDebounce: null, workingDebounce: null, autoFetchTimer: null, autoFetchRunning: false, lastActive: ++activations }
}

/** Run `fn` as a request about `repo` — every sessionFor() below it, across awaits, answers with that repository. */
export function runForRepo<T>(repo: string | null | undefined, fn: () => T): T {
  return requestRepo.run(repo ?? null, fn)
}

/** The repository the current request named, or null when it named none (or there is no request). */
export function requestedRepo(): string | null {
  return requestRepo.getStore() ?? null
}

export function sessionAt(path: string | null | undefined): RepoSession | null {
  return path ? sessions.get(path) ?? null : null
}

export function activeSession(): RepoSession | null {
  return sessionAt(activePath)
}

export function activeRepoPath(): string | null {
  return activePath
}

/**
 * The session this request is about. A request that named a repository gets
 * that one, or nothing if it is not open — never another repository's service
 * standing in, which is the mix-up sessions exist to end. A request that
 * named none gets the active one, as every caller did before sessions.
 */
export function sessionFor(): RepoSession | null {
  const named = requestedRepo()
  return named ? sessionAt(named) : activeSession()
}

export function allSessions(): RepoSession[] {
  return [...sessions.values()]
}

/**
 * Register a session and make it the active one. Returns the sessions
 * evicted to stay under MAX_SESSIONS — the caller owns their watchers and
 * timers and closes them; the active one is never evicted.
 */
export function registerSession(session: RepoSession): RepoSession[] {
  sessions.set(session.path, session)
  setActiveSession(session.path)
  const evicted: RepoSession[] = []
  if (sessions.size > MAX_SESSIONS) {
    const byAge = [...sessions.values()].filter(s => s.path !== activePath).sort((a, b) => a.lastActive - b.lastActive)
    while (sessions.size > MAX_SESSIONS && byAge.length) {
      const victim = byAge.shift()!
      sessions.delete(victim.path)
      evicted.push(victim)
    }
  }
  return evicted
}

export function setActiveSession(path: string | null): void {
  activePath = path
  const s = sessionAt(path)
  if (s) s.lastActive = ++activations
}

/** Forget a session. The caller closes its watchers and timer first. */
export function unregisterSession(path: string): RepoSession | null {
  const s = sessions.get(path) ?? null
  sessions.delete(path)
  if (activePath === path) activePath = null
  return s
}

/** Tests only: a clean registry. */
export function resetSessions(): void {
  sessions.clear()
  activePath = null
}
