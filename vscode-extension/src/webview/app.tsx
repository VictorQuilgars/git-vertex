// app.tsx — Git Vertex webview React entry.
// Reuses the REAL desktop components (CommitGraph + RightPanel) so the VS Code
// panel is visually identical to the desktop app. The `gitApiShim` import must
// come first: it installs window.gitAPI before any component mounts.
import './gitApiShim'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import ReactDOM from 'react-dom/client'

import { SettingsProvider } from '../../../src/renderer/src/contexts/SettingsContext'
import { LanguageProvider } from '../../../src/renderer/src/i18n/LanguageContext'
import { ToastProvider, useToast } from '../../../src/renderer/src/components/Toast/Toast'
import CompactToolbar from './CompactToolbar'
import SettingsModal from '../../../src/renderer/src/components/SettingsModal/SettingsModal'
import CommitGraph from '../../../src/renderer/src/components/CommitGraph/CommitGraph'
import RightPanel from '../../../src/renderer/src/components/RightPanel/RightPanel'
import Sidebar from '../../../src/renderer/src/components/Sidebar/Sidebar'
import InteractiveRebase from '../../../src/renderer/src/components/InteractiveRebase/InteractiveRebase'
import StagingEditor from '../../../src/renderer/src/components/StagingEditor/StagingEditor'
import RebaseProgress from '../../../src/renderer/src/components/RebaseProgress/RebaseProgress'
import RebaseTodoApp from './RebaseTodoApp'
import ConflictResolver from '../../../src/renderer/src/components/ConflictResolver/ConflictResolver'
import FileHistory from '../../../src/renderer/src/components/FileHistory/FileHistory'
import CompareView from '../../../src/renderer/src/components/CompareView/CompareView'
import CompareWorkingView from './CompareWorkingView'
import GitHubPanel from '../../../src/renderer/src/components/GitHubPanel/GitHubPanel'
import CommitMsgEditorView from './CommitMsgEditorView'
import type { CommitNode, BranchInfo } from '../../../src/renderer/src/types'

import 'highlight.js/styles/github-dark.css'
import '../../../src/renderer/src/App.css'
import './vertex-vscode.css'

declare global { interface Window { gitAPI: any; appInfo: any } }

