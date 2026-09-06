// The search field over the graph, the extended search over the whole history, the AI search, and the command palette.
import { useState, useCallback, useMemo } from 'react'
import { PaletteCommand } from '../components/CommandPalette/CommandPalette'
import type { AppChrome } from './useAppChrome'
import type { RepoSession } from './useRepoSession'
import type { AppGithub } from './useAppGithub'
import type { AppConflicts } from './useAppConflicts'
import type { AppAi } from './useAppAi'
import type { AppTabs } from './useAppTabs'
import type { AppUpdates } from './useAppUpdates'
import type { AppActions } from './useAppActions'

export function useAppSearch(app: AppChrome & RepoSession & AppGithub & AppConflicts & AppAi & AppTabs & AppUpdates & AppActions) {
  const { t, showToast, repoPath, commits, branches, setSelectedCommit, notedHashes, stashes, tags, loadRepoData, aiSearchHashes, setAiSearchHashes, setAiSearchLoading, handleOpenRepo, handleFetch, handlePush, handlePull, handleCheckout, handleCreateBranch, handleMergeBranch, handleApplyStash } = app

  const [searchQuery, setSearchQuery] = useState<string>('')
  const [searchMatches, setSearchMatches] = useState(-1)
  const [extendedSearch, setExtendedSearch] = useState(false)
  const [extendedSearchHashes, setExtendedSearchHashes] = useState<Set<string>>(new Set())
  const [extendedSearchLoading, setExtendedSearchLoading] = useState(false)
  const [repoSearch, setRepoSearch] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
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
    const extActive = extendedSearch && searchQuery.trim() !== ''
    if (!extActive && aiSearchHashes == null && notedHashes == null) return null
    const s = new Set<string>()
    if (extActive) extendedSearchHashes.forEach(h => s.add(h))
    if (aiSearchHashes) aiSearchHashes.forEach(h => s.add(h))
    if (notedHashes) notedHashes.forEach(h => s.add(h))
    return s
  }, [extendedSearch, searchQuery, extendedSearchHashes, aiSearchHashes, notedHashes])
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
    searchQuery, setSearchQuery, searchMatches, setSearchMatches, extendedSearch, setExtendedSearch, extendedSearchHashes, setExtendedSearchHashes, extendedSearchLoading, setExtendedSearchLoading, repoSearch, setRepoSearch, paletteOpen, setPaletteOpen, runAiSearch, graphSearchHashes, buildPaletteCommands,
  }
}

export type AppSearch = ReturnType<typeof useAppSearch>
