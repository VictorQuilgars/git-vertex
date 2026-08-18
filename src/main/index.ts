import { app, shell, BrowserWindow, ipcMain, dialog, Notification, systemPreferences } from 'electron'
import { join, dirname } from 'path'
import { existsSync, readdirSync } from 'fs'
import { createHash } from 'crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import simpleGit from 'simple-git'

import { GitService, type CompareAxis } from './git-service'
import { RELEASE_NOTES } from './release-notes'
import {
  parseAutoFetchMinutes, shouldUseSshCommand, buildSshCommand, buildToolInvocation,
  resolveTerminalLaunch, findAvailableKeyPath, safeTempFileName, updateSubmodulesIfEnabled,
} from './settings-helpers'
import { getRecentRepos, addRecentRepo, removeRecentRepo, getWorkspaces, setRepoWorkspace } from './recent-repos'
import {
  simpleGitEnv, gitEnv, gitBinary, makeSimpleGit,
  parseGitVersion, isGitVersionAtLeast, MIN_GIT_FOR_CONFLICT_PREDICTION,
} from './git-service'
import { initGitBinary, gitBinaryReady } from './git-binary'
import { ThemeStore } from './theme-store'
import { BUILT_IN_THEME_IDS } from './theme-validate'
import { startOAuthFlow, handleOAuthCallback } from './github-auth'
import {
  splashHtml, themeCanvas, SPLASH_THEMES, SPLASH_ANIMATION_MS, SPLASH_STILL_MS,
} from './splash'
import type { SplashTheme } from './splash'
import iconPng from '../../resources/icon.png?asset'
import iconIco from '../../resources/icon.ico?asset'

let mainWindow: BrowserWindow
let splashWindow: BrowserWindow | null = null
let splashShownAt = 0
let gitService: GitService | null = null

// ── Auto-fetch timer ────────────────────────────────────────────
// Re-armed whenever the active repo changes (openRepoAt) or the interval
// setting changes (settings:set). 0/unset = disabled, the usual
// "Auto-Fetch Interval" (0 disables auto-fetch).
let autoFetchTimer: ReturnType<typeof setInterval> | null = null
function scheduleAutoFetch(): void {
  if (autoFetchTimer) { clearInterval(autoFetchTimer); autoFetchTimer = null }
  const minutes = parseAutoFetchMinutes(readSettings().autoFetchInterval)
  if (!gitService || !minutes) return
  autoFetchTimer = setInterval(() => { gitService?.fetch().catch(() => {}) }, minutes * 60 * 1000)
}

// ── Auto-update submodules ──────────────────────────────────────
// Called after a successful checkout/pull/merge/rebase when the
// "Keep submodules up to date" setting is on.
async function maybeUpdateSubmodules(): Promise<void> {
  if (!gitService) return
  try {
    await updateSubmodulesIfEnabled(gitService, readSettings().autoUpdateSubmodules)
  } catch { /* best-effort */ }
}

// ── SSH key wiring ───────────────────────────────────────────────
// Writes/clears `core.sshCommand` in the *global* gitconfig so every repo
// picks it up, instead of intercepting each simple-git call individually.
async function applySshConfig(): Promise<void> {
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

// Small branded splash shown while the main window boots (and right after an
// update relaunches the app). Frameless + transparent so only the rounded card
// shows. Self-contained HTML, so nothing extra needs packaging.
/**
 * The theme the user last chose, for the two things that are painted before the
 * renderer exists: the splash and the main window's background.
 *
 * It comes straight out of settings.json — SettingsModal writes `theme` there,
 * and SettingsContext reads it back through settings:get-all. The localStorage
 * mirror is only so main.tsx can beat React to the first paint; it is not the
 * record, and main could not read it anyway.
 *
 * Falls back to the dark theme on anything unexpected, which also covers the
 * user who has never opened preferences.
 */
function bootTheme(): SplashTheme {
  try {
    const t = readSettings().theme
    return (SPLASH_THEMES as string[]).includes(t) ? (t as SplashTheme) : 'aqua-dark'
  } catch {
    return 'aqua-dark'
  }
}

function createSplash(theme: SplashTheme): void {
  splashWindow = new BrowserWindow({
    width: 360,
    height: 420,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    center: true,
    focusable: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: { sandbox: true }
  })
  splashWindow.loadURL('data:text/html;charset=utf-8,'
    + encodeURIComponent(splashHtml(app.getVersion(), theme)))
  splashWindow.once('ready-to-show', () => { splashShownAt = Date.now(); splashWindow?.show() })
}

/**
 * How much of the splash's sequence is still to play, in ms.
 *
 * On a cold Windows boot the app takes longer than the animation and this is 0.
 * On macOS it is routinely the other way round — the window is ready in well
 * under a second — and the delay used to be applied to the WRONG window: the
 * main window was shown at once and the splash, which is alwaysOnTop, went on
 * floating over a live app for the rest of its hold. So the wait belongs here,
 * before the reveal.
 *
 * If the splash never came up, splashShownAt is 0, the elapsed time is enormous
 * and this is 0 — the app must never be held hostage to a splash that failed.
 */
function splashRemaining(): number {
  if (!splashWindow || splashShownAt === 0) return 0
  let full: number = SPLASH_ANIMATION_MS
  try {
    // No story to wait for when the system asks for less motion: the splash's
    // own media query puts every element straight at its final state.
    if (systemPreferences.getAnimationSettings().prefersReducedMotion) full = SPLASH_STILL_MS
  } catch { /* not every platform answers; the full hold is the safe default */ }
  return Math.max(0, full - (Date.now() - splashShownAt))
}

/**
 * Takes the splash OFF SCREEN, synchronously, and disposes of it afterwards.
 *
 * The two halves are separate on purpose. `close()` is not an instruction to
 * disappear: it fires a close event, unloads the page and tears the window
 * down, and the splash stays on screen for all of it — alwaysOnTop, so on top
 * of the app that has just appeared. Measured at 225ms with a close() and a
 * 120ms grace before it, which is plainly visible.
 *
 * `hide()` unmaps the window in this tick, so it lands in the same frame as the
 * reveal it is paired with. The teardown then happens with nothing on screen.
 */
function closeSplash(): void {
  if (!splashWindow) return
  const win = splashWindow
  splashWindow = null
  if (!win.isDestroyed()) win.hide()
  setImmediate(() => { if (!win.isDestroyed()) win.destroy() })
}

// ── Repo file watcher ─────────────────────────────────────────
// Watches .git (git state) and the working tree root (unstaged changes).
// Two separate debounces: git state fires fast, working tree fires slower.
import fs from 'fs'
import path from 'path'
import os from 'os'

let gitDirWatcher: fs.FSWatcher | null = null
let workingDirWatcher: fs.FSWatcher | null = null
let gitDebounce: ReturnType<typeof setTimeout> | null = null
let workingDebounce: ReturnType<typeof setTimeout> | null = null

function stopWatchers() {
  gitDirWatcher?.close(); gitDirWatcher = null
  workingDirWatcher?.close(); workingDirWatcher = null
  if (gitDebounce) { clearTimeout(gitDebounce); gitDebounce = null }
  if (workingDebounce) { clearTimeout(workingDebounce); workingDebounce = null }
}

function startWatching(repoPath: string) {
  stopWatchers()
  const gitDir = path.join(repoPath, '.git')
  if (!fs.existsSync(gitDir)) return

  const send = (channel: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel)
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

// ── Desktop notifications ──────────────────────────────────────
// settingKey gates the notification via settings.json; defaultEnabled
// is used when the setting was never written.
function notify(title: string, body: string, settingKey?: string, defaultEnabled = true): void {
  if (settingKey) {
    const val = readSettings()[settingKey]
    const enabled = val === undefined ? defaultEnabled : val !== 'false'
    if (!enabled) return
  }
  if (!Notification.isSupported()) return
  try { new Notification({ title, body }).show() } catch { /* ignore */ }
}

function createWindow(): void {
  const theme = bootTheme()
  createSplash(theme)
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    // Shown in the Windows title bar / taskbar tooltip / Alt-Tab before the
    // renderer's <title> takes over — keep it the product name, not "git-gui".
    title: 'Git Vertex',
    // What shows between the window appearing and the renderer's first paint.
    // A snapshot of the theme's --seed-canvas, for the same reason the splash
    // carries one: the main process cannot read tokens.css. It used to be a
    // fixed dark value, so a light-theme user got a black flash at the end of
    // every launch — the very thing main.tsx's pre-mount read exists to avoid,
    // one layer further out. Guarded by splash-palette.test.
    backgroundColor: themeCanvas(theme),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    // Windows needs a .ico (an .icns is not a valid window icon there and left
    // the taskbar/title-bar showing the default Electron logo); Linux uses the
    // PNG. macOS ignores this and takes the icon from the app bundle.
    icon: process.platform === 'win32' ? iconIco : iconPng,
    // Off unless GV_SCREENSHOTS=1, which only an external capture pipeline
    // sets. macOS clamps a window to the display's work area, so automated
    // captures would come out at whatever height the operator's menu bar and
    // Dock leave over — a different size on every machine. This lets such a
    // run pin one canvas size instead.
    enableLargerThanScreen: process.env.GV_SCREENSHOTS === '1',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  })

  mainWindow.on('ready-to-show', () => {
    // Ready is not the same as due: hold until the splash has finished playing,
    // then hand over. Zero on a slow boot, where ready-to-show is already late.
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      // Splash off FIRST, then the reveal, both in this tick so the compositor
      // sees one frame. The other order leaves the splash over a live app for
      // however long its teardown takes, which is the bug this pairing fixes.
      closeSplash()
      mainWindow.show()
    }, splashRemaining())
  })

  // In macOS fullscreen the traffic-light buttons are hidden, so the renderer
  // must drop the 72px spacer that reserves room for them.
  const sendFullscreen = () => mainWindow?.webContents.send('app:fullscreen-changed', mainWindow.isFullScreen())
  mainWindow.on('enter-full-screen', sendFullscreen)
  mainWindow.on('leave-full-screen', sendFullscreen)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Register custom protocol: GitHub OAuth callback + deep links
// (gitgui://open — used by git-vertex-mcp's open_in_git_vertex tool)
app.setAsDefaultProtocolClient('gitgui')

// ── Deep links ────────────────────────────────────────────────
// gitgui://open?repo=<abs path>&view=graph|resolve|commit|propose-commit|propose-rebase
//               &file=<rel>&hash=<sha>&proposal=<temp file>
// Opens the repo, and optionally the 3-way conflict resolver on `file` or
// the commit details of `hash`. If the app is cold-starting from the URL,
// the payload is parked until the renderer asks for it.
//
// `proposal`, from git-vertex-mcp's open_in_git_vertex: a throwaway file
// (always under the OS tmp dir's git-vertex-mcp-proposals/ folder — never
// an arbitrary path) holding a proposed conflict resolution. Read here
// (never handed to the renderer as a raw path) and inlined as
// `proposalContent`, then deleted — it's single-use and the MCP process
// may not even outlive this call.
interface DeepLink { repo: string; view: string; file?: string; hash?: string; proposalContent?: string }
let pendingDeepLink: DeepLink | null = null

function readAndConsumeProposal(proposalPath: string | null): string | undefined {
  if (!proposalPath) return undefined
  try {
    const dir = fs.realpathSync(path.join(os.tmpdir(), 'git-vertex-mcp-proposals'))
    const abs = fs.realpathSync(proposalPath)
    if (!abs.startsWith(dir + path.sep)) {
      // Not ours to read. Most likely the MCP server resolved a different tmp
      // dir than we do (different TMPDIR between the agent's process and the
      // app), which silently strips the payload — so say which paths disagreed.
      console.error(`[deeplink] proposal outside the expected directory, ignored: ${abs} (expected under ${dir})`)
      return undefined
    }
    const content = fs.readFileSync(abs, 'utf-8')
    fs.unlink(abs, () => {}) // best-effort cleanup, single-use file
    return content
  } catch (e) {
    // Single-use file: already consumed by an earlier launch, or the MCP
    // process cleaned up before we got here. The renderer reports the missing
    // payload to the user; this line says why it went missing.
    console.error(`[deeplink] could not read proposal ${proposalPath}:`, e)
    return undefined
  }
}

