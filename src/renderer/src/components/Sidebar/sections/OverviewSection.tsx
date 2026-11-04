// Sidebar › overview: where am I, and what is next. The card of the current
// branch — its tracking, its working tree, its pull request or the door to
// one, where it stands against the branch it will merge into, and the ONE
// state action that is true (publish / pull / push); then the branches worked
// on recently, by the date of their tip; then what is waiting on the user
// across the repository's pull requests; then what to start. Reads its slice
// of the sidebar's state; the state itself lives in useSidebar.
import { useState, type MouseEvent } from 'react'
import { Icon } from '../../Icon/Icon'
import ContextMenu, { type MenuItemDef } from '../../ContextMenu/ContextMenu'
import { localBranchProps } from '../localBranchProps'
import { branchItemMenu } from '../BranchItem'
import { askForPRGroup } from './PrsSection'
import { nextSteps } from '../../RightPanel/WorkingChangesEmpty'
import type { SidebarState } from '../useSidebar'
import type { BranchInfo } from '../../../types'
import type { WorktreeEntry } from '../types'

const RECENT_KEY = 'gv-sb-recent-days'
const THRESHOLDS: { days: number; key: 'sb.recent.day' | 'sb.recent.week' | 'sb.recent.month' }[] = [
  { days: 1, key: 'sb.recent.day' }, { days: 7, key: 'sb.recent.week' }, { days: 30, key: 'sb.recent.month' },
]

