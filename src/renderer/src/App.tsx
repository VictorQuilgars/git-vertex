import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { CommitNode, BranchInfo, FileChange } from './types'
import { useLang } from './i18n/LanguageContext'
import Toolbar from './components/Toolbar/Toolbar'
import Sidebar from './components/Sidebar/Sidebar'
import StatusBar from './components/StatusBar/StatusBar'
import CommitGraph from './components/CommitGraph/CommitGraph'
import RightPanel from './components/RightPanel/RightPanel'
import { PromptDialog, ConfirmDialog } from './components/Dialog/Dialog'
import CommandPalette, { PaletteCommand } from './components/CommandPalette/CommandPalette'
import { ToastProvider, useToast } from './components/Toast/Toast'
import InteractiveRebase from './components/InteractiveRebase/InteractiveRebase'
import UpdateOverlay from './components/UpdateOverlay/UpdateOverlay'
import NotificationCenter, { AppNotification } from './components/NotificationCenter/NotificationCenter'
import ConflictResolver from './components/ConflictResolver/ConflictResolver'
import WhatsNew from './components/WhatsNew/WhatsNew'
import PushModal from './components/PushModal/PushModal'
import SettingsModal from './components/SettingsModal/SettingsModal'
import CloneModal from './components/CloneModal/CloneModal'
import GitHubPanel from './components/GitHubPanel/GitHubPanel'
import PRModal from './components/PRModal/PRModal'
import GitflowModal from './components/GitflowModal/GitflowModal'
import DiffViewer from './components/DiffViewer/DiffViewer'
import CenterFileDiff, { CenterDiffTarget } from './components/CenterFileDiff/CenterFileDiff'
import ContextMenu, { MenuItemDef } from './components/ContextMenu/ContextMenu'
import './App.css'

interface StashEntry { index: number; message: string }
interface TagEntry   { name: string; hash: string }

