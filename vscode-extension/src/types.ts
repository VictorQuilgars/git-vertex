// Shared types between host (Node.js) and webview (browser)

export interface CommitNode {
  hash: string
  shortHash: string
  message: string
  author: string
  authorEmail: string
  date: string
  parents: string[]
  refs: string[]
  signature?: string
  // Assigned by layout
  lane?: number
  color?: string
  edges?: GraphEdge[]
}

export interface GraphEdge {
  fromLane: number
  toLane: number
  toRow: number
  color: string
  type: 'straight' | 'merge-left' | 'merge-right' | 'fork-left' | 'fork-right'
  dashed?: boolean
}

export interface BranchInfo {
  name: string
  current: boolean
  remote: boolean
  commit: string
  label: string
  ahead?: number    // commits ahead of upstream
  behind?: number   // commits behind upstream
  gone?: boolean    // upstream configured but deleted on the remote
}

export interface FileChange {
  path: string
  status: string   // A, M, D, R, C
  additions: number
  deletions: number
}

export interface WorkingFile {
  path: string
  status: string
}

export interface WorkingChanges {
  staged: WorkingFile[]
  unstaged: WorkingFile[]
  untracked: string[]
}

// One line of a rebase todo/done file. `hash` is empty for hash-less
// directives (exec, break, label, reset, merge, noop).
export interface RebaseStep {
  action: string
  hash: string
  shortHash: string
  subject: string
  // Human-relative author date ("il y a 3 jours") — omitted for hash-less
  // directive steps (exec/break/…).
  date?: string
}

export interface RebaseState {
  inProgress: boolean
  interactive: boolean
  headName: string
  ontoHash: string
  ontoShort: string
  stepCurrent: number
  stepTotal: number
  done: RebaseStep[]
  todo: RebaseStep[]
  stoppedSha: string | null
  conflicts: string[]
}

// ── IPC message types (webview ↔ host) ──────────────────────────

// Messages sent from webview → host
export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'getLog'; maxCount?: number }
  | { type: 'getBranches' }
  | { type: 'getWorkingChanges' }
  | { type: 'getCommitFiles'; hash: string }
  | { type: 'getDiff'; hash: string }
  | { type: 'getWorkingFileDiff'; filepath: string; staged: boolean }
  | { type: 'stage'; files: string[] }
  | { type: 'stageAll' }
  | { type: 'unstage'; files: string[] }
  | { type: 'commit'; message: string; amend?: boolean }
  | { type: 'checkout'; ref: string }
  | { type: 'createBranch'; name: string }
  | { type: 'deleteBranch'; name: string }
  | { type: 'fetch' }
  | { type: 'pull' }
  | { type: 'push' }
  | { type: 'search'; query: string }
  | { type: 'discardFile'; file: string }

// Messages sent from host → webview
export type HostToWebview =
  | { type: 'log'; commits: CommitNode[]; repoName: string }
  | { type: 'branches'; branches: BranchInfo[] }
  | { type: 'workingChanges'; changes: WorkingChanges }
  | { type: 'commitFiles'; hash: string; files: FileChange[] }
  | { type: 'diff'; hash: string; diff: string }
  | { type: 'workingFileDiff'; filepath: string; staged: boolean; diff: string }
  | { type: 'opResult'; op: string; success: boolean; error?: string }
  | { type: 'error'; message: string }
  | { type: 'repoChanged' }
