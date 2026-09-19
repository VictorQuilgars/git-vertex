// The search field over the graph, the extended search over the whole history, the AI search, and the command palette.
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { PaletteCommand } from '../components/CommandPalette/CommandPalette'
import { logOptionsFor } from '../utils/graphVisibility'
import { planReach, type ReachPlan } from './search-reach'
import { useSearchOperators } from './useSearchOperators'
import type { AppChrome } from './useAppChrome'
import type { RepoSession } from './useRepoSession'
import type { AppGithub } from './useAppGithub'
import type { AppConflicts } from './useAppConflicts'
import type { AppAi } from './useAppAi'
import type { AppTabs } from './useAppTabs'
import type { AppUpdates } from './useAppUpdates'
import type { AppActions } from './useAppActions'

export function useAppSearch(app: AppChrome & RepoSession & AppGithub & AppConflicts & AppAi & AppTabs & AppUpdates & AppActions) {
  const { t, showToast, repoPath, commits, branches, setSelectedCommit, notedHashes, stashes, tags, loadRepoData, aiSearchHashes, setAiSearchHashes, setAiSearchLoading, handleOpenRepo, handleFetch, handlePush, handlePull, handleCheckout, handleCreateBranch, handleMergeBranch, handleApplyStash, logLimitRef, growHistory, showAllRef, soloRef, visibilityRef, setDeepLinkHash } = app

  const [searchQuery, setSearchQuery] = useState<string>('')
  const [searchMatches, setSearchMatches] = useState(-1)
  const [extendedSearch, setExtendedSearch] = useState(false)
  const [extendedSearchHashes, setExtendedSearchHashes] = useState<Set<string>>(new Set())
  const [extendedSearchLoading, setExtendedSearchLoading] = useState(false)
  const [repoSearch, setRepoSearch] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  // The query's operators (#255): `file:` is git's to answer, and the searches
  // below are given the words of the query, not its operators.
  const searchOps = useSearchOperators(searchQuery, repoPath)
  const freeText = searchOps.freeText
  // ── Extended search ────────────────────────────────────────
  // The hits come from the whole history and the graph holds a page of it. A
  // hit beyond the page used to be a row the graph did not have — a search
  // that looked like it found nothing. The hit is located instead, at its row
  // in the log the graph loads (same refs, same order), the page grown to show
  // every hit within reach, the nearest selected; what is further, or on a ref
  // the graph does not show, is said rather than missing.
  const commitsRef = useRef(commits)
  commitsRef.current = commits
  useEffect(() => {
    if (!extendedSearch || !freeText.trim() || !repoPath) {
      setExtendedSearchHashes(new Set())
      return
    }
    let stale = false
    setExtendedSearchLoading(true)
    const timeout = setTimeout(async () => {
      try {
        const r = await window.gitAPI.searchInDiffs(freeText.trim())
        if (stale) return
        const hits = r.hashes ?? []
        setExtendedSearchHashes(new Set(hits))
        const loaded = new Set(commitsRef.current.map(c => c.hash))
        const missing = hits.filter(h => !loaded.has(h))
        if (!missing.length) return
        const { all, refs, excludes } = logOptionsFor({ maxCount: 0, all: showAllRef.current, solo: soloRef.current, visibility: visibilityRef.current })
        const { positions } = await window.gitAPI.locateInHistory(missing, { all, refs, excludes })
        if (stale) return
        const plan = planReach(hits, loaded, positions, logLimitRef.current)
        if (plan.loadTo) growHistory(plan.loadTo)
        // Selected once its row is in — the same wait a deep link makes.
        if (plan.select) setDeepLinkHash(plan.select)
        const said = reachMessage(t, plan)
        if (said) showToast(said, 'info')
      } catch {
        // A search that fails is an empty one; the field's count says so.
      } finally {
        if (!stale) setExtendedSearchLoading(false)
      }
    }, 500)
    return () => { stale = true; clearTimeout(timeout) }
  }, [extendedSearch, freeText, repoPath])
  // ── A reference named from the graph: `/`, `t`, `u` ────────
  // Its tip is selected when the page holds it; when it does not, the page is
  // grown to reach it the way a search hit is reached, up to the same limit —
  // past which its position is said instead.
  const revealRef = useCallback(async (ref: string) => {
    if (!repoPath) return
    try {
      const { hash } = await window.gitAPI.resolveCommit(ref)
      if (!hash) { showToast(t('ext.app.revealNotFound', ref), 'err'); return }
      const shown = commitsRef.current.find(c => c.hash === hash)
      if (shown) { setSelectedCommit(shown); return }
      const { all, refs, excludes } = logOptionsFor({ maxCount: 0, all: showAllRef.current, solo: soloRef.current, visibility: visibilityRef.current })
      const { positions } = await window.gitAPI.locateInHistory([hash], { all, refs, excludes })
      const plan = planReach([hash], new Set(commitsRef.current.map(c => c.hash)), positions, logLimitRef.current)
      if (plan.loadTo) {
        growHistory(plan.loadTo)
        // Selected once its row is in — the same wait a deep link makes.
        setDeepLinkHash(hash)
        return
      }
      showToast(plan.beyond.length
        ? t('ext.app.revealBeyond', plan.beyond[0].position.toLocaleString('en-US'))
        : t('ext.app.revealUnreached', ref), 'info')
    } catch {
      showToast(t('ext.app.revealNotFound', ref), 'err')
    }
  }, [repoPath, showToast, t, setSelectedCommit, growHistory, setDeepLinkHash])
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
  // Host-side matches handed to the graph (OR-ed with its local text filter):
  // diff extended-search hits + AI natural-language hits.
  const graphSearchHashes = useMemo(() => {
    const extActive = extendedSearch && freeText.trim() !== ''
    if (!extActive && aiSearchHashes == null && notedHashes == null) return null
    const s = new Set<string>()
    if (extActive) extendedSearchHashes.forEach(h => s.add(h))
    if (aiSearchHashes) aiSearchHashes.forEach(h => s.add(h))
    if (notedHashes) notedHashes.forEach(h => s.add(h))
    return s
  }, [extendedSearch, freeText, extendedSearchHashes, aiSearchHashes, notedHashes])
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

  return {
    searchQuery, setSearchQuery, searchMatches, setSearchMatches, extendedSearch, setExtendedSearch, extendedSearchHashes, setExtendedSearchHashes, extendedSearchLoading, setExtendedSearchLoading, repoSearch, setRepoSearch, paletteOpen, setPaletteOpen, runAiSearch, graphSearchHashes, buildPaletteCommands, revealRef,
    requiredSearchHashes: searchOps.requiredHashes, searchOpsLoading: searchOps.loading,
  }
}

/** What the search has to say about the hits the graph will not show: none, or one sentence per kind. */
function reachMessage(t: (key: any, ...args: any[]) => string, plan: ReachPlan): string | null {
  const parts: string[] = []
  if (plan.beyond.length) parts.push(t('search.reach.beyond', plan.beyond.length, plan.beyond[0].position.toLocaleString('en-US')))
  if (plan.unreached.length) parts.push(t('search.reach.unreached', plan.unreached.length))
  return parts.length ? parts.join(' ') : null
}

export type AppSearch = ReturnType<typeof useAppSearch>
