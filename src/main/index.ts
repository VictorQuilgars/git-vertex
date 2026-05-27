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

ipcMain.handle('ai:generate-commit-message', async () => {
  if (!gitService) return { error: 'Aucun dépôt ouvert' }
  const apiKey = readSettings().groqApiKey
  if (!apiKey) return { error: 'NO_API_KEY' }

  let stagedDiff = ''
  try {
    const git = (gitService as any).git
    stagedDiff = await git.raw(['diff', '--cached'])
  } catch { return { error: 'Impossible de récupérer le diff' } }

  if (!stagedDiff.trim()) return { error: 'Aucun changement indexé à analyser' }

  const truncated = stagedDiff.length > 6000
    ? stagedDiff.slice(0, 6000) + '\n... [diff tronqué]'
    : stagedDiff

  const prompt = `Tu es un expert Git. Analyse ce diff Git et génère un message de commit concis et descriptif en suivant le format Conventional Commits (feat/fix/docs/chore/refactor/style/test/perf).

Règles :
- Première ligne : type(scope optionnel): description courte (max 72 chars)
- Si nécessaire, ajoute 1-2 lignes de détails après une ligne vide
- Réponds UNIQUEMENT avec le message de commit, sans explication

Diff :
\`\`\`diff
${truncated}
\`\`\``

  try {
    const Groq = (await import('groq-sdk')).default
    const client = new Groq({ apiKey })
    const response = await client.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }]
    })
    const message = response.choices[0]?.message?.content?.trim() ?? ''
    return { message }
  } catch (e: any) {
    return { error: e.message ?? 'Erreur API' }
  }
})