function parseDeepLink(url: string): DeepLink | null {
  try {
    const u = new URL(url)
    // new URL('gitgui://open?...') puts "open" in host (or pathname on some platforms)
    const action = u.host || u.pathname.replace(/^\/+/, '')
    if (action !== 'open') return null
    const repo = u.searchParams.get('repo')
    if (!repo) return null
    return {
      repo,
      view: u.searchParams.get('view') ?? 'graph',
      file: u.searchParams.get('file') ?? undefined,
      hash: u.searchParams.get('hash') ?? undefined,
      proposalContent: readAndConsumeProposal(u.searchParams.get('proposal')),
    }
  } catch { return null }
}

function dispatchDeepLink(link: DeepLink): void {
  if (mainWindow && !mainWindow.webContents.isLoading()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('deeplink:open', link)
  } else {
    // Cold start: the renderer pulls it via app:get-pending-deeplink once mounted.
    pendingDeepLink = link
  }
}

ipcMain.handle('app:get-pending-deeplink', () => {
  const link = pendingDeepLink
  pendingDeepLink = null
  return link
})

async function handleProtocolUrl(url: string): Promise<void> {
  if (url.startsWith('gitgui://callback')) {
    const result = await handleOAuthCallback(url)
    if ('token' in result) {
      const s = readSettings(); s.githubToken = result.token; writeSettings(s)
      mainWindow?.webContents.send('github:auth-complete', { token: result.token })
    } else {
      mainWindow?.webContents.send('github:auth-complete', { error: result.error })
    }
    return
  }
  const link = parseDeepLink(url)
  if (link) dispatchDeepLink(link)
}

// Windows: only one instance allowed — second instance passes its args to the first
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', async (_event, argv) => {
    // Bring existing window to front
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    // Find gitgui:// URL in argv (Windows/Linux pass it as a CLI argument)
    const url = argv.find(a => a.startsWith('gitgui://'))
    if (url) await handleProtocolUrl(url)
  })
}

// macOS: app already running, callback arrives via open-url
app.on('open-url', async (event, url) => {
  event.preventDefault()
  await handleProtocolUrl(url)
})

// Windows/Linux cold start: the URL arrives in the process argv.
{
  const coldUrl = process.argv.find(a => a.startsWith('gitgui://'))
  if (coldUrl) {
    const link = parseDeepLink(coldUrl)
    if (link) pendingDeepLink = link
  }
}

// Track downloaded update so late-opening windows can query state
let downloadedUpdateVersion: string | null = null
let downloadedUpdateFile: string | null = null

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.victor.gitvertex')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  // Which git we run, resolved before the window can ask for anything. Launched
  // from the Finder, this process has the truncated PATH
  // (/usr/bin:/bin:/usr/sbin:/sbin) and would otherwise use Apple's git 2.39
  // even for someone whose terminal has a newer one first. Not awaited: it
  // spawns a login shell, which can take a second on a busy profile, and every
  // git call falls back to the plain 'git' until it lands.
  void initGitBinary(readSettings().gitBinaryPath)
    .then(info => console.log(`[git] ${info.version ?? 'unknown version'} — ${info.path} (${info.source})`))

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Auto-updater (only in production)
  if (!is.dev) {
    // Don't download in the background: the renderer starts the download when
    // the user chooses to update, so the progress bar is actually visible to
    // them (an already-downloaded update would jump straight to "installing").
    autoUpdater.autoDownload = false
    autoUpdater.on('update-available', (info) => {
      console.log('[updater] update available:', info.version)
      mainWindow?.webContents.send('updater:update-available', info.version)
    })
    autoUpdater.on('update-not-available', (info) => {
      console.log('[updater] up to date:', info.version)
      mainWindow?.webContents.send('updater:not-available')
    })
    autoUpdater.on('download-progress', (progress) => {
      mainWindow?.webContents.send('updater:download-progress', Math.round(progress.percent))
    })
    autoUpdater.on('update-downloaded', (info) => {
      console.log('[updater] downloaded:', info.version, info.downloadedFile)
      downloadedUpdateVersion = info.version
      downloadedUpdateFile = info.downloadedFile ?? null
      mainWindow?.webContents.send('updater:update-downloaded', info.version)
      notify('Update available', `Version ${info.version} is ready to install.`, 'notifyUpdate')
    })
    autoUpdater.on('error', (err) => {
      console.error('[updater] error:', err.message)
      mainWindow?.webContents.send('updater:error', err.message)
    })
    // Plain check (no auto-download): surfaces update-available to the renderer,
    // which shows the discreet badge next to the notification bell. Check a few
    // seconds after boot (network settled), then poll every 30 min so an update
    // released while the app is open is picked up without a restart.
    const runCheck = () => autoUpdater.checkForUpdates().catch(err => {
      console.error('[updater] checkForUpdates failed:', err?.message ?? err)
    })
    setTimeout(runCheck, 4000)
    setInterval(runCheck, 30 * 60 * 1000)
  }
})

app.on('window-all-closed', () => {
  stopWatchers()
  if (process.platform !== 'darwin') app.quit()
})

// ── Helpers ───────────────────────────────────────────────────
async function openRepoAt(rawRepoPath: string): Promise<{ path?: string; name?: string; error?: string }> {
  // Settle on NFC: a path coming from a gitgui:// deep link, a recent-repos
  // entry or a macOS directory listing can name the same accented folder in
  // different Unicode normalizations, and the renderer compares these strings
  // to decide whether a tab is already open for the repo.
  const repoPath = rawRepoPath.normalize('NFC')
  try {
    const svc = new GitService(repoPath)
    await svc.checkRepo()
    gitService = svc
    addRecentRepo(repoPath)
    startWatching(repoPath)
    scheduleAutoFetch()
    const name = repoPath.split('/').pop()!
    return { path: repoPath, name }
  } catch (e: any) {
    return { error: e.message }
  }
}

// ── IPC: Repo management ──────────────────────────────────────
ipcMain.handle('app:is-fullscreen', () => mainWindow?.isFullScreen() ?? false)

// What the installed git can do. Drives the startup notice — a git older than
// MIN_GIT_FOR_CONFLICT_PREDICTION makes the pre-merge/rebase warning a no-op,
// and a feature that silently never runs is worse than one the user knows is
// missing — and the Git section of Settings.
//
// `path` is part of the answer, not decoration: on a machine with both Apple's
// git and Homebrew's, a version number alone sends you looking for a git you do
// not have. Probing failures answer "capable" so a missing or unusual git never
// produces a nag.
ipcMain.handle('app:git-capabilities', async () => {
  // Resolution may still be in flight at first paint (it spawns a login shell),
  // and answering with the fallback would report the confusion we just fixed.
  const { version, path, source, searchPath } = await gitBinaryReady()
  if (!version) {
    return { version: null, path, source, conflictPrediction: true, minimumForPrediction: MIN_GIT_FOR_CONFLICT_PREDICTION }
  }
  return {
    version,
    path,
    source,
    // Shown in Settings so "why is it picking that one?" has an answer.
    searchPath: searchPath ?? process.env.PATH ?? '',
    conflictPrediction: isGitVersionAtLeast(version, MIN_GIT_FOR_CONFLICT_PREDICTION),
    minimumForPrediction: MIN_GIT_FOR_CONFLICT_PREDICTION,
  }
})

// Re-resolve after the gitBinaryPath setting changes, so Settings can show the
// new version and path without a restart. Returns the same shape as
// app:git-capabilities' probe for the caller to display.
ipcMain.handle('app:resolve-git-binary', async (_e, explicitPath?: string) => {
  const info = await initGitBinary(
    explicitPath !== undefined ? explicitPath : readSettings().gitBinaryPath
  )
  return { version: info.version, path: info.path, source: info.source }
})

ipcMain.handle('app:get-recent-repos', () => getRecentRepos())

ipcMain.handle('app:remove-recent-repo', (_event, path: string) => removeRecentRepo(path))

ipcMain.handle('app:get-workspaces', () => getWorkspaces())

ipcMain.handle('app:set-repo-workspace', (_event, path: string, workspace: string) =>
  setRepoWorkspace(path, workspace))

ipcMain.handle('git:open-repo', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Open a Git repository'
  })
  if (result.canceled || result.filePaths.length === 0) return { error: 'cancelled' }
  return openRepoAt(result.filePaths[0])
})

ipcMain.handle('git:set-repo', async (_event, repoPath: string) => {
  return openRepoAt(repoPath)
})

// Create a new repository: git init in the chosen (possibly empty) directory,
// then open it. Idempotent if the directory is already a repo.
ipcMain.handle('git:init-repo', async (_event, dir: string) => {
  try {
    await makeSimpleGit(dir).init(['-b', readSettings().defaultBranchName?.trim() || 'main'])
    return openRepoAt(dir)
  } catch (e: any) {
    return { error: e.message }
  }
})

// "Initialize a Repository" (Local Only): create <location>/<name>,
// git init on the given branch, optionally drop a .gitignore/LICENSE (fetched
// from GitHub's template APIs) and run `git lfs install`.
ipcMain.handle('git:init-advanced', async (_e, opts: { location: string; name: string; branch?: string; gitignore?: string; license?: string; lfs?: boolean }) => {
  try {
    const { mkdirSync, writeFileSync } = await import('fs')
    const target = join(opts.location, opts.name)
    mkdirSync(target, { recursive: true })
    await makeSimpleGit(target).init(['-b', opts.branch?.trim() || 'main'])
    const token = readSettings().githubToken
    const ghHeaders: Record<string, string> = { Accept: 'application/vnd.github+json' }
    if (token) ghHeaders.Authorization = `Bearer ${token}`
    if (opts.gitignore) {
      try {
        const r = await fetch(`https://api.github.com/gitignore/templates/${opts.gitignore}`, { headers: ghHeaders })
        if (r.ok) { const d = await r.json() as any; writeFileSync(join(target, '.gitignore'), d.source ?? '') }
      } catch { /* optional */ }
    }
    if (opts.license) {
      try {
        const r = await fetch(`https://api.github.com/licenses/${opts.license}`, { headers: ghHeaders })
        if (r.ok) { const d = await r.json() as any; writeFileSync(join(target, 'LICENSE'), d.body ?? '') }
      } catch { /* optional */ }
    }
    if (opts.lfs) {
      try {
        const { execFile } = await import('child_process')
        const { promisify } = await import('util')
        await promisify(execFile)(gitBinary(), ['-C', target, 'lfs', 'install'])
      } catch { /* lfs not installed — skip */ }
    }
    return openRepoAt(target)
  } catch (e: any) { return { error: e.message } }
})

ipcMain.handle('github:list-gitignore-templates', async () => {
  try {
    const token = readSettings().githubToken
    const r = await fetch('https://api.github.com/gitignore/templates', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    return r.ok ? { templates: await r.json() } : { templates: [] }
  } catch { return { templates: [] } }
})

ipcMain.handle('github:list-licenses', async () => {
  try {
    const token = readSettings().githubToken
    const r = await fetch('https://api.github.com/licenses', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!r.ok) return { licenses: [] }
    const d = await r.json() as any[]
    return { licenses: d.map(l => ({ key: l.key, name: l.name })) }
  } catch { return { licenses: [] } }
})

// Init on GitHub.com: create the remote repo, optionally clone
// it to a chosen local folder.
ipcMain.handle('github:create-repo', async (_e, opts: { name: string; description?: string; private?: boolean; gitignore?: string; license?: string; cloneTo?: string }) => {
  const token = readSettings().githubToken
  if (!token) return { error: 'not_authenticated' }
  try {
    const r = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      body: JSON.stringify({
        name: opts.name,
        description: opts.description || '',
        private: !!opts.private,
        auto_init: true,
        gitignore_template: opts.gitignore || undefined,
        license_template: opts.license || undefined,
      }),
    })
    if (r.status === 403 || r.status === 404) return { error: 'scope' }
    if (!r.ok) { const e = await r.json().catch(() => ({})) as any; return { error: e.message || `HTTP ${r.status}` } }
    const d = await r.json() as any
    if (opts.cloneTo) {
      const target = join(opts.cloneTo, opts.name)
      try {
        // Clone over HTTPS with the token so private repos work.
        const authUrl = d.clone_url.replace('https://', `https://${token}@`)
        await makeSimpleGit().clone(authUrl, target)
        // Rewrite origin without the embedded token.
        await makeSimpleGit(target).remote(['set-url', 'origin', d.clone_url])
        const opened = await openRepoAt(target)
        return { ...opened, htmlUrl: d.html_url, fullName: d.full_name }
      } catch (e: any) { return { error: e.message, htmlUrl: d.html_url } }
    }
    return { htmlUrl: d.html_url, fullName: d.full_name }
  } catch (e: any) { return { error: e.message } }
})

