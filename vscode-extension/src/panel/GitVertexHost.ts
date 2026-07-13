// GitVertexHost — shared webview wiring for Git Vertex.
//
// Hosts the real Git Vertex React UI (CommitGraph + RightPanel) on top of any
// `vscode.Webview` and exposes the desktop `window.gitAPI` surface to it via a
// generic request/response IPC router. This same host backs both:
//   • the WebviewView in the bottom panel  (GitVertexViewProvider)
//   • a WebviewPanel opened as an editor tab (openGitVertexEditor)
// so there is a single UI + bridge to maintain.

import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { GitService } from '../gitService'
import { findAppPath, launchApp } from '../appLocator'
import { githubListPRs, githubListIssues } from '../githubApi'
import { readAIConfig, aiGenerateCommitMessage, aiRecomposeCommit, aiExplainCommit, aiResolveConflict, aiSearchCommits, listProviderModels } from '../aiService'

interface GitApiRequest { type: 'gitApi'; id: number; method: string; args: any[] }

// Shared webview skeleton: loads the single React bundle (media/main.js) and
// optionally injects a window.__GV_BOOT__ payload so the bundle can render a
// focused tool instead of the full app. Used by every Git Vertex webview
// (panel view, editor tab, staging/rebase tabs, rebase-todo custom editor).
export function buildWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  boot?: Record<string, unknown>,
): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'main.js'))
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'main.css'))
  let nonce = ''
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 32; i++) nonce += chars.charAt(Math.floor(Math.random() * chars.length))
  const bootScript = boot
    ? `<script nonce="${nonce}">window.__GV_BOOT__=${JSON.stringify(boot).replace(/</g, '\\u003c')};</script>`
    : ''
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
  ${bootScript}
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
}

// Virtual scheme serving a file's content at a git ref, so VS Code's native
// diff editor can show "<ref>:<file>" on one side. Read-only.
const DIFF_SCHEME = 'gitvertex'

// The diff content provider is registered once per extension activation and
// resolves against whichever host most recently set a repo (in practice every
// host shares the workspace repo).
let diffProviderRegistered = false
let activeGitService: GitService | undefined

// The webview currently showing the full commit graph (panel view or the
// "open in editor" tab — never a focused tool tab, which sets `_boot`). The
// native webview-context-menu commands (contributes.menus["webview/context"])
// registered in extension.ts post their chosen action to this webview, which
// dispatches to the same handler functions the old in-webview HTML menu used.
let activeCommitMenuWebview: vscode.Webview | undefined

// Safety net: VS Code is documented to pass the row's data-vscode-context
// object as the command handler's argument, but that's not spelled out with
// a concrete signature anywhere reachable — so the webview also reports the
// hash independently on every right-click (setLastMenuHash below), letting
// extension.ts fall back to this if the argument ever comes back empty.
export let lastCommitMenuHash: string | undefined

export function postCommitMenuAction(action: string, hash: string): void {
  activeCommitMenuWebview?.postMessage({ type: 'menuAction', action, hash })
}

export class GitVertexHost implements vscode.Disposable {
  private _gitService?: GitService
  private _fsWatcher?: vscode.FileSystemWatcher
  private _disposables: vscode.Disposable[] = []
  private _repoPath?: string

