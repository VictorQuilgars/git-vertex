// GitVertexViewProvider — WebviewView in the bottom panel area.
// Hosts the real Git Vertex React UI (CommitGraph + RightPanel) and exposes the
// desktop `window.gitAPI` surface to the webview via a generic request/response
// IPC router. The webview-side shim turns every gitAPI call into a postMessage.

import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { GitService } from '../gitService'
import { findAppPath, launchApp } from '../appLocator'

interface GitApiRequest { type: 'gitApi'; id: number; method: string; args: any[] }

export class GitVertexViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'gitVertex.graphView'
  private _view?: vscode.WebviewView
  private _gitService?: GitService
  private _fsWatcher?: vscode.FileSystemWatcher
  private _disposables: vscode.Disposable[] = []
  private _repoPath?: string

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _state: vscode.Memento
  ) {}

  public resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')],
    }
    view.webview.html = this._getHtml(view.webview)
    view.webview.onDidReceiveMessage(
      (msg: GitApiRequest) => { if (msg?.type === 'gitApi') this._handleApi(msg) },
      null,
      this._disposables
    )
  }

  public setRepo(repoPath: string): void {
    if (this._repoPath === repoPath) return
    this._repoPath = repoPath
    this._gitService = new GitService(repoPath)
    this._setupWatcher(repoPath)
    // Tell the webview to reload its data
    this._broadcast('repoChanged')
  }

  // ── FS watcher → broadcast change events ──────────────────────
  private _setupWatcher(repoPath: string): void {
    this._fsWatcher?.dispose()
    const gitDir = path.join(repoPath, '.git')
    if (!fs.existsSync(gitDir)) return
    this._fsWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(gitDir, '{HEAD,index,ORIG_HEAD,MERGE_HEAD,refs/**/*}')
    )
    const onGit = this._debounce(() => this._broadcast('repoChanged'), 400)
    this._fsWatcher.onDidChange(onGit, null, this._disposables)
    this._fsWatcher.onDidCreate(onGit, null, this._disposables)
    this._fsWatcher.onDidDelete(onGit, null, this._disposables)

    // Working-tree changes (file edits outside .git)
    const wtWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(repoPath, '**/*')
    )
    const onWt = this._debounce(() => this._broadcast('workingChanged'), 800)
    wtWatcher.onDidChange(onWt, null, this._disposables)
    wtWatcher.onDidCreate(onWt, null, this._disposables)
    wtWatcher.onDidDelete(onWt, null, this._disposables)
    this._disposables.push(wtWatcher)
  }

  private _debounce(fn: () => void, ms: number): () => void {
    let t: NodeJS.Timeout | undefined
    return () => { if (t) clearTimeout(t); t = setTimeout(fn, ms) }
  }

  private _broadcast(name: 'repoChanged' | 'workingChanged'): void {
    this._view?.webview.postMessage({ type: 'event', name })
  }

  // ── gitApi router ─────────────────────────────────────────────
  private async _handleApi(req: GitApiRequest): Promise<void> {
    const { id, method, args } = req
    try {
      const value = await this._dispatch(method, args)
      this._view?.webview.postMessage({ type: 'gitApiResult', id, ok: true, value })
    } catch (e: any) {
      this._view?.webview.postMessage({ type: 'gitApiResult', id, ok: false, error: e?.message ?? String(e) })
    }
  }

  private async _dispatch(method: string, args: any[]): Promise<any> {
    const svc = this._gitService
    // Host-level methods (no git service required)
    switch (method) {
      case 'settingsGetAll': return this._state.get<Record<string, string>>('gvSettings', {})
      case 'settingsSet': {
        const all = this._state.get<Record<string, string>>('gvSettings', {})
        all[args[0]] = args[1]
        await this._state.update('gvSettings', all)
        return { success: true }
      }
      case 'appGetInfo': return { platform: process.platform, version: '1.5.0' }
      case 'openExternal': { vscode.env.openExternal(vscode.Uri.parse(args[0])); return { success: true } }
      case 'openInEditor': {
        try {
          const uri = vscode.Uri.file(path.isAbsolute(args[0]) ? args[0] : path.join(this._repoPath ?? '', args[0]))
          await vscode.window.showTextDocument(uri)
        } catch { /* ignore */ }
        return { success: true }
      }
      case 'openTerminal': {
        const term = vscode.window.createTerminal({ cwd: this._repoPath })
        term.show()
        return { success: true }
      }
      case 'zoomGet': return 1
      case 'zoomSet': return 1
      case 'uiPrompt': return vscode.window.showInputBox({ prompt: args[0], value: args[1] ?? '' })
      case 'uiConfirm': {
        const pick = await vscode.window.showWarningMessage(args[0], { modal: true }, 'OK')
        return pick === 'OK'
      }
      case 'openDesktop': {
        const cfg = vscode.workspace.getConfiguration('gitVertex')
        const appPath = (cfg.get<string>('appPath', '') || '').trim() || findAppPath()
        if (!appPath) { vscode.window.showErrorMessage('Git Vertex desktop introuvable.'); return { success: false } }
        if (this._repoPath) launchApp(appPath, this._repoPath)
        return { success: true }
      }
    }

    if (!svc) throw new Error('No repository open')

    // Methods that map 1:1 to GitService
    switch (method) {
      case 'getLog': return svc.getLog(args[0] ?? {})
      case 'getBranches': return svc.getBranches()
      case 'getCommitFiles': return svc.getCommitFiles(args[0])
      case 'getCommitBody': return svc.getCommitBody(args[0])
      case 'getDiff': return svc.getDiff(args[0])
      case 'getWorkingChanges': return svc.getWorkingChanges()
      case 'getWorkingFileDiff': return svc.getWorkingFileDiff(args[0], args[1])
      case 'getLastCommitMessage': return svc.getLastCommitMessage()
      case 'getMergeMessage': return svc.getMergeMessage()
      case 'getTracking': return svc.getTracking()
      case 'getStashes': return svc.getStashes()
      case 'getTags': return svc.getTags()
      case 'getConflictedFiles': return svc.getConflictedFiles()
      case 'getConflictMode': return svc.getConflictMode()
      case 'getBlame': return svc.getBlame(args[0], args[1])
      case 'getFileHistory': return svc.getFileHistory(args[0])
      case 'stage': return svc.stage(args[0])
      case 'stageAll': return svc.stageAll()
      case 'unstage': return svc.unstage(args[0])
      case 'commit': return svc.commit(args[0], args[1])
      case 'amendMessage': return svc.amendMessage(args[0])
      case 'discardFile': return svc.discardFile(args[0])
      case 'checkout': return svc.checkout(args[0])
      case 'createBranch': return svc.createBranch(args[0])
      case 'createBranchAt': return svc.createBranchAt(args[0], args[1], args[2])
      case 'deleteBranch': return svc.deleteBranch(args[0])
      case 'createStash': return svc.createStash(args[0])
      case 'popStash': return svc.popStash(args[0])
      case 'applyStash': return svc.applyStash(args[0])
      case 'undoLastAction': return svc.undoLastAction()
      case 'createTag': return svc.createTag(args[0], args[1], args[2])
      case 'deleteTag': return svc.deleteTag(args[0])
      case 'cherryPick': return svc.cherryPick(args[0])
      case 'revert': return svc.revert(args[0])
      case 'reset': return svc.reset(args[0], args[1])
      case 'fetch': return svc.fetch()
      case 'pull': return svc.pull()
      case 'push': return svc.push()
      case 'searchInDiffs': return { matches: [] }
      case 'avatarResolve': return svc.avatarResolve(args[0], args[1])
      case 'aiGenerateCommitMessage': return { error: 'NO_API_KEY' }
      default:
        // Unimplemented methods resolve to a benign empty result so the UI
        // degrades gracefully instead of throwing.
        return { success: false, error: `not-implemented: ${method}` }
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
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'))
    const nonce = this._getNonce()
    return /* html */`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src 'nonce-${nonce}';
             style-src ${webview.cspSource} 'unsafe-inline';
             font-src ${webview.cspSource} data:;
             img-src ${webview.cspSource} data: https:;">
  <link href="${styleUri}" rel="stylesheet">
  <title>Git Vertex</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; background: #0d1117; }
    #root { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="root"></div>
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
