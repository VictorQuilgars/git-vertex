// updater:* — the auto-update, and the state of a download in progress.
import { handle } from './handle'
import { app, shell, ipcMain } from 'electron'
import { join } from 'path'
import { readdirSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import fs from 'fs'
import os from 'os'
import { writeFileSync, mkdirSync } from 'fs'
import { join as pathJoin } from 'path'
import { notify, state } from '../app-state'

// Track downloaded update so late-opening windows can query state
export let downloadedUpdateVersion: string | null = null

export let downloadedUpdateFile: string | null = null

// On Windows the assisted NSIS installer would replay the full setup wizard on
// every update unless we run it silently. quitAndInstall(isSilent=true,
// isForceRunAfter=true) applies the update in the background and relaunches the
// app. Other platforms keep the default behavior.
export function installDownloadedUpdate() {
  if (process.platform === 'win32') autoUpdater.quitAndInstall(true, true)
  else autoUpdater.quitAndInstall()
}

export function semverGt(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false
  }
  return false
}

export function watchAutoUpdater(): void {
  // Auto-updater (only in production)
  if (!is.dev) {
    // Don't download in the background: the renderer starts the download when
    // the user chooses to update, so the progress bar is actually visible to
    // them (an already-downloaded update would jump straight to "installing").
    autoUpdater.autoDownload = false
    autoUpdater.on('update-available', (info) => {
      console.log('[updater] update available:', info.version)
      state.mainWindow?.webContents.send('updater:update-available', info.version)
    })
    autoUpdater.on('update-not-available', (info) => {
      console.log('[updater] up to date:', info.version)
      state.mainWindow?.webContents.send('updater:not-available')
    })
    autoUpdater.on('download-progress', (progress) => {
      state.mainWindow?.webContents.send('updater:download-progress', Math.round(progress.percent))
    })
    autoUpdater.on('update-downloaded', (info) => {
      console.log('[updater] downloaded:', info.version, info.downloadedFile)
      downloadedUpdateVersion = info.version
      downloadedUpdateFile = info.downloadedFile ?? null
      state.mainWindow?.webContents.send('updater:update-downloaded', info.version)
      notify('Update available', `Version ${info.version} is ready to install.`, 'notifyUpdate')
    })
    autoUpdater.on('error', (err) => {
      console.error('[updater] error:', err.message)
      state.mainWindow?.webContents.send('updater:error', err.message)
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
}

export function registerUpdaterHandlers(): void {
  handle('updater:download', async () => {
    if (is.dev) return { dev: true }
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (e: any) {
      return { error: e?.message ?? String(e) }
    }
  })

  handle('updater:install', () => {
    installDownloadedUpdate()
  })

  handle('updater:get-state', () => {
    return { downloadedVersion: downloadedUpdateVersion, downloadedFile: downloadedUpdateFile }
  })

  handle('updater:open-downloaded', () => {
    if (downloadedUpdateFile) {
      shell.showItemInFolder(downloadedUpdateFile)
    }
  })

  handle('updater:install-manual', async () => {
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

  handle('updater:check', async () => {
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
}
