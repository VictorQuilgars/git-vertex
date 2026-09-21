// A branch's or a tag's card (#258): what a click on its chip opens, over the
// details panel and nothing else — the graph stays in reach beside it.
//
// What a branch IS used to be spread over the overview's card, the chip's menu
// and the side panel. Here it is in one place, top to bottom: the issue and the
// pull request it carries, where it stands against its upstream, where it
// stands against the branch it will merge into — with the one verdict that
// matters, would it conflict — its last commit, and what to do next. A tag
// says what it points at, who tagged it and what they wrote, and whether the
// remote has it.
//
// Every action is the host's, and optional: a row whose handler is absent is
// not drawn. The facts that need git are read here, once per reference.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Icon, type IconName } from '../Icon/Icon'
import ContextMenu, { type MenuAction, type MenuItemDef } from '../ContextMenu/ContextMenu'
import { useLang } from '../../i18n/LanguageContext'
import { agoLabel } from '../Sidebar/sections/OverviewSection'
import type { BranchInfo, CommitNode } from '../../types'
import { currentBranchPR, type BranchPRState } from '../../../../main/github-branch-prs'
import {
  branchOf, mergeTargetOf, mergeVerdict, splitRemoteRef, upstreamFacts,
  type MergeFacts, type RefTarget,
} from './ref-card-model'
import './RefCard.css'

export interface RefCardActions {
  /** "Take me there": lands on a local branch, creating the one that tracks a remote. */
  onSwitch?: (name: string) => void
  /** These three act on the CHECKED-OUT branch, and are only offered on its card. */
  onPull?: () => void
  onPush?: () => void
  onFetch?: () => void
  /** Push a branch that is not checked out, or publish one that tracks nothing. */
  onPushBranch?: (name: string) => void
  onSetUpstream?: (name: string) => void
  onCompare?: (name: string) => void
  /** Merge `name` into the current branch / rebase the current branch onto `name`. */
  onMerge?: (name: string) => void
  onRebase?: (name: string) => void
  onOpenOnRemote?: (name: string) => void
  onDelete?: (name: string) => void
  /** Called with `remotes/<remote>/<branch>` — the one spelling deleteRemoteBranch reads unambiguously. */
  onDeleteRemote?: (ref: string) => void
  /** A local branch and the upstream it tracks (`origin/x`), with one confirmation. */
  onDeleteBoth?: (name: string, upstream: string) => void
  /** Opens the request in the app's own sheet — any state, not only the open ones the host lists. */
  onOpenPR?: (number: number, pr?: { title?: string; url?: string }) => void
  onCreatePR?: (name: string) => void
  onPushTag?: (name: string) => void
  onDeleteTag?: (name: string) => void
  onCheckoutTag?: (name: string) => void
  onCreateBranchAt?: (hash: string) => void
}

export interface RefCardProps extends RefCardActions {
  target: RefTarget
  branches: readonly BranchInfo[]
  currentBranch: string
  defaultBranch: string | null
  /** The commit the chip sits on, when the page holds it. */
  tip?: CommitNode | null
  /** The open request the host already knows of — shown at once, before the card has asked. */
  pr?: { number: number; title?: string; state?: BranchPRState } | null
  /** Where to ask for the requests the branch carried, any state. Absent: only `pr` is known. */
  githubRepo?: { owner: string; repo: string } | null
  issue?: { key: string; provider: string } | null
  /** The chip's own menu, behind the kebab — the same one, not a second copy. */
  menuItems?: MenuItemDef[]
  onClose: () => void
}

type Tag = { name: string; commit: string; annotated: boolean; message?: string; tagger?: string; taggerEmail?: string; date?: number }

/** The request a card speaks of: the host's open one at first, then GitHub's answer. */
type CardPR = { number: number; title?: string; url?: string; state: BranchPRState; headSha?: string }

/** One "next step": what it is, and the one button that does it. */
function Step({ icon, label, button, onClick, title }: {
  icon: IconName; label: React.ReactNode; button: string; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; title?: string
}) {
  return (
    <div className="refcard-step">
      <Icon name={icon} size={14} className="refcard-step-icon" />
      <span className="refcard-step-label">{label}</span>
      <button type="button" className="refcard-btn" onClick={onClick} title={title}>{button}</button>
    </div>
  )
}