/** "3 days ago", in the panel's locale — the tip's date, seen from now. */
export function agoLabel(unixSeconds: number, locale: string, now = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const sec = Math.round(unixSeconds - now / 1000)
  const abs = Math.abs(sec)
  if (abs < 3600) return rtf.format(Math.round(sec / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(sec / 3600), 'hour')
  if (abs < 30 * 86400) return rtf.format(Math.round(sec / 86400), 'day')
  if (abs < 365 * 86400) return rtf.format(Math.round(sec / (30 * 86400)), 'month')
  return rtf.format(Math.round(sec / (365 * 86400)), 'year')
}

/**
 * How far back RECENT reaches, a page at a time (#279). The first three are
 * the timeframes the menu offers; *Show older* walks on past them — a
 * quarter, a year, then everything — instead of stopping at a month.
 */
export const RECENT_PAGES = [1, 7, 30, 90, 365, Infinity] as const

/**
 * The next page that would show MORE, or null when nothing older exists.
 * A page that adds no branch is skipped: *Show older* that changes nothing
 * would read as broken.
 */
export function nextRecentPage(branches: BranchInfo[], days: number, now = Date.now()): number | null {
  const shown = recentBranches(branches, days, now).length
  for (const page of RECENT_PAGES) {
    if (page <= days) continue
    if (recentBranches(branches, page, now).length > shown) return page
  }
  return null
}

/**
 * The branches checked out in the OTHER worktrees, one card each (#279) — the
 * work in progress the Overview did not show, since it only had a card for
 * the branch on screen. A detached worktree is on no branch, and a prunable
 * one is gone from disk; neither has a card.
 */
export function worktreeCards(worktrees: readonly WorktreeEntry[], currentBranch: string): WorktreeEntry[] {
  return worktrees.filter(w => !w.prunable && w.branch && w.branch !== '(detached)' && w.branch !== currentBranch)
}

/** The local branches worked on within `days`, newest tip first, the current one aside. */
export function recentBranches(branches: BranchInfo[], days: number, now = Date.now()): BranchInfo[] {
  const floor = days === Infinity ? -Infinity : now / 1000 - days * 86400
  return branches
    .filter(b => !b.remote && !b.current && !b.detached && (b.date ?? 0) >= floor)
    .sort((a, b) => (b.date ?? 0) - (a.date ?? 0))
}

export function OverviewSection({ s }: { s: SidebarState }) {
  const {
    branches, currentBranch, agents, work, t, home, mergeTarget, launchpad, githubPRs, worktrees,
    onSelectCommit, onCheckout, onCreatePR, prIntentFor, issueFor, onSetRepo,
  } = s
  // Right-click on a card: the branch's own menu, the one its row in
  // Branches opens (#279).
  const [cardMenu, setCardMenu] = useState<{ x: number; y: number; items: MenuItemDef[] } | null>(null)
  const openCardMenu = (e: MouseEvent, name: string) => {
    const b = branches.find(x => !x.remote && x.name === name)
    if (!b) return
    e.preventDefault()
    setCardMenu({ x: e.clientX, y: e.clientY, items: branchItemMenu(localBranchProps(s, b), t) })
  }
  const [days, setDays] = useState<number>(() => {
    const saved = Number(localStorage.getItem(RECENT_KEY))
    return THRESHOLDS.some(x => x.days === saved) ? saved : 7
  })
  const [thresholdMenu, setThresholdMenu] = useState(false)
  const chooseDays = (d: number) => { setDays(d); setThresholdMenu(false); try { localStorage.setItem(RECENT_KEY, String(d)) } catch { /* private window */ } }
  const locale = t('graph.dateLocale')

  const cur = branches.find(b => b.current)
  const ahead = cur?.ahead ?? 0
  const behind = cur?.behind ?? 0
  const hasStats = ahead > 0 || behind > 0 || work.staged > 0 || work.changed > 0
  const pr = githubPRs?.find(p => p.headRef === currentBranch) ?? null
  const issue = issueFor?.(currentBranch) ?? null
  const intent = !pr && onCreatePR ? prIntentFor?.(currentBranch) ?? null : null
  // The one state action that is true — publish, then pull, then push — plus
  // the review; the pure rule the staging pane's empty state already runs.
  const steps = home ? nextSteps(home.state, home.actions, t).filter(x => x.key !== 'recompose') : []
  const starts = home ? [
    { key: 'issue', label: t('wc.startFromIssue'), icon: 'issue' as const, onClick: home.actions.onStartFromIssue },
    { key: 'branch', label: t('wc.createBranch'), icon: 'newBranch' as const, onClick: home.actions.onCreateBranch },
    { key: 'worktree', label: t('wc.createWorktree'), icon: 'worktree' as const, onClick: home.actions.onCreateWorktree },
    { key: 'stash', label: t('wc.applyStash'), icon: 'stash' as const, onClick: home.actions.onApplyStash },
    { key: 'switch', label: t('wc.switchBranch'), icon: 'branch' as const, onClick: home.actions.onSwitchBranch },
  ].filter(a => a.onClick) : []

  const recent = recentBranches(branches, days)
  const older = nextRecentPage(branches, days)
  const elsewhere = worktreeCards(worktrees, currentBranch)
  const pageLabel = (d: number) => {
    const preset = THRESHOLDS.find(x => x.days === d)
    if (preset) return t(preset.key)
    return d === Infinity ? t('sb.recent.all') : d >= 365 ? t('sb.recent.year') : t('sb.recent.quarter')
  }
  const worktreeOf = (name: string) => worktrees.find(w => w.branch === name)
  const waiting = launchpad ? launchpad.needsReview + launchpad.changesRequested + launchpad.approved : 0

  return (
    <div className="sb-overview">
      <div className="sb-ov-label">{t('sb.currentWork')}</div>
      <div className="sb-ov-card" onContextMenu={e => openCardMenu(e, currentBranch)}>
        <div className="sb-ov-branch">
          <Icon name="branch" size={14} />
          <span className="sb-ov-branch-name" title={currentBranch}>{currentBranch}</span>
          {agents.length > 0 && (
            <span className="sb-ov-agents" title={t('sb.agentsActive', agents.length)}>
              <span className="sb-agent-dot" />{agents.length}
            </span>
          )}
        </div>
        {(hasStats || issue) && (
          <div className="sb-ov-stats">
            {ahead > 0 && <span className="sb-track-ahead" title={t('sb.branch.trackTitle', ahead, behind)}>↑{ahead}</span>}
            {behind > 0 && <span className="sb-track-behind" title={t('sb.branch.trackTitle', ahead, behind)}>↓{behind}</span>}
            {work.staged > 0 && <span className="sb-ov-staged" title={t('sb.staged')}>+{work.staged}</span>}
            {work.changed > 0 && <span className="sb-ov-changed" title={t('sb.changed')}>✎{work.changed}</span>}
            {issue && <span className="sb-ov-issue" title={issue.key}><Icon name="issue" size={11} />{issue.key}</span>}
          </div>
        )}
        {!hasStats && !issue && <div className="sb-ov-clean">{t('sb.clean')}</div>}
        {mergeTarget && (
          <div className={`sb-ov-target${mergeTarget.behind > 0 ? ' sb-ov-target--behind' : ''}`}
            title={t('sb.mergeTarget.title', mergeTarget.name)}>
            <Icon name="merge" size={11} />
            <span>
              {mergeTarget.behind > 0
                ? t('sb.mergeTarget.behind', mergeTarget.behind, mergeTarget.name)
                : t('sb.mergeTarget.upToDate', mergeTarget.name)}
              {mergeTarget.ahead > 0 && ` · ${t('sb.mergeTarget.ahead', mergeTarget.ahead)}`}
            </span>
          </div>
        )}
        {(pr || intent) && (
          <div className="sb-ov-pr">
            <Icon name="pullRequest" size={12} />
            {pr ? (
              <button className="sb-ov-pr-link" title={pr.title} onClick={home?.actions.onShowPRs}>
                #{pr.number} {pr.title}
              </button>
            ) : (
              <button className="sb-ov-pr-link" onClick={() => onCreatePR!(intent!)}>{t('sb.ov.createPR')}</button>
            )}
          </div>
        )}
        {steps.length > 0 && (
          <div className="sb-ov-actions">
            {steps.map(step => (
              <button key={step.key} className={`sb-ov-action${step.key === 'review' ? ' sb-ov-action--quiet' : ''}`}
                title={step.label} onClick={step.onClick}>
                <Icon name={step.icon as never} size={12} />{step.button}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ELSEWHERE — the branches checked out in the other worktrees (#279) */}
      {elsewhere.length > 0 && (
        <>
          <div className="sb-ov-head"><span className="sb-ov-label">{t('sb.ov.elsewhere')} ({elsewhere.length})</span></div>
          {elsewhere.map(w => {
            const b = branches.find(x => !x.remote && x.name === w.branch)
            const wpr = githubPRs?.find(p => p.headRef === w.branch)
            const folder = w.path.split(/[\\/]/).filter(Boolean).pop() ?? w.path
            const preview = [w.path, w.dirty ? t('sb.ov.cardDirty') : t('sb.clean'), wpr ? `#${wpr.number} ${wpr.title}` : null].filter(Boolean).join('\n')
            return (
              <div key={w.path} className="sb-ov-card sb-ov-card--elsewhere" role="button" tabIndex={0}
                title={`${preview}\n${t('sb.ov.cardHint')}`}
                onClick={() => b && onSelectCommit(b.commit)}
                onDoubleClick={() => onSetRepo(w.path)}
                onKeyDown={e => { if (e.key === 'Enter') onSetRepo(w.path) }}
                onContextMenu={e => openCardMenu(e, w.branch)}>
                <div className="sb-ov-branch">
                  <Icon name="worktree" size={14} />
                  <span className="sb-ov-branch-name">{w.branch}</span>
                  <span className="sb-ov-card-folder">{folder}</span>
                </div>
                <div className="sb-ov-stats">
                  {(w.ahead ?? 0) > 0 && <span className="sb-track-ahead">↑{w.ahead}</span>}
                  {(w.behind ?? 0) > 0 && <span className="sb-track-behind">↓{w.behind}</span>}
                  {w.dirty ? <span className="sb-ov-changed" title={t('sb.ov.cardDirty')}>✎</span> : <span className="sb-ov-clean">{t('sb.clean')}</span>}
                  {w.locked && <span className="sb-wt-flag" title={w.lockReason ? t('sb.wt.lockedWhy', w.lockReason) : t('sb.wt.lockedFlag')}>🔒</span>}
                  {wpr && <span className="sb-ov-recent-pr" title={wpr.title}><Icon name="pullRequest" size={11} />#{wpr.number}</span>}
                </div>
              </div>
            )
          })}
        </>
      )}

      {/* RECENT — the branches whose tip moved within the threshold */}
      <div className="sb-ov-head">
        <span className="sb-ov-label">{t('sb.recent')}{recent.length > 0 ? ` (${recent.length})` : ''}</span>
        <div className="sb-ov-threshold">
          <button className="sb-ov-threshold-btn" title={t('sb.recent.change')} aria-haspopup="menu" aria-expanded={thresholdMenu}
            onClick={() => setThresholdMenu(v => !v)}>
            {pageLabel(days)}<Icon name="chevronDown" size={8} />
          </button>
          {thresholdMenu && (
            <div className="sb-ov-threshold-menu" role="menu">
              {THRESHOLDS.map(x => (
                <button key={x.days} role="menuitemradio" aria-checked={x.days === days} className="sb-ov-threshold-item" onClick={() => chooseDays(x.days)}>
                  {t(x.key)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {recent.length === 0
        ? <div className="sb-empty">{t('sb.recent.empty')}</div>
        : recent.map(b => {
            const bpr = githubPRs?.find(p => p.headRef === b.name)
            const wt = worktreeOf(b.name)
            return (
              <div key={b.name} className="sb-ov-recent" role="button" tabIndex={0}
                title={t('sb.recent.rowTitle', b.name)}
                onClick={() => onSelectCommit(b.commit)}
                onDoubleClick={() => onCheckout(b.name)}
                onKeyDown={e => { if (e.key === 'Enter') onSelectCommit(b.commit) }}>
                <Icon name={wt ? 'worktree' : 'branch'} size={12} />
                <span className="sb-ov-recent-name">{b.name}</span>
                {b.date && <span className="sb-ov-recent-when">{agoLabel(b.date, locale)}</span>}
                {(b.ahead ?? 0) > 0 && <span className="sb-track-ahead">↑{b.ahead}</span>}
                {(b.behind ?? 0) > 0 && <span className="sb-track-behind">↓{b.behind}</span>}
                {b.gone && <span className="sb-track-gone" title={t('sb.branch.goneTitle')}>✂</span>}
                {bpr && <span className="sb-ov-recent-pr" title={bpr.title}><Icon name="pullRequest" size={11} />#{bpr.number}</span>}
              </div>
            )
          })
      }
      {/* A page further back at a time, for as long as there is older work —
          not only when the list is empty, and not only as far as a month. */}
      {older !== null && (
        <button className="sb-ov-older" onClick={() => { setDays(older); setThresholdMenu(false) }}>{t('sb.recent.older')}</button>
      )}

      {/* LAUNCHPAD — what waits on the user, across the repository's pull requests */}
      {launchpad && (
        <>
          <div className="sb-ov-head"><span className="sb-ov-label">{t('sb.launchpad')}</span></div>
          {waiting === 0
            ? <div className="sb-empty">{t('sb.lp.caughtUp')}</div>
            : (
              <div className="sb-ov-lp">
                {launchpad.needsReview > 0 && (
                  <button className="sb-ov-lp-row sb-ov-lp-row--review" onClick={() => { askForPRGroup('needs-review'); home?.actions.onShowPRs?.() }}>
                    <Icon name="comment" size={12} />{t('sb.lp.needsReview', launchpad.needsReview)}
                  </button>
                )}
                {launchpad.changesRequested > 0 && (
                  <button className="sb-ov-lp-row sb-ov-lp-row--changes" onClick={() => { askForPRGroup('changes-requested'); home?.actions.onShowPRs?.() }}>
                    <Icon name="pencil" size={12} />{t('sb.lp.changesRequested', launchpad.changesRequested)}
                  </button>
                )}
                {launchpad.approved > 0 && (
                  <button className="sb-ov-lp-row sb-ov-lp-row--ready" onClick={() => { askForPRGroup('ready'); home?.actions.onShowPRs?.() }}>
                    <Icon name="rocket" size={12} />{t('sb.lp.approved', launchpad.approved)}
                  </button>
                )}
              </div>
            )}
        </>
      )}

      {/* START — what to begin */}
      {starts.length > 0 && (
        <>
          <div className="sb-ov-head"><span className="sb-ov-label">{t('wc.startNew')}</span></div>
          <div className="sb-ov-starts">
            {starts.map(a => (
              <button key={a.key} className="sb-ov-start" onClick={a.onClick}>
                <Icon name={a.icon} size={12} />{a.label}
              </button>
            ))}
          </div>
        </>
      )}
      {cardMenu && <ContextMenu x={cardMenu.x} y={cardMenu.y} items={cardMenu.items} onClose={() => setCardMenu(null)} />}
    </div>
  )
}
