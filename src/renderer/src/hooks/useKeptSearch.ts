import { useState } from 'react'
import type { KeptEntry, KeptSearch } from './useKept'

/** Restored host results remain a snapshot until the user changes the search. */
export function useKeptSearch(repo: string | null) {
  const [value, setValue] = useState<{ repo: string | null; search: KeptSearch } | null>(null)
  return {
    restored: value?.repo === repo ? value.search : null,
    restore: (entry: KeptEntry) => { if (entry.kind === 'search') setValue({ repo, search: entry }) },
    clear: () => setValue(null),
  }
}
