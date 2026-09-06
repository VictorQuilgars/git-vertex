// Sidebar › tags. Reads its slice of the sidebar's state; the state itself lives in useSidebar.
import { Section } from '../Section'
import { TagItem } from '../rows'
import type { SidebarState } from '../useSidebar'

export function TagsSection({ s }: { s: SidebarState }) {
  const { tags, onCreateTag, onDeleteTag, onCheckoutTag, onGoTo, onPushTag, onDeleteRemoteTag, onToggleHide, onToggleHideTag, single, t, tagHidden, familyMenu, showAll } = s
  return (
    <Section id="tags" title="TAGS" icon="tag" count={tags.length} defaultOpen={single}
            onAdd={onCreateTag} addLabel={t('sb.newTag')}
            menuItems={familyMenu('tags')}
            hiddenCount={tags.filter(tg => tagHidden(tg.name)).length}
            onShowAll={showAll('tags')}>
            {tags.length === 0
              ? <div className="sb-empty">{t('sb.noTag')}</div>
              : tags.map(t => (
                  <TagItem key={t.name} tag={t}
                    onGoTo={() => onGoTo(t.name)}
                    onCheckoutCommit={() => onCheckoutTag(t.name)}
                    onDelete={() => onDeleteTag(t.name)}
                    onPush={() => onPushTag(t.name)} onDeleteRemote={() => onDeleteRemoteTag(t.name)}
                    hidden={tagHidden(t.name)}
                    onToggleHide={onToggleHideTag && (() => onToggleHideTag(t.name))} />
                ))
            }
          </Section>
  )
}
