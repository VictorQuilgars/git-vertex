// Sidebar › remote. Reads its slice of the sidebar's state; the state itself lives in useSidebar.
import { BranchInfo } from '../../../types'
import { buildBranchTree } from '../branchTree'
import { Section } from '../Section'
import { BranchTree } from '../tree'
import { BranchItem } from '../BranchItem'
import type { SidebarState } from '../useSidebar'

export function RemoteSection({ s }: { s: SidebarState }) {
  const { currentBranch, onDeleteRemoteBranch, onExplainBranch, onBranchChangelog, onGoTo, soloBranch, onToggleSolo, onToggleHide, isFavorite, onToggleFavorite, onOpenBranchOnRemote, prIntentFor, onCreatePR, onCopyBranchLink, single, branchHidden, familyMenu, toggleFolder, openFolders, filtering, showAll, remoteBranches } = s
  return (
    <Section id="remote" title="REMOTE" icon="cloud" count={remoteBranches.length} defaultOpen={single}
              menuItems={familyMenu('remotes')}
              hiddenCount={remoteBranches.filter(branchHidden).length}
              onShowAll={showAll('remotes')}>
              {(() => {
              // `remotes/origin/fix/x` minus the `remotes/` prefix is
              // `origin/fix/x` — so the remote becomes the first folder for
              // free, and position now tells two `main`s apart. That is what
              // `showRemotePrefix` was for, and why it is gone.
              const leaf = (b: BranchInfo, displayAs?: string) => (
                <BranchItem
                    displayAs={displayAs}
                    key={b.name}
                    name={b.name}
                    current={false}
                    remote={true}
                    currentBranch={currentBranch}
                    onCheckout={() => onGoTo(b.name)}
                    onDeleteRemote={() => onDeleteRemoteBranch(b.name)}
                    soloed={soloBranch === b.name}
                    hidden={branchHidden(b)}
                    onToggleSolo={() => onToggleSolo(b.name)}
                    onToggleHide={() => onToggleHide(b.name)}
                    favorite={isFavorite?.(b.name)}
                    onToggleFavorite={onToggleFavorite && (() => onToggleFavorite(b.name))}
                    onOpenOnRemote={onOpenBranchOnRemote && (() => onOpenBranchOnRemote(b.name))}
                    onExplain={onExplainBranch && (() => onExplainBranch(b.name))}
                    onChangelog={onBranchChangelog && (() => onBranchChangelog(b.name))}
                    pr={prIntentFor?.(b.name)}
                    onCreatePR={onCreatePR}
                    publishedAs={b.name.replace(/^remotes\//, '')}
                    onCopyLink={onCopyBranchLink && (() => onCopyBranchLink(b.name))}
                  />
              )
              if (filtering) return remoteBranches.map(b => leaf(b))
              const nodes = buildBranchTree(remoteBranches, b => b.name.replace(/^remotes\//, ''))
              return <BranchTree nodes={nodes} open={openFolders(nodes)} onToggle={toggleFolder}
                renderLeaf={(b, label) => leaf(b, label)} />
            })()}
            </Section>
  )
}
