// The sidebar's state — what it loads for each list, what it remembers, and every handler
// its rows call — as one hook. The panel renders it; a section reads its slice.
import { useState, useRef, useEffect, useCallback } from 'react'
import { BranchInfo } from '../../types'
import { MenuItemDef } from '../ContextMenu/ContextMenu'
import { loadGhFilters, saveGhFilters, type GhSavedFilter, type GhFilterStore } from './ghFilters'
import { folderPaths, type BranchNode } from './branchTree'
import { isRefHidden, type RefFamily } from '../../utils/graphVisibility'
import { useLang } from '../../i18n/LanguageContext'
import { type SidebarView, type ReflogEntry, type ChangelogEntry, type NoteEntry, type RemoteEntry, type SubmoduleEntry, type WorktreeEntry, type AgentEntry, type SidebarProps } from './types'

export function useSidebar(props: SidebarProps) {
  const {
  repoPath, repoName, currentBranch, branches, recentRepos, stashes, tags,
  wipCount, wipSelected, onViewWip,
  onOpenRepo, onClone, onSetRepo, onRemoveRecent,
  onCheckout, onCreateBranch, onDeleteBranch, onMergeBranch, onRenameBranch,
  onRebaseOnto, onPushBranch, onDeleteRemoteBranch, onSetUpstream,
  onCreateStash, onApplyStash, onPopStash, onDropStash, onPreviewStash, onExplainStash, onRefreshStashes,
  onExplainBranch, onBranchChangelog, onOpenChangelog, onOpenExplanation, onOpenNote,
  onShowCommits,
  subjectFor, tab = 'list', onTab, memoryToken,
  onCreateTag, onDeleteTag, onCheckoutTag, onGoTo, onPushTag, onDeleteRemoteTag,
  onSelectCommit, onCompareBranch,
  soloBranch, visibility, onToggleSolo, onToggleHide,
  onToggleHideTag, onToggleHideRemote, onSetFamilyHidden,
  onPull,
  githubPRs, githubIssues, onOpenGithubItem, onStartBranchFromIssue, onShowGithubDetail, githubDetailOpen, githubLogin, githubRepo,
  isFavorite, issueFor, onToggleFavorite,
  onOpenBranchOnRemote, onAssociateIssue, prIntentFor, onCreatePR,
  showAllBranches, onToggleAllBranches,
  onRefreshGithub, onStartPR, onNewIssue, githubRefreshing, githubRefreshTick, githubPollTick,
  onCopyBranchLink, onDeleteBranchBoth,
  showToast, showPrompt, showConfirm, onRefresh, view,
} = props
  // In single-view mode a section is shown when it matches the active view.
  // Without a view (desktop) every section renders (classic stacked layout).
  const single = view !== undefined
  /**
   * The desktop panel is stacked — every section at once — but it now has two
   * of those stacks: the repository as a list, and what the model has written
   * for it. In single-view mode the rail already chooses, so the strip does
   * not appear and `view` decides.
   */
  const activeTab: 'list' | 'ai' = single ? (view === 'ai' ? 'ai' : 'list') : tab
  const showAI = activeTab === 'ai'
  const show = (v: SidebarView) => single ? view === v : !showAI
  const [reflog, setReflog] = useState<ReflogEntry[]>([])
  const [remotes, setRemotes] = useState<RemoteEntry[]>([])
  // Which remote push/pull target by default — resolved by the service, so it
  // reflects the explicit choice or the origin/first-remote fallback.
  const [defaultRemote, setDefaultRemote] = useState<string | null>(null)
  const [submodules, setSubmodules] = useState<SubmoduleEntry[]>([])
  const [worktrees, setWorktrees] = useState<WorktreeEntry[]>([])
  // Running AI agents (Claude Code, aider…) keyed by their cwd — matched
  // against worktree paths to badge "an agent is working here".
  const [agents, setAgents] = useState<AgentEntry[]>([])
  // Working-tree summary for the overview "current work" card.
  const [work, setWork] = useState<{ staged: number; changed: number }>({ staged: 0, changed: 0 })
  const { t } = useLang()
  // Swallowing this silently is what kept the empty Agents view alive in the VS
  // Code panel for two releases: the host answered not-implemented, the catch
  // ate it, and the list just rendered as "none running". Log instead — a
  // console line is the difference between a bug you can see and one you can't.
  const loadAgents = useCallback(() => {
    ;(window.gitAPI as any).listAgents?.()
      .then((r: { agents?: AgentEntry[] }) => setAgents(r?.agents ?? []))
      .catch((e: unknown) => console.warn('[sidebar] listAgents failed:', e))
  }, [])
  /**
   * What the model has written for this repository (#70).
   *
   * The desktop tab and the panel's rail view both read this: a changelog was
   * reachable only from the menu of the branch it belonged to, which meant
   * remembering it existed. Explanations come from the store the commit panel
   * already fills — they were being kept and never listed.
   */
  const [changelogs, setChangelogs] = useState<ChangelogEntry[]>([])
  const [explanations, setExplanations] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<NoteEntry[]>([])
  const loadMemory = useCallback(() => {
    ;(window.gitAPI as any).aiChangelogList?.()
      .then((r: { entries?: ChangelogEntry[] }) => setChangelogs(r?.entries ?? []))
      .catch((e: unknown) => console.warn('[sidebar] aiChangelogList failed:', e))
    ;(window.gitAPI as any).aiGetExplanations?.()
      .then((r: { explanations?: Record<string, string> }) => setExplanations(r?.explanations ?? {}))
      .catch((e: unknown) => console.warn('[sidebar] aiGetExplanations failed:', e))
    ;(window.gitAPI as any).aiNoteList?.()
      .then((r: { entries?: NoteEntry[] }) => setNotes(r?.entries ?? []))
      .catch((e: unknown) => console.warn('[sidebar] aiNoteList failed:', e))
  }, [])
  const loadWorktrees = useCallback(() => {
    window.gitAPI.listWorktrees().then(r => setWorktrees(r.worktrees ?? []))
    loadAgents()
  }, [loadAgents])
  useEffect(() => {
    if (!repoPath) return
    window.gitAPI.getReflog().then(r => setReflog(r.entries ?? []))
    window.gitAPI.getRemotes().then(r => setRemotes(r.remotes ?? []))
    window.gitAPI.getDefaultRemote?.().then(r => setDefaultRemote(r?.remote ?? null)).catch(() => {})
    window.gitAPI.getSubmodules().then(r => setSubmodules(r.submodules ?? []))
    window.gitAPI.getWorkingChanges?.()
      .then(w => setWork({ staged: w.staged.length, changed: w.unstaged.length + w.untracked.length }))
      .catch(() => {})
    loadWorktrees()
    loadMemory()
    // Light poll so agent badges stay current while the sidebar is open.
    const interval = setInterval(loadAgents, 10000)
    return () => clearInterval(interval)
  }, [repoPath, loadWorktrees, loadAgents, loadMemory])
  // On opening the stack, and whenever something new has been written into it.
  useEffect(() => { if (repoPath && (showAI || memoryToken)) loadMemory() },
    [showAI, repoPath, loadMemory, memoryToken])
  const agentsFor = useCallback((wtPath: string) =>
    agents.filter(a => a.cwd === wtPath || a.cwd.startsWith(wtPath + '/')),
  [agents])
  const handleAddWorktree = async () => {
    const dir = await window.gitAPI.selectDirectory(t('worktree.selectDir'))
    if (!dir.path) return
    const ref = await showPrompt(t('sb.wt.checkoutPrompt'), currentBranch)
    if (ref === null) return
    const r = await window.gitAPI.addWorktree(dir.path, ref || '')
    if (r.success) { showToast(t('toast.worktreeCreated', dir.path.split('/').pop() ?? '')); loadWorktrees() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }
  const handleRemoveWorktree = async (path: string) => {
    const ok = await showConfirm(t('sb.wt.removeConfirm', path), true)
    if (!ok) return
    let r = await window.gitAPI.removeWorktree(path)
    if (!r.success && r.error && /contains modified|untracked|use --force|locked/i.test(r.error)) {
      const force = await showConfirm(t('sb.wt.forceConfirm'), true)
      if (force) r = await window.gitAPI.removeWorktree(path, true)
    }
    if (r.success) { showToast(t('sb.wt.removed')); loadWorktrees() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }
  const handleInitSubmodule = async (path: string) => {
    const r = await window.gitAPI.initSubmodule(path)
    if (r.success) {
      showToast(t('sb.sub.initialized', path))
      const updated = await window.gitAPI.getSubmodules()
      setSubmodules(updated.submodules ?? [])
    } else {
      showToast(t('toast.err', r.error ?? ''), 'err')
    }
  }
  const handleUpdateSubmodule = async (path: string) => {
    const r = await window.gitAPI.updateSubmodule(path)
    if (r.success) {
      showToast(t('sb.sub.updated', path))
      const updated = await window.gitAPI.getSubmodules()
      setSubmodules(updated.submodules ?? [])
    } else {
      showToast(t('toast.err', r.error ?? ''), 'err')
    }
  }
  const handleSyncSubmodule = async (path: string) => {
    const r = await window.gitAPI.syncSubmodule(path)
    if (r.success) {
      showToast(t('sb.sub.synced', path))
      const updated = await window.gitAPI.getSubmodules()
      setSubmodules(updated.submodules ?? [])
    } else {
      showToast(t('toast.err', r.error ?? ''), 'err')
    }
  }
  /**
   * Emptying a submodule's working tree is asked before it is done.
   *
   * git refuses on its own when there is work to lose — no `--force` is sent —
   * but "nothing to lose" is its judgement, not the user's: the checkout may be
   * a long build they would rather not redo. So the question is asked, and its
   * refusal is shown rather than swallowed.
   */
  const handleDeinitSubmodule = async (path: string) => {
    if (!(await showConfirm(t('sb.sub.deinitConfirm', path)))) return
    const r = await window.gitAPI.deinitSubmodule(path)
    if (r.success) {
      showToast(t('sb.sub.deinited', path))
      const updated = await window.gitAPI.getSubmodules()
      setSubmodules(updated.submodules ?? [])
    } else {
      showToast(t('toast.err', r.error ?? ''), 'err')
    }
  }
  const handleAddRemote = async () => {
    const name = await showPrompt(t('sb.remote.namePrompt'))
    if (!name) return
    const url = await showPrompt(t('sb.remote.urlPrompt'))
    if (!url) return
    const r = await window.gitAPI.addRemote(name, url)
    if (r.success) {
      showToast(t('sb.remote.added', name))
      const updated = await window.gitAPI.getRemotes()
      setRemotes(updated.remotes ?? [])
    } else {
      showToast(t('toast.err', r.error ?? ''), 'err')
    }
  }
  const handleRemoveRemote = async (name: string) => {
    const ok = await showConfirm(t('sb.remote.removeConfirm', name), true)
    if (!ok) return
    const r = await window.gitAPI.removeRemote(name)
    if (r.success) {
      showToast(t('sb.remote.removed', name))
      const updated = await window.gitAPI.getRemotes()
      setRemotes(updated.remotes ?? [])
    } else {
      showToast(t('toast.err', r.error ?? ''), 'err')
    }
  }
  const handleRenameRemote = async (name: string) => {
    const newName = await showPrompt(t('sb.remote.renamePrompt', name), name)
    if (!newName || newName === name) return
    const r = await window.gitAPI.renameRemote(name, newName)
    if (r.success) {
      showToast(t('sb.remote.renamed', newName))
      const updated = await window.gitAPI.getRemotes()
      setRemotes(updated.remotes ?? [])
    } else {
      showToast(t('toast.err', r.error ?? ''), 'err')
    }
  }
  // The + on the stash section offers a scope rather than always taking
  // everything: stashing only the index (or only what isn't staged) is a
  // routine move git supports natively (v1.23.0).
  const [stashMenu, setStashMenu] = useState<{ x: number; y: number } | null>(null)
  // §2's search — a display lens like the staging filter: it narrows what is
  // already shown, it does not re-query. One per GitHub section.
  const [prsQuery, setPrsQuery] = useState('')
  const [issuesQuery, setIssuesQuery] = useState('')
  // §4's saved filters — per repository, and each one re-queries on its own.
  const [ghFilters, setGhFilters] = useState<GhFilterStore>({ prs: [], issues: [] })
  // null = closed; -1 = creating; n≥0 = editing that filter
  const [filterEditor, setFilterEditor] = useState<{ section: 'prs' | 'issues'; index: number } | null>(null)
  useEffect(() => { setGhFilters(loadGhFilters(repoName || 'repo')) }, [repoName])
  const mutateFilters = useCallback((section: 'prs' | 'issues', fn: (a: GhSavedFilter[]) => GhSavedFilter[]) => {
    setGhFilters(prev => {
      const next = { ...prev, [section]: fn(prev[section]) }
      saveGhFilters(repoName || 'repo', next)
      return next
    })
  }, [repoName])
  const stashScopeItems: MenuItemDef[] = [
    { label: t('sb.stash.scopeAll'), action: () => onCreateStash('all') },
    { label: t('sb.stash.scopeStaged'), action: () => onCreateStash('staged') },
    { label: t('sb.stash.scopeUnstaged'), action: () => onCreateStash('unstaged') },
  ]
  // git has no `stash rename`, so this re-stores the entry under a new label —
  // which moves it to the top of the stack. Say so rather than let the list
  // reorder itself unexplained (v1.23.0).
  const handleRenameStash = async (index: number, current: string) => {
    const label = current.replace(/^stash@\{\d+\}: /, '')
    const next = await showPrompt(t('sb.stash.renamePrompt'), label)
    if (!next || next === label) return
    const r = await window.gitAPI.renameStash(index, next)
    if (r.success) { showToast(t('sb.stash.renamed')); onRefreshStashes() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }
  // Pruning the remote is only half the cleanup: once its tracking refs go,
  // the local branches that pointed at them read as "gone" and are usually
  // dead too — so offer to sweep them in the same gesture rather than leaving
  // the user to hunt for them one by one (v1.23.0).
  const handlePruneRemote = async (name: string) => {
    const r = await window.gitAPI.pruneRemote(name)
    if (!r.success) { showToast(t('toast.err', r.error ?? ''), 'err'); return }

    const pruned = r.pruned ?? []
    showToast(pruned.length ? t('sb.remote.pruneOk', name, pruned.length) : t('sb.remote.pruneNone', name))
    onRefresh?.()

    const { branches: gone } = await window.gitAPI.getGoneBranches()
    if (gone.length === 0) return
    const ok = await showConfirm(t('sb.branch.pruneGoneConfirm', gone.length, gone.join(', ')), true)
    if (!ok) return
    const d = await window.gitAPI.pruneGoneBranches(gone)
    if (d.success) showToast(t('sb.branch.pruneGoneOk', d.deleted.length))
    else showToast(t('toast.err', d.error ?? ''), 'err')
    onRefresh?.()
  }
  const handleSetDefaultRemote = async (name: string) => {
    const r = await window.gitAPI.setDefaultRemote(name)
    if (!r.success) { showToast(t('toast.err', r.error ?? ''), 'err'); return }
    setDefaultRemote(name)
    showToast(t('sb.remote.defaultSet', name))
  }
  const handleFetchRemote = async (name: string) => {
    const r = await window.gitAPI.fetchRemote(name)
    if (r.success) showToast(t('sb.remote.fetchOk', name))
    else showToast(t('toast.fetchErr', r.error ?? ''), 'err')
  }
  const [branchFilter, setBranchFilter] = useState('')
  // Favorites float to the top of LOCAL — the whole point of starring a branch
  // is not to hunt for it in a long list (v1.21.0). Order is otherwise
  // untouched, so unstarred branches keep the ordering git gave us.
  const localBranches = branches
    .filter(b => !b.remote)
    .filter(b => !branchFilter || b.name.toLowerCase().includes(branchFilter.toLowerCase()))
    .sort((a, b) => Number(isFavorite?.(b.name) ?? false) - Number(isFavorite?.(a.name) ?? false))
  // ── What each section hides from the graph ────────────────────
  // A row is hidden in its own right or because its family is; the count on a
  // section header has to say both, or "Hide all tags" would leave every tag
  // looking visible.
  // `getBranches` names a remote branch `remotes/origin/x`, which is the one
  // decoration form isRefHidden reads without being told the remotes — so the
  // rule that decides a chip decides a row, rather than a second copy of it.
  const branchHidden = (b: BranchInfo) => isRefHidden(b.name, visibility)
  const tagHidden = (name: string) => visibility.families.has('tags') || visibility.tags.has(name)
  const remoteHidden = (name: string) => visibility.families.has('remotes') || visibility.remotes.has(name)
  const stashesHidden = visibility.families.has('stashes')
  const familyMenu = (family: RefFamily): MenuItemDef[] | undefined => onSetFamilyHidden && [
    {
      label: t('sb.hidden.hideAll'),
      action: () => onSetFamilyHidden(family, true),
      checked: visibility.families.has(family),
    },
    { label: t('sb.hidden.showAll'), action: () => onSetFamilyHidden(family, false) },
  ]
  // Which folders are open, per repository. Everything starts open: a tree
  // that reopens collapsed on every launch is slower than the flat list it
  // replaced. Only what the user closed is remembered.
  const foldersKey = `gv:branch-folders:${repoName || repoPath || ''}`
  const [closedFolders, setClosedFolders] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(foldersKey) || '[]')) } catch { return new Set() }
  })
  useEffect(() => {
    try { return void localStorage.setItem(foldersKey, JSON.stringify([...closedFolders])) } catch { /* private mode */ }
  }, [foldersKey, closedFolders])
  const toggleFolder = useCallback((path: string) => {
    setClosedFolders(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path); else next.add(path)
      return next
    })
  }, [])
  /** Open = everything the user has not closed. */
  const openFolders = (nodes: BranchNode<any>[]) =>
    new Set(folderPaths(nodes).filter(p => !closedFolders.has(p)))
  // A filter FLATTENS the tree for as long as it is non-empty. A tree that
  // stays folded while you type reads as an empty section, and expanding every
  // ancestor of every match is the same list with indentation in front of it.
  const filtering = !!branchFilter
  /** The panel the filter drawer measures itself against (#145). */
  const rootRef = useRef<HTMLDivElement | null>(null)
  /**
   * A half-written query survives closing the drawer, per section. Escape and
   * a click outside close it, and losing what was typed there would make both
   * of those hostile — so the draft is kept and restored, and only Cancel or a
   * successful create clears it.
   */
  const [filterDraft, setFilterDraft] = useState<{ prs?: GhSavedFilter; issues?: GhSavedFilter }>({})
  const showAll = (family: RefFamily) => onSetFamilyHidden && (() => onSetFamilyHidden(family, false))
  /**
   * LOCAL's menu is the family rows plus the graph's scope, ruled off from
   * them. The two are not the same kind of setting and must not read as three
   * versions of one: hiding takes refs away from `--all`, this decides whether
   * there is an `--all` at all. With it off, the hide rows above have nothing
   * to act on — the log is already one branch (git-service.ts, `options.all`).
   */
  const localMenu = (): MenuItemDef[] | undefined => {
    const family = familyMenu('branches')
    if (!onToggleAllBranches) return family
    const scope: MenuItemDef[] = [
      { separator: true },
      {
        label: t('sb.graph.allBranches'),
        action: onToggleAllBranches,
        checked: !!showAllBranches,
      },
    ]
    return [...(family ?? []), ...scope]
  }
  const remoteBranches = branches
    .filter(b => b.remote)
    .filter(b => !branchFilter || b.name.toLowerCase().includes(branchFilter.toLowerCase()))

  return {
    repoPath, repoName, currentBranch, branches, recentRepos, stashes, tags, wipCount, wipSelected, onViewWip, onOpenRepo, onClone, onSetRepo, onRemoveRecent, onCheckout, onCreateBranch, onDeleteBranch, onMergeBranch, onRenameBranch, onRebaseOnto, onPushBranch, onDeleteRemoteBranch, onSetUpstream, onCreateStash, onApplyStash, onPopStash, onDropStash, onPreviewStash, onExplainStash, onRefreshStashes, onExplainBranch, onBranchChangelog, onOpenChangelog, onOpenExplanation, onOpenNote, onShowCommits, subjectFor, tab, onTab, memoryToken, onCreateTag, onDeleteTag, onCheckoutTag, onGoTo, onPushTag, onDeleteRemoteTag, onSelectCommit, onCompareBranch, soloBranch, visibility, onToggleSolo, onToggleHide, onToggleHideTag, onToggleHideRemote, onSetFamilyHidden, onPull, githubPRs, githubIssues, onOpenGithubItem, onStartBranchFromIssue, onShowGithubDetail, githubDetailOpen, githubLogin, githubRepo, isFavorite, issueFor, onToggleFavorite, onOpenBranchOnRemote, onAssociateIssue, prIntentFor, onCreatePR, showAllBranches, onToggleAllBranches, onRefreshGithub, onStartPR, onNewIssue, githubRefreshing, githubRefreshTick, githubPollTick, onCopyBranchLink, onDeleteBranchBoth, showToast, showPrompt, showConfirm, onRefresh, view, single, activeTab, showAI, show, reflog, setReflog, remotes, setRemotes, defaultRemote, setDefaultRemote, submodules, setSubmodules, worktrees, setWorktrees, agents, setAgents, work, setWork, t, loadAgents, changelogs, setChangelogs, explanations, setExplanations, notes, setNotes, loadMemory, loadWorktrees, agentsFor, handleAddWorktree, handleRemoveWorktree, handleInitSubmodule, handleUpdateSubmodule, handleSyncSubmodule, handleDeinitSubmodule, handleAddRemote, handleRemoveRemote, handleRenameRemote, stashMenu, setStashMenu, prsQuery, setPrsQuery, issuesQuery, setIssuesQuery, ghFilters, setGhFilters, filterEditor, setFilterEditor, mutateFilters, stashScopeItems, handleRenameStash, handlePruneRemote, handleSetDefaultRemote, handleFetchRemote, branchFilter, setBranchFilter, localBranches, branchHidden, tagHidden, remoteHidden, stashesHidden, familyMenu, foldersKey, closedFolders, setClosedFolders, toggleFolder, openFolders, filtering, rootRef, filterDraft, setFilterDraft, showAll, localMenu, remoteBranches,
  }
}

/** Everything a section may read or call, typed by inference. */
export type SidebarState = ReturnType<typeof useSidebar>
