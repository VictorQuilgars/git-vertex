// A repository, open: its service, its watchers, its auto-fetch. One session
// per open repository (sessions.ts holds them); opening another one adds a
// session rather than replacing the first, so a repository in a background
// tab keeps being watched and fetched, and a request about it — named by the
// preload's envelope — is answered by its own service.
import { existsSync } from 'fs'
import { GitService } from './git-service'
import { parseAutoFetchMinutes, shouldUseSshCommand, buildSshCommand, updateSubmodulesIfEnabled } from './settings-helpers'
import { addRecentRepo } from './recent-repos'
import { gitBinary } from './git-service'
import fs from 'fs'
import path from 'path'
import { sendToWindow, state } from './app-state'
import { readSettings } from './settings-store'
import { type RepoSession, allSessions, newSession, registerSession, sessionAt, setActiveSession, unregisterSession } from './sessions'

// ── Auto-fetch timer, per session ───────────────────────────────
// Armed when a session opens, re-armed for every session when the interval
// setting changes. 0/unset = disabled. The ONE owner of the periodic fetch:
// the renderer used to arm a second timer on the same setting and only that
// copy told anyone. Each run is reported to the window with the repository it
// was for, so the tab that shows it — active or not — can follow.
export function scheduleAutoFetch(session?: RepoSession): void {
  const targets = session ? [session] : allSessions()
  const minutes = parseAutoFetchMinutes(readSettings().autoFetchInterval)
  for (const s of targets) {
    if (s.autoFetchTimer) { clearInterval(s.autoFetchTimer); s.autoFetchTimer = null }
    if (!minutes) continue
    s.autoFetchTimer = setInterval(() => { void autoFetchTick(s) }, minutes * 60 * 1000)
  }
}

export async function autoFetchTick(session: RepoSession): Promise<void> {
  // A slow remote must not stack a second fetch on the first.
  if (session.autoFetchRunning) return
  session.autoFetchRunning = true
  try {
    const r = await session.service.fetch()
    sendToWindow('git:auto-fetched', { repo: session.path, success: r.success, error: r.error })
  } catch (e: any) {
    sendToWindow('git:auto-fetched', { repo: session.path, success: false, error: e?.message ?? String(e) })
  } finally {
    session.autoFetchRunning = false
  }
}

// ── Auto-update submodules ──────────────────────────────────────
// Called after a successful checkout/pull/merge/rebase when the
// "Keep submodules up to date" setting is on. Runs against the repository of
// the request that called it.
export async function maybeUpdateSubmodules(): Promise<void> {
  const svc = state.gitService
  if (!svc) return
  try {
    await updateSubmodulesIfEnabled(svc, readSettings().autoUpdateSubmodules)
  } catch { /* best-effort */ }
}

// ── SSH key wiring ───────────────────────────────────────────────
// Writes/clears `core.sshCommand` in the *global* gitconfig so every repo
// picks it up, instead of intercepting each simple-git call individually.
export async function applySshConfig(): Promise<void> {
  const s = readSettings()
  const { execFile } = await import('child_process')
  const { promisify } = await import('util')
  const exec = promisify(execFile)
  try {
    if (shouldUseSshCommand(s)) {
      await exec(gitBinary(), ['config', '--global', 'core.sshCommand', buildSshCommand(s.sshPrivateKey!)])
    } else {
      await exec(gitBinary(), ['config', '--global', '--unset', 'core.sshCommand']).catch(() => {})
    }
  } catch { /* best-effort */ }
}

// ── Watchers, per session ───────────────────────────────────────
function stopWatching(session: RepoSession): void {
  session.gitDirWatcher?.close(); session.gitDirWatcher = null
  session.workingDirWatcher?.close(); session.workingDirWatcher = null
  if (session.gitDebounce) { clearTimeout(session.gitDebounce); session.gitDebounce = null }
  if (session.workingDebounce) { clearTimeout(session.workingDebounce); session.workingDebounce = null }
}

function startWatching(session: RepoSession): void {
  stopWatching(session)
  const gitDir = path.join(session.path, '.git')
  if (!existsSync(gitDir)) return
  // Every change names its repository: the window routes it to the tab that
  // shows it, and refreshes a background one quietly rather than the visible.
  const payload = { repo: session.path }

  // Watch .git → covers commits, staging, branches, conflicts, rebase, fetch
  try {
    session.gitDirWatcher = fs.watch(gitDir, { recursive: true }, () => {
      if (session.gitDebounce) clearTimeout(session.gitDebounce)
      session.gitDebounce = setTimeout(() => sendToWindow('git:repo-changed', payload), 200)
    })
  } catch { /* git dir may not be watchable in all setups */ }

  // Watch working tree → covers unstaged file edits from external editors
  try {
    session.workingDirWatcher = fs.watch(session.path, { recursive: true }, (_type, filename) => {
      if (!filename || filename.startsWith('.git')) return
      if (session.workingDebounce) clearTimeout(session.workingDebounce)
      session.workingDebounce = setTimeout(() => sendToWindow('git:working-changed', payload), 1500)
    })
  } catch { /* ignore */ }
}

function dispose(session: RepoSession): void {
  stopWatching(session)
  if (session.autoFetchTimer) { clearInterval(session.autoFetchTimer); session.autoFetchTimer = null }
}

/** Every session's watchers and timers, stopped — the window is closing. */
export function stopWatchers(): void {
  for (const s of allSessions()) dispose(s)
}

// ── Open / close ────────────────────────────────────────────────
export async function openRepoAt(rawRepoPath: string): Promise<{ path?: string; name?: string; error?: string }> {
  // Settle on NFC: a path coming from a gitgui:// deep link, a recent-repos
  // entry or a macOS directory listing can name the same accented folder in
  // different Unicode normalizations, and the renderer compares these strings
  // to decide whether a tab is already open for the repo.
  const repoPath = rawRepoPath.normalize('NFC')
  const name = repoPath.split('/').pop()!
  // Already open behind another tab: make it the active one, and that is all.
  // Its watchers and its timer never stopped.
  const existing = sessionAt(repoPath)
  if (existing) {
    setActiveSession(repoPath)
    addRecentRepo(repoPath)
    return { path: repoPath, name }
  }
  try {
    const svc = new GitService(repoPath)
    await svc.checkRepo()
    const session = newSession(repoPath, name, svc)
    for (const evicted of registerSession(session)) dispose(evicted)
    addRecentRepo(repoPath)
    startWatching(session)
    scheduleAutoFetch(session)
    return { path: repoPath, name }
  } catch (e: any) {
    return { error: e.message }
  }
}

/** The tab that showed this repository is gone: stop watching it, forget it. */
export function closeRepo(rawRepoPath: string): void {
  const session = unregisterSession(rawRepoPath.normalize('NFC'))
  if (session) dispose(session)
}