  constructor(
    private readonly _webview: vscode.Webview,
    private readonly _extensionUri: vscode.Uri,
    private readonly _state: vscode.Memento,
    // Optional boot payload injected as window.__GV_BOOT__ so the same bundle can
    // render a focused tool (e.g. the staging editor) instead of the full app.
    private readonly _boot?: Record<string, unknown>,
    // Lets a focused tool close its own tab (webview calls `closeSelf`).
    private readonly _onClose?: () => void,
    // Set only when this host backs the git-rebase-todo CustomTextEditorProvider
    // (RebaseTodoEditor): todoGet/todoSave/todoAbort read/write the actual
    // TextDocument instead of going through GitService, since git itself (not
    // this extension) is what's waiting on the file being saved and closed.
    private readonly _rebaseTodo?: { document: vscode.TextDocument; finish: (content: string) => Promise<void> },
  ) {
    this._webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')],
    }
    if (!this._boot) activeCommitMenuWebview = this._webview
    this._registerDiffProvider()
    this._webview.html = this._getHtml(this._webview)
    this._webview.onDidReceiveMessage(
      (msg: GitApiRequest) => { if (msg?.type === 'gitApi') this._handleApi(msg) },
      null,
      this._disposables,
    )
  }

  public setRepo(repoPath: string): void {
    if (this._repoPath === repoPath) return
    this._repoPath = repoPath
    this._gitService = new GitService(repoPath)
    activeGitService = this._gitService
    this._setupWatcher(repoPath)
    this._broadcast('repoChanged')
  }

  public get repoPath(): string | undefined { return this._repoPath }

  // ── FS watcher → broadcast change events ──────────────────────
  private _setupWatcher(repoPath: string): void {
    this._fsWatcher?.dispose()
    const gitDir = path.join(repoPath, '.git')
    if (!fs.existsSync(gitDir)) return
    this._fsWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(gitDir,
        '{HEAD,index,ORIG_HEAD,MERGE_HEAD,CHERRY_PICK_HEAD,REVERT_HEAD,rebase-merge,rebase-merge/**,rebase-apply,rebase-apply/**,refs/**/*}')
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
    this._webview.postMessage({ type: 'event', name })
  }

  // ── Native diff editor support ────────────────────────────────
  // Register a content provider that resolves `gitvertex:<file>?<ref>` to the
  // file's content at that ref (via the live GitService). Registered once.
  private _registerDiffProvider(): void {
    if (diffProviderRegistered) return
    diffProviderRegistered = true
    const provider: vscode.TextDocumentContentProvider = {
      provideTextDocumentContent: async (uri): Promise<string> => {
        const ref = uri.query
        const filepath = uri.path.replace(/^\//, '')
        if (!activeGitService || !ref) return ''
        const res = await activeGitService.getFileAtCommit(ref, filepath)
        return res.content ?? ''
      },
    }
    // Registered for the extension lifetime — not tied to a single host.
    vscode.workspace.registerTextDocumentContentProvider(DIFF_SCHEME, provider)
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
      this._webview.postMessage({ type: 'gitApiResult', id, ok: true, value })
    } catch (e: any) {
      this._webview.postMessage({ type: 'gitApiResult', id, ok: false, error: e?.message ?? String(e) })
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
      case 'openConflictResolver': {
        if (this._repoPath && args[0]) {
          // ConflictEditor is registered with priority "option" (never the
          // automatic default for regular files) — vscode.openWith explicitly
          // requests it, binding this tab to the real file's own identity
          // instead of an ad-hoc floating panel disconnected from it.
          const uri = vscode.Uri.file(path.join(this._repoPath, args[0]))
          vscode.commands.executeCommand('vscode.openWith', uri, 'gitVertex.conflictResolver')
        }
        return { success: true }
      }
      case 'openInteractiveRebaseTab': {
        if (this._repoPath && args[0]) {
          openGitVertexRebasePlanTab(this._extensionUri, this._state, this._repoPath, args[0])
        }
        return { success: true }
      }
      case 'openFileHistory': {
        if (this._repoPath && args[0]) {
          openGitVertexFileHistoryTab(this._extensionUri, this._state, this._repoPath, args[0])
        }
        return { success: true }
      }
      case 'openCompareWorkingTab': {
        if (this._repoPath && args[0]) {
          openGitVertexCompareWorkingTab(this._extensionUri, this._state, this._repoPath, args[0])
        }
        return { success: true }
      }
      case 'openCompare': {
        if (this._repoPath) {
          openGitVertexCompareTab(this._extensionUri, this._state, this._repoPath, args[0], args[1])
        }
        return { success: true }
      }
      case 'closeSelf': {
        this._onClose?.()
        return { success: true }
      }
      case 'setLastMenuHash': {
        lastCommitMenuHash = args[0]
        return { success: true }
      }
      case 'savePatchFile': {
        // The webview can't open OS-native dialogs itself — the host does it.
        const [content, suggestedName] = args as [string, string]
        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(suggestedName),
          filters: { 'Patch files': ['patch'] },
        })
        if (!uri) return { success: false, canceled: true }
        try {
          const fs = require('fs') as typeof import('fs')
          fs.writeFileSync(uri.fsPath, content, 'utf8')
          return { success: true, path: uri.fsPath }
        } catch (e: any) {
          return { success: false, error: e.message }
        }
      }
      case 'openStagingEditor': {
        if (this._repoPath && args[0]) {
          openGitVertexStagingEditor(this._extensionUri, this._state, this._repoPath, args[0])
        }
        return { success: true }
      }
      case 'selectDirectory': {
        const picked = await vscode.window.showOpenDialog({
          canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
          title: args[0] ?? 'Choisir un dossier',
        })
        return picked && picked.length > 0 ? picked[0].fsPath : null
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

    // Overrides that don't map 1:1 to a GitService method.
    switch (method) {
      // avatarResolve is synchronous — return its value directly.
      case 'avatarResolve': return svc.avatarResolve(args[0], args[1])
      // GitHub (PAT from the gvSettings memento, set via gitVertex.setGithubToken)
      case 'githubDetectRepo': {
        const { remotes } = await svc.getRemotes()
        const origin = remotes.find(r => r.name === 'origin') ?? remotes[0]
        const url = origin?.fetchUrl || origin?.pushUrl || ''
        const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+)(\.git)?/)
        return m ? { owner: m[1], repo: m[2] } : { owner: null, repo: null }
      }
      case 'githubListPRs': return githubListPRs(this._githubToken(), args[0], args[1])
      case 'githubListIssues': return githubListIssues(this._githubToken(), args[0], args[1])
      // AI features — same pipeline as the desktop app, config from VS Code
      // settings (gitVertex.aiProvider/aiApiKey/aiModel) or shared gvSettings.
      // NO_API_KEY keeps the shared UI's "configure a key" toast working.
      case 'aiListProviderModels': return listProviderModels(args[0], args[1])
      // Settings page (shared SettingsModal, embedded mode) support
      case 'gitGetGlobalConfig': {
        const { execFile } = await import('child_process')
        const { promisify } = await import('util')
        const exec = promisify(execFile)
        const run = async (a: string[]) => { try { return (await exec('git', a)).stdout.trim() } catch { return '' } }
        return {
          userName: await run(['config', '--global', 'user.name']),
          userEmail: await run(['config', '--global', 'user.email']),
        }
      }
      case 'gitSetGlobalConfig': {
        const { execFile } = await import('child_process')
        const { promisify } = await import('util')
        const exec = promisify(execFile)
        try {
          if (args[0]) await exec('git', ['config', '--global', 'user.name', args[0]])
          if (args[1]) await exec('git', ['config', '--global', 'user.email', args[1]])
          return { success: true }
        } catch (e: any) { return { success: false, error: e?.message } }
      }
      case 'githubGetUser': {
        const token = this._githubToken()
        if (!token) return { user: null }
        try {
          const res = await fetch('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
          })
          if (!res.ok) return { user: null }
          const u = await res.json() as any
          return { user: { login: u.login, avatar: u.avatar_url } }
        } catch { return { user: null } }
      }
      case 'aiGenerateCommitMessage': {
        const cfg = readAIConfig(this._state)
        if (!cfg || !svc) return { error: 'NO_API_KEY' }
        const staged = await svc.raw(['diff', '--cached']).catch(() => '')
        return aiGenerateCommitMessage(cfg, staged)
      }
      case 'aiRecomposeCommit': {
        const cfg = readAIConfig(this._state)
        if (!cfg || !svc) return { error: 'NO_API_KEY' }
        const diff = await svc.raw(['diff-tree', '--no-commit-id', '-p', '--root', args[0]]).catch(() => '')
        const msg = (await svc.raw(['log', '-1', '--pretty=format:%B', args[0]]).catch(() => '')).trim()
        return aiRecomposeCommit(cfg, diff, msg)
      }
      case 'aiGetExplanations': {
        const all = this._state.get<Record<string, Record<string, string>>>('gvAiExplanations', {})
        return { explanations: (this._repoPath && all[this._repoPath]) || {} }
      }
      case 'aiExplainCommit': {
        // Cached per repo+hash in globalState — a hash's diff is immutable,
        // so a stored explanation never goes stale. args[1] forces a redo.
        const all = this._state.get<Record<string, Record<string, string>>>('gvAiExplanations', {})
        if (!args[1] && this._repoPath && all[this._repoPath]?.[args[0]]) {
          return { explanation: all[this._repoPath][args[0]], cached: true }
        }
        const cfg = readAIConfig(this._state)
        if (!cfg || !svc) return { error: 'NO_API_KEY' }
        const diff = await svc.raw(['diff-tree', '--no-commit-id', '-p', '--root', args[0]]).catch(() => '')
        const subject = (await svc.raw(['log', '-1', '--pretty=format:%s', args[0]]).catch(() => '')).trim()
        const r = await aiExplainCommit(cfg, diff, subject)
        if (!(r as any).error && this._repoPath) {
          const repo = all[this._repoPath] ?? {}
          repo[args[0]] = (r as any).explanation ?? ''
          const keys = Object.keys(repo)
          if (keys.length > 200) delete repo[keys[0]]
          all[this._repoPath] = repo
          await this._state.update('gvAiExplanations', all)
        }
        return r
      }
      case 'aiResolveConflict': {
        const cfg = readAIConfig(this._state)
        if (!cfg || !svc) return { error: 'NO_API_KEY' }
        const fileRes = await (svc as any).getFileContent(args[0])
        if (fileRes?.error) return { error: fileRes.error }
        return aiResolveConflict(cfg, args[0], fileRes?.content ?? '', args[1])
      }
      case 'aiSearchCommits': {
        const cfg = readAIConfig(this._state)
        if (!cfg || !svc) return { error: 'NO_API_KEY' }
        let index = await svc.raw(['log', '--all', '--max-count=200', '--date=short', '--pretty=format:%h|%an|%ad|%s']).catch(() => '')
        index = index.split('\n').map(l => l.length > 90 ? l.slice(0, 90) : l).join('\n')
        const r = await aiSearchCommits(cfg, index, args[0])
        if (r.error) return { error: r.error }
        // Expand short hashes; drop hallucinated ones.
        const hashes: string[] = []
        for (const s of r.shortHashes ?? []) {
          try {
            const h = (await svc.raw(['rev-parse', s])).trim()
            if (/^[0-9a-f]{40}$/.test(h)) hashes.push(h)
          } catch { /* hallucinated hash — skip */ }
        }
        return { hashes }
      }
      // The renderer calls `resolveConflictSide` (desktop preload name); the
      // service method is `resolveConflictWithSide`.
      case 'resolveConflictSide': return svc.resolveConflictWithSide(args[0], args[1])
      case 'todoGet':
        if (this._rebaseTodo) return { text: this._rebaseTodo.document.getText() }
        break
      case 'todoSave':
        if (this._rebaseTodo) { await this._rebaseTodo.finish(String(args[0] ?? '')); return { success: true } }
        break
      case 'todoAbort':
        // An empty todo makes git cancel the rebase ("Nothing to do").
        if (this._rebaseTodo) { await this._rebaseTodo.finish(''); return { success: true } }
        break
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

  private _githubToken(): string | undefined {
    const all = this._state.get<Record<string, string>>('gvSettings', {})
    return all.githubToken || undefined
  }

  private _getHtml(webview: vscode.Webview): string {
    return buildWebviewHtml(webview, this._extensionUri, this._boot)
  }

  public dispose(): void {
    this._fsWatcher?.dispose()
    this._disposables.forEach(d => d.dispose())
    this._disposables = []
  }
}

