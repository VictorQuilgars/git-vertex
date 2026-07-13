import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { findAppPath, launchApp } from './appLocator'
import { GitVertexStatusBar } from './statusBar'
import { getGitInfo, getGitDir, getRepoRootForFile } from './gitInfo'
import { GitVertexViewProvider } from './panel/GitVertexViewProvider'
import { openGitVertexEditor, setEditorRepo, openGitVertexRebaseTab, openGitVertexFileHistoryTab, openGitVertexCompareTab, openGitVertexGitHubTab, postCommitMenuAction, lastCommitMenuHash } from './panel/GitVertexHost'
import { RebaseTodoEditor, isRebaseTodoEditorOpenFor, setOnRebaseTodoEditorClosed } from './panel/RebaseTodoEditor'
import { ConflictEditor } from './panel/ConflictEditor'
import { CommitMsgEditor } from './panel/CommitMsgEditor'
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
      'Git Vertex : sequence.editor et core.editor retirés — git réutilise son éditeur par défaut.')
    return
  }
  try {
    execSync('code --version', { stdio: 'ignore' })
  } catch {
    vscode.window.showErrorMessage(
      'La commande "code" est introuvable dans le PATH. Installez-la via la palette : « Shell Command: Install \'code\' command in PATH ».')
    return
  }
  execSync('git config --global sequence.editor "code --wait"')
  execSync('git config --global core.editor "code --wait"')
  vscode.window.showInformationMessage(
    'Les rebases interactifs (planification, reword, squash) s\'ouvriront maintenant dans l\'éditeur Git Vertex.')
}

// ── Rebase detection → auto-open the rebase tab ────────────────
// Watches .git/rebase-merge + .git/rebase-apply so a rebase started ANYWHERE
// (Git Vertex UI, integrated terminal, external CLI) pops the rebase tab,
// GitLens-style. Opens once per rebase; closing the tab doesn't re-open it.
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
    'Ouvrir les prochains « git rebase -i » dans l\'éditeur visuel Git Vertex ?',
    'Activer',
  ).then(a => { if (a === 'Activer') void toggleSequenceEditor() })
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
export function activate(context: vscode.ExtensionContext): void {
  statusBar = new GitVertexStatusBar('gitVertex.open')

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

  // Resolve initial repo and inject into provider
  const repoRoot = resolveRepoRoot()
  if (repoRoot) {
    provider.setRepo(repoRoot)
    setupRebaseWatch(context, repoRoot)
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
      if (root) { provider.setRepo(root); setEditorRepo(root); setupRebaseWatch(context, root) }
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
    // GitHub PRs & issues tab (needs a PAT — gitVertex.setGithubToken).
    vscode.commands.registerCommand('gitVertex.openGitHub', () => {
      const root = resolveRepoRoot()
      if (!root) { vscode.window.showWarningMessage('No Git repository found for this workspace.'); return }
      openGitVertexGitHubTab(context.extensionUri, context.globalState, root)
    }),
    vscode.commands.registerCommand('gitVertex.setGithubToken', async () => {
      const token = await vscode.window.showInputBox({
        prompt: 'GitHub Personal Access Token (repo scope) — laissez vide pour effacer',
        password: true,
        ignoreFocusOut: true,
      })
      if (token === undefined) return
      const all = context.globalState.get<Record<string, string>>('gvSettings', {})
      all.githubToken = token
      await context.globalState.update('gvSettings', all)
      vscode.window.showInformationMessage(token ? 'Token GitHub enregistré.' : 'Token GitHub effacé.')
    }),
    // Compare two refs (branches/tags) in a tab; refs are picked in the tab.
    vscode.commands.registerCommand('gitVertex.compare', () => {
      const root = resolveRepoRoot()
      if (!root) { vscode.window.showWarningMessage('No Git repository found for this workspace.'); return }
      openGitVertexCompareTab(context.extensionUri, context.globalState, root)
    }),
    // File history / blame tab for the given (or active) file.
    vscode.commands.registerCommand('gitVertex.fileHistory', (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri
      if (!target || target.scheme !== 'file') {
        vscode.window.showWarningMessage('Ouvrez un fichier pour afficher son historique.')
        return
      }
      const root = getRepoRootForFile(target.fsPath)
      if (!root) { vscode.window.showWarningMessage('Ce fichier n\'est pas dans un dépôt Git.'); return }
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
  // GitLens's own commit menu. Each command receives the row's
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
