// The root: the hooks that hold the app's state and handlers (src/renderer/src/app/),
// the layout of the window, the effects that tie them together, and the render.
import React, { useState, useEffect, useRef } from 'react'
import { useWindowWidth } from './hooks/useWindowWidth'
import { detailsTakeCenter } from './utils/layout'
import { Icon } from './components/Icon/Icon'
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary'
import { PullMode } from './types'
import Toolbar from './components/Toolbar/Toolbar'
import Sidebar from './components/Sidebar/Sidebar'
import StatusBar from './components/StatusBar/StatusBar'
import CommitGraph from './components/CommitGraph/CommitGraph'
import RightPanel from './components/RightPanel/RightPanel'
import { PromptDialog, ConfirmDialog, ChoiceDialog } from './components/Dialog/Dialog'
import CommandPalette from './components/CommandPalette/CommandPalette'
import { Mark } from './components/Mark/Mark'
import { Brand } from './components/BrandMark/BrandMark'
import InteractiveRebase from './components/InteractiveRebase/InteractiveRebase'
import UpdateOverlay from './components/UpdateOverlay/UpdateOverlay'
import NotificationCenter from './components/NotificationCenter/NotificationCenter'
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
import { type LinkedIssue } from './hooks/useBranchMeta'
import InitModal from './components/InitModal/InitModal'
import PRComposer from './components/PRComposer/PRComposer'
import IssueComposer from './components/IssueComposer/IssueComposer'
import AIAnswer from './components/AIAnswer/AIAnswer'
import { timeAgo } from './components/GitHubPanel/GithubRow'
import CommitComposer from './components/CommitComposer/CommitComposer'
import { branchNeedsPush } from './components/ContextMenu/prIntent'
import { shortName } from './components/ContextMenu/branchRefs'
import GitflowModal from './components/GitflowModal/GitflowModal'
import CenterFileDiff from './components/CenterFileDiff/CenterFileDiff'
import IssueDetail, { detailKey } from './components/IssueDetail/IssueDetail'
import PRDetail from './components/IssueDetail/PRDetail'
import ContextMenu, { MenuItemDef } from './components/ContextMenu/ContextMenu'
import { kindsByPath, StashPreview, viewTabName, viewTabIcon, GITHUB_POLL_MS } from './app/shared'
import { useAppChrome } from './app/useAppChrome'
import { useRepoSession } from './app/useRepoSession'
import { useAppGithub } from './app/useAppGithub'
import { useAppConflicts } from './app/useAppConflicts'
import { useAppAi } from './app/useAppAi'
import { useAppTabs } from './app/useAppTabs'
import { useAppUpdates } from './app/useAppUpdates'
import { useAppActions } from './app/useAppActions'
import { useAppSearch } from './app/useAppSearch'
import './App.css'

// Kept on this module for the tests and hosts that import them from here.
export { viewNeedsRepo, sameView } from './app/shared'

