import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Icon } from './components/Icon/Icon'
import { CommitNode, BranchInfo, ConflictKind, FileChange, PullMode, StashScope, type CompareAxis } from './types'
import { useLang } from './i18n/LanguageContext'
import Toolbar from './components/Toolbar/Toolbar'
import Sidebar from './components/Sidebar/Sidebar'
import StatusBar from './components/StatusBar/StatusBar'
import CommitGraph from './components/CommitGraph/CommitGraph'
import RightPanel from './components/RightPanel/RightPanel'
import { PromptDialog, ConfirmDialog } from './components/Dialog/Dialog'
import CommandPalette, { PaletteCommand } from './components/CommandPalette/CommandPalette'
import { Mark } from './components/Mark/Mark'
import { Brand } from './components/BrandMark/BrandMark'
import { ToastProvider, useToast } from './components/Toast/Toast'
import InteractiveRebase from './components/InteractiveRebase/InteractiveRebase'
import UpdateOverlay from './components/UpdateOverlay/UpdateOverlay'
import NotificationCenter, { AppNotification } from './components/NotificationCenter/NotificationCenter'
import ConflictResolver from './components/ConflictResolver/ConflictResolver'
import WhatsNew from './components/WhatsNew/WhatsNew'
import PushModal from './components/PushModal/PushModal'
import SettingsModal from './components/SettingsModal/SettingsModal'
import CloneModal from './components/CloneModal/CloneModal'
import Launchpad from './components/Launchpad/Launchpad'
import ThemeGallery from './components/ThemeGallery/ThemeGallery'
import CompareView from './components/CompareView/CompareView'
import FileHistory from './components/FileHistory/FileHistory'
import RepoManager from './components/RepoManager/RepoManager'
import AssociateIssueModal from './components/IssueLink/AssociateIssueModal'
import { useBranchMeta, type LinkedIssue } from './hooks/useBranchMeta'
import { issueBranchName } from './utils/issueBranch'
import type { GithubListItem } from './components/Sidebar/Sidebar'
import { issueRefLabel, issueRefUrl } from './utils/issueRef'
import { parseAutolinks } from './utils/autolinks'
import { useSettings } from './contexts/SettingsContext'
import {
  emptyVisibility, isRefHidden, logOptionsFor,
  type GraphVisibility, type RefFamily,
} from './utils/graphVisibility'
import InitModal from './components/InitModal/InitModal'
import PRComposer from './components/PRComposer/PRComposer'
import { prIntentFor as computePRIntent, type PRIntent } from './components/ContextMenu/prIntent'
import { repoFromRemotes, remoteUrl, type RemoteRepo } from './utils/remoteUrl'
import { canonicalRef, publishedNameFor } from './components/ContextMenu/branchRefs'
import { buildBranchMenu, type BranchMenuExtras } from './components/ContextMenu/branchMenu'
import GitflowModal from './components/GitflowModal/GitflowModal'
import DiffViewer from './components/DiffViewer/DiffViewer'
import CenterFileDiff, { CenterDiffTarget } from './components/CenterFileDiff/CenterFileDiff'
import IssueDetail from './components/IssueDetail/IssueDetail'
import PRDetail from './components/IssueDetail/PRDetail'
import ContextMenu, { MenuItemDef } from './components/ContextMenu/ContextMenu'
import './App.css'

interface StashEntry { index: number; message: string }
interface TagEntry   { name: string; hash: string }

// Absent `entries` means the host does not report unmerged states (an older
// extension build). Return an empty map so the UI stays silent about the kind
// instead of defaulting every file to "both modified".
function kindsByPath(entries?: { path: string; kind: ConflictKind }[]): Record<string, ConflictKind> {
  if (!entries) return {}
  return Object.fromEntries(entries.map(e => [e.path, e.kind]))
}



// ── Stash content preview ───────────────────────────────────────
// A view, so it opens in a tab: you read a stash while looking at the graph
// that made it, and it stays put when you click elsewhere.
function StashPreview({ index, message }: { index: number; message: string }) {
  const [diff, setDiff] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const { t } = useLang()

  React.useEffect(() => {
    ;(window.gitAPI as any).stashDiff(index).then((r: any) => {
      setDiff(r?.diff ?? '')
      setLoading(false)
    })
  }, [index])

  return (
    <div className="view-page">
      <div className="view-page-header">
        <span className="view-page-title">Stash <code>#{index}</code> — {message}</span>
      </div>
      <div className="view-page-body">
        {loading
          ? <div className="bc-loading">{t('common.loading')}</div>
          : diff.trim() === ''
            ? <div className="bc-empty" style={{ padding: 24 }}>{t('stash.empty')}</div>
            : <DiffViewer commit={syntheticCommit(`stash@{${index}}`, message)} diff={diff} files={[]} loading={false} />}
      </div>
    </div>
  )
}

// Minimal CommitNode so DiffViewer renders its body (it early-returns on null commit).
function syntheticCommit(shortHash: string, message: string): CommitNode {
  return {
    hash: shortHash, shortHash, message,
    author: '', authorEmail: '', date: '', parents: [], refs: []
  }
}


// ── Imperative dialog helpers ──────────────────────────────────
type DialogState =
  | { kind: 'prompt';  message: string; defaultValue?: string; multiline?: boolean; resolve: (v: string | null) => void }
  | { kind: 'confirm'; message: string; danger?: boolean;      resolve: (v: boolean) => void }

// ── Tabs ───────────────────────────────────────────────────────
// Tabs are heterogeneous: the classic repo tab, the "home" welcome screen
// (multiple allowed — every "+" opens a fresh one) and the full-page
// Launchpad (opened by the 🚀 button). `path`/`name` are only set on repo tabs.
type TabKind = 'home' | 'repo' | 'launchpad' | 'themes' | 'view'

/**
 * A view that used to be a window drawn over the graph.
 *
 * The rule, and the reason this exists: a surface that HOLDS something — a
 * comparison, a file's history, a stash's contents — is a tab. It has a title,
 * it survives clicking elsewhere, you can have two, and you close it when you
 * are done. A surface that ASKS something — confirm, name this, pick a remote
 * before pushing — stays a modal: transient, blocking, nothing to come back to.
 *
 * The VS Code panel has worked this way from the start (openGitVertexCompareTab
 * and its siblings); the app drew modals over the graph instead, which is what
 * made it dense.
 */
type ViewTab =
  | { view: 'compare'; a: string; b: string | null; axis?: CompareAxis; label: string }
  | { view: 'fileHistory'; file: string }
  | { view: 'stash'; index: number; message: string }
  | { view: 'fileDiff'; target: CenterDiffTarget }
  | { view: 'settings' }

interface AppTab { id: string; kind: TabKind; path?: string; name?: string; body?: ViewTab }

/** What the tab bar calls a view, and draws for it. */
function viewTabName(body: ViewTab, t: (k: any, ...a: any[]) => string): string {
  switch (body.view) {
    case 'compare': return body.label
    case 'fileHistory': return t('tabs.history', body.file.split('/').pop() ?? body.file)
    case 'stash': return t('tabs.stash', body.index)
    case 'settings': return t('tabs.settings')
    case 'fileDiff': {
      const name = body.target.filePath.split('/').pop() ?? body.target.filePath
      return body.target.type === 'commit'
        ? `${name} (${body.target.commitHash.slice(0, 7)})`
        : `${name} (${t(body.target.area === 'staged' ? 'tabs.staged' : 'tabs.unstaged')})`
    }
  }
}

function viewTabIcon(body: ViewTab): 'compare' | 'history' | 'stash' | 'diff' | 'gear' {
  switch (body.view) {
    case 'compare': return 'compare'
    case 'fileHistory': return 'history'
    case 'stash': return 'stash'
    case 'fileDiff': return 'diff'
    case 'settings': return 'gear'
  }
}

/**
 * Whether a view is about a repository at all.
 *
 * Every one of them is, except the settings: a comparison, a file's history, a
 * stash and a diff are all *of* something checked out, and the main process
 * serves one repository at a time — which is why those tabs carry their path.
 * The settings are the application's own screen, and tying them to a repository
 * meant the gear did nothing at all until one was open.
 */
export function viewNeedsRepo(body: ViewTab): boolean {
  return body.view !== 'settings'
}

/** Two view tabs are the same tab when they show the same thing. */
export function sameView(a: ViewTab, b: ViewTab): boolean {
  if (a.view !== b.view) return false
  if (a.view === 'compare' && b.view === 'compare') return a.a === b.a && a.b === b.b
  if (a.view === 'fileHistory' && b.view === 'fileHistory') return a.file === b.file
  if (a.view === 'stash' && b.view === 'stash') return a.index === b.index
  if (a.view === 'fileDiff' && b.view === 'fileDiff') return sameDiffTarget(a.target, b.target)
  // One settings tab: it shows the whole of a thing, so a second one would
  // be the same tab twice.
  return a.view === 'settings'
}

/** The same file, of the same version — a staged diff is not the unstaged one. */
function sameDiffTarget(a: CenterDiffTarget, b: CenterDiffTarget): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'commit' && b.type === 'commit') return a.commitHash === b.commitHash && a.filePath === b.filePath
  if (a.type === 'working' && b.type === 'working') return a.filePath === b.filePath && a.area === b.area
  return false
}
let tabSeq = 0
const newTabId = (prefix: TabKind) => `${prefix}-${Date.now()}-${tabSeq++}`

/**
 * How often the GitHub lists are asked. GitHub publishes this number itself —
 * `X-Poll-Interval: 60` on its events endpoint — so it is its contract, not
 * our guess. The requests are conditional, so a minute costs nothing while
 * nothing changes.
 */
const GITHUB_POLL_MS = 60_000

