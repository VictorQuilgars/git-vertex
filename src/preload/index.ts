import { contextBridge, ipcRenderer, webFrame } from 'electron'

// Register an IPC event listener and hand back an unsubscribe function. Callers
// (React effects) must call it on cleanup — otherwise the wrapper listeners pile
// up on ipcRenderer (MaxListenersExceededWarning) and leak across re-renders.
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
  openRepo: () => ipcRenderer.invoke('git:open-repo'),
  setRepo: (path: string) => ipcRenderer.invoke('git:set-repo', path),
  initRepo: (dir: string) => ipcRenderer.invoke('git:init-repo', dir),
  initAdvanced: (opts: any) => ipcRenderer.invoke('git:init-advanced', opts),
  listGitignoreTemplates: () => ipcRenderer.invoke('github:list-gitignore-templates'),
  listLicenses: () => ipcRenderer.invoke('github:list-licenses'),
  githubCreateRepo: (opts: any) => ipcRenderer.invoke('github:create-repo', opts),
  getRecentRepos: () => ipcRenderer.invoke('app:get-recent-repos'),
  getGitCapabilities: () => ipcRenderer.invoke('app:git-capabilities'),
  resolveGitBinary: (explicitPath?: string) => ipcRenderer.invoke('app:resolve-git-binary', explicitPath),
  getWorkspaces: () => ipcRenderer.invoke('app:get-workspaces'),
  setRepoWorkspace: (path: string, workspace: string) => ipcRenderer.invoke('app:set-repo-workspace', path, workspace),
  removeRecentRepo: (path: string) => ipcRenderer.invoke('app:remove-recent-repo', path),
  // Deep links (gitgui://open — e.g. from the MCP server's open_in_git_vertex)
  getPendingDeepLink: () => ipcRenderer.invoke('app:get-pending-deeplink'),
  onDeepLink: (cb: (link: { repo: string; view: string; file?: string; hash?: string }) => void) =>
    subscribe('deeplink:open', (link) => cb(link)),
  // Read
  getLog: (options?: { maxCount?: number; all?: boolean; refs?: string[]; excludes?: string[] }) => ipcRenderer.invoke('git:get-log', options),
  getBranches: () => ipcRenderer.invoke('git:get-branches'),
  getDiff: (commitHash: string) => ipcRenderer.invoke('git:get-diff', commitHash),
  getCommitFiles: (commitHash: string) => ipcRenderer.invoke('git:get-commit-files', commitHash),
  getCommitBody: (hash: string) => ipcRenderer.invoke('git:get-commit-body', hash),
  getStatus: () => ipcRenderer.invoke('git:get-status'),
  getTracking: () => ipcRenderer.invoke('git:get-tracking'),
  getStashes: () => ipcRenderer.invoke('git:get-stashes'),
  // Write
  checkout: (ref: string) => ipcRenderer.invoke('git:checkout', ref),
  createBranch: (name: string) => ipcRenderer.invoke('git:create-branch', name),
  deleteBranch: (name: string) => ipcRenderer.invoke('git:delete-branch', name),
  getUpstream: () => ipcRenderer.invoke('git:get-upstream'),
  fetch: () => ipcRenderer.invoke('git:fetch'),
  push: () => ipcRenderer.invoke('git:push'),
  pushTo: (remote: string, branch: string, setUpstream: boolean, force?: boolean) => ipcRenderer.invoke('git:push-to', remote, branch, setUpstream, force),
  pull: (mode?: 'ff' | 'ff-only' | 'rebase') => ipcRenderer.invoke('git:pull', mode),
  // Staging & commit
  getWorkingChanges: () => ipcRenderer.invoke('git:get-working-changes'),
  getLastCommitMessage: (ref?: string) => ipcRenderer.invoke('git:get-last-commit-message', ref),
  getWorkingFileDiff: (filepath: string, staged: boolean) => ipcRenderer.invoke('git:get-working-file-diff', filepath, staged),
  stage: (files: string[]) => ipcRenderer.invoke('git:stage', files),
  stageAll: () => ipcRenderer.invoke('git:stage-all'),
  unstage: (files: string[]) => ipcRenderer.invoke('git:unstage', files),
  commit: (message: string, amend?: boolean) => ipcRenderer.invoke('git:commit', message, amend),
  discardFile: (file: string) => ipcRenderer.invoke('git:discard-file', file),
  // Commit operations
  cherryPick: (hash: string) => ipcRenderer.invoke('git:cherry-pick', hash),
  revert: (hash: string) => ipcRenderer.invoke('git:revert', hash),
  reset: (hash: string, mode: 'soft' | 'mixed' | 'hard') => ipcRenderer.invoke('git:reset', hash, mode),
  amendMessage: (message: string) => ipcRenderer.invoke('git:amend-message', message),
  getRewordPlan: (hash: string) => ipcRenderer.invoke('git:get-reword-plan', hash),
  getCheckoutPlan: (ref: string) => ipcRenderer.invoke('git:get-checkout-plan', ref),
  checkoutTracking: (remoteRef: string, localName: string) =>
    ipcRenderer.invoke('git:checkout-tracking', remoteRef, localName),
  dropCommit: (hash: string) => ipcRenderer.invoke('git:drop-commit', hash),
  moveCommit: (hash: string, direction: 'up' | 'down') => ipcRenderer.invoke('git:move-commit', hash, direction),
  diffCommitToWorking: (hash: string) => ipcRenderer.invoke('git:diff-commit-to-working', hash),
  diffBetweenCommits: (fromHash: string, toHash: string | null, axis?: 'diverged' | 'endpoints') =>
    ipcRenderer.invoke('git:diff-between-commits', fromHash, toHash, axis),
  filesBetweenCommits: (fromHash: string, toHash: string | null, axis?: 'diverged' | 'endpoints') =>
    ipcRenderer.invoke('git:files-between-commits', fromHash, toHash, axis),
  getMergeBase: (a: string, b: string) => ipcRenderer.invoke('git:get-merge-base', a, b),
  // Branch operations
  createBranchAt: (name: string, hash: string, checkout: boolean) => ipcRenderer.invoke('git:create-branch-at', name, hash, checkout),
  renameBranch: (oldName: string, newName: string) => ipcRenderer.invoke('git:rename-branch', oldName, newName),
  merge: (branch: string) => ipcRenderer.invoke('git:merge', branch),
  fastForwardToUpstream: () => ipcRenderer.invoke('git:fast-forward-upstream'),
  predictConflicts: (theirs: string, ours?: string, mergeBase?: string) =>
    ipcRenderer.invoke('git:predict-conflicts', theirs, ours, mergeBase),
  predictRebaseConflicts: (upstream: string, branch?: string) =>
    ipcRenderer.invoke('git:predict-rebase-conflicts', upstream, branch),
  rebaseOnto: (branch: string) => ipcRenderer.invoke('git:rebase-onto', branch),
  pushBranch: (branch: string) => ipcRenderer.invoke('git:push-branch', branch),
  pushToCommit: (hash: string) => ipcRenderer.invoke('git:push-to-commit', hash),
  createPatch: (hash: string) => ipcRenderer.invoke('git:create-patch', hash),
  savePatchFile: (content: string, suggestedName: string) => ipcRenderer.invoke('dialog:save-patch', content, suggestedName),
  deleteRemoteBranch: (branch: string) => ipcRenderer.invoke('git:delete-remote-branch', branch),
  setUpstream: (branch: string, upstream?: string) => ipcRenderer.invoke('git:set-upstream', branch, upstream),
  moveBranchTo: (branch: string, hash: string) => ipcRenderer.invoke('git:move-branch-to', branch, hash),
  rebaseBranchOnto: (branch: string, hash: string) => ipcRenderer.invoke('git:rebase-branch-onto', branch, hash),
  mergeCommitInto: (branch: string, hash: string) => ipcRenderer.invoke('git:merge-commit-into', branch, hash),
  // Tag operations
  getTags: () => ipcRenderer.invoke('git:get-tags'),
  createTag: (name: string, hash?: string, message?: string) => ipcRenderer.invoke('git:create-tag', name, hash, message),
  deleteTag: (name: string) => ipcRenderer.invoke('git:delete-tag', name),
  pushTag: (name: string, remote?: string) => ipcRenderer.invoke('git:push-tag', name, remote),
  deleteRemoteTag: (name: string, remote?: string) => ipcRenderer.invoke('git:delete-remote-tag', name, remote),
  // Stash operations
  createStash: (message?: string, opts?: { scope?: 'all' | 'staged' | 'unstaged'; paths?: string[] }) =>
    ipcRenderer.invoke('git:create-stash', message, opts),
  renameStash: (index: number, message: string) => ipcRenderer.invoke('git:rename-stash', index, message),
  applyStash: (index: number) => ipcRenderer.invoke('git:apply-stash', index),
  popStash: (index: number) => ipcRenderer.invoke('git:pop-stash', index),
  stashDiff: (index: number) => ipcRenderer.invoke('git:stash-diff', index),
  dropStash: (index: number) => ipcRenderer.invoke('git:drop-stash', index),
  // Blame
  getBlame: (hash: string, filepath: string) => ipcRenderer.invoke('git:get-blame', hash, filepath),
  // Submodules
  getSubmodules: () => ipcRenderer.invoke('git:get-submodules'),
  initSubmodule: (path: string) => ipcRenderer.invoke('git:init-submodule', path),
  updateSubmodule: (path: string) => ipcRenderer.invoke('git:update-submodule', path),
  // Extended search & branch comparison
  searchInDiffs: (query: string) => ipcRenderer.invoke('git:search-in-diffs', query),
  compareBranches: (current: string, other: string) => ipcRenderer.invoke('git:compare-branches', current, other),
  // Interactive Rebase
  getRebaseSequence: (baseHash: string) => ipcRenderer.invoke('git:get-rebase-sequence', baseHash),
  interactiveRebase: (sequence: { action: string; hash: string }[], messages?: string[]) =>
    ipcRenderer.invoke('git:interactive-rebase', sequence, messages),
  // Conflict resolution
  getConflictedFiles: () => ipcRenderer.invoke('git:get-conflicted-files'),
  getConflictVersions: (filepath: string) => ipcRenderer.invoke('git:get-conflict-versions', filepath),
  getFileContent: (filepath: string) => ipcRenderer.invoke('git:get-file-content', filepath),
  getFileAtCommit: (commitHash: string, filepath: string) => ipcRenderer.invoke('git:get-file-at-commit', commitHash, filepath),
  restoreFileFromCommit: (commitHash: string, paths: string[]) => ipcRenderer.invoke('git:restore-file', commitHash, paths),
  applyPatch: (patch: string, reverse: boolean) => ipcRenderer.invoke('git:apply-patch', patch, reverse),
  markResolved: (filepath: string) => ipcRenderer.invoke('git:mark-resolved', filepath),
  resolveConflict: (filepath: string, content: string) => ipcRenderer.invoke('git:resolve-conflict', filepath, content),
  resolveConflictSide: (filepath: string, side: 'ours' | 'theirs') => ipcRenderer.invoke('git:resolve-conflict-side', filepath, side),
  continueRebase: (messages?: string[]) => ipcRenderer.invoke('git:continue-rebase', messages),
  continueMerge: (message?: string) => ipcRenderer.invoke('git:continue-merge', message),
  abortRebase: () => ipcRenderer.invoke('git:abort-rebase'),
  continueCherryPick: () => ipcRenderer.invoke('git:continue-cherry-pick'),
  abortCherryPick: () => ipcRenderer.invoke('git:abort-cherry-pick'),
  continueRevert: () => ipcRenderer.invoke('git:continue-revert'),
  abortRevert: () => ipcRenderer.invoke('git:abort-revert'),
  undoLastAction: () => ipcRenderer.invoke('git:undo-last-action'),
  redoLastAction: () => ipcRenderer.invoke('git:redo-last-action'),
  abortMerge: () => ipcRenderer.invoke('git:abort-merge'),
  getConflictMode: () => ipcRenderer.invoke('git:get-conflict-mode'),
  getConflictSides: () => ipcRenderer.invoke('git:get-conflict-sides'),
  getMergeMessage: () => ipcRenderer.invoke('git:get-merge-message'),
  // AI
  aiGetApiKey: () => ipcRenderer.invoke('ai:get-api-key'),
  aiSetApiKey: (key: string) => ipcRenderer.invoke('ai:set-api-key', key),
  aiGenerateCommitMessage: () => ipcRenderer.invoke('ai:generate-commit-message'),
  aiFilterQuery: (kind: 'prs' | 'issues', described: string, vocabulary: string) =>
    ipcRenderer.invoke('ai:filter-query', kind, described, vocabulary),
  aiPrDescription: (base: string, head: string) =>
    ipcRenderer.invoke('ai:generate-pr-description', base, head),
  aiRecomposeCommit: (hash: string) => ipcRenderer.invoke('ai:recompose-commit', hash),
  aiExplainCommit: (hash: string, force?: boolean, guidance?: string) => ipcRenderer.invoke('ai:explain-commit', hash, force, guidance),
  aiGetExplanations: () => ipcRenderer.invoke('ai:get-explanations'),
  aiResolveConflict: (filepath: string, instruction?: string) => ipcRenderer.invoke('ai:resolve-conflict', filepath, instruction),
  aiSearchCommits: (query: string) => ipcRenderer.invoke('ai:search-commits', query),
  aiListModels: () => ipcRenderer.invoke('ai:list-models'),
  aiListProviderModels: (provider: string, apiKey: string) => ipcRenderer.invoke('ai:list-provider-models', provider, apiKey),
  // Reflog
  getReflog: () => ipcRenderer.invoke('git:get-reflog'),
  // File History
  getFileHistory: (filepath: string) => ipcRenderer.invoke('git:get-file-history', filepath),
  // Remotes
  getRemotes: () => ipcRenderer.invoke('git:get-remotes'),
  addRemote: (name: string, url: string) => ipcRenderer.invoke('git:add-remote', name, url),
  removeRemote: (name: string) => ipcRenderer.invoke('git:remove-remote', name),
  renameRemote: (oldName: string, newName: string) => ipcRenderer.invoke('git:rename-remote', oldName, newName),
  fetchRemote: (name: string) => ipcRenderer.invoke('git:fetch-remote', name),
  pruneRemote: (name: string) => ipcRenderer.invoke('git:prune-remote', name),
  getDefaultRemote: () => ipcRenderer.invoke('git:get-default-remote'),
  getDefaultBranch: () => ipcRenderer.invoke('git:get-default-branch'),
  setDefaultRemote: (name: string) => ipcRenderer.invoke('git:set-default-remote', name),
  getGoneBranches: () => ipcRenderer.invoke('git:get-gone-branches'),
  pruneGoneBranches: (names: string[]) => ipcRenderer.invoke('git:prune-gone-branches', names),
  // Gitflow
  gitflowStatus: () => ipcRenderer.invoke('git:gitflow-status'),
  gitflowInit: () => ipcRenderer.invoke('git:gitflow-init'),
  gitflowStart: (type: 'feature' | 'release' | 'hotfix', name: string) => ipcRenderer.invoke('git:gitflow-start', type, name),
  gitflowFinish: (type: 'feature' | 'release' | 'hotfix', name: string, tagName?: string) => ipcRenderer.invoke('git:gitflow-finish', type, name, tagName),
  // Worktrees
  listWorktrees: () => ipcRenderer.invoke('git:list-worktrees'),
  addWorktree: (path: string, ref: string, newBranch?: string) => ipcRenderer.invoke('git:add-worktree', path, ref, newBranch),
  removeWorktree: (path: string, force?: boolean) => ipcRenderer.invoke('git:remove-worktree', path, force),
  listAgents: () => ipcRenderer.invoke('agents:list'),
  selectDirectory: (title?: string) => ipcRenderer.invoke('app:select-directory', title),
  // Settings
  settingsGetAll: () => ipcRenderer.invoke('settings:get-all'),
  settingsSet: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
  gitGetGlobalConfig: () => ipcRenderer.invoke('git:get-global-config'),
  gitSetGlobalConfig: (userName: string, userEmail: string) => ipcRenderer.invoke('git:set-global-config', userName, userEmail),
  appGetInfo: () => ipcRenderer.invoke('app:get-info'),
  getWhatsNew: () => ipcRenderer.invoke('app:get-whats-new'),
  getReleaseNotes: () => ipcRenderer.invoke('app:get-release-notes'),
  markWhatsNewSeen: () => ipcRenderer.invoke('app:mark-whats-new-seen'),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
  openInEditor: (filepath: string) => ipcRenderer.invoke('app:open-in-editor', filepath),
  openTerminal: () => ipcRenderer.invoke('app:open-terminal'),
  // External diff/merge tools & SSH keys (v1.20.0)
  sshBrowseKey: (kind: 'private' | 'public') => ipcRenderer.invoke('app:ssh-browse-key', kind),
  sshGenerateKey: (passphrase?: string) => ipcRenderer.invoke('app:ssh-generate-key', passphrase),
  openExternalDiff: (leftContent: string, rightContent: string, filename: string) =>
    ipcRenderer.invoke('app:open-external-diff', leftContent, rightContent, filename),
  openExternalMerge: (filepath: string) => ipcRenderer.invoke('app:open-external-merge', filepath),
  readTempFile: (absPath: string) => ipcRenderer.invoke('app:read-temp-file', absPath),
  // GitHub
  githubDetectRepo: () => ipcRenderer.invoke('github:detect-repo'),
  githubDetectRepoAt: (path: string) => ipcRenderer.invoke('github:detect-repo-at', path),
  githubCreatePR: (owner: string, repo: string, title: string, body: string, head: string, base: string, draft?: boolean) =>
    ipcRenderer.invoke('github:create-pr', owner, repo, title, body, head, base, draft),
  githubListBranches: (owner: string, repo: string) => ipcRenderer.invoke('github:list-branches', owner, repo),
  githubRepoParent: (owner: string, repo: string) => ipcRenderer.invoke('github:repo-parent', owner, repo),
  githubSharePatch: (hash: string) => ipcRenderer.invoke('github:share-patch', hash),
  githubListPRs: (owner: string, repo: string) => ipcRenderer.invoke('github:list-prs', owner, repo),
  githubListIssues: (owner: string, repo: string) => ipcRenderer.invoke('github:list-issues', owner, repo),
  githubSearchIssues: (q: string, force?: boolean) => ipcRenderer.invoke('github:search-issues', q, force),
  githubCloseIssue: (owner: string, repo: string, number: number) => ipcRenderer.invoke('github:close-issue', owner, repo, number),
  githubIssueComments: (owner: string, repo: string, number: number) => ipcRenderer.invoke('github:issue-comments', owner, repo, number),
  githubAddIssueComment: (owner: string, repo: string, number: number, body: string) => ipcRenderer.invoke('github:add-issue-comment', owner, repo, number, body),
  githubUpdateIssue: (owner: string, repo: string, number: number, patch: object) => ipcRenderer.invoke('github:update-issue', owner, repo, number, patch),
  githubListAssignees: (owner: string, repo: string) => ipcRenderer.invoke('github:list-assignees', owner, repo),
  githubRequestReviewers: (owner: string, repo: string, number: number, reviewers: string[]) =>
    ipcRenderer.invoke('github:request-reviewers', owner, repo, number, reviewers),
  githubListRepoLabels: (owner: string, repo: string) => ipcRenderer.invoke('github:list-repo-labels', owner, repo),
  githubGetPR: (owner: string, repo: string, number: number) => ipcRenderer.invoke('github:get-pr', owner, repo, number),
  githubGetChecks: (owner: string, repo: string, ref: string) => ipcRenderer.invoke('github:get-checks', owner, repo, ref),
  githubMergePR: (owner: string, repo: string, number: number, method?: string) => ipcRenderer.invoke('github:merge-pr', owner, repo, number, method),
  githubShareWipPatch: (repoPath: string) => ipcRenderer.invoke('github:share-wip-patch', repoPath),
  scanLocalRepos: (force?: boolean) => ipcRenderer.invoke('git:scan-local-repos', force),
  openPathInEditor: (dir: string) => ipcRenderer.invoke('app:open-path-in-editor', dir),
  readReadme: (dir: string) => ipcRenderer.invoke('git:read-readme', dir),
  githubGetIssue: (owner: string, repo: string, number: number) =>
    ipcRenderer.invoke('github:get-issue', owner, repo, number),
  githubListRepos: () => ipcRenderer.invoke('github:list-repos'),
  githubClone: (cloneUrl: string, repoName: string) => ipcRenderer.invoke('github:clone', cloneUrl, repoName),
  cloneTo: (opts: any) => ipcRenderer.invoke('git:clone-to', opts),
  // GitHub OAuth
  githubStartAuth: () => ipcRenderer.invoke('github:start-auth'),
  githubDisconnect: () => ipcRenderer.invoke('github:disconnect'),
  githubGetToken: () => ipcRenderer.invoke('github:get-token'),
  githubGetUser: () => ipcRenderer.invoke('github:get-user'),
  avatarResolve: (email: string, sha?: string) => ipcRenderer.invoke('avatar:resolve', email, sha),
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
  onRepoChanged: (cb: () => void) => subscribe('git:repo-changed', cb),
  onWorkingChanged: (cb: () => void) => subscribe('git:working-changed', cb),
  onUpdateAvailable: (cb: (version: string) => void) => subscribe('updater:update-available', (v) => cb(v)),
  onUpdateDownloaded: (cb: (version: string) => void) => subscribe('updater:update-downloaded', (v) => cb(v)),
  onUpdateError: (cb: (err: string) => void) => subscribe('updater:error', (err) => cb(err)),
  onDownloadProgress: (cb: (pct: number) => void) => subscribe('updater:download-progress', (pct) => cb(pct)),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  getUpdaterState: () => ipcRenderer.invoke('updater:get-state'),
  openDownloadedUpdate: () => ipcRenderer.invoke('updater:open-downloaded'),
  installManual: () => ipcRenderer.invoke('updater:install-manual'),
  isFullscreen: () => ipcRenderer.invoke('app:is-fullscreen'),
  onFullscreenChanged: (cb: (fs: boolean) => void) => subscribe('app:fullscreen-changed', (fs) => cb(fs)),
  // Themes beyond the 32 in tokens.css. Implemented in BOTH products, not
  // classified desktop-only: the picker is wanted in the VS Code panel too and
  // the extension host has Node, so GitVertexHost answers these with the same
  // ThemeStore. The renderer never fetches — it is sandboxed and shared.
  themesCatalogue: (opts?: { refresh?: boolean }) => ipcRenderer.invoke('themes:catalogue', opts),
  themesInstall: (id: string) => ipcRenderer.invoke('themes:install', id),
  themesRemove: (id: string) => ipcRenderer.invoke('themes:remove', id),
  themesInstalled: () => ipcRenderer.invoke('themes:installed'),
}

contextBridge.exposeInMainWorld('gitAPI', gitAPI)
contextBridge.exposeInMainWorld('appInfo', { platform: process.platform })

export type GitAPI = typeof gitAPI
