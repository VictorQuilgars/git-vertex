// The sidebar: the List / AI strip, the branch filter, the working-changes row, and the
// sections. Its state is useSidebar, its sections are in ./sections, its rows beside it.
import { Icon } from '../Icon/Icon'
import ContextMenu from '../ContextMenu/ContextMenu'
import { Brand } from '../BrandMark/BrandMark'
import PanelDrawer from '../PanelDrawer/PanelDrawer'
import { type SidebarProps } from './types'
import { GhFilterEditor } from './github-items'
import { Section } from './Section'
import { StashItem } from './rows'
import { useSidebar } from './useSidebar'
import { AiChangelogsSection } from './sections/AiChangelogsSection'
import { AiExplanationsSection } from './sections/AiExplanationsSection'
import { AgentsSection } from './sections/AgentsSection'
import { LocalSection } from './sections/LocalSection'
import { RemoteSection } from './sections/RemoteSection'
import { TagsSection } from './sections/TagsSection'
import { RemotesSection } from './sections/RemotesSection'
import { SubmodulesSection } from './sections/SubmodulesSection'
import { WorktreesSection } from './sections/WorktreesSection'
import { ReflogSection } from './sections/ReflogSection'
import { PrsSection } from './sections/PrsSection'
import { IssuesSection } from './sections/IssuesSection'
import './Sidebar.css'

// Kept on this module for the hosts that import them from here.
export type { SidebarView, GithubListItem } from './types'

