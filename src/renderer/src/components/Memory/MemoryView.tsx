// ── The repository's memory ─────────────────────────────────────────────────
//
// What this repository was asked to hold on to: the searches someone kept, and
// the comparisons. It was a block in the side bar, above the branches, and
// being there it could only ever be a list of names — the side bar has no room
// for what a kept search actually IS, which is a set of commits.
//
// So it is a page, and the page answers the question the list could not: what
// did this search find, and what does it find NOW. A kept search is an
// instantaneous photograph of a live filter over the page the graph held; the
// question it asks is a fact about the repository, and asking git that question
// again is what makes the entry worth keeping rather than a name to click.
//
// The two hosts mount it in their own frame — a tab in the desktop's strip, an
// editor tab in VS Code — and hand it what they can do about a commit: the
// desktop shows it in its graph, the panel asks VS Code to show it in the view.
// Everything a host cannot do is simply not offered rather than dead.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useKept, type KeptEntry } from '../../hooks/useKept'
import { useLang } from '../../i18n/LanguageContext'
import { Icon } from '../Icon/Icon'
import { fileTerms, parseDateBound, parseSearchQuery, type ParsedSearch } from '../../utils/searchQuery'
import type { CommitNode, CompareAxis } from '../../types'
import './Memory.css'

/** The two halves of the memory, named once so a detail pane can say which it takes. */
type KeptSearchEntry = Extract<KeptEntry, { kind: 'search' }>
type KeptComparisonEntry = Extract<KeptEntry, { kind: 'comparison' }>

export interface MemoryViewProps {
  repo: string | null
  /** Named in the header, when the host knows it. */
  repoName?: string
  /** Put this set of commits in front of the user, in the graph. */
  onShowCommits?: (hashes: string[]) => void
  /** One commit, in the graph. */
  onOpenCommit?: (hash: string) => void
  /** A comparison, in whatever this host opens comparisons in. */
  onOpenCompare?: (a: string, b: string | null, axis: CompareAxis, label: string) => void
  /** Put a kept search back in the graph's own field, live again. */
  onRestoreSearch?: (entry: KeptEntry) => void
  showToast?: (message: string, type?: 'ok' | 'err') => void
}

/**
 * The query, in the shape git is asked it (git-core::CommitQuery).
 *
 * `after:2w` is a date only at the moment it is read, which is why it is
 * resolved HERE and not in the core: a span kept in March must mean two weeks
 * before today, not two weeks before the day it was kept.
 */
export function searchQueryForGit(parsed: ParsedSearch, now: number = Date.now()) {
  const values = (op: 'author' | 'after' | 'before') => parsed.terms.filter(term => term.op === op).map(term => term.value)
  const bound = (op: 'after' | 'before') => {
    const raw = values(op)[0]
    const at = raw ? parseDateBound(raw, op, now) : null
    // A bound git cannot read is a bound the live filter ignores too: the
    // search then narrows by everything else rather than by nothing.
    return at === null ? undefined : new Date(at).toISOString()
  }
  return {
    text: parsed.text || undefined,
    authors: values('author'),
    after: bound('after'),
    before: bound('before'),
    paths: fileTerms(parsed),
  }
}

