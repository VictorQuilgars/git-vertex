// What the model has written here: a kept explanation, a changelog, and the way to the commits they cover.
import { useState } from 'react'
import { Icon, type IconName } from '../Icon/Icon'
import ContextMenu, { MenuItemDef } from '../ContextMenu/ContextMenu'
import { timeAgo } from '../GitHubPanel/GithubRow'
import { useLang } from '../../i18n/LanguageContext'
import { type SubjectState, type ChangelogEntry } from './types'

/**
 * The commits a reading covered, as a chip that shows them in the graph.
 *
 * On the row rather than only in a context menu: this is the answer to "the
 * branch is gone, so what did it say about?" and an answer nobody can find is
 * not one. Present whatever the subject's state — a live branch's commits are
 * as worth pointing at as a merged one's.
 */
export function ShowCommits({ hashes, onShow }: {
  hashes?: string[]
  onShow?: (hashes: string[]) => void
}) {
  const { t } = useLang()
  if (!onShow || !hashes?.length) return null
  return (
    <button
      type="button"
      className="sb-ai-show"
      title={t('sb.ai.showCommits.hint', hashes.length)}
      aria-label={t('sb.ai.showCommits.hint', hashes.length)}
      onClick={e => { e.stopPropagation(); onShow(hashes) }}
    >
      <Icon name="commit" size={9} />
      {hashes.length}
    </button>
  )
}

/** What a kept reading is about, and what it is worth now. */
export function NoteRow({ note, onOpen, onForget, onShowCommits }: {
  note: {
    kind: 'branch' | 'stash' | 'working' | 'commit'
    key: string; title: string; text: string; at: number; sha: string
    newCommits: number
    subject?: SubjectState; landedIn?: string; hashes?: string[]
  }
  onOpen?: () => void
  onForget: () => void
  onShowCommits?: (hashes: string[]) => void
}) {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const { t } = useLang()
  const icon: IconName =
    note.kind === 'branch' ? 'branch'
      : note.kind === 'stash' ? 'stash'
        : note.kind === 'working' ? 'staging' : 'commit'
  // A commit's reading has no age worth showing — its diff cannot change, so
  // "written 3 days ago" says nothing about whether it still holds.
  const meta = note.kind === 'commit'
    ? note.sha.slice(0, 7)
    : timeAgo(new Date(note.at).toISOString(), t)
  const state = note.subject ?? 'live'
  return (
    <>
      <div
        className={`sb-ai-item${onOpen ? '' : ' sb-ai-item--flat'}${state === 'lost' ? ' sb-ai-item--orphan' : ''}`}
        onClick={onOpen}
        onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }}
        title={note.text.length > 300 ? note.text.slice(0, 300) + '…' : note.text}
      >
        <Icon name={icon} size={11} />
        <div className="sb-ai-info">
          <span className="sb-ai-name">{note.title}</span>
          <span className="sb-ai-meta">
            {state === 'lost'
              ? t('sb.ai.gone')
              : state === 'landed'
                ? <>{t('sb.ai.landed', note.landedIn ?? '')} · <code>{meta}</code></>
                : <code>{meta}</code>}
          </span>
        </div>
        <ShowCommits hashes={note.hashes} onShow={onShowCommits} />
        {note.newCommits > 0 && (
          <span className="sb-ai-stale" title={t('ai.changelog.behind', note.newCommits)}>
            +{note.newCommits}
          </span>
        )}
      </div>
      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} onClose={() => setCtx(null)} items={[
          ...(onOpen ? [{ label: t('sb.ai.open'), action: onOpen, icon: 'ai' as const, tone: 'ai' as const }] : []),
          ...(onShowCommits && note.hashes?.length
            ? [{ label: t('sb.ai.showCommits'), action: () => onShowCommits(note.hashes!), icon: 'commit' as const }]
            : []),
          { separator: true } as MenuItemDef,
          { label: t('sb.ai.forget'), action: onForget, danger: true },
        ]} />
      )}
    </>
  )
}

/**
 * A changelog this repository has had written, as a row.
 *
 * It says what it covers and when it was written, and wears a badge when the
 * branch has moved on since — the same "+N" the drawer opens with, because
 * the point of the list is deciding what still applies without opening
 * anything.
 */
export function ChangelogRow({ entry, onOpen, onForget, onShowCommits }: {
  entry: ChangelogEntry
  onOpen?: () => void
  onForget: () => void
  onShowCommits?: (hashes: string[]) => void
}) {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const { t } = useLang()
  const state = entry.subject ?? 'live'
  return (
    <>
      <div
        className={`sb-ai-item${onOpen ? '' : ' sb-ai-item--flat'}${state === 'lost' ? ' sb-ai-item--orphan' : ''}`}
        onClick={onOpen}
        onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }}
        title={entry.text.length > 300 ? entry.text.slice(0, 300) + '…' : entry.text}
      >
        <Icon name="branch" size={11} />
        <div className="sb-ai-info">
          <span className="sb-ai-name">{entry.branch}</span>
          <span className="sb-ai-meta">
            {state === 'lost'
              ? t('sb.ai.gone')
              : state === 'landed'
                ? `${t('sb.ai.landed', entry.landedIn ?? '')} · ${timeAgo(new Date(entry.at).toISOString(), t)}`
                : `${t('ai.changelog.meta', entry.commits, entry.base)} · ${timeAgo(new Date(entry.at).toISOString(), t)}`}
          </span>
        </div>
        <ShowCommits hashes={entry.hashes} onShow={onShowCommits} />
        {entry.newCommits > 0 && (
          <span className="sb-ai-stale" title={t('ai.changelog.behind', entry.newCommits)}>
            +{entry.newCommits}
          </span>
        )}
      </div>
      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} onClose={() => setCtx(null)} items={[
          ...(onOpen ? [{ label: t('sb.ai.open'), action: onOpen, icon: 'ai' as const, tone: 'ai' as const }] : []),
          ...(onShowCommits && entry.hashes?.length
            ? [{ label: t('sb.ai.showCommits'), action: () => onShowCommits(entry.hashes!), icon: 'commit' as const }]
            : []),
          { separator: true } as MenuItemDef,
          { label: t('sb.ai.forget'), action: onForget, danger: true },
        ]} />
      )}
    </>
  )
}
