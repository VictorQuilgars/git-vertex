// Sidebar › remotes. Reads its slice of the sidebar's state; the state itself lives in useSidebar.
import { Section } from '../Section'
import { RemoteItem } from '../rows'
import { buildBranchTree, subtreeAt } from '../branchTree'
import { BranchTree, leafIndent } from '../tree'
import { remoteBranchRow } from './RemoteSection'
import { remoteLinks } from '../../../utils/remoteUrl'
import type { BranchInfo } from '../../../types'
import type { RemoteEntry } from '../types'
import type { SidebarState } from '../useSidebar'
import { LoadError } from '../notices'

/** `remotes/origin/x` belongs to `origin` — and not to `orig`. */
const branchesOf = (branches: BranchInfo[], remote: string) =>
  branches.filter(b => b.name.startsWith(`remotes/${remote}/`))

/**
 * An opened remote's branches (#289): the rows of Branches › REMOTE, drawn by
 * the same function, in the shape that section is drawn in. The tree is that
 * section's tree cut at this remote's folder, so a folder under it — say
 * `origin/feat` — is the same folder in both lists.
 */
function RemoteBranches({ s, remote }: { s: SidebarState; remote: RemoteEntry }) {
  const { remoteBranches, layoutFor, openFolders, toggleFolder, t } = s
  const mine = branchesOf(remoteBranches, remote.name)
  if (!mine.length) {
    return <div className="sb-empty" style={{ paddingLeft: leafIndent(1) }}>{t('sb.remote.noBranches')}</div>
  }
  const prefix = `remotes/${remote.name}/`
  const names = remoteBranches.map(b => b.name.replace(/^remotes\//, ''))
  if (layoutFor('remote', names) === 'tree') {
    const nodes = subtreeAt(buildBranchTree(mine, b => b.name.replace(/^remotes\//, '')), remote.name)
    return <BranchTree nodes={nodes} open={openFolders(nodes)} onToggle={toggleFolder} depth={1}
      renderLeaf={(b, label) => remoteBranchRow(s, b, label)} />
  }
  return (
    <>
      {mine.map(b => (
        <div key={b.name} className="sb-tree-leaf" style={{ paddingLeft: leafIndent(1) }}>
          {remoteBranchRow(s, b, b.name.slice(prefix.length))}
        </div>
      ))}
    </>
  )
}

export function RemotesSection({ s }: { s: SidebarState }) {
  const { onToggleHideRemote, onOpenGithubItem, single, defaultRemote, defaultRemoteExplicit, t, showToast, handleAddRemote, handleRemoveRemote, handleRenameRemote, handlePruneRemote, handleSetDefaultRemote, handleUnsetDefaultRemote, handleFetchRemote, remoteHidden, familyMenu, showAll, filteredRemotes, expandedRemotes, toggleRemoteExpanded, counts, loadErrors, retryLoad } = s
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
              : filteredRemotes.map(r => {
                  // A remote whose URL is a local path has no page to open,
                  // and remoteLinks says so rather than guessing one. Built
                  // from THIS remote's URL: `upstream`'s branches page is not
                  // the default remote's.
                  const links = remoteLinks(r)
                  const open = (url: string) => onOpenGithubItem ? () => onOpenGithubItem(url) : undefined
                  const expanded = expandedRemotes.has(r.name)
                  const isDefault = defaultRemote === r.name
                  return (
                    <div key={r.name}>
                      <RemoteItem
                        remote={r}
                        isDefault={isDefault}
                        onSetDefault={() => handleSetDefaultRemote(r.name)}
                        onUnsetDefault={isDefault && defaultRemoteExplicit ? () => handleUnsetDefaultRemote(r.name) : undefined}
                        onFetch={() => handleFetchRemote(r.name)}
                        onPrune={() => handlePruneRemote(r.name)}
                        onRename={() => handleRenameRemote(r.name)}
                        onRemove={() => handleRemoveRemote(r.name)}
                        onCopyUrl={() => navigator.clipboard.writeText(r.fetchUrl)}
                        onOpen={links ? open(links.repo) : undefined}
                        onOpenBranches={links ? open(links.branches) : undefined}
                        onCopyBranchesUrl={links ? () => {
                          navigator.clipboard.writeText(links.branches)
                          showToast(t('toast.linkCopied'))
                        } : undefined}
                        expanded={expanded}
                        onToggleExpand={() => toggleRemoteExpanded(r.name)}
                        hidden={remoteHidden(r.name)}
                        onToggleHide={onToggleHideRemote && (() => onToggleHideRemote(r.name))}
                      />
                      {expanded && (
                        <div className="sb-remote-branches" role="group" aria-label={t('sb.remote.branchesOf', r.name)}>
                          <RemoteBranches s={s} remote={r} />
                        </div>
                      )}
                    </div>
                  )
                })
            }
          </Section>
  )
}