// ── Editor-tab host (WebviewPanel) ────────────────────────────────
// A single Git Vertex editor tab, movable/splittable like a file. Reuses the
// exact same GitVertexHost as the panel view.
const EDITOR_VIEW_TYPE = 'gitVertex.editor'
let editorPanel: vscode.WebviewPanel | undefined
let editorHost: GitVertexHost | undefined

export function openGitVertexEditor(
  extensionUri: vscode.Uri,
  state: vscode.Memento,
  repoPath?: string,
): void {
  if (editorPanel) {
    editorPanel.reveal(editorPanel.viewColumn)
    if (repoPath) editorHost?.setRepo(repoPath)
    return
  }

  editorPanel = vscode.window.createWebviewPanel(
    EDITOR_VIEW_TYPE,
    'Git Vertex',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
    },
  )
  editorPanel.iconPath = vscode.Uri.joinPath(extensionUri, 'images', 'icon.png')

  editorHost = new GitVertexHost(editorPanel.webview, extensionUri, state)
  if (repoPath) editorHost.setRepo(repoPath)

  editorPanel.onDidDispose(() => {
    editorHost?.dispose()
    editorHost = undefined
    editorPanel = undefined
  })
}

// Keep the editor tab (if open) pointed at the current repo.
export function setEditorRepo(repoPath: string): void {
  editorHost?.setRepo(repoPath)
}

