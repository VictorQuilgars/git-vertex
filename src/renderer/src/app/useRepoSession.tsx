// The repository that is shown, and the ones open behind it.
//
// What the window shows is one repository's state: path, commits, branches,
// stashes, tags, tracking, conflicts. Every other open tab's repository keeps
// a SNAPSHOT of the same state here, so that coming back to it is a restore
// rather than a reload, and a change that happens to it while it is hidden —
// a commit from a terminal, an auto-fetch — refreshes the snapshot quietly.
//
// Every load is about one path, bound at its start: it asks through
// gitAPI.session(path), so the main process answers with that repository's
// service, and it writes its result to that path's snapshot — and to the
// shown state only if that path is still the one shown when the answer comes.
// A response that arrives after a switch lands in the right place instead of
// in whatever repository is open by then.
import React, { useState, useCallback, useRef, useEffect } from 'react'
import { CommitNode, BranchInfo, ConflictKind, PullMode } from '../types'
import { useBranchMeta } from '../hooks/useBranchMeta'
import { emptyVisibility, logOptionsFor, type GraphVisibility, type RefFamily } from '../utils/graphVisibility'
import { type RemoteRepo } from '../utils/remoteUrl'
import { type StashEntry, type TagEntry, kindsByPath, LOG_PAGE } from './shared'
import type { AppChrome, ToastAction } from './useAppChrome'

/** What a hidden tab keeps of its repository, and what a load produces. */
interface RepoSnapshot {
  commits: CommitNode[]
  branches: BranchInfo[]
  currentBranch: string
  stashes: StashEntry[]
  tags: TagEntry[]
  tracking: { ahead: number; behind: number }
  conflictFiles: string[]
  conflictKinds: Record<string, ConflictKind>
  conflictMode: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null
  wipCount: number
  logLimit: number
}
const emptySnapshot = (): RepoSnapshot => ({
  commits: [], branches: [], currentBranch: '', stashes: [], tags: [], tracking: { ahead: 0, behind: 0 },
  conflictFiles: [], conflictKinds: {}, conflictMode: null, wipCount: 0, logLimit: LOG_PAGE,
})

