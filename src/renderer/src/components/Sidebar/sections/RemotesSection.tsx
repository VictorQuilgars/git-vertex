// Sidebar › remotes. Reads its slice of the sidebar's state; the state itself lives in useSidebar.
import { Section } from '../Section'
import { RemoteItem } from '../rows'
import { parseRemote } from '../../../utils/remoteUrl'
import type { SidebarState } from '../useSidebar'
import { LoadError } from '../notices'

export function RemotesSection({ s }: { s: SidebarState }) {
  const { onToggleHideRemote, onOpenGithubItem, single, defaultRemote, t, handleAddRemote, handleRemoveRemote, handleRenameRemote, handlePruneRemote, handleSetDefaultRemote, handleFetchRemote, remoteHidden, familyMenu, showAll, filteredRemotes, counts, loadErrors, retryLoad } = s
  const failed = loadErrors.remotes
  return (
    <Section id="remotes" title="REMOTES" icon="repo" count={failed ? undefined : counts.remotes} defaultOpen={single}
            onAdd={handleAddRemote} addLabel={t('sb.addRemote')}
            menuItems={familyMenu('remotes')}
            hiddenCount={filteredRemotes.filter(r => remoteHidden(r.name)).length}
            onShowAll={showAll('remotes')}>
            {failed ? <LoadError error={failed} onRetry={() => retryLoad('remotes')} t={t} />
              : filteredRemotes.length === 0
              ? <div className="sb-empty">{t('sb.noRemote')}</div>
              : filteredRemotes.map(r => (
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
                    onOpen={(() => {
                      // A remote whose URL is a local path has no page to open,
                      // and parseRemote says so rather than guessing one.
                      const web = parseRemote(r.fetchUrl)?.base
                      return onOpenGithubItem && web ? () => onOpenGithubItem(web) : undefined
                    })()}
                    hidden={remoteHidden(r.name)}
                    onToggleHide={onToggleHideRemote && (() => onToggleHideRemote(r.name))}
                  />
                ))
            }
          </Section>
  )
}
