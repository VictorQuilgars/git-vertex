// The graph's search field, read (#255). A query is free text and operators:
//
//   author:ana file:src/main after:2w "cache key"
//
// Operators narrow — every one of them has to hold (AND), with each other and
// with the text — and an unknown `word:` is just text. `author:`, `after:` and
// `before:` are answered here, against the commits the graph holds; `file:` is
// answered by git (`git log -- <path>`), and comes back as a set of hashes.
//
// Pure: a string in, what it asks for out.

export type SearchOperator = 'author' | 'file' | 'after' | 'before'

/** Every spelling an operator answers to, the long one first. */
export const OPERATOR_ALIASES: Record<SearchOperator, string[]> = {
  author: ['author:', '@:'],
  file: ['file:', '?:'],
  after: ['after:', 'since:'],
  before: ['before:', 'until:'],
}

export interface OperatorTerm {
  op: SearchOperator
  value: string
  /** Where the whole term sits in the query, for taking it out again. */
  start: number
  end: number
}

export interface ParsedSearch {
  /** What is left once the operators are out — matched against message, author and hash. */
  text: string
  terms: OperatorTerm[]
}

const ALIAS_TO_OP = new Map<string, SearchOperator>(
  (Object.entries(OPERATOR_ALIASES) as [SearchOperator, string[]][]).flatMap(([op, names]) => names.map(n => [n, op] as const)),
)
const ALIASES = [...ALIAS_TO_OP.keys()].sort((a, b) => b.length - a.length)

/**
 * An operator is recognised at the START of a whitespace-delimited token only:
 * `fix author:ana` has one, `prefix-author:ana` has none. One space is allowed
 * after the colon; `"…"` groups a value holding spaces, and a quote nobody
 * closed takes the rest of the line. An operator with no value is text.
 */
export function parseSearchQuery(query: string): ParsedSearch {
  const terms: OperatorTerm[] = []
  const text: string[] = []
  let i = 0
  const n = query.length
  while (i < n) {
    if (/\s/.test(query[i])) { i++; continue }
    const start = i
    const lower = query.slice(i).toLowerCase()
    const alias = ALIASES.find(a => lower.startsWith(a))
    if (alias) {
      let j = i + alias.length
      if (query[j] === ' ' && j + 1 < n && !/\s/.test(query[j + 1])) j++
      let value = ''
      if (query[j] === '"') {
        const close = query.indexOf('"', j + 1)
        value = query.slice(j + 1, close < 0 ? n : close)
        j = close < 0 ? n : close + 1
      } else {
        const stop = query.slice(j).search(/\s/)
        const to = stop < 0 ? n : j + stop
        value = query.slice(j, to)
        j = to
      }
      if (value.trim()) {
        terms.push({ op: ALIAS_TO_OP.get(alias)!, value: value.trim(), start, end: j })
        i = j
        continue
      }
      // No value yet (`author:` being typed): it is text for now, not a filter that matches nothing.
    }
    if (query[i] === '"') {
      const close = query.indexOf('"', i + 1)
      text.push(query.slice(i + 1, close < 0 ? n : close))
      i = close < 0 ? n : close + 1
      continue
    }
    const stop = query.slice(i).search(/\s/)
    const to = stop < 0 ? n : i + stop
    text.push(query.slice(i, to))
    i = to
  }
  return { text: text.join(' ').trim(), terms }
}

/** The query with one term taken out, and the gap it leaves closed. */
export function removeTerm(query: string, term: OperatorTerm): string {
  return (query.slice(0, term.start) + query.slice(term.end)).replace(/\s{2,}/g, ' ').trim()
}

/** The query with an operator appended, ready for its value. */
export function appendOperator(query: string, op: SearchOperator): string {
  const base = query.replace(/\s+$/, '')
  return `${base}${base ? ' ' : ''}${OPERATOR_ALIASES[op][0]}`
}

