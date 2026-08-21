import { useState, useEffect, useCallback } from 'react'
import { Icon } from '../Icon/Icon'
import MdLite from '../GitHubPanel/mdLite'
import { LabelChip, timeAgo, type GithubLabel } from '../GitHubPanel/GithubRow'
import { SideBlock, PickerEditor, useClickAway } from './IssueDetail'
import { useLang } from '../../i18n/LanguageContext'
import './IssueDetail.css'

/**
 * The pull-request detail — #110 §2, the issue detail's sibling, in the same
 * third layout: toolbar kept, left panel kept, graph replaced, commit panel
 * absent. What differs is what a request carries that an issue does not —
 * the branches, the cost line, and MERGEABILITY.
 *
 * Mergeability is read and reported: the checks (passed / failed / pending,
 * from the head ref's check runs) and the conflicts (GitHub's `mergeable`,
 * including the null that means it is still computing — shown as computing,
 * never guessed). The MERGE BUTTON (#73's P2) follows the reference's rule:
 * it exists when both hold — checks green (or absent) and no conflicts —
 * and not otherwise; a disabled button explaining itself is still a button
 * that cannot be pressed. GitHub stays the judge: protections it enforces
 * answer through the request, and its message is shown where the click
 * happened.
 *
 * Comments, title, description, state, labels and assignees go through the
 * ISSUE endpoints — a pull request is an issue to GitHub for all of those,
 * and the §3 bis plumbing already exists on both hosts. A merged request
 * cannot be reopened, so the state stops being editable once merged.
 */
interface FullPR {
  number: number; title: string; state: string; merged: boolean; draft: boolean
  author: string; createdAt: string; body: string
  headRef: string; headSha: string; baseRef: string
  commits: number; changedFiles: number; additions: number; deletions: number
  mergeable: boolean | null; mergeableState: string
  labels: GithubLabel[]; assignees: string[]; reviewers: string[]
  url: string
}

interface Checks { total: number; passed: number; failed: number; pending: number }
interface Comment { author: string; createdAt: string; body: string }

function api(): any { return window.gitAPI as any }