ipcMain.handle('app:select-directory', async (_event, title?: string) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: title ?? 'Choose a folder'
  })
  if (result.canceled || result.filePaths.length === 0) return { path: null }
  return { path: result.filePaths[0] }
})

// ── IPC: Git read operations ───────────────────────────────────
ipcMain.handle('git:get-log', async (_event, options: { maxCount?: number; all?: boolean; refs?: string[]; excludes?: string[] } = {}) => {
  if (!gitService) return { error: 'No repo open' }
  return gitService.getLog(options)
})

ipcMain.handle('git:get-branches', async () => {
  if (!gitService) return { error: 'No repo open' }
  return gitService.getBranches()
})

ipcMain.handle('git:get-diff', async (_event, commitHash: string) => {
  if (!gitService) return { error: 'No repo open' }
  return gitService.getDiff(commitHash)
})

ipcMain.handle('git:diff-between-commits', async (_event, fromHash: string, toHash: string | null, axis?: CompareAxis) => {
  if (!gitService) return { diff: '', error: 'No repo open' }
  return gitService.diffBetweenCommits(fromHash, toHash, axis)
})

ipcMain.handle('git:files-between-commits', async (_event, fromHash: string, toHash: string | null, axis?: CompareAxis) => {
  if (!gitService) return { files: [], error: 'No repo open' }
  return gitService.filesBetweenCommits(fromHash, toHash, axis)
})

ipcMain.handle('git:get-merge-base', async (_event, a: string, b: string) => {
  if (!gitService) return { base: null, error: 'No repo open' }
  return gitService.getMergeBase(a, b)
})

ipcMain.handle('git:get-commit-files', async (_event, commitHash: string) => {
  if (!gitService) return { error: 'No repo open' }
  return gitService.getCommitFiles(commitHash)
})

ipcMain.handle('git:get-commit-body', async (_event, hash: string) => {
  if (!gitService) return { body: '' }
  return gitService.getCommitBody(hash)
})

ipcMain.handle('git:get-status', async () => {
  if (!gitService) return { error: 'No repo open' }
  return gitService.getStatus()
})

ipcMain.handle('git:get-stashes', async () => {
  if (!gitService) return { error: 'No repo open' }
  return gitService.getStashes()
})

ipcMain.handle('git:get-tracking', async () => {
  if (!gitService) return { branch: null, upstream: null, ahead: 0, behind: 0 }
  return gitService.getTracking()
})

// ── IPC: Git write operations ──────────────────────────────────
ipcMain.handle('git:checkout', async (_event, ref: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  const r = await gitService.checkout(ref)
  if (r.success) await maybeUpdateSubmodules()
  return r
})

ipcMain.handle('git:create-branch', async (_event, name: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.createBranch(name)
})

ipcMain.handle('git:delete-branch', async (_event, name: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.deleteBranch(name)
})

ipcMain.handle('git:get-upstream', async () => {
  if (!gitService) return { upstream: null }
  return gitService.getUpstream()
})

ipcMain.handle('git:fetch', async () => {
  if (!gitService) return { success: false, error: 'No repo open' }
  const before = await gitService.getRemoteRefs()
  const result = await gitService.fetch()
  if (result.success) {
    const after = await gitService.getRemoteRefs()
    let changed = 0
    for (const ref of Object.keys(after)) {
      if (before[ref] !== after[ref]) changed++
    }
    if (changed > 0) {
      notify(
        'New commits available',
        changed === 1
          ? '1 remote branch was updated.'
          : `${changed} remote branches were updated.`,
        'notifyFetch'
      )
    }
  }
  return result
})

ipcMain.handle('git:push', async () => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.push()
})

ipcMain.handle('git:push-to', async (_e, remote: string, branch: string, setUpstream: boolean, force = false) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.pushTo(remote, branch, setUpstream, force)
})

ipcMain.handle('git:pull', async (_event, mode?: 'ff' | 'ff-only' | 'rebase') => {
  if (!gitService) return { success: false, error: 'No repo open' }
  const r = await gitService.pull(mode)
  if (r.success) await maybeUpdateSubmodules()
  return r
})

// ── IPC: Staging & commit ─────────────────────────────────────
ipcMain.handle('git:get-working-changes', async () => {
  if (!gitService) return { staged: [], unstaged: [], untracked: [] }
  return gitService.getWorkingChanges()
})

ipcMain.handle('git:stage', async (_event, files: string[]) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.stage(files)
})

ipcMain.handle('git:stage-all', async () => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.stageAll()
})

ipcMain.handle('git:unstage', async (_event, files: string[]) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.unstage(files)
})

ipcMain.handle('git:commit', async (_event, message: string, amend = false) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  const sign = readSettings().gpgSign === 'true'
  const result = await gitService.commit(message, amend, sign)
  if (result.success) {
    const firstLine = message.split('\n')[0]
    notify('Commit created', firstLine, 'notifyCommit', false)
  }
  return result
})

ipcMain.handle('git:get-last-commit-message', async (_event, ref?: string) => {
  if (!gitService) return { message: '' }
  return gitService.getLastCommitMessage(ref)
})

ipcMain.handle('git:get-working-file-diff', async (_event, filepath: string, staged: boolean) => {
  if (!gitService) return { diff: '' }
  return gitService.getWorkingFileDiff(filepath, staged)
})

ipcMain.handle('git:discard-file', async (_event, file: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.discardFile(file)
})

// ── IPC: Commit operations ─────────────────────────────────
ipcMain.handle('git:cherry-pick', async (_event, hash: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.cherryPick(hash)
})

ipcMain.handle('git:revert', async (_event, hash: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.revert(hash)
})

ipcMain.handle('git:reset', async (_event, hash: string, mode: 'soft' | 'mixed' | 'hard') => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.reset(hash, mode)
})

ipcMain.handle('git:amend-message', async (_event, message: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.amendMessage(message)
})

ipcMain.handle('git:get-checkout-plan', async (_event, ref: string) => {
  if (!gitService) return { action: 'create-branch', error: 'No repo open' }
  return gitService.getCheckoutPlan(ref)
})

ipcMain.handle('git:checkout-tracking', async (_event, remoteRef: string, localName: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.checkoutTracking(remoteRef, localName)
})

ipcMain.handle('git:get-reword-plan', async (_event, hash: string) => {
  if (!gitService) return { canReword: false, isHead: false, rewrites: 0, reason: 'No repo open' }
  return gitService.getRewordPlan(hash)
})

ipcMain.handle('git:drop-commit', async (_event, hash: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.dropCommit(hash)
})

ipcMain.handle('git:move-commit', async (_event, hash: string, direction: 'up' | 'down') => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.moveCommit(hash, direction)
})

ipcMain.handle('git:diff-commit-to-working', async (_event, hash: string) => {
  if (!gitService) return { diff: '' }
  return gitService.diffCommitToWorking(hash)
})

// ── IPC: Branch operations ─────────────────────────────────
ipcMain.handle('git:create-branch-at', async (_event, name: string, hash: string, checkout: boolean) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.createBranchAt(name, hash, checkout)
})

ipcMain.handle('git:rename-branch', async (_event, oldName: string, newName: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.renameBranch(oldName, newName)
})

ipcMain.handle('git:merge', async (_event, branch: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  const r = await gitService.merge(branch)
  if (r.success) await maybeUpdateSubmodules()
  return r
})

ipcMain.handle('git:predict-conflicts', async (_event, theirs: string, ours?: string, mergeBase?: string) => {
  if (!gitService) return { files: [], error: 'No repo open' }
  return gitService.predictConflicts(theirs, ours, mergeBase)
})

ipcMain.handle('git:predict-rebase-conflicts', async (_event, upstream: string, branch?: string) => {
  if (!gitService) return { files: [], error: 'No repo open' }
  return gitService.predictRebaseConflicts(upstream, branch)
})

ipcMain.handle('git:rebase-onto', async (_event, branch: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  const r = await gitService.rebaseOnto(branch)
  if (r.success) await maybeUpdateSubmodules()
  return r
})

ipcMain.handle('git:push-branch', async (_event, branch: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.pushBranch(branch)
})

ipcMain.handle('git:push-to-commit', async (_event, hash: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.pushToCommit(hash)
})

ipcMain.handle('git:create-patch', async (_event, hash: string) => {
  if (!gitService) return { patch: '', error: 'No repo open' }
  return gitService.createPatch(hash)
})

// Saves patch text to a file the user picks (native save dialog) — used by
// "Create Patch..." in the commit context menu.
ipcMain.handle('dialog:save-patch', async (_event, content: string, suggestedName: string) => {
  if (!mainWindow) return { success: false, error: 'No window' }
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save the patch',
    defaultPath: suggestedName,
    filters: [{ name: 'Patch files', extensions: ['patch'] }],
  })
  if (result.canceled || !result.filePath) return { success: false, canceled: true }
  try {
    fs.writeFileSync(result.filePath, content, 'utf8')
    return { success: true, path: result.filePath }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('git:delete-remote-branch', async (_event, branch: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.deleteRemoteBranch(branch)
})

ipcMain.handle('git:set-upstream', async (_event, branch: string, upstream?: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.setUpstream(branch, upstream)
})

ipcMain.handle('git:move-branch-to', async (_event, branch: string, hash: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.moveBranchTo(branch, hash)
})

ipcMain.handle('git:rebase-branch-onto', async (_event, branch: string, hash: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  const r = await gitService.rebaseBranchOnto(branch, hash)
  if (r.success) await maybeUpdateSubmodules()
  return r
})

ipcMain.handle('git:merge-commit-into', async (_event, branch: string, hash: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  const r = await gitService.mergeCommitInto(branch, hash)
  if (r.success) await maybeUpdateSubmodules()
  return r
})

// ── IPC: Tag operations ────────────────────────────────────
ipcMain.handle('git:get-tags', async () => {
  if (!gitService) return { tags: [] }
  return gitService.getTags()
})

ipcMain.handle('git:create-tag', async (_event, name: string, hash?: string, message?: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.createTag(name, hash, message)
})

ipcMain.handle('git:delete-tag', async (_event, name: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.deleteTag(name)
})

ipcMain.handle('git:push-tag', async (_event, name: string, remote?: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.pushTag(name, remote)
})

ipcMain.handle('git:delete-remote-tag', async (_event, name: string, remote?: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.deleteRemoteTag(name, remote)
})

// ── IPC: Stash operations ──────────────────────────────────
ipcMain.handle('git:create-stash', async (
  _event,
  message?: string,
  opts?: { scope?: 'all' | 'staged' | 'unstaged'; paths?: string[] },
) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.createStash(message, opts)
})

ipcMain.handle('git:rename-stash', async (_event, index: number, message: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.renameStash(index, message)
})

ipcMain.handle('git:apply-stash', async (_event, index: number) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.applyStash(index)
})

ipcMain.handle('git:pop-stash', async (_event, index: number) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.popStash(index)
})

ipcMain.handle('git:drop-stash', async (_event, index: number) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.dropStash(index)
})

ipcMain.handle('git:stash-diff', async (_event, index: number) => {
  if (!gitService) return { diff: '' }
  return gitService.getStashDiff(index)
})

// ── IPC: Blame ─────────────────────────────────────────────
ipcMain.handle('git:get-blame', async (_event, hash: string, filepath: string) => {
  if (!gitService) return { lines: [] }
  return gitService.getBlame(hash, filepath)
})

// ── IPC: Submodules ────────────────────────────────────────
ipcMain.handle('git:get-submodules', async () => {
  if (!gitService) return { submodules: [] }
  return gitService.getSubmodules()
})

ipcMain.handle('git:init-submodule', async (_event, path: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.initSubmodule(path)
})

ipcMain.handle('git:update-submodule', async (_event, path: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.updateSubmodule(path)
})

// ── IPC: Extended search & branch comparison ───────────────
ipcMain.handle('git:search-in-diffs', async (_event, query: string) => {
  if (!gitService) return { hashes: [] }
  return gitService.searchInDiffs(query)
})

