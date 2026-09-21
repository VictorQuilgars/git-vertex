import React, { useCallback, useEffect, useState } from 'react'
import MemoryView from '../../../src/renderer/src/components/Memory/MemoryView'
import { useToast } from '../../../src/renderer/src/components/Toast/Toast'

/**
 * What this repository keeps, in an editor tab.
 *
 * The desktop opens the same page in its own tab strip. Here it is a tab for
 * the same reason the staging editor and a comparison are: the panel is a
 * strip at the bottom of a window, and this page is a list of names beside a
 * list of commits.
 *
 * It does NOT re-implement any of it — the closures below are the desktop's,
 * against the same `window.gitAPI`, with the two the panel answers differently:
 * a comparison opens as a VS Code tab, and a commit is shown in the graph VIEW
 * through the host, since the graph is not in this webview.
 */
export default function MemoryTab() {
  const toast = useToast()
  const showToast = useCallback((msg: string, type?: 'ok' | 'err') => {
    if (type === 'err') toast.error(msg); else toast.success(msg)
  }, [toast])
  const api = window.gitAPI as any
  // The same path the panel's own webview keys its kept entries on — this tab
  // has its own host, so it has to ask for it rather than be told.
  const [repo, setRepo] = useState<{ path?: string; name?: string }>({})
  useEffect(() => {
    window.gitAPI.appGetInfo()
      .then((info: any) => setRepo({ path: info?.repoPath, name: info?.repoName }))
      .catch(() => setRepo({}))
  }, [])

  return (
    <MemoryView
      repo={repo.path ?? null}
      repoName={repo.name}
      showToast={showToast}
      // No "show these in the graph" here: the panel's graph shows ONE commit
      // at a time through the host, and a button that says the set and gives
      // the first of it would be a promise the panel cannot keep. A row still
      // takes you to its own commit, which is what the host can really do.
      onOpenCommit={hash => { void api.revealCommit?.(hash) }}
      onOpenCompare={(a, b, axis) => { void api.openCompare?.(a, b, axis) }}
    />
  )
}