// ── Rebase tab (singleton WebviewPanel) ───────────────────────────
// Opens the "rebase in progress" tool — auto-opened by the extension when a
// rebase is detected (started from the UI, the CLI, anywhere), GitLens-style.
const REBASE_VIEW_TYPE = 'gitVertex.rebaseTab'
let rebasePanel: vscode.WebviewPanel | undefined
let rebaseHost: GitVertexHost | undefined

export function openGitVertexRebaseTab(
  extensionUri: vscode.Uri,
  state: vscode.Memento,
  repoPath: string,
  options?: { preserveFocus?: boolean },
): void {
  if (rebasePanel) {
    rebasePanel.reveal(rebasePanel.viewColumn, options?.preserveFocus)
    rebaseHost?.setRepo(repoPath)
    return
  }

  rebasePanel = vscode.window.createWebviewPanel(
    REBASE_VIEW_TYPE,
    'Rebase en cours',
    { viewColumn: vscode.ViewColumn.Active, preserveFocus: options?.preserveFocus ?? false },
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
    },
  )
  rebasePanel.iconPath = vscode.Uri.joinPath(extensionUri, 'images', 'icon.png')

  rebaseHost = new GitVertexHost(rebasePanel.webview, extensionUri, state, { mode: 'rebase' })
  rebaseHost.setRepo(repoPath)

  rebasePanel.onDidDispose(() => {
    rebaseHost?.dispose()
    rebaseHost = undefined
    rebasePanel = undefined
  })
}

