import { useState, useEffect, useCallback, useRef } from 'react'
import { Icon } from '../Icon/Icon'
import MdLite from '../GitHubPanel/mdLite'
import { LabelChip, timeAgo, type GithubLabel } from '../GitHubPanel/GithubRow'
import { useLang } from '../../i18n/LanguageContext'
import './IssueDetail.css'

/**
 * The issue, read and edited in place — §3 bis of the GitHub integration.
 *
 * This component is only the CONTENT of the third layout; the host decides
 * the frame. The layout's contract lives there: toolbar kept, left panel
 * kept (it is the list being navigated — the reason this is not a tab),
 * graph replaced by this, and the commit panel NOT shown, because there is
 * no commit in this context. The side column here belongs to the issue —
 * it is not the commit panel wearing another hat.
 *
 * Reads and writes go through the five §3 bis endpoints, which exist on
 * both hosts. Every edit is optimistic in the small sense only: the field
 * updates locally after the PATCH succeeds, never before, and a failure is
 * written where the edit happened.
 */
export interface IssueDetailItem {
  number: number
  title: string
  url: string
  author?: string
  createdAt?: string
  body?: string
  labels?: GithubLabel[]
  assignees?: string[]
}

interface Comment { author: string; createdAt: string; body: string }

function api(): any { return window.gitAPI as any }

/** Close the editor when the click lands anywhere outside the block. */
export function useClickAway(active: boolean, onAway: () => void) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!active) return
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onAway()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [active, onAway])
  return ref
}

/**
 * A titled block of the side column. While its editor is open the pencil is
 * a ×, and a click anywhere else closes it — an editor is left, not
 * submitted: every toggle inside it already went to GitHub.
 */
