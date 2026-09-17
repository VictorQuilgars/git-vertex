// Sidebar › worktrees. Reads its slice of the sidebar's state; the state itself lives in useSidebar.
import { Section } from '../Section'
import { WorktreeItem } from '../rows'
import type { SidebarState } from '../useSidebar'

export function WorktreesSection({ s }: { s: SidebarState }) {
  const { onSetRepo, single, worktrees, t, agentsFor, handleAddWorktree, handleRemoveWorktree } = s
  return (
    <Section id="worktrees" title="WORKTREES" icon="worktree" count={worktrees.length} defaultOpen={single}
            onAdd={handleAddWorktree} addLabel={t('sb.addWorktree')}>
            {worktrees.length === 0
              ? <div className="sb-empty">{t('sb.noWorktree')}</div>
              : worktrees.map(wt => (
                  <WorktreeItem
                    key={wt.path}
                    wt={wt}
                    agents={agentsFor(wt.path)}
                    onOpen={() => onSetRepo(wt.path)}
                    onRemove={() => handleRemoveWorktree(wt.path)}
                  />
                ))
            }
          </Section>
  )
}
