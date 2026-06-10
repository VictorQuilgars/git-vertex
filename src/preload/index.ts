import { contextBridge, ipcRenderer, webFrame } from 'electron'

const gitAPI = {
  // Zoom (renderer webFrame)
  zoomGet: () => webFrame.getZoomFactor(),
  zoomSet: (factor: number) => { webFrame.setZoomFactor(factor); return webFrame.getZoomFactor() },
  // Repo management
  openRepo: () => ipcRenderer.invoke('git:open-repo'),
  setRepo: (path: string) => ipcRenderer.invoke('git:set-repo', path),
  getRecentRepos: () => ipcRenderer.invoke('app:get-recent-repos'),
  removeRecentRepo: (path: string) => ipcRenderer.invoke('app:remove-recent-repo', path),
  // Read
  getLog: (options?: { maxCount?: number; all?: boolean; refs?: string[] }) => ipcRenderer.invoke('git:get-log', options),
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
  pushTo: (remote: string, branch: string, setUpstream: boolean) => ipcRenderer.invoke('git:push-to', remote, branch, setUpstream),
  pull: () => ipcRenderer.invoke('git:pull'),
  // Staging & commit
  getWorkingChanges: () => ipcRenderer.invoke('git:get-working-changes'),
  getLastCommitMessage: () => ipcRenderer.invoke('git:get-last-commit-message'),
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
  dropCommit: (hash: string) => ipcRenderer.invoke('git:drop-commit', hash),
  moveCommit: (hash: string, direction: 'up' | 'down') => ipcRenderer.invoke('git:move-commit', hash, direction),
  diffCommitToWorking: (hash: string) => ipcRenderer.invoke('git:diff-commit-to-working', hash),
  diffBetweenCommits: (fromHash: string, toHash: string) => ipcRenderer.invoke('git:diff-between-commits', fromHash, toHash),
  filesBetweenCommits: (fromHash: string, toHash: string) => ipcRenderer.invoke('git:files-between-commits', fromHash, toHash),
  // Branch operations
  createBranchAt: (name: string, hash: string, checkout: boolean) => ipcRenderer.invoke('git:create-branch-at', name, hash, checkout),
  renameBranch: (oldName: string, newName: string) => ipcRenderer.invoke('git:rename-branch', oldName, newName),
  merge: (branch: string) => ipcRenderer.invoke('git:merge', branch),
  rebaseOnto: (branch: string) => ipcRenderer.invoke('git:rebase-onto', branch),
  pushBranch: (branch: string) => ipcRenderer.invoke('git:push-branch', branch),
  deleteRemoteBranch: (branch: string) => ipcRenderer.invoke('git:delete-remote-branch', branch),
  setUpstream: (branch: string) => ipcRenderer.invoke('git:set-upstream', branch),
  moveBranchTo: (branch: string, hash: string) => ipcRenderer.invoke('git:move-branch-to', branch, hash),
  rebaseBranchOnto: (branch: string, hash: string) => ipcRenderer.invoke('git:rebase-branch-onto', branch, hash),
  mergeCommitInto: (branch: string, hash: string) => ipcRenderer.invoke('git:merge-commit-into', branch, hash),
  // Tag operations
  getTags: () => ipcRenderer.invoke('git:get-tags'),
  createTag: (name: string, hash?: string, message?: string) => ipcRenderer.invoke('git:create-tag', name, hash, message),
  deleteTag: (name: string) => ipcRenderer.invoke('git:delete-tag', name),
  // Stash operations
  createStash: (message?: string) => ipcRenderer.invoke('git:create-stash', message),
  applyStash: (index: number) => ipcRenderer.invoke('git:apply-stash', index),
  popStash: (index: number) => ipcRenderer.invoke('git:pop-stash', index),
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
  interactiveRebase: (sequence: { action: string; hash: string }[]) => ipcRenderer.invoke('git:interactive-rebase', sequence),
  // Conflict resolution
  getConflictedFiles: () => ipcRenderer.invoke('git:get-conflicted-files'),
  getConflictVersions: (filepath: string) => ipcRenderer.invoke('git:get-conflict-versions', filepath),
  getFileContent: (filepath: string) => ipcRenderer.invoke('git:get-file-content', filepath),
  getFileAtCommit: (commitHash: string, filepath: string) => ipcRenderer.invoke('git:get-file-at-commit', commitHash, filepath),
  applyPatch: (patch: string, reverse: boolean) => ipcRenderer.invoke('git:apply-patch', patch, reverse),
  markResolved: (filepath: string) => ipcRenderer.invoke('git:mark-resolved', filepath),
  resolveConflict: (filepath: string, content: string) => ipcRenderer.invoke('git:resolve-conflict', filepath, content),
  resolveConflictSide: (filepath: string, side: 'ours' | 'theirs') => ipcRenderer.invoke('git:resolve-conflict-side', filepath, side),
  continueRebase: () => ipcRenderer.invoke('git:continue-rebase'),
  continueMerge: (message?: string) => ipcRenderer.invoke('git:continue-merge', message),
  abortRebase: () => ipcRenderer.invoke('git:abort-rebase'),
  undoLastAction: () => ipcRenderer.invoke('git:undo-last-action'),
  redoLastAction: () => ipcRenderer.invoke('git:redo-last-action'),
  abortMerge: () => ipcRenderer.invoke('git:abort-merge'),
  getConflictMode: () => ipcRenderer.invoke('git:get-conflict-mode'),
  getMergeMessage: () => ipcRenderer.invoke('git:get-merge-message'),
  // AI
  aiGetApiKey: () => ipcRenderer.invoke('ai:get-api-key'),
  aiSetApiKey: (key: string) => ipcRenderer.invoke('ai:set-api-key', key),
  aiGenerateCommitMessage: () => ipcRenderer.invoke('ai:generate-commit-message'),
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
  // Gitflow
  gitflowStatus: () => ipcRenderer.invoke('git:gitflow-status'),
  gitflowInit: () => ipcRenderer.invoke('git:gitflow-init'),
  gitflowStart: (type: 'feature' | 'release' | 'hotfix', name: string) => ipcRenderer.invoke('git:gitflow-start', type, name),
  gitflowFinish: (type: 'feature' | 'release' | 'hotfix', name: string, tagName?: string) => ipcRenderer.invoke('git:gitflow-finish', type, name, tagName),
  // Worktrees
  listWorktrees: () => ipcRenderer.invoke('git:list-worktrees'),
  addWorktree: (path: string, ref: string, newBranch?: string) => ipcRenderer.invoke('git:add-worktree', path, ref, newBranch),
  removeWorktree: (path: string, force?: boolean) => ipcRenderer.invoke('git:remove-worktree', path, force),
  selectDirectory: (title?: string) => ipcRenderer.invoke('app:select-directory', title),
  // Settings
  settingsGetAll: () => ipcRenderer.invoke('settings:get-all'),
  settingsSet: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
  gitGetGlobalConfig: () => ipcRenderer.invoke('git:get-global-config'),
  gitSetGlobalConfig: (userName: string, userEmail: string) => ipcRenderer.invoke('git:set-global-config', userName, userEmail),
  appGetInfo: () => ipcRenderer.invoke('app:get-info'),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
  openInEditor: (filepath: string) => ipcRenderer.invoke('app:open-in-editor', filepath),
  openTerminal: () => ipcRenderer.invoke('app:open-terminal'),
  // GitHub
  githubDetectRepo: () => ipcRenderer.invoke('github:detect-repo'),
  githubCreatePR: (owner: string, repo: string, title: string, body: string, head: string, base: string) =>
    ipcRenderer.invoke('github:create-pr', owner, repo, title, body, head, base),
  githubListBranches: (owner: string, repo: string) => ipcRenderer.invoke('github:list-branches', owner, repo),
  githubListPRs: (owner: string, repo: string) => ipcRenderer.invoke('github:list-prs', owner, repo),
  githubListIssues: (owner: string, repo: string) => ipcRenderer.invoke('github:list-issues', owner, repo),
  githubListRepos: () => ipcRenderer.invoke('github:list-repos'),
  githubClone: (cloneUrl: string, repoName: string) => ipcRenderer.invoke('github:clone', cloneUrl, repoName),
  // GitHub OAuth
  githubStartAuth: () => ipcRenderer.invoke('github:start-auth'),
  githubDisconnect: () => ipcRenderer.invoke('github:disconnect'),
  githubGetToken: () => ipcRenderer.invoke('github:get-token'),
  githubGetUser: () => ipcRenderer.invoke('github:get-user'),
  avatarResolve: (email: string, sha?: string) => ipcRenderer.invoke('avatar:resolve', email, sha),
  onGithubAuthComplete: (cb: (result: { token?: string; error?: string }) => void) => {
    ipcRenderer.on('github:auth-complete', (_e, result) => cb(result))
  },
  // Auto-updater
  onRepoChanged: (cb: () => void) => ipcRenderer.on('git:repo-changed', cb),
  onWorkingChanged: (cb: () => void) => ipcRenderer.on('git:working-changed', cb),
  offRepoChanged: (cb: () => void) => ipcRenderer.removeListener('git:repo-changed', cb),
  offWorkingChanged: (cb: () => void) => ipcRenderer.removeListener('git:working-changed', cb),
  onUpdateAvailable: (cb: (version: string) => void) => ipcRenderer.on('updater:update-available', (_e, v) => cb(v)),
  onUpdateDownloaded: (cb: (version: string) => void) => ipcRenderer.on('updater:update-downloaded', (_e, v) => cb(v)),
  onUpdateError: (cb: (err: string) => void) => ipcRenderer.on('updater:error', (_e, err) => cb(err)),
  onDownloadProgress: (cb: (pct: number) => void) => ipcRenderer.on('updater:download-progress', (_e, pct) => cb(pct)),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  getUpdaterState: () => ipcRenderer.invoke('updater:get-state'),
  openDownloadedUpdate: () => ipcRenderer.invoke('updater:open-downloaded'),
  installManual: () => ipcRenderer.invoke('updater:install-manual'),
}

contextBridge.exposeInMainWorld('gitAPI', gitAPI)
contextBridge.exposeInMainWorld('appInfo', { platform: process.platform })

export type GitAPI = typeof gitAPI