const SPAN = /^(\d+)\s*(h|d|w|m|y)$/i
const UNIT_MS: Record<string, number> = { h: 3600e3, d: 86400e3, w: 7 * 86400e3, m: 30 * 86400e3, y: 365 * 86400e3 }

/**
 * A date bound, as epoch milliseconds: a day (`2026-09-01`, `2026-09`, `2026`)
 * or a span back from now (`36h`, `5d`, `2w`, `3m`, `1y`). `null` when it is
 * neither — the term is then ignored rather than matching nothing.
 *
 * A day is taken at its START for `after:` and at its END for `before:`, so
 * `after:2026-09-01 before:2026-09-01` is that one day.
 */
export function parseDateBound(value: string, edge: 'after' | 'before', now: number = Date.now()): number | null {
  const v = value.trim()
  const span = SPAN.exec(v)
  if (span) return now - parseInt(span[1], 10) * UNIT_MS[span[2].toLowerCase()]
  const day = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(v)
  if (!day) return null
  const y = parseInt(day[1], 10), m = day[2] ? parseInt(day[2], 10) : null, d = day[3] ? parseInt(day[3], 10) : null
  if ((m !== null && (m < 1 || m > 12)) || (d !== null && (d < 1 || d > 31))) return null
  if (edge === 'after') return new Date(y, (m ?? 1) - 1, d ?? 1).getTime()
  // The end of the period named: the last millisecond of the day, the month or the year.
  const next = d !== null ? new Date(y, m! - 1, d + 1) : m !== null ? new Date(y, m, 1) : new Date(y + 1, 0, 1)
  return next.getTime() - 1
}

export interface SearchableCommit { hash: string; shortHash: string; message: string; author: string; authorEmail?: string; date: string }

/**
 * Does a commit answer the query? `required` is what git said for the `file:`
 * terms — absent while there are none, or while the answer is on its way (the
 * graph then narrows by everything else and waits).
 */
export function commitMatches(
  parsed: ParsedSearch, c: SearchableCommit, opts: { required?: ReadonlySet<string> | null; now?: number; textMatch?: boolean } = {},
): boolean {
  const now = opts.now ?? Date.now()
  for (const term of parsed.terms) {
    if (term.op === 'author') {
      const q = term.value.toLowerCase()
      if (!c.author.toLowerCase().includes(q) && !(c.authorEmail ?? '').toLowerCase().includes(q)) return false
    } else if (term.op === 'after' || term.op === 'before') {
      const bound = parseDateBound(term.value, term.op, now)
      if (bound === null) continue
      const at = new Date(c.date).getTime()
      if (isNaN(at)) return false
      if (term.op === 'after' ? at < bound : at > bound) return false
    }
  }
  if (opts.required && !opts.required.has(c.hash)) return false
  return opts.textMatch !== undefined ? opts.textMatch : textMatches(parsed, c)
}

/** The `file:` values of a query — what the host asks git about. */
export function fileTerms(parsed: ParsedSearch): string[] {
  return parsed.terms.filter(t => t.op === 'file').map(t => t.value)
}

/** The free text alone, against message, author and hash — true when there is none. */
export function textMatches(parsed: ParsedSearch, c: SearchableCommit): boolean {
  if (!parsed.text) return true
  const q = parsed.text.toLowerCase()
  return c.message.toLowerCase().includes(q) || c.author.toLowerCase().includes(q) || c.shortHash.toLowerCase().includes(q) || c.hash.startsWith(q)
}

/** The query that narrows to one author — quoted when the name holds a space. */
export function authorQuery(author: string | null): string {
  if (!author) return ''
  return /\s/.test(author) ? `author:"${author}"` : `author:${author}`
}

/** The author a query narrows to, when that is ALL it does — what the contributors list lights up. */
export function authorOfQuery(query: string): string | null {
  const parsed = parseSearchQuery(query)
  return !parsed.text && parsed.terms.length === 1 && parsed.terms[0].op === 'author' ? parsed.terms[0].value : null
}