export function SideBlock({ label, editing, onToggleEdit, children }: {
  label: string; editing?: boolean; onToggleEdit?: () => void; children: React.ReactNode
}) {
  const close = useCallback(() => { if (editing) onToggleEdit?.() }, [editing, onToggleEdit])
  const ref = useClickAway(!!editing, close)
  return (
    <div className="idv-block" ref={ref}>
      <div className="idv-block-head">
        <span className="idv-label">{label}</span>
        {onToggleEdit && (
          <button className="idv-pencil" onClick={onToggleEdit}>
            {editing ? '×' : <Icon name="pencil" size={11} />}
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

/**
 * The picker over a fetched universe — assignees or labels. A search field
 * on top, and every toggle applies IMMEDIATELY: there is no Save, the way
 * out is the × or a click elsewhere. `chosen` is the source of truth from
 * the parent, so a toggle the PATCH refused never shows as done.
 */
export function PickerEditor({ options, chosen, onPick, render, placeholder, busy }: {
  options: string[]
  chosen: string[]
  onPick: (next: string[]) => void
  render?: (name: string) => React.ReactNode
  placeholder: string
  busy?: boolean
}) {
  const [q, setQ] = useState('')
  // What was already on the issue comes FIRST — and the order is frozen at
  // open: re-sorting on every toggle would move rows under the pointer.
  const atOpen = useRef<string[]>(chosen)
  const ordered = [...options].sort((a, b) =>
    Number(atOpen.current.includes(b)) - Number(atOpen.current.includes(a)))
  const needle = q.trim().toLowerCase()
  const shown = needle ? ordered.filter(o => o.toLowerCase().includes(needle)) : ordered
  return (
    <div className="idv-picker">
      <input className="idv-picker-search" placeholder={placeholder} autoFocus
        value={q} onChange={e => setQ(e.target.value)} />
      <div className="idv-picker-list">
        {shown.map(name => {
          const has = chosen.includes(name)
          return (
            <button key={name} className="idv-pick-row" disabled={busy}
              onClick={() => onPick(has ? chosen.filter(c => c !== name) : [...chosen, name])}>
              <span className="idv-pick-check">{has && <Icon name="check" size={12} />}</span>
              {render ? render(name) : <span>{name}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function IssueDetail({ repo, item, onClose, onCreateBranch, onChanged }: {
  repo: { owner: string; repo: string }
  item: IssueDetailItem
  onClose: () => void
  /** Same call as the list's context menu — a second entry point, not new behaviour. */
  onCreateBranch?: (issue: { number: number; title: string; url: string }) => void
  /** After any successful write: the host refreshes the lists this came from. */
  onChanged?: () => void
}) {
  const { t } = useLang()
  const [title, setTitle] = useState(item.title)
  const [body, setBody] = useState(item.body ?? '')
  const [state, setIssueState] = useState<'open' | 'closed'>('open')
  const [labels, setLabels] = useState<GithubLabel[]>(item.labels ?? [])
  const [assignees, setAssignees] = useState<string[]>(item.assignees ?? [])
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [newComment, setNewComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(item.title)
  const [editingBody, setEditingBody] = useState(false)
  const [bodyDraft, setBodyDraft] = useState(item.body ?? '')
  const [editingAssignees, setEditingAssignees] = useState(false)
  const [editingLabels, setEditingLabels] = useState(false)
  const [editingState, setEditingState] = useState(false)
  const [allAssignees, setAllAssignees] = useState<string[] | null>(null)
  const [allLabels, setAllLabels] = useState<GithubLabel[] | null>(null)

  const loadComments = useCallback(() => {
    api().githubIssueComments(repo.owner, repo.repo, item.number).then((r: any) => {
      if (r?.comments) setComments(r.comments)
      else setError(r?.error ?? 'error')
    }).catch((e: any) => setError(e.message))
  }, [repo.owner, repo.repo, item.number])

  useEffect(() => { loadComments() }, [loadComments])

  /** One write path: PATCH, then apply locally, then tell the host. */
  const patch = useCallback(async (p: object, apply: () => void) => {
    setBusy(true); setError(null)
    const r = await api().githubUpdateIssue(repo.owner, repo.repo, item.number, p).catch((e: any) => ({ error: e.message }))
    setBusy(false)
    if (r?.success) { apply(); onChanged?.() }
    else setError(r?.error ?? 'error')
    return !!r?.success
  }, [repo.owner, repo.repo, item.number, onChanged])

  const saveTitle = async () => {
    const next = titleDraft.trim()
    if (!next || next === title) { setEditingTitle(false); setTitleDraft(title); return }
    if (await patch({ title: next }, () => setTitle(next))) setEditingTitle(false)
  }
  const saveBody = async () => {
    if (await patch({ body: bodyDraft }, () => setBody(bodyDraft))) setEditingBody(false)
  }
  const setState = (next: 'open' | 'closed') => {
    if (next === state) { setEditingState(false); return }
    void patch({ state: next }, () => setIssueState(next)).then(ok => { if (ok) setEditingState(false) })
  }

  const toggleAssigneesEditor = () => {
    setEditingAssignees(v => !v)
    if (allAssignees === null) {
      api().githubListAssignees(repo.owner, repo.repo).then((r: any) => setAllAssignees(r?.assignees ?? []))
    }
  }
  const toggleLabelsEditor = () => {
    setEditingLabels(v => !v)
    if (allLabels === null) {
      api().githubListRepoLabels(repo.owner, repo.repo).then((r: any) => setAllLabels(r?.labels ?? []))
    }
  }

  const submitComment = async () => {
    const text = newComment.trim()
    if (!text) return
    setBusy(true); setError(null)
    const r = await api().githubAddIssueComment(repo.owner, repo.repo, item.number, text).catch((e: any) => ({ error: e.message }))
    setBusy(false)
    if (r?.success) { setNewComment(''); loadComments(); onChanged?.() }
    else setError(r?.error ?? 'error')
  }

  return (
    <div className="idv">
      <div className="idv-topbar">
        <Icon name="issue" size={16} />
        <span className="idv-topbar-title">{t('gh.detail.title')}</span>
        <div className="idv-spring" />
        <button className="idv-tool" title={t('gh.panel.openIn')}
          onClick={() => api().openExternal(item.url)}>
          <Icon name="externalLink" size={14} />
        </button>
        <button className="idv-tool idv-close" title={t('common.close')} onClick={onClose}>×</button>
      </div>

      <div className="idv-scroll">
        <div className="idv-head">
          <span className="idv-num">#{item.number}</span>
          {editingTitle ? (
            <input className="idv-title-input" value={titleDraft} autoFocus
              onChange={e => setTitleDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void saveTitle()
                if (e.key === 'Escape') { setEditingTitle(false); setTitleDraft(title) }
              }}
              onBlur={() => void saveTitle()} />
          ) : (
            <h2 className="idv-title" title={t('gh.detail.editTitle')}
              onClick={() => { setTitleDraft(title); setEditingTitle(true) }}>{title}</h2>
          )}
        </div>
        <div className="idv-meta">
          <span className={`idv-state idv-state--${state}`}>
            {t(state === 'open' ? 'issue.open' : 'issue.closed')}
          </span>
          {item.author && (
            <span className="idv-byline">
              {t('gh.detail.openedBy', item.author)}
              {item.createdAt ? ` · ${timeAgo(item.createdAt, t)}` : ''}
            </span>
          )}
        </div>

        {error && <div className="idv-error">{error}</div>}

        <div className="idv-cols">
          <div className="idv-main">
            <div className="idv-block-head">
              <span className="idv-label">{t('gh.card.description')}</span>
              {!editingBody && (
                <button className="idv-pencil" onClick={() => { setBodyDraft(body); setEditingBody(true) }}>
                  <Icon name="pencil" size={11} />
                </button>
              )}
            </div>
            {editingBody ? (
              <div className="idv-body-edit">
                <textarea className="idv-textarea" value={bodyDraft} autoFocus
                  onChange={e => setBodyDraft(e.target.value)} />
                <div className="idv-check-actions">
                  <button className="idv-btn idv-btn--primary" disabled={busy} onClick={() => void saveBody()}>{t('gh.detail.save')}</button>
                  <button className="idv-btn" onClick={() => setEditingBody(false)}>{t('gh.detail.cancel')}</button>
                </div>
              </div>
            ) : body.trim()
              ? <MdLite source={body} openLink={url => api().openExternal(url)} />
              : <div className="idv-none">{t('gh.card.noDescription')}</div>}

            <div className="idv-comments">
              <div className="idv-label">{t('gh.detail.comments')}</div>
              {comments === null && <div className="idv-none">{t('panel.loading')}</div>}
              {comments?.length === 0 && <div className="idv-none">{t('gh.detail.noComments')}</div>}
              {comments?.map((c, i) => (
                <div key={i} className="idv-comment">
                  <div className="idv-comment-head">
                    <span className="idv-comment-author">@{c.author}</span>
                    <span className="idv-comment-time">{timeAgo(c.createdAt, t)}</span>
                  </div>
                  <MdLite source={c.body} openLink={url => api().openExternal(url)} />
                </div>
              ))}
              <div className="idv-add-comment">
                <textarea className="idv-textarea" placeholder={t('gh.detail.commentPlaceholder')}
                  value={newComment} onChange={e => setNewComment(e.target.value)} />
                <button className="idv-btn idv-btn--primary" disabled={busy || !newComment.trim()}
                  onClick={() => void submitComment()}>
                  {t('gh.detail.addComment')}
                </button>
              </div>
            </div>
          </div>

          <div className="idv-side">
            {/* The status is a FACT first — the current state, full width, the
                forge's green. Changing it is an edit like any other: the
                pencil, then the other state. */}
            <SideBlock label={t('gh.card.status')} editing={editingState}
              onToggleEdit={() => setEditingState(v => !v)}>
              <div className={`idv-state-bar idv-state-bar--${state}`}>
                {t(state === 'open' ? 'issue.open' : 'issue.closed')}
              </div>
              {editingState && (
                <div className="idv-picker-list idv-state-options">
                  {(['open', 'closed'] as const).map(v => (
                    <button key={v} className="idv-pick-row" disabled={busy} onClick={() => setState(v)}>
                      <span className="idv-pick-check">{v === state && <Icon name="check" size={12} />}</span>
                      <span>{t(v === 'open' ? 'issue.open' : 'issue.closed')}</span>
                    </button>
                  ))}
                </div>
              )}
            </SideBlock>

            <SideBlock label={t('gh.card.assignees')} editing={editingAssignees}
              onToggleEdit={toggleAssigneesEditor}>
              {assignees.length
                ? <div className="idv-people">{assignees.map(a => <span key={a}>@{a}</span>)}</div>
                : !editingAssignees && <div className="idv-none">{t('gh.card.none')}</div>}
              {editingAssignees && (
                allAssignees === null
                  ? <div className="idv-none">{t('panel.loading')}</div>
                  : <PickerEditor options={allAssignees} chosen={assignees} busy={busy}
                      placeholder={t('gh.detail.selectPlaceholder')}
                      onPick={next => { void patch({ assignees: next }, () => setAssignees(next)) }} />
              )}
            </SideBlock>

            <SideBlock label={t('gh.card.labels')} editing={editingLabels}
              onToggleEdit={toggleLabelsEditor}>
              {labels.length
                ? <div className="idv-labels">{labels.map(l => <LabelChip key={l.name} label={l} />)}</div>
                : !editingLabels && <div className="idv-none">{t('gh.card.none')}</div>}
              {editingLabels && (
                allLabels === null
                  ? <div className="idv-none">{t('panel.loading')}</div>
                  : <PickerEditor options={allLabels.map(l => l.name)} chosen={labels.map(l => l.name)}
                      busy={busy} placeholder={t('gh.detail.selectPlaceholder')}
                      render={name => {
                        const l = allLabels.find(x => x.name === name)
                        return l ? <LabelChip label={l} /> : <span>{name}</span>
                      }}
                      onPick={next => {
                        const chosenObjs = (allLabels ?? []).filter(l => next.includes(l.name))
                        void patch({ labels: next }, () => setLabels(chosenObjs))
                      }} />
              )}
            </SideBlock>

            {onCreateBranch && (
              <SideBlock label={t('gh.detail.branches')}>
                <button className="idv-btn idv-branch-btn"
                  onClick={() => onCreateBranch({ number: item.number, title, url: item.url })}>
                  <Icon name="newBranch" size={13} />
                  {t('gh.issue.createBranch')}
                </button>
              </SideBlock>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