export default function RefCard(props: RefCardProps) {
  const { target, branches, currentBranch, defaultBranch, tip, issue, menuItems, onClose, githubRepo } = props
  const { t } = useLang()
  const locale = t('graph.dateLocale')
  const isTag = target.kind === 'tag', isRemote = target.kind === 'remote'
  const branch = branchOf(target, branches)
  const isCurrent = target.kind === 'head' && target.name === currentBranch
  const mergeInto = mergeTargetOf(target, defaultBranch)
  const kebabRef = useRef<HTMLButtonElement>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  // Delete, when there is a choice to make: this branch, or it and its upstream.
  const [deleteMenu, setDeleteMenu] = useState<{ x: number; y: number; anchor: HTMLElement } | null>(null)
  // What the target tracks: `main` merged on this machine is not `origin/main` merged.
  const targetUpstream = mergeInto ? branches.find(b => !b.remote && b.name === mergeInto)?.upstream ?? null : null

  // Escape closes the card — unless something of its own is open on top of it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || menu || deleteMenu) return
      if (document.querySelector('.ctx-menu, [role="menu"], .dlg-overlay')) return
      e.preventDefault(); e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, menu, deleteMenu])

  // ── Against the branch it merges into: how far, and would it conflict ──
  const [merge, setMerge] = useState<MergeFacts | null>(null)
  const [mergeLoading, setMergeLoading] = useState(false)
  // Merged into the target — and is it in the target's upstream too? A merge
  // made here and not pushed says "merged" of a branch whose pull request is
  // still open, and deleting its remote side would close that request.
  const [onTargetUpstream, setOnTargetUpstream] = useState<boolean | null>(null)
  /**
   * The commits the target already holds under another hash (#307).
   *
   * A base branch merged with rebase or squash puts COPIES on the target, and
   * a branch that was stacked on it still carries the originals — which is a
   * guaranteed conflict in every changelog-shaped file, about a change that is
   * already in. `git cherry` is the same patch-id test a rebase uses to drop
   * them, so what is reported here is exactly what the rebase would remove.
   */
  const [dupes, setDupes] = useState<{ duplicates: { shortHash: string; subject: string }[]; total: number } | null>(null)
  useEffect(() => {
    setMerge(null)
    setOnTargetUpstream(null)
    setDupes(null)
    if (!mergeInto) return
    let stale = false
    setMergeLoading(true)
    ;(async () => {
      try {
        // ⚠️ compareBranches(a, b) speaks of B: `ahead` is what b has that a
        // lacks. Asked as (target, branch), `ahead` is the branch's own commits
        // and `behind` is what the target has gone on to without it.
        const r = await window.gitAPI.compareBranches(mergeInto, target.name)
        const ahead = r?.ahead?.length ?? 0, behind = r?.behind?.length ?? 0
        if (stale) return
        // The distance first: it is one rev-list. The verdict follows when it is asked for at all.
        setMerge({ target: mergeInto, ahead, behind, conflicts: null })
        if (behind > 0 && ahead > 0) {
          const c = await window.gitAPI.predictConflicts(target.name, mergeInto)
          if (!stale && !c?.error) setMerge({ target: mergeInto, ahead, behind, conflicts: (c?.files ?? []).length })
        }
        if (ahead === 0 && behind > 0 && targetUpstream) {
          const u = await window.gitAPI.compareBranches(targetUpstream, target.name)
          if (!stale && Array.isArray(u?.ahead)) setOnTargetUpstream(u.ahead.length === 0)
        }
        // Only a branch with commits of its own can be carrying a copy, and
        // the answer is one local `git cherry`. An older host has no such
        // method: the line is simply not drawn, rather than drawn empty.
        if (ahead > 0) {
          const d = await window.gitAPI.duplicateCommits?.(target.name, mergeInto)
          if (!stale && d && !d.error && Array.isArray(d.duplicates) && d.duplicates.length > 0) {
            setDupes({ duplicates: d.duplicates, total: d.total ?? ahead })
          }
        }
      } catch { /* no distance to show: the card says nothing about it */ }
      finally { if (!stale) setMergeLoading(false) }
    })()
    return () => { stale = true }
  }, [target.name, target.hash, mergeInto, targetUpstream])

  // ── Checked out somewhere else? ──
  const [worktree, setWorktree] = useState<string | null>(null)
  useEffect(() => {
    setWorktree(null)
    if (target.kind !== 'head' || isCurrent) return
    let stale = false
    window.gitAPI.listWorktrees?.().then(r => {
      const hit = (r?.worktrees ?? []).find(w => !w.isMain && w.branch.replace(/^refs\/heads\//, '') === target.name)
      if (!stale && hit) setWorktree(hit.path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? hit.path)
    }).catch(() => {})
    return () => { stale = true }
  }, [target.kind, target.name, isCurrent])

  // ── The pull request it carried: open, or merged, or closed — whatever GitHub has ──
  const [askedPR, setAskedPR] = useState<CardPR | null | undefined>(undefined)
  const prBranch = target.kind === 'head' ? target.name : isRemote ? splitRemoteRef(target.name).branch : null
  useEffect(() => {
    setAskedPR(undefined)
    if (!prBranch || !githubRepo) return
    let stale = false
    window.gitAPI.githubBranchPRs?.(githubRepo.owner, githubRepo.repo, prBranch)
      .then(r => { if (!stale && Array.isArray(r?.prs)) setAskedPR(currentBranchPR(r.prs)) })
      .catch(() => {})
    return () => { stale = true }
  }, [prBranch, githubRepo?.owner, githubRepo?.repo])
  // GitHub's answer when it has come; until then, what the host knew.
  const pr: CardPR | null = askedPR !== undefined ? askedPR
    : props.pr ? { number: props.pr.number, title: props.pr.title, state: props.pr.state ?? 'open' } : null
  const prOpen = pr?.state === 'open' || pr?.state === 'draft'
  // Squashed or rebased on GitHub, a branch's commits are nowhere in main — git
  // calls it unmerged. The request knows better: merged, from this very tip.
  const sameCommit = (a?: string, b?: string) => !!a && !!b && (a.startsWith(b) || b.startsWith(a))
  const mergedByPR = pr?.state === 'merged' && sameCommit(pr.headSha, target.hash) ? pr : null
  const prStateLabel = (state: BranchPRState) => t(`refcard.pr.${state}` as any)

  // ── A tag: what it is, then — slower, it asks the remote — whether it is pushed ──
  const [tag, setTag] = useState<Tag | null>(null)
  const [onRemote, setOnRemote] = useState<{ pushed: boolean | null; remote: string | null } | 'asking'>('asking')
  useEffect(() => {
    setTag(null); setOnRemote('asking')
    if (!isTag) return
    let stale = false
    window.gitAPI.getTagDetails(target.name).then(r => { if (!stale) setTag(r?.tag ?? null) }).catch(() => {})
    window.gitAPI.isTagOnRemote(target.name)
      .then(r => { if (!stale) setOnRemote(r ?? { pushed: null, remote: null }) })
      .catch(() => { if (!stale) setOnRemote({ pushed: null, remote: null }) })
    return () => { stale = true }
  }, [isTag, target.name, target.hash])

  const up = useMemo(() => branch && !isRemote && !isTag ? upstreamFacts(branch) : null, [branch, isRemote, isTag])
  // git's verdict — unless the request says the branch went in by a squash or a rebase.
  const verdict = merge ? (mergedByPR ? 'merged' : mergeVerdict(merge)) : null
  const n = (count: number) => count.toLocaleString('en-US')
  // Merged into `main` here, and `origin/main` has not got it: a merge nobody pushed.
  // A merged request is on the remote by definition, whatever git can trace.
  const localOnlyMerge = !mergedByPR && onTargetUpstream === false && !!targetUpstream

  // Delete, from either end of a branch: this end alone, the other alone, or
  // both as one decision — so neither card sends you to the other. What the
  // remote end costs is on each choice that touches it: the open request it
  // closes, a merge that exists only on this machine.
  const liveUpstream = target.kind === 'head' && up?.name && up.state !== 'missing' && up.state !== 'unpublished' ? up.name : null
  const remoteCost = [
    prOpen && pr ? t('refcard.del.closesPR', pr.number) : null,
    localOnlyMerge ? t('refcard.del.notOnRemote', targetUpstream!) : null,
  ].filter(Boolean).join(' · ')
  const costly = (label: string) => remoteCost ? t('refcard.del.withCost', label, remoteCost) : label
  const choices: MenuAction[] = []
  if (target.kind === 'head' && !isCurrent && liveUpstream) {
    if (props.onDelete) choices.push({ label: t('refcard.del.local', target.name), action: () => props.onDelete!(target.name) })
    if (props.onDeleteRemote) choices.push({ label: costly(t('refcard.del.remote', liveUpstream)), action: () => props.onDeleteRemote!(`remotes/${liveUpstream}`), danger: true })
    if (props.onDelete && props.onDeleteBoth) choices.push({ label: costly(t('refcard.del.both', target.name, liveUpstream)), action: () => props.onDeleteBoth!(target.name, liveUpstream), danger: true })
  }
  // The local branch that tracks a remote one — never the one checked out, which git will not delete.
  const tracker = isRemote ? branches.find(b => !b.remote && !b.gone && b.upstream === target.name && b.name !== currentBranch) : undefined
  if (isRemote && props.onDeleteRemote) {
    choices.push({ label: costly(t('refcard.del.remote', target.name)), action: () => props.onDeleteRemote!(`remotes/${target.name}`), danger: true })
    if (tracker && props.onDeleteBoth) choices.push({ label: costly(t('refcard.del.both', tracker.name, target.name)), action: () => props.onDeleteBoth!(tracker.name, target.name), danger: true })
  }
  const deleteChoices = choices.length > 1 ? choices : null
  const requestDelete = (e: React.MouseEvent<HTMLElement>) => {
    if (!deleteChoices) {
      // One way to delete from here: it is the button's own action, no menu in between.
      if (choices[0]?.action) choices[0].action()
      else props.onDelete?.(target.name)
      return
    }
    if (deleteMenu) { setDeleteMenu(null); return }
    const anchor = e.currentTarget
    const r = anchor.getBoundingClientRect()
    setDeleteMenu({ x: r.left, y: r.bottom + 2, anchor })
  }

  const kindIcon: IconName = isTag ? 'tag' : isRemote ? 'cloud' : 'branch'
  const kindLabel = t(isTag ? 'refcard.kind.tag' : isRemote ? 'refcard.kind.remote' : 'refcard.kind.branch')

  // ── The upstream card's foot: a status word and the buttons that fit it ──
  const upstreamButtons = (): React.ReactNode[] => {
    if (!up) return []
    const out: React.ReactNode[] = []
    const btn = (key: string, label: string, onClick?: () => void, title?: string) => {
      if (onClick) out.push(<button key={key} type="button" className="refcard-btn" onClick={onClick} title={title}>{label}</button>)
    }
    const push = isCurrent ? props.onPush : props.onPushBranch ? () => props.onPushBranch!(target.name) : undefined
    // Publishing must establish tracking, including for the checked-out branch.
    // Its generic Push can open the modal and send commits without an upstream.
    const publish = props.onPushBranch ? () => props.onPushBranch!(target.name) : undefined
    if (up.state === 'unpublished') btn('publish', t('refcard.publish'), publish)
    else if (up.state === 'missing') {
      btn('delete', t('refcard.deleteLocal'), props.onDelete && !isCurrent ? () => props.onDelete!(target.name) : undefined)
      // Gone because its request was merged: publishing it would bring back a finished branch.
      if (!mergedByPR) btn('publish', t('refcard.publish'), publish)
    } else {
      if (up.behind > 0) btn('pull', t('refcard.pull'), isCurrent ? props.onPull : undefined)
      if (up.ahead > 0) btn('push', t(up.behind > 0 ? 'refcard.forcePush' : 'refcard.push'), up.behind > 0 ? undefined : push)
      // Merged, a branch has nothing left to learn from its remote: what is left is deleting it.
      if (verdict !== 'merged') btn('fetch', t('refcard.fetch'), props.onFetch)
    }
    return out
  }
  const upstreamStatus = !up ? '' : up.state === 'missing' ? (mergedByPR ? t('refcard.up.deletedAfterMerge', mergedByPR.number) : t('refcard.up.missing'))
    : up.state === 'diverged' ? t('refcard.up.diverged')
    : up.state === 'behind' ? t('refcard.up.toPull', up.behind)
    : up.state === 'ahead' ? t('refcard.up.toPush', up.ahead)
    : up.state === 'level' ? t('refcard.up.level') : ''

  const mergeStatus = !merge || !verdict ? ''
    : verdict === 'merged' ? (mergedByPR ? t('refcard.merge.byPR', mergedByPR.number)
      : localOnlyMerge ? t('refcard.merge.notOnRemote', targetUpstream!) : t('refcard.merge.safeToDelete'))
    : verdict === 'in-sync' ? (merge.ahead > 0 ? t('refcard.merge.basedWith', merge.target, merge.ahead) : t('refcard.merge.based', merge.target))
    : t('refcard.merge.behind', merge.target, merge.behind)
  const verdictChip = !merge || !verdict || verdict === 'in-sync' ? null
    : verdict === 'merged' ? { icon: 'check' as IconName, text: t('refcard.merge.merged'),
        title: mergedByPR ? t('refcard.merge.byPRTip', mergedByPR.number, merge.target) : t('refcard.merge.mergedTip', merge.target) }
    : verdict === 'clean' ? { icon: 'check' as IconName, text: t('refcard.merge.noConflicts'), title: t('refcard.merge.cleanTip', merge.target) }
    : verdict === 'conflicts' ? { icon: 'conflict' as IconName, text: t('refcard.merge.conflicts', merge.conflicts ?? 0), title: t('refcard.merge.conflictsTip', merge.target, merge.conflicts ?? 0) }
    : { icon: 'info' as IconName, text: t('refcard.merge.unknown'), title: t('refcard.merge.unknownTip') }

  const remoteParts = isRemote ? splitRemoteRef(target.name) : null

  return (
    <div className="refcard-host">
      <div className="refcard-scrim" onMouseDown={onClose} />
      <section className={`refcard refcard--${target.kind}`} role="dialog" aria-label={`${kindLabel} ${target.name}`}>
        <header className="refcard-head">
          <div className="refcard-title">
            <Icon name={kindIcon} size={15} className="refcard-kind" />
            <h2 className="refcard-name" title={target.name}>{target.name}</h2>
            {menuItems && menuItems.length > 0 && (
              <button ref={kebabRef} type="button" className="refcard-chip-btn"
                title={t(isTag ? 'refcard.tagActions' : 'refcard.branchActions')}
                aria-label={t(isTag ? 'refcard.tagActions' : 'refcard.branchActions')}
                onClick={() => {
                  if (menu) { setMenu(null); return }
                  const r = kebabRef.current!.getBoundingClientRect()
                  setMenu({ x: r.left, y: r.bottom + 2 })
                }}><Icon name="kebab" size={14} /></button>
            )}
            {!isTag && props.onOpenOnRemote && (isRemote || (up && up.state !== 'unpublished' && up.state !== 'missing')) && (
              <button type="button" className="refcard-chip-btn" title={t('refcard.openOnRemote')} aria-label={t('refcard.openOnRemote')}
                onClick={() => props.onOpenOnRemote!(isRemote ? remoteParts!.branch : target.name)}><Icon name="externalLink" size={14} /></button>
            )}
          </div>
          <button type="button" className="refcard-chip-btn refcard-close" title={t('common.close')} aria-label={t('common.close')} onClick={onClose}>×</button>
        </header>

        <div className="refcard-body">
          {/* One row of what the reference carries: its issue on the left, its
              pull request and the worktree it is out in on the right. */}
          {!isTag && (issue || pr || worktree) && (
            <div className="refcard-strip">
              {issue && (
                <span className="refcard-pill" title={issue.provider === 'github' ? `Issue #${issue.key}` : issue.key}>
                  <Icon name="issue" size={12} />{issue.provider === 'github' ? `#${issue.key}` : issue.key}
                </span>
              )}
              <span className="refcard-strip-right">
                {worktree && <span className="refcard-pill" title={t('refcard.inWorktree', worktree)}><Icon name="worktree" size={12} />{worktree}</span>}
                {pr && (
                  <button type="button" className={`refcard-pill refcard-pill--pr refcard-pill--${pr.state}`} disabled={!props.onOpenPR}
                    title={t('refcard.prTip', pr.number, prStateLabel(pr.state), pr.title ?? '')}
                    onClick={() => props.onOpenPR?.(pr.number, { title: pr.title, url: pr.url })}>
                    <Icon name="pullRequest" size={12} />#{pr.number}
                    <span className="refcard-pill-state">{prStateLabel(pr.state)}</span>
                  </button>
                )}
              </span>
            </div>
          )}

          {/* A tag's strip: the commit it points at. */}
          {isTag && (
            <div className="refcard-strip">
              <Icon name="commit" size={12} className="refcard-strip-icon" />
              <code className="refcard-sha">{(tag?.commit ?? target.hash).slice(0, 7)}</code>
              <span className="refcard-strip-text" title={tip?.message}>{tip?.message ?? ''}</span>
            </div>
          )}

          <div className="refcard-hub">
            {(up || mergeInto) && (
              <div className="refcard-cards">
                {up && (
                  <div className="refcard-card">
                    <div className="refcard-card-head">
                      <Icon name="cloud" size={14} className="refcard-card-icon" />
                      <span>{t('refcard.upstream')}</span>
                      {up.name
                        ? <button type="button" className="refcard-token" disabled={!props.onSetUpstream}
                            title={t('refcard.changeUpstream', up.name)} onClick={() => props.onSetUpstream?.(target.name)}>
                            {up.name}{props.onSetUpstream && <Icon name="pencil" size={11} />}
                          </button>
                        : <button type="button" className="refcard-token refcard-token--muted" disabled={!props.onSetUpstream}
                            title={t('refcard.setUpstream')} onClick={() => props.onSetUpstream?.(target.name)}>
                            {t('refcard.unpublished')}
                          </button>}
                    </div>
                    <div className="refcard-card-foot">
                      {up.state !== 'unpublished' && (
                        <span className={`refcard-track refcard-track--${up.state}`}
                          title={up.state === 'level' ? t('refcard.track.level', target.name, up.name ?? '')
                            : up.state === 'missing' ? t('refcard.track.missing', target.name, up.name ?? '')
                            : t('refcard.track.apart', target.name, up.behind, up.ahead, up.name ?? '')}>
                          {up.state === 'missing' ? <Icon name="conflict" size={11} />
                            : up.state === 'level' ? <Icon name="check" size={11} />
                            : <>{up.behind > 0 && <>{n(up.behind)}↓</>}{up.behind > 0 && up.ahead > 0 && ' '}{up.ahead > 0 && <>{n(up.ahead)}↑</>}</>}
                        </span>
                      )}
                      {upstreamStatus && <span className="refcard-status">{upstreamStatus}</span>}
                      <span className="refcard-actions">{upstreamButtons()}</span>
                    </div>
                  </div>
                )}

                {mergeInto && (merge
                  ? <div className={`refcard-card refcard-card--${verdict}`}>
                      <div className="refcard-card-head">
                        <Icon name="merge" size={14} className="refcard-card-icon" />
                        <span>{t('refcard.mergesInto')}</span>
                        <strong className="refcard-target">{merge.target}</strong>
                      </div>
                      {/* The cause, when there is one to name (#307). A copy of
                          your own commit on the target conflicts on every line
                          it added — and the conflict itself says nothing about
                          why, so the reader resolves a clash with themselves. */}
                      {dupes && (
                        <div className="refcard-dupes"
                          title={t('refcard.merge.dupesTip', merge.target,
                            dupes.duplicates.map(d => `${d.shortHash}  ${d.subject}`).join('\n'))}>
                          <Icon name="info" size={11} />
                          <span className="refcard-dupes-text">{t('refcard.merge.dupes', dupes.duplicates.length, merge.target)}</span>
                          {isCurrent && props.onRebase && (
                            <button type="button" className="refcard-btn"
                              onClick={() => props.onRebase!(merge.target)}>
                              {t('refcard.merge.dupesDrop', merge.target)}
                            </button>
                          )}
                        </div>
                      )}
                      <div className="refcard-card-foot">
                        {verdictChip && (
                          <span className={`refcard-verdict refcard-verdict--${verdict}`} title={verdictChip.title}>
                            <Icon name={verdictChip.icon} size={12} />{verdictChip.text}
                          </span>
                        )}
                        <span className="refcard-status">{mergeStatus}</span>
                        <span className="refcard-actions">
                          {verdict === 'merged' && props.onDelete && !isCurrent && (
                            <button type="button" className="refcard-btn" aria-haspopup={deleteChoices ? 'menu' : undefined}
                              aria-expanded={deleteChoices ? !!deleteMenu : undefined} onClick={requestDelete}>
                              {t('refcard.deleteBranch')}{deleteChoices && <Icon name="caretDown" size={10} />}
                            </button>
                          )}
                          {/* Merge first, on purpose: it is the one that rewrites nothing. */}
                          {(verdict === 'clean' || verdict === 'unknown' || verdict === 'conflicts') && isCurrent && <>
                            {props.onMerge && <button type="button" className="refcard-btn" title={t('refcard.mergeTip', merge.target, target.name)} onClick={() => props.onMerge!(merge.target)}>{t('refcard.merge')}</button>}
                            {props.onRebase && <button type="button" className="refcard-btn" title={t('refcard.rebaseTip', target.name, merge.target)} onClick={() => props.onRebase!(merge.target)}>{t('refcard.rebase')}</button>}
                          </>}
                        </span>
                      </div>
                    </div>
                  // The distance is being read: the card's shape, not a spinner.
                  : mergeLoading && <div className="refcard-card refcard-card--loading" aria-hidden="true"><i /><i /></div>)}
              </div>
            )}

            {/* A tag's annotation: who, when, and what they wrote. */}
            {isTag && tag?.annotated && (
              <div className="refcard-annotation">
                <div className="refcard-annotation-who">
                  <Icon name="person" size={12} />
                  <span>{tag.tagger ?? t('refcard.tag.unknownTagger')}</span>
                  {tag.date && <span className="refcard-when">{agoLabel(tag.date, locale)}</span>}
                </div>
                {tag.message && <pre className="refcard-annotation-text">{tag.message}</pre>}
              </div>
            )}
            {isTag && tag && !tag.annotated && <div className="refcard-note">{t('refcard.tag.lightweight')}</div>}
            {isTag && (
              <div className={`refcard-note refcard-note--remote${onRemote !== 'asking' && onRemote.pushed === false ? ' refcard-note--local' : ''}`}>
                <Icon name="cloud" size={12} />
                {onRemote === 'asking' ? t('refcard.tag.asking')
                  : onRemote.pushed === true ? t('refcard.tag.pushed', onRemote.remote ?? '')
                  : onRemote.pushed === false ? t('refcard.tag.notPushed', onRemote.remote ?? '')
                  : t('refcard.tag.unknownRemote')}
              </div>
            )}

            {/* The last commit: when, who, what. */}
            {!isTag && (tip || branch?.date) && (
              <div className="refcard-last">
                <span className="refcard-section">{t('refcard.lastCommit')}</span>
                <div className="refcard-last-row">
                  <span className="refcard-last-msg" title={tip?.message ?? branch?.label}>{tip?.message ?? branch?.label}</span>
                  {tip?.author && <span className="refcard-last-who">{tip.author}</span>}
                  {(branch?.date || tip?.date) && (
                    <span className="refcard-when">{agoLabel(branch?.date ?? Math.floor(new Date(tip!.date).getTime() / 1000), locale)}</span>
                  )}
                </div>
              </div>
            )}

            {(() => {
              // Only the rows that apply, and the heading only when one does.
              const rows = React.Children.toArray(<>
                {target.kind === 'head' && !isCurrent && !worktree && props.onSwitch && (
                  <Step icon="switchBranch" label={t('refcard.step.switch', target.name)} button={t('refcard.switch')} onClick={() => props.onSwitch!(target.name)} />
                )}
                {isRemote && props.onSwitch && (
                  <Step icon="switchBranch" label={t('refcard.step.switch', target.name)} button={t('refcard.switch')} onClick={() => props.onSwitch!(target.name)} />
                )}
                {worktree && <div className="refcard-step refcard-step--fact"><Icon name="worktree" size={14} className="refcard-step-icon" /><span className="refcard-step-label">{t('refcard.inWorktree', worktree)}</span></div>}
                {!isTag && pr && props.onOpenPR && (
                  <Step icon="pullRequest" label={t('refcard.step.prState', pr.number, prStateLabel(pr.state), pr.title ?? '')} button={t('refcard.view')}
                    onClick={() => props.onOpenPR!(pr.number, { title: pr.title, url: pr.url })} />
                )}
                {/* A new request when none is open and the last one did not take this very tip. */}
                {target.kind === 'head' && !prOpen && !mergedByPR && up && up.state !== 'unpublished' && props.onCreatePR && mergeInto && (
                  <Step icon="pullRequest" label={t('refcard.step.createPR')} button={t('refcard.createPR')} onClick={() => props.onCreatePR!(target.name)} />
                )}
                {!isCurrent && props.onCompare && (
                  <Step icon="compare" label={t('refcard.step.compare', currentBranch)} button={t('refcard.compare')} onClick={() => props.onCompare!(target.name)} />
                )}
                {target.kind === 'head' && !isCurrent && props.onMerge && (
                  <Step icon="merge" label={t('refcard.step.mergeInto', target.name, currentBranch)} button={t('refcard.merge')} onClick={() => props.onMerge!(target.name)} />
                )}
                {target.kind === 'head' && !isCurrent && props.onRebase && (
                  <Step icon="rebase" label={t('refcard.step.rebaseOnto', currentBranch, target.name)} button={t('refcard.rebase')} onClick={() => props.onRebase!(target.name)} />
                )}
                {isTag && props.onCreateBranchAt && (
                  <Step icon="newBranch" label={t('refcard.step.branchFromTag', target.name)} button={t('refcard.createBranch')} onClick={() => props.onCreateBranchAt!(tag?.commit ?? target.hash)} />
                )}
                {isTag && props.onCheckoutTag && (
                  <Step icon="switchBranch" label={t('refcard.step.checkoutTag', target.name)} button={t('refcard.switch')} onClick={() => props.onCheckoutTag!(target.name)} />
                )}
                {isTag && props.onPushTag && !(onRemote !== 'asking' && onRemote.pushed === true) && (
                  <Step icon="push" label={t('refcard.step.pushTag', target.name)} button={t('refcard.pushTag')} onClick={() => props.onPushTag!(target.name)} />
                )}
                {isTag && props.onDeleteTag && (
                  <Step icon="trash" label={t('refcard.step.deleteTag', target.name)} button={t('refcard.delete')} onClick={() => props.onDeleteTag!(target.name)} />
                )}
                {/* Never the default branch from here: one click is too close for the branch everything merges into. */}
                {target.kind === 'head' && !isCurrent && target.name !== defaultBranch && props.onDelete && verdict !== 'merged' && (
                  <Step icon="trash" label={t('refcard.step.delete', target.name)} button={t('refcard.delete')} onClick={requestDelete} />
                )}
                {/* `remotes/` in front: `origin/x` alone reads as a branch called `origin/x` on the default remote. */}
                {isRemote && props.onDeleteRemote && (
                  <Step icon="trash" label={t('refcard.step.deleteRemote', target.name)} button={t('refcard.delete')} onClick={requestDelete} />
                )}
              </>)
              return rows.length > 0 && (
                <div className="refcard-steps">
                  <span className="refcard-section">{t('refcard.nextSteps')}</span>
                  {rows}
                </div>
              )
            })()}
          </div>
        </div>
      </section>
      {menu && menuItems && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} anchor={kebabRef.current} onClose={() => setMenu(null)} />
      )}
      {deleteMenu && deleteChoices && (
        <ContextMenu x={deleteMenu.x} y={deleteMenu.y} items={deleteChoices} anchor={deleteMenu.anchor} onClose={() => setDeleteMenu(null)} />
      )}
    </div>
  )
}
