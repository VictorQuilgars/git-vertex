// Sidebar › submodules. Reads its slice of the sidebar's state; the state itself lives in useSidebar.
import { Section } from '../Section'
import { SubmoduleItem } from '../rows'
import type { SidebarState } from '../useSidebar'
import { LoadError } from '../notices'

export function SubmodulesSection({ s }: { s: SidebarState }) {
  const { submodules, handleInitSubmodule, handleUpdateSubmodule, handleSyncSubmodule, handleDeinitSubmodule, loadErrors, retryLoad, t } = s
  const failed = loadErrors.submodules
  return (
    <Section id="submodules" title="SUBMODULES" icon="listTree" count={failed ? undefined : submodules.length} defaultOpen={false}>
              {failed ? <LoadError error={failed} onRetry={() => retryLoad('submodules')} t={t} /> : submodules.map(sub => (
                <SubmoduleItem
                  key={sub.path}
                  sub={sub}
                  onInit={() => handleInitSubmodule(sub.path)}
                  onUpdate={() => handleUpdateSubmodule(sub.path)}
                  onSync={() => handleSyncSubmodule(sub.path)}
                  onDeinit={() => handleDeinitSubmodule(sub.path)}
                />
              ))}
            </Section>
  )
}
