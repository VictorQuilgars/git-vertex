// app:*, dialog:* and agents:* — the application itself: repositories, editors, terminals, dialogs.
import { app, shell, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { RELEASE_NOTES } from '../release-notes'
import { buildToolInvocation, resolveTerminalLaunch, findAvailableKeyPath, safeTempFileName } from '../settings-helpers'
import { getRecentRepos, removeRecentRepo, getWorkspaces, setRepoWorkspace } from '../recent-repos'
import { isGitVersionAtLeast, MIN_GIT_FOR_CONFLICT_PREDICTION } from '../git-service'
import { initGitBinary, gitBinaryReady } from '../git-binary'
import { isSafeExternalUrl } from '../external-url'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { state } from '../app-state'
import { readSettings, writeSettings } from '../settings-store'

// ── Agent awareness ────────────────────────────────────────────
// Detects known AI coding agents currently running (Claude Code, aider,
// codex, gemini, amp…) and their working directories, so the UI can show
// which worktree/repo each agent is operating on. One fast `lsof` filtered
// by command name — never a full process walk. macOS/Linux only; returns
// an empty list elsewhere or on any failure.
export const AGENT_COMMANDS: Record<string, string> = {
  claude: 'Claude Code',
  aider: 'aider',
  codex: 'Codex CLI',
  gemini: 'Gemini CLI',
  amp: 'Amp',
  goose: 'Goose',
}

export function registerAppHandlers(): void {
  // ── IPC: Repo management ──────────────────────────────────────
  ipcMain.handle('app:is-fullscreen', () => state.mainWindow?.isFullScreen() ?? false)

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

  ipcMain.handle('app:select-directory', async (_event, title?: string) => {
    const result = await dialog.showOpenDialog(state.mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: title ?? 'Choose a folder'
    })
    if (result.canceled || result.filePaths.length === 0) return { path: null }
    return { path: result.filePaths[0] }
  })

  // Saves patch text to a file the user picks (native save dialog) — used by
  // "Create Patch..." in the commit context menu.
  ipcMain.handle('dialog:save-patch', async (_event, content: string, suggestedName: string) => {
    if (!state.mainWindow) return { success: false, error: 'No window' }
    const result = await dialog.showSaveDialog(state.mainWindow, {
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

  // ── SSH keys ─────────────────────────────────────────────────────
  ipcMain.handle('app:ssh-browse-key', async (_e, kind: 'private' | 'public') => {
    const result = await dialog.showOpenDialog(state.mainWindow, {
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
    if (!state.gitService) return { success: false, error: 'No repo open' }
    try {
      const versions = await state.gitService.getConflictVersions(filepath)
      const safeName = safeTempFileName(filepath)
      const tmp = join(os.tmpdir(), `git-vertex-merge-${Date.now()}`)
      mkdirSync(tmp, { recursive: true })
      const oursPath = join(tmp, `ours-${safeName}`)
      const theirsPath = join(tmp, `theirs-${safeName}`)
      const mergedPath = join(tmp, `merged-${safeName}`)
      writeFileSync(oursPath, versions.ours ?? '')
      writeFileSync(theirsPath, versions.theirs ?? '')
      const abs = path.isAbsolute(filepath) ? filepath : path.join(state.gitService.repoPath, filepath)
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

  ipcMain.handle('app:open-external', async (_e, url: string) => {
    // A remote URL, an issue body, a README: none of it is ours. Only the web
    // schemes and mail reach the OS; a `file:` or a custom scheme would open a
    // file or launch a program on a click that only promised a browser.
    if (!isSafeExternalUrl(url)) return { success: false, error: `Refusing to open ${String(url).slice(0, 80)}` }
    await shell.openExternal(url)
    return { success: true }
  })

  // Open a repo file in an external editor. Uses the configured `externalEditor`
  // command (e.g. "code", "code --wait", "subl", "meld") if set, otherwise falls
  // back to the OS default application for the file.
  ipcMain.handle('app:open-in-editor', async (_e, filepath: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    const path = await import('path')
    const abs = path.isAbsolute(filepath) ? filepath : path.join(state.gitService.repoPath, filepath)
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
      const child = spawn(cmd, args, { cwd: state.gitService.repoPath, detached: true, stdio: 'ignore' })
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

  // Open the system terminal at the repository root. Uses the configured
  // `externalTerminal` app (e.g. "iTerm", "Warp") if set, otherwise falls back
  // to the OS default terminal.
  ipcMain.handle('app:open-terminal', async () => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    const cwd = state.gitService.repoPath
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
}
