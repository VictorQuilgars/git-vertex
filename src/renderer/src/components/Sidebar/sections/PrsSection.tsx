// Sidebar › prs. Reads its slice of the sidebar's state; the state itself lives in useSidebar.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../Icon/Icon'
import ContextMenu, { type MenuItemDef } from '../../ContextMenu/ContextMenu'
import GithubRow from '../../GitHubPanel/GithubRow'
import { type GithubListItem } from '../types'
import { ghMatch, GhFilterGroup, GhGroup } from '../github-items'
import { Section } from '../Section'
import type { SidebarState } from '../useSidebar'
import { PR_GROUPS, groupPRs, pruneSnoozes, readMarks, writeMarks, type PRGroupKey, type Snooze } from '../pr-attention'
import { usePRAttention } from '../usePRAttention'

/** How the view groups: by whose it is, or by what it needs (#257). Remembered. */
const GROUP_BY_KEY = 'gv-prs-group-by'
/** The overview's "Waiting on you" lines ask for a group by this event, and leave it here for a view not mounted yet. */
export const PRS_NEED_EVENT = 'gv:prs-need'
const PRS_NEED_KEY = 'gv-prs-open-need'
export function askForPRGroup(group: PRGroupKey): void {
  try { localStorage.setItem(GROUP_BY_KEY, 'need'); localStorage.setItem(PRS_NEED_KEY, group) } catch { /* the event still says it */ }
  window.dispatchEvent(new CustomEvent(PRS_NEED_EVENT, { detail: group }))
}

