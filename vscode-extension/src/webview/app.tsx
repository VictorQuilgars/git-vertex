// app.tsx — Git Vertex webview React entry.
// Reuses the REAL desktop components (CommitGraph + RightPanel) so the VS Code
// panel is visually identical to the desktop app. The `gitApiShim` import must
// come first: it installs window.gitAPI before any component mounts.
import './gitApiShim'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import ReactDOM from 'react-dom/client'

import { SettingsProvider } from '../../../src/renderer/src/contexts/SettingsContext'
import { LanguageProvider, useLang } from '../../../src/renderer/src/i18n/LanguageContext'
import { ToastProvider, useToast } from '../../../src/renderer/src/components/Toast/Toast'
import CompactToolbar from './CompactToolbar'
import SettingsModal from '../../../src/renderer/src/components/SettingsModal/SettingsModal'
import CommitGraph from '../../../src/renderer/src/components/CommitGraph/CommitGraph'
import RightPanel from '../../../src/renderer/src/components/RightPanel/RightPanel'
import type { ConflictKind } from '../../../src/renderer/src/types'
import Sidebar, { SidebarView } from '../../../src/renderer/src/components/Sidebar/Sidebar'
import ActivityRail from './ActivityRail'
import InteractiveRebase from '../../../src/renderer/src/components/InteractiveRebase/InteractiveRebase'
import StagingEditor from '../../../src/renderer/src/components/StagingEditor/StagingEditor'
import RebaseProgress from '../../../src/renderer/src/components/RebaseProgress/RebaseProgress'
import RebaseTodoApp from './RebaseTodoApp'
import ConflictResolver from '../../../src/renderer/src/components/ConflictResolver/ConflictResolver'
import FileHistory from '../../../src/renderer/src/components/FileHistory/FileHistory'
import CompareView from '../../../src/renderer/src/components/CompareView/CompareView'
import CompareWorkingView from './CompareWorkingView'
import GitHubPanel from '../../../src/renderer/src/components/GitHubPanel/GitHubPanel'
import AssociateIssueModal from '../../../src/renderer/src/components/IssueLink/AssociateIssueModal'
import PRModal from '../../../src/renderer/src/components/PRModal/PRModal'
import { prIntentFor as computePRIntent, type PRIntent } from '../../../src/renderer/src/components/ContextMenu/prIntent'
import { repoFromRemotes, remoteUrl, type RemoteRepo } from '../../../src/renderer/src/utils/remoteUrl'
import { useBranchMeta, type LinkedIssue } from '../../../src/renderer/src/hooks/useBranchMeta'
import CommitMsgEditorView from './CommitMsgEditorView'
import WhatsNew from '../../../src/renderer/src/components/WhatsNew/WhatsNew'
import type { CommitNode, BranchInfo } from '../../../src/renderer/src/types'

import 'highlight.js/styles/github-dark.css'
import '../../../src/renderer/src/App.css'
import './vertex-vscode.css'

declare global { interface Window { gitAPI: any; appInfo: any } }

const RAIL_VIEWS: SidebarView[] = ['overview', 'agents', 'worktrees', 'branches', 'remotes', 'stash', 'tags']

