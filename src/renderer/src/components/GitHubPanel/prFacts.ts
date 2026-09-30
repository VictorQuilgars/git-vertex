// The facts a pull request's hover card adds (#291): checks, review decision,
// size. Asked on hover, and why not with the list:
//
// - the REST list endpoint has none of the three, so they cannot ride the
//   list's request — only GraphQL, or one `pulls/<n>` call per row, knows them;
// - the list is a conditional GET (#141): polled every minute, and FREE while
//   nothing changes. A GraphQL query beside it would be paid on every poll, and
//   a fact cached with the list body would go stale — a check turning green
//   does not change the list's ETag.
//
// So the first card that opens asks for EVERY row of its list in one query,
// and the answers are held for a minute: moving from row to row costs nothing
// more, and a card opened later reads checks at most a minute old. A failure
// is not held — the next card asks again, the rule the PR detail's supplement
// already follows.
import { useEffect, useState } from 'react'
import type { PRFacts } from '../../../../main/github-pr-facts'

export type { PRFacts }

export const PR_FACTS_TTL_MS = 60_000

/** What a card knows: nothing asked yet, asking, the facts, or why not. */
export type PRFactsState =
  | { status: 'loading' }
  | { status: 'ready'; facts: PRFacts | null }
  | { status: 'error'; error: string }

type Fetcher = (owner: string, repo: string, numbers: number[]) => Promise<{ facts?: Record<number, PRFacts>; error?: string } | null | undefined>

interface Entry { at: number; facts: PRFacts | null }

/**
 * One cache per page, keyed `owner/repo#n`. Exposed as a factory so a test
 * holds its own, and a clock can be handed in.
 */
export function createPRFactsCache(fetcher: Fetcher, now: () => number = Date.now) {
  const entries = new Map<string, Entry>()
  const inflight = new Map<string, Promise<void>>()
  const key = (repo: { owner: string; repo: string }, n: number) => `${repo.owner}/${repo.repo}#${n}`
  const fresh = (e: Entry | undefined) => !!e && now() - e.at < PR_FACTS_TTL_MS

  function peek(repo: { owner: string; repo: string }, n: number): PRFacts | null | undefined {
    const e = entries.get(key(repo, n))
    return fresh(e) ? e!.facts : undefined
  }

  /**
   * The facts of `n`, asking — with `n` — every number of `batch` not already
   * held. A number GitHub did not resolve is held as `null`, so it is not asked
   * again for a minute either.
   */
  async function load(repo: { owner: string; repo: string }, n: number, batch: readonly number[]): Promise<PRFacts | null> {
    const held = peek(repo, n)
    if (held !== undefined) return held
    const pending = inflight.get(key(repo, n))
    if (pending) { await pending; return peekOrThrow(repo, n) }
    const wanted = [n, ...batch.filter(b => b !== n && peek(repo, b) === undefined && !inflight.has(key(repo, b)))]
    let failure: string | null = null
    const run = (async () => {
      const r: Awaited<ReturnType<Fetcher>> = await fetcher(repo.owner, repo.repo, wanted)
        .catch((e: unknown) => ({ error: String((e as Error)?.message ?? e) }))
      const facts = r?.facts
      if (!facts || r?.error) { failure = r?.error ?? 'no_data'; return }
      const at = now()
      for (const w of wanted) entries.set(key(repo, w), { at, facts: facts[w] ?? null })
    })()
    for (const w of wanted) inflight.set(key(repo, w), run)
    try { await run } finally { for (const w of wanted) inflight.delete(key(repo, w)) }
    if (failure) throw new Error(failure)
    return peek(repo, n) ?? null
  }

  function peekOrThrow(repo: { owner: string; repo: string }, n: number): PRFacts | null {
    const held = peek(repo, n)
    if (held === undefined) throw new Error('no_data')
    return held
  }

  return { peek, load, clear: () => entries.clear() }
}

/** The page's cache: the host's `githubPRFacts`, one for every card. */
const shared = createPRFactsCache((owner, repo, numbers) =>
  window.gitAPI.githubPRFacts?.(owner, repo, numbers) ?? Promise.resolve({ error: 'not-implemented' }))

/** Where a row's facts come from: its repository, and the list it sits in. */
export interface PRFactsSource {
  repo: { owner: string; repo: string }
  /** The other numbers of the list, asked in the same query. */
  batch: readonly number[]
}

/** The card's facts — asked when it mounts, which is when it opens. */
export function usePRFacts(source: PRFactsSource | undefined, n: number, cache = shared): PRFactsState | null {
  const [state, setState] = useState<PRFactsState | null>(() => {
    if (!source) return null
    const held = cache.peek(source.repo, n)
    return held !== undefined ? { status: 'ready', facts: held } : { status: 'loading' }
  })
  const owner = source?.repo.owner, repo = source?.repo.repo
  useEffect(() => {
    if (!source || !owner || !repo) { setState(null); return }
    let live = true
    const held = cache.peek(source.repo, n)
    if (held !== undefined) { setState({ status: 'ready', facts: held }); return }
    setState({ status: 'loading' })
    cache.load({ owner, repo }, n, source.batch)
      .then(facts => { if (live) setState({ status: 'ready', facts }) })
      .catch((e: Error) => { if (live) setState({ status: 'error', error: e.message }) })
    return () => { live = false }
    // The batch is read when the card opens; a list that changes under an
    // open card does not re-ask for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, repo, n, cache])
  return state
}

/** Forget every held answer — a test's clean slate. */
export function clearPRFacts(): void { shared.clear() }
