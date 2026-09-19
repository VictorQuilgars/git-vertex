// Sidebar › remote. Reads its slice of the sidebar's state; the state itself lives in useSidebar.
import { BranchInfo } from '../../../types'
import { buildBranchTree } from '../branchTree'
import { Section } from '../Section'
import { BranchTree } from '../tree'
import { BranchItem } from '../BranchItem'
import { remoteOf } from '../../ContextMenu/branchMenu'
import type { SidebarState } from '../useSidebar'

export function RemoteSection({ s }: { s: SidebarState }) {
  const { currentBranch, onReveal, onMergeBranch, onRebaseOnto, onCompareBranch, onToggleHideRemote, tipActions, onDeleteRemoteBranch, onExplainBranch, onBranchChangelog, onGoTo, soloBranch, onToggleSolo, onToggleHide, isFavorite, onToggleFavorite, onOpenBranchOnRemote, prIntentFor, onCreatePR, onCopyBranchLink, single, branchHidden, familyMenu, toggleFolder, openFolders, showAll, remoteBranches, layoutFor, layoutToggle, handleFetchRemote } = s
  const names = remoteBranches.map(b => b.name.replace(/^remotes\//, ''))
  const asTree = layoutFor('remote', names) === 'tree'
  return (
    <Section id="remote" title="REMOTE" icon="cloud" count={remoteBranches.length} defaultOpen={single}
              menuItems={familyMenu('remotes')}
              layout={layoutToggle('remote', names)}
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
                    onReveal={onReveal && (() => onReveal(b.name))}
                    onFetch={() => handleFetchRemote(b.name.replace(/^remotes\//, '').split('/')[0])}
                    onDeleteRemote={() => onDeleteRemoteBranch(b.name)}
                    // A remote-only branch could be neither merged nor rebased
                    // onto, and had no Compare at all (#282). git takes
                    // `remotes/origin/x` as a ref like any other.
                    onMerge={() => onMergeBranch(b.name)}
                    onRebaseOnto={() => onRebaseOnto(b.name)}
                    onCompare={() => onCompareBranch(b.name)}
                    onHideRemote={onToggleHideRemote && (() => onToggleHideRemote(remoteOf(b.name)))}
                    tip={{ ref: b.name, hash: b.commit, subject: b.label }}
                    tipActions={tipActions}
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
              if (!asTree) return remoteBranches.map(b => leaf(b))
              const nodes = buildBranchTree(remoteBranches, b => b.name.replace(/^remotes\//, ''))
              return <BranchTree nodes={nodes} open={openFolders(nodes)} onToggle={toggleFolder}
                renderLeaf={(b, label) => leaf(b, label)} />
            })()}
            </Section>
  )
}
