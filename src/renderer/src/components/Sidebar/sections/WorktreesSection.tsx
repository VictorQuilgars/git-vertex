// Sidebar › worktrees. Reads its slice of the sidebar's state; the state itself lives in useSidebar.
import { Section } from '../Section'
import { WorktreeItem } from '../rows'
import type { SidebarState } from '../useSidebar'

export function WorktreesSection({ s }: { s: SidebarState }) {
  const { onSetRepo, onReveal, onViewWip, repoPath, single, t, agentsFor, handleAddWorktree, handleRemoveWorktree, filteredWorktrees, handleWorktreeTerminal, handleWorktreeReveal, handleToggleWorktreeLock, handleCopyChangesTo } = s
  return (
    <Section id="worktrees" title="WORKTREES" icon="worktree" count={filteredWorktrees.length} defaultOpen={single}
            onAdd={handleAddWorktree} addLabel={t('sb.addWorktree')}>
            {filteredWorktrees.length === 0
              ? <div className="sb-empty">{t('sb.noWorktree')}</div>
              : filteredWorktrees.map(wt => {
                  const active = !!repoPath && wt.path === repoPath
                  return (
                    <WorktreeItem
                      key={wt.path}
                      wt={wt}
                      active={active}
                      agents={agentsFor(wt.path)}
                      onOpen={() => onSetRepo(wt.path)}
                      onRemove={() => handleRemoveWorktree(wt.path)}
                      onOpenTerminal={() => handleWorktreeTerminal(wt.path)}
                      onRevealInFileManager={() => handleWorktreeReveal(wt.path)}
                      onToggleLock={() => handleToggleWorktreeLock(wt)}
                      // Only from a worktree that has something to carry.
                      onCopyChanges={wt.dirty ? () => handleCopyChangesTo(wt) : undefined}
                      // The one on screen goes to the working changes — its own;
                      // any other goes to its HEAD, because this graph cannot
                      // show a tree it is not open on (#275).
                      onReveal={active
                        ? (onViewWip ?? (onReveal && (() => onReveal(wt.head))))
                        : (onReveal && (() => onReveal(wt.head)))}
                    />
                  )
                })
            }
          </Section>
  )
}
