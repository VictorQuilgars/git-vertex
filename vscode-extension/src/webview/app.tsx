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
import Toolbar from '../../../src/renderer/src/components/Toolbar/Toolbar'
import CommitGraph from '../../../src/renderer/src/components/CommitGraph/CommitGraph'
import RightPanel from '../../../src/renderer/src/components/RightPanel/RightPanel'
import type { CommitNode, BranchInfo } from '../../../src/renderer/src/types'

import 'highlight.js/styles/github-dark.css'
import '../../../src/renderer/src/App.css'
import './vertex-vscode.css'

declare global { interface Window { gitAPI: any; appInfo: any } }

// ── Brand header (so it's unmistakably Git Vertex) ─────────────
function BrandHeader({ branch, repoName }: { branch: string; repoName: string }) {
  return (
    <div className="gv-brand">
      <svg className="gv-brand-logo" viewBox="0 0 512 512" width="20" height="20" aria-hidden>
        <line x1="148" y1="82" x2="256" y2="422" stroke="#3fb950" strokeWidth="34" strokeLinecap="round" />
        <line x1="364" y1="82" x2="256" y2="422" stroke="#58a6ff" strokeWidth="34" strokeLinecap="round" />
        <circle cx="148" cy="82" r="30" fill="#0d1117" stroke="#3fb950" strokeWidth="18" />
        <circle cx="364" cy="82" r="30" fill="#0d1117" stroke="#58a6ff" strokeWidth="18" />
        <circle cx="256" cy="422" r="34" fill="#3fb950" />
        <circle cx="256" cy="422" r="16" fill="#0d1117" />
      </svg>
      <span className="gv-brand-name">Git Vertex</span>
      <span className="gv-brand-sep">·</span>
      <span className="gv-brand-repo">{repoName}</span>
      {branch && (
        <span className="gv-brand-branch">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z"/></svg>
          {branch}
        </span>
      )}
    </div>
  )
}

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
  const [rightW, setRightW] = useState(380)
  const [showAllBranches, setShowAllBranches] = useState(true)
  const [stashCount, setStashCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const isLoadingRef = useRef(false)
  const showAllRef = useRef(showAllBranches)
  showAllRef.current = showAllBranches

  // ── Data loading (mirrors desktop App.loadRepoData) ──────────
  const loadRepoData = useCallback(async () => {
    if (isLoadingRef.current) return
    isLoadingRef.current = true
    setLoading(true)
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
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRepoData() }, [loadRepoData])

  // Refresh on host broadcasts (.git or working-tree changes)
  useEffect(() => {
    const handler = () => loadRepoData()
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
  const runOp = useCallback(async (label: string, op: () => Promise<{ success?: boolean; error?: string }>) => {
    const r = await op()
    if (r && r.success === false) showToast(r.error ?? `${label} a échoué`, 'err')
    else showToast(`✓ ${label}`)
    await loadRepoData()
  }, [showToast, loadRepoData])

  const handleCheckout = useCallback((ref: string) => runOp('Checkout', () => window.gitAPI.checkout(ref)), [runOp])
  const handleCherryPick = useCallback((hash: string) => runOp('Cherry-pick', () => window.gitAPI.cherryPick(hash)), [runOp])
  const handleRevert = useCallback((hash: string) => runOp('Revert', () => window.gitAPI.revert(hash)), [runOp])
  const handleReset = useCallback((hash: string, mode: 'soft' | 'mixed' | 'hard') => runOp(`Reset --${mode}`, () => window.gitAPI.reset(hash, mode)), [runOp])

  const handleCreateTag = useCallback(async (hash: string) => {
    const name = await window.gitAPI.uiPrompt('Nom du tag')
    if (name) runOp('Tag créé', () => window.gitAPI.createTag(name, hash))
  }, [runOp])

  const handleCreateBranchAt = useCallback(async (hash: string) => {
    const name = await window.gitAPI.uiPrompt('Nom de la nouvelle branche')
    if (name) runOp('Branche créée', () => window.gitAPI.createBranchAt(name, hash, true))
  }, [runOp])

  // ── Toolbar handlers (push / fetch / pull / branch / stash …) ─
  const handleFetch = useCallback(() => runOp('Fetch', () => window.gitAPI.fetch()), [runOp])
  const handlePull = useCallback(() => runOp('Pull', () => window.gitAPI.pull()), [runOp])
  const handlePush = useCallback(() => runOp('Push', () => window.gitAPI.push()), [runOp])
  const handleUndo = useCallback(() => runOp('Annulé', () => window.gitAPI.undoLastAction()), [runOp])
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

  const showRight = !!selectedCommit || !!conflictMode

  return (
    <div className="app gv-app">
      <BrandHeader branch={currentBranch} repoName={repoName} />
      <Toolbar
        repoPath="webview"
        currentBranch={currentBranch}
        searchQuery={searchQuery}
        showAllBranches={showAllBranches}
        onSearch={setSearchQuery}
        onUndo={handleUndo}
        onFetch={handleFetch}
        onPush={handlePush}
        onPushModal={handlePush}
        onPull={handlePull}
        onCreateBranch={handleNewBranch}
        onStash={handleStash}
        onPop={handlePop}
        onTerminal={handleTerminal}
        stashCount={stashCount}
        onToggleAllBranches={handleToggleAllBranches}
        onRefresh={loadRepoData}
        loading={loading}
        topRow={false}
      />
      <div className="app-body">
        <div className="app-center" style={{ flex: 1, display: 'flex', minWidth: 0, overflow: 'hidden' }}>
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
            wipCount={wipCount}
            conflictMode={conflictMode}
          />
        </div>

        {showRight && (
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
                onConflictFinish={() => loadRepoData()}
                onConflictAbort={() => loadRepoData()}
                onOpenResolver={() => {}}
                onOpenFileDiff={() => {}}
              />
            </div>
          </>
        )}
      </div>
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
