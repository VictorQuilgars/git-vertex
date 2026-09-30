// The sidebar's state — what it loads for each list, what it remembers, and every handler
// its rows call — as one hook. The panel renders it; a section reads its slice.
import { useState, useRef, useEffect, useCallback } from 'react'
import { BranchInfo } from '../../types'
import { MenuItemDef } from '../ContextMenu/ContextMenu'
import { loadGhFilters, saveGhFilters, type GhSavedFilter, type GhFilterStore } from './ghFilters'
import { folderPaths, type BranchNode } from './branchTree'
import { resolveTagCommit } from './tagMenu'
import { readLayout, writeLayout, hasPaths, matchesFilter, type SbLayout, type SbLayoutView } from './sidebarLayout'
import { usePullRequestCode } from '../../hooks/usePullRequestCode'
import { useChangeUpstream } from '../../hooks/useChangeUpstream'
import { isRefHidden, type RefFamily } from '../../utils/graphVisibility'
import { useLang } from '../../i18n/LanguageContext'
import { sidebarCounts } from './sidebarCounts'
import { plainError } from '../../utils/errorText'
import { type SidebarView, type ReflogEntry, type Contributor, type ChangelogEntry, type NoteEntry, type RemoteEntry, type SubmoduleEntry, type WorktreeEntry, type AgentEntry, type SidebarProps } from './types'

/** The lists the side bar loads for itself — each one can fail on its own (#277). */
export type SbList = 'reflog' | 'contributors' | 'remotes' | 'submodules' | 'worktrees' | 'agents'
  | 'changelogs' | 'explanations' | 'notes'