export function isRebaseTabOpen(): boolean { return rebasePanel !== undefined }

// Closes the "Rebase en cours" tracker if it's open for `repoPath` — used by
// RebaseTodoEditor as a corrective, not just preventive, measure: the
// tracker's own file-watcher (300ms debounced) can win a race against the
// todo editor actually finishing its open (spawning `code --wait` and
// round-tripping through the extension host isn't instant), so on top of
// checking "is the todo editor open" before auto-opening, the todo editor
// also actively closes a tracker that already slipped through.
export function closeRebaseTrackerIfOpenFor(repoPath: string): void {
  if (rebasePanel && rebaseHost?.repoPath === repoPath) rebasePanel.dispose()
}

// ── Interactive rebase planner tab (one WebviewPanel per base commit) ──
// "Lancer un rebase interactif depuis ici" now opens a real editor tab
// instead of a webview modal. Launching runs the rebase (which pauses on a
// conflict, popping the rebase tab above via the .git watcher) and closes
// this tab either way — success or conflict.
const PLAN_VIEW_TYPE = 'gitVertex.rebasePlan'
const planPanels = new Map<string, vscode.WebviewPanel>()

export function openGitVertexRebasePlanTab(
  extensionUri: vscode.Uri,
  state: vscode.Memento,
  repoPath: string,
  baseHash: string,
): void {
  const existing = planPanels.get(baseHash)
  if (existing) { existing.reveal(existing.viewColumn); return }

  const panel = vscode.window.createWebviewPanel(
    PLAN_VIEW_TYPE,
    `Rebase interactif — ${baseHash.slice(0, 7)}`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
    },
  )
  panel.iconPath = vscode.Uri.joinPath(extensionUri, 'images', 'icon.png')

  const host = new GitVertexHost(panel.webview, extensionUri, state, { mode: 'plan', baseHash }, () => panel.dispose())
  host.setRepo(repoPath)

  panel.onDidDispose(() => {
    host.dispose()
    planPanels.delete(baseHash)
  })
  planPanels.set(baseHash, panel)
}

