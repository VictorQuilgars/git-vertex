import { useState, useEffect, useCallback, useRef } from 'react'
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
 * from the head ref's check runs), the conflicts (GitHub's `mergeable`,
 * including the null that means it is still computing — shown as computing,
 * never guessed), and WHERE THIS VIEWER STANDS — whether the account holds
 * the permission to merge at all, and, when a rule blocks, whether it is a
 * bypass actor for that rule. Both are said BEFORE the click: a permission
 * discovered by pressing a button and reading a 403 is not a permission the
 * pane ever stated. The MERGE BUTTON (#73's P2) follows the reference's rule:
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
  reviewDecision?: string | null; canBypass?: boolean; canMerge?: boolean | null
  labels: GithubLabel[]; assignees: string[]; reviewers: string[]
  url: string
}

/**
 * How often an UNSETTLED request asks again — mergeability still computing, a
 * check still running. Seconds, because this is a state someone is watching.
 */
const SETTLE_POLL_MS = 5_000
/**
 * And how often a settled one does. It keeps asking rather than stopping,
 * because a request goes on changing after it is decided: comments arrive, a
 * review lands, labels move, a failed check is re-run. Every read behind this
 * is conditional (#141), so an unchanged request answers 304 and costs no
 * rate limit — which is what makes watching it free rather than a trade.
 */
const OPEN_POLL_MS = 20_000

interface Checks { total: number; passed: number; failed: number; pending: number }