ipcMain.handle('git:compare-branches', async (_event, current: string, other: string) => {
  if (!gitService) return { ahead: [], behind: [] }
  return gitService.compareBranches(current, other)
})

// ── IPC: Interactive Rebase ────────────────────────────────
ipcMain.handle('git:get-rebase-sequence', async (_event, baseHash: string) => {
  if (!gitService) return { commits: [] }
  return gitService.getRebaseSequence(baseHash)
})

ipcMain.handle('git:interactive-rebase', async (_event, sequence: { action: string; hash: string }[], messages?: string[]) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.interactiveRebase(sequence, messages)
})

// ── IPC: Conflict resolution ───────────────────────────────
ipcMain.handle('git:get-conflicted-files', async () => {
  if (!gitService) return { files: [] }
  return gitService.getConflictedFiles()
})

ipcMain.handle('git:get-conflict-versions', async (_event, filepath: string) => {
  if (!gitService) return { base: '', ours: '', theirs: '' }
  return gitService.getConflictVersions(filepath)
})

ipcMain.handle('git:get-file-content', async (_event, filepath: string) => {
  if (!gitService) return { content: '', error: 'No repo open' }
  return gitService.getFileContent(filepath)
})

ipcMain.handle('git:get-file-at-commit', async (_event, commitHash: string, filepath: string) => {
  if (!gitService) return { content: '', error: 'No repo open' }
  return gitService.getFileAtCommit(commitHash, filepath)
})

ipcMain.handle('git:restore-file', async (_event, commitHash: string, paths: string[]) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.restoreFileFromCommit(commitHash, paths)
})

ipcMain.handle('git:apply-patch', async (_event, patch: string, reverse: boolean) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.applyPatch(patch, reverse)
})

ipcMain.handle('git:mark-resolved', async (_event, filepath: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.markResolved(filepath)
})

ipcMain.handle('git:resolve-conflict', async (_event, filepath: string, content: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.resolveConflict(filepath, content)
})

ipcMain.handle('git:resolve-conflict-side', async (_event, filepath: string, side: 'ours' | 'theirs') => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.resolveConflictWithSide(filepath, side)
})

ipcMain.handle('git:continue-rebase', async (_event, messages?: string[]) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.continueRebase(messages)
})

ipcMain.handle('git:continue-merge', async (_event, message?: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.continueMerge(message)
})

ipcMain.handle('git:abort-rebase', async () => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.abortRebase()
})

ipcMain.handle('git:continue-cherry-pick', async () => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.continueCherryPick()
})

ipcMain.handle('git:abort-cherry-pick', async () => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.abortCherryPick()
})

ipcMain.handle('git:continue-revert', async () => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.continueRevert()
})

ipcMain.handle('git:abort-revert', async () => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.abortRevert()
})

ipcMain.handle('git:abort-merge', async () => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.abortMerge()
})

ipcMain.handle('git:undo-last-action', async () => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.undoLastAction()
})

ipcMain.handle('git:redo-last-action', async () => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.redoLastAction()
})

ipcMain.handle('git:get-conflict-sides', async () => {
  if (!gitService) return { ours: '', theirs: '' }
  return gitService.getConflictSides()
})

ipcMain.handle('git:get-conflict-mode', async () => {
  if (!gitService) return { mode: null }
  return gitService.getConflictMode()
})

ipcMain.handle('git:get-merge-message', async () => {
  if (!gitService) return { message: '' }
  return gitService.getMergeMessage()
})

// ── IPC: Reflog ────────────────────────────────────────────
ipcMain.handle('git:get-reflog', async () => {
  if (!gitService) return { entries: [] }
  return gitService.getReflog()
})

// ── IPC: File History ──────────────────────────────────────
ipcMain.handle('git:get-file-history', async (_event, filepath: string) => {
  if (!gitService) return { commits: [] }
  return gitService.getFileHistory(filepath)
})

// ── IPC: Remotes ───────────────────────────────────────────
ipcMain.handle('git:get-remotes', async () => {
  if (!gitService) return { remotes: [] }
  return gitService.getRemotes()
})

ipcMain.handle('git:add-remote', async (_event, name: string, url: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.addRemote(name, url)
})

ipcMain.handle('git:remove-remote', async (_event, name: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.removeRemote(name)
})

ipcMain.handle('git:rename-remote', async (_event, oldName: string, newName: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.renameRemote(oldName, newName)
})

ipcMain.handle('git:fetch-remote', async (_event, name: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.fetchRemote(name)
})

ipcMain.handle('git:get-default-remote', async () => {
  if (!gitService) return { remote: null, explicit: false }
  return gitService.getDefaultRemote()
})

ipcMain.handle('git:get-default-branch', async () => {
  if (!gitService) return { branch: null }
  return gitService.getDefaultBranch()
})

ipcMain.handle('git:set-default-remote', async (_event, name: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.setDefaultRemote(name)
})

ipcMain.handle('git:prune-remote', async (_event, name: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.pruneRemote(name)
})

ipcMain.handle('git:get-gone-branches', async () => {
  if (!gitService) return { branches: [] }
  return gitService.getGoneBranches()
})

ipcMain.handle('git:prune-gone-branches', async (_event, names: string[]) => {
  if (!gitService) return { success: false, deleted: [], error: 'No repo open' }
  return gitService.pruneGoneBranches(names)
})

// ── IPC: Gitflow ───────────────────────────────────────────
ipcMain.handle('git:gitflow-status', async () => {
  if (!gitService) return { initialized: false, mainBranch: 'main', features: [], releases: [], hotfixes: [] }
  return gitService.gitflowStatus()
})

ipcMain.handle('git:gitflow-init', async () => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.gitflowInit()
})

ipcMain.handle('git:gitflow-start', async (_event, type: 'feature' | 'release' | 'hotfix', name: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.gitflowStart(type, name)
})

ipcMain.handle('git:gitflow-finish', async (_event, type: 'feature' | 'release' | 'hotfix', name: string, tagName?: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.gitflowFinish(type, name, tagName)
})

// ── IPC: Worktrees ─────────────────────────────────────────
ipcMain.handle('git:list-worktrees', async () => {
  if (!gitService) return { worktrees: [] }
  return gitService.listWorktrees()
})

ipcMain.handle('git:add-worktree', async (_event, path: string, ref: string, newBranch?: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.addWorktree(path, ref, newBranch)
})

ipcMain.handle('git:remove-worktree', async (_event, path: string, force?: boolean) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.removeWorktree(path, force)
})

// ── Agent awareness ────────────────────────────────────────────
// Detects known AI coding agents currently running (Claude Code, aider,
// codex, gemini, amp…) and their working directories, so the UI can show
// which worktree/repo each agent is operating on. One fast `lsof` filtered
// by command name — never a full process walk. macOS/Linux only; returns
// an empty list elsewhere or on any failure.
const AGENT_COMMANDS: Record<string, string> = {
  claude: 'Claude Code',
  aider: 'aider',
  codex: 'Codex CLI',
  gemini: 'Gemini CLI',
  amp: 'Amp',
  goose: 'Goose',
}
ipcMain.handle('agents:list', async () => {
  if (process.platform !== 'darwin' && process.platform !== 'linux') return { agents: [] }
  try {
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const exec = promisify(execFile)
    // Step 1: find candidate PIDs by command name via ps — reliable, unlike
    // `lsof -c`, which sees Claude Code's versioned binary name ("2.1.202"),
    // not "claude".
    const ps = await exec('ps', ['-axo', 'pid=,comm=']).then(r => r.stdout).catch(() => '')
    const candidates: { pid: number; name: string }[] = []
    for (const line of ps.split('\n')) {
      const m = line.match(/^\s*(\d+)\s+(.*)$/)
      if (!m) continue
      const base = m[2].trim().split('/').pop() ?? ''
      const key = Object.keys(AGENT_COMMANDS).find(k => base === k)
      if (key) candidates.push({ pid: parseInt(m[1], 10), name: AGENT_COMMANDS[key] })
    }
    if (candidates.length === 0) return { agents: [] }

    // Step 2: resolve each candidate's cwd with one targeted lsof call.
    const pidList = candidates.map(c => c.pid).join(',')
    const out = await exec('lsof', ['-a', '-d', 'cwd', '-F', 'pn', '-p', pidList])
      .then(r => r.stdout).catch(e => e.stdout ?? '')
    const byPid = new Map(candidates.map(c => [c.pid, c.name]))
    const agents: { pid: number; name: string; cwd: string }[] = []
    let pid = 0
    for (const line of out.split('\n')) {
      if (line.startsWith('p')) pid = parseInt(line.slice(1), 10)
      else if (line.startsWith('n')) {
        const name = byPid.get(pid)
        const cwd = line.slice(1)
        // "/" = not meaningfully attached to a project (e.g. IDE helper daemons)
        if (name && cwd !== '/') agents.push({ pid, name, cwd })
      }
    }
    return { agents }
  } catch {
    return { agents: [] }
  }
})

// ── AI: commit message generation ─────────────────────────────
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join as pathJoin } from 'path'

function getSettingsPath(): string {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  return pathJoin(dir, 'settings.json')
}

function readSettings(): Record<string, string> {
  try { return JSON.parse(readFileSync(getSettingsPath(), 'utf-8')) } catch { return {} }
}

function writeSettings(data: Record<string, string>): void {
  writeFileSync(getSettingsPath(), JSON.stringify(data, null, 2), 'utf-8')
}

// ── Themes ───────────────────────────────────────────────────────────────────
// The renderer never fetches: it is sandboxed and shared with the extension, so
// the network lives here and the same ThemeStore backs GitVertexHost. Installed
// themes go under userData/themes/, next to settings.json.
let themeStore: ThemeStore | null = null
function getThemeStore(): ThemeStore {
  if (!themeStore) {
    themeStore = new ThemeStore({
      baseDir: app.getPath('userData'),
      builtIns: BUILT_IN_THEME_IDS,
    })
  }
  return themeStore
}

ipcMain.handle('themes:catalogue', async (_event, opts?: { refresh?: boolean }) => {
  // Deliberately never rejects — the settings page must open with no network.
  return getThemeStore().catalogue(opts ?? {})
})

ipcMain.handle('themes:install', async (_event, id: string) => {
  try {
    return { success: true, theme: await getThemeStore().install(id) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('themes:remove', (_event, id: string) => {
  try {
    getThemeStore().remove(id)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('themes:installed', () => {
  const store = getThemeStore()
  const themes = store.installed()
  // Anything validation threw away is reported rather than silently missing —
  // "my theme vanished" with no reason is the bug this avoids.
  return { themes, discarded: store.takeDiscarded() }
})

ipcMain.handle('ai:get-api-key', () => {
  return { key: readSettings().groqApiKey ?? '' }
})

ipcMain.handle('ai:set-api-key', (_event, key: string) => {
  const s = readSettings(); s.groqApiKey = key; writeSettings(s)
  return { success: true }
})

ipcMain.handle('ai:list-models', async () => {
  const apiKey = readSettings().geminiApiKey
  if (!apiKey) return { error: 'NO_API_KEY' }
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
    const data = await res.json() as any
    return { models: (data.models ?? []).map((m: any) => m.name) }
  } catch (e: any) { return { error: e.message } }
})

ipcMain.handle('ai:list-provider-models', async (_event, provider: string, apiKey: string) => {
  if (!apiKey) return { error: 'NO_API_KEY' }
  try {
    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
      })
      const data = await res.json() as any
      if (data.error) return { error: data.error.message ?? JSON.stringify(data.error) }
      return { models: (data.data ?? []).map((m: any) => m.id as string).sort() }
    }
    if (provider === 'google') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
      const data = await res.json() as any
      if (data.error) return { error: data.error.message ?? JSON.stringify(data.error) }
      const ids = (data.models ?? [])
        .map((m: any) => (m.name as string).replace('models/', ''))
        .filter((id: string) => id.startsWith('gemini'))
        .sort()
      return { models: ids }
    }
    if (provider === 'groq') {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` }
      })
      const data = await res.json() as any
      console.log('[groq models] status:', res.status, 'keys:', Object.keys(data))
      if (!res.ok || data.error) return { error: data.error?.message ?? `HTTP ${res.status}` }
      const list: any[] = Array.isArray(data) ? data : (data.data ?? data.models ?? [])
      console.log('[groq models] count:', list.length, 'sample:', list.slice(0, 3).map((m: any) => m.id))
      const ids = list
        .map((m: any) => (m.id ?? m.name) as string)
        .filter((id: string) => {
          if (!id) return false
          // exclure uniquement les modèles audio/transcription
          if (id.startsWith('whisper') || id.startsWith('distil-whisper')) return false
          return true
        })
        .sort()
      return { models: ids }
    }
    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` }
      })
      const data = await res.json() as any
      if (data.error) return { error: data.error.message ?? JSON.stringify(data.error) }
      const ids = (data.data ?? [])
        .map((m: any) => m.id as string)
        .filter((id: string) => id.startsWith('gpt') || id.startsWith('o1') || id.startsWith('o3'))
        .sort()
      return { models: ids }
    }
    return { error: 'Provider inconnu' }
  } catch (e: any) { return { error: e.message } }
})

