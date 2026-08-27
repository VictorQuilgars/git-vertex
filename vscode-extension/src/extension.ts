import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { findAppPath, launchApp } from './appLocator'
import { GitVertexStatusBar } from './statusBar'
import { registerAuthCallback } from './oauthHost'
import { getGitInfo, getGitDir, getRepoRootForFile } from './gitInfo'
import { GitVertexViewProvider } from './panel/GitVertexViewProvider'
import { openGitVertexEditor, setEditorRepo, openGitVertexRebaseTab, openGitVertexFileHistoryTab, openGitVertexCompareTab, openGitVertexWhatsNewTab, postCommitMenuAction, lastCommitMenuHash, setThemeStorageDir, refUri, ensureDiffProvider } from './panel/GitVertexHost'
import { blameFile } from './blame/blame'
import { GitService } from './gitService'
import { RELEASE_NOTES } from './releaseNotes'
import { runFileLinkCommand } from './remoteLinks'
import { RebaseTodoEditor, isRebaseTodoEditorOpenFor, setOnRebaseTodoEditorClosed } from './panel/RebaseTodoEditor'
import { ConflictEditor } from './panel/ConflictEditor'
import { CommitMsgEditor } from './panel/CommitMsgEditor'
import { InlineBlameController } from './blame/inlineBlame'
import { gitEnv, parseGitVersion, isGitVersionAtLeast, MIN_GIT_FOR_CONFLICT_PREDICTION } from './gitService'
import { BlameCodeLensProvider } from './blame/codeLens'
import { execSync } from 'child_process'

let statusBar: GitVertexStatusBar | null = null
let refreshTimer: NodeJS.Timeout | null = null

// ── Resolve app path (config > auto-detect) ────────────────────
function resolveAppPath(): string | null {
  const cfg = vscode.workspace.getConfiguration('gitVertex')
  const custom = cfg.get<string>('appPath', '').trim()
  return custom || findAppPath()
}

// ── Resolve repo root for current context ─────────────────────
function resolveRepoRoot(uri?: vscode.Uri): string | null {
  // 1. Explicit URI (context menu on explorer item)
  if (uri) return getRepoRootForFile(uri.fsPath)

  // 2. Active text editor
  const editor = vscode.window.activeTextEditor
  if (editor) return getRepoRootForFile(editor.document.uri.fsPath)

  // 3. First workspace folder
  const folders = vscode.workspace.workspaceFolders
  if (folders && folders.length > 0) return getRepoRootForFile(folders[0].uri.fsPath)

  return null
}

