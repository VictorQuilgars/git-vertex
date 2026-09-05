// Sidebar › prs. Reads its slice of the sidebar's state; the state itself lives in useSidebar.
import { Icon } from '../../Icon/Icon'
import GithubRow from '../../GitHubPanel/GithubRow'
import { type GithubListItem } from '../types'
import { ghMatch, GhFilterGroup, GhGroup } from '../github-items'
import { Section } from '../Section'
import type { SidebarState } from '../useSidebar'

export function PrsSection({ s }: { s: SidebarState }) {
  const { githubPRs, onOpenGithubItem, onShowGithubDetail, githubDetailOpen, githubLogin, githubRepo, onRefreshGithub, onStartPR, githubRefreshing, githubRefreshTick, githubPollTick, onRefresh, single, t, prsQuery, setPrsQuery, ghFilters, setFilterEditor, mutateFilters } = s
  if (!githubPRs) return null
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
