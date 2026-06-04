// GitVertexViewProvider — WebviewViewProvider for the bottom panel area.
// Ports all IPC logic from GitVertexPanel but uses vscode.WebviewView.

import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { GitService } from '../gitService'
import { computeGraphLayout } from '../graphLayout'
import { WebviewToHost, HostToWebview } from '../types'

export class GitVertexViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'gitVertex.graphView'
  private _view?: vscode.WebviewView
  private _gitService?: GitService
  private _fsWatcher?: vscode.FileSystemWatcher
  private _disposables: vscode.Disposable[] = []
  private _repoPath?: string

  constructor(private readonly _extensionUri: vscode.Uri) {}

  // Called by VS Code when the view becomes visible for the first time
  public resolveWebviewView(
    view: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = view
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')],
    }
    view.webview.html = this._getHtml(view.webview)
    view.webview.onDidReceiveMessage(
      (msg: WebviewToHost) => this._handleMessage(msg),
      null,
      this._disposables
    )
  }

  // Called by extension.ts when the workspace/repo is known
  public setRepo(repoPath: string): void {
    if (this._repoPath === repoPath) return
    this._repoPath = repoPath
    this._gitService = new GitService(repoPath)
    this._setupWatcher(repoPath)
    if (this._view) {
      // If view is already visible, re-send data
      this._sendAll()
    }
  }

  private _setupWatcher(repoPath: string): void {
    this._fsWatcher?.dispose()
    const gitDir = path.join(repoPath, '.git')
    if (!fs.existsSync(gitDir)) return
    this._fsWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(gitDir, '{HEAD,index,refs/**/*}')
    )
    const refresh = this._debounce(() => this._sendAll(), 600)
    this._fsWatcher.onDidChange(refresh, null, this._disposables)
    this._fsWatcher.onDidCreate(refresh, null, this._disposables)
    this._fsWatcher.onDidDelete(refresh, null, this._disposables)
  }

  private _debounce(fn: () => void, ms: number): () => void {
    let t: NodeJS.Timeout | undefined
    return () => { if (t) clearTimeout(t); t = setTimeout(fn, ms) }
  }

  private _post(msg: HostToWebview): void {
    this._view?.webview.postMessage(msg)
  }

  private async _sendAll(): Promise<void> {
    await Promise.all([this._sendLog(), this._sendBranches(), this._sendWorkingChanges()])
  }

  private async _sendLog(maxCount?: number): Promise<void> {
    if (!this._gitService) return
    try {
      const { commits } = await this._gitService.getLog({ maxCount, all: true })
      const laid = computeGraphLayout(commits)
      const repoName = path.basename(this._gitService.repoPath)
      this._post({ type: 'log', commits: laid, repoName })
    } catch (e: any) {
      this._post({ type: 'error', message: e.message ?? String(e) })
    }
  }

  private async _sendBranches(): Promise<void> {
    if (!this._gitService) return
    try {
      const { branches } = await this._gitService.getBranches()
      this._post({ type: 'branches', branches })
    } catch {
      this._post({ type: 'branches', branches: [] })
    }
  }

  private async _sendWorkingChanges(): Promise<void> {
    if (!this._gitService) return
    try {
      const changes = await this._gitService.getWorkingChanges()
      this._post({ type: 'workingChanges', changes })
    } catch {
      this._post({ type: 'workingChanges', changes: { staged: [], unstaged: [], untracked: [] } })
    }
  }

  private async _handleMessage(msg: WebviewToHost): Promise<void> {
    const svc = this._gitService
    if (!svc) return

    switch (msg.type) {
      case 'ready':
        await this._sendAll()
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
        const { files } = await svc.getCommitFiles(msg.hash)
        this._post({ type: 'commitFiles', hash: msg.hash, files })
        break
      }
      case 'getDiff': {
        const { diff } = await svc.getDiff(msg.hash)
        this._post({ type: 'diff', hash: msg.hash, diff })
        break
      }
      case 'getWorkingFileDiff': {
        const { diff } = await svc.getWorkingFileDiff(msg.filepath, msg.staged)
        this._post({ type: 'workingFileDiff', filepath: msg.filepath, staged: msg.staged, diff })
        break
      }

      case 'stage': {
        const r = await svc.stage(msg.files)
        this._post({ type: 'opResult', op: 'stage', ...r })
        if (r.success) await this._sendWorkingChanges()
        break
      }
      case 'stageAll': {
        const r = await svc.stageAll()
        this._post({ type: 'opResult', op: 'stageAll', ...r })
        if (r.success) await this._sendWorkingChanges()
        break
      }
      case 'unstage': {
        const r = await svc.unstage(msg.files)
        this._post({ type: 'opResult', op: 'unstage', ...r })
        if (r.success) await this._sendWorkingChanges()
        break
      }
      case 'commit': {
        const r = await svc.commit(msg.message, msg.amend)
        this._post({ type: 'opResult', op: 'commit', ...r })
        if (r.success) await this._sendAll()
        break
      }
      case 'checkout': {
        const r = await svc.checkout(msg.ref)
        this._post({ type: 'opResult', op: 'checkout', ...r })
        if (r.success) await this._sendAll()
        break
      }
      case 'createBranch': {
        const r = await svc.createBranch(msg.name)
        this._post({ type: 'opResult', op: 'createBranch', ...r })
        if (r.success) await this._sendAll()
        break
      }
      case 'deleteBranch': {
        const r = await svc.deleteBranch(msg.name)
        this._post({ type: 'opResult', op: 'deleteBranch', ...r })
        if (r.success) await this._sendAll()
        break
      }
      case 'fetch': {
        const r = await svc.fetch()
        this._post({ type: 'opResult', op: 'fetch', ...r })
        if (r.success) await this._sendAll()
        break
      }
      case 'pull': {
        const r = await svc.pull()
        this._post({ type: 'opResult', op: 'pull', ...r })
        if (r.success) await this._sendAll()
        break
      }
      case 'push': {
        const r = await svc.push()
        this._post({ type: 'opResult', op: 'push', ...r })
        if (r.success) await this._sendAll()
        break
      }
      case 'discardFile': {
        const r = await svc.discardFile(msg.file)
        this._post({ type: 'opResult', op: 'discardFile', ...r })
        if (r.success) await this._sendWorkingChanges()
        break
      }
      case 'search': {
        const { commits } = await svc.searchCommits(msg.query)
        const laid = computeGraphLayout(commits)
        const repoName = path.basename(svc.repoPath)
        this._post({ type: 'log', commits: laid, repoName })
        break
      }
    }
  }

  private _getNonce(): string {
    let t = ''
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    for (let i = 0; i < 32; i++) t += chars.charAt(Math.floor(Math.random() * chars.length))
    return t
  }

  private _getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'))
    const nonce = this._getNonce()
    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data: https:;">
  <title>Git Vertex</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: var(--vscode-editor-background, #0d1117); }
    body { color: var(--vscode-editor-foreground, #e6edf3); font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); font-size: 13px; }
    #app { width: 100%; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #484f58; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #6e7681; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
  }

  public dispose(): void {
    this._fsWatcher?.dispose()
    this._disposables.forEach(d => d.dispose())
    this._disposables = []
  }
}
