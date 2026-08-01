// remoteLinks.ts — "share a link to these lines", from the editor.
//
// The P0 of the lot, and the reason the build had to be untangled first: the
// selection lives in the editor, so the command belongs to the extension host —
// while the thing that knows how to shape a URL is shared renderer code. The
// host now type-checks against ../src/renderer, so there is still exactly one
// builder rather than a second copy written for this file.
//
// A link points at a COMMIT, not at a branch. `main` says something different
// next week, and someone sharing line 40 rarely means "line 40 of whatever this
// file becomes". The commit used is the one that last touched the file, so the
// link keeps working even after the branch moves on.

import * as vscode from 'vscode'
import * as path from 'path'
import { repoFromRemotes, remoteUrl, rangeFromSelection, type LineRange } from '../../src/renderer/src/utils/remoteUrl'
import { GitService } from './gitService'

export interface FileLinkOptions {
  /** Include the selected lines. False for the "without range" variant. */
  withRange: boolean
}

/**
 * Build a link to the active editor's file, or explain why we cannot.
 *
 * Everything that can be absent is treated as a reason, not as a crash: no
 * editor, a file outside the repository, a repository with no usable remote, a
 * file git has never seen.
 */
async function buildFileLink(
  repoRoot: string,
  editor: vscode.TextEditor,
  opts: FileLinkOptions,
): Promise<{ url: string } | { error: string }> {
  const fsPath = editor.document.uri.fsPath
  const rel = path.relative(repoRoot, fsPath)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return { error: 'This file is outside the repository.' }
  }

  const svc = new GitService(repoRoot)
  const { remotes } = await svc.getRemotes().catch(() => ({ remotes: [] as any[] }))
  let preferred: string | null = null
  try { preferred = (await (svc as any).getDefaultRemote?.())?.remote ?? null } catch { /* optional */ }
  const repo = repoFromRemotes(remotes ?? [], preferred)
  if (!repo) return { error: 'This repository has no remote to link to.' }

  // The commit that last touched this file. Falls back to HEAD — a file staged
  // but never committed has no history of its own, and HEAD is still a stable
  // point to link from even if the line numbers there are not the ones on
  // screen. Nothing is guessed silently: a file git does not know is refused.
  const ref = await svc.raw(['log', '-1', '--format=%H', '--', rel])
    .then(o => o.trim())
    .catch(() => '')
  const head = ref || await svc.raw(['rev-parse', 'HEAD']).then(o => o.trim()).catch(() => '')
  if (!head) return { error: 'This file has never been committed.' }

  // The off-by-one lives in rangeFromSelection, in the shared module, because
  // this file imports `vscode` and could not otherwise be tested.
  let range: LineRange | null = null
  if (opts.withRange) {
    const sel = editor.selection
    range = rangeFromSelection(sel.start.line, sel.end.line, sel.end.character)
  }

  // Forward slashes even on Windows: this is a URL path, not a file path.
  return { url: remoteUrl.file(repo, head, rel.split(path.sep).join('/'), range) }
}

/** Shared body of the copy / open commands. */
export async function runFileLinkCommand(
  resolveRepoRoot: () => string | undefined,
  opts: FileLinkOptions & { action: 'copy' | 'open' },
): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) { void vscode.window.showWarningMessage('Git Vertex: no file is open.'); return }
  const root = resolveRepoRoot()
  if (!root) { void vscode.window.showWarningMessage('No Git repository found for this workspace.'); return }

  const result = await buildFileLink(root, editor, opts)
  if ('error' in result) { void vscode.window.showWarningMessage(`Git Vertex: ${result.error}`); return }

  if (opts.action === 'open') {
    void vscode.env.openExternal(vscode.Uri.parse(result.url))
    return
  }
  await vscode.env.clipboard.writeText(result.url)
  void vscode.window.setStatusBarMessage('Git Vertex: link copied', 3000)
}
