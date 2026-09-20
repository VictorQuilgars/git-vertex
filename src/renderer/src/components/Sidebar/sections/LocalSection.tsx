// Sidebar › local. Reads its slice of the sidebar's state; the state itself lives in useSidebar.
import { BranchInfo } from '../../../types'
import { buildBranchTree } from '../branchTree'
import { publishedNameFor } from '../../ContextMenu/branchRefs'
import { Section } from '../Section'
import { BranchTree } from '../tree'
import { BranchItem } from '../BranchItem'
import type { SidebarState } from '../useSidebar'

export function LocalSection({ s }: { s: SidebarState }) {
  const { currentBranch, branches, onReveal, onOpenCard, onCreateBranch, onDeleteBranch, onMergeBranch, onRenameBranch, onRebaseOnto, onPushBranch, onDeleteRemoteBranch, onSetUpstream, onExplainBranch, onBranchChangelog, onGoTo, onCompareBranch, soloBranch, onToggleSolo, onToggleHide, onPull, isFavorite, issueFor, onToggleFavorite, onOpenBranchOnRemote, onAssociateIssue, prIntentFor, onCreatePR, onCopyBranchLink, onDeleteBranchBoth, onRebaseOntoUpstream, onCompareUpstream, tipActions, mergeTarget, handlePullBranchRow, handleChangeUpstreamRow, handleSquashFixupsRow, worktreeOf, handleCreateWorktreeFor, onSetRepo, t, localBranches, branchHidden, toggleFolder, openFolders, showAll, localMenu, layoutFor, layoutToggle } = s
  const names = localBranches.map(b => b.name)
  const asTree = layoutFor('local', names) === 'tree'
  return (
    <Section id="local" title="LOCAL" icon="device" count={localBranches.length} onAdd={onCreateBranch} addLabel={t('sb.newBranch')}
            menuItems={localMenu()}
            layout={layoutToggle('local', names)}
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
                // pushBranch sets the upstream, which is what publishing is.
                onPublish={() => onPushBranch(b.name)}
                onSetUpstream={() => onSetUpstream(b.name)}
                onPull={b.current ? onPull : undefined}
                onReveal={onReveal && (() => onReveal(b.name))}
                onOpenCard={onOpenCard && (() => onOpenCard(b.name, 'head'))}
                // Bringing a branch forward needs an upstream to bring it
                // forward from (#280); the rest of these need a tip.
                onPullBranch={!b.current && b.upstream ? () => handlePullBranchRow(b.name) : undefined}
                onChangeUpstream={() => handleChangeUpstreamRow(b.name)}
                onRebaseOntoUpstream={b.current && b.upstream && onRebaseOntoUpstream
                  ? () => onRebaseOntoUpstream(b.upstream!) : undefined}
                // Measured from the upstream, or from the branch this one
                // will merge into — what it is rebased onto is the fork point
                // with it, so nothing moves but the fixups.
                onSquashFixups={b.current && (b.upstream || mergeTarget?.name)
                  ? () => handleSquashFixupsRow(b.upstream ?? mergeTarget!.name) : undefined}
                onCompareUpstream={b.upstream && onCompareUpstream
                  ? () => onCompareUpstream(b.name, b.upstream!) : undefined}
                tip={{ ref: b.name, hash: b.commit, subject: b.label }}
                tipActions={tipActions}
                checkedOutIn={worktreeOf(b.name)}
                onOpenItsWorktree={(() => {
                  const held = worktreeOf(b.name)
                  return held ? () => onSetRepo(held.path) : undefined
                })()}
                onCreateWorktreeFor={() => handleCreateWorktreeFor(b.name)}
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
              if (!asTree) return localBranches.map(b => leaf(b))
              const nodes = buildBranchTree(localBranches, b => b.name)
              return <BranchTree nodes={nodes} open={openFolders(nodes)} onToggle={toggleFolder}
                renderLeaf={(b, label) => leaf(b, label)} />
            })()}
          </Section>
  )
}
