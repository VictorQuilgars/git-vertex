// Sidebar › remotes. Reads its slice of the sidebar's state; the state itself lives in useSidebar.
import { Section } from '../Section'
import { RemoteItem } from '../rows'
import type { SidebarState } from '../useSidebar'

export function RemotesSection({ s }: { s: SidebarState }) {
  const { onToggleHide, onToggleHideRemote, single, remotes, defaultRemote, t, handleAddRemote, handleRemoveRemote, handleRenameRemote, handlePruneRemote, handleSetDefaultRemote, handleFetchRemote, remoteHidden, familyMenu, showAll } = s
  return (
    <Section id="remotes" title="REMOTES" icon="repo" count={remotes.length} defaultOpen={single}
            onAdd={handleAddRemote} addLabel={t('sb.addRemote')}
            menuItems={familyMenu('remotes')}
            hiddenCount={remotes.filter(r => remoteHidden(r.name)).length}
            onShowAll={showAll('remotes')}>
            {remotes.length === 0
              ? <div className="sb-empty">{t('sb.noRemote')}</div>
              : remotes.map(r => (
                  <RemoteItem
                    key={r.name}
                    remote={r}
                    isDefault={defaultRemote === r.name}
                    onSetDefault={() => handleSetDefaultRemote(r.name)}
                    onFetch={() => handleFetchRemote(r.name)}
                    onPrune={() => handlePruneRemote(r.name)}
                    onRename={() => handleRenameRemote(r.name)}
                    onRemove={() => handleRemoveRemote(r.name)}
                    onCopyUrl={() => navigator.clipboard.writeText(r.fetchUrl)}
                    hidden={remoteHidden(r.name)}
                    onToggleHide={onToggleHideRemote && (() => onToggleHideRemote(r.name))}
                  />
                ))
            }
          </Section>
  )
}
