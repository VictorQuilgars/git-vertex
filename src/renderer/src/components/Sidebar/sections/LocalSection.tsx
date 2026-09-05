// Sidebar › local. Reads its slice of the sidebar's state; the state itself lives in useSidebar.
import { BranchInfo } from '../../../types'
import { buildBranchTree } from '../branchTree'
import { publishedNameFor } from '../../ContextMenu/branchRefs'
import { Section } from '../Section'
import { BranchTree } from '../tree'
import { BranchItem } from '../BranchItem'
import type { SidebarState } from '../useSidebar'

export function LocalSection({ s }: { s: SidebarState }) {
  const { currentBranch, branches, onCheckout, onCreateBranch, onDeleteBranch, onMergeBranch, onRenameBranch, onRebaseOnto, onPushBranch, onDeleteRemoteBranch, onSetUpstream, onExplainBranch, onBranchChangelog, onGoTo, onCompareBranch, soloBranch, onToggleSolo, onToggleHide, onPull, isFavorite, issueFor, onToggleFavorite, onOpenBranchOnRemote, onAssociateIssue, prIntentFor, onCreatePR, onCopyBranchLink, onDeleteBranchBoth, remotes, t, localBranches, branchHidden, toggleFolder, openFolders, filtering, showAll, localMenu } = s
  return (
    <Section id="local" title="LOCAL" icon="device" count={localBranches.length} onAdd={onCreateBranch} addLabel={t('sb.newBranch')}
            menuItems={localMenu()}
            hiddenCount={localBranches.filter(branchHidden).length}
            onShowAll={showAll('branches')}>
            {(() => {
              // The rows themselves are unchanged; only their arrangement is.
              const leaf = (b: BranchInfo, displayAs?: string) => (
                <BranchItem
                  displayAs={displayAs}
                  key={b.name}
                name={b.name}
                current={b.current}
                currentBranch={currentBranch}
                onCheckout={() => !b.current && onGoTo(b.name)}
                onDelete={() => onDeleteBranch(b.name)}
                onMerge={() => onMergeBranch(b.name)}
                onRename={() => onRenameBranch(b.name)}
                onCompare={!b.current ? () => onCompareBranch(b.name) : undefined}
                onRebaseOnto={!b.current ? () => onRebaseOnto(b.name) : undefined}
                onPush={() => onPushBranch(b.name)}
                onSetUpstream={() => onSetUpstream(b.name)}
                onPull={b.current ? onPull : undefined}
                soloed={soloBranch === b.name}
                hidden={branchHidden(b)}
                onToggleSolo={() => onToggleSolo(b.name)}
                onToggleHide={() => onToggleHide(b.name)}
                favorite={isFavorite?.(b.name)}
                issue={issueFor?.(b.name)}
                onToggleFavorite={onToggleFavorite && (() => onToggleFavorite(b.name))}
                onOpenOnRemote={onOpenBranchOnRemote && (() => onOpenBranchOnRemote(b.name))}
                onAssociateIssue={onAssociateIssue && (() => onAssociateIssue(b.name))}
                onExplain={onExplainBranch && (() => onExplainBranch(b.name))}
                onChangelog={onBranchChangelog && (() => onBranchChangelog(b.name))}
                pr={prIntentFor?.(b.name)}
                onCreatePR={onCreatePR}
                publishedAs={publishedNameFor(b.name, branches) ?? undefined}
                onCopyLink={onCopyBranchLink && (() => onCopyBranchLink(b.name))}
                onDeleteRemote={() => {
                  const published = publishedNameFor(b.name, branches)
                  if (published) onDeleteRemoteBranch(`remotes/${published}`)
                }}
                onDeleteBoth={onDeleteBranchBoth && (() => {
                  const published = publishedNameFor(b.name, branches)
                  if (published) onDeleteBranchBoth(b.name, published)
                })}
                ahead={b.ahead}
                behind={b.behind}
                gone={b.gone}
                      />
              )
              if (filtering) return localBranches.map(b => leaf(b))
              const nodes = buildBranchTree(localBranches, b => b.name)
              return <BranchTree nodes={nodes} open={openFolders(nodes)} onToggle={toggleFolder}
                renderLeaf={(b, label) => leaf(b, label)} />
            })()}
          </Section>
  )
}
