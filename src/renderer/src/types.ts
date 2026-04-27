export interface CommitNode {
  hash: string; shortHash: string; message: string
  author: string; authorEmail: string; date: string
  parents: string[]; refs: string[]
  lane?: number; color?: string; edges?: GraphEdge[]
}

export interface GraphEdge {
  fromLane: number; toLane: number; toRow: number
  color: string; type: 'straight' | 'merge-left' | 'merge-right' | 'fork-left' | 'fork-right'
}

export interface BranchInfo {
  name: string; current: boolean; remote: boolean; commit: string; label: string
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
      getLog: (o?: { maxCount?: number; all?: boolean }) => Promise<{ commits?: CommitNode[]; error?: string }>
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
      // Remote
      fetch: () => Promise<R>
      push: () => Promise<R & { setUpstream?: boolean }>
      pull: () => Promise<R>
      // Staging & commit
      getWorkingChanges: () => Promise<WorkingChanges>
      stage: (files: string[]) => Promise<R>
      stageAll: () => Promise<R>
      unstage: (files: string[]) => Promise<R>
      commit: (msg: string, amend?: boolean) => Promise<R>
      discardFile: (file: string) => Promise<R>
      // Commit operations
      cherryPick: (hash: string) => Promise<R>
      revert: (hash: string) => Promise<R>
      reset: (hash: string, mode: 'soft' | 'mixed' | 'hard') => Promise<R>
      // Tags
      createTag: (name: string, hash?: string, message?: string) => Promise<R>
      deleteTag: (name: string) => Promise<R>
      // Stash
      createStash: (message?: string) => Promise<R>
      applyStash: (index: number) => Promise<R>
      popStash: (index: number) => Promise<R>
      dropStash: (index: number) => Promise<R>
      // Extended search & branch comparison
      searchInDiffs: (query: string) => Promise<{ hashes: string[] }>
      compareBranches: (current: string, other: string) => Promise<{ ahead: { hash: string; shortHash: string; message: string }[]; behind: { hash: string; shortHash: string; message: string }[] }>
      // Interactive Rebase
      getRebaseSequence: (baseHash: string) => Promise<{ commits: { hash: string; shortHash: string; message: string }[] }>
      interactiveRebase: (sequence: { action: string; hash: string }[]) => Promise<R>
      // Conflict resolution
      getConflictedFiles: () => Promise<{ files: string[] }>
      getConflictVersions: (filepath: string) => Promise<{ base: string; ours: string; theirs: string }>
      markResolved: (filepath: string) => Promise<R>
      continueRebase: () => Promise<R>
      continueMerge: () => Promise<R>
      abortRebase: () => Promise<R>
      // Reflog
      getReflog: () => Promise<{ entries: { hash: string; ref: string; message: string; date: string }[] }>
      // File History
      getFileHistory: (filepath: string) => Promise<{ commits: { hash: string; shortHash: string; message: string; author: string; date: string }[] }>
      // Remotes
      getRemotes: () => Promise<{ remotes: { name: string; fetchUrl: string; pushUrl: string }[] }>
      addRemote: (name: string, url: string) => Promise<R>
      removeRemote: (name: string) => Promise<R>
      renameRemote: (oldName: string, newName: string) => Promise<R>
      fetchRemote: (name: string) => Promise<R>
    }
  }
}
