export interface CommitNode {
  hash: string; shortHash: string; message: string
  author: string; authorEmail: string; date: string
  parents: string[]; refs: string[]
  // GPG signature status from `%G?`: G good, B bad, U good-unknown, X expired,
  // Y expired-key, R revoked-key, E cannot-check, N none
  signature?: string
  lane?: number; color?: string; edges?: GraphEdge[]
  // Total lines added/removed across the commit's diff (from `--numstat`).
  // Undefined for merge commits, where git log emits no diff by default.
  additions?: number; deletions?: number
}

export interface GraphEdge {
  fromLane: number; toLane: number; toRow: number
  color: string; type: 'straight' | 'merge-left' | 'merge-right' | 'fork-left' | 'fork-right'
  dashed?: boolean
}

export interface BranchInfo {
  name: string; current: boolean; remote: boolean; commit: string; label: string
  ahead?: number; behind?: number; gone?: boolean  // tracking vs upstream (local branches)
}

export interface FileChange {
  path: string; status: string; additions: number; deletions: number
}

export interface WorkingFile { path: string; status: string }

export interface WorkingChanges {
  staged: WorkingFile[]; unstaged: WorkingFile[]; untracked: string[]
}

type R = { success: boolean; error?: string }

declare global {
  interface Window {
    appInfo: { platform: string }
    gitAPI: {
      // Repo
      openRepo: () => Promise<{ path?: string; name?: string; error?: string }>
      setRepo: (path: string) => Promise<{ path?: string; name?: string; error?: string }>
      getRecentRepos: () => Promise<string[]>
      removeRecentRepo: (path: string) => Promise<string[]>
      // Read
      getLog: (o?: { maxCount?: number; all?: boolean; refs?: string[] }) => Promise<{ commits?: CommitNode[]; error?: string }>
      getBranches: () => Promise<{ branches?: BranchInfo[]; error?: string }>
      getDiff: (h: string) => Promise<{ diff?: string; error?: string }>
      getCommitFiles: (h: string) => Promise<{ files?: FileChange[]; error?: string }>
      getStatus: () => Promise<{ staged: string[]; unstaged: string[]; untracked: string[] }>
      getStashes: () => Promise<{ stashes: { index: number; message: string }[] }>
      getTags: () => Promise<{ tags: { name: string; hash: string }[] }>
      // Branch write
      checkout: (ref: string) => Promise<R>
      createBranch: (name: string) => Promise<R>
      createBranchAt: (name: string, hash: string, checkout: boolean) => Promise<R>
      deleteBranch: (name: string) => Promise<R>
      renameBranch: (oldName: string, newName: string) => Promise<R>
      merge: (branch: string) => Promise<R>
      rebaseOnto: (branch: string) => Promise<R>
      pushBranch: (branch: string) => Promise<R>
      pushToCommit: (hash: string) => Promise<R>
      createPatch: (hash: string) => Promise<{ patch: string; error?: string }>
      savePatchFile: (content: string, suggestedName: string) => Promise<{ success: boolean; canceled?: boolean; path?: string; error?: string }>
      deleteRemoteBranch: (branch: string) => Promise<R>
      setUpstream: (branch: string, upstream?: string) => Promise<R>
      moveBranchTo: (branch: string, hash: string) => Promise<R>
      rebaseBranchOnto: (branch: string, hash: string) => Promise<R>
      mergeCommitInto: (branch: string, hash: string) => Promise<R>
      // Remote
      fetch: () => Promise<R>
      push: () => Promise<R & { setUpstream?: boolean }>
      pushTo: (remote: string, branch: string, setUpstream: boolean, force?: boolean) => Promise<R>
      pull: () => Promise<R>
      // Staging & commit
      getWorkingChanges: () => Promise<WorkingChanges>
      getWorkingFileDiff: (filepath: string, staged: boolean, context?: number) => Promise<{ diff: string }>
      getFileAtCommit: (commitHash: string, filepath: string) => Promise<{ content: string; error?: string }>
      applyPatch: (patch: string, reverse: boolean) => Promise<R>
      stage: (files: string[]) => Promise<R>
      stageAll: () => Promise<R>
      unstage: (files: string[]) => Promise<R>
      commit: (msg: string, amend?: boolean) => Promise<R>
      discardFile: (file: string) => Promise<R>
      // Commit operations
      cherryPick: (hash: string) => Promise<R>
      revert: (hash: string) => Promise<R>
      reset: (hash: string, mode: 'soft' | 'mixed' | 'hard') => Promise<R>
      amendMessage: (message: string) => Promise<R>
      dropCommit: (hash: string) => Promise<R>
      moveCommit: (hash: string, direction: 'up' | 'down') => Promise<R>
      diffCommitToWorking: (hash: string) => Promise<{ diff: string }>
      diffBetweenCommits: (fromHash: string, toHash: string) => Promise<{ diff: string; error?: string }>
      filesBetweenCommits: (fromHash: string, toHash: string) => Promise<{ files: FileChange[]; error?: string }>
      getLastCommitMessage: () => Promise<{ message: string }>
      getUpstream: () => Promise<{ upstream: string | null }>
      // Tags
      createTag: (name: string, hash?: string, message?: string) => Promise<R>
      deleteTag: (name: string) => Promise<R>
      pushTag: (name: string, remote?: string) => Promise<R>
      deleteRemoteTag: (name: string, remote?: string) => Promise<R>
      // Stash
      createStash: (message?: string) => Promise<R>
      applyStash: (index: number) => Promise<R>
      popStash: (index: number) => Promise<R>
      dropStash: (index: number) => Promise<R>
      // Blame
      getBlame: (hash: string, filepath: string) => Promise<{ lines: { shortHash: string; hash: string; author: string; date: string; lineNum: number; content: string }[] }>
      // Submodules
      getSubmodules: () => Promise<{ submodules: { path: string; url: string; status: 'ok' | 'dirty' | 'uninitialized' }[] }>
      initSubmodule: (path: string) => Promise<R>
      updateSubmodule: (path: string) => Promise<R>
      // Extended search & branch comparison
      searchInDiffs: (query: string) => Promise<{ hashes: string[] }>
      compareBranches: (current: string, other: string) => Promise<{ ahead: { hash: string; shortHash: string; message: string }[]; behind: { hash: string; shortHash: string; message: string }[] }>
      // Interactive Rebase
      getRebaseSequence: (baseHash: string) => Promise<{ commits: { hash: string; shortHash: string; message: string }[] }>
      interactiveRebase: (sequence: { action: string; hash: string }[], messages?: string[]) => Promise<R>
      // Conflict resolution
      getConflictedFiles: () => Promise<{ files: string[] }>
      getConflictVersions: (filepath: string) => Promise<{ base: string; ours: string; theirs: string }>
      getFileContent: (filepath: string) => Promise<{ content: string; error?: string }>
      markResolved: (filepath: string) => Promise<R>
      resolveConflict: (filepath: string, content: string) => Promise<R>
      resolveConflictSide: (filepath: string, side: 'ours' | 'theirs') => Promise<R>
      continueRebase: (messages?: string[]) => Promise<R>
      continueMerge: (message?: string) => Promise<R>
      abortRebase: () => Promise<R>
      abortMerge: () => Promise<R>
      continueCherryPick: () => Promise<R>
      abortCherryPick: () => Promise<R>
      continueRevert: () => Promise<R>
      abortRevert: () => Promise<R>
      getConflictMode: () => Promise<{ mode: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null }>
      undoLastAction: () => Promise<R & { action?: string }>
      redoLastAction: () => Promise<R & { action?: string }>
      // Reflog
      getReflog: () => Promise<{ entries: { hash: string; ref: string; message: string; date: string }[] }>
      // File History
      getFileHistory: (filepath: string) => Promise<{ commits: { hash: string; shortHash: string; message: string; author: string; date: string }[] }>
      // Remotes
      getRemotes: () => Promise<{ remotes: { name: string; fetchUrl: string; pushUrl: string }[] }>
      gitflowStatus: () => Promise<{ initialized: boolean; mainBranch: string; features: string[]; releases: string[]; hotfixes: string[] }>
      gitflowInit: () => Promise<R>
      gitflowStart: (type: 'feature' | 'release' | 'hotfix', name: string) => Promise<R>
      gitflowFinish: (type: 'feature' | 'release' | 'hotfix', name: string, tagName?: string) => Promise<R>
      listWorktrees: () => Promise<{ worktrees: { path: string; branch: string; head: string; isMain: boolean; locked: boolean }[] }>
      addWorktree: (path: string, ref: string, newBranch?: string) => Promise<R>
      removeWorktree: (path: string, force?: boolean) => Promise<R>
      selectDirectory: (title?: string) => Promise<{ path: string | null }>
      addRemote: (name: string, url: string) => Promise<R>
      removeRemote: (name: string) => Promise<R>
      renameRemote: (oldName: string, newName: string) => Promise<R>
      fetchRemote: (name: string) => Promise<R>
    }
  }
}
