import React, { useState, useEffect, useCallback, useRef } from 'react'
import { CommitNode, BranchInfo } from './types'
import Toolbar from './components/Toolbar/Toolbar'
import Sidebar from './components/Sidebar/Sidebar'
import CommitGraph from './components/CommitGraph/CommitGraph'
import RightPanel from './components/RightPanel/RightPanel'
import { PromptDialog, ConfirmDialog } from './components/Dialog/Dialog'
import CommandPalette, { PaletteCommand } from './components/CommandPalette/CommandPalette'
import { ToastProvider, useToast } from './components/Toast/Toast'
import InteractiveRebase from './components/InteractiveRebase/InteractiveRebase'
import ConflictResolver from './components/ConflictResolver/ConflictResolver'
import PushModal from './components/PushModal/PushModal'
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

// ── Imperative dialog helpers ──────────────────────────────────
type DialogState =
  | { kind: 'prompt';  message: string; defaultValue?: string; resolve: (v: string | null) => void }
  | { kind: 'confirm'; message: string; danger?: boolean;      resolve: (v: boolean) => void }

export default function App() {
  // ── Dialog state ───────────────────────────────────────────
  const [dlg, setDlg] = useState<DialogState | null>(null)

  const showPrompt = useCallback((message: string, defaultValue = ''): Promise<string | null> =>
    new Promise(resolve => setDlg({ kind: 'prompt', message, defaultValue, resolve }))
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
  const [showAllBranches, setShowAllBranches] = useState<boolean>(true)
  const [extendedSearch, setExtendedSearch] = useState(false)
  const [extendedSearchHashes, setExtendedSearchHashes] = useState<Set<string>>(new Set())
  const [extendedSearchLoading, setExtendedSearchLoading] = useState(false)
  const [compareBranchModal, setCompareBranchModal] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [recentRepos, setRecentRepos] = useState<string[]>([])
  const [stashes, setStashes] = useState<StashEntry[]>([])
  const [tags, setTags] = useState<TagEntry[]>([])
  const [sidebarW, setSidebarW] = useState<number>(230)
  const [rightW, setRightW] = useState<number>(320)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null)
  const [rebaseHash, setRebaseHash] = useState<string | null>(null)
  const [pushModalOpen, setPushModalOpen] = useState(false)
  const [conflictFiles, setConflictFiles] = useState<string[]>([])
  const autoFetchEnabled = useRef(
    localStorage.getItem('autoFetch') !== 'false'
  )

  // ── Toast (via ToastProvider) ──────────────────────────────
  const toastApi = useToast()
  const showToast = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    if (type === 'ok') toastApi.success(msg)
    else toastApi.error(msg)
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
  const loadRepoData = useCallback(async () => {
    if (!repoPath) return
    setLoading(true)
    try {
      const [logRes, branchRes] = await Promise.all([
        window.gitAPI.getLog({ all: showAllBranches, maxCount: 500 }),
        window.gitAPI.getBranches()
      ])
      if (logRes.commits) setCommits(logRes.commits)
      if (branchRes.branches) {
        setBranches(branchRes.branches)
        const cur = branchRes.branches.find((b: BranchInfo) => b.current)
        if (cur) setCurrentBranch(cur.name)
      }
      await Promise.all([loadStashes(), loadTags()])
      // Check for conflicts
      const conflictRes = await window.gitAPI.getConflictedFiles()
      setConflictFiles(conflictRes.files ?? [])
    } finally {
      setLoading(false)
    }
  }, [repoPath, showAllBranches, loadStashes, loadTags])

  useEffect(() => { loadRepoData() }, [loadRepoData])

  // ── Load recent repos on mount ─────────────────────────────
  useEffect(() => {
    window.gitAPI.getRecentRepos().then(r => setRecentRepos(r ?? []))
  }, [])

  // ── Command Palette keybinding ─────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault()
        setPaletteOpen(o => !o)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
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
  const applyRepo = useCallback(async (res: { path?: string; name?: string; error?: string }) => {
    if (res.path) {
      setRepoPath(res.path)
      setRepoName(res.name ?? res.path.split('/').pop()!)
      setSelectedCommit(null)
      setCommits([])
      const updated = await window.gitAPI.getRecentRepos()
      setRecentRepos(updated ?? [])
    } else if (res.error && res.error !== 'cancelled') {
      showToast(`Erreur : ${res.error}`, 'err')
    }
  }, [showToast])

  const handleOpenRepo = async () => applyRepo(await window.gitAPI.openRepo())
  const handleSetRepo = async (path: string) => applyRepo(await window.gitAPI.setRepo(path))
  const handleRemoveRecent = async (path: string) => {
    const updated = await window.gitAPI.removeRecentRepo(path)
    setRecentRepos(updated ?? [])
  }

  // ── Git operations ─────────────────────────────────────────
  const handleFetch = async () => {
    setLoading(true)
    const r = await window.gitAPI.fetch()
    if (r.success) { showToast('Fetch réussi ✓'); await loadRepoData() }
    else showToast(`Fetch échoué : ${r.error}`, 'err')
    setLoading(false)
  }

  const handlePush = () => {
    if (repoPath) setPushModalOpen(true)
  }

  const handlePull = async () => {
    setLoading(true)
    const r = await window.gitAPI.pull()
    if (r.success) { showToast('Pull réussi ✓'); await loadRepoData() }
    else showToast(`Pull échoué : ${r.error}`, 'err')
    setLoading(false)
  }

  const handleCheckout = async (name: string) => {
    const r = await window.gitAPI.checkout(name)
    if (r.success) { showToast(`✓ Checkout "${name}"`); await loadRepoData() }
    else showToast(`Checkout échoué : ${r.error}`, 'err')
  }

  const handleCreateBranch = useCallback(async () => {
    const name = await showPrompt('Nom de la nouvelle branche :')
    if (!name) return
    try {
      const r = await window.gitAPI.createBranch(name)
      if (r.success) { showToast(`✓ Branche "${name}" créée`); await loadRepoData() }
      else showToast(`Erreur : ${r.error}`, 'err')
    } catch (e: any) {
      showToast(`Erreur inattendue : ${e?.message ?? e}`, 'err')
    }
  }, [showPrompt, showToast, loadRepoData])

  const handleDeleteBranch = async (name: string) => {
    const ok = await showConfirm(`Supprimer la branche "${name}" ?`, true)
    if (!ok) return
    const r = await window.gitAPI.deleteBranch(name)
    if (r.success) { showToast(`Branche "${name}" supprimée`); await loadRepoData() }
    else showToast(`Erreur : ${r.error}`, 'err')
  }

  const handleMergeBranch = async (name: string) => {
    const ok = await showConfirm(`Merger "${name}" dans "${currentBranch}" ?`)
    if (!ok) return
    setLoading(true)
    const r = await window.gitAPI.merge(name)
    if (r.success) { showToast(`✓ Merge de "${name}" réussi`); await loadRepoData() }
    else showToast(`Merge échoué : ${r.error}`, 'err')
    setLoading(false)
  }

  const handleRenameBranch = async (name: string) => {
    const newName = await showPrompt(`Renommer "${name}" en :`, name)
    if (!newName || newName === name) return
    const r = await window.gitAPI.renameBranch(name, newName)
    if (r.success) { showToast(`✓ Branche renommée en "${newName}"`); await loadRepoData() }
    else showToast(`Renommage échoué : ${r.error}`, 'err')
  }

  // ── Commit context menu operations ─────────────────────────
  const handleCreateBranchAt = async (hash: string) => {
    const name = await showPrompt('Nom de la nouvelle branche :')
    if (!name) return
    const checkout = await showConfirm(`Checkout sur "${name}" immédiatement ?`)
    try {
      const r = await window.gitAPI.createBranchAt(name, hash, checkout)
      if (r.success) {
        showToast(`✓ Branche "${name}" créée${checkout ? ' + checkout' : ''}`)
        await loadRepoData()
      } else {
        showToast(`Erreur : ${r.error}`, 'err')
      }
    } catch (e: any) {
      showToast(`Erreur inattendue : ${e?.message ?? e}`, 'err')
    }
  }

  const handleCherryPick = async (hash: string) => {
    setLoading(true)
    const r = await window.gitAPI.cherryPick(hash)
    if (r.success) { showToast(`✓ Cherry-pick ${hash.slice(0, 7)} appliqué`); await loadRepoData() }
    else showToast(`Cherry-pick échoué : ${r.error}`, 'err')
    setLoading(false)
  }

  const handleRevert = async (hash: string) => {
    setLoading(true)
    const r = await window.gitAPI.revert(hash)
    if (r.success) { showToast(`✓ Revert ${hash.slice(0, 7)} appliqué`); await loadRepoData() }
    else showToast(`Revert échoué : ${r.error}`, 'err')
    setLoading(false)
  }

  const handleReset = async (hash: string, mode: 'soft' | 'mixed' | 'hard') => {
    if (mode === 'hard') {
      const ok = await showConfirm(
        `Reset hard vers ${hash.slice(0, 7)} ?\nTous les changements non commités seront perdus.`,
        true
      )
      if (!ok) return
    }
    setLoading(true)
    const r = await window.gitAPI.reset(hash, mode)
    if (r.success) {
      showToast(`✓ Reset ${mode} vers ${hash.slice(0, 7)}`)
      setSelectedCommit(null)
      await loadRepoData()
    } else {
      showToast(`Reset échoué : ${r.error}`, 'err')
    }
    setLoading(false)
  }

  // ── Tag operations ─────────────────────────────────────────
  const handleCreateTagAtCommit = async (hash: string) => {
    const name = await showPrompt('Nom du tag :')
    if (!name) return
    const message = await showPrompt('Message du tag (laisser vide pour un tag léger) :')
    const r = await window.gitAPI.createTag(name, hash, message || undefined)
    if (r.success) { showToast(`✓ Tag "${name}" créé`); await loadRepoData() }
    else showToast(`Erreur : ${r.error}`, 'err')
  }

  const handleCreateTag = async () => {
    const name = await showPrompt('Nom du tag :')
    if (!name) return
    const message = await showPrompt('Message du tag (laisser vide pour un tag léger) :')
    const r = await window.gitAPI.createTag(name, undefined, message || undefined)
    if (r.success) { showToast(`✓ Tag "${name}" créé`); await loadRepoData() }
    else showToast(`Erreur : ${r.error}`, 'err')
  }

  const handleDeleteTag = async (name: string) => {
    const ok = await showConfirm(`Supprimer le tag "${name}" ?`, true)
    if (!ok) return
    const r = await window.gitAPI.deleteTag(name)
    if (r.success) { showToast(`Tag "${name}" supprimé`); await loadTags() }
    else showToast(`Erreur : ${r.error}`, 'err')
  }

  // ── Stash operations ───────────────────────────────────────
  const handleCreateStash = async () => {
    const message = await showPrompt('Message du stash (optionnel) :')
    if (message === null) return
    const r = await window.gitAPI.createStash(message || undefined)
    if (r.success) { showToast('✓ Stash créé'); await Promise.all([loadStashes(), loadRepoData()]) }
    else showToast(`Stash échoué : ${r.error}`, 'err')
  }

  const handleApplyStash = async (index: number) => {
    const r = await window.gitAPI.applyStash(index)
    if (r.success) { showToast(`✓ Stash #${index} appliqué (gardé)`); await loadRepoData() }
    else showToast(`Apply échoué : ${r.error}`, 'err')
  }

  const handlePopStash = async (index: number) => {
    const r = await window.gitAPI.popStash(index)
    if (r.success) {
      showToast(`✓ Stash #${index} appliqué et supprimé`)
      await Promise.all([loadStashes(), loadRepoData()])
    } else {
      showToast(`Pop échoué : ${r.error}`, 'err')
    }
  }

  const handleDropStash = async (index: number) => {
    const ok = await showConfirm(`Supprimer le stash #${index} ?`, true)
    if (!ok) return
    const r = await window.gitAPI.dropStash(index)
    if (r.success) { showToast(`Stash #${index} supprimé`); await loadStashes() }
    else showToast(`Drop échoué : ${r.error}`, 'err')
  }

  // ── Conflict resolution handlers ───────────────────────────
  const handleConflictFinish = async (action: 'rebase' | 'merge') => {
    setLoading(true)
    const r = action === 'rebase'
      ? await window.gitAPI.continueRebase()
      : await window.gitAPI.continueMerge()
    if (r.success) {
      showToast(`✓ ${action === 'rebase' ? 'Rebase' : 'Merge'} continué avec succès`)
      setConflictFiles([])
      await loadRepoData()
    } else {
      showToast(`Erreur : ${r.error}`, 'err')
    }
    setLoading(false)
  }

  const handleConflictAbort = async () => {
    await window.gitAPI.abortRebase()
    setConflictFiles([])
    await loadRepoData()
    showToast('Rebase abandonné')
  }

  // ── Command palette commands ───────────────────────────────
  const buildPaletteCommands = (): PaletteCommand[] => {
    const cmds: PaletteCommand[] = [
      { id: 'fetch', label: 'Fetch', icon: '⬇', action: handleFetch },
      { id: 'pull', label: 'Pull', icon: '⇩', action: handlePull },
      { id: 'push', label: 'Push', icon: '⬆', action: handlePush },
      { id: 'new-branch', label: 'Nouvelle branche', icon: '⎇', action: handleCreateBranch },
      { id: 'open-repo', label: 'Ouvrir un dépôt', icon: '📂', action: handleOpenRepo },
      { id: 'refresh', label: 'Rafraîchir', icon: '↺', action: loadRepoData },
    ]
    if (repoPath) {
      branches.filter(b => !b.remote && !b.current).forEach(b => {
        cmds.push({
          id: `checkout-${b.name}`,
          label: `Checkout ${b.name}`,
          icon: '✓',
          action: () => handleCheckout(b.name),
        })
      })
      branches.filter(b => !b.remote && !b.current).forEach(b => {
        cmds.push({
          id: `merge-${b.name}`,
          label: `Merger ${b.name}`,
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
          label: `Appliquer stash: ${s.message.replace(/^stash@\{\d+\}: /, '')}`,
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

  const startResizeRight = (e: React.MouseEvent) => {
    e.preventDefault()
    const sx = e.clientX, rw = rightW
    const move = (ev: MouseEvent) => setRightW(Math.max(240, Math.min(600, rw - (ev.clientX - sx))))
    const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up) }
    addEventListener('mousemove', move); addEventListener('mouseup', up)
  }

  return (
    <div className="app">
      <Toolbar
        repoPath={repoPath}
        currentBranch={currentBranch}
        searchQuery={searchQuery}
        showAllBranches={showAllBranches}
        onSearch={setSearchQuery}
        onFetch={handleFetch}
        onPush={handlePush}
        onPull={handlePull}
        onCreateBranch={handleCreateBranch}
        onToggleAllBranches={() => setShowAllBranches(v => !v)}
        onRefresh={loadRepoData}
        loading={loading}
        lastFetchTime={lastFetchTime}
        extendedSearch={extendedSearch}
        extendedSearchLoading={extendedSearchLoading}
        onToggleExtendedSearch={() => setExtendedSearch(v => !v)}
      />

      <div className="app-body">
        <div className="app-sidebar" style={{ width: sidebarW }}>
          <Sidebar
            repoPath={repoPath}
            repoName={repoName}
            currentBranch={currentBranch}
            branches={branches}
            recentRepos={recentRepos}
            stashes={stashes}
            tags={tags}
            onOpenRepo={handleOpenRepo}
            onSetRepo={handleSetRepo}
            onRemoveRecent={handleRemoveRecent}
            onCheckout={handleCheckout}
            onCreateBranch={handleCreateBranch}
            onDeleteBranch={handleDeleteBranch}
            onMergeBranch={handleMergeBranch}
            onRenameBranch={handleRenameBranch}
            onCreateStash={handleCreateStash}
            onApplyStash={handleApplyStash}
            onPopStash={handlePopStash}
            onDropStash={handleDropStash}
            onRefreshStashes={loadStashes}
            onCreateTag={handleCreateTag}
            onDeleteTag={handleDeleteTag}
            onSelectCommit={(hash) => {
              const found = commits.find(c => c.hash === hash || c.hash.startsWith(hash))
              if (found) setSelectedCommit(found)
            }}
            onCompareBranch={(name) => setCompareBranchModal(name)}
            showToast={showToast}
            showPrompt={showPrompt}
            showConfirm={showConfirm}
          />
        </div>

        <div className="resize-handle" onMouseDown={startResizeSidebar} />

        <div className="app-center">
          {!repoPath ? (
            <div className="app-welcome">
              <div className="welcome-card">
                <svg width="52" height="52" viewBox="0 0 16 16" fill="#3fb950">
                  <path d="M15.698 7.287 8.712.302a1.03 1.03 0 0 0-1.457 0l-1.45 1.45 1.84 1.84a1.223 1.223 0 0 1 1.55 1.56l1.773 1.774a1.224 1.224 0 0 1 1.267 2.025 1.226 1.226 0 0 1-2.002-1.334L8.58 5.963v4.353a1.226 1.226 0 1 1-1.008-.036V5.887a1.226 1.226 0 0 1-.666-1.608L5.093 2.465l-4.79 4.79a1.03 1.03 0 0 0 0 1.457l6.986 6.986a1.03 1.03 0 0 0 1.457 0l6.953-6.953a1.031 1.031 0 0 0-.001-1.458z"/>
                </svg>
                <h2>Git GUI</h2>
                <p>Ouvrez un dépôt Git depuis le panneau de gauche</p>
                <button className="btn-primary" onClick={handleOpenRepo}>Ouvrir un dépôt…</button>
              </div>
            </div>
          ) : (
            <CommitGraph
              commits={commits}
              selectedHash={selectedCommit?.hash ?? null}
              onSelectCommit={c => setSelectedCommit(c)}
              searchQuery={searchQuery}
              currentBranch={currentBranch}
              onCherryPick={handleCherryPick}
              onRevert={handleRevert}
              onReset={handleReset}
              onCreateTag={handleCreateTagAtCommit}
              onCreateBranchAt={handleCreateBranchAt}
              onCheckoutBranch={handleCheckout}
              onInteractiveRebase={(hash) => setRebaseHash(hash)}
            />
          )}
        </div>

        {repoPath && (
          <>
            <div className="resize-handle" onMouseDown={startResizeRight} />
            <div className="app-right" style={{ width: rightW }}>
              <RightPanel
                selectedCommit={selectedCommit}
                onCommitSuccess={loadRepoData}
                showToast={showToast}
                onSelectCommit={(hash) => {
                  const found = commits.find(c => c.hash === hash || c.hash.startsWith(hash))
                  if (found) setSelectedCommit(found)
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* Command Palette */}
      {paletteOpen && (
        <CommandPalette
          commands={buildPaletteCommands()}
          onClose={() => setPaletteOpen(false)}
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

      {/* Interactive Rebase */}
      {rebaseHash && (
        <InteractiveRebase
          baseHash={rebaseHash}
          onClose={() => setRebaseHash(null)}
          onSuccess={loadRepoData}
          showToast={showToast}
        />
      )}

      {/* Conflict Resolver */}
      {conflictFiles.length > 0 && (
        <ConflictResolver
          files={conflictFiles}
          onFinish={handleConflictFinish}
          onAbort={handleConflictAbort}
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

      {/* Custom dialogs (remplace window.prompt / window.confirm) */}
      {dlg?.kind === 'prompt' && (
        <PromptDialog
          message={dlg.message}
          defaultValue={dlg.defaultValue}
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
