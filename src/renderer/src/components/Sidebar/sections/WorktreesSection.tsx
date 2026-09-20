// Sidebar › worktrees. Reads its slice of the sidebar's state; the state itself lives in useSidebar.
import { Section } from '../Section'
import { WorktreeItem } from '../rows'
import { localBranchProps } from '../localBranchProps'
import { branchItemMenu, type BranchItemProps } from '../BranchItem'
import type { SidebarState } from '../useSidebar'

/**
 * The branch menu as a worktree row offers it (#286).
 *
 * Its "go there" block is dropped whole: the row's own entries already open
 * this worktree, and a branch checked out here cannot be given a second one —
 * `git worktree add` refuses a branch another tree holds. `checkedOutIn` stays
 * so nothing offers the switch git would refuse either.
 */
function forWorktreeRow(p: BranchItemProps): BranchItemProps {
  return { ...p, onCheckout: undefined, onOpenItsWorktree: undefined, onCreateWorktreeFor: undefined }
}

export function WorktreesSection({ s }: { s: SidebarState }) {
  const { onSetRepo, onReveal, onViewWip, repoPath, single, t, agentsFor, handleAddWorktree, handleRemoveWorktree, filteredWorktrees, handleWorktreeTerminal, handleWorktreeReveal, handleToggleWorktreeLock, handleCopyChangesTo } = s
  return (
    <Section id="worktrees" title="WORKTREES" icon="worktree" count={filteredWorktrees.length} defaultOpen={single}
            onAdd={handleAddWorktree} addLabel={t('sb.addWorktree')}>
            {filteredWorktrees.length === 0
              ? <div className="sb-empty">{t('sb.noWorktree')}</div>
              : filteredWorktrees.map(wt => {
                  // A detached worktree is on no branch — git-core names that
                  // state `(detached)`, which is not a branch and matches none.
                  const branch = wt.branch && wt.branch !== '(detached)'
                    ? s.branches.find(b => !b.remote && b.name === wt.branch)
                    : undefined
                  const active = !!repoPath && wt.path === repoPath
                  return (
                    <WorktreeItem
                      key={wt.path}
                      wt={wt}
                      // Everything the branch checked out here can do, after
                      // what the worktree itself can (#286).
                      branchMenuItems={branch ? branchItemMenu(forWorktreeRow(localBranchProps(s, branch)), t) : undefined}
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