// ── GitHub tab (singleton WebviewPanel) ───────────────────────────
// Open PRs & issues of the repo's GitHub remote (mini-Launchpad).
const GITHUB_VIEW_TYPE = 'gitVertex.github'
let githubPanel: vscode.WebviewPanel | undefined
let githubHost: GitVertexHost | undefined

export function openGitVertexGitHubTab(
  extensionUri: vscode.Uri,
  state: vscode.Memento,
  repoPath: string,
): void {
  if (githubPanel) {
    githubPanel.reveal(githubPanel.viewColumn)
    githubHost?.setRepo(repoPath)
    return
  }

  githubPanel = vscode.window.createWebviewPanel(
    GITHUB_VIEW_TYPE,
    'GitHub — PRs & Issues',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
    },
  )
  githubPanel.iconPath = vscode.Uri.joinPath(extensionUri, 'images', 'icon.png')

  githubHost = new GitVertexHost(githubPanel.webview, extensionUri, state, { mode: 'github' })
  githubHost.setRepo(repoPath)

  githubPanel.onDidDispose(() => {
    githubHost?.dispose()
    githubHost = undefined
    githubPanel = undefined
  })
}

// ── Compare tabs (one WebviewPanel per ref pair) ──────────────────
// GitLens "Search & Compare"-style: ahead/behind commit lists + full diff
// between two refs. Refs can be changed from inside the tab.
const COMPARE_VIEW_TYPE = 'gitVertex.compare'
const comparePanels = new Map<string, vscode.WebviewPanel>()

export function openGitVertexCompareTab(
  extensionUri: vscode.Uri,
  state: vscode.Memento,
  repoPath: string,
  refA?: string,
  refB?: string,
): void {
  const key = `${refA ?? ''}..${refB ?? ''}`
  const existing = comparePanels.get(key)
  if (existing) { existing.reveal(existing.viewColumn); return }

  const panel = vscode.window.createWebviewPanel(
    COMPARE_VIEW_TYPE,
    refA && refB ? `Comparer — ${refA}..${refB}` : 'Comparer des références',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
    },
  )
  panel.iconPath = vscode.Uri.joinPath(extensionUri, 'images', 'icon.png')

  const host = new GitVertexHost(panel.webview, extensionUri, state,
    { mode: 'compare', refA: refA ?? '', refB: refB ?? '' }, () => panel.dispose())
  host.setRepo(repoPath)

  panel.onDidDispose(() => {
    host.dispose()
    comparePanels.delete(key)
  })
  comparePanels.set(key, panel)
}