export default function Sidebar(props: SidebarProps) {
  const s = useSidebar(props)
  const { repoPath, currentBranch, branches, recentRepos, stashes, tags, wipCount, wipSelected, onViewWip, onOpenRepo, onClone, onSetRepo, onApplyStash, onPopStash, onDropStash, onPreviewStash, onExplainStash, tab, onTab, githubPRs, githubIssues, githubRepo, view, single, showAI, show, remotes, submodules, worktrees, agents, work, t, stashMenu, setStashMenu, ghFilters, filterEditor, setFilterEditor, mutateFilters, stashScopeItems, handleRenameStash, branchFilter, setBranchFilter, stashesHidden, familyMenu, rootRef, filterDraft, setFilterDraft, showAll, remoteBranches } = s
  return (
    <div className="sidebar" ref={rootRef}>
      {/* One drawer, given which section opened it — the two vocabularies are
          a prop, not a second component (#145). */}
      {filterEditor && githubRepo && (
        <PanelDrawer anchor={rootRef} onClose={() => setFilterEditor(null)}
          {...(filterEditor.section === 'prs'
            ? { icon: 'pullRequest' as const }
            : { brand: 'github' as const })}
          closeLabel={t('common.close')}
          title={filterEditor.index >= 0
            ? t('sb.gh.filter.edit')
            : filterEditor.section === 'prs' ? t('sb.gh.filter.newPr') : t('sb.gh.filter.newIssue')}>
          <GhFilterEditor
            kind={filterEditor.section}
            t={t}
            initial={filterEditor.index >= 0
              ? ghFilters[filterEditor.section][filterEditor.index]
              : undefined}
            draft={filterEditor.index >= 0 ? undefined : filterDraft[filterEditor.section]}
            repoLabel={`${githubRepo.owner}/${githubRepo.repo}`}
            existing={ghFilters[filterEditor.section]}
            // An EMPTY draft is no draft: kept as an object it would make the
            // editor think it is editing an existing filter, and its button
            // would read Save on a form that has never been filled in.
            onDraft={f => setFilterDraft(d => ({
              ...d, [filterEditor.section]: (f.name || f.query) ? f : undefined,
            }))}
            onCancel={() => {
              setFilterDraft(d => ({ ...d, [filterEditor.section]: undefined }))
              setFilterEditor(null)
            }}
            onCreate={f => {
              const at = filterEditor.index
              mutateFilters(filterEditor.section, a => at >= 0 ? a.map((x, i) => i === at ? f : x) : [...a, f])
              setFilterDraft(d => ({ ...d, [filterEditor.section]: undefined }))
              setFilterEditor(null)
            }} />
        </PanelDrawer>
      )}
      {/* ── The two stacks (#70) ──
          The repository as a list, and what the model has written for it. A
          generated changelog was reachable only from the menu of the branch it
          belonged to, which meant remembering it existed; this is where it
          lives now. Desktop only — the panel's rail already chooses a view. */}
      {!single && repoPath && (
        <div className="sb-tabs" role="tablist">
          <button role="tab" aria-selected={!showAI}
            className={`sb-tab${!showAI ? ' sb-tab--on' : ''}`}
            onClick={() => onTab?.('list')}>
            <Icon name="list" size={12} /> {t('sb.tab.list')}
          </button>
          <button role="tab" aria-selected={showAI}
            className={`sb-tab sb-tab--ai${showAI ? ' sb-tab--on' : ''}`}
            onClick={() => onTab?.('ai')}>
            <Icon name="ai" size={12} /> {t('sb.tab.ai')}
          </button>
        </div>
      )}

      {/* ── Branch filter ── (branches view only in single mode) */}
      {repoPath && show('branches') && (
        <div className="sb-search">
          <Icon name="search" size={12} />
          <input type="text" placeholder={t('sb.filterBranches')}
            value={branchFilter} onChange={e => setBranchFilter(e.target.value)} />
          {branchFilter && <button className="sb-filter-clear" title={t('common.clearFilter')} onClick={() => setBranchFilter('')}>×</button>}
        </div>
      )}

      {/* ── Working changes: a destination, not a row that comes and goes ── */}
      {repoPath && onViewWip && !showAI && (
        <button className={`sb-wip${wipSelected ? ' sb-wip--on' : ''}`} onClick={onViewWip} aria-pressed={!!wipSelected}>
          <Icon name="pencil" size={12} />
          <span className="sb-wip-label">{t('sb.workingChanges')}</span>
          <span className="sb-wip-count">{wipCount ?? 0}</span>
        </button>
      )}

      {/* ── Sections ── */}
      {repoPath && (
        <div className="sb-sections">

          {/* ── What the model has written here (#70) ── */}
          {showAI && (
            <>
              <AiChangelogsSection s={s} />

              {/* Every reading kept for this repository: the commit panel has
                  been filling its store since v1.10 and nothing ever listed
                  it, and the branch/stash/working ones join it here. One
                  section, because "explain" is one act whatever it is aimed
                  at — and each row can be dropped. */}
              <AiExplanationsSection s={s} />
            </>
          )}

          {/* OVERVIEW "current work" card (single-view only) */}
          {view === 'overview' && (() => {
            const cur = branches.find(b => b.current)
            const ahead = cur?.ahead ?? 0
            const behind = cur?.behind ?? 0
            const hasStats = ahead > 0 || behind > 0 || work.staged > 0 || work.changed > 0
            return (
              <div className="sb-overview">
                <div className="sb-ov-label">{t('sb.currentWork')}</div>
                <div className="sb-ov-card">
                  <div className="sb-ov-branch">
                    <Icon name="branch" size={14} />
                    <span className="sb-ov-branch-name">{currentBranch}</span>
                    {agents.length > 0 && (
                      <span className="sb-ov-agents" title={t('sb.agentsActive', agents.length)}>
                        <span className="sb-agent-dot" />{agents.length}
                      </span>
                    )}
                  </div>
                  {hasStats && (
                    <div className="sb-ov-stats">
                      {ahead > 0 && <span className="sb-track-ahead" title={t('sb.branch.trackTitle', ahead, behind)}>↑{ahead}</span>}
                      {behind > 0 && <span className="sb-track-behind" title={t('sb.branch.trackTitle', ahead, behind)}>↓{behind}</span>}
                      {work.staged > 0 && <span className="sb-ov-staged" title={t('sb.staged')}>+{work.staged}</span>}
                      {work.changed > 0 && <span className="sb-ov-changed" title={t('sb.changed')}>✎{work.changed}</span>}
                    </div>
                  )}
                  {!hasStats && <div className="sb-ov-clean">{t('sb.clean')}</div>}
                </div>
              </div>
            )
          })()}

          {/* AGENTS — inside the AI view in the panel, which is where "what
              the model is doing here" belongs. The desktop's AI stack does not
              show them yet (#180). */}
          {view === 'ai' && (
            <AgentsSection s={s} />
          )}

          {/* LOCAL (also shown in the overview "current work" home) */}
          {(show('branches') || view === 'overview') && (
          <LocalSection s={s} />
          )}

          {/* REMOTE */}
          {show('branches') && remoteBranches.length > 0 && (
            <RemoteSection s={s} />
          )}

          {/* TAGS */}
          {show('tags') && (
          <TagsSection s={s} />
          )}

          {/* REMOTES */}
          {show('remotes') && (
          <RemotesSection s={s} />
          )}

          {/* SUBMODULES */}
          {show('overview') && submodules.length > 0 && (
            <SubmodulesSection s={s} />
          )}

          {/* WORKTREES */}
          {show('worktrees') && (
          <WorktreesSection s={s} />
          )}

          {/* REFLOG — recovery/history tool, kept collapsed at the bottom of
              the overview (not the point of the overview) */}
          {show('overview') && (
          <ReflogSection s={s} />
          )}

          {/* PULL REQUESTS — a section, not a view of its own: it is read
              beside the branches, and a tab would replace what is being worked
              on. Absent entirely when the host has no GitHub here. */}
          {githubPRs && show('prs') && (
            <PrsSection s={s} />
          )}

          {/* GITHUB ISSUES */}
          {githubIssues && show('issues') && (
            <IssuesSection s={s} />
          )}

          {/* STASH */}
          {show('stash') && (
          <Section
            id="stash"
            title="STASH"
            icon="stash"
            count={stashes.length}
            defaultOpen={single}
            onAdd={e => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setStashMenu({ x: r.left, y: r.bottom + 4 })
            }}
            addLabel={t('sb.stash.create')}
            menuItems={familyMenu('stashes')}
            hiddenCount={stashesHidden ? stashes.length : 0}
            onShowAll={showAll('stashes')}
          >
            {stashes.length === 0
              ? <div className="sb-empty">{t('sb.noStash')}</div>
              : stashes.map(s => (
                  <StashItem
                    key={s.index}
                    stash={s}
                    onApply={() => onApplyStash(s.index)}
                    onPop={() => onPopStash(s.index)}
                    onDrop={() => onDropStash(s.index)}
                    onPreview={onPreviewStash ? () => onPreviewStash(s.index, s.message) : undefined}
                    onExplain={onExplainStash ? () => onExplainStash(s.index, s.message) : undefined}
                    onRename={() => handleRenameStash(s.index, s.message)}
                    hidden={stashesHidden}
                  />
                ))
            }
          </Section>
          )}

        </div>
      )}

      {stashMenu && (
        <ContextMenu x={stashMenu.x} y={stashMenu.y} items={stashScopeItems}
          onClose={() => setStashMenu(null)} />
      )}

      {/* ── Empty state ── */}
      {!repoPath && (
        <div className="sb-no-repo">
          <button className="sb-open-btn" onClick={onOpenRepo}>{t('sb.openRepo')}</button>
          <button className="sb-open-btn sb-clone-btn" onClick={onClone}>
            <Brand name="github" size={13} />
            {t('sb.clone')}
          </button>
          {recentRepos.length > 0 && (
            <>
              <div className="sb-recents-title">{t('sb.recents')}</div>
              {recentRepos.map(path => (
                <button key={path} className="sb-recent-btn" onClick={() => onSetRepo(path)} title={path}>
                  <Icon name="repo" size={12} />
                  {path.split('/').pop()}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