export default function App() {
  // The app's state and handlers, one hook per concern, each reading the ones before it.
  // See src/renderer/src/app/.
  const chromeHook = useAppChrome()
  const sessionHook = useRepoSession({ ...chromeHook })
  const githubHook = useAppGithub({ ...chromeHook, ...sessionHook })
  const conflictsHook = useAppConflicts({ ...chromeHook, ...sessionHook, ...githubHook })
  const aiHook = useAppAi({ ...chromeHook, ...sessionHook, ...githubHook, ...conflictsHook })
  const tabsHook = useAppTabs({ ...chromeHook, ...sessionHook, ...githubHook, ...conflictsHook, ...aiHook })
  const updatesHook = useAppUpdates({ ...chromeHook, ...sessionHook, ...githubHook, ...conflictsHook, ...aiHook, ...tabsHook })
  const actionsHook = useAppActions({ ...chromeHook, ...sessionHook, ...githubHook, ...conflictsHook, ...aiHook, ...tabsHook, ...updatesHook })
  const searchHook = useAppSearch({ ...chromeHook, ...sessionHook, ...githubHook, ...conflictsHook, ...aiHook, ...tabsHook, ...updatesHook, ...actionsHook })
  const app = { ...chromeHook, ...sessionHook, ...githubHook, ...conflictsHook, ...aiHook, ...tabsHook, ...updatesHook, ...actionsHook, ...searchHook }
  const {
    dlg, showPrompt, showConfirm, closeDlg, t, showToast, repoPath, repoName, commits, logLimit, logLimitRef, branches, currentBranch, selectedCommit, setSelectedCommit, showAllBranches, setShowAllBranches, soloBranch, setSoloBranch, visibility, remoteNames, toggleHidden, setFamilyHidden, branchMeta, setNotedHashes, loading, recentRepos, setRecentRepos, workspaces, setWorkspaces, stashes, tags, lastFetchTime, setLastFetchTime, pullMode, setPullModeState, handleSetPullMode, tracking, githubRepoUrl, githubOwnerRepo, defaultBranch, conflictFiles, setConflictFiles, conflictKinds, setConflictKinds, conflictMode, wipCount, loadStashes, visibilityRef, soloRef, showAllRef, loadRepoData, loadRepoDataRef, hasSnapshot, filterFirstRun, resolverFileSeenRef, lastAutoFetchError, loadMoreHistory, issueModalBranch, setIssueModalBranch, githubUser, setGithubUser, setGithubConnected, githubPRs, githubPRsRef, githubIssues, githubIssuesRef, githubLogin, issueDetail, setIssueDetail, prModalOpen, setPrModalOpen, prIntent, setPrIntent, githubRefreshing, githubRefreshTick, githubPollTick, setGithubPollTick, loadGithubLists, refreshGithubSection, issueComposerOpen, setIssueComposerOpen, handleSharePatch, prIntentFor, handleStartPR, handleOpenCommitOnRemote, currentBranchPR, handleOpenFileOnRemote, handleCopyFileLink, handleCreateBranchFromIssue, handleOpenBranchOnRemote, rebaseHash, setRebaseHash, rebasePlanProposal, setRebasePlanProposal, conflictResolverFile, setConflictResolverFile, conflictResolverProposal, setConflictResolverProposal, handleRebaseOnto, handleRebaseCurrentOntoCommit, handleConflictFinish, handleConflictAbort, aiSearch, setAiSearch, setAiSearchHashes, aiSearchLoading, commitProposal, setCommitProposal, aiRead, setAiRead, composerOpen, setComposerOpen, sidebarTab, setSidebarTab, memoryToken, rememberedAI, insertChangelogGuarded, tabs, setTabs, activeTabId, tabMenu, setTabMenu, repoMgmtOpen, setRepoMgmtOpen, whatsNew, setWhatsNew, whatsNewActive, setWhatsNewActive, applyRepo, handleOpenRepo, handleSetRepo, openReleaseNotes, handleRemoveRecent, deepLinkHash, setDeepLinkHash, applyDeepLink, openHomeTab, openLaunchpadTab, openThemesTab, openViewTab, openSettingsTab, switchTab, closeTab, closeOtherTabs, activeTab, launchpadActive, themesActive, viewTab, onTabKeyDown, updatePhase, setUpdatePhase, updateVersion, setUpdateVersion, updatePct, setUpdatePct, updateOverlayOpen, setUpdateOverlayOpen, notifications, setNotifications, notifsOpen, setNotifsOpen, unreadCount, addUpdateNotification, startUpdateDownload, compareBaseHash, setCompareBaseHash, gitflowOpen, setGitflowOpen, pushModalOpen, setPushModalOpen, cloneOpen, setCloneOpen, initModalOpen, setInitModalOpen, handleCreateRepo, handleUndo, handleRedo, handleFetch, handlePush, handlePushModal, handleStash, handlePop, handleTerminal, handlePull, handleGoTo, handleCheckout, handleCheckoutTag, handleCreateBranch, handleDeleteBranch, handleDeleteBranchBoth, handleMergeBranch, handlePushBranch, handleDeleteRemoteBranch, handleSetUpstream, handleRenameBranch, handleCreateBranchAt, handleCherryPick, handleRevert, handleReset, applyReword, handleRewordCommit, handleDropCommit, handleCherryPickMany, handleDropCommits, handlePushToCommit, handleCreatePatch, handleCopyPatch, handleCreateWorktreeAt, handleCopyBranchLink, handleRestoreFile, handleCopyCommitLink, branchMenuItems, branchStripProps, handleBranchDrop, handleMoveCommit, handleCreateTagAtCommit, handleCreateAnnotatedTagAtCommit, handleCreateTag, handleDeleteTag, handlePushTag, handleDeleteRemoteTag, handleCreateStash, handleApplyStash, handlePopStash, handleDropStash, searchQuery, setSearchQuery, searchMatches, setSearchMatches, extendedSearch, setExtendedSearch, extendedSearchLoading, repoSearch, setRepoSearch, paletteOpen, setPaletteOpen, runAiSearch, graphSearchHashes, buildPaletteCommands,
  } = app

 logLimitRef.current = logLimit
  const [sidebarW, setSidebarW] = useState<number>(230)
  const [rightW, setRightW] = useState<number>(() => {
    const saved = parseInt(localStorage.getItem('app-right-w') ?? '', 10)
    return Number.isFinite(saved) && saved >= 280 ? saved : 360
  })
  useEffect(() => { localStorage.setItem('app-right-w', String(rightW)) }, [rightW])
  useEffect(() => {
    window.gitAPI.settingsGetAll().then(s => {
      const saved = s?.pullMode as PullMode | undefined
      if (saved === 'fetch' || saved === 'ff' || saved === 'ff-only' || saved === 'rebase') setPullModeState(saved)
    }).catch(() => {})
  }, [])
 githubPRsRef.current = githubPRs
 githubIssuesRef.current = githubIssues
  // The left panel's box — what the composer's drawer measures itself against.
  const sidebarPanelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    localStorage.setItem('notifications', JSON.stringify(notifications.slice(0, 50)))
  }, [notifications])
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
 visibilityRef.current = visibility
 soloRef.current = soloBranch
 showAllRef.current = showAllBranches
 loadRepoDataRef.current = loadRepoData
  // The shown repository changed: read it. Silently when it comes back from
  // behind a tab with its snapshot already on screen — the refresh brings what
  // changed while it was hidden, with no spinner over a graph that is right.
  useEffect(() => { if (repoPath) void loadRepoData(hasSnapshot(repoPath)) }, [repoPath, loadRepoData, hasSnapshot])
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
  // The extended search lives in useAppSearch, with the reach beyond the page.
  // Leaving AI mode or clearing the query drops the AI result set.
  useEffect(() => {
    if (!aiSearch || !searchQuery.trim()) setAiSearchHashes(null)
  }, [aiSearch, searchQuery])
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
  useEffect(() => window.gitAPI.onAutoFetched?.(r => {
    // A fetch names its repository now: the shown one follows on screen, a
    // hidden one in its snapshot, so its tab shows the present when reopened.
    const shown = !r.repo || r.repo === repoPath
    if (r.success) {
      if (!shown) { if (hasSnapshot(r.repo!)) void loadRepoData(true, r.repo); return }
      lastAutoFetchError.current = null
      setLastFetchTime(new Date())
      void loadRepoData(true)
      return
    }
    const message = r.error ?? ''
    if (message === lastAutoFetchError.current) return
    lastAutoFetchError.current = message
    // Named after its repository when that is not the one shown.
    showToast(t('toast.autoFetchFailed', message), 'err', undefined, undefined, r.repo ?? null)
  }), [loadRepoData, showToast, t, repoPath, hasSnapshot])
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
  useEffect(() => { setIssueDetail(null) }, [repoPath])
  useEffect(() => { localStorage.setItem('sb-tab', sidebarTab) }, [sidebarTab])
  useEffect(() => {
    setPrModalOpen(false); setPrIntent(null); setIssueComposerOpen(false)
    setAiRead(null); setComposerOpen(false)
  }, [repoPath])
  // eslint-disable-line react-hooks/exhaustive-deps

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
  // The details take the centre when the graph would have no usable width left
  // beside the two side panes — computed from the panes the user actually has
  // (see utils/layout.ts), so a wide right pane counts as much as a narrow window.
  const windowWidth = useWindowWidth()
  const compactDetails = !!selectedCommit && !conflictResolverFile && !rebaseHash && !viewTab && !issueDetail
    && detailsTakeCenter(windowWidth, repoPath ? sidebarW : 0, rightW)

  return (
    <div className="app">
      {/* ── Repo tabs (top, browser-style) ── */}
      {/* Tabs stay visible in preferences; also keep the bar
          when settings is open with no tabs so the mac traffic lights keep their
          spacing and the window stays draggable. */}
      {/* Always render the top bar so Settings/profile stay reachable from the
          welcome screen too (not only once a repo/tab is open). */}
      {(
        <div className="app-tabs" role="tablist">
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
              role="tab"
              aria-selected={tab.id === activeTabId && !whatsNewActive}
              tabIndex={tab.id === activeTabId ? 0 : -1}
              data-tab-id={tab.id}
              onKeyDown={e => onTabKeyDown(e, tab)}
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
        repoName={repoName}
        recentRepos={recentRepos}
        onOpenRepo={handleOpenRepo}
        onClone={() => setCloneOpen(true)}
        onSetRepo={handleSetRepo}
        onRemoveRecent={handleRemoveRecent}
        branches={branches}
        onGoTo={handleGoTo}
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

      <div className={`app-body${compactDetails ? ' app-body--detail' : ''}`} style={{ display: whatsNewActive || repoMgmtOpen ? 'none' : undefined }}>
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
              wipCount={wipCount}
              wipSelected={selectedCommit?.hash === '__WIP__'}
              onViewWip={() => setSelectedCommit({
                hash: '__WIP__', shortHash: 'WIP', message: '//WIP',
                author: '', authorEmail: '', date: '', parents: [], refs: []
              })}
              repoPath={repoPath}
              repoName={repoName}
              currentBranch={currentBranch}
              branches={branches}
              recentRepos={recentRepos}
              stashes={stashes}
              onExplainStash={(index, message) => setAiRead({ kind: 'stash', index, label: message })}
              onExplainBranch={(name) => setAiRead({ kind: 'branch', ref: name, label: shortName(name, new Set(remoteNames)) })}
              onBranchChangelog={(name) => setAiRead({ kind: 'changelog', ref: name, label: shortName(name, new Set(remoteNames)) })}
              onOpenChangelog={(name) => setAiRead({ kind: 'changelog', ref: name, label: shortName(name, new Set(remoteNames)) })}
              tab={sidebarTab}
              onTab={setSidebarTab}
              memoryToken={memoryToken}
              onShowCommits={(hashes) => {
                // Pointing at a second reading replaces the first: two
                // highlighted branches at once is a graph nobody can read.
                setNotedHashes(new Set(hashes))
                const first = commits.find(c => hashes.includes(c.hash))
                if (first) setSelectedCommit(first)
              }}
              onOpenNote={(n) => {
                if (n.kind === 'branch') setAiRead({ kind: 'branch', ref: n.key, label: n.title })
                else if (n.kind === 'working') setAiRead({ kind: 'working' })
                else setAiRead({ kind: 'stash', index: n.key, label: n.title })
              }}
              onOpenExplanation={(hash) => {
                const found = commits.find(c => c.hash === hash)
                if (found) setSelectedCommit(found)
                else showToast(t('sb.ai.unknownCommit'), 'err')
              }}
              subjectFor={(hash) => commits.find(c => c.hash === hash)?.message}
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
              onStartPR={githubOwnerRepo ? () => handleStartPR(currentBranchPR ?? {
                // The header's + is a door to the whole composer, not a
                // promise about one pair — the four ends are choosable in
                // there. When the rules propose nothing (default branch, or
                // the pair's request already open — rule 6), the composer
                // still opens, prefilled with where you stand.
                head: currentBranch,
                base: defaultBranch,
                baseLabel: null,
                headLabel: currentBranch,
                needsPush: branchNeedsPush(currentBranch, branches),
              }) : undefined}
              onNewIssue={githubOwnerRepo ? () => setIssueComposerOpen(true) : undefined}
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
          {/* Fenced: a view that throws says so in its own pane, and the tabs,
              the sidebar and the toolbar stay up. */}
          <ErrorBoundary>
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
              unpushedCount={branches.find(b => b.current && !b.remote)?.ahead}
              onClose={() => { setRebaseHash(null); setRebasePlanProposal(null) }}
              onSuccess={loadRepoData}
              showToast={showToast}
            />
          ) : viewTab && activeTab?.path && activeTab.path !== repoPath ? (
            <div role="status">{t('common.loading')}</div>
          ) : viewTab ? (
            viewTab.view === 'compare' ? (
              <CompareView
                key={activeTabId}
                initialA={viewTab.a}
                initialB={viewTab.b}
                initialAxis={viewTab.axis}
                onComparisonChange={(a, b, axis) => setTabs(prev => prev.map(tb =>
                  tb.id === activeTabId && tb.body?.view === 'compare'
                    ? { ...tb, body: { ...tb.body, a, b, axis } }
                    : tb))}
                repoKey={repoPath}
                onTitleChange={(title) => setTabs(prev => prev.map(tb =>
                  tb.id === activeTabId && tb.body?.view === 'compare'
                    ? { ...tb, body: { ...tb.body, label: title } }
                    : tb))}
              />
            ) : viewTab.view === 'fileHistory' ? (
              <FileHistory key={activeTabId} file={viewTab.file} />
            ) : viewTab.view === 'fileDiff' ? (
              <CenterFileDiff
                key={activeTabId}
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
              key={detailKey('pr', issueDetail.item.number)}
              repo={githubOwnerRepo}
              number={issueDetail.item.number}
              onClose={() => setIssueDetail(null)}
              onChanged={() => { if (githubOwnerRepo) void loadGithubLists(githubOwnerRepo) }}
            />
            ) : (
            <IssueDetail
              key={detailKey('issue', issueDetail.item.number)}
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
              onCherryPickMany={handleCherryPickMany}
              onDropCommits={handleDropCommits}
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
          </ErrorBoundary>
        </div>

        {repoPath && !rebaseHash && !viewTab && !issueDetail && (selectedCommit || conflictMode) && (
          <>
            <div className="resize-handle" onMouseDown={startResizeRight} />
            <div className="app-right" style={{ width: rightW }}>
              {compactDetails && !conflictMode && (
                <button className="app-detail-back" onClick={() => setSelectedCommit(null)}>
                  <Icon name="chevronLeft" size={14} /> {t('cfd.backToGraph')}
                </button>
              )}
              <ErrorBoundary>
              <RightPanel
                repoPath={repoPath}
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
                onExplainWorking={() => setAiRead({ kind: 'working' })}
                onSplitCommits={() => setComposerOpen(true)}
                branchStrip={branchStripProps}
              />
              </ErrorBoundary>
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
          commitCount={commits.length}
          historyTruncated={commits.length >= logLimit}
          onLoadMore={loadMoreHistory}
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

      {/* Issue composer — the PR composer's sibling drawer (#95). */}
      {issueComposerOpen && githubOwnerRepo && (
        <IssueComposer
          owner={githubOwnerRepo.owner}
          repo={githubOwnerRepo.repo}
          anchor={sidebarPanelRef}
          onClose={() => setIssueComposerOpen(false)}
          onCreated={() => { if (githubOwnerRepo) void loadGithubLists(githubOwnerRepo, 'issues') }}
          onStartBranch={handleCreateBranchFromIssue}
          showToast={showToast}
        />
      )}

      {/* What the model reads, in the composers' drawer (#70 P1). A branch,
          a stash, the uncommitted work — same shape, one component. */}
      {aiRead?.kind === 'branch' && (
        <AIAnswer
          anchor={sidebarPanelRef}
          title={t('ai.branch.title')}
          subject={aiRead.label}
          icon="branch"
          guide
          onClose={() => setAiRead(null)}
          onGenerated={rememberedAI}
          run={async (guidance) => {
            const r = await ((window.gitAPI as any).aiExplainBranch?.(aiRead.ref, guidance)
              ?? Promise.resolve({ error: 'not-implemented' }))
            return { text: r?.explanation, meta: r?.base ? t('ai.branch.meta', r.base) : undefined, error: r?.error }
          }}
        />
      )}

      {/* The changelog is the one answer people come back to — it is written
          to be pasted — so it is remembered, and it says when it has fallen
          behind the branch instead of quietly showing yesterday's text. */}
      {aiRead?.kind === 'changelog' && (
        <AIAnswer
          anchor={sidebarPanelRef}
          title={t('ai.changelog.title')}
          subject={aiRead.label}
          icon="branch"
          mono
          onClose={() => setAiRead(null)}
          onGenerated={rememberedAI}
          recall={async () => {
            const r = await ((window.gitAPI as any).aiChangelogState?.(aiRead.ref)
              ?? Promise.resolve(null))
            const c = r?.cached
            if (!c?.text?.trim()) return null
            const behind = (r.newCommits ?? 0) > 0
            return {
              text: c.text,
              meta: [
                t('ai.changelog.meta', c.commits ?? 0, c.base),
                t('ai.changelog.written', timeAgo(new Date(c.at).toISOString(), t)),
              ].join(' · '),
              notice: behind ? t('ai.changelog.behind', r.newCommits)
                : r.baseMoved ? t('ai.changelog.baseMoved') : undefined,
              stale: behind,
            }
          }}
          run={async (_guidance, previous) => {
            const r = await ((window.gitAPI as any).aiGenerateChangelog?.(aiRead.ref, undefined, previous)
              ?? Promise.resolve({ error: 'not-implemented' }))
            return {
              text: r?.changelog,
              meta: r?.base ? t('ai.changelog.meta', r.commits ?? 0, r.base) : undefined,
              error: r?.error,
            }
          }}
          actions={[{
            label: t('ai.changelog.insert'),
            title: t('ai.changelog.insertTitle'),
            run: (text) => insertChangelogGuarded(text, aiRead.ref),
          }]}
        />
      )}

      {aiRead?.kind === 'stash' && (
        <AIAnswer
          anchor={sidebarPanelRef}
          title={t('ai.stash.title')}
          subject={aiRead.label}
          icon="stash"
          guide
          onClose={() => setAiRead(null)}
          onGenerated={rememberedAI}
          run={async (guidance) => {
            const r = await ((window.gitAPI as any).aiExplainStash?.(aiRead.index, guidance)
              ?? Promise.resolve({ error: 'not-implemented' }))
            return { text: r?.explanation, error: r?.error }
          }}
        />
      )}

      {aiRead?.kind === 'working' && (
        <AIAnswer
          anchor={sidebarPanelRef}
          title={t('ai.working.title')}
          subject={t('ai.working.subject')}
          icon="staging"
          guide
          onClose={() => setAiRead(null)}
          onGenerated={rememberedAI}
          run={async (guidance) => {
            const r = await ((window.gitAPI as any).aiExplainWorking?.(guidance)
              ?? Promise.resolve({ error: 'not-implemented' }))
            return { text: r?.explanation, error: r?.error }
          }}
        />
      )}

      {composerOpen && (
        <CommitComposer
          anchor={sidebarPanelRef}
          onClose={() => setComposerOpen(false)}
          onCommitted={loadRepoData}
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
      {dlg?.kind === 'choice' && (
        <ChoiceDialog
          message={dlg.message}
          options={dlg.options}
          onPick={v => { dlg.resolve(v); closeDlg() }}
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
