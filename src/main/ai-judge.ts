// ai-judge.ts — what a JUDGEMENT engine is asked, and how its verdicts are
// read back.
//
// The sibling of ai-prompts.ts, and deliberately not part of it: that file is
// prose in, prose out, parsed with regexes. This one never sees a sentence the
// model wrote. It builds typed questions over a shared state and reads typed
// answers — a probability, an option, a level — so there is nothing to strip,
// nothing to unfence, and nothing that can come back malformed.
//
// Free of `electron` and of git, the theme-validate pattern: the desktop main
// imports it, esbuild bundles it into the extension host, and the unit suite
// exercises every shape without spending a request.
//
// It holds the WIRE too, which ai-call.ts does not: the extension host does
// not bundle that module — importing it would drag three SDK dynamic imports
// into the panel — and this dialect is one POST with no dependency. So the
// fourth dialect lives in one file, shapes and questions and call alike.
//
// The one idea worth keeping: **the model is never handed an identifier.** The
// old commit search sent 200 short hashes and asked for the matching ones back,
// which is a copying task — and the handler grew a `catch { /* hallucinated
// hash — skip */ }` because models are bad at it. Here the state carries only
// what a commit MEANS (author, date, subject) and each question points at a
// position. Code owns the hash from end to end, so an invented one is not
// unlikely, it is unrepresentable.

/** A yes/no judgement. The answer is the probability of yes, never a label. */
export interface Noul {
  type: 'noul'
  instructions: string
  criteria?: { true: string; false: string }
}

/** One option out of a defined set, with the distribution over the others. */
export interface Choice {
  type: 'choice'
  instructions: string
  /** The options, each mapped to what it means (null for a bare option). */
  criteria: Record<string, string | null>
}

export type JudgeQuestion = Noul | Choice

/** One verdict. Which field is filled follows the question's own type. */
export interface JudgeAnswer {
  type: 'noul' | 'choice' | 'score'
  /** noul: the probability of yes, in [0, 1]. */
  noul?: number
  /** choice: the option picked. */
  choice?: string
  probabilities?: Record<string, number>
  score?: number
  /** choice and score only — how concentrated the distribution is. */
  confidence?: number
}

export interface JudgeReply {
  answers: Record<string, JudgeAnswer>
  usage?: { input_tokens?: number; output_tokens?: number }
}

// ── The commit search ──────────────────────────────────────────

/** A commit as a judgement sees it: what it means, and nothing to copy. */
export interface JudgedCommit {
  /** Kept by the CALLER, never sent. */
  hash: string
  author: string
  date: string
  subject: string
}

/**
 * How many commits one request carries.
 *
 * The budget is 64k tokens for state plus questions, and 32k for the state
 * alone — a commit costs roughly 25 tokens on each side, so a hundred of them
 * is about 5k all told and leaves the ceiling far away. Batching matters:
 * asking N questions over ONE state pays for that state once, which the
 * vendor measures at about twelve times cheaper than N single-question
 * requests. Small enough to stay well clear of a limit nobody has published,
 * large enough that the whole of a normal history is a handful of requests.
 */
export const JUDGE_BATCH = 100

/**
 * How far back a search looks.
 *
 * The prose path stops at 200 commits truncated to 12k characters, because a
 * free-tier provider rejects more in one prompt. Nothing here is one prompt:
 * ten small requests go in parallel, so the ceiling is about the wait and the
 * bill, not about what fits. A thousand commits is ten requests and about a
 * tenth of a cent.
 */
export const JUDGE_SEARCH_MAX = 1000

/**
 * Above which probability a commit is a hit.
 *
 * A noul near 0.5 means the engine genuinely cannot tell, not "half a match",
 * so the cut sits there. Measured on this repository, the answers either sit
 * above it or fall away fast — 0.70 for the one commit that was wanted, then
 * 0.27, 0.18, 0.10 and a cliff — so where exactly it sits inside that gap
 * changes little. What it must not do is drift down: the ranking below cannot
 * rescue a permissive cut, because the graph takes the hashes as a SET and
 * highlights all of them alike. Every hit that passes is a hit the user sees.
 */
export const JUDGE_HIT = 0.5

/** How many hits come back, as the prose path also capped it. */
export const JUDGE_MAX_HITS = 50

