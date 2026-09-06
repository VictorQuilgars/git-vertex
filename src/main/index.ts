// The main process: the window, the splash, the single instance, the deep links, the boot.
// What the renderer can ask for lives in src/main/ipc/, one file per domain; what they
// share — the open repository, the settings, the GitHub client, the AI runtime — beside it.
import { app, shell, BrowserWindow, systemPreferences } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initGitBinary } from './git-binary'
import { isSafeExternalUrl } from './external-url'
import { splashHtml, themeCanvas, SPLASH_THEMES, SPLASH_ANIMATION_MS, SPLASH_STILL_MS } from './splash'
import type { SplashTheme } from './splash'
import iconPng from '../../resources/icon.png?asset'
import iconIco from '../../resources/icon.ico?asset'
import path from 'path'
import { stopWatchers } from './repo-session'
import { state } from './app-state'
import { handleProtocolUrl, registerDeepLinkHandlers } from './deep-link'
import { watchAutoUpdater, registerUpdaterHandlers } from './ipc/updater'
import { registerAppHandlers } from './ipc/app'
import { registerGitHandlers } from './ipc/git'
import { registerGithubHandlers } from './ipc/github'
import { readSettings } from './settings-store'
import { registerSettingsHandlers } from './ipc/settings'
import { registerAiHandlers } from './ipc/ai'

let splashWindow: BrowserWindow | null = null

let splashShownAt = 0

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
    // The card draws its own shadow (splash.ts). The system's would be drawn
    // for the WINDOW rectangle, not the opaque card — and on macOS 26 that
    // comes with a light glass rim, which showed as a translucent halo in
    // the 22px of transparent margin around the card at every launch.
    hasShadow: false,
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

function createWindow(): void {
  const theme = bootTheme()
  createSplash(theme)
  state.mainWindow = new BrowserWindow({
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
      // The preload uses contextBridge, ipcRenderer and webFrame and nothing
      // else, which is exactly what a sandboxed preload may use: the renderer
      // runs under Chromium's own sandbox, as a page does, rather than with
      // Node's reach one bridge away.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  })

  state.mainWindow.on('ready-to-show', () => {
    // Ready is not the same as due: hold until the splash has finished playing,
    // then hand over. Zero on a slow boot, where ready-to-show is already late.
    setTimeout(() => {
      if (!state.mainWindow || state.mainWindow.isDestroyed()) return
      // Splash off FIRST, then the reveal, both in this tick so the compositor
      // sees one frame. The other order leaves the splash over a live app for
      // however long its teardown takes, which is the bug this pairing fixes.
      closeSplash()
      state.mainWindow.show()
    }, splashRemaining())
  })

  // In macOS fullscreen the traffic-light buttons are hidden, so the renderer
  // must drop the 72px spacer that reserves room for them.
  const sendFullscreen = () => state.mainWindow?.webContents.send('app:fullscreen-changed', state.mainWindow.isFullScreen())
  state.mainWindow.on('enter-full-screen', sendFullscreen)
  state.mainWindow.on('leave-full-screen', sendFullscreen)

  state.mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isSafeExternalUrl(details.url)) shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    state.mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    state.mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Register custom protocol: GitHub OAuth callback + deep links
// (gitgui://open — used by git-vertex-mcp's open_in_git_vertex tool)
// Every IPC channel, by domain — see src/main/ipc/. Registered at boot, as they always were.
registerGitHandlers()
registerGithubHandlers()
registerAiHandlers()
registerAppHandlers()
registerSettingsHandlers()
registerUpdaterHandlers()
registerDeepLinkHandlers()

app.setAsDefaultProtocolClient('gitgui')

// Windows: only one instance allowed — second instance passes its args to the first
const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', async (_event, argv) => {
    // Bring existing window to front
    if (state.mainWindow) {
      if (state.mainWindow.isMinimized()) state.mainWindow.restore()
      state.mainWindow.focus()
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

  watchAutoUpdater()
})

app.on('window-all-closed', () => {
  stopWatchers()
  if (process.platform !== 'darwin') app.quit()
})