function VertexApp() {
  const { t } = useLang();
  const toast = useToast()
  const showToast = useCallback((msg: string, type?: 'ok' | 'err') => {
    if (type === 'err') toast.error(msg); else toast.success(msg)
  }, [toast])

  const [commits, setCommits] = useState<CommitNode[]>([])
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [currentBranch, setCurrentBranch] = useState('')
  const [compareBaseHash, setCompareBaseHash] = useState<string | null>(null)
  const [repoName, setRepoName] = useState('')
  const [selectedCommit, setSelectedCommit] = useState<CommitNode | null>(null)
  const [wipCount, setWipCount] = useState(0)
  const [conflictFiles, setConflictFiles] = useState<string[]>([])
  // path → unmerged state, so the panel can tell a modify/delete from a content
  // conflict here exactly as it does on the desktop.
  const [conflictKinds, setConflictKinds] = useState<Record<string, ConflictKind>>({})
  const [conflictMode, setConflictMode] = useState<'merge' | 'rebase' | 'cherry-pick' | 'revert' | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMatches, setSearchMatches] = useState(-1)
  const [rightW, setRightW] = useState(380)
  const [showAllBranches, setShowAllBranches] = useState(true)
  const [stashCount, setStashCount] = useState(0)
  const [stashes, setStashes] = useState<{ index: number; message: string }[]>([])
  const [tags, setTags] = useState<{ name: string; hash: string }[]>([])
  const [soloBranch, setSoloBranch] = useState<string | null>(null)
  const [hiddenBranches, setHiddenBranches] = useState<Set<string>>(new Set())
  // Favorites / graph pins / linked issues (v1.21.0). The panel is always the
  // workspace repo, so the repo name is a stable enough storage key.
  const branchMeta = useBranchMeta(repoName || 'repo')
  const [issueModalBranch, setIssueModalBranch] = useState<string | null>(null)
  // Pull requests. `githubRepo` is resolved once from the remote rather than
  // per action (every handler used to call githubDetectRepo on its own), and
  // `defaultBranch` is what prIntentFor needs to know which way a request runs.
  const [githubRepo, setGithubRepo] = useState<{ owner: string; repo: string } | null>(null)
  // The repository behind the remote, for building links. Distinct from
  // githubRepo, which gates GitHub API calls and is only ever GitHub.
  const [remoteRepo, setRemoteRepo] = useState<RemoteRepo | null>(null)
  const [defaultBranch, setDefaultBranch] = useState<string | null>(null)
  const [prIntent, setPrIntent] = useState<PRIntent | null>(null)
  // The activity rail is always visible; `activeView` is the section its
  // resizable side-panel shows, or null when collapsed (only the rail). Closed
  // by default so the first thing a new user sees is the commit graph. The
  // choice + panel width are persisted host-side.
  const [activeView, setActiveView] = useState<SidebarView | null>(null)
  const [sideW, setSideW] = useState(240)
  const lastViewRef = useRef<SidebarView>('overview')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const [tracking, setTracking] = useState<{ ahead: number; behind: number }>({ ahead: 0, behind: 0 })
  const isLoadingRef = useRef(false)
  const showAllRef = useRef(showAllBranches)
  showAllRef.current = showAllBranches
  const soloRef = useRef(soloBranch); soloRef.current = soloBranch
  const hiddenRef = useRef(hiddenBranches); hiddenRef.current = hiddenBranches

  // ── Data loading (mirrors desktop App.loadRepoData) ──────────
  // `silent` reloads (from file watchers) skip the loading flag so the toolbar
  // icons don't flicker on every background refresh.
  const loadRepoData = useCallback(async (silent = false) => {
    if (isLoadingRef.current) return
    isLoadingRef.current = true
    if (!silent) setLoading(true)
    try {
      const branchRes = await window.gitAPI.getBranches()
      // Solo (show one branch) / hide (hide some) drive an explicit refs list,
      // which takes precedence over --all in getLog.
      const refForGit = (n: string) => n.replace(/^remotes\//, '')
      let logOpts: { maxCount: number; all?: boolean; refs?: string[] } = { maxCount: 500, all: showAllRef.current }
      if (soloRef.current) {
        logOpts = { maxCount: 500, refs: [refForGit(soloRef.current)] }
      } else if (hiddenRef.current.size > 0 && branchRes?.branches) {
        const visible = branchRes.branches
          .filter((b: BranchInfo) => !hiddenRef.current.has(b.name))
          .map((b: BranchInfo) => refForGit(b.name))
        logOpts = { maxCount: 500, refs: visible.length ? visible : ['HEAD'] }
      }
      const logRes = await window.gitAPI.getLog(logOpts)
      if (logRes?.commits) setCommits(logRes.commits)
      if (branchRes?.branches) {
        setBranches(branchRes.branches)
        const cur = branchRes.branches.find((b: BranchInfo) => b.current)
        if (cur) setCurrentBranch(cur.name)
      }
      try {
        const tg = await window.gitAPI.getTags()
        setTags(tg?.tags ?? [])
      } catch { /* ignore */ }
      const [conflictRes, modeRes] = await Promise.all([
        window.gitAPI.getConflictedFiles(),
        window.gitAPI.getConflictMode(),
      ])
      setConflictFiles(conflictRes?.files ?? [])
      setConflictKinds(Object.fromEntries((conflictRes?.entries ?? []).map(e => [e.path, e.kind])))
      setConflictMode(modeRes?.mode ?? null)
      const ch = await window.gitAPI.getWorkingChanges()
      setWipCount((ch?.staged?.length ?? 0) + (ch?.unstaged?.length ?? 0) + (ch?.untracked?.length ?? 0))
      try {
        const st = await window.gitAPI.getStashes()
        setStashes(st?.stashes ?? [])
        setStashCount(st?.stashes?.length ?? 0)
      } catch { /* ignore */ }
      try {
        const tr = await window.gitAPI.getTracking()
        setTracking({ ahead: tr?.ahead ?? 0, behind: tr?.behind ?? 0 })
      } catch { /* no upstream */ }
      try {
        const info = await window.gitAPI.appGetInfo()
        if (info?.repoName) setRepoName(info.repoName)
      } catch { /* ignore */ }
      // Both feed the "start a Pull Request" row: no GitHub remote or no known
      // default branch means prIntentFor returns null and no row is offered.
      try {
        const d = await window.gitAPI.getDefaultBranch()
        setDefaultBranch(d?.branch ?? null)
      } catch { setDefaultBranch(null) }
      try {
        const gh = await window.gitAPI.githubDetectRepo()
        setGithubRepo(gh?.owner ? { owner: gh.owner, repo: gh.repo } : null)
      } catch { setGithubRepo(null) }
      // Read the remote itself: it is the only thing that knows the host, and
      // every link below is built from it rather than from a hardcoded
      // github.com.
      try {
        const rem = await window.gitAPI.getRemotes()
        const def = await window.gitAPI.getDefaultRemote?.().catch(() => null)
        setRemoteRepo(repoFromRemotes(rem?.remotes ?? [], def?.remote))
      } catch { setRemoteRepo(null) }
    } finally {
      isLoadingRef.current = false
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => { loadRepoData() }, [loadRepoData])

  // Restore the persisted sidebar preference (host Memento via settingsGetAll)
  useEffect(() => {
    window.gitAPI.settingsGetAll()
      .then((s: Record<string, string>) => {
        const v = s?.sidebarView as SidebarView | undefined
        if (v && RAIL_VIEWS.includes(v)) { setActiveView(v); lastViewRef.current = v }
        const w = parseInt(s?.sidebarWidth ?? '', 10)
        if (!isNaN(w)) setSideW(Math.max(180, Math.min(500, w)))
        const rw = parseInt(s?.rightWidth ?? '', 10)
        if (!isNaN(rw)) setRightW(Math.max(320, Math.min(900, rw)))
      })
      .catch(() => { /* first run: keep default (collapsed) */ })
  }, [])

  // Rail click: toggle the panel for that view (click active icon → collapse).
  const handleSelectView = useCallback((v: SidebarView) => {
    setActiveView(cur => {
      const next = cur === v ? null : v
      if (next) lastViewRef.current = next
      void window.gitAPI.settingsSet('sidebarView', next ?? '')
      return next
    })
  }, [])

  // Toolbar toggle: collapse if open, else reopen the last-used view.
  const handleToggleSidebar = useCallback(() => {
    setActiveView(cur => {
      const next = cur ? null : lastViewRef.current
      void window.gitAPI.settingsSet('sidebarView', next ?? '')
      return next
    })
  }, [])

  // Refresh on host broadcasts (.git or working-tree changes) — silent so the
  // toolbar doesn't flicker.
  useEffect(() => {
    const handler = () => loadRepoData(true)
    window.gitAPI.onRepoChanged(handler)
    window.gitAPI.onWorkingChanged(handler)
    return () => {
      window.gitAPI.offRepoChanged(handler)
      window.gitAPI.offWorkingChanged(handler)
    }
  }, [loadRepoData])

  // Keep the selected commit object in sync with reloaded commits
  useEffect(() => {
    if (!selectedCommit || selectedCommit.hash === '__WIP__') return
    const still = commits.find(c => c.hash === selectedCommit.hash)
    if (!still) setSelectedCommit(null)
  }, [commits])

  // ── Commit-graph action handlers ─────────────────────────────
  const doUndo = useCallback(async () => {
    const r = await window.gitAPI.undoLastAction()
    if (r && r.success === false) toast.error(r.error ?? t('ext.app.undoFailed'))
    else toast.success(t('ext.app.undoOk'))
    await loadRepoData()
  }, [toast, loadRepoData])

  // `undoable` adds an "Annuler" button on the success toast (history rewrites)
  const runOp = useCallback(async (label: string, op: () => Promise<{ success?: boolean; error?: string }>, undoable = false) => {
    const r = await op()
    if (r && r.success === false) showToast(r.error ?? t('ext.app.opFailed', label), 'err')
    else if (undoable) toast.success(`✓ ${label}`, { label: t('ext.app.undo'), onClick: () => { void doUndo() } })
    else showToast(`✓ ${label}`)
    await loadRepoData()
  }, [showToast, toast, doUndo, loadRepoData])

  // Warn (per the user's `warnBeforeConflict` setting) before an operation
  // predicted to conflict. `predict` returns the files that would clash — empty
  // means clean OR the prediction couldn't run, and either way we don't block.
  // On a predicted conflict a sticky toast offers Continue, "don't ask again"
  // (flips the setting off, then continues), or dismiss (×) to cancel.
  const guardConflict = useCallback(async (
    predict: () => Promise<{ files: string[]; error?: string }>,
    op: () => void | Promise<void>,
  ) => {
    const settings = await window.gitAPI.settingsGetAll().catch(() => ({} as Record<string, string>))
    if ((settings as any)?.warnBeforeConflict === 'false') { await op(); return }
    const { files } = await predict().catch(() => ({ files: [] as string[] }))
    if (files.length === 0) { await op(); return }
    toast.error(
      `⚠ A conflict is expected on ${files.length} file(s). Continue?`,
      [
        { label: t('ext.app.continue'), onClick: () => { void op() } },
        { label: t('ext.app.dontAskAgain'), onClick: () => {
          void window.gitAPI.settingsSet('warnBeforeConflict', 'false')
          void op()
        } },
      ],
      true,   // sticky — a go/no-go decision must not silently time out
    )
  }, [toast])

  const handleCheckout = useCallback((ref: string) => runOp('Checkout', () => window.gitAPI.checkout(ref)), [runOp])
  const handleCherryPick = useCallback((hash: string) => guardConflict(
    () => window.gitAPI.predictConflicts(hash, 'HEAD', `${hash}^`),   // base = commit's parent
    () => runOp('Cherry-pick', () => window.gitAPI.cherryPick(hash)),
  ), [runOp, guardConflict])
  const handleRevert = useCallback((hash: string) => guardConflict(
    () => window.gitAPI.predictConflicts(`${hash}^`, 'HEAD', hash),   // apply the inverse
    () => runOp('Revert', () => window.gitAPI.revert(hash)),
  ), [runOp, guardConflict])
  const handleReset = useCallback((hash: string, mode: 'soft' | 'mixed' | 'hard') => runOp(`Reset --${mode}`, () => window.gitAPI.reset(hash, mode), true), [runOp])

  const handleCreateTag = useCallback(async (hash: string) => {
    const name = await window.gitAPI.uiPrompt(t('ext.app.tagName'))
    if (name) runOp(t('ext.app.tagCreated'), () => window.gitAPI.createTag(name, hash))
  }, [runOp])

  const handleCreateBranchAt = useCallback(async (hash: string) => {
    const name = await window.gitAPI.uiPrompt(t('ext.app.newBranchName'))
    if (name) runOp(t('ext.app.branchCreated'), () => window.gitAPI.createBranchAt(name, hash, true))
  }, [runOp])

  // History-rewriting ops — drop / reorder a commit and drag a branch onto a commit.
  const handleDropCommit = useCallback(async (hash: string) => {
    const ok = await window.gitAPI.uiConfirm(`Delete commit ${hash.slice(0, 7)}? This rewrites history.`)
    if (!ok) return
    setSelectedCommit(null)
    await runOp(t('ext.app.commitDeleted'), () => window.gitAPI.dropCommit(hash), true)
  }, [runOp])

  const handleMoveCommit = useCallback((hash: string, direction: 'up' | 'down') =>
    runOp(t('ext.app.commitMoved'), () => window.gitAPI.moveCommit(hash, direction), true), [runOp])

  // ── Branch / tag context-menu operations ─────────────────────
  const handleMergeBranch = useCallback((name: string) => guardConflict(
    () => window.gitAPI.predictConflicts(name),
    () => runOp(`Merge ${name}`, () => window.gitAPI.merge(name), true),
  ), [runOp, guardConflict])
  const handleRebaseCurrentOnto = useCallback((name: string) => guardConflict(
    () => window.gitAPI.predictRebaseConflicts(name),   // accurate per-commit replay
    () => runOp(t('ext.app.rebaseOnto', name), () => window.gitAPI.rebaseOnto(name), true),
  ), [runOp, guardConflict])

  // Reword works on any commit: HEAD is a plain amend; any other commit goes
  // through a targeted mini-rebase (pick everything, reword just that one),
  // reusing the same interactiveRebase(sequence, messages) infra the
  // interactive-rebase planner uses for squash/reword messages.
  /**
   * Put `message` on a commit that is not the tip, by replaying the range from
   * its parent with a `reword` step. Split out so the commit panel's inline
   * editor can apply what the user typed there, rather than opening a VS Code
   * input box on top of the text they just wrote.
   */
  const applyReword = useCallback(async (hash: string, message: string) => {
    const current = commits.find(c => c.hash === hash)
    if (!current || current.parents.length === 0) {
      showToast(t('ext.app.noRewordFirst'), 'err')
      return
    }
    const seq = await window.gitAPI.getRebaseSequence(current.parents[0])
    const sequence = seq.commits.map((c: { hash: string }) => ({ action: c.hash === current.hash ? 'reword' : 'pick', hash: c.hash }))
    await runOp(t('ext.app.msgModified'), () => window.gitAPI.interactiveRebase(sequence, [message]))
  }, [runOp, commits, showToast])

  const handleRewordCommit = useCallback(async (hash: string) => {
    const current = commits.find(c => c.hash === hash)
    if (!current) return
    const isHead = current.refs.some(r => r.includes('HEAD ->') && r.includes(currentBranch))

    if (isHead) {
      const fullMsg = (await window.gitAPI.getLastCommitMessage()).message || current.message
      const newMsg = await window.gitAPI.uiPrompt(t('ext.app.newCommitMsg'), fullMsg)
      if (!newMsg || newMsg === fullMsg) return
      await runOp(t('ext.app.msgModified'), () => window.gitAPI.amendMessage(newMsg))
      return
    }
    if (current.parents.length === 0) {
      showToast(t('ext.app.noRewordFirst'), 'err')
      return
    }
    const newMsg = await window.gitAPI.uiPrompt(t('ext.app.newCommitMsg'), current.message)
    if (!newMsg || newMsg === current.message) return
    await applyReword(hash, newMsg)
  }, [runOp, commits, currentBranch, showToast, applyReword])

  /**
   * "Take me here" — the double-click on a branch row, a ref chip or a tag. It
   * always lands on a LOCAL BRANCH: git decides which case applies
   * (getCheckoutPlan) and this carries it out. Detaching HEAD is reserved for
   * the context menu's explicit "check out this commit".
   */
  const handleGoTo = useCallback(async (ref: string) => {
    const plan = await window.gitAPI.getCheckoutPlan(ref)
    if (!plan || plan.error) { showToast(plan?.error ?? t('ext.app.failed'), 'err'); return }
    switch (plan.action) {
      case 'already-here':
        showToast(t('ext.app.alreadyOnBranch', plan.branch))
        return
      case 'checkout-local':
        await handleCheckout(plan.branch)
        return
      case 'create-tracking':
        // A remote branch with no local counterpart: the branch that tracks it
        // is unambiguous, so it is created without asking.
        await runOp(t('ext.app.checkedOut', plan.branch), () =>
          window.gitAPI.checkoutTracking(plan.remoteRef, plan.branch))
        return
      case 'create-branch': {
        // Nothing to land on. Ask for a name, prefilled with nothing: a
        // suggestion here would be a guess about what the branch is for.
        const name = await window.gitAPI.uiPrompt(t('ext.app.branchHere', plan.shortHash), '')
        if (!name || !name.trim()) return
        await runOp(t('ext.app.checkedOut', name.trim()), () =>
          window.gitAPI.createBranchAt(name.trim(), plan.hash, true))
        return
      }
    }
  }, [runOp, handleCheckout, showToast])

  const handleRebaseCurrentOntoCommit = useCallback((hash: string) => guardConflict(
    () => window.gitAPI.predictRebaseConflicts(hash),   // accurate per-commit replay
    () => runOp(t('ext.app.rebaseOnto', hash.slice(0, 7)), () => window.gitAPI.rebaseOnto(hash), true),
  ), [runOp, guardConflict])

  const handlePushToCommit = useCallback((hash: string) =>
    runOp(`Push to ${hash.slice(0, 7)}`, () => window.gitAPI.pushToCommit(hash)), [runOp])

  const handleCreatePatch = useCallback(async (hash: string) => {
    const res = await window.gitAPI.createPatch(hash)
    if (res.error) { showToast(res.error, 'err'); return }
    const r = await window.gitAPI.savePatchFile(res.patch, `${hash.slice(0, 7)}.patch`)
    if (r.success) showToast(t('ext.app.patchSavedOk'))
    else if (!r.canceled) showToast(r.error ?? t('ext.app.failed'), 'err')
  }, [showToast])

  const handleCopyPatch = useCallback(async (hash: string) => {
    const res = await window.gitAPI.createPatch(hash)
    if (res.error) { showToast(res.error, 'err'); return }
    navigator.clipboard.writeText(res.patch)
    showToast(t('ext.app.patchCopiedOk'))
  }, [showToast])

  const handleCreateWorktreeAt = useCallback(async (hash: string) => {
    // The host's selectDirectory returns the fsPath string directly (or null).
    const dirPath: string | null = await window.gitAPI.selectDirectory(t('ext.app.worktreePath'))
    if (!dirPath) return
    const branch = await window.gitAPI.uiPrompt(t('ext.app.newBranchNameDetached'), '')
    if (branch === null || branch === undefined) return
    const r = await window.gitAPI.addWorktree(dirPath, hash, branch || undefined)
    if (r.success) showToast(t('ext.app.worktreeCreatedOk'))
    else showToast(r.error ?? t('ext.app.failed'), 'err')
  }, [showToast])

  const handleOpenCommitOnRemote = useCallback(async (hash: string) => {
    if (!remoteRepo) { showToast(t('ext.app.noGithub'), 'err'); return }
    window.gitAPI.openExternal(remoteUrl.commit(remoteRepo, hash))
  }, [showToast, remoteRepo])

  // Same trick one level up: /tree/<branch> instead of /commit/<hash>. This
  // existed for commits only until v1.21.0.
  const handleOpenBranchOnRemote = useCallback(async (name: string) => {
    if (!remoteRepo) { showToast(t('ext.app.noGithub'), 'err'); return }
    window.gitAPI.openExternal(remoteUrl.branch(remoteRepo, name))
  }, [showToast, remoteRepo])

  // The copy variants the desktop already had and the panel did not: one place
  // builds the link now, so offering it on both sides costs two lines.
  const handleCopyCommitLink = useCallback((hash: string) => {
    if (!remoteRepo) { showToast(t('ext.app.noGithub'), 'err'); return }
    navigator.clipboard.writeText(remoteUrl.commit(remoteRepo, hash))
    showToast(t('toast.linkCopied'))
  }, [showToast, remoteRepo])

  const handleOpenFileOnRemote = useCallback((hash: string, filePath: string) => {
    if (!remoteRepo) { showToast(t('ext.app.noGithub'), 'err'); return }
    window.gitAPI.openExternal(remoteUrl.file(remoteRepo, hash, filePath))
  }, [showToast, remoteRepo])

  const handleCopyFileLink = useCallback((hash: string, filePath: string) => {
    if (!remoteRepo) { showToast(t('ext.app.noGithub'), 'err'); return }
    navigator.clipboard.writeText(remoteUrl.file(remoteRepo, hash, filePath))
    showToast(t('toast.linkCopied'))
  }, [showToast, remoteRepo])

  const handleOpenBranchesOnRemote = useCallback(() => {
    if (!remoteRepo) { showToast(t('ext.app.noGithub'), 'err'); return }
    window.gitAPI.openExternal(remoteUrl.branches(remoteRepo))
  }, [showToast, remoteRepo])

  const handleCopyBranchLink = useCallback((name: string) => {
    if (!remoteRepo) { showToast(t('ext.app.noGithub'), 'err'); return }
    navigator.clipboard.writeText(remoteUrl.branch(remoteRepo, name))
    showToast(t('toast.linkCopied'))
  }, [showToast, remoteRepo])

  // Which pull request a branch row offers — the rules live in prIntent.ts, and
  // both products ask the same function so their menus agree. Null without a
  // GitHub remote, which is what removes the row.
  const prIntentFor = useCallback(
    (branchRef: string) =>
      githubRepo ? computePRIntent(branchRef, { currentBranch, defaultBranch, branches }) : null,
    [githubRepo, currentBranch, defaultBranch, branches]
  )

  // The push itself happens in the composer, right before the GitHub call.
  const handleStartPR = useCallback((intent: PRIntent) => {
    if (!githubRepo) { showToast(t('pr.noRemote'), 'err'); return }
    setPrIntent(intent)
  }, [githubRepo, showToast, t])

  // The pull request the checked-out branch offers — null on the default
  // branch, where requests land rather than start.
  const currentBranchPR = prIntentFor(currentBranch)

  // Dispatches actions chosen from the NATIVE commit context menu (see
  // package.json contributes.menus["webview/context"] + extension.ts) — the
  // host posts { action, hash } here after the user picks an item, and we
  // route it to the exact same handlers the old in-webview HTML menu used.
  useEffect(() => {
    const onMenuAction = (action: string, hash: string) => {
      const commit = commits.find(c => c.hash === hash)
      switch (action) {
        case 'switchTo': handleCheckout(hash); break
        case 'createBranch': handleCreateBranchAt(hash); break
        case 'createTag': handleCreateTag(hash); break
        case 'createWorktree': handleCreateWorktreeAt(hash); break
        case 'modifyFromHere': window.gitAPI.openInteractiveRebaseTab(hash); break
        case 'reword': handleRewordCommit(hash); break
        case 'cherryPick': handleCherryPick(hash); break
        case 'revert': handleRevert(hash); break
        case 'drop': handleDropCommit(hash); break
        case 'moveUp': handleMoveCommit(hash, 'up'); break
        case 'moveDown': handleMoveCommit(hash, 'down'); break
        case 'rebaseOnto': handleRebaseCurrentOntoCommit(hash); break
        case 'resetSoft': handleReset(hash, 'soft'); break
        case 'resetMixed': handleReset(hash, 'mixed'); break
        case 'resetHard': handleReset(hash, 'hard'); break
        case 'pushToCommit': handlePushToCommit(hash); break
        case 'copyShortHash': if (commit) navigator.clipboard.writeText(commit.shortHash); break
        case 'copyFullHash': navigator.clipboard.writeText(hash); break
        case 'copyMessage': if (commit) navigator.clipboard.writeText(commit.message); break
        case 'createPatch': handleCreatePatch(hash); break
        case 'copyPatch': handleCopyPatch(hash); break
        case 'openOnRemote': handleOpenCommitOnRemote(hash); break
        case 'compareWorking': window.gitAPI.openCompareWorkingTab(hash); break
        case 'selectForCompare': setCompareBaseHash(hash); showToast(t('ext.app.commitSelected')); break
        case 'compareWithSelected': if (compareBaseHash) window.gitAPI.openCompare(compareBaseHash, hash); break
      }
    }
    window.gitAPI.onMenuAction(onMenuAction)
    return () => window.gitAPI.offMenuAction(onMenuAction)
  }, [commits, compareBaseHash, handleCheckout, handleCreateBranchAt, handleCreateTag, handleCreateWorktreeAt,
      handleRewordCommit, handleCherryPick, handleRevert, handleDropCommit, handleMoveCommit,
      handleRebaseCurrentOntoCommit, handleReset, handlePushToCommit, handleCreatePatch, handleCopyPatch,
      handleOpenCommitOnRemote, showToast])
  const handleRenameBranch = useCallback(async (name: string) => {
    const newName = await window.gitAPI.uiPrompt(t('ext.app.renameBranchPrompt'), name)
    if (newName && newName !== name) runOp(t('ext.app.branchRenamed'), () => window.gitAPI.renameBranch(name, newName))
  }, [runOp])
  const handleDeleteBranch = useCallback(async (name: string) => {
    if (await window.gitAPI.uiConfirm(t('ext.app.confirmDeleteBranch', name))) {
      runOp(t('ext.app.branchDeleted'), () => window.gitAPI.deleteBranch(name))
    }
  }, [runOp])
  const handlePushBranch = useCallback((name: string) =>
    runOp(`Push ${name}`, () => window.gitAPI.pushBranch(name)), [runOp])
  const handleSetUpstream = useCallback((name: string) =>
    runOp(t('ext.app.upstreamSet'), () => window.gitAPI.setUpstream(name)), [runOp])
  const handleDeleteRemoteBranch = useCallback(async (ref: string) => {
    if (await window.gitAPI.uiConfirm(t('ext.app.confirmDeleteRemoteBranch', ref))) {
      runOp(t('ext.app.remoteBranchDeleted'), () => window.gitAPI.deleteRemoteBranch(ref))
    }
  }, [runOp])
  const handlePushTag = useCallback((name: string) =>
    runOp(t('ext.app.tagPushed', name), () => window.gitAPI.pushTag(name)), [runOp])
  const handleDeleteTag = useCallback(async (name: string) => {
    if (await window.gitAPI.uiConfirm(t('ext.app.confirmDeleteTag', name))) {
      runOp(t('ext.app.tagDeleted'), () => window.gitAPI.deleteTag(name))
    }
  }, [runOp])
  const handleDeleteRemoteTag = useCallback(async (name: string) => {
    if (await window.gitAPI.uiConfirm(t('ext.app.confirmDeleteRemoteTag', name))) {
      runOp(t('ext.app.remoteTagDeleted'), () => window.gitAPI.deleteRemoteTag(name))
    }
  }, [runOp])

  // ── Sidebar-specific handlers ────────────────────────────────
  const loadStashes = useCallback(async () => {
    try { const st = await window.gitAPI.getStashes(); setStashes(st?.stashes ?? []); setStashCount(st?.stashes?.length ?? 0) }
    catch { /* ignore */ }
  }, [])
  const showPrompt = useCallback(async (msg: string, def?: string): Promise<string | null> => {
    const r = await window.gitAPI.uiPrompt(msg, def)
    return (r ?? null) as string | null
  }, [])
  const showConfirm = useCallback((msg: string): Promise<boolean> => window.gitAPI.uiConfirm(msg), [])
  const handleApplyStash = useCallback((index: number) =>
    runOp(t('ext.app.stashApplied'), () => window.gitAPI.applyStash(index)), [runOp])
  const handlePopStashIndex = useCallback((index: number) =>
    runOp(t('ext.app.stashPopped'), () => window.gitAPI.popStash(index)), [runOp])
  const handleDropStash = useCallback(async (index: number) => {
    if (await window.gitAPI.uiConfirm(t('ext.app.confirmDropStash', index))) {
      runOp(t('ext.app.stashDropped'), () => window.gitAPI.dropStash(index))
    }
  }, [runOp])
  const handleCreateTagPrompt = useCallback(async () => {
    const name = await window.gitAPI.uiPrompt(t('ext.app.tagNameHead'))
    if (name) runOp(t('ext.app.tagCreated'), () => window.gitAPI.createTag(name))
  }, [runOp])
  const handleSelectCommitByHash = useCallback((hash: string) => {
    const found = commits.find(c => c.hash === hash || c.hash.startsWith(hash))
    if (found) setSelectedCommit(found)
  }, [commits])
  const handleToggleSolo = useCallback((name: string) => {
    setSoloBranch(prev => { const next = prev === name ? null : name; soloRef.current = next; return next })
    setTimeout(() => loadRepoData(), 0)
  }, [loadRepoData])
  const handleToggleHide = useCallback((name: string) => {
    setHiddenBranches(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      hiddenRef.current = next
      return next
    })
    setTimeout(() => loadRepoData(), 0)
  }, [loadRepoData])

  // Drag branch A onto a target. `targetBranch` (B) is set when the drop landed
  // on a branch tip — the only case that offers "merge". Merge A INTO B, rebase
  // A ONTO B, reset A to the target.
  const handleBranchDrop = useCallback(async (branch: string, hash: string, action: 'reset' | 'rebase' | 'merge', targetBranch?: string) => {
    if (action === 'merge' && !targetBranch) return
    if (action === 'reset') {
      const ok = await window.gitAPI.uiConfirm(`Reset ${branch} onto ${targetBranch ?? hash.slice(0, 7)}?`)
      if (!ok) return
    }
    const op = action === 'reset'
      ? () => window.gitAPI.moveBranchTo(branch, hash)
      : action === 'rebase'
        ? () => window.gitAPI.rebaseBranchOnto(branch, hash)              // rebase A onto B's tip
        : () => window.gitAPI.mergeCommitInto(targetBranch!, branch)      // checkout B, merge A (merge A into B)
    const run = () => runOp(action === 'reset' ? t('ext.app.branchReset') : action === 'rebase' ? t('ext.app.rebaseDone') : t('ext.app.mergeDone'), op, true)
    // Reset just moves a ref — it can't conflict. Merge/rebase can.
    if (action === 'reset') { await run(); return }
    await guardConflict(
      action === 'merge'
        ? () => window.gitAPI.predictConflicts(branch, targetBranch)      // merge A into B
        : () => window.gitAPI.predictRebaseConflicts(hash, branch),       // rebase A onto B's tip
      run,
    )
  }, [runOp, guardConflict])

  // ── Conflict resolution (routed by the in-progress operation) ─
  const handleConflictFinish = useCallback(async (action: 'rebase' | 'merge', message?: string) => {
    const mode = conflictMode ?? action
    let r: { success?: boolean; error?: string }
    if (mode === 'rebase') r = await window.gitAPI.continueRebase()
    else if (mode === 'cherry-pick') r = await window.gitAPI.continueCherryPick()
    else if (mode === 'revert') r = await window.gitAPI.continueRevert()
    else r = await window.gitAPI.continueMerge(message)
    if (r && r.success === false) showToast(r.error ?? t('ext.app.failed'), 'err')
    else showToast(mode === 'rebase' ? t('ext.app.rebaseContinued') : t('ext.app.conflictsResolved'))
    await loadRepoData()
  }, [conflictMode, showToast, loadRepoData])

  const handleConflictAbort = useCallback(async () => {
    if (conflictMode === 'merge') await window.gitAPI.abortMerge()
    else if (conflictMode === 'cherry-pick') await window.gitAPI.abortCherryPick()
    else if (conflictMode === 'revert') await window.gitAPI.abortRevert()
    else await window.gitAPI.abortRebase()
    showToast(t('ext.app.opAborted'))
    await loadRepoData()
  }, [conflictMode, showToast, loadRepoData])

  // Open a conflicted file in the rich 3-way resolver tab, and a file diff in
  // a NATIVE VS Code editor tab.
  const handleOpenResolver = useCallback((file: string) => { window.gitAPI.openConflictResolver(file) }, [])
  const handleOpenFileDiff = useCallback((target: any) => { window.gitAPI.openDiff(target) }, [])

  // ── Toolbar handlers (push / fetch / pull / branch / stash …) ─
  const handleFetch = useCallback(async () => {
    await runOp('Fetch', () => window.gitAPI.fetch())
    setLastFetch(new Date())
  }, [runOp])
  const handleOpenDesktop = useCallback(() => window.gitAPI.openDesktop(), [])
  const handlePull = useCallback(() => guardConflict(
    () => window.gitAPI.predictConflicts('@{u}'),   // merge of the already-known upstream tip (pre-fetch)
    () => runOp('Pull', () => window.gitAPI.pull()),
  ), [runOp, guardConflict])
  const handlePush = useCallback(() => runOp('Push', () => window.gitAPI.push()), [runOp])
  const handleUndo = useCallback(() => runOp(t('ext.app.undone'), () => window.gitAPI.undoLastAction()), [runOp])
  const handleRedo = useCallback(() => runOp(t('ext.app.redone'), () => window.gitAPI.redoLastAction()), [runOp])
  const handleStash = useCallback(() => runOp(t('ext.app.stashCreated'), () => window.gitAPI.createStash()), [runOp])
  const handlePop = useCallback(() => runOp(t('ext.app.stashApplied'), () => window.gitAPI.popStash(0)), [runOp])
  const handleTerminal = useCallback(() => window.gitAPI.openTerminal(), [])
  const handleNewBranch = useCallback(async () => {
    const name = await window.gitAPI.uiPrompt(t('ext.app.newBranchName'))
    if (name) runOp(t('ext.app.branchCreated'), () => window.gitAPI.createBranch(name))
  }, [runOp])
  const handleToggleAllBranches = useCallback(() => {
    setShowAllBranches(v => { showAllRef.current = !v; return !v })
    setTimeout(() => loadRepoData(), 0)
  }, [loadRepoData])

  // ── Right-panel resize ───────────────────────────────────────
  const startResizeRight = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = rightW
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(320, Math.min(900, startW + (startX - ev.clientX)))
      setRightW(w)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setRightW(w => { void window.gitAPI.settingsSet('rightWidth', String(w)); return w })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [rightW])

  // ── Side-panel resize (drag the handle on its right edge) ────
  const startResizeSide = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = sideW
    const onMove = (ev: MouseEvent) => {
      setSideW(Math.max(180, Math.min(500, startW + (ev.clientX - startX))))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setSideW(w => { void window.gitAPI.settingsSet('sidebarWidth', String(w)); return w })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [sideW])

  // Stacked mode — below this width the right panel replaces the graph
  // entirely instead of squeezing it (typical narrow VS Code side panels).
  const [viewportW, setViewportW] = useState(window.innerWidth)
  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const stacked = viewportW < 640

  const appBodyRef = useRef<HTMLDivElement>(null)

  // The right panel is always freely resizable (drag its handle). We no longer
  // auto-widen it when the terminal is short — that fought the user's own sizing;
  // the compact staging layout now handles small heights. Just clamp so the
  // panel can't push the graph below a usable minimum.
  const effRightW = Math.min(rightW, Math.max(320, viewportW - 340))

  const showRight = !!selectedCommit || !!conflictMode

  // Branch strip shown above the staging file list (v1.22.0). Everything here
  // already existed on the toolbar or in the ⋮ menu — this only brings it into
  // the panel, where the files are.
  const branchStripProps = {
    branch: currentBranch,
    ahead: tracking.ahead,
    behind: tracking.behind,
    onPush: handlePush,
    onPull: handlePull,
    onFetch: handleFetch,
    issue: branchMeta.issueFor(currentBranch),
    onAssociateIssue: () => setIssueModalBranch(currentBranch),
    onOpenIssue: (n: number) => {
      if (remoteRepo) window.gitAPI.openExternal(remoteUrl.issue(remoteRepo, n))
    },
    pr: currentBranchPR,
    menuState: {
      soloed: soloBranch === currentBranch,
      hidden: hiddenBranches.has(currentBranch),
      favorite: branchMeta.isFavorite(currentBranch),
    },
    menuActions: {
      onPull: handlePull,
      onPush: handlePush,
      onSetUpstream: () => handleSetUpstream(currentBranch),
      onOpenOnRemote: () => handleOpenBranchOnRemote(currentBranch),
      onOpenBranchesOnRemote: handleOpenBranchesOnRemote,
      onAssociateIssue: () => setIssueModalBranch(currentBranch),
      onToggleFavorite: () => branchMeta.toggleFavorite(currentBranch),
      onToggleSolo: () => handleToggleSolo(currentBranch),
      onToggleHide: () => handleToggleHide(currentBranch),
      onCopyName: () => navigator.clipboard.writeText(currentBranch),
      onCopyLink: () => handleCopyBranchLink(currentBranch),
      onRename: () => handleRenameBranch(currentBranch),
      onCreatePR: currentBranchPR ? () => handleStartPR(currentBranchPR) : undefined,
    },
  }

  return (
    <div className="app gv-app">
      <CompactToolbar
        repoName={repoName}
        branch={currentBranch}
        branches={branches}
        loading={loading}
        stashCount={stashCount}
        showAllBranches={showAllBranches}
        searchQuery={searchQuery}
        searchMatches={searchMatches}
        lastFetch={lastFetch}
        ahead={tracking.ahead}
        behind={tracking.behind}
        onCheckout={handleCheckout}
        onSearch={setSearchQuery}
        onToggleAllBranches={handleToggleAllBranches}
        onFetch={handleFetch}
        onPull={handlePull}
        onPush={handlePush}
        onNewBranch={handleNewBranch}
        onStash={handleStash}
        onPop={handlePop}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onTerminal={handleTerminal}
        onOpenDesktop={handleOpenDesktop}
        onRefresh={loadRepoData}
        sidebarOpen={activeView !== null}
        onToggleSidebar={handleToggleSidebar}
        onSettings={() => setSettingsOpen(true)}
        onSetUpstream={handleSetUpstream}
        onRenameBranch={handleRenameBranch}
        onOpenBranchOnRemote={handleOpenBranchOnRemote}
        onAssociateIssue={setIssueModalBranch}
        onToggleFavorite={branchMeta.toggleFavorite}
        onToggleSolo={handleToggleSolo}
        onToggleHide={handleToggleHide}
        isFavorite={branchMeta.isFavorite}
        issueFor={branchMeta.issueFor}
        soloBranch={soloBranch}
        hiddenBranches={hiddenBranches}
        pr={currentBranchPR}
        onCreatePR={handleStartPR}
      />
      {settingsOpen && (
        <div className="gv-settings-overlay">
          <SettingsModal embedded onClose={() => setSettingsOpen(false)} showToast={showToast} />
        </div>
      )}
      {conflictMode && (
        <div className="gv-conflict-banner">
          <span className="gv-cb-icon">⚠️</span>
          <span className="gv-cb-text">
            <strong>{conflictMode}</strong> {t('ext.app.inProgress')}
            {conflictFiles.length > 0
              ? ` — ${conflictFiles.length} file(s) to resolve`
              : t('ext.app.noConflictToResolve')}
          </span>
          <span className="gv-cb-spring" />
          <button
            className="gv-cb-btn gv-cb-continue"
            disabled={conflictFiles.length > 0}
            title={conflictFiles.length > 0 ? t('ext.app.resolveFirst') : t('ext.app.continueOp')}
            onClick={() => handleConflictFinish(conflictMode === 'merge' ? 'merge' : 'rebase')}
          >
            {t('ext.app.continue')}
          </button>
          <button className="gv-cb-btn gv-cb-abort" onClick={handleConflictAbort}>
            {t('ext.app.abort')}
          </button>
        </div>
      )}
      <div className="app-body" ref={appBodyRef}>
        {!stacked && (
          <ActivityRail active={activeView} onSelect={handleSelectView} />
        )}
        {activeView && !stacked && (
          <>
          <div className="gv-sidepanel" style={{ width: sideW }}>
          <Sidebar
            view={activeView}
            repoPath={repoName || 'repo'}
            repoName={repoName}
            currentBranch={currentBranch}
            branches={branches}
            recentRepos={[]}
            stashes={stashes}
            tags={tags}
            onOpenRepo={() => {}}
            onClone={() => {}}
            onSetRepo={() => {}}
            onRemoveRecent={() => {}}
            onCheckout={handleCheckout}
            onGoTo={handleGoTo}
            onCreateBranch={handleNewBranch}
            onDeleteBranch={handleDeleteBranch}
            onMergeBranch={handleMergeBranch}
            onRenameBranch={handleRenameBranch}
            onRebaseOnto={handleRebaseCurrentOnto}
            onPushBranch={handlePushBranch}
            onDeleteRemoteBranch={handleDeleteRemoteBranch}
            onSetUpstream={handleSetUpstream}
            onCreateStash={handleStash}
            onApplyStash={handleApplyStash}
            onPopStash={handlePopStashIndex}
            onDropStash={handleDropStash}
            onRefreshStashes={loadStashes}
            onCreateTag={handleCreateTagPrompt}
            onDeleteTag={handleDeleteTag}
            onPushTag={handlePushTag}
            onDeleteRemoteTag={handleDeleteRemoteTag}
            onSelectCommit={handleSelectCommitByHash}
            onCompareBranch={(name: string) => window.gitAPI.openCompare(currentBranch, name)}
            soloBranch={soloBranch}
            hiddenBranches={hiddenBranches}
            onToggleSolo={handleToggleSolo}
            onToggleHide={handleToggleHide}
            onFetch={handleFetch}
            onPull={handlePull}
            isFavorite={branchMeta.isFavorite}
            issueFor={branchMeta.issueFor}
            onToggleFavorite={branchMeta.toggleFavorite}
            onOpenBranchOnRemote={handleOpenBranchOnRemote}
            onCopyBranchLink={handleCopyBranchLink}
            onAssociateIssue={setIssueModalBranch}
            prIntentFor={prIntentFor}
            onCreatePR={handleStartPR}
            showToast={showToast}
            showPrompt={showPrompt}
            showConfirm={showConfirm}
            embedded
          />
          </div>
          <div className="resize-handle" onMouseDown={startResizeSide} />
          </>
        )}
        <div className="app-center" style={{ flex: 1, display: stacked && showRight ? 'none' : 'flex', minWidth: 0, overflow: 'hidden' }}>
          <CommitGraph
            commits={commits}
            selectedHash={selectedCommit?.hash ?? null}
            onSelectCommit={c => setSelectedCommit(prev => prev?.hash === c.hash ? null : c)}
            searchQuery={searchQuery}
            currentBranch={currentBranch}
            onCherryPick={handleCherryPick}
            onRevert={handleRevert}
            onReset={handleReset}
            onCreateTag={handleCreateTag}
            onCreateBranchAt={handleCreateBranchAt}
            onCheckoutBranch={handleGoTo}
            onCheckoutCommit={handleCheckout}
            onRewordCommit={handleRewordCommit}
            onDropCommit={handleDropCommit}
            onMoveCommit={handleMoveCommit}
            onBranchDrop={handleBranchDrop}
            onMergeBranch={handleMergeBranch}
            onRebaseCurrentOnto={handleRebaseCurrentOnto}
            onRenameBranch={handleRenameBranch}
            onDeleteBranch={handleDeleteBranch}
            onPushBranch={handlePushBranch}
            onSetUpstream={handleSetUpstream}
            onDeleteRemoteBranch={handleDeleteRemoteBranch}
            onPushTag={handlePushTag}
            onDeleteTag={handleDeleteTag}
            onDeleteRemoteTag={handleDeleteRemoteTag}
            onInteractiveRebase={(hash) => window.gitAPI.openInteractiveRebaseTab(hash)}
            onRebaseCurrentOntoCommit={handleRebaseCurrentOntoCommit}
            onPushToCommit={handlePushToCommit}
            onCreatePatch={handleCreatePatch}
            onCopyPatch={handleCopyPatch}
            onCreateWorktreeAt={handleCreateWorktreeAt}
            onOpenCommitOnRemote={handleOpenCommitOnRemote}
            prIntentFor={prIntentFor}
            onCreatePR={handleStartPR}
            onCompareWorking={(hash) => window.gitAPI.openCompareWorkingTab(hash)}
            compareBaseHash={compareBaseHash}
            onSelectForCompare={(hash) => { setCompareBaseHash(hash); showToast(t('ext.app.commitSelected')) }}
            onCompareWithSelected={(hash) => { if (compareBaseHash) window.gitAPI.openCompare(compareBaseHash, hash) }}
            wipCount={wipCount}
            conflictMode={conflictMode}
            loading={loading}
            onSearchMatches={setSearchMatches}
            nativeContextMenu
            onNativeMenuTarget={(hash) => window.gitAPI.setLastMenuHash(hash)}
          />
        </div>

        {showRight && (
          <>
            {!stacked && <div className="resize-handle" onMouseDown={startResizeRight} />}
            <div className={stacked ? 'app-right gv-right-stacked' : 'app-right'} style={stacked ? undefined : { width: effRightW }}>
              {stacked && !conflictMode && (
                <div className="gv-stacked-bar">
                  <button className="gv-stacked-back" onClick={() => setSelectedCommit(null)}>
                    {t('ext.app.backToGraph')}
                  </button>
                  {selectedCommit && selectedCommit.hash !== '__WIP__' && (
                    <span className="gv-stacked-title">{selectedCommit.shortHash} — {selectedCommit.message}</span>
                  )}
                </div>
              )}
              <RightPanel
                embedded
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
                onOpenResolver={handleOpenResolver}
                onOpenFileDiff={handleOpenFileDiff}
                onOpenStagingEditor={(f) => window.gitAPI.openStagingEditor(f)}
                onRewordMessage={applyReword}
                onOpenFileOnRemote={handleOpenFileOnRemote}
                onCopyFileLink={handleCopyFileLink}
                branchStrip={branchStripProps}
              />
            </div>
          </>
        )}
      </div>
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
      {prIntent && githubRepo && (
        <PRModal
          owner={githubRepo.owner}
          repo={githubRepo.repo}
          intent={prIntent}
          // The composer pushes before creating, so ahead/behind and the
          // branch's published state are both stale afterwards.
          onPushed={() => loadRepoData(true)}
          onClose={() => setPrIntent(null)}
          showToast={showToast}
        />
      )}
    </div>
  )
}

