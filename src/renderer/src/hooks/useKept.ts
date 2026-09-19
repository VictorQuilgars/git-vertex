import { useCallback, useEffect, useState } from 'react'
import type { SavedComparison } from './useCompareHistory'

export type KeptSearch = {
  kind: 'search'; query: string; ai: boolean
  hashes: string[] | null; requiredHashes: string[] | null
}
export type KeptComparison = SavedComparison & { kind: 'comparison'; reviewed: string[] }
export type KeptEntry = (KeptSearch | KeptComparison) & { id: string; name: string; at: number }
export type KeptInput = KeptSearch | KeptComparison
const event = 'gv-kept-changed'
const keyFor = (repo: string) => `gv-kept:${repo}`
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string')

export function decodeKept(raw?: string): KeptEntry[] {
  try {
    const value = JSON.parse(raw ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter((v): v is KeptEntry => v && typeof v.id === 'string' && typeof v.name === 'string'
      && Number.isFinite(v.at) && Math.abs(v.at) <= 8.64e15 && (v.kind === 'comparison'
        ? typeof v.a === 'string' && (typeof v.b === 'string' || v.b === null)
          && ['diverged', 'endpoints'].includes(v.axis) && strings(v.reviewed)
        : v.kind === 'search' && typeof v.query === 'string' && typeof v.ai === 'boolean'
          && (v.hashes === null || strings(v.hashes)) && (v.requiredHashes === null || strings(v.requiredHashes))))
  } catch { return [] }
}

// Both hosts already persist settings outside the renderer, including VS Code
// tool tabs whose localStorage is not shared with the overview webview.
let writes: Promise<unknown> = Promise.resolve()
export async function readKept(repo: string): Promise<KeptEntry[]> {
  const settings = await window.gitAPI.settingsGetAll()
  return decodeKept(settings?.[keyFor(repo)])
}
export function changeKept(repo: string, change: (entries: KeptEntry[]) => KeptEntry[]): Promise<void> {
  const next = writes.catch(() => {}).then(async () => {
    const entries = change(await readKept(repo))
    const result = await window.gitAPI.settingsSet(keyFor(repo), JSON.stringify(entries))
    if (result?.error || result?.success === false) throw new Error(result.error || 'Could not save')
    window.dispatchEvent(new Event(event))
  })
  writes = next
  return next
}

export function useKept(repo: string | null) {
  const [state, setState] = useState<{ repo: string | null; entries: KeptEntry[] }>({ repo, entries: [] })
  const [error, setError] = useState(false)
  useEffect(() => {
    let alive = true
    let request = 0
    const refresh = () => {
      const current = ++request
      if (!repo) { setState({ repo, entries: [] }); return }
      readKept(repo).then(entries => {
        if (alive && current === request) setState({ repo, entries })
      }).catch(() => { if (alive) setError(true) })
    }
    setError(false)
    refresh()
    window.addEventListener(event, refresh)
    window.addEventListener('focus', refresh)
    return () => { alive = false; window.removeEventListener(event, refresh); window.removeEventListener('focus', refresh) }
  }, [repo])
  const mutate = useCallback(async (change: (entries: KeptEntry[]) => KeptEntry[]) => {
    if (!repo) return
    try { await changeKept(repo, change); setError(false) }
    catch { setError(true) }
  }, [repo])
  return {
    entries: state.repo === repo ? state.entries : [], error,
    keep: (input: KeptInput, name: string) => mutate(entries => [
      { ...input, id: crypto.randomUUID(), name, at: Date.now() }, ...entries,
    ]),
    rename: (id: string, name: string) => mutate(entries => entries.map(e => e.id === id && name.trim() ? { ...e, name: name.trim() } : e)),
    remove: (id: string) => mutate(entries => entries.filter(e => e.id !== id)),
    review: (id: string, path: string, checked: boolean) => mutate(entries => entries.map(e => e.id === id && e.kind === 'comparison'
      ? { ...e, reviewed: checked ? [...new Set([...e.reviewed, path])] : e.reviewed.filter(p => p !== path) } : e)),
  }
}