export default function PRDetail({ repo, number, onClose, onChanged }: {
  repo: { owner: string; repo: string }
  number: number
  onClose: () => void
  /** After any successful write: the host refreshes the lists this came from. */
  onChanged?: () => void
}) {
  const { t } = useLang()
  const [pr, setPr] = useState<FullPR | null>(null)
  const [checks, setChecks] = useState<Checks | null>(null)
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [newComment, setNewComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [editingBody, setEditingBody] = useState(false)
  const [bodyDraft, setBodyDraft] = useState('')
  const [editingAssignees, setEditingAssignees] = useState(false)
  const [editingLabels, setEditingLabels] = useState(false)
  const [editingState, setEditingState] = useState(false)
  const [mergeMethod, setMergeMethod] = useState<'merge' | 'squash' | 'rebase'>('merge')
  const [methodOpen, setMethodOpen] = useState(false)
  // The bypass consents TWICE (#124): the first click arms, the second merges,
  // any click elsewhere disarms. An ordinary merge stays single-click.
  const [bypassArmed, setBypassArmed] = useState(false)
  const disarm = useCallback(() => setBypassArmed(false), [])
  const mergeActRef = useClickAway(bypassArmed, disarm)
  // The cleanup's per-branch outcomes, reported where the click happened.
  const [cleanup, setCleanup] = useState<{ remote: string; local: string } | null>(null)
  const [cleaning, setCleaning] = useState(false)
  const [allAssignees, setAllAssignees] = useState<string[] | null>(null)
  const [allLabels, setAllLabels] = useState<GithubLabel[] | null>(null)

  useEffect(() => {
    let alive = true
    api().githubGetPR(repo.owner, repo.repo, number).then((r: any) => {
      if (!alive) return
      if (r?.pr) {
        setPr(r.pr)
        // The checks hang off the head ref — a second call, made only once
        // the first said which sha to ask about.
        if (r.pr.headSha) {
          api().githubGetChecks(repo.owner, repo.repo, r.pr.headSha)
            .then((c: any) => { if (alive && c?.checks) setChecks(c.checks) })
            .catch(() => { /* checks stay unknown; the block says so */ })
        }
      } else setError(r?.error ?? 'error')
    }).catch((e: any) => { if (alive) setError(e.message) })
    api().githubIssueComments(repo.owner, repo.repo, number).then((r: any) => {
      if (alive && r?.comments) setComments(r.comments)
    }).catch(() => { /* the comments block shows loading forever only on a dead host */ })
    return () => { alive = false }
  }, [repo.owner, repo.repo, number])

  const patch = useCallback(async (p: object, apply: () => void) => {
    setBusy(true); setError(null)
    const r = await api().githubUpdateIssue(repo.owner, repo.repo, number, p).catch((e: any) => ({ error: e.message }))
    setBusy(false)
    if (r?.success) { apply(); onChanged?.() }
    else setError(r?.error ?? 'error')
    return !!r?.success
  }, [repo.owner, repo.repo, number, onChanged])

  const submitComment = async () => {
    const text = newComment.trim()
    if (!text) return
    setBusy(true); setError(null)
    const r = await api().githubAddIssueComment(repo.owner, repo.repo, number, text).catch((e: any) => ({ error: e.message }))
    setBusy(false)
    if (r?.success) {
      setNewComment('')
      api().githubIssueComments(repo.owner, repo.repo, number).then((rr: any) => { if (rr?.comments) setComments(rr.comments) })
      onChanged?.()
    } else setError(r?.error ?? 'error')
  }

  const onMergeClick = () => {
    if (!pr) return
    if (pr.mergeableState === 'blocked' && !bypassArmed) { setBypassArmed(true); return }
    setBypassArmed(false)
    void doMerge()
  }

  const doMerge = async () => {
    if (!pr) return
    setBusy(true); setError(null)
    const r = await api().githubMergePR(repo.owner, repo.repo, number, mergeMethod).catch((e: any) => ({ error: e.message }))
    setBusy(false)
    if (r?.success) { setPr({ ...pr, merged: true, state: 'closed' }); onChanged?.() }
    else setError(r?.error ?? 'error')
  }

  const stateKey = pr?.merged ? 'issue.merged' : pr?.state === 'open' ? 'issue.open' : 'issue.closed'
  const stateClass = pr?.merged ? 'merged' : pr?.state === 'open' ? 'open' : 'closed'

  return (
    <div className="idv">
      <div className="idv-topbar">
        <Icon name="pullRequest" size={16} />
        <span className="idv-topbar-title">{t('gh.pr.title')}</span>
        <div className="idv-spring" />
        {pr && (
          <button className="idv-tool" title={t('gh.panel.openIn')}
            onClick={() => api().openExternal(pr.url)}>
            <Icon name="externalLink" size={14} />
          </button>
        )}
        <button className="idv-tool idv-close" title={t('common.close')} onClick={onClose}>×</button>
      </div>

      <div className="idv-scroll">
        {error && <div className="idv-error">{error}</div>}
        {!pr && !error && <div className="idv-none">{t('panel.loading')}</div>}
        {pr && (
          <>
            <div className="idv-head">
              <span className="idv-num">#{pr.number}</span>
              {editingTitle ? (
                <input className="idv-title-input" value={titleDraft} autoFocus
                  onChange={e => setTitleDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const next = titleDraft.trim()
                      if (next && next !== pr.title) void patch({ title: next }, () => setPr({ ...pr, title: next })).then(ok => { if (ok) setEditingTitle(false) })
                      else setEditingTitle(false)
                    }
                    if (e.key === 'Escape') setEditingTitle(false)
                  }}
                  onBlur={() => setEditingTitle(false)} />
              ) : (
                <h2 className="idv-title" title={t('gh.detail.editTitle')}
                  onClick={() => { setTitleDraft(pr.title); setEditingTitle(true) }}>{pr.title}</h2>
              )}
            </div>
            <div className="idv-meta">
              <span className={`idv-state idv-state--${stateClass}`}>
                {pr.draft && !pr.merged ? t('gh.panel.draft') : t(stateKey as any)}
              </span>
              <span className="idv-refs">
                <code>{pr.headRef}</code>
                <Icon name="arrowSwitch" size={10} />
                <code>{pr.baseRef}</code>
              </span>
              <span className="idv-byline">
                {t('gh.detail.openedBy', pr.author)} · {timeAgo(pr.createdAt, t)}
              </span>
            </div>
            {/* The single line the reference shows: what the request costs. */}
            <div className="idv-cost">
              {t('gh.pr.counts', pr.commits, pr.changedFiles)}
              <span className="idv-cost-add">+{pr.additions}</span>
              <span className="idv-cost-del">−{pr.deletions}</span>
            </div>

            <div className="idv-cols">
              <div className="idv-main">
                <div className="idv-block-head">
                  <span className="idv-label">{t('gh.card.description')}</span>
                  {!editingBody && (
                    <button className="idv-pencil" onClick={() => { setBodyDraft(pr.body); setEditingBody(true) }}>
                      <Icon name="pencil" size={11} />
                    </button>
                  )}
                </div>
                {editingBody ? (
                  <div className="idv-body-edit">
                    <textarea className="idv-textarea" value={bodyDraft} autoFocus
                      onChange={e => setBodyDraft(e.target.value)} />
                    <div className="idv-check-actions">
                      <button className="idv-btn idv-btn--primary" disabled={busy}
                        onClick={() => void patch({ body: bodyDraft }, () => setPr({ ...pr, body: bodyDraft })).then(ok => { if (ok) setEditingBody(false) })}>
                        {t('gh.detail.save')}
                      </button>
                      <button className="idv-btn" onClick={() => setEditingBody(false)}>{t('gh.detail.cancel')}</button>
                    </div>
                  </div>
                ) : pr.body.trim()
                  ? <MdLite source={pr.body} openLink={url => api().openExternal(url)} />
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
                {/* Mergeability, read and reported — never a merge button (#73). */}
                <SideBlock label={t('gh.pr.mergeability')}>
                  <div className="idv-merge">
                    <div className={`idv-merge-row idv-merge-row--${checks === null ? 'unknown' : checks.failed ? 'bad' : checks.pending ? 'wait' : 'ok'}`}>
                      <Icon name={checks === null ? 'clock' : checks.failed ? 'conflict' : checks.pending ? 'clock' : 'check'} size={12} />
                      {checks === null ? t('gh.pr.checksUnknown')
                        : checks.total === 0 ? t('gh.pr.checksNone')
                        : checks.failed ? t('gh.pr.checksFailed', checks.failed, checks.total)
                        : checks.pending ? t('gh.pr.checksPending', checks.pending, checks.total)
                        : t('gh.pr.checksPassed', checks.total)}
                    </div>
                    <div className={`idv-merge-row idv-merge-row--${pr.mergeable === null ? 'unknown' : pr.mergeable ? 'ok' : 'bad'}`}>
                      <Icon name={pr.mergeable === null ? 'clock' : pr.mergeable ? 'check' : 'conflict'} size={12} />
                      {pr.mergeable === null ? t('gh.pr.mergeComputing')
                        : pr.mergeable ? t('gh.pr.noConflicts') : t('gh.pr.conflicts')}
                    </div>
                    {/* The reference's rule: the button exists when BOTH hold.
                        Checks green or absent, no conflicts, and an open,
                        unmerged request. GitHub remains the judge — and when
                        mergeable_state says the protections are unmet (a
                        required review, typically), the button SAYS it will
                        bypass them: the same explicit consent the web UI asks
                        for, in the label rather than a checkbox. An actor
                        without bypass rights gets GitHub's refusal inline. */}
                    {!pr.merged && pr.state === 'open' && pr.mergeable === true
                      && checks !== null && checks.failed === 0 && checks.pending === 0 && (
                      <div className="idv-merge-act" ref={mergeActRef}>
                        <button className={`idv-btn idv-merge-btn${bypassArmed ? ' idv-merge-btn--armed' : ''}`}
                          disabled={busy}
                          title={t(`gh.pr.merge.${mergeMethod}` as any)}
                          onClick={onMergeClick}>
                          <Icon name="merge" size={13} />
                          {bypassArmed ? t('gh.pr.mergeBypassConfirm')
                            : pr.mergeableState === 'blocked'
                              ? t('gh.pr.mergeBypass')
                              : t(`gh.pr.merge.${mergeMethod}` as any)}
                        </button>
                        <button className="idv-btn idv-merge-caret" disabled={busy}
                          title={t('gh.pr.mergeMethod')}
                          onClick={() => setMethodOpen(o => !o)}>
                          <Icon name="chevronDown" size={11} />
                        </button>
                        {methodOpen && (
                          <div className="idv-picker-list idv-merge-methods">
                            {(['merge', 'squash', 'rebase'] as const).map(m => (
                              <button key={m} className="idv-pick-row"
                                onClick={() => { setMergeMethod(m); setMethodOpen(false) }}>
                                <span className="idv-pick-check">{m === mergeMethod && <Icon name="check" size={12} />}</span>
                                <span>{t(`gh.pr.merge.${m}` as any)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </SideBlock>

                {!pr.merged && (
                  <SideBlock label={t('gh.card.status')} editing={editingState}
                    onToggleEdit={() => setEditingState(v => !v)}>
                    <div className={`idv-state-bar idv-state-bar--${pr.state === 'open' ? 'open' : 'closed'}`}>
                      {t(pr.state === 'open' ? 'issue.open' : 'issue.closed')}
                    </div>
                    {editingState && (
                      <div className="idv-picker-list idv-state-options">
                        {(['open', 'closed'] as const).map(v => (
                          <button key={v} className="idv-pick-row" disabled={busy}
                            onClick={() => {
                              if (v === pr.state) { setEditingState(false); return }
                              void patch({ state: v }, () => setPr({ ...pr, state: v })).then(ok => { if (ok) setEditingState(false) })
                            }}>
                            <span className="idv-pick-check">{v === pr.state && <Icon name="check" size={12} />}</span>
                            <span>{t(v === 'open' ? 'issue.open' : 'issue.closed')}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </SideBlock>
                )}

                {(pr.merged || pr.state === 'closed') && pr.headRef && (
                  <SideBlock label={t('gh.detail.branches')}>
                    <button className="idv-btn idv-branch-btn" disabled={cleaning}
                      onClick={() => {
                        setCleaning(true)
                        void (async () => {
                          // Remote first: it exists independently of the
                          // checkout. git's own refusals (the checked-out
                          // branch, most often) are the message — not ours
                          // to predict.
                          const rr = await (api().deleteRemoteBranch?.(pr.headRef) ?? Promise.resolve({ success: false, error: 'not-implemented' })).catch((e: any) => ({ success: false, error: e.message }))
                          const lr = await (api().deleteBranch?.(pr.headRef) ?? Promise.resolve({ success: false, error: 'not-implemented' })).catch((e: any) => ({ success: false, error: e.message }))
                          const word = (r: any) => r?.success ? t('gh.pr.branchDeleted')
                            : /not found|introuvable|no such|unknown branch/i.test(r?.error ?? '') ? t('gh.pr.branchAbsent')
                            : (r?.error ?? 'error')
                          setCleanup({ remote: word(rr), local: word(lr) })
                          setCleaning(false)
                          onChanged?.()
                        })()
                      }}>
                      <Icon name="trash" size={13} />
                      {t('gh.pr.deleteBranches')}
                    </button>
                    {cleanup && (
                      <div className="idv-cleanup">
                        <span>{t('gh.pr.branchRemote')} : {cleanup.remote}</span>
                        <span>{t('gh.pr.branchLocal')} : {cleanup.local}</span>
                      </div>
                    )}
                  </SideBlock>
                )}

                {pr.reviewers.length > 0 && (
                  <SideBlock label={t('gh.pr.reviewers')}>
                    <div className="idv-people">{pr.reviewers.map(r => <span key={r}>@{r}</span>)}</div>
                  </SideBlock>
                )}

                <SideBlock label={t('gh.card.assignees')} editing={editingAssignees}
                  onToggleEdit={() => {
                    setEditingAssignees(v => !v)
                    if (allAssignees === null) {
                      api().githubListAssignees(repo.owner, repo.repo).then((r: any) => setAllAssignees(r?.assignees ?? []))
                    }
                  }}>
                  {pr.assignees.length
                    ? <div className="idv-people">{pr.assignees.map(a => <span key={a}>@{a}</span>)}</div>
                    : !editingAssignees && <div className="idv-none">{t('gh.card.none')}</div>}
                  {editingAssignees && (
                    allAssignees === null
                      ? <div className="idv-none">{t('panel.loading')}</div>
                      : <PickerEditor options={allAssignees} chosen={pr.assignees} busy={busy}
                          placeholder={t('gh.detail.selectPlaceholder')}
                          onPick={next => { void patch({ assignees: next }, () => setPr({ ...pr, assignees: next })) }} />
                  )}
                </SideBlock>

                <SideBlock label={t('gh.card.labels')} editing={editingLabels}
                  onToggleEdit={() => {
                    setEditingLabels(v => !v)
                    if (allLabels === null) {
                      api().githubListRepoLabels(repo.owner, repo.repo).then((r: any) => setAllLabels(r?.labels ?? []))
                    }
                  }}>
                  {pr.labels.length
                    ? <div className="idv-labels">{pr.labels.map(l => <LabelChip key={l.name} label={l} />)}</div>
                    : !editingLabels && <div className="idv-none">{t('gh.card.none')}</div>}
                  {editingLabels && (
                    allLabels === null
                      ? <div className="idv-none">{t('panel.loading')}</div>
                      : <PickerEditor options={allLabels.map(l => l.name)} chosen={pr.labels.map(l => l.name)}
                          busy={busy} placeholder={t('gh.detail.selectPlaceholder')}
                          render={name => {
                            const l = allLabels.find(x => x.name === name)
                            return l ? <LabelChip label={l} /> : <span>{name}</span>
                          }}
                          onPick={next => {
                            const chosenObjs = (allLabels ?? []).filter(l => next.includes(l.name))
                            void patch({ labels: next }, () => setPr({ ...pr, labels: chosenObjs }))
                          }} />
                  )}
                </SideBlock>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