export default function MemoryView(props: MemoryViewProps) {
  const { t } = useLang()
  const kept = useKept(props.repo ?? null)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const entries = kept.entries
  // The first entry until one is chosen — a page that opens on an explanation
  // of itself, when it has something to show, is a page nobody reads twice.
  const picked = entries.find(entry => entry.id === pickedId) ?? entries[0] ?? null
  const groups: [string, KeptEntry[]][] = [
    [t('memory.searches'), entries.filter(entry => entry.kind === 'search')],
    [t('memory.comparisons'), entries.filter(entry => entry.kind === 'comparison')],
  ]

  return (
    <div className="view-page mem">
      <div className="view-page-header">
        <Icon name="bookmark" size={15} />
        <span className="view-page-title">{props.repoName ? t('memory.of', props.repoName) : t('memory.title')}</span>
        {kept.error && <span className="mem-error" role="alert">{t('kept.error')}</span>}
      </div>
      <div className="view-page-body mem-body">
        <div className="mem-list" aria-label={t('memory.title')}>
          {!entries.length && <div className="mem-empty">{t('kept.empty')}</div>}
          {groups.map(([title, rows]) => rows.length > 0 && (
            <section className="mem-group" key={title} aria-label={title}>
              <div className="mem-group-head">{title}</div>
              {rows.map(entry => (
                <MemoryRow key={entry.id} entry={entry} on={entry.id === picked?.id}
                  onPick={() => setPickedId(entry.id)}
                  onRename={name => void kept.rename(entry.id, name)}
                  onRemove={() => void kept.remove(entry.id)} />
              ))}
            </section>
          ))}
        </div>
        <div className="mem-detail">
          {!picked ? <div className="mem-empty">{t('memory.pick')}</div>
            : picked.kind === 'search'
              ? <MemorySearch key={picked.id} entry={picked} onAnswer={hashes => kept.answer(picked.id, hashes)} {...props} />
              : <MemoryComparison key={picked.id} entry={picked} {...props} />}
        </div>
      </div>
    </div>
  )
}

/** One kept thing in the left-hand list: what it is, what it is called, when it was kept. */
function MemoryRow({ entry, on, onPick, onRename, onRemove }: {
  entry: KeptEntry; on: boolean
  onPick: () => void; onRename: (name: string) => void; onRemove: () => void
}) {
  const { t } = useLang()
  const [editing, setEditing] = useState(false)
  return (
    <div className={`mem-row${on ? ' mem-row--on' : ''}`}>
      {editing ? (
        <input className="mem-rename" autoFocus aria-label={t('kept.name')} defaultValue={entry.name}
          onBlur={e => { onRename(e.target.value); setEditing(false) }}
          onKeyDown={e => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') { e.currentTarget.value = entry.name; e.currentTarget.blur() }
          }} />
      ) : (
        <button className="mem-row-open" onClick={onPick} title={entry.name} aria-pressed={on}>
          <Icon name={entry.kind === 'comparison' ? 'compare' : 'search'} size={12} />
          <span className="mem-row-name">{entry.name}</span>
          <time className="mem-row-when" dateTime={new Date(entry.at).toISOString()}>
            {new Date(entry.at).toLocaleDateString(t('graph.dateLocale'))}
          </time>
        </button>
      )}
      <button className="mem-row-act" title={t('kept.rename')} aria-label={`${t('kept.rename')}: ${entry.name}`}
        onClick={() => setEditing(true)}>✎</button>
      <button className="mem-row-act" title={t('kept.remove')} aria-label={`${t('kept.remove')}: ${entry.name}`}
        onClick={onRemove}>×</button>
    </div>
  )
}

/** Where an answer on screen comes from: what was kept, or what git (or the model) says now. */
type Answer = { commits: CommitNode[]; from: 'kept' | 'fresh'; missing: number }

