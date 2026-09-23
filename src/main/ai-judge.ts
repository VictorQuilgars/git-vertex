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
 * rescue a permissive cut. The graph goes to the BEST hit, but it lights every
 * one that passed alike — every hit that passes is a hit the user sees.
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
  /** Best first: the order is the ranking, and the caller keeps it. */
  hashes?: string[]
  error?: string
  /** Batches that never answered, when some did. The caller may say so. */
  partial?: number
  /** How many batches were asked, so `partial` can be said as a share. */
  batches?: number
  /**
   * How many commits passed the cut, before the cap. Only set when it is more
   * than `hashes` holds: a capped answer and a complete one look the same
   * otherwise, and fifty rows read as "these are all of them".
   */
  total?: number
  /**
   * The history goes on past what the search reads. Set to the number that
   * was read, so the caller can say which part of the history was asked.
   */
  readOnly?: number
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
    // One more than is read: the only way to know the history goes on is to
    // ask for a commit past the ceiling and see whether git has one.
    commits = parseJudgeLog(await log(['log', '--all', `--max-count=${JUDGE_SEARCH_MAX + 1}`,
      '--date=short', `--pretty=format:${JUDGE_LOG_FORMAT}`]))
  } catch { return { error: 'Could not read the history' } }
  if (!commits.length) return { hashes: [] }
  const cut = commits.length > JUDGE_SEARCH_MAX
  if (cut) commits = commits.slice(0, JUDGE_SEARCH_MAX)

  const batches = batchCommits(commits)
  const results = await Promise.all(batches.map(async batch => {
    const { state, questions } = searchCommitsQuestions(query, batch, today)
    const r = await run(state, questions)
    return r.error ? { error: r.error } : { hits: readSearchAnswers(r.answers, batch) }
  }))

  const failed = results.filter(r => 'error' in r) as { error: string }[]
  if (failed.length === results.length) return { error: failed[0].error }
  const hits = results.map(r => ('hits' in r ? r.hits : []) as JudgedHit[])
  const hashes = rankHits(hits)
  const passed = hits.reduce((n, b) => n + b.length, 0)
  const out: JudgeSearchResult = { hashes }
  if (failed.length) { out.partial = failed.length; out.batches = results.length }
  if (passed > hashes.length) out.total = passed
  if (cut) out.readOnly = commits.length
  return out
}

// ── The filter query ───────────────────────────────────────────
//
// A filter described in words becomes a GitHub search query. The prose path
// asks a model to COMPOSE that string and then unwraps whatever came back —
// first non-empty line, fences stripped, quotes stripped — and the renderer
// re-validates it, because a model given a vocabulary uses words outside it.
// Its prompt carries three corrective sentences, each one measured against a
// wrong answer: that every term is AND-ed and there is no OR, that `base:`
// and `head:` match by prefix, that `@me` stands for the signed-in user.
//
// Here nothing is composed by the model. Code holds the vocabulary — the same
// `ghFilters` the editor validates against — and asks one question per
// qualifier: a closed set is its own options, a free value is chosen from the
// words the person actually typed. The answer is assembled here, so the query
// is valid by CONSTRUCTION rather than by inspection, and the first corrective
// sentence has nothing left to correct: code joins with spaces, so there was
// never an OR to forbid.

import { ghFilterKeys, ghFilterValues, KEY_SYNTAX } from '../renderer/src/components/Sidebar/ghFilters'

/** The option that means the request did not ask for this qualifier. */
export const FILTER_NONE = '(not asked for)'

/** Qualifiers whose value is a person, so `@me` is always worth offering. */
const USER_KEYS = new Set([
  'author', 'assignee', 'involves', 'mentions', 'review-requested', 'reviewed-by',
])
/** Qualifiers whose value is a date expression rather than a word. */
const DATE_KEYS = new Set(['created', 'updated'])

/**
 * The words a value could be taken from — the request's own.
 *
 * A judgement engine selects, it does not write, so a `label:` or an
 * `author:` can only be one of these. Quoted runs come through whole, since a
 * label is often two words, and everything is offered rather than filtered by
 * a stop list: the engine is better at knowing that "les" is not an author
 * than a list of French and English articles would be.
 */
export function requestCandidates(request: string): string[] {
  const out: string[] = []
  const quoted = /"([^"]{1,60})"|'([^']{1,60})'|«\s*([^»]{1,60})\s*»/g
  let rest = request
  for (const m of request.matchAll(quoted)) {
    const v = (m[1] ?? m[2] ?? m[3]).trim()
    if (v) out.push(v)
    rest = rest.replace(m[0], ' ')
  }
  for (const w of rest.split(/[^\p{L}\p{N}_@./-]+/u)) {
    const v = w.replace(/^[-.]+|[-.]+$/g, '')
    if (v.length >= 2 && !out.includes(v)) out.push(v)
  }
  return out.slice(0, 40)
}

