// Sidebar › tags. Reads its slice of the sidebar's state; the state itself lives in useSidebar.
import { Section } from '../Section'
import { TagItem } from '../rows'
import { BranchTree } from '../tree'
import { buildBranchTree } from '../branchTree'
import type { TagEntry } from '../types'
import type { SidebarState } from '../useSidebar'

export function TagsSection({ s }: { s: SidebarState }) {
  const { onCreateTag, onDeleteTag, onCheckoutTag, onGoTo, onPushTag, onDeleteRemoteTag, onToggleHideTag, onReveal, single, t, tagHidden, familyMenu, showAll, filteredTags, layoutFor, layoutToggle, toggleFolder, openFolders } = s
  const names = filteredTags.map(tg => tg.name)
  const asTree = layoutFor('tags', names) === 'tree'
  return (
    <Section id="tags" title="TAGS" icon="tag" count={filteredTags.length} defaultOpen={single}
            onAdd={onCreateTag} addLabel={t('sb.newTag')}
            menuItems={familyMenu('tags')}
            layout={layoutToggle('tags', names)}
            hiddenCount={filteredTags.filter(tg => tagHidden(tg.name)).length}
            onShowAll={showAll('tags')}>
            {(() => {
              const row = (tag: TagEntry, displayAs?: string) => (
                <TagItem key={tag.name} tag={tag} displayAs={displayAs}
                  onGoTo={() => onGoTo(tag.name)}
                  onReveal={onReveal && (() => onReveal(tag.name))}
                  onCheckoutCommit={() => onCheckoutTag(tag.name)}
                  onDelete={() => onDeleteTag(tag.name)}
                  onPush={() => onPushTag(tag.name)} onDeleteRemote={() => onDeleteRemoteTag(tag.name)}
                  hidden={tagHidden(tag.name)}
                  onToggleHide={onToggleHideTag && (() => onToggleHideTag(tag.name))} />
              )
              if (!filteredTags.length) return <div className="sb-empty">{t('sb.noTag')}</div>
              // `v1.2.0` holds no slash, but `release/1.2` does — and a
              // repository that names its tags that way gets the same tree
              // its branches get.
              if (!asTree) return filteredTags.map(tag => row(tag))
              const nodes = buildBranchTree(filteredTags, tag => tag.name)
              return <BranchTree nodes={nodes} open={openFolders(nodes)} onToggle={toggleFolder}
                renderLeaf={(tag, label) => row(tag, label)} />
            })()}
          </Section>
  )
}
