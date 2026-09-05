// A repository, open: its service, its watchers, its auto-fetch. Opening another one replaces all three.
// This is the seed of a session per repository — everything here is keyed by nothing yet.
import { join } from 'path'
import { existsSync } from 'fs'
import { GitService } from './git-service'
import { parseAutoFetchMinutes, shouldUseSshCommand, buildSshCommand, updateSubmodulesIfEnabled } from './settings-helpers'
import { addRecentRepo } from './recent-repos'
import { gitBinary } from './git-service'
import fs from 'fs'
import path from 'path'
import { sendToWindow, state } from './app-state'
import { readSettings } from './settings-store'

// ── Auto-fetch timer ────────────────────────────────────────────
// Re-armed whenever the active repo changes (openRepoAt) or the interval
// setting changes (settings:set). 0/unset = disabled, the usual
// "Auto-Fetch Interval" (0 disables auto-fetch).
//
// This is the ONE owner of the periodic fetch. The renderer used to arm a
// second timer on the same setting, so every interval fetched twice, and only
// that copy told anyone: this one swallowed its result. It reports each run to
// the window now — the status bar's "fetched N min ago" and the graph follow
// it, and a failure is a message rather than a silence.
export let autoFetchTimer: ReturnType<typeof setInterval> | null = null

export let autoFetchRunning = false

export function scheduleAutoFetch(): void {
  if (autoFetchTimer) { clearInterval(autoFetchTimer); autoFetchTimer = null }
  const minutes = parseAutoFetchMinutes(readSettings().autoFetchInterval)
  if (!state.gitService || !minutes) return
  autoFetchTimer = setInterval(() => { void autoFetchTick() }, minutes * 60 * 1000)
}

export async function autoFetchTick(): Promise<void> {
  const svc = state.gitService
  // A slow remote must not stack a second fetch on the first.
  if (!svc || autoFetchRunning) return
  autoFetchRunning = true
  try {
    const r = await svc.fetch()
    sendToWindow('git:auto-fetched', { success: r.success, error: r.error })
  } catch (e: any) {
    sendToWindow('git:auto-fetched', { success: false, error: e?.message ?? String(e) })
  } finally {
    autoFetchRunning = false
  }
}

// ── Auto-update submodules ──────────────────────────────────────
// Called after a successful checkout/pull/merge/rebase when the
// "Keep submodules up to date" setting is on.
export async function maybeUpdateSubmodules(): Promise<void> {
  if (!state.gitService) return
  try {
    await updateSubmodulesIfEnabled(state.gitService, readSettings().autoUpdateSubmodules)
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

export let gitDirWatcher: fs.FSWatcher | null = null

export let workingDirWatcher: fs.FSWatcher | null = null

export let gitDebounce: ReturnType<typeof setTimeout> | null = null

export let workingDebounce: ReturnType<typeof setTimeout> | null = null

export function stopWatchers() {
  gitDirWatcher?.close(); gitDirWatcher = null
  workingDirWatcher?.close(); workingDirWatcher = null
  if (gitDebounce) { clearTimeout(gitDebounce); gitDebounce = null }
  if (workingDebounce) { clearTimeout(workingDebounce); workingDebounce = null }
}

export function startWatching(repoPath: string) {
  stopWatchers()
  const gitDir = path.join(repoPath, '.git')
  if (!fs.existsSync(gitDir)) return

  const send = (channel: string) => {
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.send(channel)
    }
  }

  // Watch .git → covers commits, staging, branches, conflicts, rebase, fetch
  try {
    gitDirWatcher = fs.watch(gitDir, { recursive: true }, () => {
      if (gitDebounce) clearTimeout(gitDebounce)
      gitDebounce = setTimeout(() => send('git:repo-changed'), 200)
    })
  } catch { /* git dir may not be watchable in all setups */ }

  // Watch working tree → covers unstaged file edits from external editors
  try {
    workingDirWatcher = fs.watch(repoPath, { recursive: true }, (_type, filename) => {
      if (!filename || filename.startsWith('.git')) return
      if (workingDebounce) clearTimeout(workingDebounce)
      workingDebounce = setTimeout(() => send('git:working-changed'), 1500)
    })
  } catch { /* ignore */ }
}

// ── Helpers ───────────────────────────────────────────────────
export async function openRepoAt(rawRepoPath: string): Promise<{ path?: string; name?: string; error?: string }> {
  // Settle on NFC: a path coming from a gitgui:// deep link, a recent-repos
  // entry or a macOS directory listing can name the same accented folder in
  // different Unicode normalizations, and the renderer compares these strings
  // to decide whether a tab is already open for the repo.
  const repoPath = rawRepoPath.normalize('NFC')
  try {
    const svc = new GitService(repoPath)
    await svc.checkRepo()
    state.gitService = svc
    addRecentRepo(repoPath)
    startWatching(repoPath)
    scheduleAutoFetch()
    const name = repoPath.split('/').pop()!
    return { path: repoPath, name }
  } catch (e: any) {
    return { error: e.message }
  }
}
