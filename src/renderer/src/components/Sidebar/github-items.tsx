// The GitHub lists: a saved filter, its editor, and the group that shows what it found.
import React, { useState, useRef, useEffect } from 'react'
import { Icon } from '../Icon/Icon'
import ContextMenu from '../ContextMenu/ContextMenu'
import { validateGhQuery, composeGhQuery, ghFilterSyntax, ghFilterSuggest, GH_SEARCH_DOCS_URL, type GhSavedFilter } from './ghFilters'
import { type GithubListItem } from './types'

/** §2's lens: does a row survive the section's search box? */
export function ghMatch(item: GithubListItem, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return item.title.toLowerCase().includes(needle)
    || String(item.number).includes(needle)
    || (item.author ?? '').toLowerCase().includes(needle)
}

// ── §4: the filter editor of a section — beside the list, not over it ────
export function GhFilterEditor({ kind, initial, draft, repoLabel, existing, onCreate, onCancel, onDraft, t }: {
  kind: 'prs' | 'issues'
  /**
   * An existing filter being edited. This — and only this — is what makes the
   * button read Save: a restored draft is still a filter being CREATED.
   */
  initial?: GhSavedFilter
  /** Text kept from a previous open, so closing the drawer loses nothing. */
  draft?: GhSavedFilter
  /** `owner/repo` — the field says WHICH repository it will filter. */
  repoLabel: string
  /**
   * What this section already has. Two filters with the same name are two
   * identical rows in the panel, told apart by nothing — which is what the
   * editor let happen, since it only ever appended.
   */
  existing: readonly GhSavedFilter[]
  onCreate: (f: GhSavedFilter) => void
  onCancel: () => void
  /** Reported as it is typed, so closing the drawer does not lose it (#145). */
  onDraft?: (f: GhSavedFilter) => void
  t: (k: any, ...a: any[]) => string
}) {
  const [name, setName] = useState(initial?.name ?? draft?.name ?? '')
  const [query, setQuery] = useState(initial?.query ?? draft?.query ?? '')
  useEffect(() => { onDraft?.({ name, query }) }, [name, query])

  // The query label points at its input with `for`: the field's header row
  // also holds a button, so the input cannot be found by wrapping.
  const queryId = `gv-fedit-query-${kind}`

  // ── Completion ────────────────────────────────────────────────
  // What to offer is `ghFilterSuggest`'s call, not this component's: it knows
  // the vocabulary, the section and where the token the caret sits in begins.
  const queryRef = useRef<HTMLInputElement | null>(null)
  const [caret, setCaret] = useState(0)
  const [picking, setPicking] = useState(false)
  const [pick, setPick] = useState(0)
  const suggest = picking ? ghFilterSuggest(query, caret, kind) : null
  useEffect(() => { setPick(0) }, [suggest?.options.join(' ')])

  const accept = (option: string) => {
    if (!suggest) return
    const next = query.slice(0, suggest.from) + option + query.slice(suggest.to)
    setQuery(next)
    // A qualifier lands with its colon and the caret after it, so the value
    // list opens straight away; a value is finished, so a space follows.
    const at = suggest.from + option.length
    setPicking(suggest.kind === 'key')
    requestAnimationFrame(() => {
      const el = queryRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(at, at)
      setCaret(at)
    })
  }

  // ── Described in words ────────────────────────────────────────
  // The field is summoned, not resident: a filter is usually typed, and the
  // drawer at rest should not present describing as a third thing to fill in.
  const [describing, setDescribing] = useState(false)
  const [described, setDescribed] = useState('')
  const [asking, setAsking] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  // Folding keeps the sentence — reopening must not mean retyping — but not
  // the complaint, which is about an attempt that is over.
  const toggleDescribe = () => { setAiError(null); setDescribing(d => !d) }

  const askForQuery = async () => {
    if (!described.trim() || asking) return
    setAsking(true); setAiError(null)
    const vocabulary = ghFilterSyntax(kind).map(k => `${k.syntax}   (${k.label})`).join('\n')
    const r = await ((window.gitAPI as any).aiFilterQuery?.(kind, described, vocabulary)
      ?? Promise.resolve({ error: 'not-implemented' })).catch((e: any) => ({ error: e.message }))
    setAsking(false)
    if (r?.error || !r?.query) { setAiError(r?.error ?? 'empty answer'); return }

    // ⚠️ The answer is CHECKED before it is used. Every other AI action here
    // proposes prose a person reads; this one proposes a query, and the same
    // validator a typed query goes through can say whether it is one. Writing
    // an invalid query into the field as though it were fine would be a
    // choice, and the wrong one (#150).
    const v = validateGhQuery(r.query, kind)
    if (!v.ok) { setAiError(t('sb.gh.filter.aiBadToken', (v as any).bad)); return }
    setQuery(r.query)
    // The sentence that was typed is usually a better name than most.
    if (!name.trim()) setName(described.trim().slice(0, 40))
    // An answer that landed folds the row, and focus goes where the verdict
    // shows — the query field. Without the completion list: it opens for
    // typing, and nothing was typed there.
    setDescribing(false)
    requestAnimationFrame(() => {
      const el = queryRef.current
      if (!el) return
      el.focus()
      const at = el.value.length
      el.setSelectionRange(at, at)
      setCaret(at)
      setPicking(false)
    })
  }

  const onQueryKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggest) {
      // Escape with no list open belongs to the drawer, which closes on it.
      if (e.key === 'ArrowDown') { setPicking(true); e.preventDefault() }
      return
    }
    if (e.key === 'ArrowDown') { setPick(i => (i + 1) % suggest.options.length); e.preventDefault() }
    else if (e.key === 'ArrowUp') { setPick(i => (i - 1 + suggest.options.length) % suggest.options.length); e.preventDefault() }
    else if (e.key === 'Enter' || e.key === 'Tab') { accept(suggest.options[pick]); e.preventDefault() }
    else if (e.key === 'Escape') {
      // The list goes first; the drawer only closes once there is no list.
      setPicking(false); e.preventDefault(); e.stopPropagation()
    }
  }
  const verdict = validateGhQuery(query, kind)

  // The one being edited is not a clash with itself.
  const others = existing.filter(f => !(initial && f.name === initial.name && f.query === initial.query))
  const nameTaken = !!name.trim()
    && others.some(f => f.name.trim().toLowerCase() === name.trim().toLowerCase())
  // A different name for a query that already exists is not refused — two
  // views on the same search can be deliberate — but it is said, because it is
  // usually a mistake.
  const sameQueryAs = query.trim()
    ? others.find(f => f.query.trim() === query.trim())?.name
    : undefined

  const ready = name.trim() !== '' && query.trim() !== '' && verdict.ok && !nameTaken
  return (
    <div className="sb-gh-fedit">
      {/* Labels above their fields, and a placeholder that says what to type
          rather than showing an example of the answer. */}
      <label className="sb-gh-fedit-field">
        <span className="sb-gh-fedit-label">{t('sb.gh.filter.nameLabel')}</span>
        <input className="sb-gh-fedit-name" placeholder={t('sb.gh.filter.namePlaceholder')} autoFocus
          value={name} onChange={e => setName(e.target.value)} />
      </label>

      {/* A div, not a wrapping label: the describe trigger is a button, and a
          button inside a bare label becomes the label's target. */}
      <div className="sb-gh-fedit-field">
        <span className="sb-gh-fedit-label sb-gh-fedit-label--split">
          <label htmlFor={queryId}>
            {kind === 'prs' ? t('sb.gh.filter.queryPrs', repoLabel) : t('sb.gh.filter.queryIssues', repoLabel)}
          </label>
          {/* The way in to describing it in words, on the line of the field it
              fills — a way of writing the query, not a third field. In the AI
              ink, and quiet: what a model proposes is a proposal. */}
          <button type="button" className="sb-gh-fedit-describe-open"
            aria-expanded={describing} onClick={toggleDescribe}>
            <Icon name="ai" size={13} />
            {t('sb.gh.filter.describeLabel')}
          </button>
        </span>
        <div className={`sb-gh-fedit-querybox${query.trim() && !verdict.ok ? ' sb-gh-fedit-querybox--bad' : ''}`}>
          {/* The verdict lives IN the field: it is about what is typed there. */}
          <Icon name={query.trim() && !verdict.ok ? 'conflict' : 'check'} size={13}
            className={query.trim() && !verdict.ok ? 'sb-gh-fedit-mark--bad' : 'sb-gh-fedit-mark--ok'} />
          <input id={queryId} className="sb-gh-fedit-query" ref={queryRef}
            placeholder={kind === 'prs' ? t('sb.gh.filter.queryPrsPlaceholder') : t('sb.gh.filter.queryIssuesPlaceholder')}
            value={query}
            onChange={e => { setQuery(e.target.value); setCaret(e.target.selectionStart ?? 0); setPicking(true) }}
            onSelect={e => setCaret((e.target as HTMLInputElement).selectionStart ?? 0)}
            onFocus={() => setPicking(true)}
            onBlur={() => setTimeout(() => setPicking(false), 120)}
            onKeyDown={onQueryKey} />
          {suggest && (
            <ul className="sb-gh-fedit-suggest" role="listbox">
              {suggest.options.map((o, i) => (
                <li key={o} role="option" aria-selected={i === pick}
                  className={`sb-gh-fedit-option${i === pick ? ' sb-gh-fedit-option--on' : ''}`}
                  // mousedown, not click: blur would close the list first.
                  onMouseDown={e => { e.preventDefault(); accept(o) }}
                  onMouseEnter={() => setPick(i)}>
                  {o}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* A bad token is NAMED, not just refused. */}
      {query.trim() !== '' && !verdict.ok && (
        <div className="sb-gh-fedit-bad">{t('sb.gh.filter.badToken', (verdict as any).bad)}</div>
      )}

      {/* The summoned row: the sentence, and the button that turns it into a
          query. It sits under the field it writes. */}
      {describing && (
        <div className="sb-gh-fedit-describe">
          <input className="sb-gh-fedit-name" value={described} autoFocus
            placeholder={t('sb.gh.filter.describePlaceholder')}
            onChange={e => setDescribed(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); void askForQuery() }
              // The row goes first; the drawer only closes once there is no row.
              else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); toggleDescribe() }
            }} />
          <button type="button" className="sb-gh-fedit-ask"
            disabled={!described.trim() || asking}
            onClick={() => void askForQuery()}>
            <Icon name="ai" size={13} />
            {asking ? t('sb.gh.filter.asking') : t('sb.gh.filter.ask')}
          </button>
        </div>
      )}
      {describing && aiError && <div className="sb-gh-fedit-bad">{aiError}</div>}

      {nameTaken && <div className="sb-gh-fedit-bad">{t('sb.gh.filter.nameTaken', name.trim())}</div>}
      {!nameTaken && sameQueryAs && (
        <div className="sb-gh-fedit-note">{t('sb.gh.filter.sameQuery', sameQueryAs)}</div>
      )}

      <button className="sb-gh-fedit-create" disabled={!ready}
        onClick={() => onCreate({ name: name.trim(), query: query.trim() })}>
        {initial ? t('sb.gh.filter.save') : t('sb.gh.filter.create')}
      </button>

      {/* The reference, in the room the drawer bought (#145). Keys alone said a
          token exists without saying what may follow the colon — which is the
          half that makes a query writable. */}
      <div className="sb-gh-fedit-syntax">
        <div className="sb-gh-fedit-syntax-head">
          {kind === 'prs' ? t('sb.gh.filter.syntaxPrs') : t('sb.gh.filter.syntaxIssues')}
        </div>
        <p className="sb-gh-fedit-syntax-more">
          {kind === 'prs' ? t('sb.gh.filter.readMorePrs') : t('sb.gh.filter.readMoreIssues')}{' '}
          <a className="sb-gh-fedit-link"
            onClick={() => (window.gitAPI as any).openExternal?.(GH_SEARCH_DOCS_URL)}>
            {t('sb.gh.filter.docs')}
          </a>
        </p>
        <div className="sb-gh-fedit-syntax-head sb-gh-fedit-syntax-by">
          {kind === 'prs' ? t('sb.gh.filter.filterBy') : t('sb.gh.filter.operators')}
        </div>
        <dl className="sb-gh-fedit-keys">
          {ghFilterSyntax(kind).map(k => (
            <div key={k.key} className="sb-gh-fedit-keyrow">
              <dt>{k.label}:</dt>
              {/* Clicking it writes the qualifier into the query — the
                  reference is usable, not only readable. */}
              <dd>
                <button type="button" className="sb-gh-fedit-key"
                  title={t('sb.gh.filter.addKey', k.key)}
                  onClick={() => setQuery(q => (q.trim() ? `${q.trim()} ` : '') + `${k.key}:`)}>
                  {k.syntax}
                </button>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

// ── §4: a saved filter is one more named group, and it RE-QUERIES ─────────
// Its life is its own: a malformed or refused query costs this group alone,
// never the section. The count is the search's total, and when GitHub sent
// fewer rows than it counted, the tail row says so instead of letting the
// group read as complete.
export function GhFilterGroup({ filter, kind, repo, refreshOn, refreshTick = 0, pollTick = 0, renderItem, onOpen, onEdit, onDelete, t }: {
  filter: GhSavedFilter
  kind: 'prs' | 'issues'
  repo: { owner: string; repo: string }
  refreshOn: unknown
  /**
   * Bumped by the section's refresh button. It is not just another dependency:
   * a run it triggers passes `force` to the search, because that call is cached
   * for 20 seconds (`github:search-issues`). Without it, the one click a user
   * makes BECAUSE the list looks wrong returns the same wrong list, and the
   * button reads as broken.
   */
  refreshTick?: number
  /**
   * Bumped by the background poll (#141). Unlike `refreshTick` it does NOT
   * force: the search's own 20-second cache absorbs it, so a saved filter
   * stays current without each one costing a request every tick against an
   * API capped at thirty a minute.
   */
  pollTick?: number
  renderItem: (item: GithubListItem, kind: 'pr' | 'issue') => React.ReactNode
  onOpen?: (url: string) => void
  onEdit: () => void
  onDelete: () => void
  t: (k: any, ...a: any[]) => string
}) {
  // Closed by default, for the same reason as GhGroup above.
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<{ total: number; items: any[] } | { error: string } | null>(null)
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const q = composeGhQuery(filter.query, kind, repo.owner, repo.repo)
  // Which run this is: the tick moving means a person asked for it.
  const seenTick = useRef(refreshTick)
  useEffect(() => {
    let alive = true
    const forced = seenTick.current !== refreshTick
    seenTick.current = refreshTick
    setState(null)
    ;(window.gitAPI as any).githubSearchIssues?.(q, forced)
      .then((r: any) => {
        if (!alive) return
        if (r?.error) setState({ error: r.error === 'rate_limited' ? t('sb.gh.filter.rateLimited', r.retryIn ?? 60) : r.error })
        else setState({ total: r?.total ?? 0, items: r?.items ?? [] })
      })
      .catch((e: any) => { if (alive) setState({ error: e.message }) })
    return () => { alive = false }
  }, [q, refreshOn, refreshTick, pollTick, t])

  const failed = state && 'error' in state
  const result = state && !('error' in state) ? state : null
  return (
    <div className="sb-gh-group">
      <div className={`sb-gh-group-head${open ? ' sb-gh-group-head--open' : ''}`}
        onClick={() => setOpen(o => !o)}
        onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }}>
        <Icon name="play" size={8} />
        <Icon name="sliders" size={10} />
        <span className="sb-gh-group-title">{filter.name}</span>
        <span className="sb-gh-group-count">{result ? result.total : '…'}</span>
      </div>
      {failed && <div className="sb-gh-filter-error">{(state as any).error}</div>}
      {open && result && result.items.length > 0 && (
        <div className="sb-gh-group-body">
          {result.items.map((x: any) => renderItem({
            number: x.number, title: x.title, url: x.url, author: x.author,
            draft: x.draft, createdAt: x.createdAt, comments: x.comments,
            labels: x.labels, body: x.body,
          }, x.type === 'pr' ? 'pr' : 'issue'))}
          {result.total > result.items.length && (
            <button className="sb-gh-more"
              onClick={() => onOpen?.(`https://github.com/search?q=${encodeURIComponent(q)}`)}>
              {t('sb.gh.filter.more', result.total - result.items.length)}
            </button>
          )}
        </div>
      )}
      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} onClose={() => setCtx(null)}
          items={[
            { label: t('sb.gh.filter.edit'), action: onEdit },
            { label: t('sb.gh.filter.delete'), action: onDelete },
          ]} />
      )}
    </div>
  )
}

// ── A named group inside a GitHub section (§1 bis) ───────────────
// Collapses on its own and carries its own count. A group with nothing in
// it still shows, with its 0 — that is what says the query ran. Groups that
// cannot run (the account ones, with nobody signed in) are not rendered at
// all by the caller, which is a different statement.
export function GhGroup({ title, count, children, defaultOpen = false }: {
  title: string
  count: number
  children: React.ReactNode
  /**
   * Closed by default, like the sections themselves. Four groups and every
   * saved filter opening at once buries the branches under a section that was
   * meant to be read beside them — and the count on each header already says
   * what is behind it, which is what makes a folded group informative rather
   * than hidden.
   */
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="sb-gh-group">
      <div className={`sb-gh-group-head${open ? ' sb-gh-group-head--open' : ''}`}
        onClick={() => setOpen(o => !o)}>
        <Icon name="play" size={8} />
        <span className="sb-gh-group-title">{title}</span>
        <span className="sb-gh-group-count">{count}</span>
      </div>
      {open && count > 0 && <div className="sb-gh-group-body">{children}</div>}
    </div>
  )
}
