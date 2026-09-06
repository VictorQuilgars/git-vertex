// Sidebar › reflog. Reads its slice of the sidebar's state; the state itself lives in useSidebar.
import { Section } from '../Section'
import { ReflogItem } from '../rows'
import type { SidebarState } from '../useSidebar'

export function ReflogSection({ s }: { s: SidebarState }) {
  const { onSelectCommit, reflog, t } = s
  return (
    <Section id="reflog" title="REFLOG" icon="reflog" count={reflog.length} defaultOpen={false}>
            {reflog.length === 0
              ? <div className="sb-empty">{t('sb.reflogEmpty')}</div>
              : reflog.map((entry, i) => (
                  <ReflogItem
                    key={i}
                    entry={entry}
                    onSelect={() => onSelectCommit(entry.hash)}
                  />
                ))
            }
          </Section>
  )
}
