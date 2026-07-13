// CommitMsgEditor — custom editor for git's `COMMIT_EDITMSG` file.
//
// Whatever invokes core.editor opens this file: a reword or squash step
// during an interactive rebase (when gitVertex.enableRebaseEditor also set
// core.editor — see toggleSequenceEditor in extension.ts), a plain
// `git commit` run without -m, a merge commit, `git tag -a`, etc. This
// editor replaces the raw file (git's default message + '#'-prefixed
// instructional comments) with a small Git Vertex form; saving writes the
// edited message back, saves and closes the tab, which is what
// `code --wait` is blocked on. Git applies its own cleanup (stripping '#'
// lines, trimming blank lines) on top, same as any other editor.
import * as vscode from 'vscode'
import * as path from 'path'
import { buildWebviewHtml } from './GitVertexHost'
import { GitService } from '../gitService'

interface GitApiRequest { type: 'gitApi'; id: number; method: string; args: any[] }

// Everything before the first '#'-starting line is the actual message git
// pre-filled (existing subject for reword, combined messages for squash);
// the rest is instructional boilerplate git discards on its own.
function extractMessage(raw: string): string {
  const lines = raw.split('\n')
  const commentIndex = lines.findIndex(l => l.startsWith('#'))
  const kept = commentIndex === -1 ? lines : lines.slice(0, commentIndex)
  return kept.join('\n').replace(/\n+$/, '')
}

export class CommitMsgEditor implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'gitVertex.commitMsgEditor'

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    // Guard: only meant for git's commit-message files. A stray broad entry
    // in workbench.editorAssociations (e.g. "*") must not hijack arbitrary
    // files — fall back to the plain text editor.
    const base = path.basename(document.uri.fsPath)
    if (base !== 'COMMIT_EDITMSG' && base !== 'MERGE_MSG' && base !== 'SQUASH_MSG') {
      webviewPanel.dispose()
      await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default')
      return
    }

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')],
    }
    webviewPanel.iconPath = vscode.Uri.joinPath(this._extensionUri, 'images', 'icon.png')

    // COMMIT_EDITMSG always lives at <repo>/.git/COMMIT_EDITMSG (not for a
    // worktree's own commit, where the real git-dir lives elsewhere — the
    // rebase-step context below then just comes back empty, same as any
    // other best-effort cosmetic lookup elsewhere in this extension).
    const repoPath = path.dirname(path.dirname(document.uri.fsPath))
    const gitService = new GitService(repoPath)
    const state = await gitService.getRebaseState()
    // The step git is stopped on to invoke this editor is the last `done`
    // entry (same convention as RebaseProgress/RebaseTodoEditor).
    const current = state.inProgress && state.interactive ? state.done[state.done.length - 1] : undefined

    webviewPanel.webview.html = buildWebviewHtml(webviewPanel.webview, this._extensionUri, {
      mode: 'commitMsg',
      initialMessage: extractMessage(document.getText()),
      action: current?.action,
      subject: current?.subject,
      stepCurrent: state.inProgress ? state.stepCurrent : undefined,
      stepTotal: state.inProgress ? state.stepTotal : undefined,
    })

    const finishWith = async (content: string): Promise<void> => {
      const edit = new vscode.WorkspaceEdit()
      const full = new vscode.Range(0, 0, document.lineCount, 0)
      edit.replace(document.uri, full, content)
      await vscode.workspace.applyEdit(edit)
      await document.save()
      webviewPanel.dispose()
    }

    webviewPanel.webview.onDidReceiveMessage(async (msg: GitApiRequest) => {
      if (msg?.type !== 'gitApi') return
      const respond = (ok: boolean, value?: unknown, error?: string): void => {
        webviewPanel.webview.postMessage({ type: 'gitApiResult', id: msg.id, ok, value, error })
      }
      try {
        if (msg.method === 'commitMsgSave') {
          respond(true, { success: true })
          await finishWith(String(msg.args[0] ?? '') + '\n')
        } else {
          respond(true, { success: false, error: `not-implemented: ${msg.method}` })
        }
      } catch (e: any) {
        respond(false, undefined, e?.message ?? String(e))
      }
    })
  }
}
