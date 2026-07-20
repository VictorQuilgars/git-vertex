import { app, shell, BrowserWindow, ipcMain, dialog, Notification } from 'electron'
import { join } from 'path'
import { createHash } from 'crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import simpleGit from 'simple-git'

import { GitService } from './git-service'
import { getRecentRepos, addRecentRepo, removeRecentRepo } from './recent-repos'
import { startOAuthFlow, handleOAuthCallback } from './github-auth'

let mainWindow: BrowserWindow
let gitService: GitService | null = null

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
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d1117',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    icon: join(__dirname, '../../resources/icon.icns'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

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
    if (!abs.startsWith(dir + path.sep)) return undefined
    const content = fs.readFileSync(abs, 'utf-8')
    fs.unlink(abs, () => {}) // best-effort cleanup, single-use file
    return content
  } catch {
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
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Auto-updater (only in production)
  if (!is.dev) {
    autoUpdater.autoDownload = true
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
      notify('Mise à jour disponible', `La version ${info.version} est prête à être installée.`, 'notifyUpdate')
    })
    autoUpdater.on('error', (err) => {
      console.error('[updater] error:', err.message)
      mainWindow?.webContents.send('updater:error', err.message)
    })
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
      console.error('[updater] checkForUpdates failed:', err.message)
    })
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
    const name = repoPath.split('/').pop()!
    return { path: repoPath, name }
  } catch (e: any) {
    return { error: e.message }
  }
}

// ── IPC: Repo management ──────────────────────────────────────
ipcMain.handle('app:get-recent-repos', () => getRecentRepos())

ipcMain.handle('app:remove-recent-repo', (_event, path: string) => removeRecentRepo(path))

ipcMain.handle('git:open-repo', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Ouvrir un dépôt Git'
  })
  if (result.canceled || result.filePaths.length === 0) return { error: 'cancelled' }
  return openRepoAt(result.filePaths[0])
})

ipcMain.handle('git:set-repo', async (_event, repoPath: string) => {
  return openRepoAt(repoPath)
})

ipcMain.handle('app:select-directory', async (_event, title?: string) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: title ?? 'Choisir un dossier'
  })
  if (result.canceled || result.filePaths.length === 0) return { path: null }
  return { path: result.filePaths[0] }
})