// A focused tool (e.g. the staging editor) can be booted into the same bundle
// via window.__GV_BOOT__, injected by the host's HTML.
const boot = (window as any).__GV_BOOT__ as
  {
    mode?: string; file?: string; refA?: string; refB?: string; baseHash?: string; hash?: string
    initialMessage?: string; action?: string; subject?: string; stepCurrent?: number; stepTotal?: number
    // "What's new": the note travels with the boot payload, since the host
    // already knows which version it opened the tab for.
    version?: string; notes?: string
  } | undefined

// The 3-way conflict resolver in its own tab: resolving or closing disposes
// the tab (the graph/rebase views refresh through the .git watcher).
function ConflictTab({ file }: { file: string }) {
  const toast = useToast()
  const showToast = useCallback((msg: string, type?: 'ok' | 'err') => {
    if (type === 'err') toast.error(msg); else toast.success(msg)
  }, [toast])
  const close = useCallback(() => { window.gitAPI.closeSelf() }, [])
  return <ConflictResolver file={file} onFinish={close} onAbort={close} showToast={showToast} />
}

// Interactive rebase planner in its own tab (was a modal overlay). Launching
// closes the tab either way — success/no-op or a real conflict both hand off
// to the auto-opened rebase tab, which the .git watcher pops on its own.
function InteractiveRebaseTab({ baseHash }: { baseHash: string }) {
  const toast = useToast()
  const showToast = useCallback((msg: string, type?: 'ok' | 'err') => {
    if (type === 'err') toast.error(msg); else toast.success(msg)
  }, [toast])
  const close = useCallback(() => { window.gitAPI.closeSelf() }, [])
  return <InteractiveRebase embedded baseHash={baseHash} onClose={close} onSuccess={() => {}} showToast={showToast} />
}


