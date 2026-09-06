import { contextBridge, ipcRenderer, webFrame } from 'electron'

// Register an IPC event listener and hand back an unsubscribe function. Callers
// (React effects) must call it on cleanup — otherwise the wrapper listeners pile
// up on ipcRenderer (MaxListenersExceededWarning) and leak across re-renders.
// Which repository a call is about. The renderer sets the current one when the
// active tab changes; a session(path) binds a call to another one explicitly,
// for a tab that is not shown. Both ride in an envelope in front of every
// call's arguments; the main process (ipc/handle.ts) takes it off and answers
// with that repository's service. Read at call time: what is current when the
// call is made is what the request is about, whatever the tab does afterwards.
let currentRepo: string | null = null
let boundRepo: string | null | undefined
const invoke = (channel: string, ...args: unknown[]) =>
  ipcRenderer.invoke(channel, { repo: boundRepo !== undefined ? boundRepo : currentRepo }, ...args)

function subscribe(channel: string, cb: (...args: any[]) => void): () => void {
  const listener = (_e: unknown, ...args: any[]) => cb(...args)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const gitAPI = {
  // Zoom (renderer webFrame)
  zoomGet: () => webFrame.getZoomFactor(),
  zoomSet: (factor: number) => { webFrame.setZoomFactor(factor); return webFrame.getZoomFactor() },
  // Repo management
  openRepo: () => invoke('git:open-repo'),
  setRepo: (path: string) => invoke('git:set-repo', path),
  initRepo: (dir: string) => invoke('git:init-repo', dir),
  initAdvanced: (opts: any) => invoke('git:init-advanced', opts),
  listGitignoreTemplates: () => invoke('github:list-gitignore-templates'),
  listLicenses: () => invoke('github:list-licenses'),
  githubCreateRepo: (opts: any) => invoke('github:create-repo', opts),
  getRecentRepos: () => invoke('app:get-recent-repos'),
  getGitCapabilities: () => invoke('app:git-capabilities'),
  resolveGitBinary: (explicitPath?: string) => invoke('app:resolve-git-binary', explicitPath),
  getWorkspaces: () => invoke('app:get-workspaces'),
  setRepoWorkspace: (path: string, workspace: string) => invoke('app:set-repo-workspace', path, workspace),
  removeRecentRepo: (path: string) => invoke('app:remove-recent-repo', path),
  // Deep links (gitgui://open — e.g. from the MCP server's open_in_git_vertex)
  getPendingDeepLink: () => invoke('app:get-pending-deeplink'),
  onDeepLink: (cb: (link: { repo: string; view: string; file?: string; hash?: string }) => void) =>
    subscribe('deeplink:open', (link) => cb(link)),
  // Read
  getLog: (options?: { maxCount?: number; all?: boolean; refs?: string[]; excludes?: string[] }) => invoke('git:get-log', options),
  getBranches: () => invoke('git:get-branches'),
  getDiff: (commitHash: string) => invoke('git:get-diff', commitHash),
  getCommitFiles: (commitHash: string) => invoke('git:get-commit-files', commitHash),
  getCommitBody: (hash: string) => invoke('git:get-commit-body', hash),
  getStatus: () => invoke('git:get-status'),
  getTracking: () => invoke('git:get-tracking'),
  getStashes: () => invoke('git:get-stashes'),
  // Write
  checkout: (ref: string) => invoke('git:checkout', ref),
  createBranch: (name: string) => invoke('git:create-branch', name),
  deleteBranch: (name: string) => invoke('git:delete-branch', name),
  getUpstream: () => invoke('git:get-upstream'),
  fetch: () => invoke('git:fetch'),
  push: () => invoke('git:push'),
  pushTo: (remote: string, branch: string, setUpstream: boolean, force?: boolean) => invoke('git:push-to', remote, branch, setUpstream, force),
  pull: (mode?: 'ff' | 'ff-only' | 'rebase') => invoke('git:pull', mode),
  // Staging & commit
  getWorkingChanges: () => invoke('git:get-working-changes'),
  getLastCommitMessage: (ref?: string) => invoke('git:get-last-commit-message', ref),
  getWorkingFileDiff: (filepath: string, staged: boolean, context?: number) => invoke('git:get-working-file-diff', filepath, staged, context),
  stage: (files: string[]) => invoke('git:stage', files),
  stageAll: () => invoke('git:stage-all'),
  unstage: (files: string[]) => invoke('git:unstage', files),
  commit: (message: string, amend?: boolean) => invoke('git:commit', message, amend),
  discardFile: (file: string) => invoke('git:discard-file', file),
  // Commit operations
  cherryPick: (hash: string) => invoke('git:cherry-pick', hash),
  revert: (hash: string) => invoke('git:revert', hash),
  reset: (hash: string, mode: 'soft' | 'mixed' | 'hard') => invoke('git:reset', hash, mode),
  amendMessage: (message: string) => invoke('git:amend-message', message),
  getRewordPlan: (hash: string) => invoke('git:get-reword-plan', hash),
  getCheckoutPlan: (ref: string) => invoke('git:get-checkout-plan', ref),
  checkoutTracking: (remoteRef: string, localName: string) =>
    invoke('git:checkout-tracking', remoteRef, localName),
  dropCommit: (hash: string) => invoke('git:drop-commit', hash),
  dropCommits: (hashes: string[]) => invoke('git:drop-commits', hashes),
  moveCommit: (hash: string, direction: 'up' | 'down') => invoke('git:move-commit', hash, direction),
  diffCommitToWorking: (hash: string) => invoke('git:diff-commit-to-working', hash),
  diffBetweenCommits: (fromHash: string, toHash: string | null, axis?: 'diverged' | 'endpoints') =>
    invoke('git:diff-between-commits', fromHash, toHash, axis),
  filesBetweenCommits: (fromHash: string, toHash: string | null, axis?: 'diverged' | 'endpoints') =>
    invoke('git:files-between-commits', fromHash, toHash, axis),
  getMergeBase: (a: string, b: string) => invoke('git:get-merge-base', a, b),
  // Branch operations
  createBranchAt: (name: string, hash: string, checkout: boolean) => invoke('git:create-branch-at', name, hash, checkout),
  renameBranch: (oldName: string, newName: string) => invoke('git:rename-branch', oldName, newName),
  merge: (branch: string) => invoke('git:merge', branch),
  fastForwardToUpstream: () => invoke('git:fast-forward-upstream'),
  conflictOutlook: (branch?: string) => invoke('git:conflict-outlook', branch),
  predictConflicts: (theirs: string, ours?: string, mergeBase?: string) =>
    invoke('git:predict-conflicts', theirs, ours, mergeBase),
  predictRebaseConflicts: (upstream: string, branch?: string) =>
    invoke('git:predict-rebase-conflicts', upstream, branch),
  rebaseOnto: (branch: string) => invoke('git:rebase-onto', branch),
  pushBranch: (branch: string) => invoke('git:push-branch', branch),
  pushToCommit: (hash: string) => invoke('git:push-to-commit', hash),
  createPatch: (hash: string) => invoke('git:create-patch', hash),
  savePatchFile: (content: string, suggestedName: string) => invoke('dialog:save-patch', content, suggestedName),
  deleteRemoteBranch: (branch: string) => invoke('git:delete-remote-branch', branch),
  setUpstream: (branch: string, upstream?: string) => invoke('git:set-upstream', branch, upstream),
  moveBranchTo: (branch: string, hash: string) => invoke('git:move-branch-to', branch, hash),
  rebaseBranchOnto: (branch: string, hash: string) => invoke('git:rebase-branch-onto', branch, hash),
  mergeCommitInto: (branch: string, hash: string) => invoke('git:merge-commit-into', branch, hash),
  // Tag operations
  getTags: () => invoke('git:get-tags'),
  createTag: (name: string, hash?: string, message?: string) => invoke('git:create-tag', name, hash, message),
  deleteTag: (name: string) => invoke('git:delete-tag', name),
  pushTag: (name: string, remote?: string) => invoke('git:push-tag', name, remote),
  deleteRemoteTag: (name: string, remote?: string) => invoke('git:delete-remote-tag', name, remote),
  // Stash operations
  createStash: (message?: string, opts?: { scope?: 'all' | 'staged' | 'unstaged'; paths?: string[] }) =>
    invoke('git:create-stash', message, opts),
  renameStash: (index: number, message: string) => invoke('git:rename-stash', index, message),
  applyStash: (index: number) => invoke('git:apply-stash', index),
  popStash: (index: number) => invoke('git:pop-stash', index),
  stashDiff: (index: number) => invoke('git:stash-diff', index),
  dropStash: (index: number) => invoke('git:drop-stash', index),
  // Blame
  getBlame: (hash: string, filepath: string) => invoke('git:get-blame', hash, filepath),
  // Submodules
  getSubmodules: () => invoke('git:get-submodules'),
  initSubmodule: (path: string) => invoke('git:init-submodule', path),
  updateSubmodule: (path: string) => invoke('git:update-submodule', path),
  // Extended search & branch comparison
  searchInDiffs: (query: string) => invoke('git:search-in-diffs', query),
  locateInHistory: (hashes: string[], options?: { all?: boolean; refs?: string[]; excludes?: string[] }) => invoke('git:locate-in-history', hashes, options),
  compareBranches: (current: string, other: string) => invoke('git:compare-branches', current, other),
  // Interactive Rebase
  getRebaseSequence: (baseHash: string) => invoke('git:get-rebase-sequence', baseHash),
  interactiveRebase: (sequence: { action: string; hash: string }[], messages?: string[]) =>
    invoke('git:interactive-rebase', sequence, messages),
  // Conflict resolution
  getConflictedFiles: () => invoke('git:get-conflicted-files'),
  getConflictVersions: (filepath: string) => invoke('git:get-conflict-versions', filepath),
  getFileContent: (filepath: string) => invoke('git:get-file-content', filepath),
  getFileAtCommit: (commitHash: string, filepath: string) => invoke('git:get-file-at-commit', commitHash, filepath),
  restoreFileFromCommit: (commitHash: string, paths: string[]) => invoke('git:restore-file', commitHash, paths),
  applyPatch: (patch: string, reverse: boolean) => invoke('git:apply-patch', patch, reverse),
  markResolved: (filepath: string) => invoke('git:mark-resolved', filepath),
  resolveConflict: (filepath: string, content: string) => invoke('git:resolve-conflict', filepath, content),
  resolveConflictSide: (filepath: string, side: 'ours' | 'theirs') => invoke('git:resolve-conflict-side', filepath, side),
  continueRebase: (messages?: string[]) => invoke('git:continue-rebase', messages),
  continueMerge: (message?: string) => invoke('git:continue-merge', message),
  abortRebase: () => invoke('git:abort-rebase'),
  continueCherryPick: () => invoke('git:continue-cherry-pick'),
  abortCherryPick: () => invoke('git:abort-cherry-pick'),
  continueRevert: () => invoke('git:continue-revert'),
  abortRevert: () => invoke('git:abort-revert'),
  undoLastAction: () => invoke('git:undo-last-action'),
  redoLastAction: () => invoke('git:redo-last-action'),
  abortMerge: () => invoke('git:abort-merge'),
  getConflictMode: () => invoke('git:get-conflict-mode'),
  getConflictSides: () => invoke('git:get-conflict-sides'),
  getMergeMessage: () => invoke('git:get-merge-message'),
  // AI
  aiGetApiKey: () => invoke('ai:get-api-key'),
  aiSetApiKey: (key: string) => invoke('ai:set-api-key', key),
  aiGenerateCommitMessage: () => invoke('ai:generate-commit-message'),
  aiFilterQuery: (kind: 'prs' | 'issues', described: string, vocabulary: string) =>
    invoke('ai:filter-query', kind, described, vocabulary),
  aiPrDescription: (base: string, head: string) =>
    invoke('ai:generate-pr-description', base, head),
  aiGenerateIssue: (described: string) => invoke('ai:generate-issue', described),
  aiRecomposeCommit: (hash: string) => invoke('ai:recompose-commit', hash),
  aiExplainCommit: (hash: string, force?: boolean, guidance?: string) => invoke('ai:explain-commit', hash, force, guidance),
  aiGetExplanations: () => invoke('ai:get-explanations'),
  aiExplainBranch: (branch: string, guidance?: string) => invoke('ai:explain-branch', branch, guidance),
  aiExplainStash: (index: number | string, guidance?: string) => invoke('ai:explain-stash', index, guidance),
  aiExplainWorking: (guidance?: string) => invoke('ai:explain-working', guidance),
  aiChangelogState: (branch: string, scope?: string) => invoke('ai:changelog-state', branch, scope),
  aiChangelogList: () => invoke('ai:changelog-list'),
  aiNoteList: () => invoke('ai:note-list'),
  aiForgetNote: (kind: string, key: string) => invoke('ai:forget-note', kind, key),
  aiForgetExplanation: (hash: string) => invoke('ai:forget-explanation', hash),
  aiForgetChangelog: (branch: string) => invoke('ai:forget-changelog', branch),
  aiGenerateChangelog: (branch: string, base?: string, previous?: string, scope?: string) =>
    invoke('ai:generate-changelog', branch, base, previous, scope),
  changelogGetScopePref: () => invoke('changelog:get-scope-pref'),
  changelogSetScopePref: (pref: 'package' | 'branch') => invoke('changelog:set-scope-pref', pref),
  insertChangelog: (entry: string, opts?: { branch?: string; file?: string; section?: string; force?: boolean; preview?: boolean }) =>
    invoke('changelog:insert', entry, opts),
  aiProposeCommitSplit: () => invoke('ai:propose-commit-split'),
  aiResolveConflict: (filepath: string, instruction?: string) => invoke('ai:resolve-conflict', filepath, instruction),
  aiSearchCommits: (query: string) => invoke('ai:search-commits', query),
  aiListModels: () => invoke('ai:list-models'),
  aiListProviderModels: (provider: string, apiKey: string, baseUrl?: string) => invoke('ai:list-provider-models', provider, apiKey, baseUrl),
  // Reflog
  getReflog: () => invoke('git:get-reflog'),
  // File History
  getFileHistory: (filepath: string) => invoke('git:get-file-history', filepath),
  // Remotes
  getRemotes: () => invoke('git:get-remotes'),
  addRemote: (name: string, url: string) => invoke('git:add-remote', name, url),
  removeRemote: (name: string) => invoke('git:remove-remote', name),
  renameRemote: (oldName: string, newName: string) => invoke('git:rename-remote', oldName, newName),
  fetchRemote: (name: string) => invoke('git:fetch-remote', name),
  pruneRemote: (name: string) => invoke('git:prune-remote', name),
  getDefaultRemote: () => invoke('git:get-default-remote'),
  getDefaultBranch: () => invoke('git:get-default-branch'),
  setDefaultRemote: (name: string) => invoke('git:set-default-remote', name),
  getGoneBranches: () => invoke('git:get-gone-branches'),
  pruneGoneBranches: (names: string[]) => invoke('git:prune-gone-branches', names),
  // Gitflow
  gitflowStatus: () => invoke('git:gitflow-status'),
  gitflowInit: () => invoke('git:gitflow-init'),
  gitflowStart: (type: 'feature' | 'release' | 'hotfix', name: string) => invoke('git:gitflow-start', type, name),
  gitflowFinish: (type: 'feature' | 'release' | 'hotfix', name: string, tagName?: string) => invoke('git:gitflow-finish', type, name, tagName),
  // Worktrees
  listWorktrees: () => invoke('git:list-worktrees'),
  addWorktree: (path: string, ref: string, newBranch?: string) => invoke('git:add-worktree', path, ref, newBranch),
  removeWorktree: (path: string, force?: boolean) => invoke('git:remove-worktree', path, force),
  listAgents: () => invoke('agents:list'),
  selectDirectory: (title?: string) => invoke('app:select-directory', title),
  // Settings
  settingsGetAll: () => invoke('settings:get-all'),
  settingsSet: (key: string, value: string) => invoke('settings:set', key, value),
  gitGetGlobalConfig: () => invoke('git:get-global-config'),
  gitSetGlobalConfig: (userName: string, userEmail: string) => invoke('git:set-global-config', userName, userEmail),
  appGetInfo: () => invoke('app:get-info'),
  getWhatsNew: () => invoke('app:get-whats-new'),
  getReleaseNotes: () => invoke('app:get-release-notes'),
  markWhatsNewSeen: () => invoke('app:mark-whats-new-seen'),
  openExternal: (url: string) => invoke('app:open-external', url),
  openInEditor: (filepath: string) => invoke('app:open-in-editor', filepath),
  openTerminal: () => invoke('app:open-terminal'),
  // External diff/merge tools & SSH keys (v1.20.0)
  sshBrowseKey: (kind: 'private' | 'public') => invoke('app:ssh-browse-key', kind),
  sshGenerateKey: (passphrase?: string) => invoke('app:ssh-generate-key', passphrase),
  openExternalDiff: (leftContent: string, rightContent: string, filename: string) =>
    invoke('app:open-external-diff', leftContent, rightContent, filename),
  openExternalMerge: (filepath: string) => invoke('app:open-external-merge', filepath),
  readTempFile: (absPath: string) => invoke('app:read-temp-file', absPath),
  // GitHub
  githubDetectRepo: () => invoke('github:detect-repo'),
  githubDetectRepoAt: (path: string) => invoke('github:detect-repo-at', path),
  githubCreatePR: (owner: string, repo: string, title: string, body: string, head: string, base: string, draft?: boolean) =>
    invoke('github:create-pr', owner, repo, title, body, head, base, draft),
  githubListBranches: (owner: string, repo: string) => invoke('github:list-branches', owner, repo),
  githubRepoParent: (owner: string, repo: string) => invoke('github:repo-parent', owner, repo),
  githubCreateIssue: (owner: string, repo: string, title: string, body: string, labels: string[], assignees: string[]) =>
    invoke('github:create-issue', owner, repo, title, body, labels, assignees),
  githubSharePatch: (hash: string) => invoke('github:share-patch', hash),
  githubListPRs: (owner: string, repo: string) => invoke('github:list-prs', owner, repo),
  githubListIssues: (owner: string, repo: string) => invoke('github:list-issues', owner, repo),
  githubSearchIssues: (q: string, force?: boolean) => invoke('github:search-issues', q, force),
  githubCloseIssue: (owner: string, repo: string, number: number) => invoke('github:close-issue', owner, repo, number),
  githubIssueComments: (owner: string, repo: string, number: number) => invoke('github:issue-comments', owner, repo, number),
  githubAddIssueComment: (owner: string, repo: string, number: number, body: string) => invoke('github:add-issue-comment', owner, repo, number, body),
  githubUpdateIssue: (owner: string, repo: string, number: number, patch: object) => invoke('github:update-issue', owner, repo, number, patch),
  githubListAssignees: (owner: string, repo: string) => invoke('github:list-assignees', owner, repo),
  githubRequestReviewers: (owner: string, repo: string, number: number, reviewers: string[]) =>
    invoke('github:request-reviewers', owner, repo, number, reviewers),
  githubListRepoLabels: (owner: string, repo: string) => invoke('github:list-repo-labels', owner, repo),
  githubCreateLabel: (owner: string, repo: string, name: string, color: string) =>
    invoke('github:create-label', owner, repo, name, color),
  githubGetPR: (owner: string, repo: string, number: number) => invoke('github:get-pr', owner, repo, number),
  githubGetChecks: (owner: string, repo: string, ref: string) => invoke('github:get-checks', owner, repo, ref),
  githubMergePR: (owner: string, repo: string, number: number, method?: string) => invoke('github:merge-pr', owner, repo, number, method),
  githubShareWipPatch: (repoPath: string) => invoke('github:share-wip-patch', repoPath),
  scanLocalRepos: (force?: boolean) => invoke('git:scan-local-repos', force),
  openPathInEditor: (dir: string) => invoke('app:open-path-in-editor', dir),
  readReadme: (dir: string) => invoke('git:read-readme', dir),
  githubGetIssue: (owner: string, repo: string, number: number) =>
    invoke('github:get-issue', owner, repo, number),
  githubListRepos: () => invoke('github:list-repos'),
  githubClone: (cloneUrl: string, repoName: string) => invoke('github:clone', cloneUrl, repoName),
  cloneTo: (opts: any) => invoke('git:clone-to', opts),
  // GitHub OAuth
  githubStartAuth: () => invoke('github:start-auth'),
  githubDisconnect: () => invoke('github:disconnect'),
  githubGetToken: () => invoke('github:get-token'),
  githubGetUser: () => invoke('github:get-user'),
  avatarResolve: (email: string, sha?: string) => invoke('avatar:resolve', email, sha),
  onGithubAuthComplete: (cb: (result: { token?: string; error?: string }) => void) =>
    subscribe('github:auth-complete', (result) => cb(result)),
  // Auto-updater
  // These two used to be an on/off pair that handed `cb` straight to
  // ipcRenderer, and the off half never removed anything: contextBridge builds a
  // NEW proxy for the same function on every crossing, so `removeListener` was
  // given an object `on` had never registered. Every re-render of the effect
  // added a listener and removed none, and the callbacks that fired were an
  // accumulation of stale closures. `subscribe` — right there at the top of this
  // file, and used by every other event — closes over the listener it made.
  // A change names its repository; the plain subscription is about the one shown.
  onRepoChanged: (cb: () => void) => subscribe('git:repo-changed', (p?: { repo?: string }) => { if (!p?.repo || p.repo === currentRepo) cb() }),
  onWorkingChanged: (cb: () => void) => subscribe('git:working-changed', (p?: { repo?: string }) => { if (!p?.repo || p.repo === currentRepo) cb() }),
  /** Every repository's changes, with its path — for the tabs that are not shown. */
  onRepoChangedAny: (cb: (repo: string) => void) => subscribe('git:repo-changed', (p?: { repo?: string }) => cb(p?.repo ?? '')),
  /** The main process's periodic fetch ran — the one timer there is. */
  onAutoFetched: (cb: (r: { repo?: string; success: boolean; error?: string }) => void) => subscribe('git:auto-fetched', cb),
  onUpdateAvailable: (cb: (version: string) => void) => subscribe('updater:update-available', (v) => cb(v)),
  onUpdateDownloaded: (cb: (version: string) => void) => subscribe('updater:update-downloaded', (v) => cb(v)),
  onUpdateError: (cb: (err: string) => void) => subscribe('updater:error', (err) => cb(err)),
  onDownloadProgress: (cb: (pct: number) => void) => subscribe('updater:download-progress', (pct) => cb(pct)),
  downloadUpdate: () => invoke('updater:download'),
  installUpdate: () => invoke('updater:install'),
  checkForUpdates: () => invoke('updater:check'),
  getUpdaterState: () => invoke('updater:get-state'),
  openDownloadedUpdate: () => invoke('updater:open-downloaded'),
  installManual: () => invoke('updater:install-manual'),
  isFullscreen: () => invoke('app:is-fullscreen'),
  onFullscreenChanged: (cb: (fs: boolean) => void) => subscribe('app:fullscreen-changed', (fs) => cb(fs)),
  // Themes beyond the 32 in tokens.css. Implemented in BOTH products, not
  // classified desktop-only: the picker is wanted in the VS Code panel too and
  // the extension host has Node, so GitVertexHost answers these with the same
  // ThemeStore. The renderer never fetches — it is sandboxed and shared.
  themesCatalogue: (opts?: { refresh?: boolean }) => invoke('themes:catalogue', opts),
  themesInstall: (id: string) => invoke('themes:install', id),
  themesRemove: (id: string) => invoke('themes:remove', id),
  themesInstalled: () => invoke('themes:installed'),
  // ── Sessions ─────────────────────────────────────────────────
  /** The repository the window shows: what every plain call is about from now on. */
  setCurrentRepo: (path: string | null) => { currentRepo = path },
  /** The tab that showed this repository closed: the main process drops its session. */
  closeRepo: (path: string) => invoke('app:close-repo', path),
  /** Every method of this API, bound to one repository whether or not it is the one shown. */
  session: (path: string) => sessionFor(path),
}

// The same surface, each call made about `path`. Built once per path: the
// bridge copies an object's own functions, so this cannot be a Proxy, and a
// tab's loader asks for it on every refresh.
const sessionCache = new Map<string, Record<string, unknown>>()
function sessionFor(path: string): Record<string, unknown> {
  const cached = sessionCache.get(path)
  if (cached) return cached
  const bound: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(gitAPI as Record<string, unknown>)) {
    if (typeof value !== 'function') continue
    // A change subscription bound to a path fires for that path only.
    if (name === 'onRepoChanged' || name === 'onWorkingChanged') {
      const channel = name === 'onRepoChanged' ? 'git:repo-changed' : 'git:working-changed'
      bound[name] = (cb: () => void) => subscribe(channel, (p?: { repo?: string }) => { if (p?.repo === path) cb() })
      continue
    }
    if (name === 'session' || name === 'setCurrentRepo') { bound[name] = value; continue }
    bound[name] = (...args: unknown[]) => {
      const previous = boundRepo
      boundRepo = path
      try { return (value as (...a: unknown[]) => unknown)(...args) } finally { boundRepo = previous }
    }
  }
  sessionCache.set(path, bound)
  return bound
}

contextBridge.exposeInMainWorld('gitAPI', gitAPI)
contextBridge.exposeInMainWorld('appInfo', { platform: process.platform })

export type GitAPI = typeof gitAPI
