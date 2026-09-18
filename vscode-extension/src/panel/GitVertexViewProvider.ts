// GitVertexViewProvider — the WebviewView, wherever VS Code shows it: the
// bottom panel it is declared in, the side bar the user moves it to, or the
// secondary side bar. Thin adapter that mounts a shared GitVertexHost onto the
// view's webview. All the UI hosting + gitApi bridge lives in GitVertexHost
// (also reused by the editor-tab WebviewPanel).

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
    const host = new GitVertexHost(view.webview, this._extensionUri, this._state)
    this._host = host
    // The repo may have been resolved before the view was lazily created.
    if (this._pendingRepo) host.setRepo(this._pendingRepo)
    // Moving the view between containers resolves a new one; the old one's
    // disposal may land after that, and must only take its own host down.
    view.onDidDispose(() => { host.dispose(); if (this._host === host) this._host = undefined })
  }

  public setRepo(repoPath: string): void {
    this._pendingRepo = repoPath
    this._host?.setRepo(repoPath)
  }

  public dispose(): void {
    this._host?.dispose()
  }
}