function VertexApp() {
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
  const [conflictMode, setConflictMode] = useState<'merge' | 'rebase' | 'cherry-pick' | 'revert' | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMatches, setSearchMatches] = useState(-1)
  const [rightW, setRightW] = useState(380)
  const [showAllBranches, setShowAllBranches] = useState(true)
  const [stashCount, setStashCount] = useState(0)
  const [stashes, setStashes] = useState<{ index: number; message: string }[]>([])
  const [tags, setTags] = useState<{ name: string; hash: string }[]>([])
  const [soloBranch, setSoloBranch] = useState<string | null>(null)
  const [mutedBranches, setMutedBranches] = useState<Set<string>>(new Set())
  // Closed by default so the first thing a new user sees is the commit graph,
  // not the branches list. The user's toggle choice is persisted host-side.
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const [tracking, setTracking] = useState<{ ahead: number; behind: number }>({ ahead: 0, behind: 0 })
  const isLoadingRef = useRef(false)
  const showAllRef = useRef(showAllBranches)
  showAllRef.current = showAllBranches
  const soloRef = useRef(soloBranch); soloRef.current = soloBranch
  const mutedRef = useRef(mutedBranches); mutedRef.current = mutedBranches

  // ── Data loading (mirrors desktop App.loadRepoData) ──────────
  // `silent` reloads (from file watchers) skip the loading flag so the toolbar
  // icons don't flicker on every background refresh.
  const loadRepoData = useCallback(async (silent = false) => {
    if (isLoadingRef.current) return
    isLoadingRef.current = true
    if (!silent) setLoading(true)
    try {
      const branchRes = await window.gitAPI.getBranches()
      // Solo (show one branch) / mute (hide some) drive an explicit refs list,
      // which takes precedence over --all in getLog.
      const refForGit = (n: string) => n.replace(/^remotes\//, '')
      let logOpts: { maxCount: number; all?: boolean; refs?: string[] } = { maxCount: 500, all: showAllRef.current }
      if (soloRef.current) {
        logOpts = { maxCount: 500, refs: [refForGit(soloRef.current)] }
      } else if (mutedRef.current.size > 0 && branchRes?.branches) {
        const visible = branchRes.branches
          .filter((b: BranchInfo) => !mutedRef.current.has(b.name))
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
    } finally {
      isLoadingRef.current = false
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => { loadRepoData() }, [loadRepoData])

  // Restore the persisted sidebar preference (host Memento via settingsGetAll)
  useEffect(() => {
    window.gitAPI.settingsGetAll()
      .then((s: Record<string, string>) => { if (s?.sidebarOpen === '1') setSidebarOpen(true) })
      .catch(() => { /* first run: keep default (closed) */ })
  }, [])

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen(o => {
      const next = !o
      void window.gitAPI.settingsSet('sidebarOpen', next ? '1' : '0')
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
    if (r && r.success === false) toast.error(r.error ?? "Impossible d'annuler")
    else toast.success('✓ Annulé')
    await loadRepoData()
  }, [toast, loadRepoData])

  // `undoable` adds an "Annuler" button on the success toast (history rewrites)
  const runOp = useCallback(async (label: string, op: () => Promise<{ success?: boolean; error?: string }>, undoable = false) => {
    const r = await op()
    if (r && r.success === false) showToast(r.error ?? `${label} a échoué`, 'err')
    else if (undoable) toast.success(`✓ ${label}`, { label: 'Annuler', onClick: () => { void doUndo() } })
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
      `⚠ Un conflit est prévu sur ${files.length} fichier(s). Continuer ?`,
      [
        { label: 'Continuer', onClick: () => { void op() } },
        { label: 'Ne plus me le demander', onClick: () => {
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
    const name = await window.gitAPI.uiPrompt('Nom du tag')
    if (name) runOp('Tag créé', () => window.gitAPI.createTag(name, hash))
  }, [runOp])

  const handleCreateBranchAt = useCallback(async (hash: string) => {
    const name = await window.gitAPI.uiPrompt('Nom de la nouvelle branche')
    if (name) runOp('Branche créée', () => window.gitAPI.createBranchAt(name, hash, true))
  }, [runOp])

  // History-rewriting ops — drop / reorder a commit and drag a branch onto a commit.
  const handleDropCommit = useCallback(async (hash: string) => {
    const ok = await window.gitAPI.uiConfirm(`Supprimer le commit ${hash.slice(0, 7)} ? Cette action réécrit l'historique.`)
    if (!ok) return
    setSelectedCommit(null)
    await runOp('Commit supprimé', () => window.gitAPI.dropCommit(hash), true)
  }, [runOp])

  const handleMoveCommit = useCallback((hash: string, direction: 'up' | 'down') =>
    runOp('Commit déplacé', () => window.gitAPI.moveCommit(hash, direction), true), [runOp])

  // ── Branch / tag context-menu operations ─────────────────────
  const handleMergeBranch = useCallback((name: string) => guardConflict(
    () => window.gitAPI.predictConflicts(name),
    () => runOp(`Merge ${name}`, () => window.gitAPI.merge(name), true),
  ), [runOp, guardConflict])
  const handleRebaseCurrentOnto = useCallback((name: string) => guardConflict(
    () => window.gitAPI.predictRebaseConflicts(name),   // accurate per-commit replay
    () => runOp(`Rebase sur ${name}`, () => window.gitAPI.rebaseOnto(name), true),
  ), [runOp, guardConflict])

  // Reword works on any commit: HEAD is a plain amend; any other commit goes
  // through a targeted mini-rebase (pick everything, reword just that one),
  // reusing the same interactiveRebase(sequence, messages) infra the
  // interactive-rebase planner uses for squash/reword messages.
  const handleRewordCommit = useCallback(async (hash: string) => {
    const current = commits.find(c => c.hash === hash)
    if (!current) return
    const isHead = current.refs.some(r => r.includes('HEAD ->') && r.includes(currentBranch))

    if (isHead) {
      const fullMsg = (await window.gitAPI.getLastCommitMessage()).message || current.message
      const newMsg = await window.gitAPI.uiPrompt('Nouveau message de commit', fullMsg)
      if (!newMsg || newMsg === fullMsg) return
      await runOp('Message modifié', () => window.gitAPI.amendMessage(newMsg))
      return
    }
    if (current.parents.length === 0) {
      showToast('Impossible de reformuler le tout premier commit du dépôt (utilisez amend depuis HEAD).', 'err')
      return
    }
    const newMsg = await window.gitAPI.uiPrompt('Nouveau message de commit', current.message)
    if (!newMsg || newMsg === current.message) return
    const seq = await window.gitAPI.getRebaseSequence(current.parents[0])
    const sequence = seq.commits.map((c: { hash: string }) => ({ action: c.hash === current.hash ? 'reword' : 'pick', hash: c.hash }))
    await runOp('Message modifié', () => window.gitAPI.interactiveRebase(sequence, [newMsg]))
  }, [runOp, commits, currentBranch, showToast])

  const handleRebaseCurrentOntoCommit = useCallback((hash: string) => guardConflict(
    () => window.gitAPI.predictRebaseConflicts(hash),   // accurate per-commit replay
    () => runOp(`Rebase sur ${hash.slice(0, 7)}`, () => window.gitAPI.rebaseOnto(hash), true),
  ), [runOp, guardConflict])

  const handlePushToCommit = useCallback((hash: string) =>
    runOp(`Push jusqu'à ${hash.slice(0, 7)}`, () => window.gitAPI.pushToCommit(hash)), [runOp])

  const handleCreatePatch = useCallback(async (hash: string) => {
    const res = await window.gitAPI.createPatch(hash)
    if (res.error) { showToast(res.error, 'err'); return }
    const r = await window.gitAPI.savePatchFile(res.patch, `${hash.slice(0, 7)}.patch`)
    if (r.success) showToast('✓ Patch enregistré')
    else if (!r.canceled) showToast(r.error ?? 'Échec', 'err')
  }, [showToast])

  const handleCopyPatch = useCallback(async (hash: string) => {
    const res = await window.gitAPI.createPatch(hash)
    if (res.error) { showToast(res.error, 'err'); return }
    navigator.clipboard.writeText(res.patch)
    showToast('✓ Patch copié dans le presse-papiers')
  }, [showToast])

  const handleCreateWorktreeAt = useCallback(async (hash: string) => {
    // The host's selectDirectory returns the fsPath string directly (or null).
    const dirPath: string | null = await window.gitAPI.selectDirectory('Emplacement du nouveau worktree')
    if (!dirPath) return
    const branch = await window.gitAPI.uiPrompt('Nom de la nouvelle branche (laisser vide = detached)', '')
    if (branch === null || branch === undefined) return
    const r = await window.gitAPI.addWorktree(dirPath, hash, branch || undefined)
    if (r.success) showToast('✓ Worktree créé')
    else showToast(r.error ?? 'Échec', 'err')
  }, [showToast])

  const handleOpenCommitOnRemote = useCallback(async (hash: string) => {
    const detected = await window.gitAPI.githubDetectRepo()
    if (!detected?.owner) { showToast('Aucun dépôt GitHub détecté', 'err'); return }
    window.gitAPI.openExternal(`https://github.com/${detected.owner}/${detected.repo}/commit/${hash}`)
  }, [showToast])

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
        case 'selectForCompare': setCompareBaseHash(hash); showToast('◎ Commit sélectionné pour comparaison'); break
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
    const newName = await window.gitAPI.uiPrompt('Nouveau nom de branche', name)
    if (newName && newName !== name) runOp('Branche renommée', () => window.gitAPI.renameBranch(name, newName))
  }, [runOp])
  const handleDeleteBranch = useCallback(async (name: string) => {
    if (await window.gitAPI.uiConfirm(`Supprimer la branche "${name}" ?`)) {
      runOp('Branche supprimée', () => window.gitAPI.deleteBranch(name))
    }
  }, [runOp])
  const handlePushBranch = useCallback((name: string) =>
    runOp(`Push ${name}`, () => window.gitAPI.pushBranch(name)), [runOp])
  const handleSetUpstream = useCallback((name: string) =>
    runOp('Upstream défini', () => window.gitAPI.setUpstream(name)), [runOp])
  const handleDeleteRemoteBranch = useCallback(async (ref: string) => {
    if (await window.gitAPI.uiConfirm(`Supprimer la branche distante "${ref}" ?`)) {
      runOp('Branche distante supprimée', () => window.gitAPI.deleteRemoteBranch(ref))
    }
  }, [runOp])
  const handlePushTag = useCallback((name: string) =>
    runOp(`Tag ${name} poussé`, () => window.gitAPI.pushTag(name)), [runOp])
  const handleDeleteTag = useCallback(async (name: string) => {
    if (await window.gitAPI.uiConfirm(`Supprimer le tag "${name}" ?`)) {
      runOp('Tag supprimé', () => window.gitAPI.deleteTag(name))
    }
  }, [runOp])
  const handleDeleteRemoteTag = useCallback(async (name: string) => {
    if (await window.gitAPI.uiConfirm(`Supprimer le tag distant "${name}" ?`)) {
      runOp('Tag distant supprimé', () => window.gitAPI.deleteRemoteTag(name))
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
    runOp('Stash appliqué', () => window.gitAPI.applyStash(index)), [runOp])
  const handlePopStashIndex = useCallback((index: number) =>
    runOp('Stash dépilé', () => window.gitAPI.popStash(index)), [runOp])
  const handleDropStash = useCallback(async (index: number) => {
    if (await window.gitAPI.uiConfirm(`Supprimer le stash @{${index}} ?`)) {
      runOp('Stash supprimé', () => window.gitAPI.dropStash(index))
    }
  }, [runOp])
  const handleCreateTagPrompt = useCallback(async () => {
    const name = await window.gitAPI.uiPrompt('Nom du tag (sur HEAD)')
    if (name) runOp('Tag créé', () => window.gitAPI.createTag(name))
  }, [runOp])
  const handleSelectCommitByHash = useCallback((hash: string) => {
    const found = commits.find(c => c.hash === hash || c.hash.startsWith(hash))
    if (found) setSelectedCommit(found)
  }, [commits])
  const handleToggleSolo = useCallback((name: string) => {
    setSoloBranch(prev => { const next = prev === name ? null : name; soloRef.current = next; return next })
    setTimeout(() => loadRepoData(), 0)
  }, [loadRepoData])
  const handleToggleMute = useCallback((name: string) => {
    setMutedBranches(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      mutedRef.current = next
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
      const ok = await window.gitAPI.uiConfirm(`Réinitialiser ${branch} sur ${targetBranch ?? hash.slice(0, 7)} ?`)
      if (!ok) return
    }
    const op = action === 'reset'
      ? () => window.gitAPI.moveBranchTo(branch, hash)
      : action === 'rebase'
        ? () => window.gitAPI.rebaseBranchOnto(branch, hash)              // rebase A onto B's tip
        : () => window.gitAPI.mergeCommitInto(targetBranch!, branch)      // checkout B, merge A (merge A into B)
    const run = () => runOp(action === 'reset' ? 'Branche réinitialisée' : action === 'rebase' ? 'Rebase effectué' : 'Merge effectué', op, true)
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
    if (r && r.success === false) showToast(r.error ?? 'Échec', 'err')
    else showToast(mode === 'rebase' ? '✓ Rebase continué' : '✓ Conflits résolus')
    await loadRepoData()
  }, [conflictMode, showToast, loadRepoData])

  const handleConflictAbort = useCallback(async () => {
    if (conflictMode === 'merge') await window.gitAPI.abortMerge()
    else if (conflictMode === 'cherry-pick') await window.gitAPI.abortCherryPick()
    else if (conflictMode === 'revert') await window.gitAPI.abortRevert()
    else await window.gitAPI.abortRebase()
    showToast('Opération abandonnée')
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
  const handleUndo = useCallback(() => runOp('Annulé', () => window.gitAPI.undoLastAction()), [runOp])
  const handleRedo = useCallback(() => runOp('Rétabli', () => window.gitAPI.redoLastAction()), [runOp])
  const handleStash = useCallback(() => runOp('Stash créé', () => window.gitAPI.createStash()), [runOp])
  const handlePop = useCallback(() => runOp('Stash appliqué', () => window.gitAPI.popStash(0)), [runOp])
  const handleTerminal = useCallback(() => window.gitAPI.openTerminal(), [])
  const handleNewBranch = useCallback(async () => {
    const name = await window.gitAPI.uiPrompt('Nom de la nouvelle branche')
    if (name) runOp('Branche créée', () => window.gitAPI.createBranch(name))
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
      const w = Math.max(320, Math.min(720, startW + (startX - ev.clientX)))
      setRightW(w)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [rightW])

  // Stacked mode — below this width the right panel replaces the graph
  // entirely instead of squeezing it (typical narrow VS Code side panels).
  const [viewportW, setViewportW] = useState(window.innerWidth)
  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const stacked = viewportW < 640

  // Measure the body (graph + right panel) height — it equals the right panel's
  // own height, so the widening decision below aligns exactly with RightPanel's
  // compact threshold (no toolbar-offset guesswork, no widened-but-classic band).
  const appBodyRef = useRef<HTMLDivElement>(null)
  const [bodyH, setBodyH] = useState(0)
  useEffect(() => {
    const el = appBodyRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => setBodyH(entries[0].contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Short + wide panel (docked under a terminal): the staging UX needs width
  // more than the graph does, so widen the right panel — the graph drops its
  // Author/Date/SHA columns on its own, and the right panel can lay out
  // files | commit-form side by side. Transient: the user's saved rightW is
  // restored as soon as the panel is tall again. The < 300 here is the same
  // threshold RightPanel uses to switch to its compact layout.
  const shortPanel = bodyH > 0 && bodyH < 300 && !stacked
  const effRightW = shortPanel
    ? Math.min(Math.max(rightW, 700), viewportW - 340)
    : rightW

  const showRight = !!selectedCommit || !!conflictMode

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
        sidebarOpen={sidebarOpen}
        onToggleSidebar={handleToggleSidebar}
        onSettings={() => setSettingsOpen(true)}
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
            <strong>{conflictMode}</strong> en cours
            {conflictFiles.length > 0
              ? ` — ${conflictFiles.length} fichier${conflictFiles.length > 1 ? 's' : ''} à résoudre`
              : ' — aucun conflit à résoudre, prêt à continuer'}
          </span>
          <span className="gv-cb-spring" />
          <button
            className="gv-cb-btn gv-cb-continue"
            disabled={conflictFiles.length > 0}
            title={conflictFiles.length > 0 ? 'Résolvez et indexez tous les fichiers d\'abord' : 'Continuer l\'opération'}
            onClick={() => handleConflictFinish(conflictMode === 'merge' ? 'merge' : 'rebase')}
          >
            Continuer
          </button>
          <button className="gv-cb-btn gv-cb-abort" onClick={handleConflictAbort}>
            Abandonner
          </button>
        </div>
      )}
      <div className="app-body" ref={appBodyRef}>
        {sidebarOpen && !stacked && (
          <Sidebar
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
            mutedBranches={mutedBranches}
            onToggleSolo={handleToggleSolo}
            onToggleMute={handleToggleMute}
            showToast={showToast}
            showPrompt={showPrompt}
            showConfirm={showConfirm}
            embedded
          />
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
            onCheckoutBranch={handleCheckout}
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
            onCompareWorking={(hash) => window.gitAPI.openCompareWorkingTab(hash)}
            compareBaseHash={compareBaseHash}
            onSelectForCompare={(hash) => { setCompareBaseHash(hash); showToast('◎ Commit sélectionné pour comparaison') }}
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
            {!stacked && !shortPanel && <div className="resize-handle" onMouseDown={startResizeRight} />}
            <div className={stacked ? 'app-right gv-right-stacked' : 'app-right'} style={stacked ? undefined : { width: effRightW }}>
              {stacked && !conflictMode && (
                <div className="gv-stacked-bar">
                  <button className="gv-stacked-back" onClick={() => setSelectedCommit(null)}>
                    ← Graphe
                  </button>
                  {selectedCommit && selectedCommit.hash !== '__WIP__' && (
                    <span className="gv-stacked-title">{selectedCommit.shortHash} — {selectedCommit.message}</span>
                  )}
                </div>
              )}
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
                onOpenResolver={handleOpenResolver}
                onOpenFileDiff={handleOpenFileDiff}
                onOpenStagingEditor={(f) => window.gitAPI.openStagingEditor(f)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// A focused tool (e.g. the staging editor) can be booted into the same bundle
// via window.__GV_BOOT__, injected by the host's HTML.
const boot = (window as any).__GV_BOOT__ as
  {
    mode?: string; file?: string; refA?: string; refB?: string; baseHash?: string; hash?: string
    initialMessage?: string; action?: string; subject?: string; stepCurrent?: number; stepTotal?: number
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

ReactDOM.createRoot(document.getElementById('root')!).render(
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
                          : <VertexApp />}
      </ToastProvider>
    </LanguageProvider>
  </SettingsProvider>
)
