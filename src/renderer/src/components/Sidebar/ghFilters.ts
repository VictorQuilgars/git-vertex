/**
 * Saved filters of the GitHub sections (§4) — the half that RE-QUERIES.
 *
 * The section's search box is a display lens over what is already loaded;
 * a saved filter is a GitHub search (`/search/issues`) and becomes one more
 * named group beside the defaults. Same mechanism on both sections,
 * different vocabulary — a pull request carries a review cycle, an issue
 * does not.
 *
 * Persistence is per repository, in localStorage — the useBranchMeta
 * pattern. Thought about, not reflexed: a filter is worth more than view
 * state, but the alternative (settings + preload + IPC on one host,
 * globalStorage on the other) still would not sync the two surfaces, so
 * the extra plumbing would buy durability the user cannot see. localStorage
 * it is, keyed by repository name like every other per-repo view state.
 */

export interface GhSavedFilter { name: string; query: string }
export interface GhFilterStore { prs: GhSavedFilter[]; issues: GhSavedFilter[] }

const storeKey = (repoKey: string) => `gv:gh-filters:${repoKey}`

export function loadGhFilters(repoKey: string): GhFilterStore {
  try {
    const raw = localStorage.getItem(storeKey(repoKey))
    if (!raw) return { prs: [], issues: [] }
    const parsed = JSON.parse(raw)
    // A malformed store costs the store, not the section.
    const clean = (a: any): GhSavedFilter[] => Array.isArray(a)
      ? a.filter(f => f && typeof f.name === 'string' && typeof f.query === 'string')
      : []
    return { prs: clean(parsed.prs), issues: clean(parsed.issues) }
  } catch { return { prs: [], issues: [] } }
}

export function saveGhFilters(repoKey: string, store: GhFilterStore): void {
  try { localStorage.setItem(storeKey(repoKey), JSON.stringify(store)) } catch { /* full or blocked: the filter lives for the session */ }
}

/**
 * The vocabulary the editor validates, per section. These are GitHub SEARCH
 * qualifiers — everything a saved filter runs is a search — with the few
 * list-endpoint spellings the spec names accepted as synonyms and rewritten
 * in compose(): creator:→author:, labels:→label:, since:→updated:>=,
 * mentioned:→mentions:.
 */
export const ISSUE_KEYS = [
  'assignee', 'author', 'mentions', 'state', 'milestone', 'label',
  'created', 'updated', 'involves', 'no', 'is', 'sort',
] as const
export const PR_KEYS = [
  'author', 'assignee', 'involves', 'review-requested', 'reviewed-by',
  'base', 'head', 'draft', 'label', 'review', 'status', 'no',
  'created', 'updated', 'state', 'is', 'sort',
] as const

const SYNONYMS: Record<string, string> = {
  creator: 'author', labels: 'label', mentioned: 'mentions', since: 'updated',
}

export function ghFilterKeys(kind: 'prs' | 'issues'): readonly string[] {
  return kind === 'prs' ? PR_KEYS : ISSUE_KEYS
}

/**
 * Live validation: every `key:value` token must use the section's
 * vocabulary (synonyms included); bare words are free text and always fine.
 * Returns the first offending token, so the editor can name it.
 */
export function validateGhQuery(query: string, kind: 'prs' | 'issues'): { ok: true } | { ok: false; bad: string } {
  const allowed = new Set(ghFilterKeys(kind))
  for (const token of query.trim().split(/\s+/)) {
    if (!token || !token.includes(':')) continue
    const rawKey = token.slice(0, token.indexOf(':')).replace(/^-/, '').toLowerCase()
    const key = SYNONYMS[rawKey] ?? rawKey
    const value = token.slice(token.indexOf(':') + 1)
    if (!allowed.has(key) || value === '') return { ok: false, bad: token }
  }
  return { ok: true }
}

/**
 * The query GitHub actually runs: pinned to the repository, typed to the
 * section, synonyms rewritten. The user's own `is:` tokens are kept — they
 * narrow further (is:draft), they cannot widen past the repo pin.
 */
export function composeGhQuery(query: string, kind: 'prs' | 'issues', owner: string, repo: string): string {
  const rewritten = query.trim().split(/\s+/).filter(Boolean).map(token => {
    if (!token.includes(':')) return token
    const neg = token.startsWith('-') ? '-' : ''
    const body = neg ? token.slice(1) : token
    const rawKey = body.slice(0, body.indexOf(':')).toLowerCase()
    const value = body.slice(body.indexOf(':') + 1)
    const key = SYNONYMS[rawKey] ?? rawKey
    if (rawKey === 'since') return `${neg}updated:>=${value}`
    if (rawKey === 'labels') return value.split(',').filter(Boolean).map(v => `${neg}label:${v}`).join(' ')
    return `${neg}${key}:${value}`
  }).join(' ')
  return `repo:${owner}/${repo} ${kind === 'prs' ? 'is:pr' : 'is:issue'} ${rewritten}`.trim()
}

/** Where "the full reference" lives — linked from the editor, not restated. */
export const GH_SEARCH_DOCS_URL =
  'https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests'