// ── Open command ───────────────────────────────────────────────
async function openInGitVertex(uri?: vscode.Uri): Promise<void> {
  const appPath = resolveAppPath()
  if (!appPath) {
    const action = await vscode.window.showErrorMessage(
      'Git Vertex not found. Install it or configure the path.',
      'Configure path'
    )
    if (action === 'Configure path') {
      vscode.commands.executeCommand('gitVertex.configure')
    }
    return
  }

  const repoRoot = resolveRepoRoot(uri)
  if (!repoRoot) {
    vscode.window.showWarningMessage('No Git repository found for this workspace.')
    return
  }

  try {
    launchApp(appPath, repoRoot)
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to launch Git Vertex: ${err}`)
  }
}

// ── Configure command ──────────────────────────────────────────
async function configure(): Promise<void> {
  const result = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    title: 'Select Git Vertex executable',
    filters: process.platform === 'win32'
      ? { Executables: ['exe'] }
      : { All: ['*'] }
  })
  if (!result || result.length === 0) return

  const cfg = vscode.workspace.getConfiguration('gitVertex')
  await cfg.update('appPath', result[0].fsPath, vscode.ConfigurationTarget.Global)
  vscode.window.showInformationMessage(`Git Vertex path set to: ${result[0].fsPath}`)
}

// ── Status bar refresh ─────────────────────────────────────────
function refreshStatusBar(): void {
  if (!statusBar) return

  const folders = vscode.workspace.workspaceFolders
  if (!folders || folders.length === 0) { statusBar.hide(); return }

  const info = getGitInfo(folders[0].uri.fsPath)
  if (!info) { statusBar.hide(); return }

  statusBar.update(info.branch, info.ahead, info.behind)
}

function scheduleRefresh(delayMs = 3000): void {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(refreshStatusBar, delayMs)
}

// ── Sequence + core editor toggle ───────────────────────────────
// Makes git open interactive-rebase todos (sequence.editor) AND commit
// messages — reword/squash steps during that same rebase, plain commits,
// merges, tags (core.editor) — in VS Code, so the whole interactive-rebase
// experience is covered even for rebases started in a plain terminal, not
// just Git Vertex's own UI.
async function toggleSequenceEditor(): Promise<void> {
  let seq = ''
  try {
    seq = execSync('git config --global sequence.editor', {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch { /* not set */ }

  if (seq.includes('code')) {
    execSync('git config --global --unset sequence.editor')
    try { execSync('git config --global --unset core.editor') } catch { /* wasn't set */ }
    vscode.window.showInformationMessage(
      'Git Vertex: sequence.editor and core.editor removed — git falls back to its own editor.')
    return
  }
  try {
    execSync('code --version', { stdio: 'ignore' })
  } catch {
    vscode.window.showErrorMessage(
      'The "code" command is not on your PATH. Install it from the palette: "Shell Command: Install \'code\' command in PATH".')
    return
  }
  execSync('git config --global sequence.editor "code --wait"')
  execSync('git config --global core.editor "code --wait"')
  vscode.window.showInformationMessage(
    'Interactive rebases (planning, reword, squash) will now open in the Git Vertex editor.')
}

// ── Rebase detection → auto-open the rebase tab ────────────────
// Watches .git/rebase-merge + .git/rebase-apply so a rebase started ANYWHERE
// (Git Vertex UI, integrated terminal, external CLI) pops the rebase tab,
// Opens once per rebase; closing the tab doesn't re-open it.
let rebaseWatcher: vscode.FileSystemWatcher | null = null
let rebaseDebounce: NodeJS.Timeout | null = null
let rebaseTabAutoOpened = false

// One-time suggestion (on the first detected rebase) to route interactive
// rebase todos into the Git Vertex custom editor.
function maybeSuggestSequenceEditor(context: vscode.ExtensionContext): void {
  if (context.globalState.get<boolean>('gvSeqEditorPrompted')) return
  let current = ''
  try {
    current = execSync('git config --global sequence.editor', {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch { /* not set */ }
  if (current) return
  void context.globalState.update('gvSeqEditorPrompted', true)
  vscode.window.showInformationMessage(
    'Open the next "git rebase -i" in the visual Git Vertex editor?',
    'Enable',
  ).then(a => { if (a === 'Enable') void toggleSequenceEditor() })
}

function rebaseInProgress(gitDir: string): boolean {
  return fs.existsSync(path.join(gitDir, 'rebase-merge'))
    || fs.existsSync(path.join(gitDir, 'rebase-apply'))
}

function setupRebaseWatch(context: vscode.ExtensionContext, repoRoot: string): void {
  rebaseWatcher?.dispose()
  rebaseWatcher = null
  const gitDir = getGitDir(repoRoot)
  if (!gitDir) return

  const check = (): void => {
    if (rebaseDebounce) clearTimeout(rebaseDebounce)
    rebaseDebounce = setTimeout(() => {
      if (!rebaseInProgress(gitDir)) { rebaseTabAutoOpened = false; return }
      // The git-rebase-todo custom editor is still open for this repo — the
      // rebase hasn't actually resumed yet (git is blocked waiting on
      // `code --wait`), so opening/revealing now would just be a redundant
      // request for the same tab that's about to exist anyway.
      if (isRebaseTodoEditorOpenFor(repoRoot)) return
      const cfg = vscode.workspace.getConfiguration('gitVertex')
      if (!cfg.get<boolean>('autoOpenRebaseTab', true)) return

      // An interactive (merge-backend) rebase has a real git-rebase-todo file
      // — open/reveal THAT (RebaseTodoEditor picks the tracker view for it
      // once something's been applied) so there's one tab, backed by the
      // actual file, instead of a second ad-hoc panel. Deliberately NOT
      // gated by rebaseTabAutoOpened: "Lancer" closes this same tab (git
      // resumes), and if it immediately re-pauses on a new conflict, that's
      // a fresh, distinct reason to reopen it — not a repeat of the same
      // auto-open the one-shot guard exists to avoid re-nagging about.
      const todoPath = path.join(gitDir, 'rebase-merge', 'git-rebase-todo')
      if (fs.existsSync(todoPath)) {
        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(todoPath), { preview: false, preserveFocus: true })
      } else if (!rebaseTabAutoOpened) {
        // Non-interactive (rebase-apply, no todo file) — ad-hoc panel with
        // no file identity of its own, so the one-shot guard still applies:
        // a user who dismisses it isn't nagged again for the same pause.
        rebaseTabAutoOpened = true
        openGitVertexRebaseTab(context.extensionUri, context.globalState, repoRoot, { preserveFocus: true })
      }
      maybeSuggestSequenceEditor(context)
    }, 300)
  }

  rebaseWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(gitDir, '{rebase-merge,rebase-apply,rebase-merge/**,rebase-apply/**}')
  )
  // onDidChange too — a LATER conflict within an already-existing
  // rebase-merge dir (e.g. after --continue moves past one step into
  // another) only modifies files already there (done, git-rebase-todo,
  // stopped-sha), it doesn't necessarily create/delete anything.
  rebaseWatcher.onDidCreate(check)
  rebaseWatcher.onDidChange(check)
  rebaseWatcher.onDidDelete(check)
  context.subscriptions.push(rebaseWatcher)
  setOnRebaseTodoEditorClosed(check)

  // A rebase may already be paused when VS Code starts / the repo changes.
  check()
}

// ── Activation ────────────────────────────────────────────────
// Open the changelog the first time a new version runs (like VS Code's own
// release-notes tab). A fresh install just records the version, no tab.
// Said once per install, then never again. The conflict prediction fails open on
// an older git — the operation just proceeds without its warning — so without
// this the user has a feature they believe in and never see run.
// The desktop app has to recover the login shell's PATH itself (see
// src/main/git-binary.ts) because Electron launched from the Finder does not
// inherit it. Here it does: VS Code resolves the shell environment for the
// extension host, so `git` is the same one the user's terminal finds — nothing
// to correct. What was missing is the same thing that made the desktop notice
// unactionable: WHICH git. On a machine with Apple's 2.39 and a newer Homebrew
// build, a version number alone points you at the wrong one.
async function notifyIfGitTooOld(context: vscode.ExtensionContext): Promise<void> {
  if (context.globalState.get<boolean>('gvGitVersionNoticed')) return
  try {
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const exec = promisify(execFile)
    const { stdout } = await exec('git', ['--version'], { env: gitEnv() })
    const version = parseGitVersion(stdout)
    // An unreadable version is not a reason to nag.
    if (!version || isGitVersionAtLeast(version, MIN_GIT_FOR_CONFLICT_PREDICTION)) return
    const where = process.platform === 'win32' ? ['where', ['git.exe']] : ['/usr/bin/which', ['git']]
    const path = await exec(where[0] as string, where[1] as string[], { env: gitEnv() })
      .then(r => r.stdout.split(/\r?\n/).map(l => l.trim()).find(Boolean) ?? null)
      .catch(() => null)
    await context.globalState.update('gvGitVersionNoticed', true)
    void vscode.window.showWarningMessage(
      `Git Vertex: git ${version} detected${path ? ` (${path})` : ''} — predicting conflicts before ` +
      `a merge or rebase needs git ${MIN_GIT_FOR_CONFLICT_PREDICTION} or newer. Everything else works; ` +
      `update git to enable it.`,
    )
  } catch { /* no git on PATH, or it would not run — nothing useful to say */ }
}

/**
 * The note to show for a version: its own, or the newest one we ship when that
 * exact version has none — a patch released without its own entry would
 * otherwise say nothing at all. `Unreleased` is never the fallback: it is what
 * the working copy carries between releases, not something a user runs.
 */
function noteFor(version: string): { version: string; notes: string } | null {
  if (RELEASE_NOTES[version]) return { version, notes: RELEASE_NOTES[version] }
  const newest = Object.keys(RELEASE_NOTES)
    .filter(v => v !== 'Unreleased')
    .sort((a, b) => {
      const pa = a.split('.').map(Number), pb = b.split('.').map(Number)
      for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pb[i] || 0) - (pa[i] || 0)
      return 0
    })[0]
  return newest ? { version: newest, notes: RELEASE_NOTES[newest] } : null
}

/**
 * Show what changed, the first time a new version runs. A fresh install just
 * records the version and says nothing — there is no "new" on day one.
 *
 * Until now this opened CHANGELOG.md in a markdown preview: the whole file,
 * every version, in Added/Changed/Fixed sections written for whoever reads the
 * repository. It now opens the curated note for this version alone, in the same
 * component the desktop app has always used for it.
 */
async function showWhatsNewIfUpdated(context: vscode.ExtensionContext): Promise<void> {
  const current = (context.extension?.packageJSON?.version as string | undefined) ?? ''
  if (!current) return
  const last = context.globalState.get<string>('gvLastVersion')
  await context.globalState.update('gvLastVersion', current)
  if (!last || last === current) return
  const note = noteFor(current)
  if (!note) return
  openGitVertexWhatsNewTab(context.extensionUri, context.globalState, note.version, note.notes)
}

export function activate(context: vscode.ExtensionContext): void {
  statusBar = new GitVertexStatusBar('gitVertex.open')

  // Where installed themes live. Global rather than per-workspace: a palette is
  // a property of the person, not of the repository they happen to have open.
  setThemeStorageDir(context.globalStorageUri.fsPath)

  // Where an authorization redirect lands. Registered at activation because a
  // callback can arrive before anything else has been opened — the browser
  // decides when, not us. Paired with the `onUri` activation event, without
  // which VS Code would not wake the extension to receive it at all.
  registerAuthCallback(context)

  void showWhatsNewIfUpdated(context)
  void notifyIfGitTooOld(context)

  // Create the WebviewViewProvider for the bottom panel
  const provider = new GitVertexViewProvider(context.extensionUri, context.globalState)

  // Register the provider (panel view)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      GitVertexViewProvider.viewType,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  )

  // Inline blame annotations + Git CodeLens (they share one blame cache).
  /**
   * Diff the line under the cursor against the revision before the one that
   * wrote it, or against the file as it stands.
   *
   * `git blame -L n,n` for one line, then VS Code's own diff editor over the
   * `gitvertex:` scheme — the same pair of documents the panel opens, so a
   * revision is read through the one provider that knows how.
   */
  const diffLine = async (against: 'previous' | 'working'): Promise<void> => {
    const editor = vscode.window.activeTextEditor
    if (!editor || editor.document.uri.scheme !== 'file') {
      vscode.window.showWarningMessage('Open a file to compare one of its lines.')
      return
    }
    const root = getRepoRootForFile(editor.document.uri.fsPath)
    if (!root) { vscode.window.showWarningMessage('This file is not inside a Git repository.'); return }
    const rel = path.relative(root, editor.document.uri.fsPath).split(path.sep).join('/')
    const line = editor.selection.active.line + 1

    const [blamed] = await blameFile(root, rel, { line })
    if (!blamed) { vscode.window.showWarningMessage('Git has no history for this line.'); return }
    if (blamed.uncommitted) {
      // The line is not in any commit yet: there is no "previous revision" of
      // it, and comparing it to the working tree compares it to itself.
      vscode.window.showInformationMessage('This line is not committed yet.')
      return
    }

    ensureDiffProvider(new GitService(root))
    const name = path.basename(rel)
    if (against === 'previous') {
      await vscode.commands.executeCommand('vscode.diff',
        refUri(`${blamed.hash}~1`, rel), refUri(blamed.hash, rel),
        `${name} (${blamed.shortHash})`)
    } else {
      await vscode.commands.executeCommand('vscode.diff',
        refUri(blamed.hash, rel), editor.document.uri,
        `${name} (${blamed.shortHash} ↔ Working Tree)`)
    }
  }

  const blame = new InlineBlameController()
  const codeLens = new BlameCodeLensProvider(blame)
  context.subscriptions.push(
    blame,
    codeLens,
    vscode.languages.registerCodeLensProvider({ scheme: 'file' }, codeLens),
  )

  // Resolve initial repo and inject into provider
  const repoRoot = resolveRepoRoot()
  if (repoRoot) {
    provider.setRepo(repoRoot)
    setupRebaseWatch(context, repoRoot)
    blame.watch(repoRoot)
  }

  // Initial refresh
  refreshStatusBar()

  // Re-read on file saves, editor changes, workspace changes
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => scheduleRefresh()),
    vscode.window.onDidChangeActiveTextEditor(() => scheduleRefresh(500)),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      refreshStatusBar()
      const root = resolveRepoRoot()
      if (root) { provider.setRepo(root); setEditorRepo(root); setupRebaseWatch(context, root); blame.watch(root) }
    }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('gitVertex')) refreshStatusBar()
    }),
  )

  // Periodic refresh every 30s to pick up remote tracking changes
  const periodicTimer = setInterval(refreshStatusBar, 30_000)
  context.subscriptions.push({ dispose: () => clearInterval(periodicTimer) })

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('gitVertex.open', () => openInGitVertex()),
    vscode.commands.registerCommand('gitVertex.openFile', (uri?: vscode.Uri) => openInGitVertex(uri)),
    vscode.commands.registerCommand('gitVertex.configure', () => configure()),
    vscode.commands.registerCommand('gitVertex.openPanel', () => {
      vscode.commands.executeCommand('gitVertex.graphView.focus')
    }),
    // Open Git Vertex as a movable/splittable editor tab (reuses the same UI).
    vscode.commands.registerCommand('gitVertex.openInEditor', () => {
      openGitVertexEditor(context.extensionUri, context.globalState, resolveRepoRoot() ?? undefined)
    }),
    // Open the rebase tab manually (it auto-opens when a rebase is detected).
    vscode.commands.registerCommand('gitVertex.openRebaseTab', () => {
      const root = resolveRepoRoot()
      if (!root) { vscode.window.showWarningMessage('No Git repository found for this workspace.'); return }
      openGitVertexRebaseTab(context.extensionUri, context.globalState, root)
    }),
    // Route `git rebase -i` todo files into the visual editor (toggle).
    vscode.commands.registerCommand('gitVertex.enableRebaseEditor', () => toggleSequenceEditor()),
    // Re-read the notes on demand. Without this the only way to see them is to
    // be updating at that moment — and the tab is closable.
    vscode.commands.registerCommand('gitVertex.showWhatsNew', () => {
      const current = (context.extension?.packageJSON?.version as string | undefined) ?? ''
      const note = noteFor(current)
      if (!note) { vscode.window.showInformationMessage('Git Vertex: no release notes shipped with this build.'); return }
      openGitVertexWhatsNewTab(context.extensionUri, context.globalState, note.version, note.notes)
    }),
    // "Share a link to these lines" — the gesture this lot is named after.
    vscode.commands.registerCommand('gitVertex.copyRemoteFileUrl', () =>
      runFileLinkCommand(() => resolveRepoRoot() ?? undefined, { withRange: true, action: 'copy' })),
    vscode.commands.registerCommand('gitVertex.copyRemoteFileUrlNoRange', () =>
      runFileLinkCommand(() => resolveRepoRoot() ?? undefined, { withRange: false, action: 'copy' })),
    vscode.commands.registerCommand('gitVertex.openFileOnRemote', () =>
      runFileLinkCommand(() => resolveRepoRoot() ?? undefined, { withRange: true, action: 'open' })),
    vscode.commands.registerCommand('gitVertex.setGithubToken', async () => {
      const token = await vscode.window.showInputBox({
        prompt: 'GitHub Personal Access Token (repo scope) — leave empty to clear',
        password: true,
        ignoreFocusOut: true,
      })
      if (token === undefined) return
      const all = context.globalState.get<Record<string, string>>('gvSettings', {})
      all.githubToken = token
      await context.globalState.update('gvSettings', all)
      vscode.window.showInformationMessage(token ? 'GitHub token saved.' : 'GitHub token cleared.')
    }),
    // Compare two refs (branches/tags) in a tab; refs are picked in the tab.
    vscode.commands.registerCommand('gitVertex.compare', () => {
      const root = resolveRepoRoot()
      if (!root) { vscode.window.showWarningMessage('No Git repository found for this workspace.'); return }
      openGitVertexCompareTab(context.extensionUri, context.globalState, root)
    }),
    // Toggle the end-of-line blame annotation on the cursor's line.
    vscode.commands.registerCommand('gitVertex.toggleLineBlame', () => blame.toggleLineBlame()),
    // Annotate every line of the active file (with the age heatmap).
    vscode.commands.registerCommand('gitVertex.toggleFileBlame', () => blame.toggleFileBlame()),
    vscode.commands.registerCommand('gitVertex.clearFileBlame', () => blame.clearFileBlame()),
    vscode.commands.registerCommand('gitVertex.nextChange', () => blame.goToChange('next')),
    vscode.commands.registerCommand('gitVertex.previousChange', () => blame.goToChange('previous')),
    vscode.commands.registerCommand('gitVertex.toggleCodeLens', () => codeLens.toggle()),
    // Invoked from the blame hover, never from the palette.
    // The blame knows which commit wrote the line under the cursor; these two
    // are the jump from there to what that commit actually did. Reaching for
    // them from an editor is the point, so they resolve the line themselves
    // rather than depending on the annotations being switched on.
    vscode.commands.registerCommand('gitVertex.diffLineWithPrevious', () => diffLine('previous')),
    vscode.commands.registerCommand('gitVertex.diffLineWithWorking', () => diffLine('working')),
    vscode.commands.registerCommand('gitVertex.blame.copyHash', async (hash?: string) => {
      if (!hash) return
      await vscode.env.clipboard.writeText(hash)
      vscode.window.setStatusBarMessage(`Git Vertex: copied ${hash.slice(0, 8)}`, 2000)
    }),
    // File history / blame tab for the given (or active) file. The uri arrives
    // as a string when the blame hover's command link invokes it.
    vscode.commands.registerCommand('gitVertex.fileHistory', (uri?: vscode.Uri | string) => {
      const given = typeof uri === 'string' ? vscode.Uri.parse(uri) : uri
      const target = given ?? vscode.window.activeTextEditor?.document.uri
      if (!target || target.scheme !== 'file') {
        vscode.window.showWarningMessage('Open a file to see its history.')
        return
      }
      const root = getRepoRootForFile(target.fsPath)
      if (!root) { vscode.window.showWarningMessage('This file is not inside a Git repository.'); return }
      const rel = path.relative(root, target.fsPath).split(path.sep).join('/')
      openGitVertexFileHistoryTab(context.extensionUri, context.globalState, root, rel)
    }),
  )

  // Commit right-click menu — native VS Code webview context menu instead of
  // an HTML popup (see contributes.menus["webview/context"] in package.json).
  // A webview is an iframe strictly clipped to its own rectangle, so the old
  // in-webview HTML menu (now ~24 entries) could never render past the short
  // bottom panel; showQuickPick isn't a real context menu either. The native
  // one is drawn by VS Code itself, appears at the click position, and floats
  // above the whole window regardless of panel/tab size — exactly like
  // a native commit menu. Each command receives the row's
  // data-vscode-context object (set in CommitGraph.tsx) as its argument and
  // just relays the chosen action + hash to the graph webview, which handles
  // it with the exact same functions the old HTML menu called.
  const COMMIT_MENU_ACTIONS = [
    'switchTo', 'createBranch', 'createTag', 'createWorktree', 'modifyFromHere', 'reword',
    'cherryPick', 'revert', 'drop', 'moveUp', 'moveDown', 'rebaseOnto',
    'resetSoft', 'resetMixed', 'resetHard', 'pushToCommit',
    'copyShortHash', 'copyFullHash', 'copyMessage', 'createPatch', 'copyPatch', 'openOnRemote',
    'compareWorking', 'selectForCompare', 'compareWithSelected',
  ] as const

  for (const action of COMMIT_MENU_ACTIONS) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`gitVertex.commitMenu.${action}`, (arg?: { commitHash?: string }) => {
        const hash = arg?.commitHash ?? lastCommitMenuHash
        if (hash) postCommitMenuAction(action, hash)
      })
    )
  }

  // Custom editor for git-rebase-todo files (interactive rebase planner).
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      RebaseTodoEditor.viewType,
      new RebaseTodoEditor(context.extensionUri, context.globalState),
      { webviewOptions: { retainContextWhenHidden: true } },
    )
  )

  // Custom editor for conflicted working-tree files — "option" priority (see
  // package.json), so it stays inert until Git Vertex explicitly opens it on
  // an already-detected conflict.
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      ConflictEditor.viewType,
      new ConflictEditor(context.extensionUri, context.globalState),
      { webviewOptions: { retainContextWhenHidden: true } },
    )
  )

  // Custom editor for COMMIT_EDITMSG (reword/squash during an interactive
  // rebase, plain commits, merges, tags — whatever invokes core.editor).
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      CommitMsgEditor.viewType,
      new CommitMsgEditor(context.extensionUri),
      { webviewOptions: { retainContextWhenHidden: true } },
    )
  )

  context.subscriptions.push(statusBar)
}

export function deactivate(): void {
  if (refreshTimer) clearTimeout(refreshTimer)
  statusBar?.dispose()
}