// ── Shared AI pipeline ─────────────────────────────────────────
// Reads the configured provider/model/key from settings and runs one prompt
// with the same 3-attempt retry loop for every AI feature (commit message,
// recompose, explain, …). Returns { text } or { error }.
async function runAIPrompt(prompt: string, maxTokens = 512): Promise<{ text?: string; error?: string }> {
  const s = readSettings()
  const provider = s.aiProvider ?? 'groq'
  const keyMap: Record<string, string> = { anthropic: 'aiAnthropicKey', google: 'aiGoogleKey', groq: 'aiGroqKey', openai: 'aiOpenaiKey' }
  const modelMap: Record<string, string> = {
    anthropic: s.aiAnthropicModel || 'claude-haiku-4-5-20251001',
    google:    s.aiGoogleModel    || 'gemini-2.0-flash',
    groq:      s.aiGroqModel      || 'llama-3.3-70b-versatile',
    openai:    s.aiOpenaiModel    || 'gpt-4o-mini',
  }
  // backward compat: groqApiKey was the old key
  const apiKey = s[keyMap[provider] ?? 'aiGroqKey'] ?? (provider === 'groq' ? s.groqApiKey : '') ?? ''
  const model = modelMap[provider]
  console.log(`[ai] provider=${provider} model=${model} hasKey=${!!apiKey}`)
  if (!apiKey) return { error: 'NO_API_KEY' }

  const callAPI = async (): Promise<string> => {
    if (provider === 'anthropic') {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const client = new Anthropic({ apiKey })
      const res = await client.messages.create({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] })
      return (res.content[0] as any).text?.trim() ?? ''
    }
    if (provider === 'google') {
      const { GoogleGenerativeAI } = await import('@google/generative-ai')
      const genAI = new GoogleGenerativeAI(apiKey)
      const genModel = genAI.getGenerativeModel({ model })
      const result = await genModel.generateContent(prompt)
      return result.response.text().trim()
    }
    if (provider === 'openai') {
      const OpenAI = (await import('openai')).default
      const client = new OpenAI({ apiKey })
      const response = await client.chat.completions.create({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] })
      return response.choices[0]?.message?.content?.trim() ?? ''
    }
    // groq (default)
    const Groq = (await import('groq-sdk')).default
    const client = new Groq({ apiKey })
    const response = await client.chat.completions.create({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] })
    return response.choices[0]?.message?.content?.trim() ?? ''
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const text = await callAPI()
      console.log(`[ai] attempt=${attempt} length=${text.length} preview="${text.slice(0, 60)}"`)
      if (text) return { text }
      console.log(`[ai] empty response on attempt ${attempt}, retrying…`)
      if (attempt < 3) await new Promise(r => setTimeout(r, 500 * attempt))
    } catch (e: any) {
      console.error(`[ai] attempt=${attempt} error:`, e.message)
      if (attempt === 3) return { error: e.message ?? 'API error' }
      await new Promise(r => setTimeout(r, 500 * attempt))
    }
  }
  return { error: 'The model returned an empty response after 3 attempts' }
}

const truncateDiff = (diff: string, max = 6000) =>
  diff.length > max ? diff.slice(0, max) + '\n... [diff truncated]' : diff

ipcMain.handle('ai:generate-commit-message', async () => {
  if (!gitService) { console.log('[ai] no gitService'); return { error: 'No repository open' } }
  let stagedDiff = ''
  try {
    const git = (gitService as any).git
    stagedDiff = await git.raw(['diff', '--cached'])
  } catch { return { error: 'Failed to get the diff' } }
  if (!stagedDiff.trim()) { console.log('[ai] no staged diff'); return { error: 'No staged changes to analyze' } }

  const prompt = `You are a Git expert. Analyze this diff and generate a concise commit message following Conventional Commits (feat/fix/docs/chore/refactor/style/test/perf). First line: type(scope): description (max 72 chars). Reply ONLY with the commit message in English.\n\nDiff:\n\`\`\`diff\n${truncateDiff(stagedDiff)}\n\`\`\``
  const r = await runAIPrompt(prompt)
  return r.error ? { error: r.error } : { message: r.text }
})

// Recompose: regenerate an EXISTING commit's message from its actual diff.
// The renderer applies the result through the normal amend/reword flow, so
// the user always reviews the proposal before anything is rewritten.
ipcMain.handle('ai:recompose-commit', async (_e, hash: string) => {
  if (!gitService) return { error: 'No repository open' }
  let diff = ''
  let currentMsg = ''
  try {
    const git = (gitService as any).git
    diff = await git.raw(['diff-tree', '--no-commit-id', '-p', '--root', hash])
    currentMsg = (await git.raw(['log', '-1', '--pretty=format:%B', hash])).trim()
  } catch { return { error: 'Failed to get the commit diff' } }
  if (!diff.trim()) return { error: 'This commit has no changes to analyze (merge commit?)' }

  const prompt = `You are a Git expert. Rewrite this commit's message based on what the diff ACTUALLY changes. Follow Conventional Commits (feat/fix/docs/chore/refactor/style/test/perf). First line: type(scope): description (max 72 chars). If the change warrants it, add a short body (1-3 lines) after a blank line explaining the why. Reply ONLY with the commit message in English — no preamble, no code fences.\n\nCurrent message (may be inaccurate or vague):\n${currentMsg}\n\nDiff:\n\`\`\`diff\n${truncateDiff(diff)}\n\`\`\``
  const r = await runAIPrompt(prompt)
  return r.error ? { error: r.error } : { message: r.text }
})

// AI conflict resolution: sends the whole conflicted file (markers included)
// plus an optional user instruction ("keep the new import, drop the old one")
// and asks for the fully-resolved file. The renderer drops the result into
// the resolver's manual-edit output, so the user always reviews before saving.
const AI_CONFLICT_MAX_CHARS = 24000
ipcMain.handle('ai:resolve-conflict', async (_e, filepath: string, instruction?: string) => {
  if (!gitService) return { error: 'No repository open' }
  const fileRes = await gitService.getFileContent(filepath)
  if (fileRes.error) return { error: fileRes.error }
  const content = fileRes.content ?? ''
  if (!/^<{7}/m.test(content)) return { error: 'No conflict markers found in this file' }
  if (content.length > AI_CONFLICT_MAX_CHARS) {
    return { error: `File too long for AI resolution (${content.length} characters, max ${AI_CONFLICT_MAX_CHARS})` }
  }

  const extra = instruction?.trim()
    ? `\n\nUser guidance (follow it when choosing between sides): ${instruction.trim()}`
    : ''
  const prompt = `You are a Git merge expert. This file contains merge conflict markers (<<<<<<<, =======, >>>>>>>, and possibly ||||||| base sections). Resolve every conflict by producing the correct merged file: keep the intent of BOTH sides when they are compatible, otherwise pick the side that keeps the file consistent.${extra}

CRITICAL formatting rules:
- Copy the chosen lines EXACTLY as they appear: preserve every space, tab, indentation, trailing whitespace and blank line. Never reformat, re-indent, trim or normalize anything outside the conflicted regions — and inside them, reproduce the chosen side's lines byte-for-byte.
- No conflict markers, no code fences, no commentary inside the file.

Reply in EXACTLY this format:
EXPLANATION: <1 to 3 sentences in English explaining which sides you chose and why>
===FILE===
<the complete resolved file content, every line>

File (${filepath}):
${content}`
  const r = await runAIPrompt(prompt, 8192)
  if (r.error) return { error: r.error }
  const raw = r.text ?? ''
  // Split explanation from file on the ===FILE=== marker; if the model
  // ignored the format, treat the whole reply as the file.
  let explanation = ''
  let resolution = raw
  const markerIdx = raw.indexOf('===FILE===')
  if (markerIdx !== -1) {
    explanation = raw.slice(0, markerIdx).replace(/^EXPLANATION:\s*/i, '').trim()
    resolution = raw.slice(markerIdx + '===FILE==='.length).replace(/^\n/, '')
  }
  // Some models still wrap output in fences despite instructions — strip them.
  const fenced = resolution.match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```\s*$/)
  if (fenced) resolution = fenced[1]
  if (/^[<=>]{7}/m.test(resolution)) return { error: "The AI proposal still contains conflict markers — try again, possibly with a more precise instruction" }
  return { resolution, explanation }
})

// Natural-language commit search: sends a compact one-line-per-commit index
// (hash, author, date, subject) and asks the model which commits match the
// user's free-form query. Returns { hashes } of full hashes.
ipcMain.handle('ai:search-commits', async (_e, query: string) => {
  if (!gitService) return { error: 'No repository open' }
  if (!query?.trim()) return { hashes: [] }
  let index = ''
  try {
    const git = (gitService as any).git
    // Short hashes + truncated subjects keep the index small: free-tier
    // providers cap tokens/minute and reject large prompts outright (the
    // 300-commit/24k-chars first version did exactly that).
    index = await git.raw(['log', '--all', '--max-count=200', '--date=short', '--pretty=format:%h|%an|%ad|%s'])
    index = index.split('\n').map(l => l.length > 90 ? l.slice(0, 90) : l).join('\n')
  } catch { return { error: 'Could not read the history' } }
  if (!index.trim()) return { hashes: [] }

  const today = new Date().toISOString().slice(0, 10)
  const prompt = `You are a Git history search engine. Today is ${today}. Below is a commit index, one commit per line: hash|author|date|subject.\n\nUser query (may be French or English, may reference dates, authors, file kinds, change intent): "${query.trim()}"\n\nReply with ONLY the hashes of matching commits, one per line, best matches first, at most 50. If nothing matches, reply with exactly NONE.\n\nIndex:\n${truncateDiff(index, 12000)}`
  const r = await runAIPrompt(prompt, 1024)
  if (r.error) return { error: r.error }
  const text = (r.text ?? '').trim()
  if (!text || text === 'NONE') return { hashes: [] }
  const short = [...text.matchAll(/\b[0-9a-f]{7,40}\b/g)].map(m => m[0])
  if (short.length === 0) return { hashes: [] }
  // Expand the short hashes the model echoed back to full ones so the graph
  // can match them against CommitNode.hash.
  try {
    const git = (gitService as any).git
    const full = await git.raw(['rev-parse', ...short.slice(0, 50)])
    return { hashes: full.trim().split('\n').filter((h: string) => /^[0-9a-f]{40}$/.test(h)) }
  } catch {
    // Some hash didn't resolve (hallucinated) — resolve one by one, drop bad ones.
    const git = (gitService as any).git
    const hashes: string[] = []
    for (const s of short.slice(0, 50)) {
      try {
        const h = (await git.raw(['rev-parse', s])).trim()
        if (/^[0-9a-f]{40}$/.test(h)) hashes.push(h)
      } catch { /* hallucinated hash — skip */ }
    }
    return { hashes }
  }
})

// Explain: plain-language summary of what a commit changes. Read-only.
// Output in French — it's shown in the (French) UI, unlike commit messages
// which the project convention keeps in English.
// Explanations are cached per repo+hash (userData/ai-explanations.json) so
// re-opening one costs no API call; `force` regenerates. A hash's diff is
// immutable, so the cache never goes stale.
const EXPL_CACHE_MAX_PER_REPO = 200
const explCachePath = () => join(app.getPath('userData'), 'ai-explanations.json')
function readExplCache(): Record<string, Record<string, string>> {
  try { return JSON.parse(fs.readFileSync(explCachePath(), 'utf-8')) } catch { return {} }
}
function saveExplanation(repoPath: string, hash: string, explanation: string): void {
  const cache = readExplCache()
  const repo = cache[repoPath] ?? {}
  repo[hash] = explanation
  // Naive size cap: JSON preserves insertion order — drop the oldest entry.
  const keys = Object.keys(repo)
  if (keys.length > EXPL_CACHE_MAX_PER_REPO) delete repo[keys[0]]
  cache[repoPath] = repo
  try { fs.writeFileSync(explCachePath(), JSON.stringify(cache)) } catch { /* cache is best-effort */ }
}

ipcMain.handle('ai:get-explanations', () => {
  if (!gitService) return { explanations: {} }
  return { explanations: readExplCache()[gitService.repoPath] ?? {} }
})

ipcMain.handle('ai:explain-commit', async (_e, hash: string, force = false) => {
  if (!gitService) return { error: 'No repository open' }
  if (!force) {
    const cached = readExplCache()[gitService.repoPath]?.[hash]
    if (cached) return { explanation: cached, cached: true }
  }
  let diff = ''
  let currentMsg = ''
  try {
    const git = (gitService as any).git
    diff = await git.raw(['diff-tree', '--no-commit-id', '-p', '--root', hash])
    currentMsg = (await git.raw(['log', '-1', '--pretty=format:%s', hash])).trim()
  } catch { return { error: 'Failed to get the commit diff' } }
  if (!diff.trim()) return { error: 'This commit has no changes to analyze (merge commit?)' }

  const prompt = `You are a Git expert. Explain in English, simply and concretely, what this commit does: which files/behaviors change and why it was probably done. 3 to 6 sentences maximum, no bullet lists, no preamble.\n\nCommit message: ${currentMsg}\n\nDiff:\n\`\`\`diff\n${truncateDiff(diff)}\n\`\`\``
  const r = await runAIPrompt(prompt, 768)
  if (r.error) return { error: r.error }
  saveExplanation(gitService.repoPath, hash, r.text ?? '')
  return { explanation: r.text }
})