/** Same numbers — so a poll that changed nothing does not re-render the pane. */
const sameChecks = (a: Checks | null, b: Checks): boolean =>
  !!a && a.total === b.total && a.passed === b.passed
  && a.failed === b.failed && a.pending === b.pending
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
  /**
   * Which commit those checks are about. Without it the previous head's
   * result stays on screen after a push — evidence about commit A presented
   * as evidence about commit B — and the merge button, which only asks
   * whether the checks are green, is offered on it. GitHub then refuses the
   * merge, because the checks it requires have not run on what you pushed.
   */
  const [checksSha, setChecksSha] = useState<string | null>(null)
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
  const [cleanup, setCleanup] = useState<{ remote: string; local: string; others?: string[] } | null>(null)
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
            .then((c: any) => { if (alive && c?.checks) { setChecks(c.checks); setChecksSha(r.pr.headSha) } })
            .catch(() => { /* checks stay unknown; the block says so */ })
        }
      } else setError(r?.error ?? 'error')
    }).catch((e: any) => { if (alive) setError(e.message) })
    api().githubIssueComments(repo.owner, repo.repo, number).then((r: any) => {
      if (alive && r?.comments) setComments(r.comments)
    }).catch(() => { /* the comments block shows loading forever only on a dead host */ })
    return () => { alive = false }
  }, [repo.owner, repo.repo, number])

  /**
   * A request is UNSETTLED while GitHub has not finished deciding about it:
   * `mergeable` comes back **null** while it computes the merge, and the
   * checks report `pending` while they run. Both are the normal answer in the
   * seconds after a push — which is exactly when someone opens this pane and
   * waits.
   *
   * It fetched once. So a request opened right after a push sat at "still
   * computing" for as long as it was left open, and the merge button — which
   * needs `mergeable === true` and no pending check — never appeared, however
   * green the rows above it went.
   */
  const editing = editingTitle || editingBody || editingAssignees || editingLabels || editingState
  /**
   * The checks, but only while they describe the head the pane is showing. The
   * moment the head moves they read as UNKNOWN, which takes the merge button
   * away and puts the pane back to waiting — derived rather than cleared, so
   * no code path has to remember to do it.
   */
  const headChecks = pr && checksSha === pr.headSha ? checks : null

  // Nothing loaded — a first fetch that failed, or one still in flight — counts
  // as UNSETTLED, so the pane retries in seconds rather than sitting dead for
  // twenty. A transient "fetch failed" at open should heal itself, not leave a
  // red line and nothing else until the pane is closed and reopened.
  const settled = !!pr
    && (pr.merged
      || pr.state !== 'open'
      || (pr.mergeable !== null && headChecks !== null && headChecks.pending === 0))

  // The pane keeps itself current for as long as it is open: the request, its
  // checks and its comments. Nothing here writes when the answer came back
  // `notModified`, so a quiet request causes no re-render at all.
  useEffect(() => {
    // Not while the user is typing into what a refresh would replace.
    if (editing) return
    let alive = true
    const every = settled ? OPEN_POLL_MS : SETTLE_POLL_MS
    const id = setTimeout(async () => {
      if (!alive || document.hidden) return
      // ⚠️ EVERY fetch first, THEN every state write — and one `alive` check
      // between them. Writing as they arrived meant `setPr` re-ran this effect,
      // whose cleanup set `alive = false`, so the pane cancelled its own checks
      // request every time it updated the request. That is "the page updates,
      // except the checks", exactly.
      const r = await api().githubGetPR(repo.owner, repo.repo, number).catch(() => null)
      const sha = r?.pr?.headSha
      const c = sha
        ? await api().githubGetChecks(repo.owner, repo.repo, sha).catch(() => null)
        : null
      const cm = await api().githubIssueComments(repo.owner, repo.repo, number).catch(() => null)
      if (!alive) return

      // `notModified` describes the TRANSPORT — "the same body I last sent" —
      // not what this pane holds. The cache lives in the main process and
      // outlives every pane, so a 304 is routine for something this side has
      // never seen. Each answer is therefore RECORDED; only the state write is
      // skipped when what arrived is what is already held.
      if (r?.pr) {
        setError(null)
        if (!pr || !r.notModified) setPr(r.pr)
      }
      if (sha && c?.checks) {
        setChecksSha(sha)
        setChecks(prev => sameChecks(prev, c.checks) ? prev : c.checks)
      }
      if (cm?.comments && (comments === null || !cm.notModified)) setComments(cm.comments)
    }, every)
    return () => { alive = false; clearTimeout(id) }
  }, [settled, editing, repo.owner, repo.repo, number, pr, checks, comments])

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

  // GitHub's own shape (#124 follow-up): the method button is ALWAYS labelled
  // by the chosen method. When rules block and this viewer can bypass, its
  // click reveals a SEPARATE danger button that confirms the bypass; without
  // the rights, the button is disabled and the pane says what is awaited,
  // as github.com does.
  const blocked = pr?.mergeableState === 'blocked'
  const onMergeClick = () => {
    if (!pr) return
    if (blocked) {
      if (pr.canBypass) setBypassArmed(true)
      return
    }
    void doMerge()
  }

  const onBypassConfirm = () => {
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
                    <div className={`idv-merge-row idv-merge-row--${headChecks === null ? 'unknown' : headChecks.failed ? 'bad' : headChecks.pending ? 'wait' : 'ok'}`}>
                      <Icon name={headChecks === null ? 'clock' : headChecks.failed ? 'conflict' : headChecks.pending ? 'clock' : 'check'} size={12} />
                      {headChecks === null ? t('gh.pr.checksUnknown')
                        : headChecks.total === 0 ? t('gh.pr.checksNone')
                        : headChecks.failed ? t('gh.pr.checksFailed', headChecks.failed, headChecks.total)
                        : headChecks.pending ? t('gh.pr.checksPending', headChecks.pending, headChecks.total)
                        : t('gh.pr.checksPassed', headChecks.total)}
                    </div>
                    <div className={`idv-merge-row idv-merge-row--${pr.mergeable === null ? 'unknown' : pr.mergeable ? 'ok' : 'bad'}`}>
                      <Icon name={pr.mergeable === null ? 'clock' : pr.mergeable ? 'check' : 'conflict'} size={12} />
                      {pr.mergeable === null ? t('gh.pr.mergeComputing')
                        : pr.mergeable ? t('gh.pr.noConflicts') : t('gh.pr.conflicts')}
                    </div>
                    {/* Where the viewer stands, said before the click. Only a
                        MEASURED permission speaks: `canMerge` is undefined on
                        an older host and null when the lookup failed, and
                        neither may be reported as a refusal. */}
                    {!pr.merged && pr.state === 'open' && pr.canMerge != null && (
                      <div className={`idv-merge-row idv-merge-row--${pr.canMerge ? 'ok' : 'bad'}`}>
                        <Icon name={pr.canMerge ? 'check' : 'conflict'} size={12} />
                        {pr.canMerge ? t('gh.pr.mergeAllowed') : t('gh.pr.mergeForbidden')}
                      </div>
                    )}
                    {/* The reference's rule: the button exists when BOTH hold.
                        Checks green or absent, no conflicts, and an open,
                        unmerged request. GitHub remains the judge — and when
                        mergeable_state says the protections are unmet (a
                        required review, typically), the button SAYS it will
                        bypass them: the same explicit consent the web UI asks
                        for, in the label rather than a checkbox. An actor
                        without bypass rights gets GitHub's refusal inline. */}
                    {!pr.merged && pr.state === 'open' && pr.mergeable === true
                      && pr.canMerge !== false
                      && headChecks !== null && headChecks.failed === 0 && headChecks.pending === 0 && (
                      <div className="idv-merge-act" ref={mergeActRef}>
                        {/* Blocked, github.com's way: say so, and say what is
                            awaited — reviewDecision knows. */}
                        {blocked && (
                          <div className="idv-blocked">
                            <div className="idv-blocked-head">
                              <Icon name="conflict" size={12} />
                              {t('gh.pr.blocked')}
                            </div>
                            <div className="idv-blocked-why">
                              {pr.reviewDecision === 'REVIEW_REQUIRED' ? t('gh.pr.reviewRequired')
                                : pr.reviewDecision === 'CHANGES_REQUESTED' ? t('gh.pr.changesRequested')
                                : t('gh.pr.ruleUnmet')}
                            </div>
                            {/* And whether THIS account is a bypass actor for
                                that rule — the answer the button's behaviour
                                already depends on, now stated rather than
                                discovered by pressing it. */}
                            <div className={`idv-blocked-you idv-blocked-you--${pr.canBypass ? 'can' : 'cannot'}`}>
                              <Icon name={pr.canBypass ? 'shield' : 'info'} size={11} />
                              {pr.canBypass ? t('gh.pr.bypassActor') : t('gh.pr.bypassNone')}
                            </div>
                          </div>
                        )}
                        <div className="idv-merge-row-btns">
                          <button className="idv-btn idv-merge-btn"
                            disabled={busy || (blocked && !pr.canBypass)}
                            title={t(`gh.pr.merge.${mergeMethod}` as any)}
                            onClick={onMergeClick}>
                            <Icon name="merge" size={13} />
                            {t(`gh.pr.merge.${mergeMethod}` as any)}
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
                        {/* The bypass is ANOTHER button — danger-toned, revealed
                            by the method button's click, gone on a click
                            elsewhere. Consent is a separate act, as on
                            github.com. */}
                        {bypassArmed && pr.canBypass && (
                          <button className="idv-btn idv-bypass-btn" disabled={busy}
                            onClick={onBypassConfirm}>
                            <Icon name="shield" size={13} />
                            {t('gh.pr.mergeBypassConfirm')}
                          </button>
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
                          // checkout.
                          const rr = await (api().deleteRemoteBranch?.(pr.headRef) ?? Promise.resolve({ success: false, error: 'not-implemented' })).catch((e: any) => ({ success: false, error: e.message }))
                          // The commonest case is deleting the branch you are
                          // ON — you just merged its PR. git refuses that, and
                          // rightly; the answer is the reference clients':
                          // step onto the base branch, then delete. Any other
                          // refusal (another worktree, a dirty tree blocking
                          // the checkout) stays git's message, verbatim.
                          let switched = false
                          // Whether the base we moved onto now holds the merge.
                          let baseFresh: boolean | null = null
                          let lr = await (api().deleteBranch?.(pr.headRef) ?? Promise.resolve({ success: false, error: 'not-implemented' })).catch((e: any) => ({ success: false, error: e.message }))
                          if (!lr?.success && /used by worktree|checked out/i.test(lr?.error ?? '') && pr.baseRef) {
                            const co = await api().checkout?.(pr.baseRef).catch((e: any) => ({ success: false, error: e.message }))
                            if (co?.success) {
                              switched = true
                              lr = await (api().deleteBranch?.(pr.headRef) ?? Promise.resolve({ success: false, error: 'not-implemented' })).catch((e: any) => ({ success: false, error: e.message }))
                              // The APP moved them onto the base, so the app owes
                              // them a base that contains the merge they just
                              // made — before this, the tidy-up ended standing on
                              // a trunk without it, and nothing said so (#136).
                              //
                              // ⚠️ Fast-forward or nothing. A base that has
                              // diverged — their own commits, a rebase — is left
                              // exactly as it is and reported as behind.
                              // Reconciling someone's trunk unasked is worse than
                              // the stale state this fixes.
                              //
                              // And NOT `pull --ff-only`: a repository fetching
                              // several refs makes pull refuse before it reaches
                              // the fast-forward at all, which would be reported
                              // here as a diverged base when nothing diverged.
                              const ff = await (api().fastForwardToUpstream?.() ?? Promise.resolve({ success: false })).catch(() => ({ success: false }))
                              baseFresh = !!ff?.success
                            }
                          }
                          const word = (r: any, sw = false) => r?.success
                            ? (sw
                                ? (baseFresh
                                    ? t('gh.pr.branchDeletedSwitchedUpdated', pr.baseRef)
                                    : t('gh.pr.branchDeletedSwitchedStale', pr.baseRef))
                                : t('gh.pr.branchDeleted'))
                            : /not found|introuvable|no such|unknown branch/i.test(r?.error ?? '') ? t('gh.pr.branchAbsent')
                            : (r?.error ?? 'error')

                          // What else is standing on the merged commit. The
                          // action deletes ONE ref by name and must keep doing
                          // exactly that — a cleanup that removes branches
                          // nobody named is a worse bug than the one it fixes.
                          // So they are reported, not touched (#136).
                          const others = await (async () => {
                            if (!pr.headSha) return []
                            const r = await api().getBranches?.().catch(() => null)
                            return ((r?.branches ?? []) as any[])
                              .filter(b => !b.remote && b.name !== pr.headRef
                                && typeof b.commit === 'string'
                                && (b.commit.startsWith(pr.headSha) || pr.headSha.startsWith(b.commit)))
                              .map(b => b.name)
                          })()

                          setCleanup({ remote: word(rr), local: word(lr, switched), others })
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
                        {!!cleanup.others?.length && (
                          <span className="idv-cleanup-others">
                            {t('gh.pr.otherRefsHere', cleanup.others.join(', '))}
                          </span>
                        )}
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