/**
 * The state and questions for one batch of commits.
 *
 * **Each question carries the query and the subject, and that is the whole
 * design.** The first cut of this did the opposite: it pushed everything
 * shared into the state and made each question a bare pointer —
 * `` Does `commits[3]` answer `search`? `` — to keep the repeating half
 * cheap. It shipped, and it was measured against this repository:
 *
 *   "générateur de thème de couleur", 100 commits
 *     pointer + generic criteria   34 hits over the cut, led by
 *                                  "chore: release app 1.37.0" at 0.59
 *     query + subject in question    1 hit, "Merge … feat/theme-builder" 0.70,
 *                                  then 0.27, 0.18, 0.10, and a cliff to 0.06
 *
 * The verdicts had collapsed into a band around 0.6 — the shape of a question
 * that cannot be answered, not of a cut in the wrong place. Naming the search
 * and the subject inside the question is what makes it answerable, and the
 * vendor's own guidance says so: a question has to carry its complete meaning,
 * because its ID never reaches the model.
 *
 * It costs about 30 tokens per commit to repeat them — some $0.00013 a batch,
 * against a search that was returning a third of the history.
 *
 * The state still holds what a question cannot: the author and the date, which
 * a subject does not carry, and today's date, since a search says "last week".
 */
export function searchCommitsQuestions(
  query: string, commits: JudgedCommit[], today: string,
): { state: unknown; questions: Record<string, Noul> } {
  const q = query.trim()
  const state = {
    today,
    commits: commits.map(c => ({ author: c.author, date: c.date, subject: c.subject })),
  }
  const questions: Record<string, Noul> = {}
  commits.forEach((c, i) => {
    questions[`c${i}`] = {
      type: 'noul',
      instructions: `A developer is searching their git history for: "${q}". `
        + `Is the commit at \`commits[${i}]\` — "${c.subject}" — one of the commits they are looking for?`,
      criteria: {
        // "even if it touches the same area in passing" is load-bearing: it is
        // what separates the change the search describes from the forty that
        // merely happened near it, which is where the 34 came from.
        true: `this commit's own change is about ${q}`,
        false: 'this commit changes something else, even if it touches the same area in passing',
      },
    }
  })
  return { state, questions }
}

/** One commit's verdict, kept with the hash the model never saw. */
export interface JudgedHit { hash: string; probability: number }

/**
 * Read one batch back.
 *
 * A question with no answer is dropped rather than defaulted: a missing
 * verdict is not a "no", and counting it as one would quietly shrink a search
 * whose request half-failed. Below the cut is dropped too — that is the cut's
 * whole job — and what survives carries its probability so the caller can rank
 * across batches.
 */
export function readSearchAnswers(
  answers: Record<string, JudgeAnswer> | undefined, commits: JudgedCommit[],
): JudgedHit[] {
  const out: JudgedHit[] = []
  commits.forEach((c, i) => {
    const p = answers?.[`c${i}`]?.noul
    if (typeof p !== 'number' || Number.isNaN(p)) return
    if (p >= JUDGE_HIT) out.push({ hash: c.hash, probability: p })
  })
  return out
}

/** The hits of every batch, best first, capped — the answer the graph gets. */
export function rankHits(batches: JudgedHit[][]): string[] {
  return batches.flat()
    .sort((a, b) => b.probability - a.probability)
    .slice(0, JUDGE_MAX_HITS)
    .map(h => h.hash)
}

/** The batches one search is cut into. */
export function batchCommits(commits: JudgedCommit[], size = JUDGE_BATCH): JudgedCommit[][] {
  const out: JudgedCommit[][] = []
  for (let i = 0; i < commits.length; i += size) out.push(commits.slice(i, i + size))
  return out
}

/**
 * `git log` output read into commits.
 *
 * The full hash, because nothing expands a short one afterwards: the prose
 * path had to `rev-parse` what the model echoed, one by one when a hash turned
 * out not to exist. A subject holding the separator keeps it — split on the
 * first three, not on all of them.
 */
export const JUDGE_LOG_FORMAT = '%H|%an|%ad|%s'

export function parseJudgeLog(out: string): JudgedCommit[] {
  const commits: JudgedCommit[] = []
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    const a = line.indexOf('|')
    const b = line.indexOf('|', a + 1)
    const c = line.indexOf('|', b + 1)
    if (a < 0 || b < 0 || c < 0) continue
    const hash = line.slice(0, a)
    if (!/^[0-9a-f]{40}$/.test(hash)) continue
    commits.push({
      hash,
      author: line.slice(a + 1, b),
      date: line.slice(b + 1, c),
      // A subject is one line and git gives it whole; the cut keeps a runaway
      // one from costing the batch its budget.
      subject: line.slice(c + 1).slice(0, 160),
    })
  }
  return commits
}

