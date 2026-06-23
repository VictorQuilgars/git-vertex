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
import CommitGraph from '../../../src/renderer/src/components/CommitGraph/CommitGraph'
import RightPanel from '../../../src/renderer/src/components/RightPanel/RightPanel'
import InteractiveRebase from '../../../src/renderer/src/components/InteractiveRebase/InteractiveRebase'
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
  const [loading, setLoading] = useState(false)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const [rebaseHash, setRebaseHash] = useState<string | null>(null)
  const isLoadingRef = useRef(false)
  const showAllRef = useRef(showAllBranches)
  showAllRef.current = showAllBranches

  // ── Data loading (mirrors desktop App.loadRepoData) ──────────
  // `silent` reloads (from file watchers) skip the loading flag so the toolbar
  // icons don't flicker on every background refresh.
  const loadRepoData = useCallback(async (silent = false) => {
    if (isLoadingRef.current) return
    isLoadingRef.current = true
    if (!silent) setLoading(true)
    try {
      const branchRes = await window.gitAPI.getBranches()
      const logRes = await window.gitAPI.getLog({ maxCount: 500, all: showAllRef.current })
      if (logRes?.commits) setCommits(logRes.commits)
      if (branchRes?.branches) {
        setBranches(branchRes.branches)
        const cur = branchRes.branches.find((b: BranchInfo) => b.current)
        if (cur) setCurrentBranch(cur.name)
      }
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
        setStashCount(st?.stashes?.length ?? 0)
      } catch { /* ignore */ }
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

  const handleCheckout = useCallback((ref: string) => runOp('Checkout', () => window.gitAPI.checkout(ref)), [runOp])
  const handleCherryPick = useCallback((hash: string) => runOp('Cherry-pick', () => window.gitAPI.cherryPick(hash)), [runOp])
  const handleRevert = useCallback((hash: string) => runOp('Revert', () => window.gitAPI.revert(hash)), [runOp])
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
  const handleMergeBranch = useCallback((name: string) =>
    runOp(`Merge ${name}`, () => window.gitAPI.merge(name), true), [runOp])
  const handleRebaseCurrentOnto = useCallback((name: string) =>
    runOp(`Rebase sur ${name}`, () => window.gitAPI.rebaseOnto(name), true), [runOp])
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

  const handleBranchDrop = useCallback(async (branch: string, hash: string, action: 'reset' | 'rebase' | 'merge') => {
    if (action === 'reset') {
      const ok = await window.gitAPI.uiConfirm(`Réinitialiser ${branch} sur ${hash.slice(0, 7)} ?`)
      if (!ok) return
    }
    const op = action === 'reset'
      ? () => window.gitAPI.moveBranchTo(branch, hash)
      : action === 'rebase'
        ? () => window.gitAPI.rebaseBranchOnto(branch, hash)
        : () => window.gitAPI.mergeCommitInto(branch, hash)
    await runOp(action === 'reset' ? 'Branche réinitialisée' : action === 'rebase' ? 'Rebase effectué' : 'Merge effectué', op, true)
  }, [runOp])

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

  // Open a conflicted file / a file diff in a NATIVE VS Code editor tab.
  const handleOpenResolver = useCallback((file: string) => { window.gitAPI.openConflict(file) }, [])
  const handleOpenFileDiff = useCallback((target: any) => { window.gitAPI.openDiff(target) }, [])

  // ── Toolbar handlers (push / fetch / pull / branch / stash …) ─
  const handleFetch = useCallback(async () => {
    await runOp('Fetch', () => window.gitAPI.fetch())
    setLastFetch(new Date())
  }, [runOp])
  const handleOpenDesktop = useCallback(() => window.gitAPI.openDesktop(), [])
  const handlePull = useCallback(() => runOp('Pull', () => window.gitAPI.pull()), [runOp])
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
      />
      {conflictMode && (
        <div className="gv-conflict-banner">
          <span className="gv-cb-icon">⚠️</span>
          <span className="gv-cb-text">
            <strong>{conflictMode}</strong> en cours
            {conflictFiles.length > 0
              ? ` — ${conflictFiles.length} fichier${conflictFiles.length > 1 ? 's' : ''} en conflit`
              : ' — conflits résolus, prêt à continuer'}
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
      <div className="app-body">
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
            onEditMessage={(hash) => {
              const found = commits.find(c => c.hash === hash)
              if (found) setSelectedCommit(found)
            }}
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
            onInteractiveRebase={(hash) => setRebaseHash(hash)}
            wipCount={wipCount}
            conflictMode={conflictMode}
            loading={loading}
            onSearchMatches={setSearchMatches}
          />
        </div>

        {showRight && (
          <>
            {!stacked && <div className="resize-handle" onMouseDown={startResizeRight} />}
            <div className={stacked ? 'app-right gv-right-stacked' : 'app-right'} style={stacked ? undefined : { width: rightW }}>
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
              />
            </div>
          </>
        )}
      </div>

      {rebaseHash && (
        <InteractiveRebase
          baseHash={rebaseHash}
          onClose={() => setRebaseHash(null)}
          onSuccess={loadRepoData}
          showToast={showToast}
        />
      )}
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <SettingsProvider>
    <LanguageProvider>
      <ToastProvider>
        <VertexApp />
      </ToastProvider>
    </LanguageProvider>
  </SettingsProvider>
)