export function PrsSection({ s }: { s: SidebarState }) {
  const { githubPRs, onOpenGithubItem, onShowGithubDetail, githubDetailOpen, githubLogin, githubRepo, onRefreshGithub, onStartPR, githubRefreshing, githubRefreshTick, githubPollTick, single, t, prsQuery, setPrsQuery, ghFilters, setFilterEditor, mutateFilters, currentBranch } = s
  const repoKey = githubRepo ? `${githubRepo.owner}/${githubRepo.repo}` : null
  const [groupBy, setGroupBy] = useState<'account' | 'need'>(() => {
    try { return localStorage.getItem(GROUP_BY_KEY) === 'need' ? 'need' : 'account' } catch { return 'account' }
  })
  const chooseGroupBy = (mode: 'account' | 'need') => {
    setGroupBy(mode)
    try { localStorage.setItem(GROUP_BY_KEY, mode) } catch { /* not remembered, still applied */ }
  }
  // The group a "Waiting on you" line asked for: opened, the others left as they were.
  const [asked, setAsked] = useState<PRGroupKey | null>(() => {
    try { const g = localStorage.getItem(PRS_NEED_KEY); localStorage.removeItem(PRS_NEED_KEY); return g as PRGroupKey | null } catch { return null }
  })
  useEffect(() => {
    const on = (e: Event) => { setGroupBy('need'); setAsked((e as CustomEvent<PRGroupKey>).detail); try { localStorage.removeItem(PRS_NEED_KEY) } catch { /* nothing to clear */ } }
    window.addEventListener(PRS_NEED_EVENT, on)
    return () => window.removeEventListener(PRS_NEED_EVENT, on)
  }, [])
  // Pins and snoozes: this machine's, per repository.
  const [marks, setMarks] = useState(() => readMarks(repoKey))
  useEffect(() => { setMarks(readMarks(repoKey)) }, [repoKey])
  const saveMarks = useCallback((next: { pinned: number[]; snoozed: Record<number, Snooze> }) => {
    setMarks(next); writeMarks(repoKey, next)
  }, [repoKey])
  // A snooze that has woken — its day came, or the request moved — is dropped.
  useEffect(() => {
    if (!githubPRs) return
    const kept = pruneSnoozes(marks.snoozed, githubPRs)
    if (Object.keys(kept).length !== Object.keys(marks.snoozed).length) saveMarks({ ...marks, snoozed: kept })
  }, [githubPRs, marks, saveMarks])
  const { facts } = usePRAttention(githubRepo, groupBy === 'need' && !!githubPRs, githubRefreshTick?.prs)
  const needGroups = useMemo(() => groupBy === 'need' && githubPRs ? groupPRs(githubPRs, {
    login: githubLogin ?? null, currentBranch: currentBranch ?? '', facts,
    pinned: new Set(marks.pinned), snoozed: marks.snoozed,
  }) : [], [groupBy, githubPRs, githubLogin, currentBranch, facts, marks])
  const [snoozeMenu, setSnoozeMenu] = useState<{ x: number; y: number; pr: GithubListItem } | null>(null)
  const snoozeAnchor = useRef<Element | null>(null)
  if (!githubPRs) return null
  const togglePin = (n: number) => saveMarks({ ...marks, pinned: marks.pinned.includes(n) ? marks.pinned.filter(x => x !== n) : [...marks.pinned, n] })
  const snooze = (pr: GithubListItem, how: Snooze | null) => {
    const snoozed = { ...marks.snoozed }
    if (how) snoozed[pr.number] = how; else delete snoozed[pr.number]
    saveMarks({ ...marks, snoozed })
  }
  const inDays = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(8, 0, 0, 0); return d.toISOString() }
  const snoozeItems = (pr: GithubListItem): MenuItemDef[] => marks.snoozed[pr.number]
    ? [{ label: t('sb.gh.need.wake'), action: () => snooze(pr, null) }]
    : [
        { label: t('sb.gh.need.snoozeTomorrow'), action: () => snooze(pr, { until: inDays(1) }) },
        { label: t('sb.gh.need.snoozeWeek'), action: () => snooze(pr, { until: inDays(7) }) },
        { label: t('sb.gh.need.snoozeUpdate'), action: () => snooze(pr, { updatedAt: pr.updatedAt ?? '' }) },
      ]
  return (
    <Section id="prs" title="PULL REQUESTS" icon="pullRequest" count={githubPRs.length} defaultOpen={single}
              onAdd={onStartPR && (() => onStartPR())} addLabel={t('sb.gh.newPr')}
              onRefresh={onRefreshGithub && (() => onRefreshGithub('prs'))}
              refreshing={githubRefreshing === 'prs'}
              onFold={() => setPrsQuery('')}>
              <div className="sb-gh-search">
                <Icon name="search" size={11} />
                <input type="text" placeholder={t('sb.gh.searchPrs')} value={prsQuery}
                  onChange={e => setPrsQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setPrsQuery('') } }} />
                {/* The filter editor opens from HERE, not the header: it is an
                    action on the list, and the list is what folds (#144). */}
                {/* Opens it. Closing is the drawer's own control's job — a
                    button that toggles would shut it from behind whatever the
                    drawer is covering (#145 follow-up). */}
                <button className="sb-gh-filter-btn" title={t('sb.gh.filter.new')}
                  onClick={() => setFilterEditor({ section: 'prs', index: -1 })}>
                  <Icon name="sliders" size={12} />
                </button>
              </div>
              {/* Whose it is, or what it needs: two readings of the same list. */}
              <div className="sb-gh-groupby" role="group" aria-label={t('sb.gh.groupBy')}>
                <button type="button" className={`sb-gh-groupby-btn${groupBy === 'account' ? ' sb-gh-groupby-btn--on' : ''}`}
                  aria-pressed={groupBy === 'account'} onClick={() => chooseGroupBy('account')}>{t('sb.gh.groupBy.account')}</button>
                <button type="button" className={`sb-gh-groupby-btn${groupBy === 'need' ? ' sb-gh-groupby-btn--on' : ''}`}
                  aria-pressed={groupBy === 'need'} onClick={() => chooseGroupBy('need')}>{t('sb.gh.groupBy.need')}</button>
              </div>
              {(() => {
                const prRow = (pr: GithubListItem) => (
                  <GithubRow key={pr.number} item={{ ...pr, kind: 'pr' }}
                    hoverCard={!githubDetailOpen}
                    onOpen={url => onOpenGithubItem?.(url)}
                    onDetail={onShowGithubDetail ? () => onShowGithubDetail(pr, 'pr') : undefined} />
                )
                // The account groups exist only with an identity: with nobody
                // signed in they have nothing to say, and three empty rows
                // would read as "no pull requests".
                const accountGroups = githubLogin ? [
                  { key: 'mine', title: t('sb.gh.group.mine'), rows: githubPRs.filter(pr => pr.author === githubLogin) },
                  { key: 'assigned', title: t('sb.gh.group.assigned'), rows: githubPRs.filter(pr => pr.assignees?.includes(githubLogin)) },
                  { key: 'review', title: t('sb.gh.group.review'), rows: githubPRs.filter(pr => pr.reviewers?.includes(githubLogin)) },
                ] : []
                // Pin and snooze ride beside the row, which keeps its own actions.
                const needRow = (pr: GithubListItem) => {
                  const pinned = marks.pinned.includes(pr.number), asleep = !!marks.snoozed[pr.number]
                  return (
                    <div key={pr.number} className="sb-gh-need-row">
                      {prRow(pr)}
                      <span className="sb-gh-marks">
                        <button type="button" className={`sb-gh-mark${pinned ? ' sb-gh-mark--on' : ''}`} aria-pressed={pinned}
                          title={t(pinned ? 'sb.gh.need.unpin' : 'sb.gh.need.pin')} aria-label={t(pinned ? 'sb.gh.need.unpin' : 'sb.gh.need.pin')}
                          onClick={() => togglePin(pr.number)}><Icon name="link" size={11} /></button>
                        <button type="button" className={`sb-gh-mark${asleep ? ' sb-gh-mark--on' : ''}`} aria-pressed={asleep}
                          title={t(asleep ? 'sb.gh.need.wake' : 'sb.gh.need.snooze')} aria-label={t(asleep ? 'sb.gh.need.wake' : 'sb.gh.need.snooze')}
                          onClick={e => {
                            if (asleep) { snooze(pr, null); return }
                            const r = e.currentTarget.getBoundingClientRect()
                            snoozeAnchor.current = e.currentTarget
                            setSnoozeMenu({ x: r.left, y: r.bottom + 2, pr })
                          }}><Icon name="bell" size={11} /></button>
                      </span>
                    </div>
                  )
                }
                if (groupBy === 'need') {
                  return (
                    <>
                      {needGroups.filter(g => g.rows.length > 0 || g.key === asked).map(g => (
                        // Keyed by what was asked for, so a line of the overview opens its group.
                        <GhGroup key={`${g.key}:${asked === g.key}`} title={t(PR_GROUPS.find(x => x.key === g.key)!.label as Parameters<typeof t>[0])}
                          count={g.rows.length} defaultOpen={asked ? asked === g.key : g.key === 'current' || g.key === 'pinned'}>
                          {g.rows.filter(pr => ghMatch(pr, prsQuery)).map(needRow)}
                        </GhGroup>
                      ))}
                      {needGroups.every(g => g.rows.length === 0) && <div className="sb-empty">{t('sb.gh.need.none')}</div>}
                      {snoozeMenu && (
                        <ContextMenu x={snoozeMenu.x} y={snoozeMenu.y} items={snoozeItems(snoozeMenu.pr)}
                          anchor={snoozeAnchor.current} onClose={() => setSnoozeMenu(null)} />
                      )}
                    </>
                  )
                }
                // The lens narrows the rows; the counts keep counting
                // everything — the same rule as every filter in the app.
                return (
                  <>
                    {accountGroups.map(g => (
                      <GhGroup key={g.key} title={g.title} count={g.rows.length}>
                        {g.rows.filter(pr => ghMatch(pr, prsQuery)).map(prRow)}
                      </GhGroup>
                    ))}
                    <GhGroup title={t('sb.gh.group.allPrs')} count={githubPRs.length}>
                      {githubPRs.filter(pr => ghMatch(pr, prsQuery)).map(prRow)}
                    </GhGroup>
                    {githubRepo && ghFilters.prs.map((f, fi) => (
                      <GhFilterGroup key={`${f.name}:${f.query}`} filter={f} kind="prs"
                        repo={githubRepo} refreshOn={githubPRs}
                        refreshTick={githubRefreshTick?.prs} pollTick={githubPollTick} t={t}
                        onOpen={url => onOpenGithubItem?.(url)}
                        renderItem={(item, k) => (
                          <GithubRow key={`${k}-${item.number}`} item={{ ...item, kind: k }}
                            hoverCard={!githubDetailOpen}
                            onOpen={url => onOpenGithubItem?.(url)}
                            onDetail={onShowGithubDetail ? () => onShowGithubDetail(item, k) : undefined} />
                        )}
                        onEdit={() => setFilterEditor({ section: 'prs', index: fi })}
                        onDelete={() => mutateFilters('prs', a => a.filter((_, i) => i !== fi))} />
                    ))}
                  </>
                )
              })()}
            </Section>
  )
}
