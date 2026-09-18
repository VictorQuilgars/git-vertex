// The part of the search field's operators that git answers (#255): `file:`.
// Everything else — `author:`, `after:`, `before:`, the text — is matched by
// the graph against the commits it holds; a path is not a fact about a commit
// the graph has, so it is asked for, once per set of paths, and comes back as
// the hashes a row has to be among.
import { useEffect, useMemo, useState } from 'react'
import { fileTerms, parseSearchQuery } from '../utils/searchQuery'

export function useSearchOperators(query: string, repoKey: string | null) {
  const parsed = useMemo(() => parseSearchQuery(query), [query])
  const key = useMemo(() => fileTerms(parsed).join('\n'), [parsed])
  const [required, setRequired] = useState<Set<string> | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!key || !repoKey) { setRequired(null); setLoading(false); return }
    let stale = false
    setLoading(true)
    // A path is typed a character at a time: git is asked when the hand stops.
    const timer = setTimeout(async () => {
      try {
        const r = await window.gitAPI.searchByFile(key.split('\n'))
        if (!stale) setRequired(new Set(r?.hashes ?? []))
      } catch {
        if (!stale) setRequired(new Set())
      } finally {
        if (!stale) setLoading(false)
      }
    }, 250)
    return () => { stale = true; clearTimeout(timer) }
  }, [key, repoKey])
  return {
    parsed,
    /** What the host-side searches (in diffs, by the model) are given: the words, not the operators. */
    freeText: parsed.text,
    /** The hashes a row has to be among; null while no `file:` is asked, or while git has not answered. */
    requiredHashes: key ? required : null,
    loading,
  }
}