// ── File history tabs (one WebviewPanel per file) ─────────────────
// GitLens-style visual file history: commit timeline + per-commit diff/blame.
const HISTORY_VIEW_TYPE = 'gitVertex.fileHistory'
const historyPanels = new Map<string, vscode.WebviewPanel>()

export function openGitVertexFileHistoryTab(
  extensionUri: vscode.Uri,
  state: vscode.Memento,
  repoPath: string,
  file: string,
): void {
  const existing = historyPanels.get(file)
  if (existing) { existing.reveal(existing.viewColumn); return }

  const panel = vscode.window.createWebviewPanel(
    HISTORY_VIEW_TYPE,
    `Historique — ${file.split('/').pop()}`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
    },
  )
  panel.iconPath = vscode.Uri.joinPath(extensionUri, 'images', 'icon.png')

  const host = new GitVertexHost(panel.webview, extensionUri, state, { mode: 'history', file }, () => panel.dispose())
  host.setRepo(repoPath)

  panel.onDidDispose(() => {
    host.dispose()
    historyPanels.delete(file)
  })
  historyPanels.set(file, panel)
}

// ── Compare-working tabs (one WebviewPanel per commit) ────────────
// "Compare Working Tree to Here" — a commit's diff against the current
// uncommitted working tree, mirroring desktop's CompareWorkingModal as a tab.
const COMPARE_WORKING_VIEW_TYPE = 'gitVertex.compareWorking'
const compareWorkingPanels = new Map<string, vscode.WebviewPanel>()

export function openGitVertexCompareWorkingTab(
  extensionUri: vscode.Uri,
  state: vscode.Memento,
  repoPath: string,
  hash: string,
): void {
  const existing = compareWorkingPanels.get(hash)
  if (existing) { existing.reveal(existing.viewColumn); return }

  const panel = vscode.window.createWebviewPanel(
    COMPARE_WORKING_VIEW_TYPE,
    `Comparer — ${hash.slice(0, 7)} ↔ working tree`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
    },
  )
  panel.iconPath = vscode.Uri.joinPath(extensionUri, 'images', 'icon.png')

  const host = new GitVertexHost(panel.webview, extensionUri, state, { mode: 'compareWorking', hash }, () => panel.dispose())
  host.setRepo(repoPath)

  panel.onDidDispose(() => {
    host.dispose()
    compareWorkingPanels.delete(hash)
  })
  compareWorkingPanels.set(hash, panel)
}

// The rich 3-way ConflictResolver (A/B line picking + base + manual edit) now
// lives in ConflictEditor.ts, a CustomTextEditorProvider bound to the actual
// conflicted file (see the 'openConflictResolver' case above) instead of an
// ad-hoc WebviewPanel — VS Code's native conflict CodeLens stays available
// too, through `openConflict`.

// ── Staging editor tabs (one WebviewPanel per file) ───────────────
const STAGING_VIEW_TYPE = 'gitVertex.stagingEditor'
const stagingPanels = new Map<string, vscode.WebviewPanel>()

export function openGitVertexStagingEditor(
  extensionUri: vscode.Uri,
  state: vscode.Memento,
  repoPath: string,
  file: string,
): void {
  const existing = stagingPanels.get(file)
  if (existing) { existing.reveal(existing.viewColumn); return }

  const panel = vscode.window.createWebviewPanel(
    STAGING_VIEW_TYPE,
    `Stage — ${file.split('/').pop()}`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
    },
  )
  panel.iconPath = vscode.Uri.joinPath(extensionUri, 'images', 'icon.png')

  const host = new GitVertexHost(panel.webview, extensionUri, state, { mode: 'stage', file })
  host.setRepo(repoPath)

  panel.onDidDispose(() => {
    host.dispose()
    stagingPanels.delete(file)
  })
  stagingPanels.set(file, panel)
}
