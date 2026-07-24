// Per-repo, per-branch metadata that git itself has no concept of: favorites,
// graph-edge pins and the issue a branch is working on (v1.21.0).
//
// Deliberately renderer-side localStorage rather than settings.json over IPC:
// it is view state, it is worthless without the repo it describes, and keeping
// it here means the VS Code panel and the desktop app get the feature from the
// same code with no main-process or preload change.
import { useCallback, useEffect, useState } from 'react'

export interface LinkedIssue {
  number: number
  title?: string
  url?: string
}

export interface BranchMeta {
  favorites: string[]
  pinned: string[]
  issues: Record<string, LinkedIssue>
}

const EMPTY: BranchMeta = { favorites: [], pinned: [], issues: {} }

const keyFor = (repoPath: string | null) => repoPath ? `gv-branch-meta:${repoPath}` : null

function read(repoPath: string | null): BranchMeta {
  const key = keyFor(repoPath)
  if (!key) return EMPTY
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw)
    // Tolerate anything hand-edited or written by an older shape.
    return {
      favorites: Array.isArray(parsed?.favorites) ? parsed.favorites : [],
      pinned: Array.isArray(parsed?.pinned) ? parsed.pinned : [],
      issues: parsed?.issues && typeof parsed.issues === 'object' ? parsed.issues : {},
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

  const togglePin = useCallback((branch: string) => {
    update(m => ({
      ...m,
      pinned: m.pinned.includes(branch)
        ? m.pinned.filter(b => b !== branch)
        : [...m.pinned, branch],
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
  const isPinned = useCallback((branch: string) => meta.pinned.includes(branch), [meta.pinned])
  const issueFor = useCallback((branch: string) => meta.issues[branch] ?? null, [meta.issues])

  return { meta, toggleFavorite, togglePin, setIssue, isFavorite, isPinned, issueFor }
}