export function useRepoSession(app: AppChrome) {
  // ── App state ──────────────────────────────────────────────
  const [repoPath, setRepoPathState] = useState<string | null>(null)
  // The path the loaders check their answers against — set together with the
  // state, synchronously, so a load that started before a switch can tell it
  // is late — and what the preload binds every plain call to from now on.
  const activePathRef = useRef<string | null>(null)
  const setRepoPath = useCallback((path: string | null) => {
    activePathRef.current = path
    window.gitAPI.setCurrentRepo?.(path)
    setRepoPathState(path)
  }, [])
  const [repoName, setRepoName] = useState<string>('')
  const [commits, setCommits] = useState<CommitNode[]>([])
  // The graph holds a page of history, not the repository: LOG_PAGE commits,
  // then LOG_PAGE more per click. The status bar says how many, because a
  // search over the graph is a search over what was loaded and nothing else.
  const [logLimit, setLogLimit] = useState(LOG_PAGE)
  const logLimitRef = useRef(LOG_PAGE);
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [currentBranch, setCurrentBranch] = useState<string>('')
  const [selectedCommit, setSelectedCommit] = useState<CommitNode | null>(null)
  const [showAllBranches, setShowAllBranches] = useState<boolean>(true)
  // Solo/hide filtering for the graph. Solo shows only one branch; everything
  // else hidden — branches, tags, remotes, the stash — is taken away from the
  // --all view by name. In memory only: it is a view of this session, and a
  // hidden ref that survived a restart would be a graph lying to you on
  // opening, with the thing that explains it three clicks away.
  const [soloBranch, setSoloBranch] = useState<string | null>(null)
  const [visibility, setVisibility] = useState<GraphVisibility>(emptyVisibility())
  // The remotes, so `origin/x` can be told from a local `feature/x` when the
  // graph decides which chips a hidden remote takes with it.
  const [remoteNames, setRemoteNames] = useState<string[]>([])
  /** Toggle one entry of one set, leaving the rest of the visibility alone. */
  const toggleHidden = useCallback((kind: 'branches' | 'tags' | 'remotes', name: string) => {
    setVisibility(prev => {
      const next = new Set(prev[kind])
      next.has(name) ? next.delete(name) : next.add(name)
      return { ...prev, [kind]: next }
    })
  }, [])
  // "Hide all" is one flag, not N marked rows: a branch pushed afterwards is
  // hidden too. "Show all" clears the flag *and* the rows hidden one by one,
  // which is what the section chip promises when it says how many are gone.
  const setFamilyHidden = useCallback((family: RefFamily, hidden: boolean) => {
    setVisibility(prev => {
      const families = new Set(prev.families)
      hidden ? families.add(family) : families.delete(family)
      if (hidden) return { ...prev, families }
      const cleared: Partial<GraphVisibility> = { families }
      if (family === 'tags') cleared.tags = new Set()
      if (family === 'remotes') {
        cleared.remotes = new Set()
        cleared.branches = new Set([...prev.branches].filter(b => !b.startsWith('remotes/')))
      }
      if (family === 'branches') {
        cleared.branches = new Set([...prev.branches].filter(b => b.startsWith('remotes/')))
      }
      return { ...prev, ...cleared }
    })
  }, [])
  // Favorites / graph pins / linked issues, per repo (v1.21.0).
  const branchMeta = useBranchMeta(repoPath)
  // The commits one kept reading covered, pointed at from the AI stack (#70).
  // A separate set from the search's: it is not a query, it survives the
  // search box being cleared, and it is dismissed by pointing at another row.
  const [notedHashes, setNotedHashes] = useState<Set<string> | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [recentRepos, setRecentRepos] = useState<string[]>([])
   // welcome-screen recents filter
  // Named workspaces over the recent repos: { repoPath: workspaceName }
  const [workspaces, setWorkspaces] = useState<Record<string, string>>({})
  const [stashes, setStashes] = useState<StashEntry[]>([])
  const [tags, setTags] = useState<TagEntry[]>([])
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null)
  // Default action bound to the toolbar's split Pull button, set from its
  // dropdown menu and persisted so it survives restarts.
  const [pullMode, setPullModeState] = useState<PullMode>('ff')
  const handleSetPullMode = (mode: PullMode) => {
    setPullModeState(mode)
    window.gitAPI.settingsSet('pullMode', mode)
  }
  const [tracking, setTracking] = useState<{ ahead: number; behind: number }>({ ahead: 0, behind: 0 })
  const [githubRepoUrl, setGithubRepoUrl] = useState<string | null>(null)
  const [githubOwnerRepo, setGithubOwnerRepo] = useState<{ owner: string; repo: string } | null>(null)
  // The repository behind the remote, for building links. Separate from
  // githubOwnerRepo on purpose: that one gates GitHub API calls and is only
  // ever GitHub, while a link can be built for whatever host the remote names.
  const [remoteRepo, setRemoteRepo] = useState<RemoteRepo | null>(null)
  // Branch everything merges into (origin/HEAD). Drives which pull requests
  // make sense at all, so it is loaded with the repo rather than on demand.
  const [defaultBranch, setDefaultBranch] = useState<string | null>(null)
  const [conflictFiles, setConflictFiles] = useState<string[]>([])
  // path → unmerged state, kept beside conflictFiles rather than folded into it
  // so every existing consumer of the plain path list is untouched. Empty when
  // the host does not report kinds — the UI then shows no badge at all.
  const [conflictKinds, setConflictKinds] = useState<Record<string, ConflictKind>>({})
  const [conflictMode, setConflictMode] = useState<'merge' | 'rebase' | 'cherry-pick' | 'revert' | null>(null)
  const [wipCount, setWipCount] = useState(0)

  // ── Snapshots: one per open repository ──────────────────────
  const snapshots = useRef(new Map<string, RepoSnapshot>())
  /** The API bound to `path`: the same calls, answered by that repository. */
  const apiFor = (path: string) => window.gitAPI.session?.(path) ?? window.gitAPI
  /**
   * A load's result: kept in the path's snapshot always, shown only if that
   * path is still the one shown. This is the whole guard against a late answer
   * landing in another repository.
   */
  const applyLoaded = useCallback((path: string, loaded: Partial<RepoSnapshot>) => {
    snapshots.current.set(path, { ...(snapshots.current.get(path) ?? emptySnapshot()), ...loaded })
    if (activePathRef.current !== path) return
    if (loaded.commits) setCommits(loaded.commits)
    if (loaded.branches) setBranches(loaded.branches)
    if (loaded.currentBranch !== undefined) setCurrentBranch(loaded.currentBranch)
    if (loaded.stashes) setStashes(loaded.stashes)
    if (loaded.tags) setTags(loaded.tags)
    if (loaded.tracking) setTracking(loaded.tracking)
    if (loaded.conflictFiles) setConflictFiles(loaded.conflictFiles)
    if (loaded.conflictKinds) setConflictKinds(loaded.conflictKinds)
    if (loaded.conflictMode !== undefined) setConflictMode(loaded.conflictMode)
    if (loaded.wipCount !== undefined) setWipCount(loaded.wipCount)
  }, [])
  /** What the shown repository has right now, kept for when it is hidden. Reads the live values: no useCallback. */
  const saveSnapshot = () => {
    const path = activePathRef.current
    if (!path) return
    snapshots.current.set(path, { commits, branches, currentBranch, stashes, tags, tracking, conflictFiles, conflictKinds, conflictMode, wipCount, logLimit })
  }
  /** Show a hidden repository as it was. True if there was a snapshot to show. */
  const restoreSnapshot = useCallback((path: string): boolean => {
    const snap = snapshots.current.get(path)
    if (!snap) { logLimitRef.current = LOG_PAGE; setLogLimit(LOG_PAGE); return false }
    setCommits(snap.commits); setBranches(snap.branches); setCurrentBranch(snap.currentBranch)
    setStashes(snap.stashes); setTags(snap.tags); setTracking(snap.tracking)
    setConflictFiles(snap.conflictFiles); setConflictKinds(snap.conflictKinds); setConflictMode(snap.conflictMode)
    setWipCount(snap.wipCount)
    logLimitRef.current = snap.logLimit; setLogLimit(snap.logLimit)
    return true
  }, [])
  const hasSnapshot = useCallback((path: string) => snapshots.current.has(path), [])
  // A toast about a repository that is not the one shown says which one it
  // is about; one about the shown repository says nothing more. An operation
  // starts on the repository shown at the time and reports when it is done,
  // which can be after a switch: this callback is created per render with the
  // repository of that render, a handler made in the same render carries it,
  // and at the moment of the toast it is compared with what is shown then.
  // `about` names the repository explicitly, for what arrives from the main
  // process with its repository attached. This shadows the chrome's showToast
  // for every hook after this one.
  const chromeToast = app.showToast
  const showToast = useCallback((msg: string, type?: 'ok' | 'err', action?: ToastAction | ToastAction[], sticky?: boolean, about?: string | null) => {
    const origin = about === undefined ? repoPath : about
    const elsewhere = !!origin && origin !== activePathRef.current
    chromeToast(elsewhere ? `${origin.split('/').pop()} · ${msg}` : msg, type, action, sticky)
  }, [chromeToast, repoPath])
  /** The last tab showing this repository closed: drop what was kept, and the main process's session. */
  const forgetRepo = useCallback((path: string) => {
    snapshots.current.delete(path)
    void window.gitAPI.closeRepo?.(path)
  }, [])

  // ── Load stashes ───────────────────────────────────────────
  const loadStashes = useCallback(async () => {
    const path = activePathRef.current
    if (!path) return
    const r = await apiFor(path).getStashes()
    applyLoaded(path, { stashes: r.stashes ?? [] })
  }, [applyLoaded])
  // ── Load tags ──────────────────────────────────────────────
  const loadTags = useCallback(async () => {
    const path = activePathRef.current
    if (!path) return
    const r = await apiFor(path).getTags()
    applyLoaded(path, { tags: (r as any).tags ?? [] })
  }, [applyLoaded])
  // ── Load repo data ─────────────────────────────────────────
  // One load at a time per repository. A load that arrives while another is
  // running used to be dropped and never retried. That is invisible for a
  // refresh — the next file-watcher event covers it — but not for a filter:
  // hiding a ref would leave the graph showing it until something else
  // happened to trigger a reload. So it is queued, per path.
  const loadingPaths = React.useRef(new Set<string>())
  const queuedPaths = React.useRef(new Set<string>())
  /** Kept for the callers that read them; a load is per path now. */
  const isLoadingRef = React.useRef(false)
  const reloadQueued = React.useRef(false)
  // The filter is read through refs rather than from the closure, so a load
  // always queries with the filter the user can see, whichever callback started
  // it. This mattered urgently while the watcher's subscriptions leaked — what
  // fired was an accumulation of stale handlers, which is how this was found —
  // and that leak is fixed (v1.30.2, the preload hands back its unsubscribe).
  // It stays because it also keeps loadRepoData's identity stable across a hide
  // or a solo: the effect below re-registers on every change of it, and a
  // subscription that is torn down and rebuilt four times a second is worth
  // avoiding whether or not the teardown works.
  const visibilityRef = React.useRef(visibility);
  const soloRef = React.useRef(soloBranch);
  const showAllRef = React.useRef(showAllBranches);
  /**
   * Read everything the graph and the panels show, for `forPath` or the
   * repository shown. Bound to that path from the first call to the last:
   * the answers go to its snapshot, and to the screen only while it is shown.
   */
  const loadRepoData = useCallback(async (silent = false, forPath?: string) => {
    const path = forPath ?? activePathRef.current
    if (!path) return
    if (loadingPaths.current.has(path)) { queuedPaths.current.add(path); return }
    loadingPaths.current.add(path)
    const shown = () => activePathRef.current === path
    if (!silent && shown()) setLoading(true)
    const api = apiFor(path)
    try {
      // Branches are still read first: the sidebar needs them, and the log
      // query is built from the visibility state rather than from them.
      const branchRes = await api.getBranches()
      const logRes = await api.getLog(logOptionsFor({
        maxCount: path === activePathRef.current ? logLimitRef.current : (snapshots.current.get(path)?.logLimit ?? LOG_PAGE),
        all: showAllRef.current,
        solo: soloRef.current,
        visibility: visibilityRef.current,
      }))
      const first: Partial<RepoSnapshot> = {}
      if (logRes.commits) first.commits = logRes.commits
      if (branchRes.branches) {
        first.branches = branchRes.branches
        const cur = branchRes.branches.find((b: BranchInfo) => b.current)
        if (cur) first.currentBranch = cur.name
      }
      applyLoaded(path, first)
      const rest: Partial<RepoSnapshot> = {}
      const [stashRes, tagRes] = await Promise.all([api.getStashes(), api.getTags()])
      rest.stashes = stashRes.stashes ?? []
      rest.tags = (tagRes as any).tags ?? []
      const [conflictRes, modeRes] = await Promise.all([
        api.getConflictedFiles(),
        api.getConflictMode(),
      ])
      rest.conflictFiles = conflictRes.files ?? []
      rest.conflictKinds = kindsByPath(conflictRes.entries)
      rest.conflictMode = modeRes.mode
      const changesRes = await api.getWorkingChanges()
      rest.wipCount =
        (changesRes.staged?.length ?? 0) +
        (changesRes.unstaged?.length ?? 0) +
        (changesRes.untracked?.length ?? 0)
      try {
        const tr = await (api as any).getTracking()
        rest.tracking = { ahead: tr?.ahead ?? 0, behind: tr?.behind ?? 0 }
      } catch { /* no upstream */ }
      applyLoaded(path, rest)
    } finally {
      if (!silent && shown()) setLoading(false)
      loadingPaths.current.delete(path)
      if (queuedPaths.current.delete(path)) void loadRepoDataRef.current?.(true, path)
    }
  }, [applyLoaded])
  // A repository in a hidden tab changed — a commit from a terminal, a fetch:
  // its snapshot follows, quietly, so coming back to it shows the present.
  // The shown repository's changes are the App's own subscription.
  useEffect(() => {
    const off = window.gitAPI.onRepoChangedAny?.((repo) => {
      if (repo && repo !== activePathRef.current && snapshots.current.has(repo)) void loadRepoDataRef.current?.(true, repo)
    })
    return () => off?.()
  }, [])
  // Re-entry after a queued load, without making loadRepoData depend on itself.
  const loadRepoDataRef = React.useRef(loadRepoData);
  // The filter changed — reload with it. Separate from the effect above so
  // that loadRepoData keeps a stable identity across a hide or a solo: every
  // change of its identity re-registers the file watcher, and those
  // registrations accumulate.
  const filterFirstRun = React.useRef(true)
  // Auto-close the resolver if its file gets resolved+staged OUTSIDE the app
  // (e.g. an AI agent calling the MCP server's resolve_conflict directly) —
  // otherwise it's left open showing an already-resolved conflict as if
  // nothing happened. resolverFileSeenRef guards a race right after opening
  // (e.g. via a gitgui://open deep link): conflictFiles may still hold the
  // previous repo's stale/empty snapshot for a tick before the fetch catches
  // up, which would otherwise look identical to "resolved externally".
  const resolverFileSeenRef = useRef<string | null>(null)
  // ── Auto-fetch ─────────────────────────────────────────────
  // The main process owns the timer — one per setting, re-armed when the
  // setting or the repository changes — and this only listens to what it did.
  // There used to be a second timer here on the same setting, so every
  // interval fetched twice, and a run that failed said nothing anywhere. A
  // failure is shown once per distinct message: a remote that is down is one
  // fact, not one toast per interval.
  const lastAutoFetchError = useRef<string | null>(null)
  // ── Tab switching ──────────────────────────────────────────
  // Tear down the repo view (home & launchpad tabs have no repo).
  const clearRepoView = useCallback(() => {
    setRepoPath(null)
    setRepoName('')
    setSelectedCommit(null)
    setCommits([])
    setGithubRepoUrl(null)
    setGithubOwnerRepo(null)
    setDefaultBranch(null)
  }, [setRepoPath])
  const loadMoreHistory = useCallback(() => {
    logLimitRef.current += LOG_PAGE
    setLogLimit(logLimitRef.current)
    const path = activePathRef.current
    if (path) snapshots.current.set(path, { ...(snapshots.current.get(path) ?? emptySnapshot()), logLimit: logLimitRef.current })
    void loadRepoData(true)
  }, [loadRepoData])

  return {
    repoPath, setRepoPath, activePathRef, saveSnapshot, restoreSnapshot, hasSnapshot, forgetRepo, showToast, repoName, setRepoName, commits, setCommits, logLimit, setLogLimit, logLimitRef, branches, setBranches, currentBranch, setCurrentBranch, selectedCommit, setSelectedCommit, showAllBranches, setShowAllBranches, soloBranch, setSoloBranch, visibility, setVisibility, remoteNames, setRemoteNames, toggleHidden, setFamilyHidden, branchMeta, notedHashes, setNotedHashes, loading, setLoading, recentRepos, setRecentRepos, workspaces, setWorkspaces, stashes, setStashes, tags, setTags, lastFetchTime, setLastFetchTime, pullMode, setPullModeState, handleSetPullMode, tracking, setTracking, githubRepoUrl, setGithubRepoUrl, githubOwnerRepo, setGithubOwnerRepo, remoteRepo, setRemoteRepo, defaultBranch, setDefaultBranch, conflictFiles, setConflictFiles, conflictKinds, setConflictKinds, conflictMode, setConflictMode, wipCount, setWipCount, loadStashes, loadTags, isLoadingRef, reloadQueued, visibilityRef, soloRef, showAllRef, loadRepoData, loadRepoDataRef, filterFirstRun, resolverFileSeenRef, lastAutoFetchError, clearRepoView, loadMoreHistory,
  }
}

export type RepoSession = ReturnType<typeof useRepoSession>
