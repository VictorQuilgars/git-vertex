// Default action bound to the toolbar's split Pull button — set from its
// dropdown, persisted as the `pullMode` setting.
export type PullMode = 'fetch' | 'ff' | 'ff-only' | 'rebase'

// What a stash takes: everything, only the index, or only what isn't staged.
export type StashScope = 'all' | 'staged' | 'unstaged'

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
  name: string; current: boolean; remote: boolean; commit: string
  /**
   * ⚠️ The last commit's SUBJECT, not a name for the branch — it is what
   * simple-git calls `label` and the field kept the word. Anything showing a
   * branch to a user wants `name`; the toolbar's picker showed three commit
   * messages before this comment existed.
   */
  label: string
  // HEAD is not on a branch (mid-rebase, or plain detached). `name` then holds
  // a human label such as `rebasing feature`, never a checkout-able ref.
  detached?: boolean
  ahead?: number; behind?: number; gone?: boolean  // tracking vs upstream (local branches)
}

// The unmerged states git reports in the XY columns of `git status --porcelain`.
// They are not interchangeable: `both-modified` is a content decision, while
// the delete-bearing ones ask whether the file survives at all — so the UI must
// not offer all of them the same "Current / Incoming" wording.
export type ConflictKind =
  | 'both-modified'    // UU
  | 'both-added'       // AA — no common ancestor to diff against
  | 'both-deleted'     // DD
  | 'added-by-us'      // AU
  | 'added-by-them'    // UA
  | 'deleted-by-us'    // DU
  | 'deleted-by-them'  // UD
  | 'unknown'

export interface ConflictEntry {
  path: string
  kind: ConflictKind
}

export interface FileChange {
  path: string; status: string; additions: number; deletions: number
}

// additions/deletions come from `git diff --numstat` (v1.22.0). Absent for
// untracked files and for binaries, where git reports no line counts.
export interface WorkingFile { path: string; status: string; additions?: number; deletions?: number }

export interface WorkingChanges {
  staged: WorkingFile[]; unstaged: WorkingFile[]; untracked: string[]
}

type R = { success: boolean; error?: string }

/**
 * Which question a comparison answers.
 *
 * `endpoints` (`A..B`) is the difference between the two trees as they stand.
 * `diverged` (`A...B`) is what B did since the two parted — the question the
 * commit list beside it has always answered, and the one a pull request shows.
 * Declared here as well as in the two services because the view that picks it
 * is shared renderer code.
 */
export type CompareAxis = 'diverged' | 'endpoints'

/**
 * A response this mirror has not narrowed yet.
 *
 * It exists so the surface can be COMPLETE without inventing shapes for
 * handlers nobody has typed: a missing entry sends its callers through
 * `(window.gitAPI as any)`, and a cast is a hole the compiler cannot see
 * through. Being complete is what makes a typo fail to compile; being precise
 * is a separate, slower job, one call site at a time.
 */
type Unnarrowed = any