function MemorySearch({ entry, onAnswer, onShowCommits, onOpenCommit, onOpenCompare, onRestoreSearch, showToast }: MemoryViewProps & {
  entry: KeptSearchEntry
  onAnswer: (hashes: string[]) => void
}) {
  const { t } = useLang()
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [loading, setLoading] = useState(true)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const keptHashes = useMemo(() => entry.hashes ?? [], [entry.hashes])
  const keptSet = useMemo(() => new Set(keptHashes), [keptHashes])
  const parsed = useMemo(() => parseSearchQuery(entry.query), [entry.query])

  /** Ask the question again — of git, or of the model when the model answered it. */
  const ask = useCallback(async () => {
    setAsking(true)
    setError(null)
    try {
      let commits: CommitNode[] = []
      if (entry.ai) {
        const answered = await (window.gitAPI as any).aiSearchCommits(entry.query)
        if (answered?.error) throw new Error(answered.error === 'NO_API_KEY' ? t('toast.noAiKey') : answered.error)
        commits = (await window.gitAPI.commitsByHash(answered?.hashes ?? []))?.commits ?? []
      } else if (entry.diffs) {
        // It was asked of the diffs, so it is asked of the diffs again: the
        // commits that ADD or REMOVE the words are not the commits that
        // mention them, and answering the second under the first's name would
        // be a different search wearing the kept one's title.
        const found = await window.gitAPI.searchInDiffs(parsed.text.trim())
        commits = (await window.gitAPI.commitsByHash(found?.hashes ?? []))?.commits ?? []
      } else {
        const found = await window.gitAPI.searchCommits(searchQueryForGit(parsed))
        if (found?.error) throw new Error(found.error)
        commits = found?.commits ?? []
      }
      setAnswer({ commits, from: 'fresh', missing: 0 })
    } catch (e: any) {
      setError(e?.message || t('memory.askError'))
    } finally {
      setAsking(false)
    }
  }, [entry.ai, entry.diffs, entry.query, parsed, t])

  // What it kept — or, when it kept no commit (a filter the graph answered on
  // its own page), the question asked now, which is all there is to show.
  useEffect(() => {
    let stale = false
    setError(null)
    setLoading(true)
    const load = async () => {
      if (!keptHashes.length) { await ask(); return }
      const back = await window.gitAPI.commitsByHash(keptHashes)
      if (stale) return
      const commits = back?.commits ?? []
      setAnswer({ commits, from: 'kept', missing: Math.max(0, keptHashes.length - commits.length) })
    }
    load().catch(() => { if (!stale) setError(t('memory.loadError')) })
      .finally(() => { if (!stale) setLoading(false) })
    return () => { stale = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id])

  const commits = answer?.commits ?? []
  const hashes = commits.map(commit => commit.hash)
  // Against the kept answer, and only when there was one to be against.
  const unkept = answer?.from === 'fresh' && keptHashes.length ? commits.filter(commit => !keptSet.has(commit.hash)) : []
  const changed = answer?.from === 'fresh' && keptHashes.length > 0
    && (hashes.length !== keptHashes.length || hashes.some(hash => !keptSet.has(hash)))

  return (
    <div className="mem-pane">
      <div className="mem-head">
        <h2 className="mem-name">{entry.name}</h2>
        <div className="mem-query">
          {parsed.terms.map((term, i) => (
            <span className="mem-chip" key={`${term.start}-${i}`}><span className="mem-chip-op">{term.op}:</span>{term.value}</span>
          ))}
          {parsed.text && <span className="mem-chip mem-chip--text">{parsed.text}</span>}
          {entry.ai && <span className="mem-chip mem-chip--ai"><Icon name="ai" size={11} />{t('memory.ai')}</span>}
          {!entry.ai && entry.diffs && <span className="mem-chip"><Icon name="editor" size={11} />{t('memory.diffs')}</span>}
        </div>
        <div className="mem-meta">
          <span>{t('memory.keptOn', new Date(entry.at).toLocaleString(t('graph.dateLocale')))}</span>
          {answer && <span>·</span>}
          {answer && <span>{
            answer.from === 'kept' ? t('memory.count', commits.length)
              : !keptHashes.length ? t('memory.count', commits.length)
                : unkept.length ? t('memory.answer', commits.length, unkept.length)
                  : t('memory.answerSame', commits.length)
          }</span>}
        </div>
        {!!answer?.missing && <div className="mem-note">{t('memory.gone', answer.missing)}</div>}
        {error && <div className="mem-note mem-note--err" role="alert">{error}</div>}
      </div>

      <div className="mem-actions">
        <button className="mem-btn" disabled={asking} onClick={() => void ask()}
          title={t(entry.ai ? 'memory.askAiTitle' : 'memory.askTitle')}>
          <Icon name="refresh" size={12} />{t(asking ? 'memory.asking' : 'memory.ask')}
        </button>
        {changed && (
          <button className="mem-btn" onClick={() => { onAnswer(hashes); showToast?.(t('memory.updated')) }}>
            <Icon name="bookmark" size={12} />{t('memory.update')}
          </button>
        )}
        {onShowCommits && (
          <button className="mem-btn" disabled={!hashes.length} onClick={() => onShowCommits(hashes)}>
            <Icon name="node" size={12} />{t('memory.showInGraph')}
          </button>
        )}
        {onRestoreSearch && (
          <button className="mem-btn" onClick={() => onRestoreSearch(entry)}>
            <Icon name="search" size={12} />{t('memory.restore')}
          </button>
        )}
        {onOpenCompare && (
          <button className="mem-btn" disabled={commits.length < 2}
            onClick={() => onOpenCompare(commits[commits.length - 1].hash, commits[0].hash, 'endpoints', entry.name)}>
            <Icon name="compare" size={12} />{t('memory.compareEnds')}
          </button>
        )}
        <button className="mem-btn" disabled={!hashes.length}
          onClick={() => { void navigator.clipboard.writeText(hashes.join('\n')); showToast?.(t('memory.copied')) }}>
          <Icon name="copy" size={12} />{t('memory.copy')}
        </button>
      </div>

      <div className="mem-commits">
        {loading || asking ? <div className="mem-empty">{t('common.loading')}</div>
          : !commits.length ? <div className="mem-empty">{t('memory.none')}</div>
            : commits.map(commit => (
              <CommitRow key={commit.hash} commit={commit} onOpen={onOpenCommit}
                fresh={unkept.some(one => one.hash === commit.hash)} />
            ))}
      </div>
    </div>
  )
}

function CommitRow({ commit, fresh, onOpen }: { commit: CommitNode; fresh: boolean; onOpen?: (hash: string) => void }) {
  const { t } = useLang()
  const body = (
    <>
      <code className="mem-sha">{commit.shortHash}</code>
      <span className="mem-subject">{commit.message}</span>
      {fresh && <span className="mem-new">{t('memory.new')}</span>}
      <span className="mem-author">{commit.author}</span>
      <time className="mem-when" dateTime={commit.date}>
        {commit.date ? new Date(commit.date).toLocaleDateString(t('graph.dateLocale')) : ''}
      </time>
    </>
  )
  // A row is a button only where the host can do something with a commit; a
  // disabled button in its place would offer, and refuse, on every row.
  return onOpen
    ? <button className="mem-commit mem-commit--open" onClick={() => onOpen(commit.hash)} title={commit.message}>{body}</button>
    : <div className="mem-commit" title={commit.message}>{body}</div>
}

function MemoryComparison({ entry, onOpenCompare }: MemoryViewProps & { entry: KeptComparisonEntry }) {
  const { t } = useLang()
  const [files, setFiles] = useState<{ path: string }[] | null>(null)
  const reviewed = useMemo(() => new Set(entry.reviewed), [entry.reviewed])
  const against = entry.b === null ? t('memory.workingTree') : entry.b

  useEffect(() => {
    let stale = false
    window.gitAPI.filesBetweenCommits(entry.a, entry.b, entry.axis)
      .then((r: any) => { if (!stale) setFiles(r?.files ?? []) })
      .catch(() => { if (!stale) setFiles([]) })
    return () => { stale = true }
  }, [entry.a, entry.b, entry.axis])

  const open = () => onOpenCompare?.(entry.a, entry.b, entry.axis, entry.name)
  return (
    <div className="mem-pane">
      <div className="mem-head">
        <h2 className="mem-name">{entry.name}</h2>
        <div className="mem-query">
          <span className="mem-chip"><code>{entry.a}</code></span>
          <span className="mem-axis">{entry.axis === 'diverged' ? '…' : '‥'}</span>
          <span className="mem-chip"><code>{against}</code></span>
        </div>
        <div className="mem-meta">
          <span>{t('memory.keptOn', new Date(entry.at).toLocaleString(t('graph.dateLocale')))}</span>
          <span>·</span>
          <span>{files === null ? t('common.loading')
            : entry.reviewed.length ? t('memory.reviewed', entry.reviewed.length, files.length)
              : t('memory.reviewedNone')}</span>
        </div>
      </div>
      <div className="mem-actions">
        {onOpenCompare && (
          <button className="mem-btn" onClick={open}>
            <Icon name="compare" size={12} />{t('memory.openComparison')}
          </button>
        )}
      </div>
      <div className="mem-commits">
        {(files ?? []).map(file => (
          <div className="mem-commit" key={file.path}>
            <span className={`mem-tick${reviewed.has(file.path) ? ' mem-tick--on' : ''}`}>
              {reviewed.has(file.path) ? <Icon name="check" size={11} /> : null}
            </span>
            <span className="mem-subject">{file.path}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
