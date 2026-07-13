// GitVertexViewProvider — WebviewView in the bottom panel area.
// Thin adapter that mounts a shared GitVertexHost onto the view's webview.
// All the UI hosting + gitApi bridge lives in GitVertexHost (also reused by the
// editor-tab WebviewPanel).

import * as vscode from 'vscode'
import { GitVertexHost } from './GitVertexHost'

export class GitVertexViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'gitVertex.graphView'
  private _host?: GitVertexHost
  private _pendingRepo?: string

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _state: vscode.Memento
  ) {}

  public resolveWebviewView(view: vscode.WebviewView): void {
    this._host = new GitVertexHost(view.webview, this._extensionUri, this._state)
    // The repo may have been resolved before the view was lazily created.
    if (this._pendingRepo) this._host.setRepo(this._pendingRepo)
    view.onDidDispose(() => { this._host?.dispose(); this._host = undefined })
  }

  public setRepo(repoPath: string): void {
    this._pendingRepo = repoPath
    this._host?.setRepo(repoPath)
  }

  public dispose(): void {
    this._host?.dispose()
  }
}
