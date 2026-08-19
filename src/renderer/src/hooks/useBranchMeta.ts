// Per-repo, per-branch metadata that git itself has no concept of: favorites
// and the issue a branch is working on (v1.21.0).
//
// It also carried a `pinned` set until nothing was found to read it: the menu
// row said "Pin to Graph Edge" and the layout never looked. Old entries in
// localStorage keep the key; it is simply ignored.
//
// Deliberately renderer-side localStorage rather than settings.json over IPC:
// it is view state, it is worthless without the repo it describes, and keeping
// it here means the VS Code panel and the desktop app get the feature from the
// same code with no main-process or preload change.
import { useCallback, useEffect, useState } from 'react'
import { migrateIssueRef, type IssueRef } from '../utils/issueRef'

/**
 * The reference a branch is working on. It used to be a GitHub number; it is a
 * tracker-agnostic reference now, and what was stored under the old shape is
 * migrated on read — see `migrateIssueRef`, which is where that lives so it can
 * be tested without a DOM.
 */
export type LinkedIssue = IssueRef

export interface BranchMeta {
  favorites: string[]
  issues: Record<string, LinkedIssue>
}

const EMPTY: BranchMeta = { favorites: [], issues: {} }

const keyFor = (repoPath: string | null) => repoPath ? `gv-branch-meta:${repoPath}` : null

function read(repoPath: string | null): BranchMeta {
  const key = keyFor(repoPath)
  if (!key) return EMPTY
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw)
    // Tolerate anything hand-edited or written by an older shape. Each linked
    // reference is migrated on the way in, and one that cannot be read is
    // dropped on its own rather than costing the whole file.
    const issues: Record<string, LinkedIssue> = {}
    const stored = parsed?.issues
    if (stored && typeof stored === 'object') {
      for (const [branch, value] of Object.entries(stored)) {
        const ref = migrateIssueRef(value)
        if (ref) issues[branch] = ref
      }
    }
    return {
      favorites: Array.isArray(parsed?.favorites) ? parsed.favorites : [],
      issues,
    }
  } catch {
    return EMPTY
  }
}

function write(repoPath: string | null, meta: BranchMeta) {
  const key = keyFor(repoPath)
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify(meta))
  } catch {
    // Quota or a locked-down webview — the feature degrades to session-only
    // rather than taking the panel down with it.
  }
}

export function useBranchMeta(repoPath: string | null) {
  const [meta, setMeta] = useState<BranchMeta>(() => read(repoPath))

  // Switching repos swaps the whole set.
  useEffect(() => { setMeta(read(repoPath)) }, [repoPath])

  const update = useCallback((fn: (m: BranchMeta) => BranchMeta) => {
    setMeta(prev => {
      const next = fn(prev)
      write(repoPath, next)
      return next
    })
  }, [repoPath])

  const toggleFavorite = useCallback((branch: string) => {
    update(m => ({
      ...m,
      favorites: m.favorites.includes(branch)
        ? m.favorites.filter(b => b !== branch)
        : [...m.favorites, branch],
    }))
  }, [update])

  /** Passing null clears the link. */
  const setIssue = useCallback((branch: string, issue: LinkedIssue | null) => {
    update(m => {
      const issues = { ...m.issues }
      if (issue) issues[branch] = issue
      else delete issues[branch]
      return { ...m, issues }
    })
  }, [update])

  const isFavorite = useCallback((branch: string) => meta.favorites.includes(branch), [meta.favorites])
  const issueFor = useCallback((branch: string) => meta.issues[branch] ?? null, [meta.issues])

  return { meta, toggleFavorite, setIssue, isFavorite, issueFor }
}
