import * as vscode from 'vscode'
import * as path from 'path'
import { findAppPath, launchApp } from './appLocator'
import { GitVertexStatusBar } from './statusBar'
import { getGitInfo, getRepoRootForFile } from './gitInfo'
import { GitVertexViewProvider } from './panel/GitVertexViewProvider'
import { openGitVertexEditor, setEditorRepo } from './panel/GitVertexHost'

let statusBar: GitVertexStatusBar | null = null
let refreshTimer: NodeJS.Timeout | null = null

// ── Resolve app path (config > auto-detect) ────────────────────
function resolveAppPath(): string | null {
  const cfg = vscode.workspace.getConfiguration('gitVertex')
  const custom = cfg.get<string>('appPath', '').trim()
  return custom || findAppPath()
}

// ── Resolve repo root for current context ─────────────────────
function resolveRepoRoot(uri?: vscode.Uri): string | null {
  // 1. Explicit URI (context menu on explorer item)
  if (uri) return getRepoRootForFile(uri.fsPath)

  // 2. Active text editor
  const editor = vscode.window.activeTextEditor
  if (editor) return getRepoRootForFile(editor.document.uri.fsPath)

  // 3. First workspace folder
  const folders = vscode.workspace.workspaceFolders
  if (folders && folders.length > 0) return getRepoRootForFile(folders[0].uri.fsPath)

  return null
}

// ── Open command ───────────────────────────────────────────────
async function openInGitVertex(uri?: vscode.Uri): Promise<void> {
  const appPath = resolveAppPath()
  if (!appPath) {
    const action = await vscode.window.showErrorMessage(
      'Git Vertex not found. Install it or configure the path.',
      'Configure path'
    )
    if (action === 'Configure path') {
      vscode.commands.executeCommand('gitVertex.configure')
    }
    return
  }

  const repoRoot = resolveRepoRoot(uri)
  if (!repoRoot) {
    vscode.window.showWarningMessage('No Git repository found for this workspace.')
    return
  }

  try {
    launchApp(appPath, repoRoot)
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to launch Git Vertex: ${err}`)
  }
}

// ── Configure command ──────────────────────────────────────────
async function configure(): Promise<void> {
  const result = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    title: 'Select Git Vertex executable',
    filters: process.platform === 'win32'
      ? { Executables: ['exe'] }
      : { All: ['*'] }
  })
  if (!result || result.length === 0) return

  const cfg = vscode.workspace.getConfiguration('gitVertex')
  await cfg.update('appPath', result[0].fsPath, vscode.ConfigurationTarget.Global)
  vscode.window.showInformationMessage(`Git Vertex path set to: ${result[0].fsPath}`)
}

// ── Status bar refresh ─────────────────────────────────────────
function refreshStatusBar(): void {
  if (!statusBar) return

  const folders = vscode.workspace.workspaceFolders
  if (!folders || folders.length === 0) { statusBar.hide(); return }

  const info = getGitInfo(folders[0].uri.fsPath)
  if (!info) { statusBar.hide(); return }

  statusBar.update(info.branch, info.ahead, info.behind)
}

function scheduleRefresh(delayMs = 3000): void {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(refreshStatusBar, delayMs)
}

// ── Activation ────────────────────────────────────────────────
export function activate(context: vscode.ExtensionContext): void {
  statusBar = new GitVertexStatusBar('gitVertex.open')

  // Create the WebviewViewProvider for the bottom panel
  const provider = new GitVertexViewProvider(context.extensionUri, context.globalState)

  // Register the provider (panel view)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      GitVertexViewProvider.viewType,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  )

  // Resolve initial repo and inject into provider
  const repoRoot = resolveRepoRoot()
  if (repoRoot) provider.setRepo(repoRoot)

  // Initial refresh
  refreshStatusBar()

  // Re-read on file saves, editor changes, workspace changes
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => scheduleRefresh()),
    vscode.window.onDidChangeActiveTextEditor(() => scheduleRefresh(500)),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      refreshStatusBar()
      const root = resolveRepoRoot()
      if (root) { provider.setRepo(root); setEditorRepo(root) }
    }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('gitVertex')) refreshStatusBar()
    }),
  )

  // Periodic refresh every 30s to pick up remote tracking changes
  const periodicTimer = setInterval(refreshStatusBar, 30_000)
  context.subscriptions.push({ dispose: () => clearInterval(periodicTimer) })

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('gitVertex.open', () => openInGitVertex()),
    vscode.commands.registerCommand('gitVertex.openFile', (uri?: vscode.Uri) => openInGitVertex(uri)),
    vscode.commands.registerCommand('gitVertex.configure', () => configure()),
    vscode.commands.registerCommand('gitVertex.openPanel', () => {
      vscode.commands.executeCommand('gitVertex.graphView.focus')
    }),
    // Open Git Vertex as a movable/splittable editor tab (reuses the same UI).
    vscode.commands.registerCommand('gitVertex.openInEditor', () => {
      openGitVertexEditor(context.extensionUri, context.globalState, resolveRepoRoot() ?? undefined)
    }),
  )

  context.subscriptions.push(statusBar)
}

export function deactivate(): void {
  if (refreshTimer) clearTimeout(refreshTimer)
  statusBar?.dispose()
}
