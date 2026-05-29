import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import simpleGit from 'simple-git'
import { GitService } from './git-service'
import { getRecentRepos, addRecentRepo, removeRecentRepo } from './recent-repos'
import { startOAuthFlow, handleOAuthCallback } from './github-auth'

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

// Register custom protocol for GitHub OAuth callback
app.setAsDefaultProtocolClient('gitgui')

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
    // Find gitgui:// URL in argv (Windows passes it as a CLI argument)
    const url = argv.find(a => a.startsWith('gitgui://callback'))
    if (!url) return
    const result = await handleOAuthCallback(url)
    if ('token' in result) {
      const s = readSettings(); s.githubToken = result.token; writeSettings(s)
      mainWindow?.webContents.send('github:auth-complete', { token: result.token })
    } else {
      mainWindow?.webContents.send('github:auth-complete', { error: result.error })
    }
  })
}

// macOS: app already running, callback arrives via open-url
app.on('open-url', async (event, url) => {
  event.preventDefault()
  if (!url.startsWith('gitgui://callback')) return
  const result = await handleOAuthCallback(url)
  if ('token' in result) {
    const s = readSettings(); s.githubToken = result.token; writeSettings(s)
    mainWindow?.webContents.send('github:auth-complete', { token: result.token })
  } else {
    mainWindow?.webContents.send('github:auth-complete', { error: result.error })
  }
})

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
  return gitService.fetch()
})

ipcMain.handle('git:push', async () => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.push()
})

ipcMain.handle('git:push-to', async (_e, remote: string, branch: string, setUpstream: boolean) => {
  if (!gitService) return { success: false, error: 'No repo open' }
  return gitService.pushTo(remote, branch, setUpstream)
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

ipcMain.handle('ai:generate-commit-message', async () => {
  if (!gitService) { console.log('[ai] no gitService'); return { error: 'Aucun dépôt ouvert' } }
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

  let stagedDiff = ''
  try {
    const git = (gitService as any).git
    stagedDiff = await git.raw(['diff', '--cached'])
  } catch { return { error: 'Impossible de récupérer le diff' } }
  if (!stagedDiff.trim()) { console.log('[ai] no staged diff'); return { error: 'Aucun changement indexé à analyser' } }

  const truncated = stagedDiff.length > 6000 ? stagedDiff.slice(0, 6000) + '\n... [diff tronqué]' : stagedDiff
  const prompt = `You are a Git expert. Analyze this diff and generate a concise commit message following Conventional Commits (feat/fix/docs/chore/refactor/style/test/perf). First line: type(scope): description (max 72 chars). Reply ONLY with the commit message in English.\n\nDiff:\n\`\`\`diff\n${truncated}\n\`\`\``

  const callAPI = async (): Promise<string> => {
    if (provider === 'anthropic') {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const client = new Anthropic({ apiKey })
      const res = await client.messages.create({ model, max_tokens: 512, messages: [{ role: 'user', content: prompt }] })
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
      const response = await client.chat.completions.create({ model, max_tokens: 512, messages: [{ role: 'user', content: prompt }] })
      return response.choices[0]?.message?.content?.trim() ?? ''
    }
    // groq (default)
    const Groq = (await import('groq-sdk')).default
    const client = new Groq({ apiKey })
    const response = await client.chat.completions.create({ model, max_tokens: 512, messages: [{ role: 'user', content: prompt }] })
    return response.choices[0]?.message?.content?.trim() ?? ''
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const message = await callAPI()
      console.log(`[ai] attempt=${attempt} length=${message.length} preview="${message.slice(0, 60)}"`)
      if (message) return { message }
      console.log(`[ai] empty response on attempt ${attempt}, retrying…`)
      if (attempt < 3) await new Promise(r => setTimeout(r, 500 * attempt))
    } catch (e: any) {
      console.error(`[ai] attempt=${attempt} error:`, e.message)
      if (attempt === 3) return { error: e.message ?? 'Erreur API' }
      await new Promise(r => setTimeout(r, 500 * attempt))
    }
  }
  return { error: 'Le modèle a retourné une réponse vide après 3 tentatives' }
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
