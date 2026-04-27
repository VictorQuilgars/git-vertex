import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { GitService } from './git-service'
import { getRecentRepos, addRecentRepo, removeRecentRepo } from './recent-repos'

let mainWindow: BrowserWindow
let gitService: GitService | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d1117',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.gitgui')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── Helpers ───────────────────────────────────────────────────
async function openRepoAt(repoPath: string): Promise<{ path?: string; name?: string; error?: string }> {
  try {
    const svc = new GitService(repoPath)
    await svc.checkRepo()
    gitService = svc
    addRecentRepo(repoPath)
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

ipcMain.handle('git:get-commit-files', async (_event, commitHash: string) => {
  if (!gitService) return { error: 'No repo open' }
  return gitService.getCommitFiles(commitHash)
})

ipcMain.handle('git:get-status', async () => {
  if (!gitService) return { error: 'No repo open' }
  return gitService.getStatus()
})

ipcMain.handle('git:get-stashes', async () => {
  if (!gitService) return { error: 'No repo open' }
  return gitService.getStashes()
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

ipcMain.handle('git:fetch', async () => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.fetch()
})

ipcMain.handle('git:push', async () => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.push()
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
  return gitService.commit(message, amend)
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

ipcMain.handle('git:interactive-rebase', async (_event, sequence: { action: string; hash: string }[]) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.interactiveRebase(sequence)
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

ipcMain.handle('git:mark-resolved', async (_event, filepath: string) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.markResolved(filepath)
})

ipcMain.handle('git:continue-rebase', async () => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.continueRebase()
})

ipcMain.handle('git:continue-merge', async () => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.continueMerge()
})

ipcMain.handle('git:abort-rebase', async () => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.abortRebase()
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