/**
 * The date expressions a request could mean, as GitHub spells them.
 *
 * Relative periods are computed here because only code knows what "today" is
 * on this machine, and an engine asked to do the arithmetic would be asked to
 * WRITE a date. Any literal date in the request is offered too.
 */
export function dateCandidates(today: string, request: string): string[] {
  const t = new Date(`${today}T00:00:00Z`)
  const back = (days: number) => {
    const d = new Date(t)
    d.setUTCDate(d.getUTCDate() - days)
    return `>=${d.toISOString().slice(0, 10)}`
  }
  const out = [back(1), back(7), back(30), back(90), `>=${today.slice(0, 4)}-01-01`]
  for (const m of request.matchAll(/\d{4}-\d{2}-\d{2}/g)) {
    if (!out.includes(`>=${m[0]}`)) out.push(`>=${m[0]}`)
  }
  return out
}

/**
 * One question per qualifier, plus one per candidate word for the free text.
 *
 * Every question names the request and what the qualifier means — the lesson
 * the commit search paid for: a question whose meaning lives somewhere else is
 * one the engine cannot answer, and its verdicts collapse into a band.
 */
export function filterQueryQuestions(
  kind: 'prs' | 'issues', described: string, today: string,
): { state: unknown; questions: Record<string, JudgeQuestion> } {
  const request = described.trim()
  const section = kind === 'prs' ? 'pull requests' : 'issues'
  const candidates = requestCandidates(request)
  const state = { today, section, request }
  const questions: Record<string, JudgeQuestion> = {}

  // The person, asked as WHO and as WHAT THEY ARE TO IT — two questions, not
  // six. Asked one qualifier at a time they compete blindly: measured,
  // "mes pull requests encore ouvertes" put author:@me at 0.31 and
  // assignee:@me at 0.28, which is not an engine that cannot read the
  // sentence, it is six questions each unaware that the others exist. These
  // dimensions are not independent, and splitting them destroyed the
  // relationship being judged.
  const roles = ghFilterKeys(kind).filter(k => USER_KEYS.has(k))
  if (roles.length) {
    questions['q:who'] = {
      type: 'choice',
      instructions: `A developer described a filter for ${section}: "${request}". `
        + 'Is it about a particular person, and which one?',
      criteria: {
        '@me': 'the developer themselves — "mine", "my", "me", "I"',
        ...Object.fromEntries(candidates.map(c => [c, null as string | null])),
        [FILTER_NONE]: 'the request is not about any particular person',
      },
    }
    questions['q:role'] = {
      type: 'choice',
      instructions: `A developer described a filter for ${section}: "${request}". `
        + 'If it is about a person, what is that person TO the item?',
      criteria: {
        ...Object.fromEntries(roles.map(k => [k, KEY_SYNTAX[k].label])),
        [FILTER_NONE]: 'the request is not about a person at all',
      },
    }
  }

  for (const key of ghFilterKeys(kind)) {
    if (USER_KEYS.has(key)) continue
    const closed = ghFilterValues(key, kind)
    const options = closed.length ? [...closed]
      : DATE_KEYS.has(key) ? dateCandidates(today, request)
      : [...candidates]
    if (!options.length) continue
    const { label, syntax } = KEY_SYNTAX[key]
    questions[`q:${key}`] = {
      type: 'choice',
      instructions: `A developer described a filter for ${section}: "${request}". `
        + `Does it ask to narrow by ${label} (${syntax})? If it does, which value does it mean?`,
      criteria: {
        ...Object.fromEntries(options.map(o => [o, null as string | null])),
        // The escape hatch, and the answer most questions should get: a
        // request names two or three qualifiers out of sixteen.
        [FILTER_NONE]: `the request says nothing about ${label}`,
      },
    }
  }

  // What is left is free text, which GitHub matches in the title and body. One
  // noul a word rather than one choice: several words can be search terms at
  // once, and a choice would make them compete.
  for (const [i, word] of candidates.entries()) {
    questions[`t:${i}`] = {
      type: 'noul',
      instructions: `A developer described a filter for ${section}: "${request}". `
        + `Should "${word}" be matched as free text in the title and body?`,
      criteria: {
        true: `"${word}" is part of what they are looking for, and is not a person, a branch, a label or a date`,
        false: `"${word}" is grammar, or it belongs to one of the filter's qualifiers rather than to its text`,
      },
    }
  }
  return { state, questions }
}

