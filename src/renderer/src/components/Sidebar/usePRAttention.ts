// The facts the "by what they need" grouping cannot read off a list row: the
// review decision and the state of the checks. Four searches, the same kind
// the overview runs to COUNT them — here their numbers are kept, so a row can
// be put in its group. Asked only while the grouping is on.
import { useEffect, useState } from 'react'
import { NO_FACTS, type AttentionFacts } from './pr-attention'

export function usePRAttention(repo: { owner: string; repo: string } | null | undefined, enabled: boolean, refreshOn: unknown): { facts: AttentionFacts; loading: boolean } {
  const [facts, setFacts] = useState<AttentionFacts>(NO_FACTS)
  const [loading, setLoading] = useState(false)
  const scope = repo ? `repo:${repo.owner}/${repo.repo} is:pr is:open` : null
  useEffect(() => {
    if (!scope || !enabled) { setFacts(NO_FACTS); setLoading(false); return }
    let stale = false
    setLoading(true)
    const numbers = (q: string): Promise<Set<number>> =>
      (window.gitAPI.githubSearchIssues(q) as Promise<{ items?: { number: number }[] } | null>)
        .then(r => new Set((r?.items ?? []).map(i => i.number)))
        .catch(() => new Set<number>())
    Promise.all([
      numbers(`${scope} review-requested:@me`),
      numbers(`${scope} author:@me review:changes_requested`),
      numbers(`${scope} author:@me review:approved`),
      numbers(`${scope} author:@me status:failure`),
    ]).then(([needsReview, changesRequested, approved, failing]) => {
      if (stale) return
      setFacts({ needsReview, changesRequested, approved, failing })
      setLoading(false)
    })
    return () => { stale = true }
  }, [scope, enabled, refreshOn])
  return { facts, loading }
}
