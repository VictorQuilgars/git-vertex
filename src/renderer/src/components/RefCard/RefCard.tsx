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
import ContextMenu, { type MenuItemDef } from '../ContextMenu/ContextMenu'
import { useLang } from '../../i18n/LanguageContext'
import { agoLabel } from '../Sidebar/sections/OverviewSection'
import type { BranchInfo, CommitNode } from '../../types'
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
  onDeleteRemote?: (ref: string) => void
  onOpenPR?: (number: number) => void
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
  pr?: { number: number; title?: string } | null
  issue?: { key: string; provider: string } | null
  /** The chip's own menu, behind the kebab — the same one, not a second copy. */
  menuItems?: MenuItemDef[]
  onClose: () => void
}

type Tag = { name: string; commit: string; annotated: boolean; message?: string; tagger?: string; taggerEmail?: string; date?: number }

/** One "next step": what it is, and the one button that does it. */
function Step({ icon, label, button, onClick, title }: {
  icon: IconName; label: React.ReactNode; button: string; onClick: () => void; title?: string
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
  const { target, branches, currentBranch, defaultBranch, tip, pr, issue, menuItems, onClose } = props
  const { t } = useLang()
  const locale = t('graph.dateLocale')
  const isTag = target.kind === 'tag', isRemote = target.kind === 'remote'
  const branch = branchOf(target, branches)
  const isCurrent = target.kind === 'head' && target.name === currentBranch
  const mergeInto = mergeTargetOf(target, defaultBranch)
  const kebabRef = useRef<HTMLButtonElement>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  // Escape closes the card — unless something of its own is open on top of it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || menu) return
      if (document.querySelector('.ctx-menu, [role="menu"], .dlg-overlay')) return
      e.preventDefault(); e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, menu])

  // ── Against the branch it merges into: how far, and would it conflict ──
  const [merge, setMerge] = useState<MergeFacts | null>(null)
  const [mergeLoading, setMergeLoading] = useState(false)
  useEffect(() => {
    setMerge(null)
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
      } catch { /* no distance to show: the card says nothing about it */ }
      finally { if (!stale) setMergeLoading(false) }
    })()
    return () => { stale = true }
  }, [target.name, target.hash, mergeInto])

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
  const verdict = merge ? mergeVerdict(merge) : null
  const n = (count: number) => count.toLocaleString('en-US')

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
    if (up.state === 'unpublished') btn('publish', t('refcard.publish'), push)
    else if (up.state === 'missing') {
      btn('delete', t('refcard.deleteLocal'), props.onDelete && !isCurrent ? () => props.onDelete!(target.name) : undefined)
      btn('publish', t('refcard.publish'), push)
    } else {
      if (up.behind > 0) btn('pull', t('refcard.pull'), isCurrent ? props.onPull : undefined)
      if (up.ahead > 0) btn('push', t(up.behind > 0 ? 'refcard.forcePush' : 'refcard.push'), up.behind > 0 ? undefined : push)
      btn('fetch', t('refcard.fetch'), props.onFetch)
    }
    return out
  }
  const upstreamStatus = !up ? '' : up.state === 'missing' ? t('refcard.up.missing')
    : up.state === 'diverged' ? t('refcard.up.diverged')
    : up.state === 'behind' ? t('refcard.up.toPull', up.behind)
    : up.state === 'ahead' ? t('refcard.up.toPush', up.ahead)
    : up.state === 'level' ? t('refcard.up.level') : ''

  const mergeStatus = !merge || !verdict ? '' : verdict === 'merged' ? t('refcard.merge.safeToDelete')
    : verdict === 'in-sync' ? (merge.ahead > 0 ? t('refcard.merge.basedWith', merge.target, merge.ahead) : t('refcard.merge.based', merge.target))
    : t('refcard.merge.behind', merge.target, merge.behind)
  const verdictChip = !merge || !verdict || verdict === 'in-sync' ? null
    : verdict === 'merged' ? { icon: 'check' as IconName, text: t('refcard.merge.merged'), title: t('refcard.merge.mergedTip', merge.target) }
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
                  <button type="button" className="refcard-pill refcard-pill--pr" disabled={!props.onOpenPR}
                    title={pr.title ? `PR #${pr.number} — ${pr.title}` : `PR #${pr.number}`}
                    onClick={() => props.onOpenPR?.(pr.number)}>
                    <Icon name="pullRequest" size={12} />#{pr.number}
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
                      <div className="refcard-card-foot">
                        {verdictChip && (
                          <span className={`refcard-verdict refcard-verdict--${verdict}`} title={verdictChip.title}>
                            <Icon name={verdictChip.icon} size={12} />{verdictChip.text}
                          </span>
                        )}
                        <span className="refcard-status">{mergeStatus}</span>
                        <span className="refcard-actions">
                          {verdict === 'merged' && props.onDelete && !isCurrent && (
                            <button type="button" className="refcard-btn" onClick={() => props.onDelete!(target.name)}>{t('refcard.deleteBranch')}</button>
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
                  <Step icon="arrowSwitch" label={t('refcard.step.switch', target.name)} button={t('refcard.switch')} onClick={() => props.onSwitch!(target.name)} />
                )}
                {isRemote && props.onSwitch && (
                  <Step icon="arrowSwitch" label={t('refcard.step.switch', target.name)} button={t('refcard.switch')} onClick={() => props.onSwitch!(target.name)} />
                )}
                {worktree && <div className="refcard-step refcard-step--fact"><Icon name="worktree" size={14} className="refcard-step-icon" /><span className="refcard-step-label">{t('refcard.inWorktree', worktree)}</span></div>}
                {!isTag && pr && props.onOpenPR && (
                  <Step icon="pullRequest" label={t('refcard.step.pr', pr.number, pr.title ?? '')} button={t('refcard.view')} onClick={() => props.onOpenPR!(pr.number)} />
                )}
                {target.kind === 'head' && !pr && up && up.state !== 'unpublished' && props.onCreatePR && mergeInto && (
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
                  <Step icon="arrowSwitch" label={t('refcard.step.checkoutTag', target.name)} button={t('refcard.switch')} onClick={() => props.onCheckoutTag!(target.name)} />
                )}
                {isTag && props.onPushTag && !(onRemote !== 'asking' && onRemote.pushed === true) && (
                  <Step icon="push" label={t('refcard.step.pushTag', target.name)} button={t('refcard.pushTag')} onClick={() => props.onPushTag!(target.name)} />
                )}
                {isTag && props.onDeleteTag && (
                  <Step icon="trash" label={t('refcard.step.deleteTag', target.name)} button={t('refcard.delete')} onClick={() => props.onDeleteTag!(target.name)} />
                )}
                {/* Never the default branch from here: one click is too close for the branch everything merges into. */}
                {target.kind === 'head' && !isCurrent && target.name !== defaultBranch && props.onDelete && verdict !== 'merged' && (
                  <Step icon="trash" label={t('refcard.step.delete', target.name)} button={t('refcard.delete')} onClick={() => props.onDelete!(target.name)} />
                )}
                {isRemote && props.onDeleteRemote && (
                  <Step icon="trash" label={t('refcard.step.deleteRemote', target.name)} button={t('refcard.delete')} onClick={() => props.onDeleteRemote!(target.name)} />
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
    </div>
  )
}