/**
 * How sure a qualifier's answer must be before it reaches the query.
 *
 * Measured over nine described filters: what the request actually said came
 * back at 0.91 to 1.00 — `draft:true` 0.99, `status:failure` 0.99,
 * `sort:updated` 1.00 — and everything invented sat at 0.24 to 0.48:
 * `review:none` 0.24, `involves:ma` 0.31, `head:main` 0.41, `state:closed`
 * 0.40. The gap is wide and empty, so the cut goes in the middle of it.
 *
 * Erring high is the right way to err here. A qualifier too many silently
 * narrows a search to nothing, and nothing is exactly what a missing filter
 * also looks like; a qualifier too few leaves a query the person can see is
 * incomplete and finish by hand, in a field built for typing.
 */
export const FILTER_CONFIDENCE = 0.7

/**
 * How likely a word must be to be searched for as free text.
 *
 * Same measurement: the words that were the point came back at 0.90 and 0.92
 * ("theme", "picker"), and the grammar and the already-captured words at 0.43
 * to 0.65 ("PR", "relecture", "CI", "échoué"). 0.65 is the highest a wrong
 * one reached, so the cut sits above it.
 */
export const FILTER_TEXT = 0.8

/**
 * The query, assembled here.
 *
 * Nothing the engine said is copied into a key: a value that is not one of the
 * options offered is dropped, so a token the section's vocabulary does not
 * have cannot be written. `state:` steps aside for `is:`, which says the same
 * thing and more.
 */
export function readFilterAnswers(
  answers: Record<string, JudgeAnswer> | undefined,
  kind: 'prs' | 'issues', described: string, today: string,
): string {
  const { questions } = filterQueryQuestions(kind, described, today)
  const tokens: string[] = []
  const taken = new Set<string>()

  // The person first, from the two answers that describe them together. Both
  // have to be sure: a role without a name filters by nobody, and a name
  // without a role cannot be written as a qualifier at all.
  const who = answers?.['q:who']
  const role = answers?.['q:role']
  const sure = (a: JudgeAnswer | undefined) =>
    a?.choice && a.choice !== FILTER_NONE && (a.confidence ?? 1) >= FILTER_CONFIDENCE
  if (sure(who) && sure(role) && ghFilterKeys(kind).includes(role!.choice!)) {
    tokens.push(`${role!.choice}:${who!.choice}`)
    taken.add(who!.choice!.toLowerCase())
  }

  for (const key of ghFilterKeys(kind)) {
    if (USER_KEYS.has(key)) continue
    const q = questions[`q:${key}`]
    const a = answers?.[`q:${key}`]
    if (!q || !a?.choice || a.choice === FILTER_NONE) continue
    // Offered, or not written: this is what makes the query valid by
    // construction rather than by the validator catching it afterwards.
    if (!(a.choice in (q as { criteria: Record<string, unknown> }).criteria)) continue
    if ((a.confidence ?? 1) < FILTER_CONFIDENCE) continue
    if (key === 'state' && answers?.['q:is']?.choice && answers['q:is'].choice !== FILTER_NONE) continue
    tokens.push(`${key}:${a.choice}`)
    taken.add(a.choice.toLowerCase())
  }

  const candidates = requestCandidates(described.trim())
  for (const [i, word] of candidates.entries()) {
    const p = answers?.[`t:${i}`]?.noul
    if (typeof p !== 'number' || p < FILTER_TEXT) continue
    // A word already spent as a qualifier's value is not also free text.
    if (taken.has(word.toLowerCase())) continue
    tokens.push(/\s/.test(word) ? `"${word}"` : word)
  }
  return tokens.join(' ')
}

/**
 * A described filter, composed as a query — ONE implementation, both products.
 *
 * The same arrangement as the commit search: the host supplies its policy (its
 * key, its retry, its logging) and the composition is here, against the very
 * vocabulary the editor validates. There is no answer to unwrap and no token
 * to refuse, because nothing was written by the engine.
 */
export async function filterQueryByJudgement(
  run: JudgeRun, kind: 'prs' | 'issues', described: string, today: string,
): Promise<{ query?: string; error?: string }> {
  if (!described.trim()) return { error: 'nothing to describe' }
  const { state, questions } = filterQueryQuestions(kind, described, today)
  const r = await run(state, questions)
  if (r.error) return { error: r.error }
  const query = readFilterAnswers(r.answers, kind, described, today)
  // Every qualifier came back unsure and no word was worth searching for. An
  // empty query is not a filter, and putting one in the field would read as
  // success — the same refusal the prose path gives for an empty answer.
  return query ? { query } : { error: 'nothing in that description could be expressed as a filter' }
}
