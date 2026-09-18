// GitVertexViewProvider — the WebviewView, wherever VS Code shows it: the
// bottom panel it is declared in, the side bar the user moves it to, or the
// secondary side bar. Thin adapter that mounts a shared GitVertexHost onto the
// view's webview. All the UI hosting + gitApi bridge lives in GitVertexHost
// (also reused by the editor-tab WebviewPanel).

import * as vscode from 'vscode'
import { GitVertexHost, type PanelStatus } from './GitVertexHost'

export class GitVertexViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'gitVertex.graphView'
  private _host?: GitVertexHost
  private _view?: vscode.WebviewView
  private _pendingRepo?: string
  private _pendingReveal?: string

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _state: vscode.Memento
  ) {}

  public resolveWebviewView(view: vscode.WebviewView): void {
    const host = new GitVertexHost(view.webview, this._extensionUri, this._state)
    this._host = host
    this._view = view
    host.onStatus = status => { if (this._view === view) this._wear(view, status) }
    host.onSwitchRepo = repoPath => this.onSwitchRepo?.(repoPath)
    host.onRescan = () => this.onRescan?.()
    host.onFollowCursor = on => this.onFollowCursor?.(on)
    // The repo may have been resolved before the view was lazily created.
    if (this._pendingRepo) host.setRepo(this._pendingRepo)
    // A commit asked for before the view existed: the webview boots, loads
    // its first page, and only then can show it — a moment, not a message.
    if (this._pendingReveal) {
      const ref = this._pendingReveal
      this._pendingReveal = undefined
      setTimeout(() => { if (this._host === host) host.postReveal(ref) }, 1500)
    }
    // Moving the view between containers resolves a new one; the old one's
    // disposal may land after that, and must only take its own host down.
    view.onDidDispose(() => {
      host.dispose()
      if (this._host === host) { this._host = undefined; this._view = undefined }
    })
  }

  /**
   * The header of the view, wherever the view is: the badge VS Code draws on
   * a view's title (and on the panel's tab while it is collapsed) carries the
   * changed-file count, the description beside the title names the branch.
   */
  private _wear(view: vscode.WebviewView, status: PanelStatus): void {
    view.badge = status.wip > 0
      ? { value: status.wip, tooltip: `${status.wip} changed file${status.wip === 1 ? '' : 's'}` }
      : undefined
    view.description = status.branch || undefined
  }

  /** The panel chose another repository of the workspace. */
  public onSwitchRepo?: (repoPath: string) => void
  /** The panel initialised a repository: resolve one again. */
  public onRescan?: () => void
  /** The graph follows the editor's cursor, or stops. */
  public onFollowCursor?: (on: boolean) => void
  public followCursor(on: boolean): void { void this._host?.applyFollowCursor(on) }
  /** Open the panel's own settings page — the caller focuses the view first. */
  public openSettings(): void { this._host?.postOpenSettings() }

  public setRepo(repoPath: string): void {
    this._pendingRepo = repoPath
    this._host?.setRepo(repoPath)
  }

  /** Show a commit in the graph — the caller focuses the view first. */
  public reveal(ref: string, quiet = false): void {
    if (this._host) this._host.postReveal(ref, quiet)
    else if (!quiet) this._pendingReveal = ref
  }

  public dispose(): void {
    this._host?.dispose()
  }
}