declare global {
  /**
   * The bridge, as a NAMED interface rather than a literal, so the VS Code
   * panel can merge its own methods into it. The two products do not expose
   * the same surface: this one is the desktop preload's, held exactly equal
   * to it by preload-mirror.test.ts, and the panel augments it with what only
   * the extension host answers (see the extension's panel-api.d.ts). Before
   * that, the panel redeclared the whole thing as `any` — which is why none
   * of its own calls were checked by anything at all (#105).
   */
  interface GitAPI {
    // Repo
    openRepo: () => Promise<{ path?: string; name?: string; error?: string }>
    setRepo: (path: string) => Promise<{ path?: string; name?: string; error?: string }>
    getRecentRepos: () => Promise<string[]>
    getGitCapabilities: () => Promise<{
      version: string | null
      conflictPrediction: boolean
      minimumForPrediction?: string
      /** Absolute path of the git actually used, or 'git' if unresolved. */
      path?: string
      /** How that path was chosen — see git-binary.ts. */
      source?: 'setting' | 'login-shell' | 'process-path' | 'not-found'
      /** PATH the app searches, which is what explains `path`. */
      searchPath?: string
    }>
    resolveGitBinary: (explicitPath?: string) => Promise<{
      version: string | null
      path: string
      source: 'setting' | 'login-shell' | 'process-path' | 'not-found'
    }>
    removeRecentRepo: (path: string) => Promise<string[]>
    // Read
    getLog: (o?: { maxCount?: number; all?: boolean; refs?: string[]; excludes?: string[] }) => Promise<{ commits?: CommitNode[]; error?: string }>
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
    /** Fetch, then `merge --ff-only @{u}` — never writes a commit. */
    fastForwardToUpstream: () => Promise<R>
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
    pull: (mode?: PullMode) => Promise<R>
    pruneRemote: (name: string) => Promise<R & { pruned?: string[] }>
    getDefaultRemote: () => Promise<{ remote: string | null; explicit: boolean }>
    getDefaultBranch: () => Promise<{ branch: string | null }>
    setDefaultRemote: (name: string) => Promise<R>
    getGoneBranches: () => Promise<{ branches: string[] }>
    pruneGoneBranches: (names: string[]) => Promise<R & { deleted: string[] }>
    // Staging & commit
    getWorkingChanges: () => Promise<WorkingChanges>
    getWorkingFileDiff: (filepath: string, staged: boolean, context?: number) => Promise<{ diff: string }>
    getFileAtCommit: (commitHash: string, filepath: string) => Promise<{ content: string; error?: string }>
    restoreFileFromCommit: (commitHash: string, paths: string[]) => Promise<{ success: boolean; error?: string }>
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
    /** N commits, ONE rebase — a loop of drops would chase stale hashes (#69). */
    dropCommits: (hashes: string[]) => Promise<Unnarrowed>
    moveCommit: (hash: string, direction: 'up' | 'down') => Promise<R>
    diffCommitToWorking: (hash: string) => Promise<{ diff: string }>
    diffBetweenCommits: (fromHash: string, toHash: string | null, axis?: CompareAxis) => Promise<{ diff: string; error?: string }>
    filesBetweenCommits: (fromHash: string, toHash: string | null, axis?: CompareAxis) => Promise<{ files: FileChange[]; error?: string }>
    getMergeBase: (a: string, b: string) => Promise<{ base: string | null; error?: string }>
    getLastCommitMessage: (ref?: string) => Promise<{ message: string }>
    // The preload has had this since the AI commit message shipped; the
    // declaration never followed, so the one caller was typed as a mistake.
    aiGenerateCommitMessage: () => Promise<{ message?: string; error?: string }>
    /** A saved filter described in words → a query. Checked before it is used. */
    aiFilterQuery: (kind: 'prs' | 'issues', described: string, vocabulary: string)
      => Promise<{ query?: string; error?: string }>
    /** The composer's title and description, generated together (#130). */
    aiPrDescription: (base: string, head: string)
      => Promise<{ title?: string; body?: string; error?: string }>
    getUpstream: () => Promise<{ upstream: string | null }>
    // Tags
    createTag: (name: string, hash?: string, message?: string) => Promise<R>
    deleteTag: (name: string) => Promise<R>
    pushTag: (name: string, remote?: string) => Promise<R>
    deleteRemoteTag: (name: string, remote?: string) => Promise<R>
    // Stash
    createStash: (message?: string, opts?: { scope?: StashScope; paths?: string[] }) => Promise<R>
    renameStash: (index: number, message: string) => Promise<R>
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
    // `entries` is optional on the wire: an older extension host may answer
    // with `files` alone, and the UI must then say nothing about the kind
    // rather than guess one.
    getConflictedFiles: () => Promise<{ files: string[]; entries?: ConflictEntry[] }>
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
    // Themes beyond the 32 in tokens.css. Optional because the VS Code shim
    // and older hosts may not carry them — the callers all guard with `?.`
    // and fall back to the built-in themes, which is the behaviour the
    // offline path needs anyway.
    themesCatalogue?: (opts?: { refresh?: boolean }) => Promise<{
      version: number
      generatedAt: string
      count: number
      themes: Array<{
        id: string; name: string; dark: boolean
        canvas: string; text: string; border: string; accent: string
        lic: string; src: string; version: string
        hue: string; vivid: string; dl: number
      }>
      stale?: boolean
      error?: string
    }>
    themesInstall?: (id: string) => Promise<R & { theme?: InstalledTheme }>
    themesRemove?: (id: string) => Promise<R>

    // ── The half of the bridge this mirror never declared ──────────
    // 199 methods are exposed; 113 were declared. The other 86 were reachable
    // only through `(window.gitAPI as any)`, and a cast is a hole the compiler
    // cannot see through — which is how `I is not defined` and `t is not
    // defined` both reached users. `preload-mirror.test.ts` now fails if the
    // two lists drift again.
    //
    // Where a handler's answer is already a settled shape it is written out.
    // Where it is not, `Unnarrowed` says so rather than inventing one: the
    // point here is that the NAME exists, so a typo stops compiling. Narrow
    // one when you next touch its call site.

    // Zoom (webFrame, no IPC — these answer synchronously)
    zoomGet: () => number
    zoomSet: (factor: number) => number

    // Repo creation & cloning
    initRepo: (dir: string) => Promise<{ path?: string; name?: string; error?: string }>
    initAdvanced: (opts: Unnarrowed) => Promise<{ path?: string; name?: string; error?: string }>
    cloneTo: (opts: Unnarrowed) => Promise<{ path?: string; name?: string; error?: string }>
    listGitignoreTemplates: () => Promise<{ templates: string[]; error?: string }>
    listLicenses: () => Promise<{ licenses: { key: string; name: string }[]; error?: string }>
    scanLocalRepos: (force?: boolean) => Promise<Unnarrowed>
    readReadme: (dir: string) => Promise<{ content: string; error?: string }>

    // Workspaces & deep links
    getWorkspaces: () => Promise<Unnarrowed>
    setRepoWorkspace: (path: string, workspace: string) => Promise<Unnarrowed>
    getPendingDeepLink: () => Promise<Unnarrowed>
    onDeepLink: (cb: (link: { repo: string; view: string; file?: string; hash?: string }) => void) => () => void

    // Read
    getCommitBody: (hash: string) => Promise<{ body: string }>
    getTracking: () => Promise<{ branch: string | null; upstream: string | null; ahead: number; behind: number }>
    getRewordPlan: (hash: string) => Promise<Unnarrowed>
    getCheckoutPlan: (ref: string) => Promise<Unnarrowed>
    checkoutTracking: (remoteRef: string, localName: string) => Promise<R>
    stashDiff: (index: number) => Promise<{ diff?: string; error?: string }>

    // Conflicts
    /** Would this branch conflict with the base it will land on? Fails open. */
    conflictOutlook: (branch?: string) => Promise<{ base?: string | null; files?: string[]; error?: string }>
    predictConflicts: (theirs: string, ours?: string, mergeBase?: string) => Promise<Unnarrowed>
    predictRebaseConflicts: (upstream: string, branch?: string) => Promise<Unnarrowed>
    getConflictSides: () => Promise<{ ours: string; theirs: string }>
    getMergeMessage: () => Promise<{ message: string }>

    // AI
    aiGetApiKey: () => Promise<{ key: string | null }>
    aiSetApiKey: (key: string) => Promise<R>
    aiRecomposeCommit: (hash: string) => Promise<Unnarrowed>
    aiExplainCommit: (hash: string, force?: boolean, guidance?: string) => Promise<Unnarrowed>
    aiGetExplanations: () => Promise<Unnarrowed>
    // The same explanation, on the three other diffs a repository has (#70).
    // None of them is cached: a branch, a stash and a working tree all move
    // under their answer, where a commit's diff cannot.
    aiExplainBranch: (branch: string, guidance?: string) => Promise<{ explanation?: string; base?: string; error?: string }>
    aiExplainStash: (index: number | string, guidance?: string) => Promise<{ explanation?: string; error?: string }>
    aiExplainWorking: (guidance?: string) => Promise<{ explanation?: string; error?: string }>
    // The changelog remembers: what it wrote, and what it wrote it from, so
    // reopening the drawer costs nothing and a branch that has moved says so.
    aiChangelogState: (branch: string) => Promise<{
      base?: string
      cached?: { text: string; base: string; headSha: string; baseSha: string; commits: number; at: number }
      newCommits?: number
      baseMoved?: boolean
      error?: string
    }>
    /** Every changelog this repository has had written, newest first. */
    aiChangelogList: () => Promise<{ entries?: {
      branch: string; text: string; base: string; commits: number; at: number
      newCommits: number; orphan: boolean
      inserted?: { path: string; lines: string[]; at: number }
    }[] }>
    aiForgetChangelog: (branch: string) => Promise<R>
    /** Every reading kept for this repository — branch, stash, working tree. */
    aiNoteList: () => Promise<{ entries?: {
      kind: 'branch' | 'stash' | 'working'
      key: string; title: string; text: string; at: number; sha: string
      newCommits: number; orphan: boolean
    }[] }>
    aiForgetNote: (kind: string, key: string) => Promise<R>
    aiForgetExplanation: (hash: string) => Promise<R>
    aiGenerateChangelog: (branch: string, base?: string, previous?: string) => Promise<{ changelog?: string; base?: string; commits?: number; error?: string }>
    /** Merges an entry into the repository's own changelog. Only ever adds. */
    /**
     * Merges an entry into the repository's own changelog. Only ever adds —
     * and refuses to choose for you: `needsChoice` when the repository tracks
     * several changelogs, `alreadyMerged` when the branch is already in its
     * base and the bullets are presumably already there. `force` overrides
     * the second; `file` answers the first.
     */
    insertChangelog: (entry: string, opts?: { branch?: string; file?: string; section?: string; force?: boolean; preview?: boolean }) => Promise<{
      path?: string; added?: number; created?: boolean; sectionCreated?: boolean
      /** Lines a previous insert of this changelog wrote, taken back out. */
      removed?: number | string[]; missing?: string[]
      needsChoice?: boolean; candidates?: string[]
      /** The file keeps no section for unreleased work — these are its own. */
      needsSection?: boolean; sections?: string[]
      alreadyMerged?: boolean; branchGone?: boolean; branch?: string; base?: string
      /** `preview` ⇒ nothing was written; this is what writing would do. */
      preview?: boolean; dirty?: boolean
      addedLines?: string[]; skipped?: string[]; existing?: string[]
      similar?: { line: string; existing: string }[]
      error?: string
    }>
    aiProposeCommitSplit: () => Promise<{ groups?: { message: string; files: string[] }[]; unassigned?: string[]; invented?: string[]; error?: string }>
    aiResolveConflict: (filepath: string, instruction?: string) => Promise<Unnarrowed>
    aiSearchCommits: (query: string) => Promise<Unnarrowed>
    aiListModels: () => Promise<Unnarrowed>
    aiListProviderModels: (provider: string, apiKey: string, baseUrl?: string) => Promise<Unnarrowed>
    listAgents: () => Promise<{ agents: { pid: number; name: string; cwd: string }[] }>

    // Settings & git config
    settingsGetAll: () => Promise<Record<string, string>>
    settingsSet: (key: string, value: string) => Promise<R>
    gitGetGlobalConfig: () => Promise<{ userName: string; userEmail: string; error?: string }>
    gitSetGlobalConfig: (userName: string, userEmail: string) => Promise<R>

    // App shell
    appGetInfo: () => Promise<Unnarrowed>
    getWhatsNew: () => Promise<Unnarrowed>
    getReleaseNotes: () => Promise<Unnarrowed>
    markWhatsNewSeen: () => Promise<R>
    openExternal: (url: string) => Promise<R>
    openInEditor: (filepath: string) => Promise<R>
    openPathInEditor: (dir: string) => Promise<R>
    openTerminal: () => Promise<R>
    isFullscreen: () => Promise<boolean>
    onFullscreenChanged: (cb: (fs: boolean) => void) => () => void

    // External tools
    sshBrowseKey: (kind: 'private' | 'public') => Promise<{ path?: string; error?: string }>
    sshGenerateKey: (passphrase?: string) => Promise<Unnarrowed>
    openExternalDiff: (leftContent: string, rightContent: string, filename: string) => Promise<R>
    openExternalMerge: (filepath: string) => Promise<R>
    readTempFile: (absPath: string) => Promise<{ content?: string; error?: string }>

    // GitHub
    githubDetectRepo: () => Promise<{ owner?: string; repo?: string }>
    githubDetectRepoAt: (path: string) => Promise<{ owner?: string; repo?: string }>
    githubCreateRepo: (opts: Unnarrowed) => Promise<Unnarrowed>
    githubCreatePR: (owner: string, repo: string, title: string, body: string, head: string, base: string, draft?: boolean) => Promise<Unnarrowed>
    githubListBranches: (owner: string, repo: string) => Promise<Unnarrowed>
    /** A fork's parent, or null — the composer offers it as a target (#130). */
    githubRepoParent: (owner: string, repo: string)
      => Promise<{ parent: { owner: string; repo: string; defaultBranch: string | null } | null }>
    githubSharePatch: (hash: string) => Promise<Unnarrowed>
    githubShareWipPatch: (repoPath: string) => Promise<Unnarrowed>
    githubListPRs: (owner: string, repo: string) => Promise<Unnarrowed>
    githubListIssues: (owner: string, repo: string) => Promise<Unnarrowed>
    githubSearchIssues: (q: string, force?: boolean) => Promise<Unnarrowed>
    githubGetIssue: (owner: string, repo: string, number: number) => Promise<Unnarrowed>
    githubCloseIssue: (owner: string, repo: string, number: number) => Promise<Unnarrowed>
    githubIssueComments: (owner: string, repo: string, number: number) => Promise<Unnarrowed>
    githubAddIssueComment: (owner: string, repo: string, number: number, body: string) => Promise<Unnarrowed>
    githubUpdateIssue: (owner: string, repo: string, number: number, patch: object) => Promise<Unnarrowed>
    githubListAssignees: (owner: string, repo: string) => Promise<Unnarrowed>
    /** Review is asked for after creation — the create endpoint does not take reviewers (#130). */
    githubRequestReviewers: (owner: string, repo: string, number: number, reviewers: string[]) => Promise<Unnarrowed>
    githubListRepoLabels: (owner: string, repo: string) => Promise<Unnarrowed>
    /** The composer's picker can create a label that does not exist yet (#130). */
    githubCreateLabel: (owner: string, repo: string, name: string, color: string) => Promise<Unnarrowed>
    /** The issue composer: one POST carries title, body, labels and assignees. */
    githubCreateIssue: (owner: string, repo: string, title: string, body: string, labels: string[], assignees: string[]) => Promise<Unnarrowed>
    /** An issue drafted from a sentence — title and body from one call. */
    aiGenerateIssue: (described: string) => Promise<Unnarrowed>
    githubGetPR: (owner: string, repo: string, number: number) => Promise<Unnarrowed>
    githubGetChecks: (owner: string, repo: string, ref: string) => Promise<Unnarrowed>
    githubMergePR: (owner: string, repo: string, number: number, method?: string) => Promise<Unnarrowed>
    githubListRepos: () => Promise<Unnarrowed>
    githubClone: (cloneUrl: string, repoName: string) => Promise<Unnarrowed>
    githubStartAuth: () => Promise<Unnarrowed>
    githubDisconnect: () => Promise<R>
    githubGetToken: () => Promise<{ token: string | null }>
    githubGetUser: () => Promise<{ user: Unnarrowed | null }>
    onGithubAuthComplete: (cb: (result: { token?: string; error?: string }) => void) => () => void
    avatarResolve: (email: string, sha?: string) => Promise<Unnarrowed>

    // File watcher. These return their own unsubscribe — see the preload:
    // the callback that crosses contextBridge is not the object `on`
    // registered, so an `off(cb)` pair could never match it.
    onRepoChanged: (cb: () => void) => () => void
    onWorkingChanged: (cb: () => void) => () => void

    // Updater
    onUpdateAvailable: (cb: (version: string) => void) => () => void
    onUpdateDownloaded: (cb: (version: string) => void) => () => void
    onUpdateError: (cb: (err: string) => void) => () => void
    onDownloadProgress: (cb: (pct: number) => void) => () => void
    downloadUpdate: () => Promise<Unnarrowed>
    installUpdate: () => Promise<Unnarrowed>
    checkForUpdates: () => Promise<Unnarrowed>
    getUpdaterState: () => Promise<{ downloadedVersion: string | null; downloadedFile: string | null }>
    openDownloadedUpdate: () => Promise<Unnarrowed>
    installManual: () => Promise<Unnarrowed>

    themesInstalled?: () => Promise<{
      themes: InstalledTheme[]
      discarded: Array<{ id: string; why: string }>
    }>
  }

  interface Window {
    appInfo: { platform: string }
    gitAPI: GitAPI
  }
}

/** An installed theme as the main process hands it back. */
export interface InstalledTheme {
  id: string
  name: string
  dark: boolean
  lic: string
  src: string
  srcUrl: string
  notice: string
  seeds: Record<string, string>
  installedAt: string
}
