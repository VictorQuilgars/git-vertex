import React, { useState, useEffect, type RefObject } from 'react'
import { Icon } from '../Icon/Icon'
import './PRComposer.css'
import { useLang } from '../../i18n/LanguageContext'
import type { PRIntent } from '../ContextMenu/prIntent'
import { branchNeedsPush } from '../ContextMenu/prIntent'
import type { BranchInfo } from '../../types'
import { Brand } from '../BrandMark/BrandMark'
import PanelDrawer from '../PanelDrawer/PanelDrawer'
import { parseRemote } from '../../utils/remoteUrl'

// A repository as the selectors speak of it: `owner/name`, one string, because
// that is how GitHub prints it and how the `head` of a cross-repository
// request spells its left half.
const joinRepo = (owner: string, repo: string) => `${owner}/${repo}`
const splitRepo = (full: string): { owner: string; repo: string } => {
  const [owner, ...rest] = full.split('/')
  return { owner, repo: rest.join('/') }
}

/**
 * A field that holds several picks — reviewers, assignees, labels. One
 * component, because three of them written separately would disagree about
 * how they open, close and show a choice. Display-only chips in the field,
 * the list below it; clicking an option toggles it.
 */
function PickField({ label, placeholder, options, chosen, onToggle, dots }: {
  label: string
  placeholder: string
  options: string[]
  chosen: string[]
  onToggle: (id: string) => void
  /** Option → its colour swatch (labels). Absent for people. */
  dots?: Record<string, string>
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="pr-field">
      <span className="pr-label">{label}</span>
      <div className="pr-pick">
        <button type="button" className="pr-pick-face"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
          // As the suggest list does: mousedown on an option runs before this
          // blur, so the timeout lets a toggle land before the list closes.
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={e => {
            // The list goes first; the drawer only closes once there is no list.
            if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false) }
          }}>
          {chosen.length === 0
            ? <span className="pr-pick-placeholder">{placeholder}</span>
            : chosen.map(c => (
                <span key={c} className="pr-pick-chip">
                  {/* The forge's own colour, like LabelChip — data, not design. */}
                  {dots?.[c] !== undefined && (
                    <span className="pr-pick-dot" style={{ background: `#${dots[c]}` }} />
                  )}
                  {c}
                </span>
              ))}
          <Icon name="chevronDown" size={10} className="pr-pick-caret" />
        </button>
        {open && (
          <ul className="pr-pick-list" role="listbox" aria-label={label}>
            {options.length === 0 && <li className="pr-pick-none">—</li>}
            {options.map(o => (
              <li key={o} role="option" aria-selected={chosen.includes(o)}
                className={`pr-pick-option${chosen.includes(o) ? ' pr-pick-option--on' : ''}`}
                onMouseDown={e => { e.preventDefault(); onToggle(o) }}>
                {dots?.[o] !== undefined && (
                  <span className="pr-pick-dot" style={{ background: `#${dots[o]}` }} />
                )}
                <span className="pr-pick-option-name">{o}</span>
                {chosen.includes(o) && <Icon name="check" size={11} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

interface Props {
  owner: string
  repo: string
  /** Head, base and push-need, decided by prIntentFor — not re-derived here.
   *  The composer may then be OVERRIDDEN (#130): the intent prefills the four
   *  ends and stays the thing that decided the row was offered at all. */
  intent: PRIntent
  /** The panel's branch list — what re-choosing the head consults for its
   *  push-need, through the same module that answered for the intent's. */
  branches: BranchInfo[]
  /** The left panel. The composer is a drawer out of it, not a modal (#130). */
  anchor: RefObject<HTMLElement | null>
  onClose: () => void
  /** The composer pushes before creating — the host reloads its branch state. */
  onPushed?: () => void
  /**
   * The request exists. The host reloads the list that should now contain it —
   * without this the app had to be told about its OWN write by a refresh, or
   * wait out a poll, which is the one case where waiting is indefensible.
   */
  onCreated?: (number: number) => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
}

export default function PRComposer({ owner, repo, intent, branches, anchor, onClose, onPushed, onCreated, showToast }: Props) {
  const { t } = useLang()
  const currentFull = joinRepo(owner, repo)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  // ── The four ends (#130 §2) ───────────────────────────────────
  const [src, setSrc] = useState(currentFull)
  const [dst, setDst] = useState(currentFull)
  const [head, setHead] = useState(intent.head)
  const [base, setBase] = useState(intent.base ?? 'main')
  /** fullName → what the selectors know about it. */
  const [repoOptions, setRepoOptions] = useState<Map<string, { defaultBranch: string | null }>>(
    () => new Map([[currentFull, { defaultBranch: null }]])
  )
  const [srcBranches, setSrcBranches] = useState<string[]>([])
  const [dstBranches, setDstBranches] = useState<string[]>([])

  // ── Reviewers, assignees, labels — the target repository's ────
  const [people, setPeople] = useState<string[]>([])
  const [repoLabels, setRepoLabels] = useState<{ name: string; color: string }[]>([])
  const [reviewers, setReviewers] = useState<string[]>([])
  const [assignees, setAssignees] = useState<string[]>([])
  const [labels, setLabels] = useState<string[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [createdUrl, setCreatedUrl] = useState<string | null>(null)
  const [createdNumber, setCreatedNumber] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ── Generated together (#130 §1) ──────────────────────────────
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  // ── Draft (#130 §3) ───────────────────────────────────────────
  const [draft, setDraft] = useState(false)

  // Reviewers, assignees and labels wait behind a fold: most requests need
  // none of them, and three empty fields made the everyday case scroll.
  const [moreOpen, setMoreOpen] = useState(false)

  // Cleared once the push has happened, so a retry after a GitHub error does
  // not push a second time. Derived, not stored: the intent answered for the
  // head IT proposed; a re-chosen head is asked through the same module, and
  // a head in another repository is not ours to push at all.
  const [pushed, setPushed] = useState(false)
  const needsPush = !pushed && src === currentFull
    && (head === intent.head ? intent.needsPush : branchNeedsPush(head, branches))

  useEffect(() => {
    // Prefill the title from the head branch's last commit — which is not
    // always HEAD: on the default branch the request runs from the branch you
    // right-clicked.
    window.gitAPI.getLastCommitMessage?.(intent.head).then((r: any) => {
      if (r?.message) setTitle(r.message.split('\n')[0])
    })
    // The repositories the selectors offer are the ones THIS repository is
    // connected to: each git remote that parses to a repository on the same
    // host, plus — below — a fork's parent, which a clone with no `upstream`
    // remote does not name. The account's whole repository list has no
    // business here: a request cannot run between repositories this one is
    // not related to.
    window.gitAPI.getRemotes?.().then((r: any) => {
      const parsed = ((r?.remotes ?? []) as { fetchUrl?: string; pushUrl?: string }[])
        .map(rm => parseRemote(rm.fetchUrl || rm.pushUrl))
        .filter((p): p is NonNullable<typeof p> => p !== null)
      // The host is the current repository's own; a remote elsewhere (a
      // GitLab mirror, say) cannot be an end of a GitHub request.
      const host = parsed.find(p => joinRepo(p.owner, p.repo) === currentFull)?.host
      const found = parsed
        .filter(p => !host || p.host === host)
        .map(p => joinRepo(p.owner, p.repo))
      if (found.length === 0) return
      setRepoOptions(prev => {
        const next = new Map(prev)
        for (const fn of found) if (!next.has(fn)) next.set(fn, { defaultBranch: null })
        return next
      })
    })
    ;(window.gitAPI as any).githubRepoParent?.(owner, repo).then((r: any) => {
      const p = r?.parent
      if (!p) return
      setRepoOptions(prev => {
        const next = new Map(prev)
        next.set(joinRepo(p.owner, p.repo), { defaultBranch: p.defaultBranch ?? null })
        return next
      })
    })
  }, [owner, repo, intent.head])

  // Each side's branch list belongs to ITS repository. For the open one the
  // local branches join the remote's — a head that still needs its first push
  // is a legitimate head, it just is not on GitHub yet.
  useEffect(() => {
    const { owner: o, repo: rp } = splitRepo(src)
    ;(window.gitAPI as any).githubListBranches(o, rp).then((r: any) => {
      const remote: string[] = r?.branches ?? []
      const local = src === currentFull ? branches.filter(b => !b.remote).map(b => b.name) : []
      setSrcBranches(Array.from(new Set([...remote, ...local])))
      if (src !== currentFull && !remote.includes(head)) setHead(remote[0] ?? '')
    })
    // The head moves with its repository; `branches` and `head` re-list nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, currentFull])

  useEffect(() => {
    const { owner: o, repo: rp } = splitRepo(dst)
    ;(window.gitAPI as any).githubListBranches(o, rp).then((r: any) => {
      const list: string[] = r?.branches ?? []
      setDstBranches(list)
      if (list.length === 0) return
      if (list.includes(base)) return
      // A base decided by the rules wins; only guess when they had no answer —
      // or when the target repository changed under it.
      const meta = repoOptions.get(dst)
      const preferred = meta?.defaultBranch && list.includes(meta.defaultBranch)
        ? meta.defaultBranch
        : list.find(b => b === 'main') ?? list.find(b => b === 'master') ?? list[0]
      setBase(preferred)
    })
    // Reviewers, assignees and labels belong to the repository the request
    // will LIVE in. A change of target drops the picks: a person or label
    // chosen for one repository means nothing to another, and GitHub would
    // refuse them anyway.
    setReviewers([]); setAssignees([]); setLabels([])
    ;(window.gitAPI as any).githubListAssignees?.(o, rp).then((r: any) => {
      setPeople(Array.isArray(r?.assignees) ? r.assignees : [])
    }).catch(() => setPeople([]))
    ;(window.gitAPI as any).githubListRepoLabels?.(o, rp).then((r: any) => {
      setRepoLabels(Array.isArray(r?.labels) ? r.labels : [])
    }).catch(() => setRepoLabels([]))
    // Re-listing when `base`/`repoOptions` move would fight the user's choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dst])

  const generate = async () => {
    if (generating) return
    setGenerating(true); setGenError(null)
    const r = await ((window.gitAPI as any).aiPrDescription?.(base, head)
      ?? Promise.resolve({ error: 'not-implemented' })).catch((e: any) => ({ error: e.message }))
    setGenerating(false)
    if (r?.error || !r?.title) { setGenError(r?.error ?? 'empty answer'); return }
    // It fills the fields; it never submits. The proposal is reviewed, like
    // every other AI action here.
    setTitle(r.title)
    setBody(r.body ?? '')
  }

  const samePair = src === dst && head === base
  const crossRepo = src !== dst
  const toggle = (set: React.Dispatch<React.SetStateAction<string[]>>) => (id: string) =>
    set(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  async function handleSubmit() {
    if (!title.trim() || samePair || !head || !base) return
    setSubmitting(true)
    setError(null)

    // GitHub can only open a request on a branch it already holds, which is
    // why the menu row promises a push before the request.
    if (needsPush) {
      setPushing(true)
      const p = await window.gitAPI.pushBranch(head) as any
      setPushing(false)
      if (!p?.success) {
        setSubmitting(false)
        setError(t('pr.pushError', p?.error ?? ''))
        return
      }
      setPushed(true)
      onPushed?.()
    }

    // The request lives in the TARGET repository; a head from another one is
    // spelled `owner:branch`, which is the whole of what a fork needs.
    const dstRef = splitRepo(dst)
    const headParam = crossRepo ? `${splitRepo(src).owner}:${head}` : head
    const r = await (window.gitAPI as any).githubCreatePR(
      dstRef.owner, dstRef.repo, title.trim(), body, headParam, base, draft) as any
    setSubmitting(false)
    if (r.error) {
      setError(r.error === 'not_authenticated' ? t('pr.noAuth') : t('pr.error', r.error))
      return
    }

    // Reviewers, assignees and labels ride AFTER the creation — the create
    // endpoint takes none of them. The request exists whatever happens next,
    // so a failure here is reported, never treated as a failure to create.
    const after: string[] = []
    if (reviewers.length > 0) {
      const rr = await (window.gitAPI as any).githubRequestReviewers?.(dstRef.owner, dstRef.repo, r.number, reviewers)
        .catch((e: any) => ({ error: e.message }))
      if (rr?.error) after.push(rr.error)
    }
    if (assignees.length > 0 || labels.length > 0) {
      const patch: { assignees?: string[]; labels?: string[] } = {}
      if (assignees.length > 0) patch.assignees = assignees
      if (labels.length > 0) patch.labels = labels
      const pr = await (window.gitAPI as any).githubUpdateIssue?.(dstRef.owner, dstRef.repo, r.number, patch)
        .catch((e: any) => ({ error: e.message }))
      if (pr?.error) after.push(pr.error)
    }
    if (after.length > 0) showToast(t('pr.afterCreateError', after.join(' — ')), 'err')

    setCreatedUrl(r.url)
    setCreatedNumber(r.number)
    showToast(t('pr.success', r.number), 'ok')
    onCreated?.(r.number)
  }

  const repoNames = Array.from(repoOptions.keys())
  const withCurrent = (list: string[], value: string) =>
    Array.from(new Set([...list, value])).filter(Boolean)
  const labelDots = Object.fromEntries(repoLabels.map(l => [l.name, l.color]))

  return (
    <PanelDrawer anchor={anchor} title={t('pr.title')} icon="pullRequest"
      closeLabel={t('common.close')} onClose={onClose}>
      {createdUrl ? (
        <div className="pr-success">
          <Icon name="check" size={32} />
          <p className="pr-success-text">{t('pr.success', createdNumber!)}</p>
          <div className="pr-success-actions">
            <button className="pr-btn-primary" onClick={() => window.gitAPI.openExternal(createdUrl)}>
              <Brand name="github" size={13} />
              {t('pr.openInBrowser')}
            </button>
            <button className="pr-btn-secondary" onClick={onClose}>{t('pr.close')}</button>
          </div>
        </div>
      ) : (
        <div className="pr-body">
          {/* The four ends: source repo + branch into target repo + branch.
              The intent prefilled them; from here they are the user's. */}
          <div className="pr-ends">
            <div className="pr-end">
              <label className="pr-label" htmlFor="gv-pr-src-repo">{t('pr.sourceRepo')}</label>
              <select id="gv-pr-src-repo" className="pr-select" value={src}
                onChange={e => setSrc(e.target.value)}>
                {withCurrent(repoNames, src).map(rn => <option key={rn} value={rn}>{rn}</option>)}
              </select>
              <label className="pr-label pr-label--stacked" htmlFor="gv-pr-head">{t('pr.branchLabel')}</label>
              <select id="gv-pr-head" className="pr-select pr-select--branch" value={head}
                title={t('pr.headLabel')}
                onChange={e => setHead(e.target.value)}>
                {withCurrent(srcBranches, head).map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <Icon name="arrowRight" className="pr-ends-arrow" />
            <div className="pr-end">
              <label className="pr-label" htmlFor="gv-pr-dst-repo">{t('pr.targetRepo')}</label>
              <select id="gv-pr-dst-repo" className="pr-select" value={dst}
                onChange={e => setDst(e.target.value)}>
                {withCurrent(repoNames, dst).map(rn => <option key={rn} value={rn}>{rn}</option>)}
              </select>
              <label className="pr-label pr-label--stacked" htmlFor="gv-pr-base">{t('pr.branchLabel')}</label>
              <select id="gv-pr-base" className="pr-select pr-select--branch" value={base}
                title={t('pr.baseLabel')}
                onChange={e => setBase(e.target.value)}>
                {withCurrent(dstBranches, base)
                  .filter(b => !(src === dst && b === head))
                  .map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          {/* Title — and the offer to write both fields from the branch, in
              the AI ink and never a filled button: what a model proposes is a
              proposal. Only for the open repository: another one's diff is
              not on this disk to read. */}
          <div className="pr-field">
            <span className="pr-label pr-label--split">
              <label htmlFor="gv-pr-title">{t('pr.titleLabel')}</label>
              {src === currentFull && (
                <button type="button" className="pr-generate" disabled={generating}
                  onClick={() => void generate()}>
                  <Icon name="ai" size={13} />
                  {generating ? t('pr.generating') : t('pr.generate')}
                </button>
              )}
            </span>
            <input
              id="gv-pr-title"
              className="pr-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t('pr.titlePlaceholder')}
              autoFocus
            />
          </div>
          {genError && <div className="pr-error">{genError}</div>}

          {/* Body */}
          <div className="pr-field">
            <label className="pr-label" htmlFor="gv-pr-body">{t('pr.bodyLabel')}</label>
            <textarea
              id="gv-pr-body"
              className="pr-textarea"
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={t('pr.bodyPlaceholder')}
              rows={6}
            />
          </div>

          {/* Who reads it, who owns it, how it is filed — the target
              repository's people and labels, applied right after creation.
              Behind a fold, and the fold does not lie: picks made and folded
              away still show as a count. */}
          <button type="button" className="pr-more" aria-expanded={moreOpen}
            onClick={() => setMoreOpen(o => !o)}>
            <Icon name="chevronRight" size={10}
              className={`pr-more-chev${moreOpen ? ' pr-more-chev--open' : ''}`} />
            {t('pr.moreOptions')}
            {!moreOpen && (reviewers.length + assignees.length + labels.length) > 0 && (
              <span className="pr-more-count">{reviewers.length + assignees.length + labels.length}</span>
            )}
          </button>
          {moreOpen && (
            <>
              <PickField label={t('pr.reviewersLabel')} placeholder={t('pr.reviewersPlaceholder')}
                options={people} chosen={reviewers} onToggle={toggle(setReviewers)} />
              <PickField label={t('pr.assigneesLabel')} placeholder={t('pr.assigneesPlaceholder')}
                options={people} chosen={assignees} onToggle={toggle(setAssignees)} />
              <PickField label={t('pr.labelsLabel')} placeholder={t('pr.labelsPlaceholder')}
                options={repoLabels.map(l => l.name)} chosen={labels} onToggle={toggle(setLabels)}
                dots={labelDots} />
            </>
          )}

          <label className="pr-draft" title={t('pr.draftHelp')}>
            <input type="checkbox" checked={draft} onChange={e => setDraft(e.target.checked)} />
            {t('pr.draftLabel')}
          </label>

          {/* Say up front that submitting also pushes — the branch has to
              exist on the remote for GitHub to accept the PR at all. Quietly:
              it is a routine fact, not a warning, and the menu row that opens
              this composer already promised it. */}
          {needsPush && !error && <div className="pr-note">{t('pr.willPush', head)}</div>}
          {samePair && <div className="pr-error">{t('pr.sameBranch')}</div>}
          {error && <div className="pr-error">{error}</div>}

          <div className="pr-footer">
            <button className="pr-btn-secondary" onClick={onClose}>{t('dlg.cancel')}</button>
            <button
              className="pr-btn-primary"
              onClick={handleSubmit}
              disabled={submitting || !title.trim() || samePair || !head || !base}
            >
              {pushing ? t('pr.pushing') : submitting ? t('pr.submitting') : t('pr.submit')}
            </button>
          </div>
        </div>
      )}
    </PanelDrawer>
  )
}