// ── Settings: get/set all ──────────────────────────────────────
ipcMain.handle('settings:get-all', () => {
  return readSettings()
})

ipcMain.handle('settings:set', (_e, key: string, value: string) => {
  const s = readSettings(); s[key] = value; writeSettings(s)
  if (key === 'autoFetchInterval') scheduleAutoFetch()
  if (key === 'sshUseAgent' || key === 'sshPrivateKey') applySshConfig()
  return { success: true }
})

// ── SSH keys ─────────────────────────────────────────────────────
ipcMain.handle('app:ssh-browse-key', async (_e, kind: 'private' | 'public') => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: kind === 'private' ? 'Choose the SSH private key' : 'Choose the SSH public key',
    defaultPath: join(os.homedir(), '.ssh'),
  })
  if (result.canceled || result.filePaths.length === 0) return { path: null }
  return { path: result.filePaths[0] }
})

ipcMain.handle('app:ssh-generate-key', async (_e, passphrase?: string) => {
  try {
    const sshDir = join(os.homedir(), '.ssh')
    mkdirSync(sshDir, { recursive: true })
    const base = findAvailableKeyPath(sshDir)
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    await promisify(execFile)('ssh-keygen', ['-t', 'ed25519', '-f', base, '-N', passphrase ?? ''])
    return { privateKey: base, publicKey: base + '.pub' }
  } catch (e: any) {
    return { error: e.message }
  }
})