// ── Branch Compare Modal ───────────────────────────────────────
function BranchCompareModal({ otherBranch, currentBranch, onClose, onSelectCommit }: {
  otherBranch: string
  currentBranch: string
  onClose: () => void
  onSelectCommit: (hash: string) => void
}) {
  const [data, setData] = useState<{
    ahead: { hash: string; shortHash: string; message: string }[]
    behind: { hash: string; shortHash: string; message: string }[]
  }>({ ahead: [], behind: [] })
  const [loading, setLoading] = useState(true)

  React.useEffect(() => {
    window.gitAPI.compareBranches(currentBranch, otherBranch).then(r => {
      setData(r)
      setLoading(false)
    })
  }, [currentBranch, otherBranch])

  return (
    <div className="bc-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bc-modal">
        <div className="bc-header">
          <span className="bc-title">Comparaison : <code>{currentBranch}</code> ↔ <code>{otherBranch}</code></span>
          <button className="bc-close" onClick={onClose}>×</button>
        </div>
        {loading ? (
          <div className="bc-loading">Chargement…</div>
        ) : (
          <div className="bc-grid">
            <div className="bc-col">
              <div className="bc-col-header" style={{ color: '#58a6ff' }}>
                Dans <code>{otherBranch}</code> mais pas dans <code>{currentBranch}</code> ({data.ahead.length})
              </div>
              <div className="bc-list">
                {data.ahead.length === 0 && <div className="bc-empty">Aucun commit</div>}
                {data.ahead.map(c => (
                  <div key={c.hash} className="bc-row" onClick={() => { onSelectCommit(c.hash); onClose() }}>
                    <code className="bc-hash">{c.shortHash}</code>
                    <span className="bc-msg">{c.message}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bc-col">
              <div className="bc-col-header" style={{ color: '#3fb950' }}>
                Dans <code>{currentBranch}</code> mais pas dans <code>{otherBranch}</code> ({data.behind.length})
              </div>
              <div className="bc-list">
                {data.behind.length === 0 && <div className="bc-empty">Aucun commit</div>}
                {data.behind.map(c => (
                  <div key={c.hash} className="bc-row" onClick={() => { onSelectCommit(c.hash); onClose() }}>
                    <code className="bc-hash">{c.shortHash}</code>
                    <span className="bc-msg">{c.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Compare commit against working directory ───────────────────
function CompareWorkingModal({ hash, onClose }: { hash: string; onClose: () => void }) {
  const [diff, setDiff] = useState<string>('')
  const [loading, setLoading] = useState(true)

  React.useEffect(() => {
    window.gitAPI.diffCommitToWorking(hash).then(r => {
      setDiff(r.diff ?? '')
      setLoading(false)
    })
  }, [hash])

  return (
    <div className="bc-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bc-modal" style={{ width: '80vw', maxWidth: 1100, height: '80vh' }}>
        <div className="bc-header">
          <span className="bc-title">Comparaison : <code>{hash.slice(0, 7)}</code> ↔ répertoire de travail</span>
          <button className="bc-close" onClick={onClose}>×</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {loading
            ? <div className="bc-loading">Chargement…</div>
            : diff.trim() === ''
              ? <div className="bc-empty" style={{ padding: 24 }}>Aucune différence</div>
              : <DiffViewer commit={syntheticCommit(hash.slice(0, 7), 'Répertoire de travail')} diff={diff} files={[]} loading={false} />}
        </div>
      </div>
    </div>
  )
}

// ── Stash content preview ───────────────────────────────────────
function StashPreviewModal({ index, message, onClose }: { index: number; message: string; onClose: () => void }) {
  const [diff, setDiff] = useState<string>('')
  const [loading, setLoading] = useState(true)

  React.useEffect(() => {
    ;(window.gitAPI as any).stashDiff(index).then((r: any) => {
      setDiff(r?.diff ?? '')
      setLoading(false)
    })
  }, [index])

  return (
    <div className="bc-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bc-modal" style={{ width: '80vw', maxWidth: 1100, height: '80vh' }}>
        <div className="bc-header">
          <span className="bc-title">Stash <code>#{index}</code> — {message}</span>
          <button className="bc-close" onClick={onClose}>×</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {loading
            ? <div className="bc-loading">Chargement…</div>
            : diff.trim() === ''
              ? <div className="bc-empty" style={{ padding: 24 }}>Stash vide</div>
              : <DiffViewer commit={syntheticCommit(`stash@{${index}}`, message)} diff={diff} files={[]} loading={false} />}
        </div>
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

// ── Compare two arbitrary commits ──────────────────────────────
function CompareCommitsModal({ from, to, onClose }: { from: string; to: string; onClose: () => void }) {
  const [diff, setDiff] = useState<string>('')
  const [files, setFiles] = useState<FileChange[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      window.gitAPI.diffBetweenCommits(from, to),
      window.gitAPI.filesBetweenCommits(from, to)
    ]).then(([d, f]) => {
      if (cancelled) return
      if (d.error) setError(d.error)
      setDiff(d.diff ?? '')
      setFiles(f.files ?? [])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [from, to])

  return (
    <div className="bc-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bc-modal" style={{ width: '85vw', maxWidth: 1200, height: '82vh' }}>
        <div className="bc-header">
          <span className="bc-title">
            Comparaison : <code>{from.slice(0, 7)}</code> → <code>{to.slice(0, 7)}</code>
          </span>
          <button className="bc-close" onClick={onClose}>×</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {loading
            ? <div className="bc-loading">Chargement…</div>
            : error
              ? <div className="bc-empty" style={{ padding: 24, color: '#f85149' }}>{error}</div>
              : diff.trim() === ''
                ? <div className="bc-empty" style={{ padding: 24 }}>Aucune différence entre ces deux commits</div>
                : <DiffViewer
                    commit={syntheticCommit(to.slice(0, 7), `${from.slice(0, 7)} → ${to.slice(0, 7)}`)}
                    diff={diff} files={files} loading={false} />}
        </div>
      </div>
    </div>
  )
}

// ── Imperative dialog helpers ──────────────────────────────────
type DialogState =
  | { kind: 'prompt';  message: string; defaultValue?: string; multiline?: boolean; resolve: (v: string | null) => void }
  | { kind: 'confirm'; message: string; danger?: boolean;      resolve: (v: boolean) => void }

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
  // Solo/mute branch filtering for the graph. Solo shows only one branch;
  // muted branches are excluded from the --all view.
  const [soloBranch, setSoloBranch] = useState<string | null>(null)
  const [mutedBranches, setMutedBranches] = useState<Set<string>>(new Set())
  const [extendedSearch, setExtendedSearch] = useState(false)
  const [extendedSearchHashes, setExtendedSearchHashes] = useState<Set<string>>(new Set())
  const [extendedSearchLoading, setExtendedSearchLoading] = useState(false)
  // AI natural-language search: explicit trigger (Enter / ✨), not per-keystroke.
  const [aiSearch, setAiSearch] = useState(false)
  const [aiSearchHashes, setAiSearchHashes] = useState<Set<string> | null>(null)
  const [aiSearchLoading, setAiSearchLoading] = useState(false)
  const [compareBranchModal, setCompareBranchModal] = useState<string | null>(null)
  const [compareWorkingHash, setCompareWorkingHash] = useState<string | null>(null)
  const [stashPreview, setStashPreview] = useState<{ index: number; message: string } | null>(null)
  const [compareBaseHash, setCompareBaseHash] = useState<string | null>(null)
  const [comparePair, setComparePair] = useState<{ from: string; to: string } | null>(null)
  const [gitflowOpen, setGitflowOpen] = useState(false)
  // ── Multi-repo tabs ──
  const [tabs, setTabs] = useState<{ id: string; path: string; name: string }[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  const selectedByTab = useRef<Map<string, CommitNode | null>>(new Map())
  const [loading, setLoading] = useState<boolean>(false)
  const [recentRepos, setRecentRepos] = useState<string[]>([])
  const [repoSearch, setRepoSearch] = useState('')   // welcome-screen recents filter
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
  const [tracking, setTracking] = useState<{ ahead: number; behind: number }>({ ahead: 0, behind: 0 })
  const [githubUser, setGithubUser] = useState<{ login: string; avatar: string } | null>(null)
  const [rebaseHash, setRebaseHash] = useState<string | null>(null)
  // Agent proposals arriving via deep link (MCP propose_commit / propose_rebase_plan):
  // preloaded into the staging form / rebase editor for the user to review —
  // nothing is staged, committed or rewritten until the user acts.
  const [commitProposal, setCommitProposal] = useState<{ message: string; files: string[] } | null>(null)
  const [rebasePlanProposal, setRebasePlanProposal] = useState<{ hash: string; action: string; message?: string }[] | null>(null)
  const [pushModalOpen, setPushModalOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Release notes shown once after an update (like VS Code's "what's new" tab).
  const [whatsNew, setWhatsNew] = useState<{ version: string; notes: string } | null>(null)
  // The "what's new" tab is a normal tab: it can stay open in the background
  // while you work in a repo. `whatsNewActive` is whether it's the current view.
  const [whatsNewActive, setWhatsNewActive] = useState(false)
  const [cloneOpen, setCloneOpen] = useState(false)
  const [githubConnected, setGithubConnected] = useState(false)
  const [activeView, setActiveView] = useState<'git' | 'github'>('git')
  const [githubRepoUrl, setGithubRepoUrl] = useState<string | null>(null)
  const [githubOwnerRepo, setGithubOwnerRepo] = useState<{ owner: string; repo: string } | null>(null)
  const [prModalOpen, setPrModalOpen] = useState(false)
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
  const [conflictMode, setConflictMode] = useState<'merge' | 'rebase' | 'cherry-pick' | 'revert' | null>(null)
  const [conflictResolverFile, setConflictResolverFile] = useState<string | null>(null)
  // Agent-proposed resolution (from a gitgui://open deep link) to preload into
  // the resolver's manual editor — review-only until the user saves it.
  const [conflictResolverProposal, setConflictResolverProposal] = useState<string | null>(null)
  const [centerDiff, setCenterDiff] = useState<CenterDiffTarget | null>(null)
  const [wipCount, setWipCount] = useState(0)
  const autoFetchEnabled = useRef(
    localStorage.getItem('autoFetch') !== 'false'
  )

  // ── Toast (via ToastProvider) ──────────────────────────────
  const toastApi = useToast()
  const { t } = useLang()
  type ToastAction = { label: string; onClick: () => void }
  const showToast = useCallback((msg: string, type: 'ok' | 'err' = 'ok', action?: ToastAction | ToastAction[], sticky?: boolean) => {
    if (type === 'ok') toastApi.success(msg, action, sticky)
    else toastApi.error(msg, action, sticky)
  }, [toastApi])

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

  const loadRepoData = useCallback(async (silent = false) => {
    if (!repoPath) return
    if (isLoadingRef.current) return   // prevent concurrent executions
    isLoadingRef.current = true
    if (!silent) setLoading(true)
    try {
      // Branches first so we can compute solo/mute refs for the log query.
      const branchRes = await window.gitAPI.getBranches()
      const refForGit = (n: string) => n.replace(/^remotes\//, '')
      let logOpts: { maxCount: number; all?: boolean; refs?: string[] } = { maxCount: 500, all: showAllBranches }
      if (soloBranch) {
        logOpts = { maxCount: 500, refs: [refForGit(soloBranch)] }
      } else if (mutedBranches.size > 0 && branchRes.branches) {
        const visible = branchRes.branches
          .filter((b: BranchInfo) => !mutedBranches.has(b.name))
          .map((b: BranchInfo) => refForGit(b.name))
        logOpts = { maxCount: 500, refs: visible.length ? visible : ['HEAD'] }
      }
      const logRes = await window.gitAPI.getLog(logOpts)
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
    }
  }, [repoPath, showAllBranches, soloBranch, mutedBranches, loadStashes, loadTags])

  useEffect(() => { loadRepoData() }, [loadRepoData])

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
    window.gitAPI.onRepoChanged(handler)
    window.gitAPI.onWorkingChanged(handler)
    return () => {
      window.gitAPI.offRepoChanged(handler)
      window.gitAPI.offWorkingChanged(handler)
    }
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
      showToast(`Fichier résolu en dehors de l'app — ${conflictFiles.length} conflit(s) restant(s)`)
    } else {
      setConflictResolverFile(null)
      showToast('Conflit résolu en dehors de l\'app')
    }
  }, [conflictFiles, conflictResolverFile, showToast])

  // ── Load recent repos on mount ─────────────────────────────
  useEffect(() => {
    window.gitAPI.getRecentRepos().then(r => setRecentRepos(r ?? []))
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
        showToast(r.error === 'NO_API_KEY' ? 'Aucune clé API IA configurée — voir Réglages → IA' : r.error, 'err')
        return
      }
      setAiSearchHashes(new Set(r.hashes ?? []))
    } catch (e: any) {
      showToast(e?.message ?? 'Erreur IA', 'err')
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
    if (!repoPath || !autoFetchEnabled.current) return
    const INTERVAL = 5 * 60 * 1000 // 5 minutes
    const id = setInterval(async () => {
      const r = await window.gitAPI.fetch()
      if (r.success) {
        setLastFetchTime(new Date())
        await loadRepoData()
      }
    }, INTERVAL)
    return () => clearInterval(id)
  }, [repoPath, loadRepoData])

  // ── Open repo helpers ──────────────────────────────────────
  const detectGithub = useCallback(async () => {
    const detected = await (window.gitAPI as any).githubDetectRepo()
    if (detected?.owner && detected?.repo) {
      setGithubRepoUrl(`https://github.com/${detected.owner}/${detected.repo}`)
      setGithubOwnerRepo({ owner: detected.owner, repo: detected.repo })
    } else {
      setGithubRepoUrl(null)
      setGithubOwnerRepo(null)
    }
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
        const existing = prev.find(tb => tb.path.normalize('NFC') === res.path!.normalize('NFC'))
        if (existing) { setActiveTabId(existing.id); return prev }
        const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        setActiveTabId(id)
        return [...prev, { id, path: res.path!, name }]
      })
    } else if (res.error && res.error !== 'cancelled') {
      showToast(t('toast.err', res.error), 'err')
    }
  }, [showToast, detectGithub])

  const handleOpenRepo = async () => applyRepo(await window.gitAPI.openRepo())
  const handleSetRepo = async (path: string) => applyRepo(await window.gitAPI.setRepo(path))
  const handleCreateRepo = async () => {
    const dir = await window.gitAPI.selectDirectory(t('welcome.createHint'))
    if (!dir.path) return
    applyRepo(await (window.gitAPI as any).initRepo(dir.path))
  }
  // Open the current release notes on demand (welcome "Notes de version" link).
  const openReleaseNotes = async () => {
    const w = await (window.gitAPI as any).getReleaseNotes?.().catch(() => null)
    if (w) { setWhatsNew(w); setWhatsNewActive(true); setSettingsOpen(false) }
    else showToast('Aucune note de version disponible', 'err')
  }
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
      showToast(`Git Vertex a été ouvert sans ${what} — la proposition de l'agent n'est pas arrivée`, 'err')
    }
    const proposalUnreadable = (what: string, e: unknown) => {
      console.error('[deeplink] malformed proposal payload', link, e)
      showToast(`${what} de l'agent est illisible — proposition ignorée`, 'err')
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
      if (!link.proposalContent) { proposalMissing('le message proposé'); return }
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
      } catch (e) { proposalUnreadable('Le message de commit', e) }
    } else if (link.view === 'propose-rebase') {
      // MCP propose_rebase_plan: open the visual rebase editor with the
      // agent's plan preloaded — the user reviews and launches it themselves.
      if (!link.hash) { proposalUnreadable('Le plan de rebase', 'missing base hash'); return }
      if (!link.proposalContent) { proposalMissing('le plan de rebase'); return }
      try {
        const p = JSON.parse(link.proposalContent)
        if (!Array.isArray(p.steps)) throw new Error('proposal has no steps array')
        setRebasePlanProposal(p.steps)
        setRebaseHash(link.hash)
      } catch (e) { proposalUnreadable('Le plan de rebase', e) }
    } else if (link.view !== 'graph') {
      // "graph" is just "open this repo" and needs nothing more; anything else
      // reaching here is a view we know but whose required parameter is absent.
      console.error('[deeplink] nothing to do for this link', link)
      showToast(`Lien Git Vertex incomplet (vue "${link.view}") — rien à afficher`, 'err')
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
  // "New tab" → return to the welcome screen so the user can pick
  // open / clone / a recent repo.
  const goHome = useCallback(() => {
    if (conflictResolverFile || rebaseHash) return
    setWhatsNewActive(false)
    if (activeTabId) selectedByTab.current.set(activeTabId, selectedCommit)
    setActiveTabId(null)
    setRepoPath(null)
    setRepoName('')
    setSelectedCommit(null)
    setCommits([])
    setGithubRepoUrl(null)
    setGithubOwnerRepo(null)
  }, [activeTabId, selectedCommit, conflictResolverFile, rebaseHash])

  const switchTab = useCallback(async (tab: { id: string; path: string; name: string }) => {
    setWhatsNewActive(false)   // clicking a repo tab leaves the what's-new view (tab stays open)
    if (tab.id === activeTabId) return
    if (conflictResolverFile || rebaseHash) return
    if (activeTabId) selectedByTab.current.set(activeTabId, selectedCommit)
    setActiveTabId(tab.id)
    const r = await window.gitAPI.setRepo(tab.path)
    if (r.path) {
      setRepoPath(r.path)
      setRepoName(r.name ?? tab.name)
      setCommits([])
      setSelectedCommit(selectedByTab.current.get(tab.id) ?? null)
      await detectGithub()
    } else if (r.error) {
      showToast(t('toast.err', r.error), 'err')
    }
  }, [activeTabId, selectedCommit, conflictResolverFile, rebaseHash, detectGithub, showToast])

  const closeTab = useCallback((id: string) => {
    selectedByTab.current.delete(id)
    setTabs(prev => {
      const idx = prev.findIndex(tb => tb.id === id)
      const next = prev.filter(tb => tb.id !== id)
      if (id === activeTabId) {
        if (next.length === 0) {
          setActiveTabId(null)
          setRepoPath(null)
          setRepoName('')
          setCommits([])
          setSelectedCommit(null)
        } else {
          const fallback = next[Math.max(0, idx - 1)]
          setActiveTabId(fallback.id)
          window.gitAPI.setRepo(fallback.path).then(r => {
            if (r.path) {
              setRepoPath(r.path)
              setRepoName(r.name ?? fallback.name)
              setCommits([])
              setSelectedCommit(selectedByTab.current.get(fallback.id) ?? null)
              detectGithub()
            }
          })
        }
      }
      return next
    })
  }, [activeTabId, detectGithub])

  const closeOtherTabs = useCallback((id: string) => {
    setTabs(prev => prev.filter(tb => tb.id === id))
    for (const key of Array.from(selectedByTab.current.keys())) {
      if (key !== id) selectedByTab.current.delete(key)
    }
    setActiveTabId(id)
  }, [])

  // ── Git operations ─────────────────────────────────────────
  const handleUndo = async () => {
    setLoading(true)
    const r = await window.gitAPI.undoLastAction()
    if (r.success) { showToast(`↩ ${r.action ?? 'Action annulée'}`); await loadRepoData() }
    else showToast(r.error ?? 'Impossible d\'annuler', 'err')
    setLoading(false)
  }

  const handleRedo = async () => {
    setLoading(true)
    const r = await window.gitAPI.redoLastAction()
    if (r.success) { showToast(`↪ ${r.action ?? 'Action rétablie'}`); await loadRepoData() }
    else showToast(r.error ?? 'Rien à rétablir', 'err')
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
        e.preventDefault(); setSettingsOpen(o => !o); return
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

  const handleTerminal = async () => {
    if (!repoPath) return
    const r = await (window.gitAPI as any).openTerminal?.()
    if (r?.success === false) showToast(r.error ?? 'Erreur terminal', 'err')
  }

  const handlePull = async () => {
    await guardConflict(
      // Predicts the merge of the already-known upstream tip; pull will fetch
      // first, so brand-new upstream commits aren't seen here (advisory).
      () => window.gitAPI.predictConflicts('@{u}'),
      async () => {
        setLoading(true)
        const r = await window.gitAPI.pull()
        if (r.success) { showToast(t('toast.pullOk')); await loadRepoData() }
        else showToast(t('toast.pullErr', r.error ?? ''), 'err')
        setLoading(false)
      },
    )
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
        if (sr.success) { stashed = true; showToast('Modifications stashées automatiquement') }
      }
    }
    const r = await window.gitAPI.checkout(name)
    if (r.success) {
      if (stashed) {
        const pr = await window.gitAPI.popStash(0)
        if (pr.success) showToast(`${t('toast.checkoutOk', name)} — stash restauré`)
        else showToast(`${t('toast.checkoutOk', name)} — échec restauration stash`, 'err')
      } else {
        showToast(t('toast.checkoutOk', name))
      }
      await loadRepoData()
    } else {
      if (stashed) await window.gitAPI.popStash(0)
      showToast(t('toast.checkoutErr', r.error ?? ''), 'err')
    }
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
      showToast(t('toast.err', 'Impossible de reformuler le tout premier commit du dépôt (utilisez amend depuis HEAD).'), 'err')
      return
    }
    const newMsg = await showPrompt(t('prompt.editMessage'), presetMsg ?? current.message, true)
    if (newMsg === null || newMsg.trim() === '' || newMsg === current.message) return
    setLoading(true)
    const seq = await window.gitAPI.getRebaseSequence(current.parents[0])
    const sequence = seq.commits.map(c => ({ action: c.hash === current.hash ? 'reword' : 'pick', hash: c.hash }))
    const r = await window.gitAPI.interactiveRebase(sequence, [newMsg])
    setLoading(false)
    if (r.success) { showToast(t('toast.messageEdited')); await loadRepoData() }
    else if ((r as { conflict?: boolean }).conflict) { showToast(r.error ?? 'Conflit de rebase', 'err'); await loadRepoData() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
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
        if (r.success) showToast(`✓ Rebasé sur ${hash.slice(0, 7)}`)
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
    if (r.success) showToast(`✓ Poussé jusqu'à ${hash.slice(0, 7)}`)
    else showToast(t('toast.err', r.error ?? ''), 'err')
    setLoading(false)
  }

  const handleCreatePatch = async (hash: string) => {
    const res = await window.gitAPI.createPatch(hash)
    if (res.error) { showToast(t('toast.err', res.error), 'err'); return }
    const r = await window.gitAPI.savePatchFile(res.patch, `${hash.slice(0, 7)}.patch`)
    if (r.success) showToast(`✓ Patch enregistré : ${r.path?.split('/').pop()}`)
    else if (!r.canceled) showToast(t('toast.err', r.error ?? ''), 'err')
  }

  const handleCopyPatch = async (hash: string) => {
    const res = await window.gitAPI.createPatch(hash)
    if (res.error) { showToast(t('toast.err', res.error), 'err'); return }
    navigator.clipboard.writeText(res.patch)
    showToast('✓ Patch copié dans le presse-papiers')
  }

  const handleCreateWorktreeAt = async (hash: string) => {
    const dir = await window.gitAPI.selectDirectory('Emplacement du nouveau worktree')
    if (!dir.path) return
    const branch = await showPrompt('Nom de la nouvelle branche (laisser vide = detached) :', '')
    if (branch === null) return
    const r = await window.gitAPI.addWorktree(dir.path, hash, branch || undefined)
    if (r.success) showToast(`✓ Worktree créé : ${dir.path.split('/').pop()}`)
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }

  const handleOpenCommitOnRemote = (hash: string) => {
    if (!githubOwnerRepo) { showToast('Aucun dépôt GitHub détecté', 'err'); return }
    window.gitAPI.openExternal(`https://github.com/${githubOwnerRepo.owner}/${githubOwnerRepo.repo}/commit/${hash}`)
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
  const handleCreateStash = async () => {
    const message = await showPrompt(t('prompt.stashMessage'))
    if (message === null) return
    const r = await window.gitAPI.createStash(message || undefined)
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
          {isMac && <div className="app-tabs-mac-spacer" />}
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`app-tab ${tab.id === activeTabId && !settingsOpen && !whatsNewActive ? 'active' : ''}`}
              onClick={() => { setSettingsOpen(false); switchTab(tab) }}
              onAuxClick={e => { if (e.button === 1) { e.preventDefault(); closeTab(tab.id) } }}
              onContextMenu={e => { e.preventDefault(); setTabMenu({ x: e.clientX, y: e.clientY, id: tab.id }) }}
              title={tab.path}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="app-tab-icon">
                <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 0 1 1-1h8z"/>
              </svg>
              <span className="app-tab-name">{tab.name}</span>
              <button className="app-tab-close" title={t('tabs.close')}
                onClick={e => { e.stopPropagation(); closeTab(tab.id) }}>×</button>
            </div>
          ))}
          {rebaseHash && (
            <div className="app-tab app-tab--tool active" title="Rebase interactif">
              <span className="app-tab-icon app-tab-icon--tool">⚡</span>
              <span className="app-tab-name">Rebase interactif</span>
              <button className="app-tab-close" title={t('tabs.close')}
                onClick={e => { e.stopPropagation(); setRebaseHash(null) }}>×</button>
            </div>
          )}
          {/* Tab order = opening order. The home is a "pick a repo" screen: opening
              a REPO from it closes it (this tab disappears once a repo is active).
              It stays only while the home is the view, or while a non-repo view
              (release notes) opened FROM it is up — and it renders BEFORE those,
              since they're opened after it. */}
          {(activeTabId === null || whatsNewActive) && (
            <div className={`app-tab app-tab--tool ${activeTabId === null && !settingsOpen && !whatsNewActive ? 'active' : ''}`}
              title={t('tabs.home')} onClick={() => { setSettingsOpen(false); goHome() }}>
              <span className="app-tab-icon app-tab-icon--tool">🏠</span>
              <span className="app-tab-name">{t('tabs.home')}</span>
            </div>
          )}
          {whatsNew && (
            <div className={`app-tab app-tab--tool ${whatsNewActive && !settingsOpen ? 'active' : ''}`} title="Quoi de neuf"
              onClick={() => { setSettingsOpen(false); setWhatsNewActive(true) }}>
              <span className="app-tab-icon app-tab-icon--tool">✨</span>
              <span className="app-tab-name">Quoi de neuf</span>
              <button className="app-tab-close" title={t('tabs.close')}
                onClick={e => { e.stopPropagation(); setWhatsNew(null); setWhatsNewActive(false) }}>×</button>
            </div>
          )}
          <button className="app-tab-add"
            title={t('tabs.new')} onClick={() => { setSettingsOpen(false); goHome() }}>+</button>

          {/* Right cluster: update · notifications · settings · profile */}
          <div className="app-tabs-right">
            {updatePhase !== 'idle' && (
              <button className="app-tb-update-btn" title={t('toolbar.update.tooltip')}
                onClick={() => setUpdateOverlayOpen(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span className="app-tb-update-btn-label">{t('toolbar.update.label')}</span>
              </button>
            )}
            <button className={`app-tb-icon app-tb-bell ${notifsOpen ? 'active' : ''}`}
              title={t('notifs.title')} onClick={() => setNotifsOpen(v => !v)}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 16a2 2 0 0 0 1.985-1.75c.017-.137-.097-.25-.235-.25h-3.5c-.138 0-.252.113-.235.25A2 2 0 0 0 8 16zm.535-13.518C10.456 2.787 12 4.482 12 6.5c0 1.5.286 2.658.66 3.516.187.43.39.764.578 1.011.094.124.18.225.249.302a3.86 3.86 0 0 0 .153.163l.013.013.004.004.001.001H14a.5.5 0 0 1 0 1H2a.5.5 0 0 1 0-1h.342l.001-.001.004-.004.013-.013a3.86 3.86 0 0 0 .153-.163c.069-.077.155-.178.249-.302.188-.247.391-.581.578-1.011C4.714 9.158 5 8 5 6.5c0-2.018 1.544-3.713 3.465-4.018A1.5 1.5 0 0 1 8 1.5a1.5 1.5 0 0 1 .535.982z"/>
              </svg>
              {unreadCount > 0 && (
                <span className="app-tb-bell-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
              )}
            </button>
            <button className={`app-tb-icon ${settingsOpen ? 'active' : ''}`}
              title={t('settings.title')} onClick={() => setSettingsOpen(v => !v)}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
                <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.376l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.318z"/>
              </svg>
            </button>
            <button className="app-profile-chip" title={githubUser?.login ?? t('settings.profile')}
              onClick={() => { setSettingsOpen(true) }}>
              {githubUser?.avatar
                ? <img className="app-profile-avatar" src={githubUser.avatar} alt={githubUser.login} />
                : <span className="app-profile-avatar app-profile-avatar--fallback">{(githubUser?.login ?? '?').slice(0, 1).toUpperCase()}</span>}
              <span className="app-profile-name">{githubUser?.login ?? t('settings.defaultProfile')}</span>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06z"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Git action bar — hidden while in preferences */}
      {!settingsOpen && !whatsNewActive && (
      <Toolbar
        topRow={tabs.length === 0}
        repoPath={repoPath}
        currentBranch={currentBranch}
        searchQuery={searchQuery}
        searchMatches={searchMatches}
        showAllBranches={showAllBranches}
        onSearch={setSearchQuery}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onFetch={handleFetch}
        onPush={handlePush}
        onPushModal={handlePushModal}
        onPull={handlePull}
        onCreateBranch={handleCreateBranch}
        onStash={handleStash}
        onPop={handlePop}
        onTerminal={handleTerminal}
        stashCount={stashes.length}
        onToggleAllBranches={() => setShowAllBranches(v => !v)}
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
        onSettings={() => setSettingsOpen(v => !v)}
        settingsOpen={settingsOpen}
        githubRepoUrl={githubRepoUrl}
        onCreatePR={githubOwnerRepo ? () => setPrModalOpen(true) : undefined}
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

      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          showToast={showToast}
          onUpdateFound={(v) => { setUpdateVersion(v); setUpdatePhase('available'); setUpdateOverlayOpen(true); addUpdateNotification(v) }}
        />
      )}

      {/* "What's new" is a full-page tab: no repo sidebar/toolbar behind it, so
          repo actions aren't reachable while it's the active view. */}
      {whatsNewActive && whatsNew && !settingsOpen && (
        <div className="app-fullpage-view">
          <WhatsNew version={whatsNew.version} notes={whatsNew.notes} />
        </div>
      )}

      <div className="app-body" style={{ display: settingsOpen || whatsNewActive ? 'none' : undefined }}>
        {/* ── Activity bar — only with a repo open (useless/empty on the home) ── */}
        {repoPath && (
        <div className="app-activity-bar">
          <button
            className={`act-btn ${activeView === 'git' ? 'active' : ''}`}
            onClick={() => setActiveView('git')}
            title="Git"
          >
            <svg width="22" height="22" viewBox="0 0 16 16" fill="currentColor">
              <path d="M15.698 7.287 8.712.302a1.03 1.03 0 0 0-1.457 0l-1.45 1.45 1.84 1.84a1.223 1.223 0 0 1 1.55 1.56l1.773 1.774a1.224 1.224 0 0 1 1.267 2.025 1.226 1.226 0 0 1-2.002-1.334L8.58 5.963v4.353a1.226 1.226 0 1 1-1.008-.036V5.887a1.226 1.226 0 0 1-.666-1.608L5.093 2.465l-4.79 4.79a1.03 1.03 0 0 0 0 1.457l6.986 6.986a1.03 1.03 0 0 0 1.457 0l6.953-6.953a1.031 1.031 0 0 0-.001-1.458z"/>
            </svg>
          </button>
          <button
            className={`act-btn ${activeView === 'github' ? 'active' : ''}`}
            onClick={() => setActiveView('github')}
            title="GitHub — PRs & Issues"
          >
            <svg width="22" height="22" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
            </svg>
          </button>
        </div>
        )}

        {/* ── Sidebar panel — only with a repo open (the home has its own repo list) ── */}
        {repoPath && (
        <div className="app-sidebar" style={{ width: sidebarW }}>
          {activeView === 'git' && (
            <Sidebar
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
              onPreviewStash={(index, message) => setStashPreview({ index, message })}
              onRefreshStashes={loadStashes}
              onCreateTag={handleCreateTag}
              onDeleteTag={handleDeleteTag}
              onPushTag={handlePushTag}
              onDeleteRemoteTag={handleDeleteRemoteTag}
              onSelectCommit={(hash) => {
                const found = commits.find(c => c.hash === hash || c.hash.startsWith(hash))
                if (found) setSelectedCommit(found)
              }}
              onCompareBranch={(name) => setCompareBranchModal(name)}
              soloBranch={soloBranch}
              mutedBranches={mutedBranches}
              onToggleSolo={(name) => { setSoloBranch(prev => prev === name ? null : name) }}
              onToggleMute={(name) => {
                setMutedBranches(prev => {
                  const next = new Set(prev)
                  next.has(name) ? next.delete(name) : next.add(name)
                  return next
                })
              }}
              showToast={showToast}
              showPrompt={showPrompt}
              showConfirm={showConfirm}
            />
          )}
          {activeView === 'github' && (
            <GitHubPanel repoPath={repoPath} />
          )}
        </div>
        )}

        {repoPath && <div className="resize-handle" onMouseDown={startResizeSidebar} />}

        <div className="app-center">
          {centerDiff && !conflictResolverFile ? (
            <CenterFileDiff target={centerDiff} onClose={() => setCenterDiff(null)} onStaged={() => loadRepoData(true)} />
          ) : conflictResolverFile ? (
            <ConflictResolver
              file={conflictResolverFile}
              initialProposal={conflictResolverProposal ?? undefined}
              onFinish={async () => {
                setConflictResolverProposal(null)
                const res = await window.gitAPI.getConflictedFiles()
                const remaining = res.files
                if (remaining.length > 0) {
                  setConflictFiles(remaining)
                  setConflictResolverFile(remaining[0])
                  showToast(`Fichier résolu — ${remaining.length} conflit(s) restant(s)`)
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
          ) : !repoPath ? (
            <div className="app-welcome">
              <div className="welcome-hero">
                <div className="welcome-brand">
                  <svg className="welcome-logo" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <radialGradient id="wmerge" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#5eff8a"/>
                        <stop offset="100%" stopColor="#3fb950"/>
                      </radialGradient>
                      <filter id="wglow">
                        <feGaussianBlur stdDeviation="6" result="blur"/>
                        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                      </filter>
                    </defs>
                    {/* Left arm — green */}
                    <line x1="148" y1="82" x2="256" y2="422" stroke="#3fb950" strokeWidth="22" strokeLinecap="round"/>
                    {/* Right arm — blue */}
                    <line x1="364" y1="82" x2="256" y2="422" stroke="#58a6ff" strokeWidth="22" strokeLinecap="round"/>
                    {/* Left commits */}
                    <circle cx="148" cy="82"  r="24" fill="#0d1117" stroke="#3fb950" strokeWidth="13"/>
                    <circle cx="184" cy="192" r="18" fill="#0d1117" stroke="#3fb950" strokeWidth="11"/>
                    <circle cx="220" cy="302" r="18" fill="#0d1117" stroke="#3fb950" strokeWidth="11"/>
                    {/* Right commits */}
                    <circle cx="364" cy="82"  r="24" fill="#0d1117" stroke="#58a6ff" strokeWidth="13"/>
                    <circle cx="328" cy="192" r="18" fill="#0d1117" stroke="#58a6ff" strokeWidth="11"/>
                    <circle cx="292" cy="302" r="18" fill="#0d1117" stroke="#58a6ff" strokeWidth="11"/>
                    {/* Merge node */}
                    <circle cx="256" cy="422" r="28" fill="url(#wmerge)" filter="url(#wglow)"/>
                    <circle cx="256" cy="422" r="14" fill="#0d1117"/>
                  </svg>
                  <div>
                    <h1 className="welcome-title">Git Vertex</h1>
                    <p className="welcome-sub">{t('welcome.hint')}</p>
                  </div>
                </div>

                <div className="welcome-actions">
                  <button className="welcome-btn welcome-btn-primary" onClick={handleOpenRepo}>
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/>
                    </svg>
                    {t('welcome.open')}
                  </button>
                  <button className="welcome-btn welcome-btn-secondary" onClick={() => setCloneOpen(true)}>
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
                    </svg>
                    {t('clone.title')}
                  </button>
                  <button className="welcome-btn welcome-btn-secondary" onClick={handleCreateRepo}>
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M7.75 2a.75.75 0 0 1 .75.75V7.25h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 7.75 2Z"/>
                    </svg>
                    {t('welcome.create')}
                  </button>
                </div>

                <div className="welcome-search">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215l-3.04-3.04ZM11.5 7a4.5 4.5 0 1 0-9 0 4.5 4.5 0 0 0 9 0Z"/>
                  </svg>
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
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"/>
                        </svg>
                        {t('welcome.recents')}
                      </div>
                      <div className="welcome-recents-list">
                        {list.slice(0, 8).map(path => {
                          const parts = path.split(/[\\/]/).filter(Boolean)
                          const name = parts[parts.length - 1] ?? path
                          const parent = parts.slice(0, -1).join('/')
                          return (
                          <button key={path} className="welcome-recent-item" onClick={() => handleSetRepo(path)} title={path}>
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="welcome-recent-icon">
                              <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 0 1 1-1h8z"/>
                            </svg>
                            <div className="welcome-recent-info">
                              <span className="welcome-recent-name">{name}</span>
                              <span className="welcome-recent-path">{parent}</span>
                            </div>
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="welcome-recent-arrow">
                              <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"/>
                            </svg>
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
                  <span className="welcome-res-icon">✨</span>{t('welcome.releaseNotes')}
                </button>
                <button className="welcome-res-link" onClick={() => (window.gitAPI as any).openExternal?.('https://github.com/VictorQuilgars/git-vertex')}>
                  <span className="welcome-res-icon">{'</>'}</span>{t('welcome.sourceCode')}
                </button>
                <button className="welcome-res-link" onClick={() => (window.gitAPI as any).openExternal?.('https://github.com/VictorQuilgars/git-vertex#readme')}>
                  <span className="welcome-res-icon">📖</span>{t('welcome.docs')}
                </button>
              </div>
            </div>
          ) : (
            <CommitGraph
              commits={commits}
              selectedHash={selectedCommit?.hash ?? null}
              onSelectCommit={c => { setCenterDiff(null); setSelectedCommit(prev => prev?.hash === c.hash ? null : c) }}
              searchQuery={aiSearch ? '' : searchQuery}
              searchHashes={graphSearchHashes}
              currentBranch={currentBranch}
              onCherryPick={handleCherryPick}
              onRevert={handleRevert}
              onReset={handleReset}
              onCreateTag={handleCreateTagAtCommit}
              onCreateBranchAt={handleCreateBranchAt}
              onCheckoutBranch={handleCheckout}
              onMergeBranch={handleMergeBranch}
              onRebaseCurrentOnto={handleRebaseOnto}
              onInteractiveRebase={(hash) => setRebaseHash(hash)}
              onCheckoutCommit={handleCheckout}
              onRewordCommit={handleRewordCommit}
              onCompareWorking={(hash) => setCompareWorkingHash(hash)}
              compareBaseHash={compareBaseHash}
              onSelectForCompare={(hash) => { setCompareBaseHash(hash); showToast('◎ Commit sélectionné pour comparaison') }}
              onCompareWithSelected={(hash) => { if (compareBaseHash) setComparePair({ from: compareBaseHash, to: hash }) }}
              onDropCommit={handleDropCommit}
              onMoveCommit={handleMoveCommit}
              onBranchDrop={handleBranchDrop}
              onRebaseCurrentOntoCommit={handleRebaseCurrentOntoCommit}
              onPushToCommit={handlePushToCommit}
              onCreatePatch={handleCreatePatch}
              onCopyPatch={handleCopyPatch}
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

        {repoPath && !rebaseHash && (selectedCommit || conflictMode) && (
          <>
            <div className="resize-handle" onMouseDown={startResizeRight} />
            <div className="app-right" style={{ width: rightW }}>
              <RightPanel
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
                conflictMode={conflictMode}
                onConflictFinish={handleConflictFinish}
                onConflictAbort={handleConflictAbort}
                onOpenResolver={(file) => setConflictResolverFile(file)}
                onOpenFileDiff={setCenterDiff}
                githubRepo={githubOwnerRepo}
                onRewordWithMessage={(hash, msg) => handleRewordCommit(hash, msg)}
                commitProposal={commitProposal}
                onCommitProposalConsumed={() => setCommitProposal(null)}
              />
            </div>
          </>
        )}
      </div>

      {/* ── Status bar (bottom) ── */}
      {!settingsOpen && repoPath && (
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

      {/* PR Modal */}
      {prModalOpen && githubOwnerRepo && (
        <PRModal
          owner={githubOwnerRepo.owner}
          repo={githubOwnerRepo.repo}
          currentBranch={currentBranch}
          onClose={() => setPrModalOpen(false)}
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

      {/* Branch Comparison */}
      {compareBranchModal && (
        <BranchCompareModal
          otherBranch={compareBranchModal}
          currentBranch={currentBranch}
          onClose={() => setCompareBranchModal(null)}
          onSelectCommit={(hash) => {
            const found = commits.find(c => c.hash === hash || c.hash.startsWith(hash))
            if (found) setSelectedCommit(found)
          }}
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
      {compareWorkingHash && (
        <CompareWorkingModal
          hash={compareWorkingHash}
          onClose={() => setCompareWorkingHash(null)}
        />
      )}

      {/* Stash content preview */}
      {stashPreview && (
        <StashPreviewModal
          index={stashPreview.index}
          message={stashPreview.message}
          onClose={() => setStashPreview(null)}
        />
      )}

      {/* Compare two commits */}
      {comparePair && (
        <CompareCommitsModal
          from={comparePair.from}
          to={comparePair.to}
          onClose={() => setComparePair(null)}
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