// ── IPC: Git read operations ───────────────────────────────────
ipcMain.handle('git:get-log', async (_event, options: { maxCount?: number; all?: boolean } = {}) => {
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

ipcMain.handle('git:diff-between-commits', async (_event, fromHash: string, toHash: string) => {
  if (!gitService) return { diff: '', error: 'No repo open' }
  return gitService.diffBetweenCommits(fromHash, toHash)
})

ipcMain.handle('git:files-between-commits', async (_event, fromHash: string, toHash: string) => {
  if (!gitService) return { files: [], error: 'No repo open' }
  return gitService.filesBetweenCommits(fromHash, toHash)
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
  return gitService.checkout(ref)
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
        'Nouveaux commits disponibles',
        changed === 1
          ? '1 branche distante a été mise à jour.'
          : `${changed} branches distantes ont été mises à jour.`,
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

ipcMain.handle('git:pull', async () => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.pull()
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
    notify('Commit créé', firstLine, 'notifyCommit', false)
  }
  return result
})

ipcMain.handle('git:get-last-commit-message', async () => {
  if (!gitService) return { message: '' }
  return gitService.getLastCommitMessage()
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
  return gitService.merge(branch)
})

ipcMain.handle('git:rebase-onto', async (_event, branch: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.rebaseOnto(branch)
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
    title: 'Enregistrer le patch',
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
  return gitService.rebaseBranchOnto(branch, hash)
})

ipcMain.handle('git:merge-commit-into', async (_event, branch: string, hash: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.mergeCommitInto(branch, hash)
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
ipcMain.handle('git:create-stash', async (_event, message?: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.createStash(message)
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
      if (attempt === 3) return { error: e.message ?? 'Erreur API' }
      await new Promise(r => setTimeout(r, 500 * attempt))
    }
  }
  return { error: 'Le modèle a retourné une réponse vide après 3 tentatives' }
}

const truncateDiff = (diff: string, max = 6000) =>
  diff.length > max ? diff.slice(0, max) + '\n... [diff tronqué]' : diff

ipcMain.handle('ai:generate-commit-message', async () => {
  if (!gitService) { console.log('[ai] no gitService'); return { error: 'Aucun dépôt ouvert' } }
  let stagedDiff = ''
  try {
    const git = (gitService as any).git
    stagedDiff = await git.raw(['diff', '--cached'])
  } catch { return { error: 'Impossible de récupérer le diff' } }
  if (!stagedDiff.trim()) { console.log('[ai] no staged diff'); return { error: 'Aucun changement indexé à analyser' } }

  const prompt = `You are a Git expert. Analyze this diff and generate a concise commit message following Conventional Commits (feat/fix/docs/chore/refactor/style/test/perf). First line: type(scope): description (max 72 chars). Reply ONLY with the commit message in English.\n\nDiff:\n\`\`\`diff\n${truncateDiff(stagedDiff)}\n\`\`\``
  const r = await runAIPrompt(prompt)
  return r.error ? { error: r.error } : { message: r.text }
})

// Recompose: regenerate an EXISTING commit's message from its actual diff.
// The renderer applies the result through the normal amend/reword flow, so
// the user always reviews the proposal before anything is rewritten.
ipcMain.handle('ai:recompose-commit', async (_e, hash: string) => {
  if (!gitService) return { error: 'Aucun dépôt ouvert' }
  let diff = ''
  let currentMsg = ''
  try {
    const git = (gitService as any).git
    diff = await git.raw(['diff-tree', '--no-commit-id', '-p', '--root', hash])
    currentMsg = (await git.raw(['log', '-1', '--pretty=format:%B', hash])).trim()
  } catch { return { error: 'Impossible de récupérer le diff du commit' } }
  if (!diff.trim()) return { error: 'Ce commit ne contient aucun changement à analyser (commit de merge ?)' }

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
  if (!gitService) return { error: 'Aucun dépôt ouvert' }
  const fileRes = await gitService.getFileContent(filepath)
  if (fileRes.error) return { error: fileRes.error }
  const content = fileRes.content ?? ''
  if (!/^<{7}/m.test(content)) return { error: 'Aucun marqueur de conflit trouvé dans ce fichier' }
  if (content.length > AI_CONFLICT_MAX_CHARS) {
    return { error: `Fichier trop long pour la résolution IA (${content.length} caractères, max ${AI_CONFLICT_MAX_CHARS})` }
  }

  const extra = instruction?.trim()
    ? `\n\nUser guidance (follow it when choosing between sides): ${instruction.trim()}`
    : ''
  const prompt = `You are a Git merge expert. This file contains merge conflict markers (<<<<<<<, =======, >>>>>>>, and possibly ||||||| base sections). Resolve every conflict by producing the correct merged file: keep the intent of BOTH sides when they are compatible, otherwise pick the side that keeps the file consistent.${extra}

CRITICAL formatting rules:
- Copy the chosen lines EXACTLY as they appear: preserve every space, tab, indentation, trailing whitespace and blank line. Never reformat, re-indent, trim or normalize anything outside the conflicted regions — and inside them, reproduce the chosen side's lines byte-for-byte.
- No conflict markers, no code fences, no commentary inside the file.

Reply in EXACTLY this format:
EXPLANATION: <1 à 3 phrases en français expliquant quels côtés tu as choisis et pourquoi>
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
  if (/^[<=>]{7}/m.test(resolution)) return { error: "La proposition de l'IA contient encore des marqueurs de conflit — réessayez, éventuellement avec une instruction plus précise" }
  return { resolution, explanation }
})

// Natural-language commit search: sends a compact one-line-per-commit index
// (hash, author, date, subject) and asks the model which commits match the
// user's free-form query. Returns { hashes } of full hashes.
ipcMain.handle('ai:search-commits', async (_e, query: string) => {
  if (!gitService) return { error: 'Aucun dépôt ouvert' }
  if (!query?.trim()) return { hashes: [] }
  let index = ''
  try {
    const git = (gitService as any).git
    // Short hashes + truncated subjects keep the index small: free-tier
    // providers cap tokens/minute and reject large prompts outright (the
    // 300-commit/24k-chars first version did exactly that).
    index = await git.raw(['log', '--all', '--max-count=200', '--date=short', '--pretty=format:%h|%an|%ad|%s'])
    index = index.split('\n').map(l => l.length > 90 ? l.slice(0, 90) : l).join('\n')
  } catch { return { error: "Impossible de lire l'historique" } }
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
  if (!gitService) return { error: 'Aucun dépôt ouvert' }
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
  } catch { return { error: 'Impossible de récupérer le diff du commit' } }
  if (!diff.trim()) return { error: 'Ce commit ne contient aucun changement à analyser (commit de merge ?)' }

  const prompt = `Tu es un expert Git. Explique en français, simplement et concrètement, ce que fait ce commit : quels fichiers/comportements changent et pourquoi c'est probablement fait. 3 à 6 phrases maximum, pas de liste à puces, pas de préambule.\n\nMessage du commit : ${currentMsg}\n\nDiff :\n\`\`\`diff\n${truncateDiff(diff)}\n\`\`\``
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
  return { success: true }
})

// ── Git global config ──────────────────────────────────────────
ipcMain.handle('git:get-global-config', async () => {
  const { execFile } = await import('child_process')
  const { promisify } = await import('util')
  const exec = promisify(execFile)
  const run = async (args: string[]) => {
    try { const r = await exec('git', args); return r.stdout.trim() } catch { return '' }
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
    if (userName) await exec('git', ['config', '--global', 'user.name', userName])
    if (userEmail) await exec('git', ['config', '--global', 'user.email', userEmail])
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

// Open the system terminal at the repository root.
ipcMain.handle('app:open-terminal', async () => {
  if (!gitService) return { success: false, error: 'No repo open' }
  const cwd = gitService.repoPath
  try {
    const { spawn } = await import('child_process')
    let cmd: string, args: string[]
    if (process.platform === 'darwin') {
      cmd = 'open'; args = ['-a', 'Terminal', cwd]
    } else if (process.platform === 'win32') {
      cmd = 'cmd'; args = ['/c', 'start', 'cmd', '/k', `cd /d ${cwd}`]
    } else {
      cmd = 'x-terminal-emulator'; args = [`--working-directory=${cwd}`]
    }
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

ipcMain.handle('updater:install', () => {
  autoUpdater.quitAndInstall()
})

ipcMain.handle('updater:get-state', () => {
  return { downloadedVersion: downloadedUpdateVersion, downloadedFile: downloadedUpdateFile }
})

ipcMain.handle('updater:open-downloaded', () => {
  if (downloadedUpdateFile) {
    shell.showItemInFolder(downloadedUpdateFile)
  }
})

ipcMain.handle('updater:install-manual', async () => {
  // Windows & Linux: quitAndInstall() works natively (no Gatekeeper)
  if (process.platform !== 'darwin') {
    autoUpdater.quitAndInstall()
    return { success: true }
  }

  // macOS: manual unzip + replace because unsigned apps are blocked by Gatekeeper
  if (!downloadedUpdateFile) return { error: 'Aucun fichier téléchargé' }
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
    if (!appBundle) return { error: '.app introuvable dans le ZIP' }
    const newAppPath = pathJoin(tempDir, appBundle)

    try { await exec('xattr', ['-dr', 'com.apple.quarantine', newAppPath]) } catch { /* ignore */ }

    const exePath = app.getPath('exe')
    const match = exePath.match(/^(.*\.app)/)
    if (!match) return { error: 'Impossible de localiser le bundle courant' }
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
    if (!res.ok) return { error: data.message ?? `HTTP ${res.status}` }
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
    title: `Choisir où cloner "${repoName}"`
  })
  if (result.canceled || result.filePaths.length === 0) return { cancelled: true }
  const parentDir = result.filePaths[0]
  const targetPath = pathJoin(parentDir, repoName)
  try {
    const sg = simpleGit()
    await sg.clone(cloneUrl, targetPath)
    return openRepoAt(targetPath)
  } catch (e: any) {
    return { error: e.message }
  }
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
