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

// Virtual scheme serving a file's content at a git ref, so VS Code's native
// diff editor can show "<ref>:<file>" on one side. Read-only.
const DIFF_SCHEME = 'gitvertex'

export class GitVertexViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'gitVertex.graphView'
  private _view?: vscode.WebviewView
  private _gitService?: GitService
  private _fsWatcher?: vscode.FileSystemWatcher
  private _disposables: vscode.Disposable[] = []
  private _repoPath?: string
  private _diffProviderRegistered = false

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
    this._registerDiffProvider()
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

    // Working-tree changes (file edits outside .git). Ignore high-churn dirs so
    // we don't fire a reload (and flicker the toolbar) on every build artifact.
    const IGNORE = /(^|\/)(\.git|node_modules|out|dist|build|\.vscode-test|coverage|\.next|\.cache)(\/|$)/
    const wtWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(repoPath, '**/*')
    )
    const onWt = this._debounce(() => this._broadcast('workingChanged'), 1000)
    const onWtFiltered = (uri: vscode.Uri) => {
      const rel = path.relative(repoPath, uri.fsPath)
      if (IGNORE.test(rel)) return
      onWt()
    }
    wtWatcher.onDidChange(onWtFiltered, null, this._disposables)
    wtWatcher.onDidCreate(onWtFiltered, null, this._disposables)
    wtWatcher.onDidDelete(onWtFiltered, null, this._disposables)
    this._disposables.push(wtWatcher)
  }

  private _debounce(fn: () => void, ms: number): () => void {
    let t: NodeJS.Timeout | undefined
    return () => { if (t) clearTimeout(t); t = setTimeout(fn, ms) }
  }

  private _broadcast(name: 'repoChanged' | 'workingChanged'): void {
    this._view?.webview.postMessage({ type: 'event', name })
  }

  // ── Native diff editor support ────────────────────────────────
  // Register a content provider that resolves `gitvertex:<file>?<ref>` to the
  // file's content at that ref (via the live GitService). Registered once.
  private _registerDiffProvider(): void {
    if (this._diffProviderRegistered) return
    this._diffProviderRegistered = true
    const provider: vscode.TextDocumentContentProvider = {
      provideTextDocumentContent: async (uri): Promise<string> => {
        const ref = uri.query
        const filepath = uri.path.replace(/^\//, '')
        if (!this._gitService || !ref) return ''
        const res = await this._gitService.getFileAtCommit(ref, filepath)
        return res.content ?? ''
      },
    }
    this._disposables.push(
      vscode.workspace.registerTextDocumentContentProvider(DIFF_SCHEME, provider)
    )
  }

  private _refUri(ref: string, filepath: string): vscode.Uri {
    return vscode.Uri.from({ scheme: DIFF_SCHEME, path: '/' + filepath, query: ref })
  }

  // Open a native side-by-side diff for a commit file or a working-tree file.
  private async _openDiff(target: any): Promise<{ success: boolean }> {
    if (!this._repoPath) return { success: false }
    const file: string = target?.filePath ?? ''
    if (!file) return { success: false }
    const short = (h: string) => (h || '').slice(0, 7)
    try {
      if (target.type === 'commit' && target.commitHash) {
        const right = this._refUri(target.commitHash, file)
        const left = this._refUri(`${target.commitHash}~1`, file)
        await vscode.commands.executeCommand('vscode.diff', left, right,
          `${path.basename(file)} (${short(target.commitHash)})`)
      } else {
        // Working-tree file: HEAD (or index for staged) vs file on disk.
        const left = this._refUri(target.area === 'staged' ? 'HEAD' : 'HEAD', file)
        const right = vscode.Uri.file(path.join(this._repoPath, file))
        await vscode.commands.executeCommand('vscode.diff', left, right,
          `${path.basename(file)} (Working Tree)`)
      }
      return { success: true }
    } catch {
      return { success: false }
    }
  }

  // Open a conflicted file in a native editor — VS Code shows its built-in
  // merge-conflict CodeLens (Accept Current / Incoming / Both).
  private async _openConflict(file: string): Promise<{ success: boolean }> {
    if (!this._repoPath || !file) return { success: false }
    try {
      const uri = vscode.Uri.file(path.join(this._repoPath, file))
      await vscode.window.showTextDocument(uri, { preview: false })
      return { success: true }
    } catch {
      return { success: false }
    }
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
      case 'openDiff': return this._openDiff(args[0])
      case 'openConflict': return this._openConflict(args[0])
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

    // Overrides that don't map 1:1 to a GitService method.
    switch (method) {
      // avatarResolve is synchronous — return its value directly.
      case 'avatarResolve': return svc.avatarResolve(args[0], args[1])
      // AI commit-message generation isn't wired in the extension host yet.
      case 'aiGenerateCommitMessage': return { error: 'NO_API_KEY' }
    }

    // Reflective forwarding: every GitService method is callable from the
    // webview without enumerating it here. This keeps the bridge in sync with
    // the service automatically (new git ops light up as soon as they exist).
    // Guard against prototype-chain names (constructor, hasOwnProperty…) so only
    // real GitService methods are reachable.
    const isOwnMethod = method !== 'constructor'
      && !(method in Object.prototype)
      && typeof (svc as unknown as Record<string, unknown>)[method] === 'function'
    if (isOwnMethod) {
      const fn = (svc as unknown as Record<string, (...a: any[]) => unknown>)[method]
      return fn.apply(svc, args)
    }

    // Unknown method → benign failure so the UI degrades gracefully.
    return { success: false, error: `not-implemented: ${method}` }
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
