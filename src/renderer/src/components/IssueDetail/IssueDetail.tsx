import { useState, useEffect, useCallback } from 'react'
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

/** A titled block of the side column, with its pencil when it can be edited. */
function SideBlock({ label, onEdit, children }: {
  label: string; onEdit?: () => void; children: React.ReactNode
}) {
  return (
    <div className="idv-block">
      <div className="idv-block-head">
        <span className="idv-label">{label}</span>
        {onEdit && (
          <button className="idv-pencil" onClick={onEdit}>
            <Icon name="pencil" size={11} />
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

/** A checklist editor over a fetched universe — assignees or labels. */
function ChecklistEditor({ options, chosen, onSave, onCancel, render, saveLabel, cancelLabel }: {
  options: string[]
  chosen: string[]
  onSave: (next: string[]) => void
  onCancel: () => void
  render?: (name: string) => React.ReactNode
  saveLabel: string
  cancelLabel: string
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set(chosen))
  return (
    <div className="idv-checklist">
      {options.map(name => (
        <label key={name} className="idv-check-row">
          <input type="checkbox" checked={picked.has(name)}
            onChange={e => setPicked(prev => {
              const next = new Set(prev)
              if (e.target.checked) next.add(name); else next.delete(name)
              return next
            })} />
          {render ? render(name) : <span>{name}</span>}
        </label>
      ))}
      <div className="idv-check-actions">
        <button className="idv-btn idv-btn--primary" onClick={() => onSave([...picked])}>{saveLabel}</button>
        <button className="idv-btn" onClick={onCancel}>{cancelLabel}</button>
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
  const toggleState = () => {
    const next = state === 'open' ? 'closed' : 'open'
    void patch({ state: next }, () => setIssueState(next))
  }

  const openAssigneesEditor = () => {
    setEditingAssignees(true)
    if (allAssignees === null) {
      api().githubListAssignees(repo.owner, repo.repo).then((r: any) => setAllAssignees(r?.assignees ?? []))
    }
  }
  const openLabelsEditor = () => {
    setEditingLabels(true)
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
            <SideBlock label={t('gh.card.status')}>
              <button className="idv-btn idv-state-btn" disabled={busy} onClick={toggleState}>
                {t(state === 'open' ? 'gh.detail.close' : 'gh.detail.reopen')}
              </button>
            </SideBlock>

            <SideBlock label={t('gh.card.assignees')} onEdit={openAssigneesEditor}>
              {editingAssignees ? (
                allAssignees === null
                  ? <div className="idv-none">{t('panel.loading')}</div>
                  : <ChecklistEditor options={allAssignees} chosen={assignees}
                      saveLabel={t('gh.detail.save')} cancelLabel={t('gh.detail.cancel')}
                      onCancel={() => setEditingAssignees(false)}
                      onSave={next => { void patch({ assignees: next }, () => setAssignees(next)).then(ok => { if (ok) setEditingAssignees(false) }) }} />
              ) : assignees.length
                ? <div className="idv-people">{assignees.map(a => <span key={a}>@{a}</span>)}</div>
                : <div className="idv-none">{t('gh.card.none')}</div>}
            </SideBlock>

            <SideBlock label={t('gh.card.labels')} onEdit={openLabelsEditor}>
              {editingLabels ? (
                allLabels === null
                  ? <div className="idv-none">{t('panel.loading')}</div>
                  : <ChecklistEditor options={allLabels.map(l => l.name)} chosen={labels.map(l => l.name)}
                      saveLabel={t('gh.detail.save')} cancelLabel={t('gh.detail.cancel')}
                      render={name => {
                        const l = allLabels.find(x => x.name === name)
                        return l ? <LabelChip label={l} /> : <span>{name}</span>
                      }}
                      onCancel={() => setEditingLabels(false)}
                      onSave={next => {
                        const chosen = (allLabels ?? []).filter(l => next.includes(l.name))
                        void patch({ labels: next }, () => setLabels(chosen)).then(ok => { if (ok) setEditingLabels(false) })
                      }} />
              ) : labels.length
                ? <div className="idv-labels">{labels.map(l => <LabelChip key={l.name} label={l} />)}</div>
                : <div className="idv-none">{t('gh.card.none')}</div>}
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
