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
import { forgetGraph, hasGraph, readGraph, writeGraph } from './graph-cache'
import type { AppChrome, ToastAction } from './useAppChrome'
import { useJournal } from '../contexts/JournalContext'

/**
 * Run when the renderer has nothing better to do. `requestIdleCallback` is in
 * Electron and in every browser VS Code runs a webview in, but the timeout
 * fallback keeps this honest in jsdom and anywhere it is missing.
 */
function whenIdle(fn: () => void): void {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback
  if (ric) ric(fn, { timeout: 2000 })
  else setTimeout(fn, 0)
}

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
    // Leaving a repository is the moment worth keeping: what is on screen is
    // settled, and the next visit may well be after the app has been closed.
    if (commits.length) writeGraph(path, { commits, branches, currentBranch, stashes, tags, tracking, logLimit })
  }
  /**
   * Keep this repository's graph for the next visit — throttled, because a
   * refresh can fire four times a second while a rebase runs and the point of
   * the cache is the FIRST frame of the next launch, not this one. Leaving the
   * repository (saveSnapshot) keeps it unconditionally.
   */
  const KEEP_EVERY_MS = 5000
  const lastKept = useRef(new Map<string, number>())
  const keep = (path: string) => {
    const snap = snapshots.current.get(path)
    if (!snap?.commits.length) return
    const now = Date.now()
    if (now - (lastKept.current.get(path) ?? 0) < KEEP_EVERY_MS) return
    lastKept.current.set(path, now)
    const { commits, branches, currentBranch, stashes, tags, tracking, logLimit } = snap
    // ⚠️ Not here, on the thread that is about to draw the graph.
    // localStorage is SYNCHRONOUS: serialising a page of commits and writing
    // 150 kB of it blocks the renderer, and React has not painted the rows
    // yet at this point — the write lands between the state update and the
    // frame. Measured: it put 126 ms on the click-to-graph of a 20,000-commit
    // repository, which is more than everything this branch saves. The cache
    // is for the NEXT launch; it can wait for an idle moment of this one.
    whenIdle(() => writeGraph(path, { commits, branches, currentBranch, stashes, tags, tracking, logLimit }))
  }

  /**
   * Last visit's graph, as a snapshot this window can show. The working tree
   * is NOT part of it — conflicts, the conflict mode and the WIP count are
   * statements about the files on disk right now, and the refresh that
   * follows is making the `git status` they come from anyway. They start
   * empty, which is what an unread repository looks like, rather than wrong.
   */
  const fromDisk = (path: string): RepoSnapshot | null => {
    const kept = readGraph(path)
    if (!kept) return null
    const snap: RepoSnapshot = { ...emptySnapshot(), ...kept }
    snapshots.current.set(path, snap)
    return snap
  }

  /**
   * Show a hidden repository as it was. True if there was a snapshot to show.
   *
   * The one funnel: every way a repository becomes the shown one goes through
   * here — opening it, switching to its tab, closing the one in front of it —
   * which is why the kept graph is restored here and nowhere else. Nothing
   * downstream changes: a restore that succeeds already means the graph is
   * drawn and the refresh that follows is silent.
   */
  const restoreSnapshot = useCallback((path: string): boolean => {
    const snap = snapshots.current.get(path) ?? fromDisk(path)
    if (!snap) { logLimitRef.current = LOG_PAGE; setLogLimit(LOG_PAGE); return false }
    setCommits(snap.commits); setBranches(snap.branches); setCurrentBranch(snap.currentBranch)
    setStashes(snap.stashes); setTags(snap.tags); setTracking(snap.tracking)
    setConflictFiles(snap.conflictFiles); setConflictKinds(snap.conflictKinds); setConflictMode(snap.conflictMode)
    setWipCount(snap.wipCount)
    logLimitRef.current = snap.logLimit; setLogLimit(snap.logLimit)
    return true
  }, [])
  const hasSnapshot = useCallback((path: string) => snapshots.current.has(path) || hasGraph(path), [])
  // A toast about a repository that is not the one shown says which one it
  // is about; one about the shown repository says nothing more. An operation
  // starts on the repository shown at the time and reports when it is done,
  // which can be after a switch: this callback is created per render with the
  // repository of that render, a handler made in the same render carries it,
  // and at the moment of the toast it is compared with what is shown then.
  // `about` names the repository explicitly, for what arrives from the main
  // process with its repository attached. This shadows the chrome's showToast
  // for every hook after this one.
  //
  // It is also where the journal is written (#193). The same `origin` decides
  // both: which repository the chip should name, and whose journal the line
  // goes into — so an operation that reports after a switch is recorded where
  // it ran, not where the user happens to be looking. The journal keeps the
  // message WITHOUT the prefix, since it already has a repository column.
  const chromeToast = app.showToast
  const journal = useJournal()
  const noteJournal = journal.note
  const showToast = useCallback((msg: string, type?: 'ok' | 'err' | 'info', action?: ToastAction | ToastAction[], sticky?: boolean, about?: string | null) => {
    const origin = about === undefined ? repoPath : about
    const elsewhere = !!origin && origin !== activePathRef.current
    noteJournal(origin, msg, type ?? 'ok')
    chromeToast(elsewhere ? `${origin.split('/').pop()} · ${msg}` : msg, type, action, sticky)
  }, [chromeToast, noteJournal, repoPath])
  /** The last tab showing this repository closed: drop what was kept, and the main process's session. */
  const forgetRepo = useCallback((path: string) => {
    snapshots.current.delete(path)
    // A repository the user closed should not reappear, drawn from last week,
    // the next time they open it from the recents.
    forgetGraph(path)
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
      // ── Two waves, and the graph has the first to itself ───
      //
      // A refresh was six waves, each waiting on the last: branches, the log,
      // stashes and tags, conflicts and the mode, the working changes,
      // tracking. Nothing in that list depends on anything else — the log
      // query is built from the visibility state, not from the branches — so
      // the waiting was pure, and on Windows, where starting git.exe costs an
      // order of magnitude more than running it, the waiting IS the refresh.
      //
      // But not ALL at once, which was tried and measured: firing the six
      // together put 85 ms on the click-to-graph of a 20,000-commit
      // repository (223 ms → 308 ms, three runs, no overlap between them).
      // The log is the heavy query and the graph is what the user is waiting
      // for; five more git processes started in the same instant take CPU,
      // disk and the object store away from the one that matters. Parallel is
      // not free, it is a reallocation, and the graph must not be the one
      // paying.
      //
      // So: the graph alone in the first wave, everything else together in
      // the second. Six waves down to two, and the page is asked for by an
      // idle machine.
      const [branchRes, logRes] = await Promise.all([
        api.getBranches(),
        api.getLog(logOptionsFor({
          maxCount: path === activePathRef.current ? logLimitRef.current : (snapshots.current.get(path)?.logLimit ?? LOG_PAGE),
          all: showAllRef.current,
          solo: soloRef.current,
          visibility: visibilityRef.current,
        })),
      ])
      const first: Partial<RepoSnapshot> = {}
      if (logRes.commits) first.commits = logRes.commits
      const cur = branchRes.branches?.find((b: BranchInfo) => b.current)
      if (branchRes.branches) {
        first.branches = branchRes.branches
        if (cur) first.currentBranch = cur.name
      }
      // Ahead/behind comes off the current branch rather than from
      // getTracking, which spent three more processes — rev-parse HEAD,
      // rev-parse @{u}, then a rev-list walk — to recompute what getBranches
      // already read for every branch at once, from `%(upstream:track)` in its
      // single for-each-ref. Detached, or no upstream, leaves both at zero in
      // either version.
      first.tracking = { ahead: cur?.ahead ?? 0, behind: cur?.behind ?? 0 }
      applyLoaded(path, first)

      // The panels, now that the graph is drawn. These five cannot reject — a
      // failure has always been read here as "nothing to show" (`?? []` just
      // below, and getTracking's own catch before this) — which also keeps a
      // rejection from floating unhandled. Branches and the log above keep
      // throwing: those two failing is the repository failing, and the caller
      // has always seen it.
      const [stashRes, tagRes, conflictRes, modeRes, changesRes] = await Promise.all([
        api.getStashes().catch(() => ({ stashes: [] })),
        api.getTags().catch(() => ({ tags: [] })),
        api.getConflictedFiles().catch(() => ({ files: [], entries: [] })),
        api.getConflictMode().catch(() => ({ mode: null })),
        api.getWorkingChanges().catch(() => ({ staged: [], unstaged: [], untracked: [] })),
      ])
      const rest: Partial<RepoSnapshot> = {}
      rest.stashes = stashRes.stashes ?? []
      rest.tags = (tagRes as any).tags ?? []
      rest.conflictFiles = conflictRes.files ?? []
      rest.conflictKinds = kindsByPath(conflictRes.entries)
      rest.conflictMode = modeRes.mode
      rest.wipCount =
        (changesRes.staged?.length ?? 0) +
        (changesRes.unstaged?.length ?? 0) +
        (changesRes.untracked?.length ?? 0)
      applyLoaded(path, rest)
      keep(path)
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
  // The page grown to `limit` commits and reloaded: Load more asks for one
  // page further, the extended search for whatever shows the hit it found
  // beyond the page. A limit not above the current one is nothing to do.
  const growHistory = useCallback((limit: number) => {
    if (limit <= logLimitRef.current) return
    logLimitRef.current = limit
    setLogLimit(limit)
    const path = activePathRef.current
    if (path) snapshots.current.set(path, { ...(snapshots.current.get(path) ?? emptySnapshot()), logLimit: limit })
    void loadRepoData(true)
  }, [loadRepoData])
  const loadMoreHistory = useCallback(() => growHistory(logLimitRef.current + LOG_PAGE), [growHistory])

  return {
    repoPath, setRepoPath, activePathRef, saveSnapshot, restoreSnapshot, hasSnapshot, forgetRepo, showToast, repoName, setRepoName, commits, setCommits, logLimit, setLogLimit, logLimitRef, branches, setBranches, currentBranch, setCurrentBranch, selectedCommit, setSelectedCommit, showAllBranches, setShowAllBranches, soloBranch, setSoloBranch, visibility, setVisibility, remoteNames, setRemoteNames, toggleHidden, setFamilyHidden, branchMeta, notedHashes, setNotedHashes, loading, setLoading, recentRepos, setRecentRepos, workspaces, setWorkspaces, stashes, setStashes, tags, setTags, lastFetchTime, setLastFetchTime, pullMode, setPullModeState, handleSetPullMode, tracking, setTracking, githubRepoUrl, setGithubRepoUrl, githubOwnerRepo, setGithubOwnerRepo, remoteRepo, setRemoteRepo, defaultBranch, setDefaultBranch, conflictFiles, setConflictFiles, conflictKinds, setConflictKinds, conflictMode, setConflictMode, wipCount, setWipCount, loadStashes, loadTags, isLoadingRef, reloadQueued, visibilityRef, soloRef, showAllRef, loadRepoData, loadRepoDataRef, filterFirstRun, resolverFileSeenRef, lastAutoFetchError, clearRepoView, loadMoreHistory, growHistory,
  }
}

export type RepoSession = ReturnType<typeof useRepoSession>