// ── External diff / merge tools ───────────────────────────────────
// Generic content-in/spawn-out handler: the renderer already has both
// revisions' content (via getFileAtCommit/getFileContent), so this stays
// reusable across any diff surface (commit detail, file history, compare).
ipcMain.handle('app:open-external-diff', async (_e, leftContent: string, rightContent: string, filename: string) => {
  const tool = (readSettings().externalDiffTool ?? '').trim()
  if (!tool) return { success: false, error: 'No external diff tool configured' }
  try {
    const safeName = safeTempFileName(filename)
    const tmp = join(os.tmpdir(), `git-vertex-diff-${Date.now()}`)
    mkdirSync(tmp, { recursive: true })
    const leftPath = join(tmp, `left-${safeName}`)
    const rightPath = join(tmp, `right-${safeName}`)
    writeFileSync(leftPath, leftContent ?? '')
    writeFileSync(rightPath, rightContent ?? '')
    const inv = buildToolInvocation(tool, leftPath, rightPath)
    if (!inv) return { success: false, error: 'No external diff tool configured' }
    const { spawn } = await import('child_process')
    const child = spawn(inv.cmd, inv.args, { detached: true, stdio: 'ignore' })
    child.on('error', () => {})
    child.unref()
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

// External merge tool: writes ours/theirs + a merged file seeded with the
// conflicted working copy, spawns the tool, and hands back the merged file's
// path so the renderer can reload it once the user has resolved & saved.
ipcMain.handle('app:open-external-merge', async (_e, filepath: string) => {
  const tool = (readSettings().externalMergeTool ?? '').trim()
  if (!tool) return { success: false, error: 'No external merge tool configured' }
  if (!gitService) return { success: false, error: 'No repo open' }
  try {
    const versions = await gitService.getConflictVersions(filepath)
    const safeName = safeTempFileName(filepath)
    const tmp = join(os.tmpdir(), `git-vertex-merge-${Date.now()}`)
    mkdirSync(tmp, { recursive: true })
    const oursPath = join(tmp, `ours-${safeName}`)
    const theirsPath = join(tmp, `theirs-${safeName}`)
    const mergedPath = join(tmp, `merged-${safeName}`)
    writeFileSync(oursPath, versions.ours ?? '')
    writeFileSync(theirsPath, versions.theirs ?? '')
    const abs = path.isAbsolute(filepath) ? filepath : path.join(gitService.repoPath, filepath)
    try { fs.copyFileSync(abs, mergedPath) } catch { writeFileSync(mergedPath, '') }
    const inv = buildToolInvocation(tool, oursPath, theirsPath, mergedPath)
    if (!inv) return { success: false, error: 'No external merge tool configured' }
    const { spawn } = await import('child_process')
    const child = spawn(inv.cmd, inv.args, { detached: true, stdio: 'ignore' })
    child.on('error', () => {})
    child.unref()
    return { success: true, mergedPath }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

// Reads back a temp file written by app:open-external-merge, once the user
// closes/saves from the external tool.
ipcMain.handle('app:read-temp-file', async (_e, absPath: string) => {
  try { return { content: readFileSync(absPath, 'utf-8') } } catch (e: any) { return { error: e.message } }
})

// ── Git global config ──────────────────────────────────────────
ipcMain.handle('git:get-global-config', async () => {
  const { execFile } = await import('child_process')
  const { promisify } = await import('util')
  const exec = promisify(execFile)
  const run = async (args: string[]) => {
    try { const r = await exec(gitBinary(), args); return r.stdout.trim() } catch { return '' }
  }
  return {
    userName: await run(['config', '--global', 'user.name']),
    userEmail: await run(['config', '--global', 'user.email']),
  }
})

ipcMain.handle('git:set-global-config', async (_e, userName: string, userEmail: string) => {
  const { execFile } = await import('child_process')
  const { promisify } = await import('util')
  const exec = promisify(execFile)
  try {
    if (userName) await exec(gitBinary(), ['config', '--global', 'user.name', userName])
    if (userEmail) await exec(gitBinary(), ['config', '--global', 'user.email', userEmail])
    return { success: true }
  } catch (e: any) { return { success: false, error: e.message } }
})

ipcMain.handle('app:open-external', (_e, url: string) => {
  shell.openExternal(url)
})

// Open a repo file in an external editor. Uses the configured `externalEditor`
// command (e.g. "code", "code --wait", "subl", "meld") if set, otherwise falls
// back to the OS default application for the file.
ipcMain.handle('app:open-in-editor', async (_e, filepath: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  const path = await import('path')
  const abs = path.isAbsolute(filepath) ? filepath : path.join(gitService.repoPath, filepath)
  const editor = (readSettings().externalEditor ?? '').trim()
  if (!editor) {
    const err = await shell.openPath(abs)
    return err ? { success: false, error: err } : { success: true }
  }
  try {
    const { spawn } = await import('child_process')
    const parts = editor.split(' ').filter(Boolean)
    const cmd = parts[0]
    const args = [...parts.slice(1), abs]
    const child = spawn(cmd, args, { cwd: gitService.repoPath, detached: true, stdio: 'ignore' })
    child.on('error', () => {})
    child.unref()
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

// Open an arbitrary repo folder in the external editor (Repository Management —
// not tied to the currently-open repo, unlike app:open-in-editor).
ipcMain.handle('app:open-path-in-editor', async (_e, dir: string) => {
  const editor = (readSettings().externalEditor ?? '').trim()
  if (!editor) {
    const err = await shell.openPath(dir)
    return err ? { success: false, error: err } : { success: true }
  }
  try {
    const { spawn } = await import('child_process')
    const parts = editor.split(' ').filter(Boolean)
    const child = spawn(parts[0], [...parts.slice(1), dir], { cwd: dir, detached: true, stdio: 'ignore' })
    child.on('error', () => {})
    child.unref()
    return { success: true }
  } catch (e: any) { return { success: false, error: e.message } }
})

// Read a repo's README (first match) for the Repository Management details panel.
ipcMain.handle('git:read-readme', async (_e, dir: string) => {
  try {
    const { readFileSync } = await import('fs')
    for (const n of ['README.md', 'README.MD', 'Readme.md', 'readme.md', 'README', 'README.txt', 'README.rst']) {
      const p = join(dir, n)
      if (existsSync(p)) return { content: readFileSync(p, 'utf-8'), name: n }
    }
    return { content: null }
  } catch (e: any) { return { error: e.message } }
})

// Open the system terminal at the repository root. Uses the configured
// `externalTerminal` app (e.g. "iTerm", "Warp") if set, otherwise falls back
// to the OS default terminal.
ipcMain.handle('app:open-terminal', async () => {
  if (!gitService) return { success: false, error: 'No repo open' }
  const cwd = gitService.repoPath
  try {
    const { spawn } = await import('child_process')
    const customTerminal = (readSettings().externalTerminal ?? '').trim()
    const { cmd, args } = resolveTerminalLaunch({ customTerminal, platform: process.platform, cwd })
    const child = spawn(cmd, args, { cwd, detached: true, stdio: 'ignore' })
    child.on('error', () => {})
    child.unref()
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('app:get-info', () => {
  return {
    version:  app.getVersion(),
    electron: process.versions.electron,
    node:     process.versions.node,
    chrome:   process.versions.chrome,
  }
})

// "What's new": the first time the app runs after an update, hand the renderer
// the release notes for the current version so it can open a tab (like VS Code).
// A fresh install just records the version silently — no notes on first run.
ipcMain.handle('app:get-whats-new', () => {
  const current = app.getVersion()
  const s = readSettings()
  const last = s.lastSeenVersion
  if (!last) { s.lastSeenVersion = current; writeSettings(s); return null }
  if (last === current) return null
  const notes = RELEASE_NOTES[current]
  if (!notes) { s.lastSeenVersion = current; writeSettings(s); return null }
  return { version: current, notes }
})

// On-demand release notes (the welcome screen's "Notes de version" link):
// the current version's notes, or the newest entry we ship if this exact
// version has none (e.g. a patch release without its own note).
ipcMain.handle('app:get-release-notes', () => {
  const current = app.getVersion()
  if (RELEASE_NOTES[current]) return { version: current, notes: RELEASE_NOTES[current] }
  const cmp = (a: string, b: string) => {
    const pa = a.split('.').map(Number), pb = b.split('.').map(Number)
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pb[i] || 0) - (pa[i] || 0)
    return 0
  }
  const newest = Object.keys(RELEASE_NOTES).sort(cmp)[0]
  return newest ? { version: newest, notes: RELEASE_NOTES[newest] } : null
})

ipcMain.handle('app:mark-whats-new-seen', () => {
  const s = readSettings(); s.lastSeenVersion = app.getVersion(); writeSettings(s)
  return { success: true }
})

ipcMain.handle('github:start-auth', () => {
  startOAuthFlow()
})

ipcMain.handle('github:disconnect', () => {
  const s = readSettings()
  delete s.githubToken
  writeSettings(s)
  return { success: true }
})

ipcMain.handle('github:get-token', () => {
  return { token: readSettings().githubToken ?? null }
})

// Resolve the GitHub owner/repo of the currently open repository.
async function detectGithubRepo(): Promise<{ owner: string; repo: string } | null> {
  if (!gitService) return null
  try {
    const remotes = await (gitService as any).git.getRemotes(true)
    const origin = remotes.find((r: any) => r.name === 'origin') ?? remotes[0]
    if (!origin) return null
    const url: string = origin.refs?.fetch ?? origin.refs?.push ?? ''
    const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)(\.git)?/)
    if (!match) return null
    return { owner: match[1], repo: match[2] }
  } catch { return null }
}

// Cache email → avatar URL in the main process (persists for the app lifetime).
const avatarCache = new Map<string, string>()
const githubIdenticonUrl = (key: string) => {
  // GitHub's identicon generator: deterministic, colorful, matches github.com style.
  // Any string produces a unique colored pixel-art avatar — far better than Gravatar's default.
  const localPart = key.split('@')[0] || key
  return `https://github.com/identicons/${encodeURIComponent(localPart)}.png`
}

// Load the authenticated user's avatar + all their verified emails into the
// cache, once. This is the reliable path for the logged-in user's own commits
// (including unpushed ones, where the commits API 422s) and for private emails
// that the public search can't find. Memoized so we only hit the API once.
let authedEmailsLoaded: Promise<void> | null = null
function loadAuthedUserEmails(token: string): Promise<void> {
  if (authedEmailsLoaded) return authedEmailsLoaded
  authedEmailsLoaded = (async () => {
    try {
      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      })
      if (!userRes.ok) return
      const user: any = await userRes.json()
      const avatar: string | undefined = user?.avatar_url
      if (!avatar) return

      const emails = new Set<string>()
      if (user?.email) emails.add(String(user.email).trim().toLowerCase())

      const emailsRes = await fetch('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      })
      if (emailsRes.ok) {
        const list: any[] = await emailsRes.json()
        for (const e of list) if (e?.email) emails.add(String(e.email).trim().toLowerCase())
      }

      for (const e of emails) avatarCache.set(e, avatar)
    } catch {
      authedEmailsLoaded = null // allow a retry next time
    }
  })()
  return authedEmailsLoaded
}

ipcMain.handle('avatar:resolve', async (_e, email: string, sha?: string) => {
  const key = email.trim().toLowerCase()
  if (avatarCache.has(key)) return avatarCache.get(key)!

  // GitHub noreply emails encode the user directly — resolve deterministically.
  // `{id}+{login}@users.noreply.github.com` → avatar by user id (covers Copilot
  // and any human hiding their email). Older `{login}@...` form needs a lookup.
  const noreply = key.match(/^(?:(\d+)\+)?([^@]+)@users\.noreply\.github\.com$/)
  const token = readSettings().githubToken
  if (noreply) {
    const [, id, login] = noreply
    if (id) {
      const url = `https://avatars.githubusercontent.com/u/${id}?v=4`
      avatarCache.set(key, url)
      return url
    }
    if (token) {
      try {
        const res = await fetch(`https://api.github.com/users/${login}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        })
        if (res.ok) {
          const d: any = await res.json()
          if (d?.avatar_url) { avatarCache.set(key, d.avatar_url); return d.avatar_url }
        }
      } catch { /* ignore */ }
    }
  }

  if (token) {
    // First: resolve via the authenticated user's own email list. Works for the
    // logged-in user's commits even when unpushed or using a private email.
    await loadAuthedUserEmails(token)
    if (avatarCache.has(key)) return avatarCache.get(key)!

    // Next: the commits API. GitHub resolves the commit's author to a real user
    // account regardless of whether the email is public, and gives back
    // avatar_url for both the author and committer. We cache by email so every
    // distinct contributor is resolved at most once.
    if (sha) {
      const repo = await detectGithubRepo()
      if (repo) {
        try {
          const res = await fetch(
            `https://api.github.com/repos/${repo.owner}/${repo.repo}/commits/${sha}`,
            { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
          )
          if (res.ok) {
            const data: any = await res.json()
            const pairs: [string | undefined, string | undefined][] = [
              [data?.commit?.author?.email, data?.author?.avatar_url],
              [data?.commit?.committer?.email, data?.committer?.avatar_url],
            ]
            for (const [e, url] of pairs) {
              if (e && url) avatarCache.set(e.trim().toLowerCase(), url)
            }
            if (avatarCache.has(key)) return avatarCache.get(key)!
          }
        } catch { /* ignore network errors */ }
      }
    }

    // Fallback: search the user by public email.
    try {
      const res = await fetch(
        `https://api.github.com/search/users?q=${encodeURIComponent(key)}+in:email&per_page=1`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
      )
      if (res.ok) {
        const data: any = await res.json()
        const url: string | undefined = data?.items?.[0]?.avatar_url
        if (url) { avatarCache.set(key, url); return url }
      }
    } catch { /* ignore network errors */ }
  }

  // Last resort: GitHub identicon (colorful, matches github.com style).
  const url = githubIdenticonUrl(key)
  avatarCache.set(key, url)
  return url
})

ipcMain.handle('updater:download', async () => {
  if (is.dev) return { dev: true }
  try {
    await autoUpdater.downloadUpdate()
    return { success: true }
  } catch (e: any) {
    return { error: e?.message ?? String(e) }
  }
})

ipcMain.handle('updater:install', () => {
  installDownloadedUpdate()
})

// On Windows the assisted NSIS installer would replay the full setup wizard on
// every update unless we run it silently. quitAndInstall(isSilent=true,
// isForceRunAfter=true) applies the update in the background and relaunches the
// app. Other platforms keep the default behavior.
function installDownloadedUpdate() {
  if (process.platform === 'win32') autoUpdater.quitAndInstall(true, true)
  else autoUpdater.quitAndInstall()
}

ipcMain.handle('updater:get-state', () => {
  return { downloadedVersion: downloadedUpdateVersion, downloadedFile: downloadedUpdateFile }
})

ipcMain.handle('updater:open-downloaded', () => {
  if (downloadedUpdateFile) {
    shell.showItemInFolder(downloadedUpdateFile)
  }
})

ipcMain.handle('updater:install-manual', async () => {
  // Windows & Linux: quitAndInstall() works natively (no Gatekeeper).
  // Windows runs silently so the NSIS setup wizard doesn't reappear.
  if (process.platform !== 'darwin') {
    installDownloadedUpdate()
    return { success: true }
  }

  // macOS: manual unzip + replace because unsigned apps are blocked by Gatekeeper
  if (!downloadedUpdateFile) return { error: 'No file downloaded' }
  try {
    const { execFile, spawn } = await import('child_process')
    const { promisify } = await import('util')
    const exec = promisify(execFile)
    const os = await import('os')
    const fs = await import('fs')

    const tempDir = pathJoin(os.tmpdir(), `git-vertex-update-${Date.now()}`)
    fs.mkdirSync(tempDir, { recursive: true })
    await exec('unzip', ['-o', downloadedUpdateFile, '-d', tempDir])

    const entries = fs.readdirSync(tempDir)
    const appBundle = entries.find(f => f.endsWith('.app'))
    if (!appBundle) return { error: '.app not found in the ZIP' }
    const newAppPath = pathJoin(tempDir, appBundle)

    try { await exec('xattr', ['-dr', 'com.apple.quarantine', newAppPath]) } catch { /* ignore */ }

    const exePath = app.getPath('exe')
    const match = exePath.match(/^(.*\.app)/)
    if (!match) return { error: 'Could not locate the current bundle' }
    const currentAppPath = match[1]
    const appParentDir = pathJoin(currentAppPath, '..')

    const scriptPath = pathJoin(tempDir, 'install.sh')
    fs.writeFileSync(scriptPath, [
      '#!/bin/bash',
      'sleep 1.5',
      `rm -rf "${currentAppPath}"`,
      `cp -R "${newAppPath}" "${appParentDir}/"`,
      `xattr -dr com.apple.quarantine "${currentAppPath}" 2>/dev/null || true`,
      `open "${currentAppPath}"`,
      `rm -rf "${tempDir}"`,
    ].join('\n'))
    fs.chmodSync(scriptPath, '755')

    spawn('bash', [scriptPath], { detached: true, stdio: 'ignore' }).unref()
    app.quit()

    return { success: true }
  } catch (e: any) {
    return { error: e.message }
  }
})

function semverGt(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false
  }
  return false
}

ipcMain.handle('updater:check', async () => {
  if (is.dev) return { dev: true }
  try {
    const result = await autoUpdater.checkForUpdates()
    const remote = result?.updateInfo?.version ?? null
    const current = app.getVersion()
    const newer = remote ? semverGt(remote, current) : false
    return { version: newer ? remote : null, _debug: { current, remote, newer } }
  } catch (e: any) {
    return { error: e.message, _debug: { current: app.getVersion(), remote: null, error: e.message } }
  }
})

ipcMain.handle('github:detect-repo', async () => {
  if (!gitService) return { owner: null, repo: null }
  try {
    const remotes = await (gitService as any).git.getRemotes(true)
    const origin = remotes.find((r: any) => r.name === 'origin') ?? remotes[0]
    if (!origin) return { owner: null, repo: null }
    const url: string = origin.refs?.fetch ?? origin.refs?.push ?? ''
    // https://github.com/owner/repo.git  or  git@github.com:owner/repo.git
    const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)(\.git)?/)
    if (!match) return { owner: null, repo: null }
    return { owner: match[1], repo: match[2] }
  } catch { return { owner: null, repo: null } }
})

// Same GitHub-remote detection, but for an arbitrary local path (cross-repo
// Launchpad: recent repos other than the currently-open one).
ipcMain.handle('github:detect-repo-at', async (_e, repoPath: string) => {
  try {
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const exec = promisify(execFile)
    const r = await exec(gitBinary(), ['-C', repoPath, 'remote', 'get-url', 'origin'])
    const match = r.stdout.trim().match(/github\.com[:/]([^/]+)\/([^/.]+)(\.git)?/)
    if (!match) return { owner: null, repo: null }
    return { owner: match[1], repo: match[2] }
  } catch { return { owner: null, repo: null } }
})

ipcMain.handle('github:list-prs', async (_e, owner: string, repo: string) => {
  const token = readSettings().githubToken
  if (!token) return { error: 'not_authenticated' }
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls?per_page=50&state=open`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
    )
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const data = await res.json() as any[]
    return {
      prs: data.map(pr => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        draft: pr.draft,
        author: pr.user?.login ?? '',
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        comments: pr.comments + pr.review_comments,
        labels: (pr.labels ?? []).map((l: any) => ({ name: l.name, color: l.color })),
        url: pr.html_url,
        headRef: pr.head?.ref ?? '',
        baseRef: pr.base?.ref ?? '',
      }))
    }
  } catch (e: any) { return { error: e.message } }
})

// Cloud Patches, the zero-server way: the commit's patch goes into a SECRET
// gist under the user's own account and the shareable URL comes back.
// Secret gists are unlisted (anyone with the link can read) — good enough
// for "feedback before the PR", and revocable by deleting the gist.
ipcMain.handle('github:share-patch', async (_e, hash: string) => {
  if (!gitService) return { error: 'No repo open' }
  const token = readSettings().githubToken
  if (!token) return { error: 'not_authenticated' }
  const patchRes = await gitService.createPatch(hash)
  if ((patchRes as any).error) return { error: (patchRes as any).error }
  try {
    const short = hash.slice(0, 7)
    let subject = short
    try {
      subject = (await (gitService as any).git.raw(['log', '-1', '--pretty=format:%s', hash])).trim() || short
    } catch { /* subject is cosmetic */ }
    const res = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      body: JSON.stringify({
        description: `git-vertex patch — ${short}: ${subject}`,
        public: false,
        files: { [`${short}.patch`]: { content: patchRes.patch } },
      }),
    })
    // 404 on the gists endpoint almost always means the token lacks the `gist`
    // scope (GitHub hides it rather than 403) — tell the user to reconnect.
    if (res.status === 404) return { error: 'gist_scope' }
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const data = await res.json() as any
    return { url: data.html_url }
  } catch (e: any) { return { error: e.message } }
})

// Launchpad "Mark as closed": close an issue or PR. GitHub's issues endpoint
// closes both. Invalidates the search cache so the next refresh drops it.
ipcMain.handle('github:close-issue', async (_e, owner: string, repo: string, number: number) => {
  const token = readSettings().githubToken
  if (!token) return { error: 'not_authenticated' }
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${number}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      body: JSON.stringify({ state: 'closed' }),
    })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    searchCache.clear()
    return { success: true }
  } catch (e: any) { return { error: e.message } }
})

// Launchpad WIP "Create cloud patch": the working-tree diff of a local repo
// (uncommitted, tracked changes vs HEAD) goes to a secret gist; the link comes
// back. Zero-server, revocable by deleting the gist.
ipcMain.handle('github:share-wip-patch', async (_e, repoPath: string) => {
  const token = readSettings().githubToken
  if (!token) return { error: 'not_authenticated' }
  try {
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const exec = promisify(execFile)
    const diff = await exec(gitBinary(), ['-C', repoPath, 'diff', 'HEAD'], { maxBuffer: 20 * 1024 * 1024 })
    const patch = diff.stdout
    if (!patch.trim()) return { error: 'no_changes' }
    const name = repoPath.split('/').pop() || 'wip'
    const res = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      body: JSON.stringify({
        description: `git-vertex WIP patch — ${name}`,
        public: false,
        files: { [`${name}-wip.patch`]: { content: patch } },
      }),
    })
    // 404 on the gists endpoint almost always means the token lacks the `gist`
    // scope (GitHub hides it rather than 403) — tell the user to reconnect.
    if (res.status === 404) return { error: 'gist_scope' }
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const data = await res.json() as any
    return { url: data.html_url }
  } catch (e: any) { return { error: e.message } }
})

ipcMain.handle('github:list-issues', async (_e, owner: string, repo: string) => {
  const token = readSettings().githubToken
  if (!token) return { error: 'not_authenticated' }
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues?per_page=50&state=open&pulls=false`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
    )
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const data = await res.json() as any[]
    // GitHub issues endpoint also returns PRs — filter them out
    const issues = data.filter((i: any) => !i.pull_request)
    return {
      issues: issues.map((issue: any) => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        author: issue.user?.login ?? '',
        createdAt: issue.created_at,
        comments: issue.comments,
        labels: (issue.labels ?? []).map((l: any) => ({ name: l.name, color: l.color })),
        url: issue.html_url,
      }))
    }
  } catch (e: any) { return { error: e.message } }
})

// ── Local repo scan (Launchpad WIPS + "View Repo" mapping) ──────────
// Discovering which local dirs are git repos (has a .git) is the slow part, so
// it's cached (60s TTL, or force). Discovery seeds from the recent repos and
// their sibling directories one level up, so newly-cloned neighbours show up on
// the next non-cached scan. `git status` runs fresh each call for accurate WIP
// counts; the GitHub remote name is cached per path (it rarely changes).
let repoScanCache: { paths: string[]; ts: number } = { paths: [], ts: 0 }
const fullnameCache = new Map<string, string | null>()

function discoverLocalRepos(seeds: string[]): string[] {
  const found = new Set<string>()
  const parents = new Set<string>()
  for (const p of seeds) {
    if (existsSync(join(p, '.git'))) found.add(p)
    parents.add(dirname(p))
  }
  for (const parent of parents) {
    try {
      for (const entry of readdirSync(parent, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const dir = join(parent, entry.name)
        if (existsSync(join(dir, '.git'))) found.add(dir)
      }
    } catch { /* unreadable dir — skip */ }
  }
  return [...found]
}

ipcMain.handle('git:scan-local-repos', async (_e, force?: boolean) => {
  const now = Date.now()
  if (force || now - repoScanCache.ts > 60_000) {
    repoScanCache = { paths: discoverLocalRepos(getRecentRepos()), ts: now }
  }
  const { execFile } = await import('child_process')
  const { promisify } = await import('util')
  const exec = promisify(execFile)
  const env = { ...process.env, LC_ALL: 'C' }
  const repos = await Promise.all(repoScanCache.paths.map(async p => {
    let changed = 0, added = 0, deleted = 0, branch = ''
    try {
      const st = await exec(gitBinary(), ['-C', p, 'status', '--porcelain'], { env })
      changed = st.stdout.split('\n').filter(Boolean).length
    } catch { return null }   // not a real repo anymore — drop it
    // Line-level breakdown (tracked changes vs HEAD), shown as ✏ + −.
    try {
      const ss = await exec(gitBinary(), ['-C', p, 'diff', 'HEAD', '--shortstat'], { env })
      added = Number(ss.stdout.match(/(\d+) insertion/)?.[1] ?? 0)
      deleted = Number(ss.stdout.match(/(\d+) deletion/)?.[1] ?? 0)
    } catch { /* empty repo / no HEAD — leave 0 */ }
    try {
      const b = await exec(gitBinary(), ['-C', p, 'rev-parse', '--abbrev-ref', 'HEAD'])
      branch = b.stdout.trim()
    } catch { /* detached — leave blank */ }
    if (!fullnameCache.has(p)) {
      try {
        const r = await exec(gitBinary(), ['-C', p, 'remote', 'get-url', 'origin'])
        const m = r.stdout.trim().match(/github\.com[:/]([^/]+)\/([^/.]+)(\.git)?/)
        fullnameCache.set(p, m ? `${m[1]}/${m[2]}` : null)
      } catch { fullnameCache.set(p, null) }
    }
    return { path: p, name: p.split('/').pop() ?? p, changed, added, deleted, branch, fullname: fullnameCache.get(p) ?? null }
  }))
  return { repos: repos.filter(Boolean) }
})

// User-centric Launchpad feed: one GitHub search across ALL of the user's
// repos (not just the recent/local ones). `q` is a GitHub
// issue-search query, e.g. "is:open is:pr author:@me".
// The search API is capped at 30 req/min, and the Launchpad remounts on every
// tab switch, so results are cached (20s TTL, force to bypass) to avoid
// burning through the limit and silently showing an empty list.
const searchCache = new Map<string, { ts: number; data: any }>()
ipcMain.handle('github:search-issues', async (_e, q: string, force?: boolean) => {
  const token = readSettings().githubToken
  if (!token) return { error: 'not_authenticated' }
  const hit = searchCache.get(q)
  if (!force && hit && Date.now() - hit.ts < 20_000) return hit.data
  try {
    const res = await fetch(
      `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=50&sort=updated`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
    )
    if (res.status === 403 || res.status === 429) {
      // Secondary/primary rate limit — tell the renderer how long to wait.
      const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000
      const secs = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 1000)) : 60
      return { error: 'rate_limited', retryIn: secs }
    }
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const data = await res.json() as any
    const result = {
      total: data.total_count ?? 0,
      items: (data.items ?? []).map((x: any) => {
        const repo = (x.repository_url ?? '').split('/').slice(-2).join('/')
        return {
          type: x.pull_request ? 'pr' : 'issue',
          number: x.number,
          title: x.title,
          draft: x.draft ?? false,
          author: x.user?.login ?? '',
          authorAvatar: x.user?.avatar_url ?? '',
          createdAt: x.created_at,
          updatedAt: x.updated_at,
          comments: x.comments ?? 0,
          labels: (x.labels ?? []).map((l: any) => ({ name: l.name, color: l.color })),
          url: x.html_url,
          repo,                          // owner/repo
          repoUrl: `https://github.com/${repo}`,
        }
      }),
    }
    searchCache.set(q, { ts: Date.now(), data: result })
    return result
  } catch (e: any) { return { error: e.message } }
})

