// A repository, open: its service, its watchers, its auto-fetch. One session
// per open repository (sessions.ts holds them); opening another one adds a
// session rather than replacing the first, so a repository in a background
// tab keeps being watched and fetched, and a request about it — named by the
// preload's envelope — is answered by its own service.
import { existsSync } from 'fs'
import { GitService } from './git-service'
import { parseAutoFetchMinutes, shouldUseSshCommand, buildSshCommand, updateSubmodulesIfEnabled } from './settings-helpers'
import { addRecentRepo } from './recent-repos'
import { gitBinary, gitEnv } from './git-service'
import { gitDirChangeMatters, makeWatchFilter, type IgnoreProbe } from './watch-filter'
import { describeTuning, isTuned, tuneRepository, type TuningRunner } from './repo-tuning'
import { getGitBinary } from './git-binary'
import { execFile } from 'child_process'
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

// ── Git's own caches, for a repository the user asked us to tune ──
//
// Off unless `repoTuning` is on, because this writes into the repository's
// own config and every git client on the machine reads it afterwards — see
// repo-tuning.ts for what and why. Run once per repository, in the
// background, after the window already has its graph: `commit-graph write`
// on a deep history is seconds of CPU, and it must not be seconds the user
// spends looking at an empty pane.
function tuningRunner(repoPath: string): TuningRunner {
  return (args) => new Promise(resolve => {
    execFile(
      gitBinary(),
      ['-C', repoPath, ...args],
      { env: gitEnv(), maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => resolve({
        code: err ? ((err as { code?: unknown }).code as number ?? 1) : 0,
        stdout: stdout || '',
        stderr: stderr || '',
      }),
    )
  })
}

async function maybeTune(repoPath: string): Promise<void> {
  if (readSettings().repoTuning !== 'true') return
  const run = tuningRunner(repoPath)
  try {
    if (await isTuned(run)) return
    const report = await tuneRepository(run, {
      gitVersion: getGitBinary().version,
      platform: process.platform,
    })
    console.log(`[git-vertex] tuned ${repoPath}: ${describeTuning(report)}`)
  } catch (e) {
    // A repository that cannot be tuned is a repository that works as before.
    console.log(`[git-vertex] could not tune ${repoPath}: ${(e as Error)?.message ?? e}`)
  }
}

// ── Watchers, per session ───────────────────────────────────────

/**
 * The ignored subset of `paths`, from git itself. `-z` on both sides because a
 * filename may contain anything but NUL, and `--stdin` so one process answers
 * for the whole batch.
 *
 * check-ignore exits 1 when NOTHING is ignored — success with an empty answer,
 * not a failure. Anything else is left to throw, and the filter reads a throw
 * as "refresh anyway".
 */
function checkIgnore(repoPath: string): IgnoreProbe {
  return (paths) => new Promise<string[]>((resolve, reject) => {
    const child = execFile(
      gitBinary(),
      ['-C', repoPath, 'check-ignore', '-z', '--stdin'],
      { env: gitEnv(), maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err && (err as { code?: number }).code !== 1) return reject(err)
        resolve(stdout.split('\0').filter(Boolean))
      },
    )
    child.on('error', reject)
    child.stdin?.end(paths.join('\0'))
  })
}

function stopWatching(session: RepoSession): void {
  session.gitDirWatcher?.close(); session.gitDirWatcher = null
  session.workingDirWatcher?.close(); session.workingDirWatcher = null
  if (session.gitDebounce) { clearTimeout(session.gitDebounce); session.gitDebounce = null }
  if (session.workingDebounce) { clearTimeout(session.workingDebounce); session.workingDebounce = null }
  session.workingPending.clear()
}

function startWatching(session: RepoSession): void {
  stopWatching(session)
  const gitDir = path.join(session.path, '.git')
  if (!existsSync(gitDir)) return
  // Every change names its repository: the window routes it to the tab that
  // shows it, and refreshes a background one quietly rather than the visible.
  const payload = { repo: session.path }

  // Watch .git → covers commits, staging, branches, conflicts, rebase, fetch.
  // Minus the object writes and the lock files, which cannot be the news on
  // their own and which hold a trailing debounce open for as long as they
  // keep coming — see gitDirChangeMatters.
  try {
    session.gitDirWatcher = fs.watch(gitDir, { recursive: true }, (_type, filename) => {
      if (filename && !gitDirChangeMatters(filename)) return
      if (session.gitDebounce) clearTimeout(session.gitDebounce)
      session.gitDebounce = setTimeout(() => sendToWindow('git:repo-changed', payload), 200)
    })
  } catch { /* git dir may not be watchable in all setups */ }

  // Watch working tree → covers unstaged file edits from external editors.
  //
  // The watcher is recursive, so it also sees node_modules, dist, coverage and
  // every other thing the repository ignores — and a refresh is ten git
  // processes. What the debounce collects is therefore asked about before
  // anyone is told: see watch-filter.ts.
  session.watchFilter ??= makeWatchFilter(checkIgnore(session.path))
  try {
    session.workingDirWatcher = fs.watch(session.path, { recursive: true }, (_type, filename) => {
      // The `.git` DIRECTORY, not everything whose name starts with it: the
      // old test also swallowed `.gitignore` and `.gitattributes`, which are
      // the two files in the tree that change what the staging area shows.
      if (!filename) return
      if (filename === '.git' || filename.startsWith('.git/') || filename.startsWith('.git\\')) return
      session.workingPending.add(filename)
      if (session.workingDebounce) clearTimeout(session.workingDebounce)
      session.workingDebounce = setTimeout(() => {
        const batch = [...session.workingPending]
        session.workingPending.clear()
        void session.watchFilter!.worthRefreshing(batch).then(worth => {
          if (worth) sendToWindow('git:working-changed', payload)
        })
      }, 1500)
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
    // Behind the window, not in front of it.
    setTimeout(() => { void maybeTune(repoPath) }, 3000)
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