export function useSidebar(props: SidebarProps) {
  const {
  repoPath, repoName, currentBranch, branches, recentRepos, stashes, tags,
  wipCount, wipSelected, onViewWip,
  onOpenRepo, onClone, onSetRepo,
  onCheckout, onCreateBranch, onDeleteBranch, onMergeBranch, onRenameBranch,
  onRebaseOnto, onPushBranch, onDeleteRemoteBranch, onSetUpstream,
  onCreateStash, onApplyStash, onPopStash, onDropStash, onPreviewStash, onExplainStash, onRefreshStashes,
  onCompareRef, onSelectStashForCompare,
  onExplainBranch, onBranchChangelog, onRecomposeBranch, onOpenChangelog, onOpenExplanation, onOpenNote,
  onShowCommits,
  subjectFor, tab = 'list', onTab, memoryToken,
  onCreateTag, onDeleteTag, onCheckoutTag, onGoTo, onPushTag, onDeleteRemoteTag,
  onSelectCommit, onCompareBranch, onReveal, onOpenCard,
  onRebaseOntoUpstream, onCompareUpstream, tipActions,
  soloBranch, visibility, onToggleSolo, onToggleHide,
  onToggleHideTag, onToggleHideRemote, onSetFamilyHidden,
  onPull,
  githubPRs, githubIssues, onOpenGithubItem, onComparePullRequest, onStartBranchFromIssue, onShowGithubDetail, githubDetailOpen, githubLogin, githubRepo,
  isFavorite, issueFor, onToggleFavorite,
  onOpenBranchOnRemote, onAssociateIssue, prIntentFor, onCreatePR,
  showAllBranches, onToggleAllBranches,
  onRefreshGithub, onStartPR, onNewIssue, githubRefreshing, githubRefreshTick, githubPollTick,
  onCopyBranchLink, onDeleteBranchBoth,
  showToast, showPrompt, showConfirm, onRefresh, view,
  onFilterAuthor, authorFilter,
  home, mergeTarget, launchpad,
  githubErrors, onOpenSettings,
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
  const [contributors, setContributors] = useState<Contributor[]>([])
  const [remotes, setRemotes] = useState<RemoteEntry[]>([])
  // Which remote push/pull target by default — resolved by the service, so it
  // reflects the explicit choice or the origin/first-remote fallback.
  const [defaultRemote, setDefaultRemote] = useState<string | null>(null)
  // Whether someone CHOSE it — the only case with a choice to take back
  // (#289). `origin` winning by default is not one, and offering to unset it
  // would do nothing.
  const [defaultRemoteExplicit, setDefaultRemoteExplicit] = useState(false)
  const loadDefaultRemote = useCallback(() => {
    window.gitAPI.getDefaultRemote?.()
      .then(r => { setDefaultRemote(r?.remote ?? null); setDefaultRemoteExplicit(!!r?.explicit) })
      .catch(() => {})
  }, [])
  // The remotes whose branches are listed under them (#289). Closed by
  // default: opening one is an act, and a list of remotes is read first.
  const [expandedRemotes, setExpandedRemotes] = useState<Set<string>>(() => new Set())
  const toggleRemoteExpanded = useCallback((name: string) => {
    setExpandedRemotes(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }, [])
  const [submodules, setSubmodules] = useState<SubmoduleEntry[]>([])
  const [worktrees, setWorktrees] = useState<WorktreeEntry[]>([])
  // Running AI agents (Claude Code, aider…) keyed by their cwd — matched
  // against worktree paths to badge "an agent is working here".
  const [agents, setAgents] = useState<AgentEntry[]>([])
  // Working-tree summary for the overview "current work" card.
  const [work, setWork] = useState<{ staged: number; changed: number }>({ staged: 0, changed: 0 })
  const { t } = useLang()
  /**
   * What each list the side bar reads for itself last failed on (#277).
   *
   * A refused read used to leave its list empty, and an empty list says "there
   * are none": the Agents view read "none running" for two releases while the
   * panel's host answered not-implemented. Now the error takes the list's
   * place, quoted, with Try again. Both ways a host can refuse are caught — a
   * rejected call, and an answer that carries `error` (not-implemented is one).
   */
  const [loadErrors, setLoadErrors] = useState<Partial<Record<SbList, string>>>({})
  const settle = useCallback(<R,>(list: SbList, call: () => Promise<R> | undefined, apply: (r: R) => void) => {
    const fail = (e: unknown) => {
      console.warn(`[sidebar] ${list} failed:`, e)
      // What the person reads: the desktop's IPC wraps a thrown error in the channel's
      // name, which the panel's host never does — so the two say the same thing.
      setLoadErrors(prev => ({ ...prev, [list]: plainError(e) }))
    }
    let p: Promise<R> | undefined
    // A host that does not offer the call at all (`?.` below) has no list to
    // fail on; one whose call throws before it returns a promise has.
    try { p = call() } catch (e) { fail(e); return }
    if (!p) return
    p.then(r => {
      const err = (r as { error?: unknown } | null | undefined)?.error
      if (err) { fail(err); return }
      setLoadErrors(prev => {
        if (!(list in prev)) return prev
        const next = { ...prev }; delete next[list]; return next
      })
      apply(r)
    }, fail)
  }, [])
  const loadAgents = useCallback(() => {
    settle('agents', () => (window.gitAPI as any).listAgents?.(),
      (r: { agents?: AgentEntry[] }) => setAgents(r?.agents ?? []))
  }, [settle])
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
    settle('changelogs', () => (window.gitAPI as any).aiChangelogList?.(),
      (r: { entries?: ChangelogEntry[] }) => setChangelogs(r?.entries ?? []))
    settle('explanations', () => (window.gitAPI as any).aiGetExplanations?.(),
      (r: { explanations?: Record<string, string> }) => setExplanations(r?.explanations ?? {}))
    settle('notes', () => (window.gitAPI as any).aiNoteList?.(),
      (r: { entries?: NoteEntry[] }) => setNotes(r?.entries ?? []))
  }, [settle])
  const loadWorktrees = useCallback(() => {
    // `facts` is two more git calls per worktree — the dirty flag and the
    // tracking counts a row shows (#285). A repository has a handful of
    // worktrees, not a page of them, so it is asked for every time.
    settle('worktrees', () => window.gitAPI.listWorktrees({ facts: true }), r => setWorktrees(r.worktrees ?? []))
    loadAgents()
  }, [loadAgents, settle])
  const loadReflog = useCallback(() =>
    settle('reflog', () => window.gitAPI.getReflog(), r => setReflog(r.entries ?? [])), [settle])
  // Only when the host can filter by author: a list nothing acts on is a list.
  const canFilterAuthor = !!onFilterAuthor
  const loadContributors = useCallback(() => {
    if (canFilterAuthor) settle('contributors', () => window.gitAPI.getContributors?.(20), r => setContributors(r?.contributors ?? []))
  }, [settle, canFilterAuthor])
  const loadRemotes = useCallback(() =>
    settle('remotes', () => window.gitAPI.getRemotes(), r => setRemotes(r.remotes ?? [])), [settle])
  const loadSubmodules = useCallback(() =>
    settle('submodules', () => window.gitAPI.getSubmodules(), r => setSubmodules(r.submodules ?? [])), [settle])
  useEffect(() => {
    if (!repoPath) return
    loadReflog()
    loadContributors()
    loadRemotes()
    loadDefaultRemote()
    loadSubmodules()
    window.gitAPI.getWorkingChanges?.()
      .then(w => setWork({ staged: w.staged.length, changed: w.unstaged.length + w.untracked.length }))
      .catch(() => {})
    loadWorktrees()
    loadMemory()
    // Light poll so agent badges stay current while the sidebar is open.
    const interval = setInterval(loadAgents, 10000)
    return () => clearInterval(interval)
  }, [repoPath, loadWorktrees, loadAgents, loadMemory, loadReflog, loadContributors, loadRemotes, loadSubmodules, loadDefaultRemote])
  /** Try again, for one list — the button a failed load shows in its place. */
  const retryLoad = useCallback((list: SbList) => {
    ;({
      reflog: loadReflog, contributors: loadContributors, remotes: loadRemotes,
      submodules: loadSubmodules, worktrees: loadWorktrees, agents: loadAgents,
      changelogs: loadMemory, explanations: loadMemory, notes: loadMemory,
    } satisfies Record<SbList, () => void>)[list]()
  }, [loadReflog, loadContributors, loadRemotes, loadSubmodules, loadWorktrees, loadAgents, loadMemory])
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
  /**
   * The worktree a branch is checked out in, when it is not the one on screen
   * (#285) — git refuses to switch to a branch another worktree holds, and
   * the row used to offer exactly that.
   */
  const worktreeOf = (branch: string) => {
    const held = worktrees.find(w => w.branch === branch && w.path !== repoPath)
    return held ? { path: held.path, name: held.path.split('/').pop() || held.path } : undefined
  }
  /** A worktree for this branch, named after it — no name to type (#285). */
  const handleCreateWorktreeFor = async (branch: string) => {
    const dir = await window.gitAPI.selectDirectory(t('worktree.selectDir'))
    if (!dir.path) return
    const r = await window.gitAPI.addWorktree(dir.path, branch)
    if (r.success) { showToast(t('toast.worktreeCreated', dir.path.split('/').pop() ?? '')); loadWorktrees() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }
  // The four acts on a request's code live in one hook, because the sheet
  // that also offers them is mounted by the host, outside this panel (#290).
  const handlePullRequestCode = usePullRequestCode({
    t, showToast, defaultRemote, onCompare: onComparePullRequest,
    onSwitched: () => onRefresh?.(), onWorktreeAdded: loadWorktrees,
  })
  /** A terminal, and the file manager, at a worktree rather than at the repo (#285). */
  const handleWorktreeTerminal = async (path: string) => {
    const r = await (window.gitAPI as any).openTerminal?.(path)
    if (r && r.success === false) showToast(t('toast.err', r.error ?? ''), 'err')
  }
  const handleWorktreeReveal = async (path: string) => {
    const r = await (window.gitAPI as any).revealInFileManager?.(path)
    if (r && r.success === false) showToast(t('toast.err', r.error ?? ''), 'err')
  }
  const handleToggleWorktreeLock = async (wt: WorktreeEntry) => {
    const r = wt.locked
      ? await window.gitAPI.unlockWorktree(wt.path)
      : await window.gitAPI.lockWorktree(wt.path, (await showPrompt(t('sb.wt.lockReasonPrompt'), '')) ?? undefined)
    if (r.success) { showToast(wt.locked ? t('sb.wt.unlocked') : t('sb.wt.locked')); loadWorktrees() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }
  /**
   * Carry what is uncommitted here into another worktree (#285).
   *
   * A stash is what git gives for this: it is taken here, applied there, and
   * left in the list either way — applying can conflict, and dropping the one
   * copy of the work before knowing it landed is not a risk to take on the
   * user's behalf.
   */
  const handleCopyChangesTo = async (from: WorktreeEntry) => {
    const others = worktrees.filter(w => w.path !== from.path && !w.prunable)
    if (!others.length) { showToast(t('sb.wt.copyNoTarget'), 'err'); return }
    const target = await showPrompt(
      `${t('sb.wt.copyPrompt')}\n\n${others.map(w => w.path).join('\n')}`, others[0].path)
    if (!target) return
    const to = others.find(w => w.path === target.trim())
    if (!to) { showToast(t('sb.wt.copyNoSuchTarget', target.trim()), 'err'); return }
    const r = await window.gitAPI.copyWorktreeChanges(from.path, to.path, t('sb.wt.copyStashLabel', to.path))
    if (r.success) showToast(t('sb.wt.copied', to.path.split('/').pop() ?? to.path))
    // The stash is kept whatever happens — the refusal says where the work is.
    else showToast(r.leftInStash ? t('sb.wt.copyLeftInStash', r.error ?? '') : t('toast.err', r.error ?? ''), 'err')
    loadWorktrees()
    onRefreshStashes()
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
      loadSubmodules()
    } else {
      showToast(t('toast.err', r.error ?? ''), 'err')
    }
  }
  const handleUpdateSubmodule = async (path: string) => {
    const r = await window.gitAPI.updateSubmodule(path)
    if (r.success) {
      showToast(t('sb.sub.updated', path))
      loadSubmodules()
    } else {
      showToast(t('toast.err', r.error ?? ''), 'err')
    }
  }
  const handleSyncSubmodule = async (path: string) => {
    const r = await window.gitAPI.syncSubmodule(path)
    if (r.success) {
      showToast(t('sb.sub.synced', path))
      loadSubmodules()
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
      loadSubmodules()
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
      loadRemotes()
      // The host re-reads the remotes too: a first remote on GitHub is what
      // turns an empty pull request view into a list (#292).
      onRefresh?.()
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
      loadRemotes()
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
      loadRemotes()
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
  /**
   * Bring a branch you are not standing on up to its upstream (#280).
   *
   * The refusal is git-core's sentence — diverged, tracks nothing, ahead with
   * nothing to pull — and it is shown as it came: "could not pull" tells
   * nobody what to do next, and each of those three calls for something
   * different.
   */
  const handlePullBranchRow = async (name: string) => {
    const r = await window.gitAPI.pullBranch(name)
    if (!r.success) { showToast(t('toast.err', r.error ?? ''), 'err'); return }
    showToast(r.upToDate ? t('sb.branch.pullUpToDate', name) : t('sb.branch.pulledNamed', name, r.moved ?? 0))
    onRefresh?.()
  }
  const changeUpstream = useChangeUpstream({ t, showToast, showPrompt, onDone: onRefresh })

  /**
   * Point a branch at any remote branch (#280) — `Set Upstream` always set
   * `<default remote>/<same name>`, which is the only upstream it could ever
   * give you. The remote branches are listed in the prompt rather than left
   * to be typed from memory.
   */
  const handleChangeUpstreamRow = (name: string) =>
    changeUpstream(name, branches.find(b => b.name === name)?.upstream ?? '')
  /** Fold the `fixup!` / `squash!` commits in (#280) — it refuses when there are none. */
  const handleSquashFixupsRow = async (base: string) => {
    const r = await window.gitAPI.squashFixups(base)
    if (r.success) { showToast(t('sb.branch.squashedFixups', r.squashed ?? 0)); onRefresh?.() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }
  /**
   * A stash's sha and its patch, for EVERY stash (#287).
   *
   * Only `stash@{0}` ever had a graph row, so the rest could not be copied at
   * all — and the ref is what makes the difference: `stash@{3}` resolves like
   * any other revision, and its diff is the one the preview already reads.
   */
  /**
   * The commit a tag stands for, asked when its row's menu opens (#288) —
   * through the two calls both products already answer, so the panel needs
   * nothing new from its host.
   */
  const resolveTag = (name: string) => resolveTagCommit(window.gitAPI, name)
  const handleCopyStashSha = async (index: number) => {
    const { hash } = await window.gitAPI.resolveCommit(`stash@{${index}}`)
    if (!hash) { showToast(t('sb.stash.noSuchStash', index), 'err'); return }
    await navigator.clipboard.writeText(hash)
    showToast(t('sb.stash.shaCopied'))
  }
  const handleCopyStashPatch = async (index: number) => {
    const r = await window.gitAPI.stashDiff(index)
    if (!r.diff) { showToast(t('toast.err', r.error ?? ''), 'err'); return }
    await navigator.clipboard.writeText(r.diff)
    showToast(t('sb.stash.patchCopied'))
  }
  const handleSetDefaultRemote = async (name: string) => {
    const r = await window.gitAPI.setDefaultRemote(name)
    if (!r.success) { showToast(t('toast.err', r.error ?? ''), 'err'); return }
    setDefaultRemote(name)
    setDefaultRemoteExplicit(true)
    showToast(t('sb.remote.defaultSet', name))
  }
  /**
   * Take the choice back (#289). The badge then moves to whatever the service
   * falls back to — origin, or the first remote — so it is asked again rather
   * than guessed here.
   */
  const handleUnsetDefaultRemote = async (name: string) => {
    const r = await window.gitAPI.unsetDefaultRemote()
    if (!r.success) { showToast(t('toast.err', r.error ?? ''), 'err'); return }
    loadDefaultRemote()
    showToast(t('sb.remote.defaultUnset', name))
  }
  const handleFetchRemote = async (name: string) => {
    const r = await window.gitAPI.fetchRemote(name)
    if (r.success) showToast(t('sb.remote.fetchOk', name))
    else showToast(t('toast.fetchErr', r.error ?? ''), 'err')
  }
  /**
   * ONE filter field, and every list it can see answers it (#276).
   *
   * It was the branches' own, and TAGS, STASH, REMOTES and WORKTREES had
   * none — a long list of tags was read by scrolling it. In the panel the
   * rail has already chosen a view, so the field narrows that view and says
   * which in its placeholder; on the desktop every section is on screen at
   * once, so it narrows all of them, which is the same promise.
   */
  const [branchFilter, setBranchFilter] = useState('')
  const keep = (text: string) => matchesFilter(text, branchFilter)
  // Favorites float to the top of LOCAL — the whole point of starring a branch
  // is not to hunt for it in a long list (v1.21.0). Order is otherwise
  // untouched, so unstarred branches keep the ordering git gave us.
  const localBranches = branches
    .filter(b => !b.remote)
    .filter(b => keep(b.name))
    .sort((a, b) => Number(isFavorite?.(b.name) ?? false) - Number(isFavorite?.(a.name) ?? false))
  const filteredTags = tags.filter(tg => keep(tg.name))
  // A stash is found by what it says, not by `stash@{2}`.
  const filteredStashes = stashes.filter(st => keep(st.message))
  const filteredRemotes = remotes.filter(r => keep(r.name) || keep(r.fetchUrl))
  // Either end of a worktree row: the folder it is in, or the branch it holds.
  const filteredWorktrees = worktrees.filter(wt => keep(wt.path) || keep(wt.branch ?? ''))
  /**
   * What each header counts — the rule the panel's rail counts with too
   * (#277), over the lists as the field lets them through.
   */
  const counts = sidebarCounts({
    branches: localBranches, stashes: filteredStashes, tags: filteredTags,
    remotes: filteredRemotes, worktrees: filteredWorktrees, prs: githubPRs, issues: githubIssues,
  })
  /**
   * List or tree, per view, kept on this machine. Held here rather than read
   * in each section so a re-render of one does not lose the other's choice.
   */
  const [layouts, setLayouts] = useState<Record<SbLayoutView, SbLayout>>(() => ({
    local: readLayout('local'), remote: readLayout('remote'), tags: readLayout('tags'),
  }))
  const toggleLayout = useCallback((view: SbLayoutView) => {
    setLayouts(prev => {
      const next: SbLayout = prev[view] === 'tree' ? 'list' : 'tree'
      writeLayout(view, next)
      return { ...prev, [view]: next }
    })
  }, [])
  /**
   * What a section draws as. A filter FLATTENS whatever the choice was — a
   * tree that stays folded while you type reads as an empty section — and a
   * list with no slash in it is a list whatever the setting says.
   */
  const layoutFor = (view: SbLayoutView, names: readonly string[]): SbLayout =>
    branchFilter || !hasPaths(names) ? 'list' : layouts[view]
  const layoutToggle = (view: SbLayoutView, names: readonly string[]) =>
    hasPaths(names) ? { mode: layouts[view], onToggle: () => toggleLayout(view) } : undefined
  /**
   * Which list the field is filtering, and what it therefore says. The two
   * GitHub views have searches of their own — a second field above them would
   * be two boxes over one list — and the AI stack is not a list of refs, so
   * neither shows it.
   */
  const FILTERED = {
    branches: 'sb.filterBranches', tags: 'sb.filter.tags', stash: 'sb.filter.stashes',
    remotes: 'sb.filter.remotes', worktrees: 'sb.filter.worktrees',
  } as const
  const filtered = (v: SidebarView | undefined): v is keyof typeof FILTERED =>
    !!v && v in FILTERED
  const filterView: SidebarView | 'all' | null = single
    ? (filtered(view) ? view : null)
    : (showAI ? null : 'all')
  const filterPlaceholder = filterView === 'all'
    ? t('sb.filter.any')
    : filtered(filterView as SidebarView | undefined) ? t(FILTERED[filterView as keyof typeof FILTERED]) : ''
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
    .filter(b => keep(b.name))

  return {
    repoPath, repoName, currentBranch, branches, recentRepos, stashes, tags, wipCount, wipSelected, onViewWip, onOpenRepo, onClone, onSetRepo, onCheckout, onCreateBranch, onDeleteBranch, onMergeBranch, onRenameBranch, onRebaseOnto, onPushBranch, onDeleteRemoteBranch, onSetUpstream, onCreateStash, onApplyStash, onPopStash, onDropStash, onPreviewStash, onExplainStash, onRefreshStashes, onExplainBranch, onBranchChangelog, onRecomposeBranch, onOpenChangelog, onOpenExplanation, onOpenNote, onShowCommits, subjectFor, tab, onTab, memoryToken, onCreateTag, onDeleteTag, onCheckoutTag, onGoTo, onPushTag, onDeleteRemoteTag, onSelectCommit, onCompareBranch, soloBranch, visibility, onToggleSolo, onToggleHide, onToggleHideTag, onToggleHideRemote, onSetFamilyHidden, onPull, githubPRs, githubIssues, onOpenGithubItem, onComparePullRequest, onStartBranchFromIssue, onShowGithubDetail, githubDetailOpen, githubLogin, githubRepo, isFavorite, issueFor, onToggleFavorite, onOpenBranchOnRemote, onAssociateIssue, prIntentFor, onCreatePR, showAllBranches, onToggleAllBranches, onRefreshGithub, onStartPR, onNewIssue, githubRefreshing, githubRefreshTick, githubPollTick, onCopyBranchLink, onDeleteBranchBoth, showToast, showPrompt, showConfirm, onRefresh, view, single, activeTab, showAI, show, reflog, setReflog, contributors, onFilterAuthor, authorFilter, home, mergeTarget, launchpad, remotes, setRemotes, defaultRemote, setDefaultRemote, submodules, setSubmodules, worktrees, setWorktrees, agents, setAgents, work, setWork, t, loadAgents, changelogs, setChangelogs, explanations, setExplanations, notes, setNotes, loadMemory, loadWorktrees, agentsFor, handleAddWorktree, handleRemoveWorktree, handleInitSubmodule, handleUpdateSubmodule, handleSyncSubmodule, handleDeinitSubmodule, handleAddRemote, handleRemoveRemote, handleRenameRemote, stashMenu, setStashMenu, prsQuery, setPrsQuery, issuesQuery, setIssuesQuery, ghFilters, setGhFilters, filterEditor, setFilterEditor, mutateFilters, stashScopeItems, handleRenameStash, handlePruneRemote, handleSetDefaultRemote, handleFetchRemote, branchFilter, setBranchFilter, localBranches, branchHidden, tagHidden, remoteHidden, stashesHidden, familyMenu, foldersKey, closedFolders, setClosedFolders, toggleFolder, openFolders, filtering, rootRef, filterDraft, setFilterDraft, showAll, localMenu, remoteBranches, onReveal, onOpenCard, onRebaseOntoUpstream, onCompareUpstream, tipActions, handlePullBranchRow, handleChangeUpstreamRow, handleSquashFixupsRow, handleWorktreeTerminal, handleWorktreeReveal, handleToggleWorktreeLock, handleCopyChangesTo, worktreeOf, handleCreateWorktreeFor, handlePullRequestCode, onCompareRef, resolveTag, onSelectStashForCompare, handleCopyStashSha, handleCopyStashPatch, filteredTags, filteredStashes, filteredRemotes, filteredWorktrees, layouts, toggleLayout, layoutFor, layoutToggle, filterView, filterPlaceholder,
    counts, loadErrors, retryLoad, githubErrors, onOpenSettings,
    defaultRemoteExplicit, handleUnsetDefaultRemote, expandedRemotes, toggleRemoteExpanded,
  }
}

/** Everything a section may read or call, typed by inference. */
export type SidebarState = ReturnType<typeof useSidebar>