// Without this, any render error unmounts the whole tree and the panel goes
// black with no clue why — which is exactly what happened while building
// v1.22.0. Show the error instead, and keep it copyable for a bug report.
class PanelErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[GitVertex] panel render failed:', error, info.componentStack)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ padding: 16, font: '12px var(--vscode-editor-font-family, monospace)', color: '#f85149' }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Git Vertex — render error</div>
        <pre style={{ whiteSpace: 'pre-wrap', color: '#c9d1d9', margin: 0 }}>
          {this.state.error.message}
          {'\n\n'}
          {this.state.error.stack}
        </pre>
      </div>
    )
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <PanelErrorBoundary>
  <SettingsProvider>
    <LanguageProvider>
      <ToastProvider>
        {boot?.mode === 'stage' && boot.file
          ? <StagingEditor file={boot.file} />
          : boot?.mode === 'conflict' && boot.file
            ? <ConflictTab file={boot.file} />
            : boot?.mode === 'history' && boot.file
              ? <FileHistory file={boot.file} />
              : boot?.mode === 'compare'
                ? <CompareView initialA={boot.refA} initialB={boot.refB} />
                : boot?.mode === 'compareWorking' && boot.hash
                  ? <CompareWorkingView hash={boot.hash} />
                : boot?.mode === 'github'
                  ? <GitHubPanel repoPath="." />
                  : boot?.mode === 'rebase'
                    ? <RebaseProgress />
                    : boot?.mode === 'todo'
                      ? <RebaseTodoApp />
                      : boot?.mode === 'plan' && boot.baseHash
                        ? <InteractiveRebaseTab baseHash={boot.baseHash} />
                        : boot?.mode === 'commitMsg'
                          ? <CommitMsgEditorView boot={boot} />
                          : boot?.mode === 'whatsNew' && boot.notes
                            ? <WhatsNew version={boot.version ?? ''} notes={boot.notes} tagPrefix="ext-v" />
                            : <VertexApp />}
      </ToastProvider>
    </LanguageProvider>
  </SettingsProvider>
  </PanelErrorBoundary>
)
