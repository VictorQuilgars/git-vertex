// What a pull request row's hover says beyond the list (#291): its checks, its
// review decision and its size — and, read off the list itself, whether it
// comes from a fork.
//
// The fork is on every row of the REST list (`head.repo` against `base.repo`),
// so it rides the list's own request. The other three are not: the list
// endpoint carries no additions, deletions or changed files, no review
// decision and no check state — only the single-request endpoint and GraphQL
// know them. So they are asked of GraphQL, ONE query for a whole list, each
// request an alias (`p12: pullRequest(number: 12)`), rather than one request
// per row.
//
// Free of electron and vscode, like github-branch-prs.ts: the desktop's main
// process and the extension host ask GitHub the same question and read the
// answer the same way.

/** The check suites of the head commit, as GitHub rolls them up. `null`: the head has none. */
export type PRChecks = 'success' | 'failure' | 'pending' | null

export type PRReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null

export interface PRFacts {
  number: number
  checks: PRChecks
  reviewDecision: PRReviewDecision
  additions: number
  deletions: number
  changedFiles: number
}

/** A list is fifty rows (`per_page=50`); a query is never asked for more. */
export const PR_FACTS_MAX = 50

/** The numbers worth asking: whole, positive, each once, at most PR_FACTS_MAX of them. */
export function prFactsNumbers(numbers: readonly unknown[]): number[] {
  const out: number[] = []
  for (const n of numbers) {
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n <= 0 || out.includes(n)) continue
    out.push(n)
    if (out.length === PR_FACTS_MAX) break
  }
  return out
}

/**
 * The query for these numbers. The numbers are written into the query text —
 * an alias cannot be a variable — which is why only what `prFactsNumbers`
 * kept, integers, ever reaches it.
 */
export function prFactsQuery(numbers: readonly number[]): string {
  const fields = 'number additions deletions changedFiles reviewDecision '
    + 'commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }'
  const aliases = prFactsNumbers(numbers).map(n => `p${n}: pullRequest(number: ${n}) { ${fields} }`)
  return `query($o: String!, $r: String!) { repository(owner: $o, name: $r) { ${aliases.join(' ')} } }`
}

/** The GraphQL endpoint beside a REST base — github.com's, or an Enterprise Server's. */
export function graphqlUrl(base: string): string {
  return base.endsWith('/api/v3') ? base.replace(/\/api\/v3$/, '/api/graphql') : `${base}/graphql`
}

/** GitHub's rollup has five states; a row needs three. EXPECTED is a required check not reported yet. */
function checksOf(state: unknown): PRChecks {
  switch (state) {
    case 'SUCCESS': return 'success'
    case 'FAILURE': case 'ERROR': return 'failure'
    case 'PENDING': case 'EXPECTED': return 'pending'
    default: return null
  }
}

function reviewOf(v: unknown): PRReviewDecision {
  return v === 'APPROVED' || v === 'CHANGES_REQUESTED' || v === 'REVIEW_REQUIRED' ? v : null
}

/**
 * The answer, by number. A number GitHub could not resolve comes back as a
 * null alias beside an `errors` entry, with the others intact — it is simply
 * absent here, and the rest of the list keeps its facts.
 */
export function toPRFacts(data: unknown): Record<number, PRFacts> {
  const repo = (data as any)?.data?.repository
  const out: Record<number, PRFacts> = {}
  if (!repo || typeof repo !== 'object') return out
  for (const node of Object.values(repo) as any[]) {
    if (!node || typeof node.number !== 'number') continue
    out[node.number] = {
      number: node.number,
      checks: checksOf(node.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state),
      reviewDecision: reviewOf(node.reviewDecision),
      additions: Number(node.additions) || 0,
      deletions: Number(node.deletions) || 0,
      changedFiles: Number(node.changedFiles) || 0,
    }
  }
  return out
}

/**
 * What a GraphQL answer that carries nothing means. GitHub answers a rate
 * limit with 200 and an error of type RATE_LIMITED, or with 403 — both are
 * said as the saved filters already say it, `rate_limited`, so the UI has one
 * wording for it.
 */
export function prFactsFailure(status: number, data: unknown): string | null {
  const errors = (data as any)?.errors
  const limited = Array.isArray(errors) && errors.some((e: any) => e?.type === 'RATE_LIMITED')
  if (limited) return 'rate_limited'
  if (status === 401) return 'not_authenticated'
  if (status < 200 || status >= 300) return `HTTP ${status}`
  if ((data as any)?.data?.repository) return null
  return Array.isArray(errors) && errors[0]?.message ? String(errors[0].message) : 'no_data'
}

/**
 * Whether a REST pull request comes from a fork, and which. A head repository
 * that is gone — a deleted fork — is still a fork: a branch of this repository
 * would have one. GitHub says so with `head.repo: null`; a head with no
 * `repo` key at all says nothing, and is not called a fork.
 */
export function prFork(pr: any): { fork: boolean; headRepo?: string } {
  if (pr?.head?.repo === null) return { fork: true }
  const head = pr?.head?.repo?.full_name as string | undefined
  const base = pr?.base?.repo?.full_name as string | undefined
  return head && base && head !== base ? { fork: true, headRepo: head } : { fork: false }
}
