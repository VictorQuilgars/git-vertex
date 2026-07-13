// ConflictEditor — custom editor for conflicted working-tree files.
//
// Registered with priority "option" (not "default") and a "*" selector, so it
// stays completely inert for ordinary file editing — VS Code's built-in text
// editor (with its native merge-conflict CodeLens) keeps handling every file
// normally. Git Vertex only ever opens THIS editor explicitly, the moment it
// already knows a specific file is conflicted (openConflictResolver), so the
// resulting tab is bound to the real file's own identity instead of being an
// ad-hoc floating panel disconnected from it.

import * as vscode from 'vscode'
import * as path from 'path'
import { GitVertexHost } from './GitVertexHost'
import { getRepoRootForFile } from '../gitInfo'

export class ConflictEditor implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'gitVertex.conflictResolver'

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _state: vscode.Memento,
  ) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    // Guard: the resolver only makes sense on a file that actually contains
    // conflict markers. The "*" selector (needed because conflicted files can
    // have any name) also puts it in every file's "Reopen With…" list — for a
    // clean file, hand straight back to the normal text editor.
    if (!/^<{7}/m.test(document.getText())) {
      webviewPanel.dispose()
      await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default')
      return
    }

    webviewPanel.iconPath = vscode.Uri.joinPath(this._extensionUri, 'images', 'icon.png')

    const repoPath = getRepoRootForFile(document.uri.fsPath)
    if (!repoPath) {
      // Shouldn't happen — we only ever open this ourselves on an already
      // detected conflict inside a known repo — but degrade gracefully.
      webviewPanel.webview.options = { enableScripts: false }
      webviewPanel.webview.html = `<pre>${document.getText().replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string))}</pre>`
      return
    }
    const file = path.relative(repoPath, document.uri.fsPath).split(path.sep).join('/')

    const host = new GitVertexHost(
      webviewPanel.webview,
      this._extensionUri,
      this._state,
      { mode: 'conflict', file },
      () => webviewPanel.dispose(),
    )
    host.setRepo(repoPath)
    webviewPanel.onDidDispose(() => host.dispose())
  }
}