// ── The wire, and the search over it ───────────────────────────

/** Where and how a judgement is asked. The hosts resolve this themselves. */
export interface JudgeTarget {
  model: string
  apiKey: string
  baseUrl?: string
  authHeader?: string
  extraHeaders?: Record<string, string>
}

/**
 * One judgement round trip.
 *
 * A plain fetch, for the reason the openai-compat branch of ai-call is one:
 * the contract is a single endpoint. An SDK here would be a dependency in the
 * packaged app, in the extension bundle and in THIRD-PARTY.md, to spell one
 * POST.
 *
 * Nothing about budgets, truncation or headroom applies — output tokens are
 * free and a verdict cannot be cut off mid-answer — which is why this returns
 * answers rather than the `{ text, truncated }` the prompt path needs.
 *
 * `auth` is passed in rather than imported so this module keeps importing
 * nothing: the one interpreter of the auth quirks lives in the catalog, and
 * both hosts already hold it.
 */
export async function callJudge(
  target: JudgeTarget, state: unknown, questions: Record<string, JudgeQuestion>,
  auth: (t: JudgeTarget) => Record<string, string>,
): Promise<JudgeReply> {
  const base = (target.baseUrl ?? 'https://api.typesafe.ai/v1').replace(/\/+$/, '')
  const res = await fetch(`${base}/systemone`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth(target) },
    body: JSON.stringify({ model: target.model, state, questions }),
  })
  const data = await res.json().catch(() => ({})) as any
  if (!res.ok) {
    // The status carries more than the body does on the two that matter: a
    // refused key and a rejected request read identically otherwise.
    const said = data?.error?.message ?? data?.error ?? data?.detail
    if (res.status === 401) throw new Error(said ?? 'The API key was refused')
    if (res.status === 429) throw new Error(said ?? 'Rate limited — too many questions at once')
    throw new Error(said ?? `HTTP ${res.status}`)
  }
  return { answers: data?.answers ?? {}, usage: data?.usage }
}

/** The host's git, in the shape this module takes — git-core's runner. */
export type JudgeLog = (args: string[]) => Promise<string>
/** The host's judgement policy: its key, its retries, its logging. */
export type JudgeRun = (state: unknown, questions: Record<string, JudgeQuestion>)
  => Promise<{ answers?: Record<string, JudgeAnswer>; error?: string }>

export interface JudgeSearchResult {
  hashes?: string[]
  error?: string
  /** Batches that never answered, when some did. The caller may say so. */
  partial?: number
}

/**
 * The commit search, asked as judgements rather than as a prompt — ONE
 * implementation, driven by both products.
 *
 * The desktop and the panel each carried their own copy of the prose search,
 * and the two prompts drifted word by word exactly as the four shared ones
 * did before #185 P2. This one is not given the chance: the hosts supply a
 * git and a policy, and the behaviour is here.
 *
 * A batch that fails does not fail the search. Ten requests go out and the
 * answer is what the ones that returned found; refusing everything because
 * one request was rate limited would cost a result the other nine already
 * had. What it will not do is pretend — every batch failing IS the failure,
 * and saying "no commit matched" to a refused key is a lie the user acts on.
 */
export async function searchCommitsByJudgement(
  log: JudgeLog, run: JudgeRun, query: string, today: string,
): Promise<JudgeSearchResult> {
  if (!query.trim()) return { hashes: [] }
  let commits: JudgedCommit[]
  try {
    commits = parseJudgeLog(await log(['log', '--all', `--max-count=${JUDGE_SEARCH_MAX}`,
      '--date=short', `--pretty=format:${JUDGE_LOG_FORMAT}`]))
  } catch { return { error: 'Could not read the history' } }
  if (!commits.length) return { hashes: [] }

  const batches = batchCommits(commits)
  const results = await Promise.all(batches.map(async batch => {
    const { state, questions } = searchCommitsQuestions(query, batch, today)
    const r = await run(state, questions)
    return r.error ? { error: r.error } : { hits: readSearchAnswers(r.answers, batch) }
  }))

  const failed = results.filter(r => 'error' in r) as { error: string }[]
  if (failed.length === results.length) return { error: failed[0].error }
  const hashes = rankHits(results.map(r => ('hits' in r ? r.hits : []) as JudgedHit[]))
  return failed.length ? { hashes, partial: failed.length } : { hashes }
}
