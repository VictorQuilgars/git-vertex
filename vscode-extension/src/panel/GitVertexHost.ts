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
import * as os from 'os'
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { GitService, gitEnv } from '../gitService'
import { buildToolInvocation, findAvailableKeyPath, safeTempFileName } from '../hostTools'
import { findAppPath, launchApp } from '../appLocator'
import {
  githubListPRs, githubListIssues, githubGetIssue, githubCreatePR, githubListBranches,
  githubSearchIssues, githubCloseIssue, githubListRepos, githubCreateGist, type GithubApi,
  githubIssueComments, githubAddIssueComment, githubUpdateIssue,
  githubListAssignees, githubListRepoLabels, githubGetPR, githubGetChecks, githubMergePR,
  githubRepoParent, githubRequestReviewers, githubCreateLabel, githubCreateIssue,
} from '../githubApi'
import { githubRepo, githubApiBase, GITHUB_COM } from '../../../src/renderer/src/utils/remoteUrl'
import { providerById } from '../../../src/renderer/src/utils/aiProviders'
import { listAgents } from '../agents'
import { resolveIdentity, signIn } from '../githubAuth'
import { readAIConfig, aiFilterQuery, aiPrDescription, aiGenerateIssue, aiGenerateCommitMessage, aiRecomposeCommit, aiExplainCommit, aiResolveConflict, aiSearchCommits, listProviderModels } from '../aiService'
import { ThemeStore } from '../../../src/main/theme-store'
import { BUILT_IN_THEME_IDS } from '../../../src/main/theme-validate'

interface GitApiRequest { type: 'gitApi'; id: number; method: string; args: any[] }

// ── Themes ───────────────────────────────────────────────────────────────────
// The store is shared with the desktop main process rather than reimplemented:
// it and the validator are free of `electron` and `vscode` precisely so both
// products enforce the same rules, and esbuild bundles them in from ../../src.
//
// The directory is set once at activation instead of threaded through the
// constructor — GitVertexHost is built in ten places, and none of the other
// nine care about theme storage.
let _themeStore: ThemeStore | null = null
let _themeStorageDir: string | null = null

export function setThemeStorageDir(dir: string): void {
  _themeStorageDir = dir
  _themeStore = null
}

function getThemeStore(): ThemeStore {
  if (!_themeStore) {
    _themeStore = new ThemeStore({
      // globalStorageUri, so a theme installed in one workspace is available in
      // every other one — a palette is a property of the person, not the repo.
      baseDir: _themeStorageDir ?? path.join(os.tmpdir(), 'git-vertex-themes'),
      builtIns: BUILT_IN_THEME_IDS,
    })
  }
  return _themeStore
}

