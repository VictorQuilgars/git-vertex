import { useCallback, useRef, useState, type SetStateAction } from 'react'

interface CommitDraft {
  message: string
  amend: boolean
  amendMessage: string
}
const emptyDraft = (): CommitDraft => ({ message: '', amend: false, amendMessage: '' })

/** The host keys the staging view by repository; navigation never owns a draft. */
export function useCommitDraft(repoPath?: string) {
  const key = repoPath ? `gv-commit-draft:${repoPath.normalize('NFC')}` : null
  const [draft, setState] = useState<CommitDraft>(() => {
    try {
      const value = key && JSON.parse(localStorage.getItem(key) ?? 'null')
      if (value && typeof value.message === 'string' && typeof value.amendMessage === 'string' && typeof value.amend === 'boolean') return value
    } catch { /* A corrupt or unavailable cache must not prevent committing. */ }
    return emptyDraft()
  })
  const current = useRef(draft)
  const update = useCallback((action: SetStateAction<CommitDraft>) => {
    const next = typeof action === 'function' ? action(current.current) : action
    current.current = next
    setState(next)
    // Persist during the edit, before navigation can unmount the form.
    if (key) {
      try {
        if (!next.message && !next.amend && !next.amendMessage) localStorage.removeItem(key)
        else localStorage.setItem(key, JSON.stringify(next))
      } catch { /* Keep the in-memory draft when storage is unavailable. */ }
    }
  }, [key])
  const setMessage = useCallback((action: SetStateAction<string>) => {
    update(prev => {
      const field = prev.amend ? 'amendMessage' : 'message'
      return { ...prev, [field]: typeof action === 'function' ? action(prev[field]) : action }
    })
  }, [update])
  const clear = useCallback(() => update(emptyDraft()), [update])
  return { draft, update, message: draft.amend ? draft.amendMessage : draft.message, setMessage, clear }
}
