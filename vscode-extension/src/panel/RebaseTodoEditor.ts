// RebaseTodoEditor — custom editor for git's `git-rebase-todo` file.
//
// When git opens the interactive-rebase todo in VS Code (sequence.editor set
// to `code --wait`, e.g. via the gitVertex.enableRebaseEditor command), this
// editor replaces the raw text with the Git Vertex rebase UI. It serves BOTH
// stages of the same file's life, chosen by whether anything has been
// applied yet (getRebaseState().done):
//   - fresh (done empty): the planner (RebaseTodoApp, boot mode 'todo') —
//     reorder/pick/reword/etc, "Lancer" rewrites the file, saves and closes
//     the tab, which is what `code --wait` is blocked on.
//   - mid-rebase (done non-empty, e.g. paused on a conflict): the tracker
//     (RebaseProgress, boot mode 'rebase') — same UI/continue-skip-abort
//     flow as the tab that auto-opens for a non-interactive or Git-Vertex-
//     launched rebase, just backed by the real file instead of an ad-hoc
//     panel, so it's the one tab GitLens's own competing editor is up
//     against instead of two different Git Vertex surfaces at once.
import * as vscode from 'vscode'
import * as path from 'path'
import { GitVertexHost, closeRebaseTrackerIfOpenFor } from './GitVertexHost'
import { GitService } from '../gitService'

// Repos with a git-rebase-todo custom editor CURRENTLY open — i.e. still
// being planned, before git has resumed. extension.ts's rebase watcher
// checks this to avoid auto-opening the redundant "Rebase en cours" tracker
// tab for a rebase that hasn't actually started running yet.
const openForRepo = new Set<string>()
export function isRebaseTodoEditorOpenFor(repoPath: string): boolean {
  return openForRepo.has(repoPath)
}

// extension.ts's rebase watcher registers itself here so it can re-check
// (and open the tracker tab if git is still paused) the moment this editor
// closes and git resumes — its own file watcher can otherwise miss a
// same-directory conflict transition with no create/delete event of its own.
let onClosed: (() => void) | undefined
export function setOnRebaseTodoEditorClosed(cb: () => void): void { onClosed = cb }

export class RebaseTodoEditor implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'gitVertex.rebaseTodoEditor'

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _state: vscode.Memento,
  ) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    // Guard: this editor only makes sense for git's rebase-todo file. If it
    // gets resolved for anything else — e.g. a stray "*" entry in the user's
    // workbench.editorAssociations — bail out to the normal text editor
    // instead of showing a rebase UI over a random file.
    if (path.basename(document.uri.fsPath) !== 'git-rebase-todo') {
      webviewPanel.dispose()
      await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default')
      return
    }

    webviewPanel.iconPath = vscode.Uri.joinPath(this._extensionUri, 'images', 'icon.png')

    // The rebase-todo file always lives at <repo>/.git/rebase-merge/git-rebase-todo
    // (doesn't hold for a worktree's own rebase, where the real git-dir lives
    // elsewhere — getRebaseState then just comes back empty and this falls
    // back to the fresh-planner mode, which is still a safe default).
    const repoPath = path.dirname(path.dirname(path.dirname(document.uri.fsPath)))
    const gitService = new GitService(repoPath)
    const state = await gitService.getRebaseState()
    const bootMode = state.done.length > 0 ? 'rebase' : 'todo'

    // Write `content`, save, and close the tab. Closing makes `code --wait`
    // return, which is what git is blocked on. Only meaningful in 'todo'
    // mode — the 'rebase' mode instead uses GitService's continueRebase/
    // skipRebase/abortRebase (plain `git rebase --continue` etc, which work
    // regardless of what originally started the rebase).
    const finishWith = async (content: string): Promise<void> => {
      const edit = new vscode.WorkspaceEdit()
      const full = new vscode.Range(0, 0, document.lineCount, 0)
      edit.replace(document.uri, full, content)
      await vscode.workspace.applyEdit(edit)
      await document.save()
      webviewPanel.dispose()
    }

    const host = new GitVertexHost(
      webviewPanel.webview,
      this._extensionUri,
      this._state,
      { mode: bootMode },
      undefined,
      { document, finish: finishWith },
    )
    host.setRepo(repoPath)

    openForRepo.add(repoPath)
    // Corrective, not just preventive: the tracker's own debounced watcher
    // can win a race and open before this editor is registered as "open"
    // (spawning `code --wait` + the extension-host round trip isn't
    // instant) — so close it now if that just happened.
    closeRebaseTrackerIfOpenFor(repoPath)
    webviewPanel.onDidDispose(() => {
      host.dispose()
      openForRepo.delete(repoPath)
      onClosed?.()
    })
  }
}