export default function App() {
  // ── Dialog state ───────────────────────────────────────────
  const [dlg, setDlg] = useState<DialogState | null>(null)

  const showPrompt = useCallback((message: string, defaultValue = '', multiline = false): Promise<string | null> =>
    new Promise(resolve => setDlg({ kind: 'prompt', message, defaultValue, multiline, resolve }))
  , [])

  const showConfirm = useCallback((message: string, danger = false): Promise<boolean> =>
    new Promise(resolve => setDlg({ kind: 'confirm', message, danger, resolve }))
  , [])

  const closeDlg = useCallback(() => setDlg(null), [])

  // ── App state ──────────────────────────────────────────────
  const [repoPath, setRepoPath] = useState<string | null>(null)
  const [repoName, setRepoName] = useState<string>('')
  const [commits, setCommits] = useState<CommitNode[]>([])
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [currentBranch, setCurrentBranch] = useState<string>('')
  const [selectedCommit, setSelectedCommit] = useState<CommitNode | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [searchMatches, setSearchMatches] = useState(-1)
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
  const [issueModalBranch, setIssueModalBranch] = useState<string | null>(null)
  const [extendedSearch, setExtendedSearch] = useState(false)
  const [extendedSearchHashes, setExtendedSearchHashes] = useState<Set<string>>(new Set())
  const [extendedSearchLoading, setExtendedSearchLoading] = useState(false)
  // AI natural-language search: explicit trigger (Enter / ✨), not per-keystroke.
  const [aiSearch, setAiSearch] = useState(false)
  const [aiSearchHashes, setAiSearchHashes] = useState<Set<string> | null>(null)
  const [aiSearchLoading, setAiSearchLoading] = useState(false)
  // Comparisons and previews are tabs now, not overlays — see ViewTab.
  const [compareBaseHash, setCompareBaseHash] = useState<string | null>(null)
  const [gitflowOpen, setGitflowOpen] = useState(false)
  // ── Tabs (home / repo / launchpad) ──
  const [tabs, setTabs] = useState<AppTab[]>(() => [{ id: 'home-initial', kind: 'home' }])
  const [activeTabId, setActiveTabId] = useState<string | null>('home-initial')
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  const selectedByTab = useRef<Map<string, CommitNode | null>>(new Map())
  const [loading, setLoading] = useState<boolean>(false)
  const [recentRepos, setRecentRepos] = useState<string[]>([])
  const [repoSearch, setRepoSearch] = useState('')   // welcome-screen recents filter
  // Named workspaces over the recent repos: { repoPath: workspaceName }
  const [workspaces, setWorkspaces] = useState<Record<string, string>>({})
  const [stashes, setStashes] = useState<StashEntry[]>([])
  const [tags, setTags] = useState<TagEntry[]>([])
  const [sidebarW, setSidebarW] = useState<number>(230)
  const [rightW, setRightW] = useState<number>(() => {
    const saved = parseInt(localStorage.getItem('app-right-w') ?? '', 10)
    return Number.isFinite(saved) && saved >= 280 ? saved : 360
  })
  useEffect(() => { localStorage.setItem('app-right-w', String(rightW)) }, [rightW])
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null)
  // Default action bound to the toolbar's split Pull button, set from its
  // dropdown menu and persisted so it survives restarts.
  const [pullMode, setPullModeState] = useState<PullMode>('ff')
  useEffect(() => {
    window.gitAPI.settingsGetAll().then(s => {
      const saved = s?.pullMode as PullMode | undefined
      if (saved === 'fetch' || saved === 'ff' || saved === 'ff-only' || saved === 'rebase') setPullModeState(saved)
    }).catch(() => {})
  }, [])
  const handleSetPullMode = (mode: PullMode) => {
    setPullModeState(mode)
    window.gitAPI.settingsSet('pullMode', mode)
  }
  const [tracking, setTracking] = useState<{ ahead: number; behind: number }>({ ahead: 0, behind: 0 })
  const [githubUser, setGithubUser] = useState<{ login: string; avatar: string } | null>(null)
  const [rebaseHash, setRebaseHash] = useState<string | null>(null)
  // Agent proposals arriving via deep link (MCP propose_commit / propose_rebase_plan):
  // preloaded into the staging form / rebase editor for the user to review —
  // nothing is staged, committed or rewritten until the user acts.
  const [commitProposal, setCommitProposal] = useState<{ message: string; files: string[] } | null>(null)
  const [rebasePlanProposal, setRebasePlanProposal] = useState<{ hash: string; action: string; message?: string }[] | null>(null)
  const [pushModalOpen, setPushModalOpen] = useState(false)
  // Repository Management is a full-page overlay (like Settings), reached from
  // the fixed 📁 button — it is NOT a tab.
  const [repoMgmtOpen, setRepoMgmtOpen] = useState(false)
  // Release notes shown once after an update (like VS Code's "what's new" tab).
  const [whatsNew, setWhatsNew] = useState<{ version: string; notes: string } | null>(null)
  // The "what's new" tab is a normal tab: it can stay open in the background
  // while you work in a repo. `whatsNewActive` is whether it's the current view.
  const [whatsNewActive, setWhatsNewActive] = useState(false)
  const [cloneOpen, setCloneOpen] = useState(false)
  const [initModalOpen, setInitModalOpen] = useState(false)
  const [githubConnected, setGithubConnected] = useState(false)
  const [githubRepoUrl, setGithubRepoUrl] = useState<string | null>(null)
  const [githubOwnerRepo, setGithubOwnerRepo] = useState<{ owner: string; repo: string } | null>(null)
  // The repository behind the remote, for building links. Separate from
  // githubOwnerRepo on purpose: that one gates GitHub API calls and is only
  // ever GitHub, while a link can be built for whatever host the remote names.
  const [remoteRepo, setRemoteRepo] = useState<RemoteRepo | null>(null)
  // The two GitHub lists the sidebar shows as sections. `undefined` while there
  // is no GitHub here or no answer yet — the sections then do not render at
  // all, which is not the same as rendering an empty one.
  const [githubPRs, setGithubPRs] = useState<GithubListItem[] | undefined>()
  /** Read inside loadGithubLists without making it depend on the lists. */
  const githubPRsRef = React.useRef(githubPRs); githubPRsRef.current = githubPRs
  const [githubIssues, setGithubIssues] = useState<GithubListItem[] | undefined>()
  const githubIssuesRef = React.useRef(githubIssues); githubIssuesRef.current = githubIssues
  // The signed-in login — what the account groups of PULL REQUESTS filter on.
  const [githubLogin, setGithubLogin] = useState<string | null>(null)
  // The issue being read in the centre (§3 bis) — the third layout: toolbar
  // and left panel kept, graph replaced, commit panel not shown. Belongs to
  // the repository, so a repo switch closes it.
  const [issueDetail, setIssueDetail] = useState<{ kind: 'pr' | 'issue'; item: GithubListItem } | null>(null)
  const [prModalOpen, setPrModalOpen] = useState(false)
  // Which pull request the composer is opening — head, base and whether the
  // head still has to be pushed. Decided by prIntentFor, never by the composer.
  const [prIntent, setPrIntent] = useState<PRIntent | null>(null)
  // The left panel's box — what the composer's drawer measures itself against.
  const sidebarPanelRef = useRef<HTMLDivElement | null>(null)
  // Branch everything merges into (origin/HEAD). Drives which pull requests
  // make sense at all, so it is loaded with the repo rather than on demand.
  const [defaultBranch, setDefaultBranch] = useState<string | null>(null)
  // Update overlay state machine: available → downloading → installing.
  const [updatePhase, setUpdatePhase] = useState<'idle' | 'available' | 'downloading' | 'installing'>('idle')
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [updatePct, setUpdatePct] = useState(0)
  const [updateOverlayOpen, setUpdateOverlayOpen] = useState(false)

  // Notification center (bell in the top bar). Persisted in localStorage so
  // notifications survive restarts.
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    try { return JSON.parse(localStorage.getItem('notifications') ?? '[]') } catch { return [] }
  })
  const [notifsOpen, setNotifsOpen] = useState(false)
  useEffect(() => {
    localStorage.setItem('notifications', JSON.stringify(notifications.slice(0, 50)))
  }, [notifications])
  const unreadCount = notifications.reduce((n, x) => n + (x.read ? 0 : 1), 0)

  // Add a notification, de-duplicated by kind+version so re-checks don't stack.
  const addUpdateNotification = useCallback((version: string) => {
    setNotifications(prev => {
      if (prev.some(n => n.kind === 'update' && n.data?.version === version)) return prev
      const next: AppNotification = {
        id: `update-${version}-${Date.now()}`,
        kind: 'update', data: { version }, ts: Date.now(), read: false,
      }
      return [next, ...prev]
    })
  }, [])

  const [conflictFiles, setConflictFiles] = useState<string[]>([])
  // path → unmerged state, kept beside conflictFiles rather than folded into it
  // so every existing consumer of the plain path list is untouched. Empty when
  // the host does not report kinds — the UI then shows no badge at all.
  const [conflictKinds, setConflictKinds] = useState<Record<string, ConflictKind>>({})
  const [conflictMode, setConflictMode] = useState<'merge' | 'rebase' | 'cherry-pick' | 'revert' | null>(null)
  const [conflictResolverFile, setConflictResolverFile] = useState<string | null>(null)
  // Agent-proposed resolution (from a gitgui://open deep link) to preload into
  // the resolver's manual editor — review-only until the user saves it.
  const [conflictResolverProposal, setConflictResolverProposal] = useState<string | null>(null)
  const [wipCount, setWipCount] = useState(0)
  /**
   * The auto-fetch interval, in minutes — 0 disables it. Read as STATE, not
   * once into a ref: it used to be `localStorage('autoFetch')`, a key nothing
   * in the app ever wrote, so the loop could not be turned off and the setting
   * the user can actually change — `autoFetchInterval`, in Settings — drove
   * only the main process's own timer and never this loop (#141).
   */
  const [autoFetchMinutes, setAutoFetchMinutes] = useState(0)

  // ── Toast (via ToastProvider) ──────────────────────────────
  const toastApi = useToast()
  const { t } = useLang()
  const { get: getSetting } = useSettings()
  // The reference patterns from Settings › GitHub — what lets a linked
  // reference open even when no tracker API is wired for it.
  const autolinks = useMemo(() => parseAutolinks(getSetting('autolinks', '')), [getSetting])
  type ToastAction = { label: string; onClick: () => void }
  const showToast = useCallback((msg: string, type: 'ok' | 'err' = 'ok', action?: ToastAction | ToastAction[], sticky?: boolean) => {
    if (type === 'ok') toastApi.success(msg, action, sticky)
    else toastApi.error(msg, action, sticky)
  }, [toastApi])

  // Tell the user once when their git is too old for the conflict prediction.
  // It fails open — predictConflicts returns nothing and the operation proceeds —
  // so the warning it is supposed to raise before a merge or rebase simply never
  // appears, and nothing on screen says why.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const settings = await window.gitAPI.settingsGetAll().catch(() => null)
      if (cancelled || !settings || settings.gitVersionNoticeShown === 'true') return
      const caps = await window.gitAPI.getGitCapabilities().catch(() => null)
      if (cancelled || !caps?.version || caps.conflictPrediction) return
      showToast(
        t('toast.gitTooOld', caps.version, caps.minimumForPrediction ?? '2.40', caps.path ?? 'git'),
        'err', undefined, true
      )
      window.gitAPI.settingsSet('gitVersionNoticeShown', 'true')
    })()
    return () => { cancelled = true }
  }, [showToast, t])

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
  const visibilityRef = React.useRef(visibility); visibilityRef.current = visibility
  const soloRef = React.useRef(soloBranch); soloRef.current = soloBranch
  const showAllRef = React.useRef(showAllBranches); showAllRef.current = showAllBranches

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
        maxCount: 500,
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
  const loadRepoDataRef = React.useRef(loadRepoData); loadRepoDataRef.current = loadRepoData

  useEffect(() => { loadRepoData() }, [loadRepoData])

  // The filter changed — reload with it. Separate from the effect above so
  // that loadRepoData keeps a stable identity across a hide or a solo: every
  // change of its identity re-registers the file watcher, and those
  // registrations accumulate.
  const filterFirstRun = React.useRef(true)
  useEffect(() => {
    if (filterFirstRun.current) { filterFirstRun.current = false; return }
    loadRepoData(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibility, soloBranch, showAllBranches])

  // GitHub profile (for the top-bar profile chip). Refresh after OAuth too.
  useEffect(() => {
    const load = async () => {
      try {
        const r = await (window.gitAPI as any).githubGetUser()
        setGithubUser(r?.user ?? null)
      } catch { setGithubUser(null) }
    }
    load()
    const off = (window.gitAPI as any).onGithubAuthComplete?.(() => load())
    return off
  }, [])

  // ── Auto-refresh via file watcher events from main process ────
  useEffect(() => {
    const handler = () => loadRepoData(true)
    const offRepo = window.gitAPI.onRepoChanged(handler)
    const offWorking = window.gitAPI.onWorkingChanged(handler)
    return () => { offRepo(); offWorking() }
  }, [loadRepoData])

  // Auto-close the resolver if its file gets resolved+staged OUTSIDE the app
  // (e.g. an AI agent calling the MCP server's resolve_conflict directly) —
  // otherwise it's left open showing an already-resolved conflict as if
  // nothing happened. resolverFileSeenRef guards a race right after opening
  // (e.g. via a gitgui://open deep link): conflictFiles may still hold the
  // previous repo's stale/empty snapshot for a tick before the fetch catches
  // up, which would otherwise look identical to "resolved externally".
  const resolverFileSeenRef = useRef<string | null>(null)
  useEffect(() => {
    if (!conflictResolverFile) { resolverFileSeenRef.current = null; return }
    if (conflictFiles.includes(conflictResolverFile)) {
      resolverFileSeenRef.current = conflictResolverFile
      return
    }
    if (resolverFileSeenRef.current !== conflictResolverFile) return
    resolverFileSeenRef.current = null
    setConflictResolverProposal(null)
    if (conflictFiles.length > 0) {
      setConflictResolverFile(conflictFiles[0])
      showToast(t('toast.resolvedExternalRemaining', conflictFiles.length))
    } else {
      setConflictResolverFile(null)
      showToast(t('toast.conflictResolvedExternal'))
    }
  }, [conflictFiles, conflictResolverFile, showToast])

  // ── Load recent repos on mount ─────────────────────────────
  useEffect(() => {
    window.gitAPI.getRecentRepos().then(r => setRecentRepos(r ?? []))
    ;(window.gitAPI as any).getWorkspaces?.().then((w: Record<string, string>) => setWorkspaces(w ?? {})).catch(() => {})
  }, [])

  // ── "What's new" after an update ───────────────────────────
  // On first launch after a version bump, show the release notes in a tab and
  // mark this version seen so it doesn't reappear.
  useEffect(() => {
    ;(window.gitAPI as any).getWhatsNew?.().then((w: { version: string; notes: string } | null) => {
      if (w) { setWhatsNew(w); setWhatsNewActive(true); (window.gitAPI as any).markWhatsNewSeen?.() }
    }).catch(() => {})
  }, [])


  // ── Extended search ────────────────────────────────────────
  useEffect(() => {
    if (!extendedSearch || !searchQuery.trim() || !repoPath) {
      setExtendedSearchHashes(new Set())
      return
    }
    setExtendedSearchLoading(true)
    const timeout = setTimeout(async () => {
      const r = await window.gitAPI.searchInDiffs(searchQuery.trim())
      setExtendedSearchHashes(new Set(r.hashes ?? []))
      setExtendedSearchLoading(false)
    }, 500)
    return () => clearTimeout(timeout)
  }, [extendedSearch, searchQuery, repoPath])

  // ── AI natural-language search ─────────────────────────────
  const runAiSearch = useCallback(async () => {
    if (!searchQuery.trim() || !repoPath) return
    setAiSearchLoading(true)
    try {
      const r = await (window.gitAPI as any).aiSearchCommits(searchQuery.trim())
      if (r.error) {
        showToast(r.error === 'NO_API_KEY' ? t('toast.noAiKey') : r.error, 'err')
        return
      }
      setAiSearchHashes(new Set(r.hashes ?? []))
    } catch (e: any) {
      showToast(e?.message ?? t('toast.aiError'), 'err')
    } finally {
      setAiSearchLoading(false)
    }
  }, [searchQuery, repoPath, showToast])

  // Leaving AI mode or clearing the query drops the AI result set.
  useEffect(() => {
    if (!aiSearch || !searchQuery.trim()) setAiSearchHashes(null)
  }, [aiSearch, searchQuery])

  // Host-side matches handed to the graph (OR-ed with its local text filter):
  // diff extended-search hits + AI natural-language hits.
  const graphSearchHashes = useMemo(() => {
    const extActive = extendedSearch && searchQuery.trim() !== ''
    if (!extActive && aiSearchHashes == null) return null
    const s = new Set<string>()
    if (extActive) extendedSearchHashes.forEach(h => s.add(h))
    if (aiSearchHashes) aiSearchHashes.forEach(h => s.add(h))
    return s
  }, [extendedSearch, searchQuery, extendedSearchHashes, aiSearchHashes])

  // ── Auto-updater (available → downloading → installing) ─────
  // autoDownload is off in main, so a download only ever starts from the
  // overlay's "Télécharger et installer" — which is why reaching "downloaded"
  // always means the user opted in, and we can go straight to installing.
  useEffect(() => {
    const api = window.gitAPI as any
    const offAvail = api.onUpdateAvailable?.((v: string) => {
      setUpdateVersion(v)
      setUpdatePhase('available')
      addUpdateNotification(v)
    })
    const offProg = api.onDownloadProgress?.((pct: number) => {
      setUpdatePct(pct)
      setUpdatePhase(p => (p === 'installing' ? p : 'downloading'))
    })
    const offDone = api.onUpdateDownloaded?.((v: string) => {
      setUpdateVersion(v)
      setUpdatePhase('installing')
      setUpdateOverlayOpen(true)
      // Let the "installing" message paint before the window vanishes.
      setTimeout(async () => {
        const r = await api.installManual?.()
        if (r?.error) api.installUpdate?.()
      }, 1400)
    })
    return () => { offAvail?.(); offProg?.(); offDone?.() }
  }, [addUpdateNotification])

  const startUpdateDownload = useCallback(() => {
    setUpdatePct(0)
    setUpdatePhase('downloading')
    ;(window.gitAPI as any).downloadUpdate?.()
  }, [])

  // ── GitHub connection state ────────────────────────────────
  useEffect(() => {
    window.gitAPI.githubGetToken().then((r: any) => {
      setGithubConnected(!!r?.token)
    })
    const api = window.gitAPI as any
    return api.onGithubAuthComplete?.((result: any) => {
      setGithubConnected(!!result?.token)
    })
  }, [])

  // ── Auto-fetch ─────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    void window.gitAPI.settingsGetAll().then((s: any) => {
      if (alive) setAutoFetchMinutes(parseInt(s?.autoFetchInterval ?? '0', 10) || 0)
    }).catch(() => {})
    return () => { alive = false }
    // Settings is a tab, not a modal, so there is no close to hook: re-reading
    // on every tab change is what makes editing the interval and coming back
    // take effect without a reload.
  }, [activeTabId])

  useEffect(() => {
    if (!repoPath || !autoFetchMinutes) return
    const id = setInterval(async () => {
      const r = await window.gitAPI.fetch()
      if (r.success) {
        setLastFetchTime(new Date())
        await loadRepoData()
      }
    }, autoFetchMinutes * 60 * 1000)
    return () => clearInterval(id)
  }, [repoPath, autoFetchMinutes, loadRepoData])

  // ── Open repo helpers ──────────────────────────────────────
  // Which section a manual refresh is reading, and a tick per section that
  // tells the saved-filter groups to bypass the search cache (#133).
  const [githubRefreshing, setGithubRefreshing] = useState<'prs' | 'issues' | null>(null)
  const [githubRefreshTick, setGithubRefreshTick] = useState({ prs: 0, issues: 0 })
  /** Bumped by each background poll, so the saved filters re-query with it. */
  const [githubPollTick, setGithubPollTick] = useState(0)

  /**
   * `silent` is a poll rather than something the user asked for (#141). Two
   * things change: a refused read leaves the lists exactly as they are instead
   * of taking the sections away, and nothing is written when the answer came
   * back `notModified` — a list that reorders under an open hover card is
   * worse than a list that is a minute old.
   */
  const loadGithubLists = useCallback(async (base: { owner: string; repo: string }, only?: 'prs' | 'issues', silent = false) => {
    void (window.gitAPI as any).githubGetUser?.()
      .then((r: any) => setGithubLogin(r?.user?.login ?? null))
      .catch(() => setGithubLogin(null))
    const rows = (list: any[] | undefined, kind: 'pr' | 'issue'): GithubListItem[] =>
      (list ?? []).map((x: any) => ({
        number: x.number, title: x.title, author: x.author,
        draft: kind === 'pr' ? !!x.draft : undefined, url: x.url,
        createdAt: x.createdAt, comments: x.comments, labels: x.labels,
        headRef: x.headRef, baseRef: x.baseRef,
        body: x.body, assignees: x.assignees, reviewers: x.reviewers,
      }))
    try {
      // `only` narrows it to the section whose button was pressed: the two are
      // two calls, and refreshing both because one looks stale spends two
      // requests to answer one question.
      const [prs, issues] = await Promise.all([
        only === 'issues' ? null : (window.gitAPI as any).githubListPRs(base.owner, base.repo).catch(() => null),
        only === 'prs' ? null : (window.gitAPI as any).githubListIssues(base.owner, base.repo).catch(() => null),
      ])
      // A refused read costs that section's list, never the section itself —
      // the rule the saved filters already follow. Except on a poll, where it
      // costs nothing at all: the user did not ask, so a blip must not empty
      // what they are looking at.
      // ⚠️ `notModified` means "the same as the last body I handed out" — and
      // the ETag cache lives in the MAIN process, which outlives this renderer.
      // After a window reload the renderer holds nothing while that cache is
      // still warm, so the first load comes back 304. Skipping it there left
      // the sections undefined, which is how they disappear entirely rather
      // than showing as empty. It is only safe to skip when there is already
      // something to keep — and the answer carries the body either way.
      const put = (r: any, current: any, apply: (v: any) => void, shape: () => any) => {
        if (r?.notModified && current !== undefined) return
        if (r?.error) { if (!silent) apply(undefined); return }
        apply(shape())
      }
      if (only !== 'issues') put(prs, githubPRsRef.current, setGithubPRs, () => rows(prs?.prs, 'pr'))
      if (only !== 'prs') put(issues, githubIssuesRef.current, setGithubIssues, () => rows(issues?.issues, 'issue'))
    } catch {
      if (silent) return
      if (only !== 'issues') setGithubPRs(undefined)
      if (only !== 'prs') setGithubIssues(undefined)
    }
  }, [])

  // ── The GitHub lists poll themselves (#141) ────────────────
  //
  // There is no push channel a desktop client can subscribe to — webhooks are
  // server to server. What GitHub offers instead is polling made cheap, and
  // the main process already sends `If-None-Match`: a 304 costs no rate limit
  // at all (measured — 4997 remaining before five of them, 4997 after), and
  // answers `notModified`, which loadGithubLists uses to write nothing.
  //
  // 60 seconds because that is the number GitHub itself publishes on its
  // events endpoint (`X-Poll-Interval: 60`) — its contract rather than one of
  // ours. This is deliberately NOT the git auto-fetch's interval: a fetch
  // costs a network round trip against a remote, a conditional list costs
  // nothing when nothing changed. They are different questions.
  useEffect(() => {
    if (!githubOwnerRepo) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async () => {
      // A window nobody is looking at does not ask. This is what stops a
      // background window from spending a secondary rate limit on a forge no
      // one is reading.
      if (!document.hidden && !stopped) {
        await loadGithubLists(githubOwnerRepo, undefined, true)
        // The named groups come from the list; the saved filters are their own
        // queries and would otherwise re-run only when the list happened to
        // change. They ride the same tick, without forcing.
        setGithubPollTick(n => n + 1)
      }
      if (!stopped) timer = setTimeout(tick, GITHUB_POLL_MS)
    }
    timer = setTimeout(tick, GITHUB_POLL_MS)
    // Coming back to the window asks straight away rather than waiting out the
    // rest of an interval that ran while it was hidden.
    const onVisible = () => { if (!document.hidden && !stopped) void loadGithubLists(githubOwnerRepo, undefined, true) }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [githubOwnerRepo, loadGithubLists])


  /** The section headers' refresh button — one section, and never two at once. */
  const refreshGithubSection = useCallback(async (section: 'prs' | 'issues') => {
    if (!githubOwnerRepo || githubRefreshing) return
    setGithubRefreshing(section)
    try {
      await loadGithubLists(githubOwnerRepo, section)
      // Only after the list is back: the tick is what makes each saved filter
      // re-query with `force`, and they should not race the list they sit under.
      setGithubRefreshTick(t => ({ ...t, [section]: t[section] + 1 }))
    } finally {
      setGithubRefreshing(null)
    }
  }, [githubOwnerRepo, githubRefreshing, loadGithubLists])


  useEffect(() => { setIssueDetail(null) }, [repoPath])

  const detectGithub = useCallback(async () => {
    const detected = await (window.gitAPI as any).githubDetectRepo()
    setGithubOwnerRepo(detected?.owner && detected?.repo
      ? { owner: detected.owner, repo: detected.repo } : null)
    // The lists follow the repository, and a repository with no GitHub — or no
    // token — simply has no sections rather than two empty ones.
    if (detected?.owner && detected?.repo) {
      void loadGithubLists({ owner: detected.owner, repo: detected.repo })
    } else {
      setGithubPRs(undefined); setGithubIssues(undefined)
    }
    // Read the remote itself rather than assuming github.com: this is what
    // every link below is built from, and the only thing that knows the host.
    const rem = await window.gitAPI.getRemotes().catch(() => ({ remotes: [] }))
    const def = await (window.gitAPI as any).getDefaultRemote?.().catch(() => null)
    setRemoteNames((rem?.remotes ?? []).map((r: { name: string }) => r.name))
    const parsed = repoFromRemotes(rem?.remotes ?? [], def?.remote)
    setRemoteRepo(parsed)
    setGithubRepoUrl(parsed ? remoteUrl.repo(parsed) : null)
    const d = await (window.gitAPI as any).getDefaultBranch?.()
    setDefaultBranch(d?.branch ?? null)
  }, [])

  const applyRepo = useCallback(async (res: { path?: string; name?: string; error?: string }) => {
    if (res.path) {
      setWhatsNewActive(false)   // opening a repo leaves the what's-new view
      const name = res.name ?? res.path.split('/').pop()!
      setRepoPath(res.path)
      setRepoName(name)
      setSelectedCommit(null)
      setCommits([])
      const updated = await window.gitAPI.getRecentRepos()
      setRecentRepos(updated ?? [])
      await detectGithub()
      // Register or activate a tab for this repo
      setTabs(prev => {
        // Paths are NFC-normalized in the main process, but a tab registered
        // before that (or from a differently-normalized source) must still
        // match rather than open a second tab on the same repo.
        const existing = prev.find(tb => tb.kind === 'repo' && tb.path!.normalize('NFC') === res.path!.normalize('NFC'))
        if (existing) { setActiveTabId(existing.id); return prev }
        // Opening a repo from a home tab converts that tab in place (the
        // "New Tab" becomes the repo) rather than leaving an empty home behind.
        const active = prev.find(tb => tb.id === activeTabId)
        if (active && active.kind === 'home') {
          return prev.map(tb => tb.id === active.id ? { id: tb.id, kind: 'repo', path: res.path!, name } : tb)
        }
        const id = newTabId('repo')
        setActiveTabId(id)
        return [...prev, { id, kind: 'repo', path: res.path!, name }]
      })
    } else if (res.error && res.error !== 'cancelled') {
      showToast(t('toast.err', res.error), 'err')
    }
  }, [showToast, detectGithub, activeTabId])

  // #127, decided per case against the rule in Toast.tsx: opening a
  // repository is NAVIGATION — the whole window becomes that repository,
  // which is its own confirmation — so these two stay silent on success and
  // let applyRepo report a refusal.
  const handleOpenRepo = async () => applyRepo(await window.gitAPI.openRepo())
  const handleSetRepo = async (path: string) => applyRepo(await window.gitAPI.setRepo(path))
  const handleCreateRepo = async () => {
    const dir = await window.gitAPI.selectDirectory(t('welcome.createHint'))
    if (!dir.path) return
    const res = await (window.gitAPI as any).initRepo(dir.path)
    applyRepo(res)
    // Creating one, though, is a MUTATION: a repository now exists on disk
    // where none did, and nothing else on screen says so.
    if (res?.path) showToast(t('toast.repoCreated'))
  }
  // Open the current release notes on demand (welcome "Notes de version" link).
  const openReleaseNotes = async () => {
    const w = await (window.gitAPI as any).getReleaseNotes?.().catch(() => null)
    if (w) { setWhatsNew(w); setWhatsNewActive(true) }
    else showToast(t('toast.noReleaseNotes'), 'err')
  }
  // A mutation, but a SELF-EVIDENT one — the row leaves the list you removed
  // it from, in front of you. #127's rule sends those to silence.
  const handleRemoveRecent = async (path: string) => {
    const updated = await window.gitAPI.removeRecentRepo(path)
    setRecentRepos(updated ?? [])
  }

  // ── Deep links (gitgui://open — MCP open_in_git_vertex, etc.) ──
  // Open the repo, then route to the requested surface. Commit selection
  // waits for the log to load (deepLinkHash consumed by the effect below).
  const [deepLinkHash, setDeepLinkHash] = useState<string | null>(null)
  const applyDeepLink = useCallback(async (link: { repo: string; view: string; file?: string; hash?: string; proposalContent?: string } | null) => {
    if (!link?.repo) return
    await handleSetRepo(link.repo)
    // A deep link that carries a proposal but arrives without it, or with one
    // we can't parse, used to do nothing at all: the repo opened, no view
    // switched, no error anywhere. The agent meanwhile reported success, so
    // the user was told the message/plan was waiting in the app when it was
    // not. Every failure below is surfaced instead of swallowed.
    const proposalMissing = (what: string) => {
      console.error('[deeplink] missing proposal payload', link)
      showToast(t('deeplink.missing', what), 'err')
    }
    const proposalUnreadable = (what: string, e: unknown) => {
      console.error('[deeplink] malformed proposal payload', link, e)
      showToast(t('deeplink.unreadable', what), 'err')
    }

    if (link.view === 'resolve' && link.file) {
      setConflictResolverFile(link.file)
      // Preload an agent-proposed resolution into the manual editor for
      // review — never applied until the user clicks "Enregistrer & Résoudre".
      setConflictResolverProposal(link.proposalContent ?? null)
    } else if (link.view === 'commit' && link.hash) {
      setDeepLinkHash(link.hash)
    } else if (link.view === 'propose-commit') {
      // MCP propose_commit: preload the message (and proposed file list) into
      // the staging form — the user stages and commits themselves.
      if (!link.proposalContent) { proposalMissing(t('deeplink.what.commitMsg')); return }
      try {
        const p = JSON.parse(link.proposalContent)
        setCommitProposal({
          message: String(p.message ?? ''),
          files: Array.isArray(p.files) ? p.files.map(String) : [],
        })
        setSelectedCommit({
          hash: '__WIP__', shortHash: 'WIP', message: '//WIP',
          author: '', authorEmail: '', date: '', parents: [], refs: []
        })
      } catch (e) { proposalUnreadable(t('deeplink.what.commitMsgCap'), e) }
    } else if (link.view === 'propose-rebase') {
      // MCP propose_rebase_plan: open the visual rebase editor with the
      // agent's plan preloaded — the user reviews and launches it themselves.
      if (!link.hash) { proposalUnreadable(t('deeplink.what.rebasePlanCap'), 'missing base hash'); return }
      if (!link.proposalContent) { proposalMissing(t('deeplink.what.rebasePlan')); return }
      try {
        const p = JSON.parse(link.proposalContent)
        if (!Array.isArray(p.steps)) throw new Error('proposal has no steps array')
        setRebasePlanProposal(p.steps)
        setRebaseHash(link.hash)
      } catch (e) { proposalUnreadable(t('deeplink.what.rebasePlanCap'), e) }
    } else if (link.view !== 'graph') {
      // "graph" is just "open this repo" and needs nothing more; anything else
      // reaching here is a view we know but whose required parameter is absent.
      console.error('[deeplink] nothing to do for this link', link)
      showToast(t('deeplink.incomplete', link.view), 'err')
    }
  }, [showToast])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    ;(window.gitAPI as any).getPendingDeepLink?.().then(applyDeepLink).catch(() => {})
    const off = (window.gitAPI as any).onDeepLink?.(applyDeepLink)
    return off
  }, [applyDeepLink])

  useEffect(() => {
    if (!deepLinkHash || commits.length === 0) return
    const found = commits.find(c => c.hash === deepLinkHash || c.hash.startsWith(deepLinkHash))
    if (found) { setSelectedCommit(found); setDeepLinkHash(null) }
  }, [deepLinkHash, commits])

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

  // "+" → a fresh home ("New Tab") every time.
  const openHomeTab = useCallback(() => {
    if (conflictResolverFile || rebaseHash) return
    setWhatsNewActive(false)
    setRepoMgmtOpen(false)
    if (activeTabId) selectedByTab.current.set(activeTabId, selectedCommit)
    const id = newTabId('home')
    setTabs(prev => [...prev, { id, kind: 'home' }])
    setActiveTabId(id)
    clearRepoView()
  }, [activeTabId, selectedCommit, conflictResolverFile, rebaseHash, clearRepoView])

  // 🚀 → focus the Launchpad if one is open, otherwise open one.
  const openLaunchpadTab = useCallback(() => {
    if (conflictResolverFile || rebaseHash) return
    setWhatsNewActive(false)
    setRepoMgmtOpen(false)
    if (activeTabId) selectedByTab.current.set(activeTabId, selectedCommit)
    setTabs(prev => {
      const existing = prev.find(tb => tb.kind === 'launchpad')
      if (existing) { setActiveTabId(existing.id); return prev }
      const id = newTabId('launchpad')
      setActiveTabId(id)
      return [...prev, { id, kind: 'launchpad' }]
    })
    clearRepoView()
  }, [activeTabId, selectedCommit, conflictResolverFile, rebaseHash, clearRepoView])

  // Appearance → "Browse N more themes". A tab rather than a pane: 4,000 rows
  // want the width, and the choice survives going to a repo and back. One at a
  // time, like the Launchpad.
  const openThemesTab = useCallback(() => {
    if (conflictResolverFile || rebaseHash) return
    setWhatsNewActive(false)
    setRepoMgmtOpen(false)
    if (activeTabId) selectedByTab.current.set(activeTabId, selectedCommit)
    setTabs(prev => {
      const existing = prev.find(tb => tb.kind === 'themes')
      if (existing) { setActiveTabId(existing.id); return prev }
      const id = newTabId('themes')
      setActiveTabId(id)
      return [...prev, { id, kind: 'themes' }]
    })
    clearRepoView()
  }, [activeTabId, selectedCommit, conflictResolverFile, rebaseHash, clearRepoView])

  /**
   * Open a view in a tab — or reveal the one already showing it.
   *
   * The tab carries the repository it belongs to, because the main process
   * holds one repo at a time: a comparison tab left over from another
   * repository would quietly answer with this one's history.
   */
  const openViewTab = useCallback((body: ViewTab) => {
    // An operation in progress is a different matter from a missing repository:
    // switchTab already refuses to move while one runs, so opening a tab under
    // it would strand the user.
    if (conflictResolverFile || rebaseHash) return
    const needsRepo = viewNeedsRepo(body)
    if (needsRepo && !repoPath) return
    setWhatsNewActive(false)
    setRepoMgmtOpen(false)
    if (activeTabId) selectedByTab.current.set(activeTabId, selectedCommit)
    setTabs(prev => {
      // A repository's view is the same tab only within that repository; an
      // application view is the same tab everywhere, so it does not match on a
      // path it does not have.
      const existing = prev.find(tb => tb.kind === 'view' && tb.body && sameView(tb.body, body)
        && (!needsRepo || tb.path === repoPath))
      if (existing) { setActiveTabId(existing.id); return prev }
      const id = newTabId('view')
      setActiveTabId(id)
      return needsRepo
        ? [...prev, { id, kind: 'view' as const, path: repoPath!, name: repoName, body }]
        : [...prev, { id, kind: 'view' as const, body }]
    })
  }, [activeTabId, selectedCommit, conflictResolverFile, rebaseHash, repoPath, repoName])

  const openSettingsTab = useCallback(() => openViewTab({ view: 'settings' }), [openViewTab])

  const switchTab = useCallback(async (tab: AppTab) => {
    setWhatsNewActive(false)   // clicking a tab leaves the what's-new view (tab stays open)
    setRepoMgmtOpen(false)
    if (tab.id === activeTabId) return
    if (conflictResolverFile || rebaseHash) return
    if (activeTabId) selectedByTab.current.set(activeTabId, selectedCommit)
    setActiveTabId(tab.id)
    // A view tab is bound to a repository too: its queries go through the main
    // process, which serves whichever repo was last set.
    if (tab.kind !== 'repo' && tab.kind !== 'view') { clearRepoView(); return }
    // A view with no path is about the application, not about a repository:
    // there is nothing to set, and whatever repository is open stays open
    // behind it so leaving the tab returns to it.
    if (tab.kind === 'view' && !tab.path) return
    if (tab.kind === 'view' && tab.path === repoPath) return
    const r = await window.gitAPI.setRepo(tab.path!)
    if (r.path) {
      setRepoPath(r.path)
      setRepoName(r.name ?? tab.name!)
      setCommits([])
      setSelectedCommit(selectedByTab.current.get(tab.id) ?? null)
      await detectGithub()
    } else if (r.error) {
      showToast(t('toast.err', r.error), 'err')
    }
  }, [activeTabId, selectedCommit, conflictResolverFile, rebaseHash, repoPath, detectGithub, showToast, clearRepoView])

  const closeTab = useCallback((id: string) => {
    selectedByTab.current.delete(id)
    setTabs(prev => {
      const idx = prev.findIndex(tb => tb.id === id)
      const next = prev.filter(tb => tb.id !== id)
      if (id === activeTabId) {
        // Never leave the window tab-less: fall back to a neighbour, or seed a
        // fresh home if this was the last tab.
        if (next.length === 0) {
          const home: AppTab = { id: newTabId('home'), kind: 'home' }
          setActiveTabId(home.id)
          clearRepoView()
          return [home]
        }
        const fallback = next[Math.max(0, idx - 1)]
        setActiveTabId(fallback.id)
        if (fallback.kind === 'repo') {
          window.gitAPI.setRepo(fallback.path!).then(r => {
            if (r.path) {
              setRepoPath(r.path)
              setRepoName(r.name ?? fallback.name!)
              setCommits([])
              setSelectedCommit(selectedByTab.current.get(fallback.id) ?? null)
              detectGithub()
            }
          })
        } else {
          clearRepoView()
        }
      }
      return next
    })
  }, [activeTabId, detectGithub, clearRepoView])

  const closeOtherTabs = useCallback((id: string) => {
    const kept = tabs.find(tb => tb.id === id)
    setTabs(prev => prev.filter(tb => tb.id === id))
    for (const key of Array.from(selectedByTab.current.keys())) {
      if (key !== id) selectedByTab.current.delete(key)
    }
    setActiveTabId(id)
    // Reconcile the body if the survivor isn't the repo currently loaded.
    if (kept && kept.kind !== 'repo') clearRepoView()
    else if (kept && kept.kind === 'repo' && kept.path !== repoPath) {
      window.gitAPI.setRepo(kept.path!).then(r => {
        if (r.path) {
          setRepoPath(r.path); setRepoName(r.name ?? kept.name!)
          setCommits([]); setSelectedCommit(selectedByTab.current.get(kept.id) ?? null); detectGithub()
        }
      })
    }
  }, [tabs, repoPath, clearRepoView, detectGithub])

  // ── Git operations ─────────────────────────────────────────
  const handleUndo = async () => {
    setLoading(true)
    const r = await window.gitAPI.undoLastAction()
    if (r.success) { showToast(`↩ ${r.action ?? t('toast.undoFallback')}`); await loadRepoData() }
    else showToast(r.error ?? t('toast.cannotUndo'), 'err')
    setLoading(false)
  }

  const handleRedo = async () => {
    setLoading(true)
    const r = await window.gitAPI.redoLastAction()
    if (r.success) { showToast(`↪ ${r.action ?? t('toast.redoFallback')}`); await loadRepoData() }
    else showToast(r.error ?? t('toast.nothingToRedo'), 'err')
    setLoading(false)
  }

  // "Annuler" button offered on toasts after history-rewriting operations
  const undoAction = () => ({ label: t('toast.undo'), onClick: () => { void handleUndo() } })

  // ── Keyboard shortcuts ─────────────────────────────────────
  // Declared after handleUndo so the dependency array doesn't hit a temporal
  // dead zone (referencing a `const` before its initialization throws at render).
  useEffect(() => {
    const isInput = (e: KeyboardEvent) =>
      ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)

    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault(); setPaletteOpen(o => !o); return
      }
      // Cmd/Ctrl+, opens preferences (macOS convention)
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault(); openSettingsTab(); return
      }
      if (e.key === 'F5' || ((e.metaKey || e.ctrlKey) && e.key === 'r')) {
        if (!isInput(e)) { e.preventDefault(); loadRepoData() }; return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey && !isInput(e)) {
        e.preventDefault(); handleUndo(); return
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z') && !isInput(e)) {
        e.preventDefault(); handleRedo(); return
      }
      if (e.key === 'Escape') {
        if (conflictResolverFile) return
        setSelectedCommit(null)
        setPaletteOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [loadRepoData, handleUndo, handleRedo, conflictResolverFile])

  const handleFetch = async () => {
    setLoading(true)
    const r = await window.gitAPI.fetch()
    if (r.success) { showToast(t('toast.fetchOk')); await loadRepoData() }
    else showToast(t('toast.fetchErr', r.error ?? ''), 'err')
    setLoading(false)
  }

  const handlePush = async () => {
    if (!repoPath) return
    setLoading(true)
    const { upstream } = await window.gitAPI.getUpstream()
    setLoading(false)
    if (upstream) {
      // upstream configured → push direct
      const r = await window.gitAPI.push()
      if (r.success) { showToast(t('toast.pushOk', upstream)); await loadRepoData() }
      else showToast(t('toast.pushErr', r.error ?? ''), 'err')
    } else {
      // no upstream → open modal to configure
      setPushModalOpen(true)
    }
  }

  // Navigation: it opens the push modal, which is the confirmation.
  const handlePushModal = () => {
    if (repoPath) setPushModalOpen(true)
  }

  const handleStash = async () => {
    if (!repoPath) return
    const r = await window.gitAPI.createStash()
    if ((r as any)?.success === false) showToast(t('toast.stashErr', (r as any).error ?? ''), 'err')
    else { showToast(t('toast.stashCreated')); await loadRepoData() }
  }

  const handlePop = async () => {
    if (!repoPath || stashes.length === 0) return
    const r = await window.gitAPI.popStash(0)
    if ((r as any)?.success === false) showToast(t('toast.stashErr', (r as any).error ?? ''), 'err')
    else { showToast(t('toast.stashPopped', 0)); await loadRepoData() }
  }

  // Navigation: a terminal window opens, which is the confirmation.
  const handleTerminal = async () => {
    if (!repoPath) return
    const r = await (window.gitAPI as any).openTerminal?.()
    if (r?.success === false) showToast(r.error ?? t('toast.terminalError'), 'err')
  }

  const handlePull = async () => {
    await guardConflict(
      // Predicts the merge of the already-known upstream tip; pull will fetch
      // first, so brand-new upstream commits aren't seen here (advisory).
      () => window.gitAPI.predictConflicts('@{u}'),
      async () => {
        setLoading(true)
        const r = await window.gitAPI.pull(pullMode === 'fetch' ? undefined : pullMode)
        if (r.success) { showToast(t('toast.pullOk')); await loadRepoData() }
        else showToast(t('toast.pullErr', r.error ?? ''), 'err')
        setLoading(false)
      },
    )
  }

  /**
   * Run something that moves HEAD, stashing the working tree around it when the
   * Auto-stash setting is on. Every way of arriving on a branch goes through
   * here — plain checkout, creating a tracking branch, creating a branch at a
   * commit — so none of them can lose local changes the others protect.
   */
  const withAutoStash = async (
    label: string,
    run: () => Promise<{ success: boolean; error?: string }>,
  ) => {
    const settings = await window.gitAPI.settingsGetAll().catch(() => ({} as any))
    let stashed = false
    if (settings?.autoStash === 'true') {
      const changes = await window.gitAPI.getWorkingChanges()
      const hasChanges = (changes.staged?.length ?? 0) + (changes.unstaged?.length ?? 0) + (changes.untracked?.length ?? 0) > 0
      if (hasChanges) {
        const sr = await window.gitAPI.createStash('Auto-stash before checkout')
        if (sr.success) { stashed = true; showToast(t('toast.autoStashed')) }
      }
    }
    const r = await run()
    if (r.success) {
      if (stashed) {
        const pr = await window.gitAPI.popStash(0)
        if (pr.success) showToast(`${t('toast.checkoutOk', label)}${t('toast.stashRestoredSuffix')}`)
        else showToast(`${t('toast.checkoutOk', label)}${t('toast.stashRestoreFailSuffix')}`, 'err')
      } else {
        showToast(t('toast.checkoutOk', label))
      }
      await loadRepoData()
    } else {
      if (stashed) await window.gitAPI.popStash(0)
      showToast(t('toast.checkoutErr', r.error ?? ''), 'err')
    }
    return r
  }

  /**
   * "Take me here" — the double-click on a branch row, a ref chip or a commit.
   * It always lands on a LOCAL BRANCH: git decides which case applies
   * (getCheckoutPlan) and this only carries it out. Detaching HEAD is reserved
   * for the context menu's explicit "check out this commit".
   */
  const handleGoTo = async (ref: string) => {
    const plan = await (window.gitAPI as any).getCheckoutPlan(ref)
    if (!plan || plan.error) { showToast(t('toast.checkoutErr', plan?.error ?? ''), 'err'); return }
    switch (plan.action) {
      case 'already-here':
        showToast(t('toast.alreadyOnBranch', plan.branch))
        return
      case 'checkout-local':
        await handleCheckout(plan.branch)
        return
      case 'create-tracking':
        // A remote branch with no local counterpart: the local branch that
        // tracks it is unambiguous, so it is created without asking.
        await withAutoStash(plan.branch, () =>
          (window.gitAPI as any).checkoutTracking(plan.remoteRef, plan.branch))
        return
      case 'create-branch': {
        // Nothing to land on. Ask for a name — deliberately empty: any
        // suggestion here would be a guess about what this branch is for.
        const name = await showPrompt(t('prompt.branchHere', plan.shortHash), '')
        if (!name || !name.trim()) return
        await withAutoStash(name.trim(), () =>
          window.gitAPI.createBranchAt(name.trim(), plan.hash, true))
        return
      }
    }
  }

  const handleCheckout = async (name: string) => {
    // Auto-stash: if enabled and there are local changes, stash before checkout and pop after
    const settings = await window.gitAPI.settingsGetAll().catch(() => ({} as any))
    const autoStash = settings?.autoStash === 'true'
    let stashed = false
    if (autoStash) {
      const changes = await window.gitAPI.getWorkingChanges()
      const hasChanges = (changes.staged?.length ?? 0) + (changes.unstaged?.length ?? 0) + (changes.untracked?.length ?? 0) > 0
      if (hasChanges) {
        const sr = await window.gitAPI.createStash('Auto-stash before checkout')
        if (sr.success) { stashed = true; showToast(t('toast.autoStashed')) }
      }
    }
    const r = await window.gitAPI.checkout(name)
    if (r.success) {
      if (stashed) {
        const pr = await window.gitAPI.popStash(0)
        if (pr.success) showToast(`${t('toast.checkoutOk', name)}${t('toast.stashRestoredSuffix')}`)
        else showToast(`${t('toast.checkoutOk', name)}${t('toast.stashRestoreFailSuffix')}`, 'err')
      } else {
        showToast(t('toast.checkoutOk', name))
      }
      await loadRepoData()
    } else {
      if (stashed) await window.gitAPI.popStash(0)
      showToast(t('toast.checkoutErr', r.error ?? ''), 'err')
    }
  }

  // Checking out a tag detaches HEAD — git's own behaviour, but silent enough
  // that the toast says so explicitly rather than leaving the user wondering
  // why the branch indicator changed (v1.23.0).
  const handleCheckoutTag = async (name: string) => {
    const r = await window.gitAPI.checkout(name)
    if (r.success) { showToast(t('toast.tagCheckedOut', name)); await loadRepoData() }
    else showToast(t('toast.checkoutErr', r.error ?? ''), 'err')
  }

  const handleCreateBranch = useCallback(async () => {
    const name = await showPrompt(t('prompt.newBranch'))
    if (!name) return
    try {
      const r = await window.gitAPI.createBranch(name)
      if (r.success) { showToast(t('toast.branchCreated', name)); await loadRepoData() }
      else showToast(t('toast.err', r.error ?? ''), 'err')
    } catch (e: any) {
      showToast(t('toast.unexpected', e?.message ?? e), 'err')
    }
  }, [showPrompt, showToast, loadRepoData])

  const handleDeleteBranch = async (name: string) => {
    const ok = await showConfirm(t('prompt.deleteBranch', name), true)
    if (!ok) return
    const r = await window.gitAPI.deleteBranch(name)
    if (r.success) { showToast(t('toast.branchDeleted', name)); await loadRepoData() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }

  // Abandoning a branch means both ends of it. One confirmation, and the local
  // side goes first so a remote that refuses (protected branch) leaves the pair
  // visibly half-done rather than silently dropping the local work.
  const handleDeleteBranchBoth = async (name: string, remoteName: string) => {
    const ok = await showConfirm(t('prompt.deleteBoth', name, remoteName), true)
    if (!ok) return
    const local = await window.gitAPI.deleteBranch(name)
    if (!local.success) { showToast(t('toast.err', local.error ?? ''), 'err'); return }
    const remote = await window.gitAPI.deleteRemoteBranch(`remotes/${remoteName}`)
    if (remote.success) showToast(t('toast.branchesDeleted', name, remoteName))
    else showToast(t('toast.err', remote.error ?? ''), 'err')
    await loadRepoData()
  }

  // Warn (per the user's `warnBeforeConflict` setting) before an operation that
  // is predicted to conflict. `predict` returns the files that would clash —
  // empty means clean OR the prediction couldn't run, and either way we don't
  // block. On a predicted conflict a sticky toast offers Continue, "don't ask
  // again" (flips the setting off, then continues), or dismiss (×) to cancel.
  const guardConflict = useCallback(async (
    predict: () => Promise<{ files: string[]; error?: string }>,
    op: () => void | Promise<void>,
  ) => {
    const settings = await window.gitAPI.settingsGetAll().catch(() => ({} as Record<string, string>))
    if ((settings as any)?.warnBeforeConflict === 'false') { await op(); return }
    const { files } = await predict().catch(() => ({ files: [] as string[] }))
    if (files.length === 0) { await op(); return }   // clean, or prediction unavailable
    showToast(
      t('toast.conflictPredicted', String(files.length)),
      'err',
      [
        { label: t('toast.conflictContinue'), onClick: () => { void op() } },
        { label: t('toast.conflictDontAsk'), onClick: () => {
          void window.gitAPI.settingsSet('warnBeforeConflict', 'false')
          void op()
        } },
      ],
      true,   // sticky — a go/no-go decision must not silently time out
    )
  }, [showToast, t])

  const handleMergeBranch = async (name: string) => {
    const ok = await showConfirm(t('prompt.mergeBranch', name, currentBranch))
    if (!ok) return
    await guardConflict(
      () => window.gitAPI.predictConflicts(name),
      async () => {
        setLoading(true)
        const r = await window.gitAPI.merge(name)
        if (r.success) { showToast(t('toast.mergeOk', name)); await loadRepoData() }
        else showToast(t('toast.mergeErr', r.error ?? ''), 'err')
        setLoading(false)
      },
    )
  }

  const handleRebaseOnto = async (name: string) => {
    const ok = await showConfirm(t('prompt.rebaseOnto', currentBranch, name))
    if (!ok) return
    await guardConflict(
      // Accurate rebase prediction: simulates the per-commit replay.
      () => window.gitAPI.predictRebaseConflicts(name),
      async () => {
        setLoading(true)
        const r = await window.gitAPI.rebaseOnto(name)
        if (r.success) showToast(t('toast.rebaseOntoOk', name))
        else showToast(t('toast.err', r.error ?? ''), 'err')
        // Refresh even on a conflict — the rebase is left paused (not aborted),
        // so the conflict banner/resolver needs the reloaded state to show up.
        await loadRepoData()
        setLoading(false)
      },
    )
  }

  const handlePushBranch = async (name: string) => {
    setLoading(true)
    const r = await window.gitAPI.pushBranch(name)
    if (r.success) { showToast(t('toast.pushOk', name)); await loadRepoData() }
    else showToast(t('toast.pushErr', r.error ?? ''), 'err')
    setLoading(false)
  }

  const handleDeleteRemoteBranch = async (name: string) => {
    const ok = await showConfirm(t('prompt.deleteRemoteBranch', name), true)
    if (!ok) return
    setLoading(true)
    const r = await window.gitAPI.deleteRemoteBranch(name)
    if (r.success) { showToast(t('toast.branchDeleted', name)); await loadRepoData() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
    setLoading(false)
  }

  const handleSetUpstream = async (name: string) => {
    const r = await window.gitAPI.setUpstream(name)
    if (r.success) { showToast(t('toast.upstreamSet', name)); await loadRepoData() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }

  const handleRenameBranch = async (name: string) => {
    const newName = await showPrompt(t('prompt.renameBranch', name), name)
    if (!newName || newName === name) return
    const r = await window.gitAPI.renameBranch(name, newName)
    if (r.success) { showToast(t('toast.branchRenamed', newName)); await loadRepoData() }
    else showToast(t('toast.renameErr', r.error ?? ''), 'err')
  }

  // ── Commit context menu operations ─────────────────────────
  const handleCreateBranchAt = async (hash: string) => {
    const name = await showPrompt(t('prompt.newBranch'))
    if (!name) return
    const checkout = await showConfirm(t('prompt.checkoutNow', name))
    try {
      const r = await window.gitAPI.createBranchAt(name, hash, checkout)
      if (r.success) {
        showToast(checkout ? t('toast.branchCreatedCheckout', name) : t('toast.branchCreated', name))
        await loadRepoData()
      } else {
        showToast(t('toast.err', r.error ?? ''), 'err')
      }
    } catch (e: any) {
      showToast(t('toast.unexpected', e?.message ?? e), 'err')
    }
  }

  const handleCherryPick = async (hash: string) => {
    await guardConflict(
      // Cherry-pick = 3-way merge with the commit's parent as base.
      () => window.gitAPI.predictConflicts(hash, 'HEAD', `${hash}^`),
      async () => {
        setLoading(true)
        const r = await window.gitAPI.cherryPick(hash)
        if (r.success) { showToast(t('toast.cherryPickOk', hash.slice(0, 7))); await loadRepoData() }
        else showToast(t('toast.cherryPickErr', r.error ?? ''), 'err')
        setLoading(false)
      },
    )
  }

  const handleRevert = async (hash: string) => {
    await guardConflict(
      // Revert = apply the inverse: base is the commit, "theirs" its parent.
      () => window.gitAPI.predictConflicts(`${hash}^`, 'HEAD', hash),
      async () => {
        setLoading(true)
        const r = await window.gitAPI.revert(hash)
        if (r.success) { showToast(t('toast.revertOk', hash.slice(0, 7))); await loadRepoData() }
        else showToast(t('toast.revertErr', r.error ?? ''), 'err')
        setLoading(false)
      },
    )
  }

  const handleReset = async (hash: string, mode: 'soft' | 'mixed' | 'hard') => {
    if (mode === 'hard') {
      const ok = await showConfirm(t('prompt.resetHard', hash.slice(0, 7)), true)
      if (!ok) return
    }
    setLoading(true)
    const r = await window.gitAPI.reset(hash, mode)
    if (r.success) {
      showToast(t('toast.resetOk', mode, hash.slice(0, 7)), 'ok', undoAction())
      setSelectedCommit(null)
      await loadRepoData()
    } else {
      showToast(t('toast.resetErr', r.error ?? ''), 'err')
    }
    setLoading(false)
  }

  // Reword works on any commit: HEAD is a plain amend; any other commit goes
  // through a targeted mini-rebase (pick everything, reword just that one),
  // reusing the same interactiveRebase(sequence, messages) infra the
  // interactive-rebase planner uses for squash/reword messages.
  // `presetMsg` (AI recompose) prefills the review prompt with a proposed
  // message instead of the current one — the user still reviews and confirms.
  /**
   * Put `message` on a commit that is not the tip, by replaying the range from
   * its parent with a `reword` step. Every commit after it gets a new sha.
   *
   * Split out of handleRewordCommit so the commit panel's inline editor can
   * apply what the user already typed, instead of opening a second prompt on
   * top of the text they just wrote.
   */
  const applyReword = async (hash: string, message: string) => {
    const current = commits.find(c => c.hash === hash || c.hash.startsWith(hash))
    if (!current || current.parents.length === 0) {
      showToast(t('toast.err', t('toast.cannotRewordFirst')), 'err')
      return
    }
    setLoading(true)
    const seq = await window.gitAPI.getRebaseSequence(current.parents[0])
    const sequence = seq.commits.map(c => ({ action: c.hash === current.hash ? 'reword' : 'pick', hash: c.hash }))
    const r = await window.gitAPI.interactiveRebase(sequence, [message])
    setLoading(false)
    if (r.success) { showToast(t('toast.messageEdited')); await loadRepoData() }
    else if ((r as { conflict?: boolean }).conflict) { showToast(r.error ?? t('toast.rebaseConflict'), 'err'); await loadRepoData() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }

  const handleRewordCommit = async (hash: string, presetMsg?: string) => {
    const current = commits.find(c => c.hash === hash || c.hash.startsWith(hash))
    if (!current) return
    const isHead = current.refs.some(r => r.includes('HEAD ->') && r.includes(currentBranch))

    if (isHead) {
      const fullMsg = (await window.gitAPI.getLastCommitMessage()).message || current.message
      const newMsg = await showPrompt(t('prompt.editMessage'), presetMsg ?? fullMsg, true)
      if (newMsg === null || newMsg.trim() === '' || newMsg === fullMsg) return
      const r = await window.gitAPI.amendMessage(newMsg)
      if (r.success) { showToast(t('toast.messageEdited')); await loadRepoData() }
      else showToast(t('toast.err', r.error ?? ''), 'err')
      return
    }

    if (current.parents.length === 0) {
      showToast(t('toast.err', t('toast.cannotRewordFirst')), 'err')
      return
    }
    const newMsg = await showPrompt(t('prompt.editMessage'), presetMsg ?? current.message, true)
    if (newMsg === null || newMsg.trim() === '' || newMsg === current.message) return
    await applyReword(hash, newMsg)
  }

  const handleDropCommit = async (hash: string) => {
    const ok = await showConfirm(t('prompt.dropCommit', hash.slice(0, 7)), true)
    if (!ok) return
    setLoading(true)
    const r = await window.gitAPI.dropCommit(hash)
    if (r.success) { showToast(t('toast.commitDropped', hash.slice(0, 7)), 'ok', undoAction()); setSelectedCommit(null); await loadRepoData() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
    setLoading(false)
  }

  const handleRebaseCurrentOntoCommit = async (hash: string) => {
    await guardConflict(
      () => window.gitAPI.predictRebaseConflicts(hash),   // accurate per-commit replay
      async () => {
        setLoading(true)
        const r = await window.gitAPI.rebaseOnto(hash)
        if (r.success) showToast(t('toast.rebasedOn', hash.slice(0, 7)))
        else showToast(t('toast.err', r.error ?? ''), 'err')
        // Refresh even on a conflict — the rebase is left paused (not aborted),
        // so the conflict banner/resolver needs the reloaded state to show up.
        await loadRepoData()
        setLoading(false)
      },
    )
  }

  const handlePushToCommit = async (hash: string) => {
    setLoading(true)
    const r = await window.gitAPI.pushToCommit(hash)
    if (r.success) showToast(t('toast.pushedTo', hash.slice(0, 7)))
    else showToast(t('toast.err', r.error ?? ''), 'err')
    setLoading(false)
  }

  const handleCreatePatch = async (hash: string) => {
    const res = await window.gitAPI.createPatch(hash)
    if (res.error) { showToast(t('toast.err', res.error), 'err'); return }
    const r = await window.gitAPI.savePatchFile(res.patch, `${hash.slice(0, 7)}.patch`)
    if (r.success) showToast(t('toast.patchSaved', r.path?.split('/').pop() ?? ''))
    else if (!r.canceled) showToast(t('toast.err', r.error ?? ''), 'err')
  }

  const handleCopyPatch = async (hash: string) => {
    const res = await window.gitAPI.createPatch(hash)
    if (res.error) { showToast(t('toast.err', res.error), 'err'); return }
    navigator.clipboard.writeText(res.patch)
    showToast(t('toast.patchCopied'))
  }

  // Cloud Patches without a server: the patch goes to a secret gist and the
  // shareable link lands in the clipboard.
  const handleSharePatch = async (hash: string) => {
    const res = await (window.gitAPI as any).githubSharePatch(hash)
    if (res.error === 'not_authenticated') { showToast(t('toast.sharePatch.needAuth'), 'err'); return }
    if (res.error === 'gist_scope') { showToast(t('toast.sharePatch.gistScope'), 'err'); return }
    if (res.error) { showToast(t('toast.err', res.error), 'err'); return }
    navigator.clipboard.writeText(res.url)
    showToast(t('toast.sharePatch.copied'), 'ok', { label: t('toast.open'), onClick: () => (window.gitAPI as any).openExternal(res.url) })
  }

  const handleCreateWorktreeAt = async (hash: string) => {
    const dir = await window.gitAPI.selectDirectory(t('worktree.selectDir'))
    if (!dir.path) return
    const branch = await showPrompt(t('worktree.branchPrompt'), '')
    if (branch === null) return
    const r = await window.gitAPI.addWorktree(dir.path, hash, branch || undefined)
    if (r.success) showToast(t('toast.worktreeCreated', dir.path.split('/').pop() ?? ''))
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }

  // Which pull request a branch row offers — see prIntent.ts for the rules.
  // Handed to every surface that shows branch actions so they all agree.
  const prIntentFor = useCallback(
    (branchRef: string) =>
      githubOwnerRepo
        ? computePRIntent(branchRef, {
            currentBranch, defaultBranch, branches,
            // The list the panel already holds — the same one that puts the
            // #N chip on a branch. A row must not offer to start what that
            // chip says is already open (rule 6).
            openPRs: githubPRs,
          })
        : null,
    [githubOwnerRepo, currentBranch, defaultBranch, branches, githubPRs]
  )

  // The push itself happens in the composer, right before the GitHub call.
  // Navigation: this opens the composer, and the composer reports its own
  // outcome — nothing has changed yet at this point.
  const handleStartPR = (intent: PRIntent) => {
    if (!githubOwnerRepo) { showToast(t('pr.noRemote'), 'err'); return }
    setPrIntent(intent)
    setPrModalOpen(true)
  }

  // The four openers below are NAVIGATION — a browser comes to the front with
  // the page in it. They speak only to say they cannot go (#127, decided per
  // case): a chip confirming a window you are already looking at is the noise
  // that pushes a real one off the stack.
  const handleOpenCommitOnRemote = (hash: string) => {
    if (!remoteRepo) { showToast(t('toast.noGithubRepo'), 'err'); return }
    window.gitAPI.openExternal(remoteUrl.commit(remoteRepo, hash))
  }

  // The pull request the checked-out branch offers — null on the default
  // branch, which is where requests land rather than start. The toolbar
  // button, the branch strip and the PULL REQUESTS header's `+` all follow it.
  const currentBranchPR = prIntentFor(currentBranch)

  const handleCopyBranchLink = (name: string) => {
    if (!remoteRepo) { showToast(t('toast.noGithubRepo'), 'err'); return }
    navigator.clipboard.writeText(remoteUrl.branch(remoteRepo, name))
    showToast(t('toast.linkCopied'))
  }

  // A file inside a commit: the one place we know both a path and the exact ref
  // it existed at. Linking at the commit rather than at a branch is the whole
  // point — the line numbers stay true.
  const handleOpenFileOnRemote = (hash: string, filePath: string) => {
    if (!remoteRepo) { showToast(t('toast.noGithubRepo'), 'err'); return }
    window.gitAPI.openExternal(remoteUrl.file(remoteRepo, hash, filePath))
  }

  const handleCopyFileLink = (hash: string, filePath: string) => {
    if (!remoteRepo) { showToast(t('toast.noGithubRepo'), 'err'); return }
    navigator.clipboard.writeText(remoteUrl.file(remoteRepo, hash, filePath))
    showToast(t('toast.linkCopied'))
  }

  // The other direction of the v1.21.0 issue link, and the one people reach
  // for: you pick up an issue and you need a branch for it. The suggested name
  // is only a suggestion — what is typed wins — and the link is written for
  // the branch that was actually created, not for the one we proposed.
  const handleCreateBranchFromIssue = async (issue: { number: number; title: string; url: string }) => {
    // The GitHub panel is the only list we can enumerate, so what arrives here
    // is always a GitHub issue. It becomes a reference at this boundary rather
    // than deeper down, so the shape stored is the same one a typed reference
    // produces.
    const ref: LinkedIssue = {
      provider: 'github', key: String(issue.number), title: issue.title, url: issue.url,
    }
    const label = issueRefLabel(ref)
    const name = await showPrompt(t('gh.issue.branchPrompt', label), issueBranchName(ref.key, ref.title))
    if (!name) return
    const r = await window.gitAPI.createBranch(name)
    if (!r.success) { showToast(r.error ?? t('toast.branchFailed'), 'err'); return }
    branchMeta.setIssue(name, ref)
    showToast(t('toast.branchFromIssue', name, label))
    loadRepoData()
  }

  // Restoring writes over the working copy, so it asks first — and it lands as
  // a pending change rather than a staged one, which is what makes "I did not
  // mean that" a diff you can read instead of an unstage.
  const handleRestoreFile = async (hash: string, filePath: string) => {
    const ok = await showConfirm(t('confirm.restoreFile', filePath, hash.slice(0, 7)), true)
    if (!ok) return
    const r = await window.gitAPI.restoreFileFromCommit(hash, [filePath])
    if (r.success) { showToast(t('toast.fileRestored', filePath)); loadRepoData(true) }
    else showToast(r.error ?? t('toast.restoreFailed'), 'err')
  }

  const handleOpenBranchesOnRemote = () => {
    if (!remoteRepo) { showToast(t('toast.noGithubRepo'), 'err'); return }
    window.gitAPI.openExternal(remoteUrl.branches(remoteRepo))
  }

  const handleCopyCommitLink = (hash: string) => {
    if (!remoteRepo) { showToast(t('toast.noGithubRepo'), 'err'); return }
    navigator.clipboard.writeText(remoteUrl.commit(remoteRepo, hash))
    showToast(t('toast.linkCopied'))
  }

  // Every branch action, wired to the state that only lives here, for any
  // surface that cannot assemble the menu itself. The graph used to build its
  // own thin version and so quietly lacked Push, Rename, Delete and the rest;
  // it now asks for this one instead.
  const branchMenuItems = useCallback((
    target: { name: string; display: string; current: boolean; remote: boolean },
    extras?: BranchMenuExtras,
  ): MenuItemDef[] => {
    // A chip carries git's decoration (`origin/x`); handlers and branch
    // metadata are keyed by the branch-list form (`remotes/origin/x`).
    const ref = canonicalRef(target.name, branches)
    const short = ref.replace(/^remotes\/[^/]+\//, '')
    const publishedAs = publishedNameFor(ref, branches) ?? undefined
    const pr = prIntentFor(ref)
    return buildBranchMenu(
      { ...target, name: ref, pr: pr ?? undefined, publishedAs },
      {
        currentBranch,
        soloed: soloBranch === ref,
        hidden: isRefHidden(ref, visibility, remoteNames),
        favorite: branchMeta.isFavorite(ref),
        issue: branchMeta.issueFor(ref),
      },
      {
        onCheckout: () => handleCheckout(target.remote ? short : ref),
        onPull: handlePull,
        onPush: () => handlePushBranch(ref),
        onSetUpstream: () => handleSetUpstream(ref),
        onCreatePR: pr ? () => handleStartPR(pr) : undefined,
        onMerge: () => handleMergeBranch(ref),
        onRebaseOnto: () => handleRebaseOnto(ref),
        onCompare: () => openViewTab({ view: 'compare', a: currentBranch, b: ref, axis: 'diverged', label: `${currentBranch} … ${ref}` }),
        onOpenOnRemote: () => handleOpenBranchOnRemote(ref),
        onAssociateIssue: () => setIssueModalBranch(ref),
        onToggleFavorite: () => branchMeta.toggleFavorite(ref),
        onToggleSolo: () => setSoloBranch(prev => prev === ref ? null : ref),
        onToggleHide: () => toggleHidden('branches', ref),
        onCopyName: () => navigator.clipboard.writeText(target.display),
        onCopyLink: () => handleCopyBranchLink(ref),
        onRename: () => handleRenameBranch(ref),
        onDelete: () => handleDeleteBranch(ref),
        onDeleteRemote: () => handleDeleteRemoteBranch(target.remote ? ref : `remotes/${publishedAs}`),
        onDeleteBoth: publishedAs ? () => handleDeleteBranchBoth(ref, publishedAs) : undefined,
      },
      t,
      extras
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches, currentBranch, soloBranch, visibility, remoteNames, branchMeta, prIntentFor, githubOwnerRepo, t])

  // Branch strip above the staging file list (v1.22.0) — same actions as the
  // toolbar and the ⋮ menu, just brought next to the files they apply to.
  const branchStripProps = {
    branch: currentBranch,
    ahead: tracking.ahead,
    behind: tracking.behind,
    onPush: handlePush,
    onPull: handlePull,
    onFetch: handleFetch,
    issue: branchMeta.issueFor(currentBranch),
    pr: currentBranchPR,
    onAssociateIssue: () => setIssueModalBranch(currentBranch),
    // Where a linked reference points. The tracker's own URL first, then the
    // configured patterns; a GitHub number falls back to the repository's own
    // issue URL, which is the one thing issueRefUrl cannot build for itself.
    onOpenIssue: (ref: LinkedIssue) => {
      const url = issueRefUrl(ref, autolinks)
        ?? (ref.provider === 'github' && remoteRepo && /^\d+$/.test(ref.key)
          ? remoteUrl.issue(remoteRepo, Number(ref.key))
          : null)
      if (url) window.gitAPI.openExternal(url)
    },
    menuState: {
      soloed: soloBranch === currentBranch,
      hidden: isRefHidden(currentBranch, visibility, remoteNames),
      favorite: branchMeta.isFavorite(currentBranch),
    },
    menuActions: {
      onPull: handlePull,
      onPush: handlePush,
      onSetUpstream: () => handleSetUpstream(currentBranch),
      onCreatePR: currentBranchPR ? () => handleStartPR(currentBranchPR) : undefined,
      onOpenOnRemote: () => handleOpenBranchOnRemote(currentBranch),
      onOpenBranchesOnRemote: handleOpenBranchesOnRemote,
      onAssociateIssue: () => setIssueModalBranch(currentBranch),
      onToggleFavorite: () => branchMeta.toggleFavorite(currentBranch),
      onToggleSolo: () => setSoloBranch(prev => prev === currentBranch ? null : currentBranch),
      onCopyName: () => navigator.clipboard.writeText(currentBranch),
      onRename: () => handleRenameBranch(currentBranch),
    },
  }

  // Same as above one level up: /tree/<branch>. Existed for commits only until
  // v1.21.0, which is why "Open Branch on Remote" was nowhere to be found.
  const handleOpenBranchOnRemote = (name: string) => {
    if (!remoteRepo) { showToast(t('toast.noGithubRepo'), 'err'); return }
    window.gitAPI.openExternal(remoteUrl.branch(remoteRepo, name))
  }

  // Drag branch A onto a target. `targetBranch` (B) is set when the drop landed
  // on a branch tip, which is the only case that offers "merge". Direction
  // follows the gesture: merge A INTO B, rebase A ONTO B, reset A to the target.
  const handleBranchDrop = async (branch: string, hash: string, action: 'reset' | 'rebase' | 'merge', targetBranch?: string) => {
    if (action === 'merge' && !targetBranch) return   // merge needs a branch to merge into
    const short = hash.slice(0, 7)
    if (action === 'reset') {
      const ok = await showConfirm(t('prompt.dropReset', branch, targetBranch ?? short), true)
      if (!ok) return
    }
    // merge updates the TARGET branch (and checks it out); rebase/reset update A.
    const updated = action === 'merge' ? targetBranch! : branch
    const run = async () => {
      setLoading(true)
      const r = action === 'reset'
        ? await window.gitAPI.moveBranchTo(branch, hash)
        : action === 'rebase'
          ? await window.gitAPI.rebaseBranchOnto(branch, hash)             // rebase A onto B's tip
          : await window.gitAPI.mergeCommitInto(targetBranch!, branch)     // checkout B, merge A (merge A into B)
      if (r.success) {
        showToast(t('toast.branchDropOk', updated), 'ok', undoAction())
      } else {
        showToast(t('toast.err', r.error ?? ''), 'err')
      }
      // Always load repo data to catch conflicts that prevent success
      await loadRepoData()
      setLoading(false)
    }
    // Reset just moves a ref — it can't conflict. Merge/rebase can.
    if (action === 'reset') { await run(); return }
    await guardConflict(
      action === 'merge'
        ? () => window.gitAPI.predictConflicts(branch, targetBranch)       // merge A into B
        : () => window.gitAPI.predictRebaseConflicts(hash, branch),        // rebase A onto B's tip
      run,
    )
  }

  const handleMoveCommit = async (hash: string, direction: 'up' | 'down') => {
    setLoading(true)
    const r = await window.gitAPI.moveCommit(hash, direction)
    if (r.success) { showToast(t('toast.commitMoved'), 'ok', undoAction()); await loadRepoData() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
    setLoading(false)
  }

  // ── Tag operations ─────────────────────────────────────────
  const handleCreateTagAtCommit = async (hash: string) => {
    const name = await showPrompt(t('prompt.tagName'))
    if (!name) return
    const message = await showPrompt(t('prompt.tagMessage'))
    const r = await window.gitAPI.createTag(name, hash, message || undefined)
    if (r.success) { showToast(t('toast.tagCreated', name)); await loadRepoData() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }

  // An annotated tag is its own git object — it carries an author, a date and a
  // message, which is what release tooling reads. The message is therefore
  // required here, unlike the lightweight tag above where it is optional.
  const handleCreateAnnotatedTagAtCommit = async (hash: string) => {
    const name = await showPrompt(t('prompt.tagName'))
    if (!name) return
    const message = await showPrompt(t('prompt.annotatedTagMessage'))
    if (!message) return
    const r = await window.gitAPI.createTag(name, hash, message)
    if (r.success) { showToast(t('toast.tagCreated', name)); await loadRepoData() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }

  const handleCreateTag = async () => {
    const name = await showPrompt(t('prompt.tagName'))
    if (!name) return
    const message = await showPrompt(t('prompt.tagMessage'))
    const r = await window.gitAPI.createTag(name, undefined, message || undefined)
    if (r.success) { showToast(t('toast.tagCreated', name)); await loadRepoData() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }

  const handleDeleteTag = async (name: string) => {
    const ok = await showConfirm(t('prompt.deleteTag', name), true)
    if (!ok) return
    const r = await window.gitAPI.deleteTag(name)
    if (r.success) { showToast(t('toast.tagDeleted', name)); await loadTags() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }

  const handlePushTag = async (name: string) => {
    const r = await window.gitAPI.pushTag(name)
    if (r.success) showToast(t('toast.tagPushed', name))
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }

  const handleDeleteRemoteTag = async (name: string) => {
    const ok = await showConfirm(t('prompt.deleteRemoteTag', name), true)
    if (!ok) return
    const r = await window.gitAPI.deleteRemoteTag(name)
    if (r.success) { showToast(t('toast.tagDeletedRemote', name)); await loadTags() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }

  // ── Stash operations ───────────────────────────────────────
  const handleCreateStash = async (scope: StashScope = 'all') => {
    const message = await showPrompt(t('prompt.stashMessage'))
    if (message === null) return
    const r = await window.gitAPI.createStash(message || undefined, scope === 'all' ? undefined : { scope })
    if (r.success) { showToast(t('toast.stashCreated')); await Promise.all([loadStashes(), loadRepoData()]) }
    else showToast(t('toast.stashErr', r.error ?? ''), 'err')
  }

  const handleApplyStash = async (index: number) => {
    const r = await window.gitAPI.applyStash(index)
    if (r.success) { showToast(t('toast.stashApplied', index)); await loadRepoData() }
    else showToast(t('toast.applyErr', r.error ?? ''), 'err')
  }

  const handlePopStash = async (index: number) => {
    const r = await window.gitAPI.popStash(index)
    if (r.success) {
      showToast(t('toast.stashPopped', index))
      await Promise.all([loadStashes(), loadRepoData()])
    } else {
      showToast(t('toast.popErr', r.error ?? ''), 'err')
    }
  }

  const handleDropStash = async (index: number) => {
    const ok = await showConfirm(t('prompt.deleteStash', index), true)
    if (!ok) return
    const r = await window.gitAPI.dropStash(index)
    if (r.success) { showToast(t('toast.stashDropped', index)); await loadStashes() }
    else showToast(t('toast.dropErr', r.error ?? ''), 'err')
  }

  // ── Conflict resolution handlers ───────────────────────────
  const handleConflictFinish = async (action: 'rebase' | 'merge', message?: string) => {
    setLoading(true)
    // The operation that produced the conflict dictates which --continue to run.
    // conflictMode is authoritative; `action` is only the resolver's coarse hint.
    const mode = conflictMode ?? action
    let r: { success: boolean; error?: string }
    if (mode === 'rebase') {
      r = await window.gitAPI.continueRebase()
    } else if (mode === 'cherry-pick') {
      r = await window.gitAPI.continueCherryPick()
    } else if (mode === 'revert') {
      r = await window.gitAPI.continueRevert()
    } else {
      r = await window.gitAPI.continueMerge(message)
    }

    if (r.success) {
      showToast(mode === 'rebase' ? t('toast.rebaseContinued') : t('toast.mergeContinued'))
      setConflictFiles([])
      setConflictMode(null)
      await loadRepoData()
    } else {
      showToast(t('toast.err', r.error ?? ''), 'err')
    }
    setLoading(false)
  }

  const handleConflictAbort = async () => {
    setLoading(true)
    // Each operation has its own --abort; using the wrong one fails silently.
    if (conflictMode === 'merge') {
      await window.gitAPI.abortMerge()
      showToast(t('toast.mergeAborted'))
    } else if (conflictMode === 'cherry-pick') {
      await window.gitAPI.abortCherryPick()
      showToast(t('toast.rebaseAborted'))
    } else if (conflictMode === 'revert') {
      await window.gitAPI.abortRevert()
      showToast(t('toast.rebaseAborted'))
    } else {
      await window.gitAPI.abortRebase()
      showToast(t('toast.rebaseAborted'))
    }
    setConflictFiles([])
    setConflictMode(null)
    await loadRepoData()
    setLoading(false)
  }

  // ── Command palette commands ───────────────────────────────
  const buildPaletteCommands = (): PaletteCommand[] => {
    const cmds: PaletteCommand[] = [
      { id: 'fetch', label: 'Fetch', icon: '⬇', action: handleFetch },
      { id: 'pull', label: 'Pull', icon: '⇩', action: handlePull },
      { id: 'push', label: 'Push', icon: '⬆', action: handlePush },
      { id: 'new-branch', label: t('palette.newBranch'), icon: '⎇', action: handleCreateBranch },
      { id: 'open-repo', label: t('palette.openRepo'), icon: '📂', action: handleOpenRepo },
      { id: 'refresh', label: t('palette.refresh'), icon: '↺', action: loadRepoData },
    ]
    if (repoPath) {
      branches.filter(b => !b.remote && !b.current).forEach(b => {
        cmds.push({
          id: `checkout-${b.name}`,
          label: t('palette.checkout', b.name),
          icon: '✓',
          action: () => handleCheckout(b.name),
        })
      })
      branches.filter(b => !b.remote && !b.current).forEach(b => {
        cmds.push({
          id: `merge-${b.name}`,
          label: t('palette.merge', b.name),
          icon: '⇒',
          action: () => handleMergeBranch(b.name),
        })
      })
      tags.forEach(t => {
        cmds.push({
          id: `tag-${t.name}`,
          label: `Tag: ${t.name}`,
          icon: '🏷',
          action: () => {
            const found = commits.find(c => c.hash.startsWith(t.hash))
            if (found) setSelectedCommit(found)
          },
        })
      })
      stashes.forEach(s => {
        cmds.push({
          id: `stash-${s.index}`,
          label: t('palette.applyStash', s.message.replace(/^stash@\{\d+\}: /, '')),
          icon: '📦',
          action: () => handleApplyStash(s.index),
        })
      })
    }
    return cmds
  }

  // ── Resize handlers ────────────────────────────────────────
  const startResizeSidebar = (e: React.MouseEvent) => {
    e.preventDefault()
    const sx = e.clientX, sw = sidebarW
    const move = (ev: MouseEvent) => setSidebarW(Math.max(160, Math.min(400, sw + ev.clientX - sx)))
    const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up) }
    addEventListener('mousemove', move); addEventListener('mouseup', up)
  }

  // The graph must keep at least ~45% of the window, whatever the panel width
  const clampRightW = (w: number) =>
    Math.max(Math.min(360, Math.floor(window.innerWidth * 0.3)), Math.min(w, 600, Math.floor(window.innerWidth * 0.45)))

  useEffect(() => {
    const onResize = () => setRightW(w => clampRightW(w))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const startResizeRight = (e: React.MouseEvent) => {
    e.preventDefault()
    const sx = e.clientX, rw = rightW
    const move = (ev: MouseEvent) => setRightW(clampRightW(rw - (ev.clientX - sx)))
    const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up) }
    addEventListener('mousemove', move); addEventListener('mouseup', up)
  }

  const isMac = (window as any).appInfo?.platform === 'darwin'
  // macOS fullscreen hides the traffic lights, so the 72px spacer must go.
  const [isFullscreen, setIsFullscreen] = useState(false)
  useEffect(() => {
    ;(window.gitAPI as any).isFullscreen?.().then((fs: boolean) => setIsFullscreen(!!fs)).catch(() => {})
    return (window.gitAPI as any).onFullscreenChanged?.((fs: boolean) => setIsFullscreen(!!fs))
  }, [])
  const activeTab = tabs.find(tb => tb.id === activeTabId)
  const launchpadActive = activeTab?.kind === 'launchpad'
  const themesActive = activeTab?.kind === 'themes'
  const viewTab = activeTab?.kind === 'view' ? activeTab.body : undefined

  return (
    <div className="app">
      {/* ── Repo tabs (top, browser-style) ── */}
      {/* Tabs stay visible in preferences; also keep the bar
          when settings is open with no tabs so the mac traffic lights keep their
          spacing and the window stays draggable. */}
      {/* Always render the top bar so Settings/profile stay reachable from the
          welcome screen too (not only once a repo/tab is open). */}
      {(
        <div className="app-tabs">
          {isMac && !isFullscreen && <div className="app-tabs-mac-spacer" />}
          {/* 📁 Repository Management — a fixed button opening a full-page
              overlay (like Settings), never a tab. */}
          <button className={`app-tab-launch ${repoMgmtOpen ? 'active' : ''}`}
            title={t('repomgmt.tooltip')} onClick={() => { setWhatsNewActive(false); setRepoMgmtOpen(o => !o) }}><Icon name="folder" size={16} /></button>
          {/* 🚀 Launchpad launcher — always reachable. */}
          <button className={`app-tab-launch ${tabs.find(tb => tb.id === activeTabId)?.kind === 'launchpad' && !whatsNewActive ? 'active' : ''}`}
            title={t('launchpad.tooltip')} onClick={() => openLaunchpadTab()}><Icon name="rocket" size={16} /></button>
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`app-tab ${tab.id === activeTabId && !whatsNewActive ? 'active' : ''}`}
              onClick={() => switchTab(tab)}
              onAuxClick={e => { if (e.button === 1) { e.preventDefault(); closeTab(tab.id) } }}
              onContextMenu={e => { e.preventDefault(); setTabMenu({ x: e.clientX, y: e.clientY, id: tab.id }) }}
              title={tab.kind === 'repo' ? tab.path : undefined}
            >
              {tab.kind === 'repo' ? (
                <Icon name="repo" size={16} className="app-tab-icon" />
              ) : (
                <Icon size={16} className="app-tab-icon app-tab-icon--tool"
                  name={tab.kind === 'launchpad' ? 'rocket'
                    : tab.kind === 'themes' ? 'ink'
                    : tab.kind === 'view' ? viewTabIcon(tab.body!)
                    : 'home'} />
              )}
              <span className="app-tab-name">{
                tab.kind === 'repo' ? tab.name
                  : tab.kind === 'launchpad' ? t('launchpad.title')
                  : tab.kind === 'themes' ? t('tabs.themes')
                  : tab.kind === 'view' ? viewTabName(tab.body!, t)
                  : t('tabs.home')
              }</span>
              <button className="app-tab-close" title={t('tabs.close')}
                onClick={e => { e.stopPropagation(); closeTab(tab.id) }}>×</button>
            </div>
          ))}
          {rebaseHash && (
            <div className="app-tab app-tab--tool active" title={t('tabs.rebase')}>
              <Icon name="rebase" size={16} className="app-tab-icon app-tab-icon--tool" />
              <span className="app-tab-name">{t('tabs.rebase')}</span>
              <button className="app-tab-close" title={t('tabs.close')}
                onClick={e => { e.stopPropagation(); setRebaseHash(null) }}>×</button>
            </div>
          )}
          {whatsNew && (
            <div className={`app-tab app-tab--tool ${whatsNewActive ? 'active' : ''}`} title={t('tabs.whatsNew')}
              onClick={() => { setRepoMgmtOpen(false); setWhatsNewActive(true) }}>
              <Icon name="ai" size={16} className="app-tab-icon app-tab-icon--tool" />
              <span className="app-tab-name">{t('tabs.whatsNew')}</span>
              <button className="app-tab-close" title={t('tabs.close')}
                onClick={e => { e.stopPropagation(); setWhatsNew(null); setWhatsNewActive(false) }}>×</button>
            </div>
          )}
          <button className="app-tab-add"
            title={t('tabs.new')} onClick={() => openHomeTab()}>+</button>

          {/* Right cluster: update · notifications · settings · profile */}
          <div className="app-tabs-right">
            {updatePhase !== 'idle' && (
              <button className="app-tb-update-btn" title={t('toolbar.update.tooltip')}
                onClick={() => setUpdateOverlayOpen(true)}>
                <Icon name="download" size={14} />
                <span className="app-tb-update-btn-label">{t('toolbar.update.label')}</span>
              </button>
            )}
            <button className={`app-tb-icon app-tb-bell ${notifsOpen ? 'active' : ''}`}
              title={t('notifs.title')} onClick={() => setNotifsOpen(v => !v)}>
              <Icon name="bell" />
              {unreadCount > 0 && (
                <span className="app-tb-bell-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
              )}
            </button>
            <button className={`app-tb-icon ${viewTab?.view === 'settings' ? 'active' : ''}`}
              title={t('settings.title')} onClick={() => { setRepoMgmtOpen(false); openSettingsTab() }}>
              <Icon name="gear" />
            </button>
            <button className="app-profile-chip" title={githubUser?.login ?? t('settings.profile')}
              onClick={() => { setRepoMgmtOpen(false); openSettingsTab() }}>
              {githubUser?.avatar
                ? <img className="app-profile-avatar" src={githubUser.avatar} alt={githubUser.login} />
                : <span className="app-profile-avatar app-profile-avatar--fallback">{(githubUser?.login ?? '?').slice(0, 1).toUpperCase()}</span>}
              <span className="app-profile-name">{githubUser?.login ?? t('settings.defaultProfile')}</span>
              <Icon name="chevronDown" size={10} />
            </button>
          </div>
        </div>
      )}

      {/* Git action bar — hidden while in preferences, over the theme gallery,
          which has no repo to act on, and over a view tab: its search searches
          the graph, and the tab it would sit above is not the graph. */}
      {!whatsNewActive && !themesActive && !viewTab && (
      <Toolbar
        topRow={tabs.length === 0}
        repoPath={repoPath}
        currentBranch={currentBranch}
        searchQuery={searchQuery}
        searchMatches={searchMatches}
        onSearch={setSearchQuery}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onFetch={handleFetch}
        onPush={handlePush}
        onPushModal={handlePushModal}
        onPull={handlePull}
        pullMode={pullMode}
        onSetPullMode={handleSetPullMode}
        onCreateBranch={handleCreateBranch}
        onStash={handleStash}
        onPop={handlePop}
        onTerminal={handleTerminal}
        stashCount={stashes.length}
        onRefresh={loadRepoData}
        loading={loading}
        lastFetchTime={lastFetchTime}
        extendedSearch={extendedSearch}
        extendedSearchLoading={extendedSearchLoading}
        onToggleExtendedSearch={() => setExtendedSearch(v => !v)}
        aiSearch={aiSearch}
        aiSearchLoading={aiSearchLoading}
        onToggleAiSearch={() => setAiSearch(v => !v)}
        onAiSearchSubmit={runAiSearch}
        onSettings={openSettingsTab}
        githubRepoUrl={githubRepoUrl}
        onGitflow={repoPath ? () => setGitflowOpen(true) : undefined}
      />
      )}

      {/* ── Notification center (bell dropdown) ── */}
      {notifsOpen && (
        <NotificationCenter
          notifications={notifications}
          onClose={() => setNotifsOpen(false)}
          onToggleRead={(id) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: !n.read } : n))}
          onDelete={(id) => setNotifications(prev => prev.filter(n => n.id !== id))}
          onMarkAllRead={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
          onClearAll={() => setNotifications([])}
          onActivate={(n) => {
            setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
            if (n.kind === 'update' && updatePhase !== 'idle') { setNotifsOpen(false); setUpdateOverlayOpen(true) }
          }}
        />
      )}

      {/* ── Update overlay (available → downloading → installing) ── */}
      {updateOverlayOpen && updatePhase !== 'idle' && (
        <UpdateOverlay
          phase={updatePhase}
          version={updateVersion}
          progress={updatePct}
          onStart={startUpdateDownload}
          onDismiss={() => setUpdateOverlayOpen(false)}
        />
      )}


      {/* "What's new" is a full-page tab: no repo sidebar/toolbar behind it, so
          repo actions aren't reachable while it's the active view. */}
      {whatsNewActive && whatsNew && !repoMgmtOpen && (
        <div className="app-fullpage-view">
          <WhatsNew version={whatsNew.version} notes={whatsNew.notes} />
        </div>
      )}

      {/* Repository Management — full-page overlay (like Settings). */}
      {repoMgmtOpen && (
        <div className="app-fullpage-view">
          <RepoManager
            recentRepos={recentRepos}
            openRepoPaths={tabs.filter(tb => tb.kind === 'repo').map(tb => tb.path!)}
            workspaces={workspaces}
            onSetWorkspace={async (path, name) => {
              const updated = await (window.gitAPI as any).setRepoWorkspace(path, name)
              setWorkspaces(updated ?? {})
            }}
            onOpenRepo={(p) => { setRepoMgmtOpen(false); handleSetRepo(p) }}
            onRemoveRecent={handleRemoveRecent}
            onClone={() => setCloneOpen(true)}
            onBrowse={() => { setRepoMgmtOpen(false); handleOpenRepo() }}
            onInit={() => setInitModalOpen(true)}
            showToast={showToast}
          />
        </div>
      )}

      <div className="app-body" style={{ display: whatsNewActive || repoMgmtOpen ? 'none' : undefined }}>
        {/* ── Sidebar panel — only with a repo open (the home has its own repo list) ── */}
        {repoPath && !viewTab && (
        <div className="app-sidebar" style={{ width: sidebarW }} ref={sidebarPanelRef}>
          {(
            <Sidebar
              githubPRs={githubPRs}
              githubIssues={githubIssues}
              onStartBranchFromIssue={handleCreateBranchFromIssue}
              onShowGithubDetail={(item, kind) => setIssueDetail({ kind, item })}
              githubDetailOpen={!!issueDetail}
              githubLogin={githubLogin}
              githubRepo={githubOwnerRepo}
              onOpenGithubItem={(url) => window.gitAPI.openExternal(url)}
              repoPath={repoPath}
              repoName={repoName}
              currentBranch={currentBranch}
              branches={branches}
              recentRepos={recentRepos}
              stashes={stashes}
              tags={tags}
              onOpenRepo={handleOpenRepo}
              onClone={() => setCloneOpen(true)}
              onSetRepo={handleSetRepo}
              onRemoveRecent={handleRemoveRecent}
              onCheckout={handleCheckout}
              onGoTo={handleGoTo}
              onCreateBranch={handleCreateBranch}
              onDeleteBranch={handleDeleteBranch}
              onMergeBranch={handleMergeBranch}
              onRenameBranch={handleRenameBranch}
              onRebaseOnto={handleRebaseOnto}
              onPushBranch={handlePushBranch}
              onDeleteRemoteBranch={handleDeleteRemoteBranch}
              onSetUpstream={handleSetUpstream}
              onCreateStash={handleCreateStash}
              onApplyStash={handleApplyStash}
              onPopStash={handlePopStash}
              onDropStash={handleDropStash}
              onPreviewStash={(index, message) => openViewTab({ view: 'stash', index, message })}
              onRefreshStashes={loadStashes}
              onCreateTag={handleCreateTag}
              onDeleteTag={handleDeleteTag}
              onCheckoutTag={handleCheckoutTag}
              onRefresh={loadRepoData}
              onPushTag={handlePushTag}
              onDeleteRemoteTag={handleDeleteRemoteTag}
              onSelectCommit={(hash) => {
                const found = commits.find(c => c.hash === hash || c.hash.startsWith(hash))
                if (found) setSelectedCommit(found)
              }}
              onCompareBranch={(name) => openViewTab({ view: 'compare', a: currentBranch, b: name, axis: 'diverged', label: `${currentBranch} … ${name}` })}
              soloBranch={soloBranch}
              visibility={visibility}
              onToggleSolo={(name) => { setSoloBranch(prev => prev === name ? null : name) }}
              onToggleHide={(name) => toggleHidden('branches', name)}
              onToggleHideTag={(name) => toggleHidden('tags', name)}
              onToggleHideRemote={(name) => toggleHidden('remotes', name)}
              onSetFamilyHidden={setFamilyHidden}
              onPull={handlePull}
              isFavorite={branchMeta.isFavorite}
              issueFor={branchMeta.issueFor}
              onToggleFavorite={branchMeta.toggleFavorite}
              onOpenBranchOnRemote={handleOpenBranchOnRemote}
              onAssociateIssue={setIssueModalBranch}
              prIntentFor={prIntentFor}
              showAllBranches={showAllBranches}
              onToggleAllBranches={() => setShowAllBranches(v => !v)}
              onRefreshGithub={refreshGithubSection}
              onStartPR={currentBranchPR ? () => handleStartPR(currentBranchPR) : undefined}
              onNewIssue={remoteRepo ? () => window.gitAPI.openExternal(remoteUrl.newIssue(remoteRepo)) : undefined}
              githubRefreshing={githubRefreshing}
              githubRefreshTick={githubRefreshTick}
              githubPollTick={githubPollTick}
              onCreatePR={handleStartPR}
              onCopyBranchLink={githubOwnerRepo ? handleCopyBranchLink : undefined}
              onDeleteBranchBoth={handleDeleteBranchBoth}
              showToast={showToast}
              showPrompt={showPrompt}
              showConfirm={showConfirm}
            />
          )}
        </div>
        )}

        {repoPath && !viewTab && <div className="resize-handle" onMouseDown={startResizeSidebar} />}

        <div className="app-center">
          {conflictResolverFile ? (
            <ConflictResolver
              file={conflictResolverFile}
              initialProposal={conflictResolverProposal ?? undefined}
              onFinish={async () => {
                setConflictResolverProposal(null)
                const res = await window.gitAPI.getConflictedFiles()
                const remaining = res.files
                setConflictKinds(kindsByPath(res.entries))
                if (remaining.length > 0) {
                  setConflictFiles(remaining)
                  setConflictResolverFile(remaining[0])
                  showToast(t('toast.fileResolvedRemaining', remaining.length))
                } else {
                  setConflictFiles([])
                  setConflictResolverFile(null)
                  loadRepoData()
                }
              }}
              onAbort={() => { setConflictResolverProposal(null); setConflictResolverFile(null) }}
              showToast={showToast}
            />
          ) : rebaseHash ? (
            <InteractiveRebase
              embedded
              baseHash={rebaseHash}
              initialPlan={rebasePlanProposal ?? undefined}
              onClose={() => { setRebaseHash(null); setRebasePlanProposal(null) }}
              onSuccess={loadRepoData}
              showToast={showToast}
            />
          ) : viewTab ? (
            viewTab.view === 'compare' ? (
              <CompareView
                initialA={viewTab.a}
                initialB={viewTab.b}
                initialAxis={viewTab.axis}
                repoKey={repoPath}
                onTitleChange={(title) => setTabs(prev => prev.map(tb =>
                  tb.id === activeTabId && tb.body?.view === 'compare'
                    ? { ...tb, body: { ...tb.body, label: title } }
                    : tb))}
              />
            ) : viewTab.view === 'fileHistory' ? (
              <FileHistory file={viewTab.file} />
            ) : viewTab.view === 'fileDiff' ? (
              <CenterFileDiff
                target={viewTab.target}
                onClose={() => closeTab(activeTabId!)}
                onStaged={() => loadRepoData(true)}
              />
            ) : viewTab.view === 'settings' ? (
              <SettingsModal
                onBrowseThemes={openThemesTab}
                onClose={() => closeTab(activeTabId!)}
                showToast={showToast}
                onUpdateFound={(v) => { setUpdateVersion(v); setUpdatePhase('available'); setUpdateOverlayOpen(true); addUpdateNotification(v) }}
              />
            ) : (
              <StashPreview index={viewTab.index} message={viewTab.message} />
            )
          ) : themesActive ? (
            <ThemeGallery />
          ) : launchpadActive ? (
            <Launchpad
              recentRepos={recentRepos}
              workspaces={workspaces}
              onSetWorkspace={async (path, name) => {
                const updated = await (window.gitAPI as any).setRepoWorkspace(path, name)
                setWorkspaces(updated ?? {})
              }}
              onOpenRepo={handleSetRepo}
              showToast={showToast}
            />
          ) : !repoPath ? (
            <div className="app-welcome">
              <div className="welcome-hero">
                <div className="welcome-brand">
                  {/* 72px is exactly the threshold where the intermediate commit
                      nodes stop being sub-pixel, so the full cut is the right one
                      here — and Mark picks it from the size on its own. */}
                  <Mark className="welcome-logo" size={72} title="Git Vertex" />
                  <div>
                    <h1 className="welcome-title">Git Vertex</h1>
                    <p className="welcome-sub">{t('welcome.hint')}</p>
                  </div>
                </div>

                <div className="welcome-actions">
                  <button className="welcome-btn welcome-btn-primary" onClick={handleOpenRepo}>
                    <Icon name="folder" size={15} />
                    {t('welcome.open')}
                  </button>
                  <button className="welcome-btn welcome-btn-secondary" onClick={() => setCloneOpen(true)}>
                    <Brand name="github" size={15} />
                    {t('clone.title')}
                  </button>
                  <button className="welcome-btn welcome-btn-secondary" onClick={handleCreateRepo}>
                    <Icon name="plus" size={15} />
                    {t('welcome.create')}
                  </button>
                </div>

                <div className="welcome-search">
                  <Icon name="search" size={14} />
                  <input className="welcome-search-input" value={repoSearch}
                    onChange={e => setRepoSearch(e.target.value)}
                    placeholder={t('welcome.searchRepos')} />
                </div>

                {recentRepos.length > 0 && (() => {
                  const q = repoSearch.trim().toLowerCase()
                  const list = q ? recentRepos.filter(p => p.toLowerCase().includes(q)) : recentRepos
                  return (
                    <div className="welcome-recents">
                      <div className="welcome-recents-title">
                        <Icon name="clock" size={12} />
                        {t('welcome.recents')}
                      </div>
                      <div className="welcome-recents-list">
                        {list.slice(0, 8).map(path => {
                          const parts = path.split(/[\\/]/).filter(Boolean)
                          const name = parts[parts.length - 1] ?? path
                          const parent = parts.slice(0, -1).join('/')
                          return (
                          <button key={path} className="welcome-recent-item" onClick={() => handleSetRepo(path)} title={path}>
                            <Icon name="repo" size={14} className="welcome-recent-icon" />
                            <div className="welcome-recent-info">
                              <span className="welcome-recent-name">{name}</span>
                              <span className="welcome-recent-path">{parent}</span>
                            </div>
                            <Icon name="chevronRight" size={12} className="welcome-recent-arrow" />
                          </button>
                          )
                        })}
                        {list.length === 0 && <div className="welcome-recents-empty">{t('welcome.noResults')}</div>}
                      </div>
                    </div>
                  )
                })()}
              </div>

              <div className="welcome-resources">
                <div className="welcome-res-title">{t('welcome.resources')}</div>
                <button className="welcome-res-link" onClick={openReleaseNotes}>
                  <Icon name="tag" size={16} className="welcome-res-icon" />{t('welcome.releaseNotes')}
                </button>
                <button className="welcome-res-link" onClick={() => (window.gitAPI as any).openExternal?.('https://github.com/VictorQuilgars/git-vertex')}>
                  <Icon name="editor" size={16} className="welcome-res-icon" />{t('welcome.sourceCode')}
                </button>
                <button className="welcome-res-link" onClick={() => (window.gitAPI as any).openExternal?.('https://github.com/VictorQuilgars/git-vertex#readme')}>
                  <Icon name="book" size={16} className="welcome-res-icon" />{t('welcome.docs')}
                </button>
              </div>
            </div>
          ) : issueDetail && githubOwnerRepo ? (
            issueDetail.kind === 'pr' ? (
            <PRDetail
              repo={githubOwnerRepo}
              number={issueDetail.item.number}
              onClose={() => setIssueDetail(null)}
              onChanged={() => { if (githubOwnerRepo) void loadGithubLists(githubOwnerRepo) }}
            />
            ) : (
            <IssueDetail
              repo={githubOwnerRepo}
              item={issueDetail.item}
              onClose={() => setIssueDetail(null)}
              onCreateBranch={handleCreateBranchFromIssue}
              onChanged={() => { if (githubOwnerRepo) void loadGithubLists(githubOwnerRepo) }}
            />
            )
          ) : (
            <CommitGraph
              issueForBranch={branchMeta.issueFor}
              prForBranch={(name) => {
                const pr = githubPRs?.find(p => p.headRef === name)
                return pr ? { number: pr.number, title: pr.title } : null
              }}
              onOpenPR={(n) => {
                const pr = githubPRs?.find(p => p.number === n)
                if (pr) setIssueDetail({ kind: 'pr', item: pr })
              }}
              trackingFor={(name) => {
                const b = branches.find(x => x.name === name)
                return b ? { ahead: b.ahead, behind: b.behind } : null
              }}
              commits={commits}
              visibility={visibility}
              remoteNames={remoteNames}
              selectedHash={selectedCommit?.hash ?? null}
              onSelectCommit={c => setSelectedCommit(prev => prev?.hash === c.hash ? null : c)}
              searchQuery={aiSearch ? '' : searchQuery}
              searchHashes={graphSearchHashes}
              currentBranch={currentBranch}
              onCherryPick={handleCherryPick}
              onRevert={handleRevert}
              onReset={handleReset}
              onCreateTag={handleCreateTagAtCommit}
              onCreateBranchAt={handleCreateBranchAt}
              onCheckoutBranch={handleGoTo}
              onMergeBranch={handleMergeBranch}
              onRebaseCurrentOnto={handleRebaseOnto}
              prIntentFor={prIntentFor}
              onCreatePR={handleStartPR}
              branchMenuItems={branchMenuItems}
              onCopyCommitLink={githubOwnerRepo ? handleCopyCommitLink : undefined}
              onCreateAnnotatedTag={handleCreateAnnotatedTagAtCommit}
              onInteractiveRebase={(hash) => setRebaseHash(hash)}
              onCheckoutCommit={handleCheckout}
              onRewordCommit={handleRewordCommit}
              onCompareWorking={(hash) => openViewTab({ view: 'compare', a: hash, b: null, label: `${hash.slice(0, 7)} → ${t('cv.workingTree')}` })}
              compareBaseHash={compareBaseHash}
              onSelectForCompare={(hash) => { setCompareBaseHash(hash); showToast(t('toast.commitSelectedForCompare')) }}
              onCompareWithSelected={(hash) => {
                if (!compareBaseHash) return
                // Two commits picked by hand, in the order they were picked:
                // `endpoints`, because three-dot against an ancestor is empty.
                openViewTab({
                  view: 'compare', a: compareBaseHash, b: hash, axis: 'endpoints',
                  label: `${compareBaseHash.slice(0, 7)} ‥ ${hash.slice(0, 7)}`,
                })
              }}
              onDropCommit={handleDropCommit}
              onMoveCommit={handleMoveCommit}
              onBranchDrop={handleBranchDrop}
              onRebaseCurrentOntoCommit={handleRebaseCurrentOntoCommit}
              onPushToCommit={handlePushToCommit}
              onCreatePatch={handleCreatePatch}
              onCopyPatch={handleCopyPatch}
              onSharePatch={handleSharePatch}
              onCreateWorktreeAt={handleCreateWorktreeAt}
              onOpenCommitOnRemote={handleOpenCommitOnRemote}
              wipCount={wipCount}
              conflictMode={conflictMode}
              githubRepo={githubOwnerRepo}
              loading={loading}
              onSearchMatches={setSearchMatches}
            />
          )}
        </div>

        {repoPath && !rebaseHash && !viewTab && !issueDetail && (selectedCommit || conflictMode) && (
          <>
            <div className="resize-handle" onMouseDown={startResizeRight} />
            <div className="app-right" style={{ width: rightW }}>
              <RightPanel
                onCompareWorking={(hash) => openViewTab({ view: 'compare', a: hash, b: null, label: `${hash.slice(0, 7)} → ${t('cv.workingTree')}` })}
                selectedCommit={selectedCommit}
                onCommitSuccess={loadRepoData}
                showToast={showToast}
                currentBranch={currentBranch}
                wipCount={wipCount}
                onViewWip={() => setSelectedCommit(prev =>
                  prev?.hash === '__WIP__' ? null : {
                    hash: '__WIP__', shortHash: 'WIP', message: '//WIP',
                    author: '', authorEmail: '', date: '', parents: [], refs: []
                  }
                )}
                onSelectCommit={(hash) => {
                  const found = commits.find(c => c.hash === hash || c.hash.startsWith(hash))
                  if (found) setSelectedCommit(found)
                }}
                conflictFiles={conflictFiles}
                conflictKinds={conflictKinds}
                conflictMode={conflictMode}
                onConflictFinish={handleConflictFinish}
                onConflictAbort={handleConflictAbort}
                onOpenResolver={(file) => setConflictResolverFile(file)}
                onOpenFileDiff={(target) => openViewTab({ view: 'fileDiff', target })}
                githubRepo={githubOwnerRepo}
                onOpenFileOnRemote={handleOpenFileOnRemote}
                onCopyFileLink={handleCopyFileLink}
                onRestoreFile={handleRestoreFile}
                onOpenFileHistory={(file) => openViewTab({ view: 'fileHistory', file })}
                onRewordMessage={applyReword}
                commitProposal={commitProposal}
                onCommitProposalConsumed={() => setCommitProposal(null)}
                branchStrip={branchStripProps}
              />
            </div>
          </>
        )}
      </div>

      {/* ── Status bar (bottom) ── */}
      {repoPath && (
        <StatusBar
          repoName={repoName}
          branch={currentBranch}
          ahead={tracking.ahead}
          behind={tracking.behind}
          lastFetchTime={lastFetchTime}
          loading={loading}
          onFetch={handleFetch}
        />
      )}

      {/* Command Palette */}
      {paletteOpen && (
        <CommandPalette
          commands={buildPaletteCommands()}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      {/* PR composer — a drawer out of the left panel, not a modal (#130) */}
      {prModalOpen && githubOwnerRepo && prIntent && (
        <PRComposer
          owner={githubOwnerRepo.owner}
          repo={githubOwnerRepo.repo}
          intent={prIntent}
          branches={branches}
          anchor={sidebarPanelRef}
          onClose={() => { setPrModalOpen(false); setPrIntent(null) }}
          onPushed={loadRepoData}
          onCreated={() => { if (githubOwnerRepo) void loadGithubLists(githubOwnerRepo, 'prs') }}
          showToast={showToast}
        />
      )}

      {/* Clone Modal */}
      {cloneOpen && (
        <CloneModal
          onClose={() => setCloneOpen(false)}
          onCloned={(path, name) => {
            setCloneOpen(false)
            applyRepo({ path, name })
            showToast(t('toast.cloneOk', name), 'ok')
          }}
        />
      )}

      {initModalOpen && (
        <InitModal
          onClose={() => setInitModalOpen(false)}
          onCreated={(path) => { setInitModalOpen(false); setRepoMgmtOpen(false); handleSetRepo(path) }}
          showToast={showToast}
        />
      )}

      {/* Push Modal */}
      {pushModalOpen && (
        <PushModal
          currentBranch={currentBranch}
          branches={branches}
          onClose={() => setPushModalOpen(false)}
          onSuccess={loadRepoData}
          showToast={showToast}
        />
      )}


      {/* Tab context menu */}
      {tabMenu && (
        <ContextMenu
          x={tabMenu.x} y={tabMenu.y}
          items={[
            { label: t('tabs.close'), action: () => closeTab(tabMenu.id) },
            ...(tabs.length > 1 ? [{ label: t('tabs.closeOthers'), action: () => closeOtherTabs(tabMenu.id) }] : []),
          ] as MenuItemDef[]}
          onClose={() => setTabMenu(null)}
        />
      )}

      {/* Gitflow */}
      {gitflowOpen && (
        <GitflowModal
          onClose={() => setGitflowOpen(false)}
          onSuccess={loadRepoData}
          showToast={showToast}
          showPrompt={showPrompt}
          showConfirm={showConfirm}
        />
      )}

      {/* Compare commit vs working directory */}

      {/* Stash content preview */}


      {issueModalBranch && (
        <AssociateIssueModal
          branch={issueModalBranch}
          current={branchMeta.issueFor(issueModalBranch)}
          onPick={(issue: LinkedIssue | null) => {
            branchMeta.setIssue(issueModalBranch, issue)
            setIssueModalBranch(null)
          }}
          onClose={() => setIssueModalBranch(null)}
        />
      )}

      {/* Custom dialogs (remplace window.prompt / window.confirm) */}
      {dlg?.kind === 'prompt' && (
        <PromptDialog
          message={dlg.message}
          defaultValue={dlg.defaultValue}
          multiline={dlg.multiline}
          onConfirm={v => { dlg.resolve(v); closeDlg() }}
          onCancel={() => { dlg.resolve(null); closeDlg() }}
        />
      )}
      {dlg?.kind === 'confirm' && (
        <ConfirmDialog
          message={dlg.message}
          danger={dlg.danger}
          onConfirm={() => { dlg.resolve(true); closeDlg() }}
          onCancel={() => { dlg.resolve(false); closeDlg() }}
        />
      )}
    </div>
  )
}
