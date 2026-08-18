import { useCallback, useEffect, useState } from 'react'
import type { CompareAxis } from '../types'

// The comparison view forgot everything the moment it closed. You lined up two
// refs, read half of it, closed the tab to go look at something, and lined them
// up again by hand. GitLens keeps a register of comparisons; this is ours, and
// it is deliberately small — the last few, per repository, nothing to manage.
//
// localStorage rather than a settings round-trip, for the same reason
// useBranchMeta uses it: it is renderer-side state that both hosts already
// have, with no IPC method to add on either side.

export interface SavedComparison {
  a: string
  /** null = the working tree. */
  b: string | null
  axis: CompareAxis
}

/** How many to keep. Past a handful this becomes a list to manage, not a shortcut. */
const MAX = 6

const keyFor = (repoKey: string | null) => repoKey ? `gv-compare-history:${repoKey}` : null

/** Same pair, same axis — a repeat moves to the top rather than piling up. */
export function sameComparison(x: SavedComparison, y: SavedComparison): boolean {
  return x.a === y.a && x.b === y.b && x.axis === y.axis
}

export function read(repoKey: string | null): SavedComparison[] {
  const key = keyFor(repoKey)
  if (!key) return []
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]')
    if (!Array.isArray(parsed)) return []
    // Tolerate anything hand-edited or written by an older shape: a comparison
    // missing its refs is not a comparison.
    return parsed
      .filter((c: unknown): c is SavedComparison =>
        !!c && typeof c === 'object'
        && typeof (c as SavedComparison).a === 'string' && !!(c as SavedComparison).a
        && (typeof (c as SavedComparison).b === 'string' || (c as SavedComparison).b === null))
      .map((c): SavedComparison => ({ a: c.a, b: c.b, axis: c.axis === 'endpoints' ? 'endpoints' : 'diverged' }))
      .slice(0, MAX)
  } catch {
    return []
  }
}

function write(repoKey: string | null, list: SavedComparison[]) {
  const key = keyFor(repoKey)
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    // Quota, or a webview with storage locked down: the register degrades to
    // this session rather than taking the view down with it.
  }
}

/** Pure so the ordering rule can be tested without a DOM. */
export function withComparison(list: SavedComparison[], entry: SavedComparison): SavedComparison[] {
  return [entry, ...list.filter(c => !sameComparison(c, entry))].slice(0, MAX)
}

export function useCompareHistory(repoKey: string | null) {
  const [history, setHistory] = useState<SavedComparison[]>(() => read(repoKey))

  // Switching repository swaps the whole register.
  useEffect(() => { setHistory(read(repoKey)) }, [repoKey])

  const remember = useCallback((entry: SavedComparison) => {
    setHistory(prev => {
      const next = withComparison(prev, entry)
      write(repoKey, next)
      return next
    })
  }, [repoKey])

  const clear = useCallback(() => {
    setHistory([])
    write(repoKey, [])
  }, [repoKey])

  return { history, remember, clear }
}
