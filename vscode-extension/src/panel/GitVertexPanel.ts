// GitVertexPanel.ts — WebviewPanel lifecycle manager and IPC host for Git Vertex.
// Handles all communication between the VS Code extension host and the webview.

import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { GitService } from '../gitService'
import { computeGraphLayout } from '../graphLayout'
import { WebviewToHost, HostToWebview } from '../types'

export class GitVertexPanel implements vscode.Disposable {
  public static currentPanel: GitVertexPanel | undefined
  private static readonly viewType = 'gitVertex.panel'

  private readonly _panel: vscode.WebviewPanel
  private readonly _extensionUri: vscode.Uri
  private _gitService: GitService
  private _disposables: vscode.Disposable[] = []
  private _fsWatcher: vscode.FileSystemWatcher | undefined

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    repoPath: string
  ) {
    this._panel = panel
    this._extensionUri = extensionUri
    this._gitService = new GitService(repoPath)

    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview)
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables)

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      (msg: WebviewToHost) => this._handleMessage(msg),
      null,
      this._disposables
    )

    // Watch .git/index and .git/HEAD for changes (staging, commits, checkouts)
    this._setupFileWatcher(repoPath)
  }

  public static createOrShow(extensionUri: vscode.Uri, repoPath: string): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined

    // If panel already exists, reveal it and update repo if needed
    if (GitVertexPanel.currentPanel) {
      GitVertexPanel.currentPanel._panel.reveal(column)
      if (GitVertexPanel.currentPanel._gitService.repoPath !== repoPath) {
        GitVertexPanel.currentPanel._changeRepo(repoPath)
      }
      return
    }

    // Create a new panel
    const panel = vscode.window.createWebviewPanel(
      GitVertexPanel.viewType,
      'Git Vertex',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media'),
        ]
      }
    )

    GitVertexPanel.currentPanel = new GitVertexPanel(panel, extensionUri, repoPath)
  }

  private _changeRepo(repoPath: string): void {
    this._gitService = new GitService(repoPath)
    this._fsWatcher?.dispose()
    this._setupFileWatcher(repoPath)
    this._postMessage({ type: 'repoChanged' })
    // Re-send initial data
    this._sendLog()
    this._sendBranches()
    this._sendWorkingChanges()
  }

  private _setupFileWatcher(repoPath: string): void {
    // Watch .git directory for changes (covers HEAD, index, refs)
    const gitDir = path.join(repoPath, '.git')
    if (!fs.existsSync(gitDir)) return

    this._fsWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(gitDir, '{HEAD,index,refs/**/*}')
    )

    const onGitChange = this._debounce(() => {
      this._sendWorkingChanges()
      this._sendLog()
      this._sendBranches()
    }, 500)

    this._fsWatcher.onDidChange(onGitChange, null, this._disposables)
    this._fsWatcher.onDidCreate(onGitChange, null, this._disposables)
    this._fsWatcher.onDidDelete(onGitChange, null, this._disposables)
  }

  private _debounce(fn: () => void, ms: number): () => void {
    let timer: NodeJS.Timeout | undefined
    return () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(fn, ms)
    }
  }

  private _postMessage(msg: HostToWebview): void {
    this._panel.webview.postMessage(msg)
  }

  private async _handleMessage(msg: WebviewToHost): Promise<void> {
    switch (msg.type) {
      case 'ready':
        await this._sendLog()
        await this._sendBranches()
        await this._sendWorkingChanges()
        break

      case 'getLog':
        await this._sendLog(msg.maxCount)
        break

      case 'getBranches':
        await this._sendBranches()
        break

      case 'getWorkingChanges':
        await this._sendWorkingChanges()
        break

      case 'getCommitFiles': {
        const { files } = await this._gitService.getCommitFiles(msg.hash)
        this._postMessage({ type: 'commitFiles', hash: msg.hash, files })
        break
      }

      case 'getDiff': {
        const { diff } = await this._gitService.getDiff(msg.hash)
        this._postMessage({ type: 'diff', hash: msg.hash, diff })
        break
      }

      case 'getWorkingFileDiff': {
        const { diff } = await this._gitService.getWorkingFileDiff(msg.filepath, msg.staged)
        this._postMessage({ type: 'workingFileDiff', filepath: msg.filepath, staged: msg.staged, diff })
        break
      }

      case 'stage': {
        const r = await this._gitService.stage(msg.files)
        this._postMessage({ type: 'opResult', op: 'stage', ...r })
        if (r.success) await this._sendWorkingChanges()
        break
      }

      case 'stageAll': {
        const r = await this._gitService.stageAll()
        this._postMessage({ type: 'opResult', op: 'stageAll', ...r })
        if (r.success) await this._sendWorkingChanges()
        break
      }

      case 'unstage': {
        const r = await this._gitService.unstage(msg.files)
        this._postMessage({ type: 'opResult', op: 'unstage', ...r })
        if (r.success) await this._sendWorkingChanges()
        break
      }

      case 'commit': {
        const r = await this._gitService.commit(msg.message, msg.amend)
        this._postMessage({ type: 'opResult', op: 'commit', ...r })
        if (r.success) {
          await this._sendLog()
          await this._sendBranches()
          await this._sendWorkingChanges()
        }
        break
      }

      case 'checkout': {
        const r = await this._gitService.checkout(msg.ref)
        this._postMessage({ type: 'opResult', op: 'checkout', ...r })
        if (r.success) {
          await this._sendLog()
          await this._sendBranches()
          await this._sendWorkingChanges()
        }
        break
      }

      case 'createBranch': {
        const r = await this._gitService.createBranch(msg.name)
        this._postMessage({ type: 'opResult', op: 'createBranch', ...r })
        if (r.success) {
          await this._sendLog()
          await this._sendBranches()
        }
        break
      }

      case 'deleteBranch': {
        const r = await this._gitService.deleteBranch(msg.name)
        this._postMessage({ type: 'opResult', op: 'deleteBranch', ...r })
        if (r.success) {
          await this._sendLog()
          await this._sendBranches()
        }
        break
      }

      case 'fetch': {
        const r = await this._gitService.fetch()
        this._postMessage({ type: 'opResult', op: 'fetch', ...r })
        if (r.success) {
          await this._sendLog()
          await this._sendBranches()
        }
        break
      }

      case 'pull': {
        const r = await this._gitService.pull()
        this._postMessage({ type: 'opResult', op: 'pull', ...r })
        if (r.success) {
          await this._sendLog()
          await this._sendBranches()
          await this._sendWorkingChanges()
        }
        break
      }

      case 'push': {
        const r = await this._gitService.push()
        this._postMessage({ type: 'opResult', op: 'push', ...r })
        if (r.success) {
          await this._sendLog()
          await this._sendBranches()
        }
        break
      }

      case 'discardFile': {
        const r = await this._gitService.discardFile(msg.file)
        this._postMessage({ type: 'opResult', op: 'discardFile', ...r })
        if (r.success) await this._sendWorkingChanges()
        break
      }

      case 'search': {
        const { commits } = await this._gitService.searchCommits(msg.query)
        const laid = computeGraphLayout(commits)
        const repoName = path.basename(this._gitService.repoPath)
        this._postMessage({ type: 'log', commits: laid, repoName })
        break
      }
    }
  }

  private async _sendLog(maxCount?: number): Promise<void> {
    try {
      const { commits } = await this._gitService.getLog({ maxCount, all: true })
      const laid = computeGraphLayout(commits)
      const repoName = path.basename(this._gitService.repoPath)
      this._postMessage({ type: 'log', commits: laid, repoName })
    } catch (e: any) {
      this._postMessage({ type: 'error', message: e.message ?? String(e) })
    }
  }

  private async _sendBranches(): Promise<void> {
    try {
      const { branches } = await this._gitService.getBranches()
      this._postMessage({ type: 'branches', branches })
    } catch {
      this._postMessage({ type: 'branches', branches: [] })
    }
  }

  private async _sendWorkingChanges(): Promise<void> {
    try {
      const changes = await this._gitService.getWorkingChanges()
      this._postMessage({ type: 'workingChanges', changes })
    } catch {
      this._postMessage({ type: 'workingChanges', changes: { staged: [], unstaged: [], untracked: [] } })
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js')
    )
    const nonce = this._getNonce()

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src 'nonce-${nonce}';
             style-src 'unsafe-inline';
             img-src data:;">
  <title>Git Vertex</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    body {
      background: #0d1117;
      color: #e6edf3;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
    }
    #app { width: 100%; height: 100%; display: flex; flex-direction: column; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
  }

  private _getNonce(): string {
    let text = ''
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return text
  }

  public dispose(): void {
    GitVertexPanel.currentPanel = undefined
    this._panel.dispose()
    this._fsWatcher?.dispose()
    while (this._disposables.length) {
      const d = this._disposables.pop()
      if (d) d.dispose()
    }
  }
}