// An external diff/merge tool outlives the call that opened it: detached and
// unref'd so it doesn't die with the extension host, with its error swallowed
// (a missing binary is reported by the tool setting, not by a crash here).
function spawnDetached(inv: { cmd: string; args: string[] }): void {
  const child = spawn(inv.cmd, inv.args, { detached: true, stdio: 'ignore' })
  child.on('error', () => { /* tool not found — nothing to clean up */ })
  child.unref()
}

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
    /* The stylesheet above defines --bg-canvas; the literal is only the guard
       for the case where it fails to load at all. */
    html, body { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; background: var(--bg-canvas, #0d1117); }
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

/**
 * `gitvertex:<file>?<ref>` — a file's content at a ref, for VS Code's own diff
 * editor. Exported because the blame commands open diffs too, and they run
 * whether or not the panel has ever been opened.
 */
export function refUri(ref: string, filepath: string): vscode.Uri {
  return vscode.Uri.from({ scheme: DIFF_SCHEME, path: '/' + filepath, query: ref })
}

/**
 * Serve that scheme, and remember which repository answers for it.
 *
 * The host calls this when it opens; `activate` calls it too, because a blame
 * command can be the first thing that needs a revision's content and the panel
 * may never have been opened at all — in which case the diff editor would have
 * shown two empty documents.
 */
export function ensureDiffProvider(service: GitService): void {
  activeGitService = service
  if (diffProviderRegistered) return
  diffProviderRegistered = true
  vscode.workspace.registerTextDocumentContentProvider(DIFF_SCHEME, {
    provideTextDocumentContent: async (uri): Promise<string> => {
      const ref = uri.query
      const filepath = uri.path.replace(/^\//, '')
      if (!activeGitService || !ref) return ''
      return (await activeGitService.getFileAtCommit(ref, filepath)).content ?? ''
    },
  })
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
    this._webview.html = this._getHtml(this._webview)
    this._webview.onDidReceiveMessage(
      (msg: GitApiRequest) => { if (msg?.type === 'gitApi') this._handleApi(msg) },
      null,
      this._disposables,
    )
    // Signing out of GitHub happens in VS Code's Accounts menu, not here — so
    // without this the settings page kept showing an account that was gone
    // until it was unmounted and remounted. The one path left where the panel
    // could still be telling the user something untrue.
    vscode.authentication.onDidChangeSessions(
      e => { if (e.provider.id === 'github') this._broadcast('githubAuthChanged') },
      null,
      this._disposables,
    )
  }

  public setRepo(repoPath: string): void {
    if (this._repoPath === repoPath) return
    this._repoPath = repoPath
    this._gitService = new GitService(repoPath)
    // Registers the `gitvertex:` provider on first use and points it here.
    ensureDiffProvider(this._gitService)
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

  private _broadcast(name: 'repoChanged' | 'workingChanged' | 'githubAuthChanged'): void {
    this._webview.postMessage({ type: 'event', name })
  }

  // ── Native diff editor support ────────────────────────────────
  // Register a content provider that resolves `gitvertex:<file>?<ref>` to the
  // file's content at that ref (via the live GitService). Registered once.
  private _refUri(ref: string, filepath: string): vscode.Uri {
    return refUri(ref, filepath)
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
      // ── Settings: external tools & SSH keys (v1.19.0 app-side) ──
      // Not git operations, so they can't reach GitService's reflective
      // forwarding — they need the extension host's own shell (dialogs, spawn,
      // the gvSettings memento) exactly like the desktop uses Electron's.
      case 'openExternalDiff': {
        const tool = (this._state.get<Record<string, string>>('gvSettings', {}).externalDiffTool ?? '').trim()
        if (!tool) return { success: false, error: 'No external diff tool configured' }
        try {
          const safeName = safeTempFileName(String(args[2] ?? 'file'))
          const tmp = path.join(os.tmpdir(), `git-vertex-diff-${Date.now()}`)
          fs.mkdirSync(tmp, { recursive: true })
          const leftPath = path.join(tmp, `left-${safeName}`)
          const rightPath = path.join(tmp, `right-${safeName}`)
          fs.writeFileSync(leftPath, args[0] ?? '')
          fs.writeFileSync(rightPath, args[1] ?? '')
          const inv = buildToolInvocation(tool, leftPath, rightPath)
          if (!inv) return { success: false, error: 'No external diff tool configured' }
          spawnDetached(inv)
          return { success: true }
        } catch (e: any) {
          return { success: false, error: e.message }
        }
      }
      case 'openExternalMerge': {
        const tool = (this._state.get<Record<string, string>>('gvSettings', {}).externalMergeTool ?? '').trim()
        if (!tool) return { success: false, error: 'No external merge tool configured' }
        if (!svc || !this._repoPath) return { success: false, error: 'No repo open' }
        try {
          const filepath = String(args[0] ?? '')
          const versions = await svc.getConflictVersions(filepath)
          const safeName = safeTempFileName(filepath)
          const tmp = path.join(os.tmpdir(), `git-vertex-merge-${Date.now()}`)
          fs.mkdirSync(tmp, { recursive: true })
          const oursPath = path.join(tmp, `ours-${safeName}`)
          const theirsPath = path.join(tmp, `theirs-${safeName}`)
          const mergedPath = path.join(tmp, `merged-${safeName}`)
          fs.writeFileSync(oursPath, versions.ours ?? '')
          fs.writeFileSync(theirsPath, versions.theirs ?? '')
          // The merged file starts as the conflicted working copy, so the tool
          // opens on the markers the user is actually looking at.
          const abs = path.isAbsolute(filepath) ? filepath : path.join(this._repoPath, filepath)
          try { fs.copyFileSync(abs, mergedPath) } catch { fs.writeFileSync(mergedPath, '') }
          const inv = buildToolInvocation(tool, oursPath, theirsPath, mergedPath)
          if (!inv) return { success: false, error: 'No external merge tool configured' }
          spawnDetached(inv)
          return { success: true, mergedPath }
        } catch (e: any) {
          return { success: false, error: e.message }
        }
      }
      // Reads back the merged file once the user has saved in the external tool.
      case 'readTempFile': {
        try { return { content: fs.readFileSync(String(args[0]), 'utf-8') } }
        catch (e: any) { return { error: e.message } }
      }
      case 'sshBrowseKey': {
        const picked = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          title: args[0] === 'private' ? 'Select the SSH private key' : 'Select the SSH public key',
          defaultUri: vscode.Uri.file(path.join(os.homedir(), '.ssh')),
        })
        return { path: picked?.[0]?.fsPath ?? null }
      }
      case 'sshGenerateKey': {
        try {
          const sshDir = path.join(os.homedir(), '.ssh')
          fs.mkdirSync(sshDir, { recursive: true })
          const base = findAvailableKeyPath(sshDir)
          await promisify(execFile)('ssh-keygen', ['-t', 'ed25519', '-f', base, '-N', String(args[0] ?? '')])
          return { privateKey: base, publicKey: `${base}.pub` }
        } catch (e: any) {
          return { error: e.message }
        }
      }
      // ── Themes ──────────────────────────────────────────────────────────
      // Real implementations, not not-implemented: the picker is wanted in the
      // panel too, and the extension host has Node, so it runs the SAME
      // ThemeStore and the SAME validator as the desktop main process. A
      // method that exists on both sides with a poorer signature is the
      // failure mode CLAUDE.md calls the worse case, so there is one
      // implementation and both products call it.
      case 'themesCatalogue': return getThemeStore().catalogue(args[0] ?? {})
      case 'themesInstall': {
        try {
          return { success: true, theme: await getThemeStore().install(args[0]) }
        } catch (e: any) {
          return { success: false, error: e?.message ?? String(e) }
        }
      }
      case 'themesRemove': {
        try {
          getThemeStore().remove(args[0]); return { success: true }
        } catch (e: any) {
          return { success: false, error: e?.message ?? String(e) }
        }
      }
      case 'themesInstalled': {
        const store = getThemeStore()
        return { themes: store.installed(), discarded: store.takeDiscarded() }
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
      // Panel-only, like closeSelf below: the desktop's settings page hands
      // its App a callback and opens a tab directly, because the renderer owns
      // the tab strip there and a round trip through main would buy nothing.
      // Here the webview cannot open an editor tab itself, so it asks.
      case 'themesOpenGallery': {
        openGitVertexThemesTab(this._extensionUri, this._state, this._repoPath || '.')
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
          title: args[0] ?? 'Choose a folder',
        })
        // `{ path }`, like the desktop's — NOT the bare string this used to
        // return. The shared renderer reads `.path` (Sidebar's Add Worktree,
        // Clone and Init's Browse), so a bare string made `!dir.path` true
        // every time and those three did nothing at all in the panel. The
        // shape is the contract; a poorer one here succeeds while doing
        // something else, which is worse than not answering (#105).
        return { path: picked && picked.length > 0 ? picked[0].fsPath : null }
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
        if (!appPath) { vscode.window.showErrorMessage('Git Vertex desktop not found.'); return { success: false } }
        if (this._repoPath) launchApp(appPath, this._repoPath)
        return { success: true }
      }
    }

    if (!svc) throw new Error('No repository open')

    // Overrides that don't map 1:1 to a GitService method.
    switch (method) {
      // avatarResolve is synchronous — return its value directly.
      case 'avatarResolve': return svc.avatarResolve(args[0], args[1])
      // Running AI agents, for the rail's Agents view and the worktree badges.
      // A `ps` walk plus one `lsof` — nothing here needed the desktop.
      case 'listAgents': return listAgents()
      // GitHub (PAT from the gvSettings memento, set via gitVertex.setGithubToken)
      case 'githubDetectRepo': {
        const { remotes } = await svc.getRemotes()
        const origin = remotes.find(r => r.name === 'origin') ?? remotes[0]
        return githubRepo(origin?.fetchUrl || origin?.pushUrl || '')
      }
      // The same detection for a path that is not the open repository. The
      // desktop uses it to read the recent-repos list; here it is one more
      // repository the panel may be asked about.
      case 'githubDetectRepoAt': {
        try {
          const exec = promisify(execFile)
          const { stdout } = await exec(
            'git', ['-C', args[0], 'remote', 'get-url', 'origin'], { env: gitEnv() },
          )
          return githubRepo(stdout.trim())
        } catch { return { owner: null, repo: null } }
      }
      case 'githubListPRs': return githubListPRs(await this._githubApi(), args[0], args[1])
      case 'githubListIssues': return githubListIssues(await this._githubApi(), args[0], args[1])
      // Backs the `#123` hover card the shared renderer renders on every commit
      // message. Without it the card resolved to nothing and the panel showed a
      // bare "#123 — owner/repo" with no title or state.
      case 'githubGetIssue': return githubGetIssue(await this._githubApi(), args[0], args[1], args[2])
      case 'githubCreatePR':
        return githubCreatePR(await this._githubApi(), args[0], args[1], args[2], args[3], args[4], args[5], args[6])
      case 'githubListBranches': return githubListBranches(await this._githubApi(), args[0], args[1])
      case 'githubRepoParent': return githubRepoParent(await this._githubApi(), args[0], args[1])
      // A search across everything the account can see, rather than one
      // repository — what a saved filter and an "assigned to me" group are.
      case 'githubSearchIssues': return githubSearchIssues(await this._githubApi(), args[0], args[1])
      case 'githubCloseIssue':
        return githubCloseIssue(await this._githubApi(), args[0], args[1], args[2])
      case 'githubIssueComments':
        return githubIssueComments(await this._githubApi(), args[0], args[1], args[2])
      case 'githubAddIssueComment':
        return githubAddIssueComment(await this._githubApi(), args[0], args[1], args[2], args[3])
      case 'githubUpdateIssue':
        return githubUpdateIssue(await this._githubApi(), args[0], args[1], args[2], args[3])
      case 'githubListAssignees':
        return githubListAssignees(await this._githubApi(), args[0], args[1])
      case 'githubRequestReviewers':
        return githubRequestReviewers(await this._githubApi(), args[0], args[1], args[2], args[3])
      case 'githubCreateLabel':
        return githubCreateLabel(await this._githubApi(), args[0], args[1], args[2], args[3])
      case 'githubCreateIssue':
        return githubCreateIssue(await this._githubApi(), args[0], args[1], args[2], args[3], args[4], args[5])
      case 'githubListRepoLabels':
        return githubListRepoLabels(await this._githubApi(), args[0], args[1])
      case 'githubGetPR':
        return githubGetPR(await this._githubApi(), args[0], args[1], args[2])
      case 'githubGetChecks':
        return githubGetChecks(await this._githubApi(), args[0], args[1], args[2])
      case 'githubMergePR':
        return githubMergePR(await this._githubApi(), args[0], args[1], args[2], args[3])
      case 'githubListRepos': return githubListRepos(await this._githubApi())
      // Share a commit's patch as a secret gist. git makes the patch, the API
      // stores it — so the two halves are assembled here rather than in
      // githubApi.ts, which has no repository to ask.
      case 'githubSharePatch': {
        const { patch, error } = await svc.createPatch(args[0])
        if (error) return { error }
        const short = String(args[0]).slice(0, 7)
        // The subject is decoration on the gist's description; a repository
        // that cannot produce one is not a reason to refuse to share.
        let subject = short
        try { subject = (await svc.getLastCommitMessage(args[0])).message.split('\n')[0] || short } catch { /* cosmetic */ }
        return githubCreateGist(
          await this._githubApi(),
          `git-vertex patch — ${short}: ${subject}`, `${short}.patch`, patch,
        )
      }
      // The same, for work that is not committed yet: the working tree against
      // HEAD. Tracked changes only — that is what `git diff HEAD` gives, and an
      // untracked file is not something the sharer has said they want out.
      case 'githubShareWipPatch': {
        const repoPath = String(args[0])
        let patch: string
        try {
          const exec = promisify(execFile)
          const { stdout } = await exec(
            'git', ['-C', repoPath, 'diff', 'HEAD'],
            { env: gitEnv(), maxBuffer: 20 * 1024 * 1024 },
          )
          patch = stdout
        } catch (e: any) { return { error: e.message } }
        if (!patch.trim()) return { error: 'no_changes' }
        const name = repoPath.split(/[\\/]/).filter(Boolean).pop() || 'wip'
        return githubCreateGist(
          await this._githubApi(),
          `git-vertex WIP patch — ${name}`, `${name}-wip.patch`, patch,
        )
      }
      // Sign-in. The desktop's OAuth proxy and gitgui:// deep link have no
      // equivalent here, so this asks VS Code's own GitHub provider instead —
      // which for most people means confirming a session they already have.
      // Only ever reached from a click: getSession shows a modal consent.
      case 'githubStartAuth': {
        try {
          const session = await signIn()
          if (!session) return { success: false, error: 'cancelled' }
          // Undo a previous Disconnect, or signing in would appear to do
          // nothing: the session would be there and we would keep ignoring it.
          await this._setSessionOptOut(false)
          return { success: true, login: session.account.label }
        } catch {
          // No GitHub provider on this host (VSCodium and other builds that do
          // not bundle it). The PAT field is the way in there, and saying so
          // beats a dialog that never opens.
          return { success: false, error: 'no-provider' }
        }
      }
      case 'githubGetToken': return { token: (await this._githubToken()) ?? null }
      case 'githubDisconnect': {
        // What "Disconnect" means here. A VS Code session is VS Code's to
        // revoke — no extension API signs a user out — so this stops Git Vertex
        // from using it, and forgets any token of our own. The account itself
        // stays in the Accounts menu, which is what the toast says.
        const wasVsCodeSession = (await this._identity())?.source === 'vscode'
        const all = this._state.get<Record<string, string>>('gvSettings', {})
        delete all.githubToken
        await this._state.update('gvSettings', all)
        await this._setSessionOptOut(true)
        return { success: true, wasVsCodeSession }
      }
      // AI features — same pipeline as the desktop app, config from VS Code
      // settings (gitVertex.aiProvider/aiApiKey/aiModel) or shared gvSettings.
      // NO_API_KEY keeps the shared UI's "configure a key" toast working.
      case 'aiListProviderModels': {
        // The base URL travels from the settings page (an entry not saved
        // yet), else the catalog/customs know it (#169).
        const gv = this._state.get<Record<string, string>>('gvSettings', {})
        const pdef = providerById(gv, args[0])
        return listProviderModels(args[0], args[1], args[2] ?? pdef?.baseUrl,
          pdef ? { authHeader: pdef.authHeader, extraHeaders: pdef.extraHeaders } : undefined)
      }
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
        // `source` is what lets the settings page say where the identity came
        // from. Without it, a VS Code session and a pasted token look the same
        // on screen, and "Disconnect" reads as a promise we cannot keep.
        const identity = await this._identity()
        if (!identity) return { user: null }
        try {
          const res = await fetch('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${identity.token}`, Accept: 'application/vnd.github+json' },
          })
          if (!res.ok) return { user: null }
          const u = await res.json() as any
          return { user: { login: u.login, avatar: u.avatar_url }, source: identity.source }
        } catch { return { user: null } }
      }
      case 'aiFilterQuery': {
        const cfg = readAIConfig(this._state, 'filter')
        if (!cfg) return { error: 'NO_API_KEY' }
        return aiFilterQuery(cfg, args[0], args[1], args[2])
      }
      case 'aiGenerateIssue': {
        const cfg = readAIConfig(this._state, 'issue')
        if (!cfg) return { error: 'NO_API_KEY' }
        return aiGenerateIssue(cfg, args[0])
      }
      // The material is assembled here — aiService has no repository to ask.
      // Same ref resolution as the desktop handler: the base as the remote
      // holds it when possible, the head as the local repo does.
      case 'aiPrDescription': {
        const cfg = readAIConfig(this._state, 'pr')
        if (!cfg) return { error: 'NO_API_KEY' }
        if (!svc) return { error: 'No repository open' }
        const resolveRef = async (name: string, preferLocal: boolean): Promise<string> => {
          const candidates = preferLocal
            ? [`refs/heads/${name}`, `refs/remotes/origin/${name}`]
            : [`refs/remotes/origin/${name}`, `refs/heads/${name}`]
          for (const c of candidates) {
            try { await svc.raw(['rev-parse', '--verify', '--quiet', c]); return c } catch { /* next */ }
          }
          return name
        }
        const base = await resolveRef(args[0], false)
        const head = await resolveRef(args[1], true)
        const subjects = (await svc.raw(['log', '--format=%s', `${base}..${head}`]).catch(() => ''))
          .split('\n').map(s => s.trim()).filter(Boolean)
        const diffstat = await svc.raw(['diff', '--stat', `${base}...${head}`]).catch(() => '')
        const diff = await svc.raw(['diff', `${base}...${head}`]).catch(() => '')
        return aiPrDescription(cfg, args[0], args[1], subjects, diffstat, diff)
      }
      case 'aiGenerateCommitMessage': {
        const cfg = readAIConfig(this._state, 'commit')
        if (!cfg || !svc) return { error: 'NO_API_KEY' }
        const staged = await svc.raw(['diff', '--cached']).catch(() => '')
        return aiGenerateCommitMessage(cfg, staged)
      }
      case 'aiRecomposeCommit': {
        const cfg = readAIConfig(this._state, 'commit')
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
        // A guided explanation answers a different question: no cache read, no
        // cache write — see the desktop handler, which makes the same call.
        if (!args[1] && !String(args[2] ?? '').trim() && this._repoPath && all[this._repoPath]?.[args[0]]) {
          return { explanation: all[this._repoPath][args[0]], cached: true }
        }
        const cfg = readAIConfig(this._state, 'explain')
        if (!cfg || !svc) return { error: 'NO_API_KEY' }
        const diff = await svc.raw(['diff-tree', '--no-commit-id', '-p', '--root', args[0]]).catch(() => '')
        const subject = (await svc.raw(['log', '-1', '--pretty=format:%s', args[0]]).catch(() => '')).trim()
        const r = await aiExplainCommit(cfg, diff, subject, args[2])
        if (!(r as any).error && this._repoPath && !String(args[2] ?? '').trim()) {
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
        const cfg = readAIConfig(this._state, 'conflict')
        if (!cfg || !svc) return { error: 'NO_API_KEY' }
        const fileRes = await (svc as any).getFileContent(args[0])
        if (fileRes?.error) return { error: fileRes.error }
        return aiResolveConflict(cfg, args[0], fileRes?.content ?? '', args[1])
      }
      case 'aiSearchCommits': {
        const cfg = readAIConfig(this._state, 'search')
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
      // Same shape: preload says `stashDiff`, the service says `getStashDiff`.
      // Reflective forwarding matches on the preload name, so without this
      // alias the stash diff answered not-implemented while the code existed.
      case 'stashDiff': return svc.getStashDiff(args[0])
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

  /** The PAT the user pasted, if any — the fallback half of resolveIdentity. */
  private _storedPat(): string | undefined {
    const all = this._state.get<Record<string, string>>('gvSettings', {})
    return all.githubToken || undefined
  }

  /**
   * False once the user has pressed Disconnect: we keep the VS Code session
   * out of the way until they sign in again. Stored rather than held in memory
   * so it survives a window reload, like the token it replaces.
   */
  private _useVsCodeSession(): boolean {
    return this._state.get<Record<string, string>>('gvSettings', {}).githubSessionOptOut !== 'true'
  }

  private async _setSessionOptOut(optedOut: boolean): Promise<void> {
    const all = this._state.get<Record<string, string>>('gvSettings', {})
    if (optedOut) all.githubSessionOptOut = 'true'
    else delete all.githubSessionOptOut
    await this._state.update('gvSettings', all)
  }

  /** Who we are to GitHub, and where that came from. */
  private _identity() {
    return resolveIdentity(() => this._storedPat(), this._useVsCodeSession())
  }

  /**
   * The token every GitHub call runs with: a VS Code session when one already
   * exists, the stored PAT otherwise. Async because asking VS Code for a
   * session is — which is why this used to be a plain memento read.
   */
  private async _githubToken(): Promise<string | undefined> {
    return (await this._identity())?.token
  }

  /** The Enterprise host the user has declared, if any. */
  private _enterpriseHost(): string {
    const all = this._state.get<Record<string, string>>('gvSettings', {})
    return (all.githubEnterpriseHost ?? '').trim().toLowerCase()
  }

  /**
   * Where this repository's GitHub answers, and what may be sent there.
   *
   * ⚠️ VS Code's GitHub session is a **github.com** credential. Sending it to
   * an Enterprise Server instance would hand the user's github.com token to
   * whoever runs that server, so an instance takes its own PAT and nothing
   * else — which is also why a host is not treated as GitHub at all until the
   * user has declared it.
   */
  private async _githubApi(): Promise<GithubApi & { host: string }> {
    const all = this._state.get<Record<string, string>>('gvSettings', {})
    const enterprise = this._enterpriseHost()
    let host = GITHUB_COM
    try {
      const svc = this._gitService
      if (svc && enterprise) {
        const { remotes } = await svc.getRemotes()
        const origin = remotes.find(r => r.name === 'origin') ?? remotes[0]
        const parsed = githubRepo(origin?.fetchUrl || origin?.pushUrl || '', [enterprise])
        if (parsed.host) host = parsed.host
      }
    } catch { /* no repo, or no remotes — github.com it is */ }

    const token = host === GITHUB_COM
      ? await this._githubToken()
      : (all.githubEnterpriseToken || undefined)
    return { base: githubApiBase(host), host, token }
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
// rebase is detected (started from the UI, the CLI, anywhere).
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
    'Rebase in progress',
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
    `Interactive rebase — ${baseHash.slice(0, 7)}`,
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

// ── Theme gallery tab ─────────────────────────────────────────────
// The bank is ~4,000 themes. That does not go in a side panel, and it does not
// need to: an extension can put a webview in the editor area, which is what
// the interactive rebase already does. So the panel keeps the 32 chips and the
// browse card, and the card opens THIS — beside the user's files, the same
// gesture as on the desktop, where it opens an app tab.
const THEMES_VIEW_TYPE = 'gitVertex.themes'
let themesPanel: vscode.WebviewPanel | undefined
let themesHost: GitVertexHost | undefined

export function openGitVertexThemesTab(
  extensionUri: vscode.Uri,
  state: vscode.Memento,
  repoPath: string,
): void {
  // One at a time. Reveal rather than stack: a second gallery would fetch the
  // catalogue again and disagree with the first about what is installed.
  if (themesPanel) {
    themesPanel.reveal(themesPanel.viewColumn)
    return
  }

  themesPanel = vscode.window.createWebviewPanel(
    THEMES_VIEW_TYPE,
    'Themes',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      // Filters and the scroll position are the whole value of the view;
      // rebuilding it on every tab switch would make it unusable.
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
    },
  )
  themesPanel.iconPath = vscode.Uri.joinPath(extensionUri, 'images', 'icon.png')

  themesHost = new GitVertexHost(themesPanel.webview, extensionUri, state, { mode: 'themes' })
  themesHost.setRepo(repoPath)

  themesPanel.onDidDispose(() => {
    themesHost?.dispose()
    themesHost = undefined
    themesPanel = undefined
  })
}

// ── "What's new" tab ──────────────────────────────────────────────
// Replaces the raw CHANGELOG.md markdown preview that used to open after an
// update. Same trigger, different content: the whole file, in developer
// sections, was never what a user wanted to read — this shows the curated note
// for one version, in the same component the desktop app uses.
//
// The note travels in the boot payload rather than through a gitAPI call: the
// caller already knows which version it is opening for, so a round trip would
// only add three methods to the host for no answer it does not have.
const WHATS_NEW_VIEW_TYPE = 'gitVertex.whatsNew'
let whatsNewPanel: vscode.WebviewPanel | undefined
let whatsNewHost: GitVertexHost | undefined

export function openGitVertexWhatsNewTab(
  extensionUri: vscode.Uri,
  state: vscode.Memento,
  version: string,
  notes: string,
): void {
  if (whatsNewPanel) {
    whatsNewPanel.reveal(whatsNewPanel.viewColumn)
    return
  }

  whatsNewPanel = vscode.window.createWebviewPanel(
    WHATS_NEW_VIEW_TYPE,
    `What's New — Git Vertex ${version}`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
    },
  )
  whatsNewPanel.iconPath = vscode.Uri.joinPath(extensionUri, 'images', 'icon.png')

  whatsNewHost = new GitVertexHost(whatsNewPanel.webview, extensionUri, state,
    { mode: 'whatsNew', version, notes })

  whatsNewPanel.onDidDispose(() => {
    whatsNewHost?.dispose()
    whatsNewHost = undefined
    whatsNewPanel = undefined
  })
}

// ── Compare tabs (one WebviewPanel per ref pair) ──────────────────
// A "search & compare" view: ahead/behind commit lists + full diff
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
    refA && refB ? `Compare — ${refA}..${refB}` : 'Compare references',
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
// Visual file history: commit timeline + per-commit diff/blame.
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
    `History — ${file.split('/').pop()}`,
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
    `Compare — ${hash.slice(0, 7)} ↔ working tree`,
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
