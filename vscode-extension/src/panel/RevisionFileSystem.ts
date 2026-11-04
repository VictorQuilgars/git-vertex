import * as vscode from 'vscode'
import { execFile } from 'child_process'
import { gitEnv } from '../gitService'
import {
  TREE_SCHEME, rootId, treePath, parseTreePath, lsTreeArgs, parseLsTree, baseName, isSymlink, treeFolderName, type TreeEntry,
} from '../revisionTree'

/**
 * The repository at one commit, served read-only as a folder (#72).
 *
 * `gitvertex-tree://<root id>/<commit>/<path>` — everything is read from git's
 * object store (`ls-tree`, `cat-file`), so nothing is checked out and the
 * working tree is never touched. The root id is resolved through a registry
 * kept in the extension's GLOBAL state: a tree opened in a new window starts a
 * new extension host, which has to find the repository again from the URI
 * alone.
 */

const REGISTRY_KEY = 'gvRevisionTreeRoots'
let state: vscode.Memento | null = null

function rootFor(id: string): string | null {
  return state?.get<Record<string, string>>(REGISTRY_KEY, {})[id] ?? null
}

async function remember(root: string): Promise<string> {
  const id = rootId(root)
  if (state && rootFor(id) !== root) {
    const all = { ...state.get<Record<string, string>>(REGISTRY_KEY, {}) }
    all[id] = root
    await state.update(REGISTRY_KEY, all)
  }
  return id
}

/** git, binary-safe: a file's bytes must reach the editor as they are. */
function git(root: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: root, env: gitEnv(), encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(String(stderr || err.message).trim()))
      else resolve(stdout)
    })
  })
}

class RevisionFileSystem implements vscode.FileSystemProvider {
  private readonly emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>()
  readonly onDidChangeFile = this.emitter.event
  /** Commit time, per commit: every entry of a commit carries the same date. */
  private readonly times = new Map<string, number>()

  private locate(uri: vscode.Uri): { root: string; commit: string; rel: string } {
    const root = rootFor(uri.authority)
    const at = parseTreePath(uri.path)
    if (!root || !at) throw vscode.FileSystemError.FileNotFound(uri)
    return { root, ...at }
  }

  private async time(root: string, commit: string): Promise<number> {
    let t = this.times.get(commit)
    if (t === undefined) {
      t = Number((await git(root, ['show', '-s', '--format=%ct', commit]).catch(() => Buffer.from('0'))).toString().trim()) * 1000 || 0
      this.times.set(commit, t)
    }
    return t
  }

  private async entry(root: string, commit: string, rel: string): Promise<TreeEntry | null> {
    const raw = (await git(root, lsTreeArgs(commit, rel, false)).catch(() => Buffer.alloc(0))).toString('utf8')
    return parseLsTree(raw).find(e => e.path === rel) ?? null
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const { root, commit, rel } = this.locate(uri)
    const mtime = await this.time(root, commit)
    if (!rel) return { type: vscode.FileType.Directory, ctime: mtime, mtime, size: 0, permissions: vscode.FilePermission.Readonly }
    const e = await this.entry(root, commit, rel)
    if (!e) throw vscode.FileSystemError.FileNotFound(uri)
    // A submodule is a commit of ANOTHER repository: shown as an empty
    // folder, which is what a checkout without `submodule update` shows too.
    const type = e.type === 'blob'
      ? (isSymlink(e) ? vscode.FileType.File | vscode.FileType.SymbolicLink : vscode.FileType.File)
      : vscode.FileType.Directory
    return { type, ctime: mtime, mtime, size: e.size, permissions: vscode.FilePermission.Readonly }
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const { root, commit, rel } = this.locate(uri)
    const e = rel ? await this.entry(root, commit, rel) : null
    if (rel && !e) throw vscode.FileSystemError.FileNotFound(uri)
    if (e?.type === 'blob') throw vscode.FileSystemError.FileNotADirectory(uri)
    if (e?.type === 'commit') return []
    const raw = (await git(root, lsTreeArgs(commit, rel, true))).toString('utf8')
    return parseLsTree(raw).map(c => [baseName(c.path), c.type === 'blob' ? vscode.FileType.File : vscode.FileType.Directory])
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const { root, commit, rel } = this.locate(uri)
    if (!rel) throw vscode.FileSystemError.FileIsADirectory(uri)
    try {
      return await git(root, ['cat-file', 'blob', `${commit}:${rel}`])
    } catch {
      throw vscode.FileSystemError.FileNotFound(uri)
    }
  }

  // ── A revision is history: nothing in it is written ──
  watch(): vscode.Disposable { return new vscode.Disposable(() => {}) }
  createDirectory(uri: vscode.Uri): void { throw vscode.FileSystemError.NoPermissions(uri) }
  writeFile(uri: vscode.Uri): void { throw vscode.FileSystemError.NoPermissions(uri) }
  delete(uri: vscode.Uri): void { throw vscode.FileSystemError.NoPermissions(uri) }
  rename(uri: vscode.Uri): void { throw vscode.FileSystemError.NoPermissions(uri) }
}

/** Serve the scheme. Called once, at activation — including in a window opened on a tree. */
export function registerRevisionFileSystem(context: vscode.ExtensionContext): void {
  state = context.globalState
  context.subscriptions.push(vscode.workspace.registerFileSystemProvider(
    TREE_SCHEME, new RevisionFileSystem(), { isCaseSensitive: true, isReadonly: true }))
}

/**
 * Open the repository at `commit` (a full hash) as a folder: added to this
 * window's workspace, or in a window of its own.
 */
export async function browseRevision(root: string, commit: string, opts: { newWindow: boolean; label?: string }): Promise<void> {
  const id = await remember(root)
  const uri = vscode.Uri.from({ scheme: TREE_SCHEME, authority: id, path: treePath(commit) })
  const name = treeFolderName(root, commit, opts.label)
  if (opts.newWindow) {
    await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true })
    return
  }
  const already = (vscode.workspace.workspaceFolders ?? []).find(f => f.uri.toString() === uri.toString())
  if (!already) {
    const at = vscode.workspace.workspaceFolders?.length ?? 0
    if (!vscode.workspace.updateWorkspaceFolders(at, 0, { uri, name })) {
      throw new Error('VS Code refused to add the folder to the workspace')
    }
  }
  // The explorer is where a folder is browsed: bring it forward.
  await vscode.commands.executeCommand('workbench.view.explorer')
}