ipcMain.handle('github:get-issue', async (_e, owner: string, repo: string, number: number) => {
  const token = readSettings().githubToken
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    // The issues endpoint resolves both issues and PRs by number
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${number}`, { headers })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const d = await res.json() as any
    return {
      issue: {
        number: d.number,
        title: d.title,
        state: d.state,
        isPR: !!d.pull_request,
        merged: d.pull_request?.merged_at != null,
        url: d.html_url,
      }
    }
  } catch (e: any) { return { error: e.message } }
})

ipcMain.handle('github:create-pr', async (_e, owner: string, repo: string, title: string, body: string, head: string, base: string) => {
  const token = readSettings().githubToken
  if (!token) return { error: 'not_authenticated' }
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, body, head, base }),
    })
    const data = await res.json() as any
    if (!res.ok) {
      // A rejected PR comes back as a bare "Validation Failed"; everything that
      // tells you what to fix ("No commits between main and x", an unpublished
      // head branch) is in the errors array. Surface that instead.
      const detail = Array.isArray(data.errors)
        ? data.errors
            .map((e: any) => e.message ?? (e.field ? `${e.field}: ${e.code}` : null))
            .filter(Boolean)
            .join(' — ')
        : ''
      const msg = data.message ?? `HTTP ${res.status}`
      return { error: detail ? `${msg} (${detail})` : msg }
    }
    return { url: data.html_url, number: data.number }
  } catch (e: any) { return { error: e.message } }
})

ipcMain.handle('github:list-branches', async (_e, owner: string, repo: string) => {
  const token = readSettings().githubToken
  if (!token) return { branches: [] }
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
    })
    if (!res.ok) return { branches: [] }
    const data = await res.json() as any[]
    return { branches: data.map((b: any) => b.name) }
  } catch { return { branches: [] } }
})

ipcMain.handle('github:list-repos', async () => {
  const token = readSettings().githubToken
  if (!token) return { error: 'not_authenticated' }
  try {
    let repos: any[] = []
    let page = 1
    while (true) {
      const res = await fetch(
        `https://api.github.com/user/repos?per_page=100&sort=updated&page=${page}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
      )
      if (!res.ok) return { error: `HTTP ${res.status}` }
      const batch = await res.json() as any[]
      repos = repos.concat(batch)
      if (batch.length < 100) break
      page++
    }
    return {
      repos: repos.map(r => ({
        id: r.id,
        name: r.name,
        fullName: r.full_name,
        description: r.description ?? '',
        private: r.private,
        language: r.language ?? null,
        stars: r.stargazers_count,
        updatedAt: r.updated_at,
        cloneUrl: r.clone_url,
        sshUrl: r.ssh_url,
      }))
    }
  } catch (e: any) { return { error: e.message } }
})

ipcMain.handle('github:clone', async (_e, cloneUrl: string, repoName: string) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: `Choose where to clone "${repoName}"`
  })
  if (result.canceled || result.filePaths.length === 0) return { cancelled: true }
  const parentDir = result.filePaths[0]
  const targetPath = pathJoin(parentDir, repoName)
  try {
    const sg = makeSimpleGit()
    await sg.clone(cloneUrl, targetPath)
    return openRepoAt(targetPath)
  } catch (e: any) {
    return { error: e.message }
  }
})

// Clone to an explicit location (no native dialog) with Shallow/Sparse options —
// used by the Clone modal.
ipcMain.handle('git:clone-to', async (_e, opts: { url: string; location: string; name: string; shallow?: boolean; sparse?: boolean }) => {
  try {
    const target = pathJoin(opts.location, opts.name)
    const args: string[] = []
    if (opts.shallow) args.push('--depth', '1')
    if (opts.sparse) args.push('--sparse')
    // Embed the token for github.com HTTPS so private repos clone, then scrub it.
    const token = readSettings().githubToken
    let url = opts.url
    const isGh = /^https:\/\/github\.com\//.test(url)
    if (token && isGh) url = url.replace('https://', `https://${token}@`)
    await makeSimpleGit().clone(url, target, args)
    if (token && isGh) { try { await makeSimpleGit(target).remote(['set-url', 'origin', opts.url]) } catch { /* keep */ } }
    return openRepoAt(target)
  } catch (e: any) { return { error: e.message } }
})

ipcMain.handle('github:get-user', async () => {
  const token = readSettings().githubToken
  if (!token) return { user: null }
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
    })
    if (!res.ok) return { user: null }
    const user = await res.json() as { login: string; avatar_url: string }

    // Fetch avatar as base64 to avoid CSP issues in renderer
    let avatar = ''
    try {
      const imgRes = await fetch(user.avatar_url)
      const contentType = imgRes.headers.get('content-type') ?? 'image/png'
      const buffer = Buffer.from(await imgRes.arrayBuffer())
      avatar = `data:${contentType};base64,${buffer.toString('base64')}`
    } catch { /* avatar stays empty */ }

    return { user: { login: user.login, avatar } }
  } catch { return { user: null } }
})
