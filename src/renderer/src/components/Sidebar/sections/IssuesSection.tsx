// Sidebar › issues. Reads its slice of the sidebar's state; the state itself lives in useSidebar.
import { Icon } from '../../Icon/Icon'
import GithubRow from '../../GitHubPanel/GithubRow'
import { ghMatch, GhFilterGroup, GhGroup } from '../github-items'
import { Section } from '../Section'
import type { SidebarState } from '../useSidebar'

export function IssuesSection({ s }: { s: SidebarState }) {
  const { githubIssues, onOpenGithubItem, onStartBranchFromIssue, onShowGithubDetail, githubDetailOpen, githubRepo, onRefreshGithub, onNewIssue, githubRefreshing, single, t, issuesQuery, setIssuesQuery, ghFilters, setFilterEditor, mutateFilters } = s
  if (!githubIssues) return null
  return (
    <Section id="issues" title="GITHUB ISSUES" brand="github" count={githubIssues.length} defaultOpen={single}
              onAdd={onNewIssue && (() => onNewIssue())} addLabel={t('sb.gh.newIssue')}
              onRefresh={onRefreshGithub && (() => onRefreshGithub('issues'))}
              refreshing={githubRefreshing === 'issues'}
              onFold={() => setIssuesQuery('')}>
              <div className="sb-gh-search">
                <Icon name="search" size={11} />
                <input type="text" placeholder={t('sb.gh.searchIssues')} value={issuesQuery}
                  onChange={e => setIssuesQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setIssuesQuery('') } }} />
                {/* The filter editor opens from HERE, not the header: it is an
                    action on the list, and the list is what folds (#144). */}
                <button className="sb-gh-filter-btn" title={t('sb.gh.filter.new')}
                  onClick={() => setFilterEditor({ section: 'issues', index: -1 })}>
                  <Icon name="sliders" size={12} />
                </button>
              </div>
              <GhGroup title={t('sb.gh.group.allIssues')} count={githubIssues.length}>
                {githubIssues.filter(issue => ghMatch(issue, issuesQuery)).map(issue => (
                  <GithubRow key={issue.number} item={{ ...issue, kind: 'issue' }}
                    hoverCard={!githubDetailOpen}
                    onOpen={url => onOpenGithubItem?.(url)}
                    onDetail={onShowGithubDetail ? () => onShowGithubDetail(issue, 'issue') : undefined}
                    onCreateBranch={onStartBranchFromIssue
                      ? () => onStartBranchFromIssue({ number: issue.number, title: issue.title, url: issue.url })
                      : undefined} />
                ))}
              </GhGroup>
              {githubRepo && ghFilters.issues.map((f, fi) => (
                <GhFilterGroup key={`${f.name}:${f.query}`} filter={f} kind="issues"
                  repo={githubRepo} refreshOn={githubIssues} t={t}
                  onOpen={url => onOpenGithubItem?.(url)}
                  renderItem={(item, k) => (
                    <GithubRow key={`${k}-${item.number}`} item={{ ...item, kind: k }}
                      hoverCard={!githubDetailOpen}
                      onOpen={url => onOpenGithubItem?.(url)}
                      onDetail={onShowGithubDetail ? () => onShowGithubDetail(item, k) : undefined}
                      onCreateBranch={k === 'issue' && onStartBranchFromIssue
                        ? () => onStartBranchFromIssue({ number: item.number, title: item.title, url: item.url })
                        : undefined} />
                  )}
                  onEdit={() => setFilterEditor({ section: 'issues', index: fi })}
                  onDelete={() => mutateFilters('issues', a => a.filter((_, i) => i !== fi))} />
              ))}
            </Section>
  )
}
