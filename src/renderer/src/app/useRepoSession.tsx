// The repository that is open: its path, commits, branches, stashes, tags, tracking, visibility — and loadRepoData, which reads them all. The seed of a session per repository: everything here is about one repository, keyed by nothing yet.
import React, { useState, useCallback, useRef } from 'react'
import { CommitNode, BranchInfo, ConflictKind, PullMode } from '../types'
import { useBranchMeta } from '../hooks/useBranchMeta'
import { emptyVisibility, logOptionsFor, type GraphVisibility, type RefFamily } from '../utils/graphVisibility'
import { type RemoteRepo } from '../utils/remoteUrl'
import { type StashEntry, type TagEntry, kindsByPath, LOG_PAGE } from './shared'
import type { AppChrome } from './useAppChrome'

export function useRepoSession(app: AppChrome) {
  // ── App state ──────────────────────────────────────────────
  const [repoPath, setRepoPath] = useState<string | null>(null)
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
  // ── Load stashes ───────────────────────────────────────────
  const loadStashes = useCallback(async () => {
    if (!repoPath) return
    const r = await window.gitAPI.getStashes()
    setStashes(r.stashes ?? [])
  }, [repoPath])
  // ── Load tags ──────────────────────────────────────────────
  const loadTags = useCallback(async () => {
    if (!repoPath) return
    const r = await window.gitAPI.getTags()
    setTags((r as any).tags ?? [])
  }, [repoPath])
  // ── Load repo data ─────────────────────────────────────────
  const isLoadingRef = React.useRef(false)
  // A load that arrives while another is running used to be dropped and never
  // retried. That is invisible for a refresh — the next file-watcher event
  // covers it — but not for a filter: hiding a ref would leave the graph
  // showing it until something else happened to trigger a reload.
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
  const loadRepoData = useCallback(async (silent = false) => {
    if (!repoPath) return
    if (isLoadingRef.current) { reloadQueued.current = true; return }
    isLoadingRef.current = true
    if (!silent) setLoading(true)
    try {
      // Branches are still read first: the sidebar needs them, and the log
      // query is built from the visibility state rather than from them.
      const branchRes = await window.gitAPI.getBranches()
      const logRes = await window.gitAPI.getLog(logOptionsFor({
        maxCount: logLimitRef.current,
        all: showAllRef.current,
        solo: soloRef.current,
        visibility: visibilityRef.current,
      }))
      if (logRes.commits) setCommits(logRes.commits)
      if (branchRes.branches) {
        setBranches(branchRes.branches)
        const cur = branchRes.branches.find((b: BranchInfo) => b.current)
        if (cur) setCurrentBranch(cur.name)
      }
      await Promise.all([loadStashes(), loadTags()])
      const [conflictRes, modeRes] = await Promise.all([
        window.gitAPI.getConflictedFiles(),
        window.gitAPI.getConflictMode(),
      ])
      setConflictFiles(conflictRes.files ?? [])
      setConflictKinds(kindsByPath(conflictRes.entries))
      setConflictMode(modeRes.mode)
      const changesRes = await window.gitAPI.getWorkingChanges()
      setWipCount(
        (changesRes.staged?.length ?? 0) +
        (changesRes.unstaged?.length ?? 0) +
        (changesRes.untracked?.length ?? 0)
      )
      try {
        const tr = await (window.gitAPI as any).getTracking()
        setTracking({ ahead: tr?.ahead ?? 0, behind: tr?.behind ?? 0 })
      } catch { /* no upstream */ }
    } finally {
      if (!silent) setLoading(false)
      isLoadingRef.current = false
      if (reloadQueued.current) {
        reloadQueued.current = false
        void loadRepoDataRef.current?.(true)
      }
    }
  }, [repoPath, loadStashes, loadTags])
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
  }, [])
  const loadMoreHistory = useCallback(() => {
    logLimitRef.current += LOG_PAGE
    setLogLimit(logLimitRef.current)
    void loadRepoData(true)
  }, [loadRepoData])

  return {
    repoPath, setRepoPath, repoName, setRepoName, commits, setCommits, logLimit, setLogLimit, logLimitRef, branches, setBranches, currentBranch, setCurrentBranch, selectedCommit, setSelectedCommit, showAllBranches, setShowAllBranches, soloBranch, setSoloBranch, visibility, setVisibility, remoteNames, setRemoteNames, toggleHidden, setFamilyHidden, branchMeta, notedHashes, setNotedHashes, loading, setLoading, recentRepos, setRecentRepos, workspaces, setWorkspaces, stashes, setStashes, tags, setTags, lastFetchTime, setLastFetchTime, pullMode, setPullModeState, handleSetPullMode, tracking, setTracking, githubRepoUrl, setGithubRepoUrl, githubOwnerRepo, setGithubOwnerRepo, remoteRepo, setRemoteRepo, defaultBranch, setDefaultBranch, conflictFiles, setConflictFiles, conflictKinds, setConflictKinds, conflictMode, setConflictMode, wipCount, setWipCount, loadStashes, loadTags, isLoadingRef, reloadQueued, visibilityRef, soloRef, showAllRef, loadRepoData, loadRepoDataRef, filterFirstRun, resolverFileSeenRef, lastAutoFetchError, clearRepoView, loadMoreHistory,
  }
}

export type RepoSession = ReturnType<typeof useRepoSession>
