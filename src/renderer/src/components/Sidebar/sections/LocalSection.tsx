// Sidebar › local. Reads its slice of the sidebar's state; the state itself lives in useSidebar.
import { BranchInfo } from '../../../types'
import { buildBranchTree } from '../branchTree'
import { localBranchProps } from '../localBranchProps'
import { Section } from '../Section'
import { BranchTree } from '../tree'
import { BranchItem } from '../BranchItem'
import type { SidebarState } from '../useSidebar'

export function LocalSection({ s }: { s: SidebarState }) {
  const { onCreateBranch, t, localBranches, branchHidden, toggleFolder, openFolders, showAll, localMenu, layoutFor, layoutToggle } = s
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
                <BranchItem key={b.name} displayAs={displayAs} {...localBranchProps(s, b)} />
              )
              if (!asTree) return localBranches.map(b => leaf(b))
              const nodes = buildBranchTree(localBranches, b => b.name)
              return <BranchTree nodes={nodes} open={openFolders(nodes)} onToggle={toggleFolder}
                renderLeaf={(b, label) => leaf(b, label)} />
            })()}
          </Section>
  )
}
